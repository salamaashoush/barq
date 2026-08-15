use oxc::allocator::Allocator;
use oxc::ast::ast::{
    ArrowFunctionBody, ArrowFunctionExpression, BinaryOperator, Expression, Function,
    LogicalOperator, UnaryOperator,
};
use oxc::ast_visit::Visit;
use oxc::semantic::{ScopeFlags, ScopeId, Scoping};

use crate::analysis::symbol_of;
use crate::ir::{
    Const, Cost, DepSet, Diff, ExprId, FreeVars, HandlerRef, HoistId, Hoisted, InsertPlan,
    Interner, Module, Op, Patch, Prim, React, ReactiveEnv, Rx, Shape, SourceKind, Thunk, Unit,
};
use crate::tables;

/// P2 Classify. Every `ExprEntry` gets its `Rx`, and every event patch resolves
/// to a delegated expando write or an `addEventListener`.
///
/// The load-bearing value is `React::Opaque`. An expression the analysis cannot
/// prove either way is emitted UNWRAPPED, so `setProp` / `insert` make exactly
/// the decision the un-compiled oracle makes — "I don't know" is a sound,
/// oracle-identical, zero-cost answer, which is why nothing here ever has to
/// guess from a name.
pub fn run<'a>(allocator: &'a Allocator, module: &mut Module<'a>) {
    let Module { units, env, scoping, interner, hoisted, .. } = module;
    let root_scope = scoping.root_scope_id();
    let lift = Lift { allocator, env, scoping, root_scope };
    let mut cx = Classify { lift, interner, hoisted };
    for unit in units.iter_mut() {
        cx.unit(unit);
    }
}

struct Classify<'a, 'm> {
    lift: Lift<'a, 'm>,
    interner: &'m mut Interner<'a>,
    hoisted: &'m mut oxc::allocator::Vec<'a, Hoisted<'a>>,
}

/// The lifting rule on its own, with none of the patch rewriting around it. P4
/// classifies component props, which never enter an `ExprTable`, so the rule has
/// to be reachable without a `Unit`.
pub(super) struct Lift<'a, 'm> {
    allocator: &'a Allocator,
    env: &'m ReactiveEnv<'a>,
    scoping: &'m Scoping,
    root_scope: ScopeId,
}

impl<'a, 'm> Lift<'a, 'm> {
    pub(super) fn new(
        allocator: &'a Allocator,
        env: &'m ReactiveEnv<'a>,
        scoping: &'m Scoping,
    ) -> Self {
        Self { allocator, env, scoping, root_scope: scoping.root_scope_id() }
    }

    #[inline]
    pub(super) fn env(&self) -> &'m ReactiveEnv<'a> {
        self.env
    }

    #[inline]
    pub(super) fn scoping(&self) -> &'m Scoping {
        self.scoping
    }
}

impl<'a> Classify<'a, '_> {
    fn unit(&mut self, unit: &mut Unit<'a>) {
        for index in 0..unit.exprs.len() {
            let rx = match unit.exprs.entries[index].src.expression() {
                Some(expression) => self.lift.rx(expression),
                None => Rx::OPAQUE,
            };
            unit.exprs.entries[index].rx = rx;
        }

        for index in 0..unit.patch.len() {
            let patch = unit.patch[index];
            if let Some(op) = self.resolve(unit, patch) {
                unit.patch[index].op = op;
            }
        }
    }

    /// The one place a patch changes shape. Everything it refuses stays
    /// `SetOpaque`, which emits the value unwrapped — byte for byte what M2
    /// emitted and what the oracle does.
    fn resolve(&mut self, unit: &mut Unit<'a>, patch: Patch) -> Option<Op> {
        match patch.op {
            Op::SetEvent { event, value } => self.event(unit, event, value),
            Op::SetOpaque { name, value, chan } => {
                let rx = unit.exprs.rx(value);
                if !self.live_prop(rx) {
                    // A direct channel write is unconditional, so the value has
                    // to be a VALUE — see `Shape::may_be_callable`. Everything
                    // else goes to `bindProp`, which asks the liveness question
                    // the un-compiled path asks. A `Const` settles it whatever
                    // the shape says: it is the value, and it is what P3 folds
                    // on, so a template literal over module constants keeps both
                    // the direct write and the fold that removes it.
                    let a_value = !rx.shape.may_be_callable() || rx.konst.is_some();
                    return (rx.react == React::Static && a_value).then_some(Op::SetOnce {
                        name,
                        value,
                        chan,
                    });
                }
                // B2. `class` / `style` / `classList` / `dangerouslySetInnerHTML`
                // thread the previously APPLIED representation — the normalised
                // class string, the css map, the toggled key set — so their
                // record slot holds the channel's RETURN and not the compute's.
                // That is the whole of what kept them out of a compiled effect,
                // and the compiler owns the slot now.
                let diff = if chan.threads_prev() {
                    Diff::Thread
                } else if rx.shape == Shape::Obj {
                    Diff::Always
                } else {
                    Diff::Identity
                };
                Some(Op::SetLive { name, value, chan, diff })
            }
            Op::Insert { slot, anchor, value, .. } => {
                let rx = unit.exprs.rx(value);
                let plan = match rx.react {
                    React::Static if !rx.live() => InsertPlan::Once,
                    React::Opaque => InsertPlan::Opaque,
                    _ => InsertPlan::Live,
                };
                Some(Op::Insert { slot, anchor, value, plan })
            }
            _ => None,
        }
    }

    /// A prop may join an effect only when the compiler can PROVE it reactive:
    /// a user-written thunk whose body reads something tracked, or a tracked
    /// read itself. `Opaque` is deliberately excluded — wrapping it would create
    /// an effect the un-compiled path does not.
    fn live_prop(&self, rx: Rx<'a>) -> bool {
        match rx.shape {
            Shape::Accessor => !rx.inner.is_empty(),
            Shape::Handler | Shape::HandlerTuple => false,
            _ => rx.react == React::Reactive,
        }
    }

    // ── events (target #7) ────────────────────────────────────────────────

    /// The TYPE was resolved at P1 — `onClick` → `click`, `on:my-event`
    /// verbatim — so what is left here is the one question that needs the
    /// analysis: whether the value is a function the compiler may take over
    /// from the runtime, and whether it is capture-free enough to hoist.
    fn event(
        &mut self,
        unit: &mut Unit<'a>,
        event: crate::ir::NameId,
        value: ExprId,
    ) -> Option<Op> {
        let delegated = tables::is_delegated_event(self.interner.name(event).text);
        let rx = unit.exprs.rx(value);

        // `applyProp` binds nothing unless `isEventHandlerValue` holds, so the
        // compiler may only take over when it can see the function itself.
        let tuple = rx.shape == Shape::HandlerTuple;
        if !matches!(rx.shape, Shape::Handler | Shape::Accessor) && !tuple {
            return None;
        }
        // `toListener` wraps a tuple in a fresh closure that reads the tuple
        // twice; letting the runtime build it is both correct and shorter.
        if tuple && !delegated {
            return None;
        }

        let handler = match self.hoist(unit, value, rx) {
            Some(id) => HandlerRef::Hoisted(id),
            None => HandlerRef::Inline(value),
        };

        if delegated {
            Some(Op::Delegate { event, handler, data: None })
        } else {
            Some(Op::Listen { event, handler })
        }
    }

    /// Target #7's second half. A closure that captures only module-scope
    /// bindings is the same function on every instance, so it moves out of the
    /// component and is allocated once.
    fn hoist(&mut self, unit: &mut Unit<'a>, value: ExprId, rx: Rx<'a>) -> Option<HoistId> {
        if !rx.hoistable() {
            return None;
        }
        let entry = unit.exprs.entry_mut(value);
        let span = entry.span;
        let expression = entry.src.take()?;
        let id = self.hoisted.len() as HoistId;
        self.hoisted.push(Hoisted::Handler {
            id,
            expr: self.lift.allocator.alloc(expression),
            span,
        });
        Some(id)
    }
}

impl<'a> Lift<'a, '_> {
    // ── the lifting rule ──────────────────────────────────────────────────

    pub(super) fn rx(&mut self, expression: &Expression<'a>) -> Rx<'a> {
        match expression {
            Expression::ParenthesizedExpression(inner) => self.rx(&inner.expression),
            Expression::TSAsExpression(inner) => self.rx(&inner.expression),
            Expression::TSNonNullExpression(inner) => self.rx(&inner.expression),
            Expression::TSSatisfiesExpression(inner) => self.rx(&inner.expression),
            Expression::TSTypeAssertion(inner) => self.rx(&inner.expression),
            Expression::TSInstantiationExpression(inner) => self.rx(&inner.expression),

            // `lone_surrogates` means `value` is not the string the program
            // holds but an escaped ENCODING of it (`\u{FFFD}XXXX` per code
            // unit), because a Rust `str` cannot carry an unpaired surrogate.
            // Folding it would bake five characters where the runtime writes
            // one, so the literal stays Static and un-folded.
            Expression::StringLiteral(literal) if !literal.lone_surrogates => {
                konst(Const::Str(literal.value.as_str()), Shape::Str)
            }
            Expression::StringLiteral(_) => {
                Rx { react: React::Static, shape: Shape::Str, ..Rx::OPAQUE }
            }
            Expression::NumericLiteral(literal) => konst(Const::Num(literal.value), Shape::Num),
            Expression::BooleanLiteral(literal) => konst(Const::Bool(literal.value), Shape::Bool),
            Expression::NullLiteral(_) => konst(Const::Null, Shape::Nullish),
            Expression::BigIntLiteral(_) | Expression::RegExpLiteral(_) => {
                Rx { react: React::Static, shape: Shape::Obj, ..Rx::OPAQUE }
            }

            Expression::Identifier(_) => self.ident(expression),
            Expression::TemplateLiteral(literal) => {
                let mut rx = Rx { react: React::Static, shape: Shape::Str, ..Rx::OPAQUE };
                let mut text = String::new();
                let mut foldable = literal.quasis.len() == literal.expressions.len() + 1;
                for (index, quasi) in literal.quasis.iter().enumerate() {
                    match quasi.value.cooked.as_ref() {
                        Some(cooked) if !quasi.lone_surrogates => text.push_str(cooked.as_str()),
                        _ => foldable = false,
                    }
                    let Some(expression) = literal.expressions.get(index) else { continue };
                    let part = self.rx(expression);
                    rx = join(rx, part);
                    match part.fold().and_then(as_text) {
                        Some(piece) => text.push_str(&piece),
                        None => foldable = false,
                    }
                }
                if foldable && rx.react == React::Static {
                    rx.konst = Some(Const::Str(self.allocator.alloc_str(&text)));
                }
                rx
            }

            Expression::UnaryExpression(unary) => {
                let inner = self.rx(&unary.argument);
                let mut rx = Rx { shape: shape_of_unary(unary.operator), ..inner };
                rx.konst = inner.fold().and_then(|value| fold_unary(unary.operator, value));
                rx
            }
            Expression::BinaryExpression(binary) => {
                let left = self.rx(&binary.left);
                let right = self.rx(&binary.right);
                let mut rx = join(left, right);
                rx.shape = shape_of_binary(binary.operator, left.shape, right.shape);
                rx.konst = match (left.fold(), right.fold()) {
                    (Some(a), Some(b)) => fold_binary(binary.operator, a, b, self.allocator),
                    _ => None,
                };
                rx
            }
            Expression::LogicalExpression(logical) => {
                let left = self.rx(&logical.left);
                // A `Const` condition SELECTS a branch instead of joining, which
                // is what makes `{false && <Heavy/>}` cost nothing.
                if let Some(value) = left.fold() {
                    let taken = truthy(value);
                    let short = match (logical.operator, taken) {
                        (LogicalOperator::And, Some(false)) => Some(left),
                        (LogicalOperator::Or, Some(true)) => Some(left),
                        (LogicalOperator::Coalesce, Some(_)) if !nullish(value) => Some(left),
                        _ => None,
                    };
                    if let Some(rx) = short {
                        return rx;
                    }
                    if taken.is_some() || logical.operator == LogicalOperator::Coalesce {
                        return self.rx(&logical.right);
                    }
                }
                let right = self.rx(&logical.right);
                let mut rx = join(left, right);
                rx.shape = if left.shape == right.shape { left.shape } else { Shape::Unknown };
                rx.konst = None;
                rx
            }
            Expression::ConditionalExpression(conditional) => {
                let test = self.rx(&conditional.test);
                if let Some(value) = test.fold()
                    && let Some(taken) = truthy(value)
                {
                    return if taken {
                        self.rx(&conditional.consequent)
                    } else {
                        self.rx(&conditional.alternate)
                    };
                }
                let consequent = self.rx(&conditional.consequent);
                let alternate = self.rx(&conditional.alternate);
                let mut rx = join(join(test, consequent), alternate);
                rx.shape = if consequent.shape == alternate.shape {
                    consequent.shape
                } else {
                    Shape::Unknown
                };
                rx.konst = None;
                rx
            }

            Expression::StaticMemberExpression(member) => {
                self.member(&member.object, Some(member.property.name.as_str()))
            }
            Expression::ComputedMemberExpression(member) => {
                let mut rx = self.member(&member.object, None);
                rx = join(rx, self.rx(&member.expression));
                rx.konst = None;
                rx
            }
            Expression::PrivateFieldExpression(member) => self.member(&member.object, None),

            Expression::CallExpression(call) => self.call(call),

            Expression::ArrowFunctionExpression(arrow) => self.arrow(arrow),
            Expression::FunctionExpression(function) => self.function(function),

            Expression::ArrayExpression(array) => {
                let mut rx = Rx { react: React::Static, shape: Shape::Arr, ..Rx::OPAQUE };
                let mut first_is_function = false;
                for (index, element) in array.elements.iter().enumerate() {
                    let Some(expression) = element.as_expression() else {
                        rx.react = rx.react.join(React::Opaque);
                        continue;
                    };
                    let part = self.rx(expression);
                    if index == 0 {
                        // `isEventHandlerValue` tests `typeof value[0] ===
                        // "function"` at RUN time, so the compiler only has to
                        // rule out what it can SEE is not callable.
                        first_is_function =
                            matches!(part.shape, Shape::Handler | Shape::Accessor | Shape::Unknown);
                    }
                    rx = join(rx, part);
                }
                rx.konst = None;
                // V2: the bound-handler tuple lives in `$$<type>` itself; there
                // is no `$$<type>Data` in this runtime.
                rx.shape = if first_is_function && array.elements.len() == 2 {
                    Shape::HandlerTuple
                } else {
                    Shape::Arr
                };
                rx
            }
            Expression::ObjectExpression(object) => {
                let mut rx = Rx { react: React::Static, shape: Shape::Obj, ..Rx::OPAQUE };
                for property in &object.properties {
                    match property {
                        oxc::ast::ast::ObjectPropertyKind::ObjectProperty(entry) => {
                            rx = join(rx, self.rx(&entry.value));
                        }
                        oxc::ast::ast::ObjectPropertyKind::SpreadProperty(spread) => {
                            rx = join(rx, self.rx(&spread.argument));
                        }
                    }
                }
                rx.konst = None;
                rx.shape = Shape::Obj;
                rx
            }

            Expression::JSXElement(_) | Expression::JSXFragment(_) => {
                Rx { shape: Shape::Node, ..Rx::OPAQUE }
            }

            _ => Rx::OPAQUE,
        }
    }

    fn ident(&self, expression: &Expression<'a>) -> Rx<'a> {
        let Expression::Identifier(identifier) = expression else { return Rx::OPAQUE };
        let Some(symbol) = symbol_of(self.scoping, expression) else {
            // An unresolved name is a global. Reading one is not a tracked read,
            // so it is Static — and `undefined` is a value the folder can use.
            return match identifier.name.as_str() {
                "undefined" => konst(Const::Undefined, Shape::Nullish),
                "NaN" | "Infinity" => Rx { react: React::Static, shape: Shape::Num, ..Rx::OPAQUE },
                _ => Rx { react: React::Static, ..Rx::OPAQUE },
            };
        };
        match self.env.kind_of(symbol) {
            // Creating a reference to an accessor reads nothing; CALLING it is
            // the read. The body's dep set travels in `inner`.
            SourceKind::Accessor { .. } => Rx {
                react: React::Static,
                shape: Shape::Accessor,
                inner: self.dep(symbol),
                ..Rx::OPAQUE
            },
            SourceKind::ReactiveObject | SourceKind::PropsParam => {
                Rx { react: React::Reactive, deps: self.dep(symbol), ..Rx::OPAQUE }
            }
            SourceKind::AccessorRecord => {
                Rx { react: React::Static, shape: Shape::Obj, ..Rx::OPAQUE }
            }
            // The row is recreated by `mapArray` when the item changes, so
            // reading it tracks nothing (DESIGN O3).
            SourceKind::RowValue | SourceKind::Inert | SourceKind::Primitive(_) => {
                Rx { react: React::Static, ..Rx::OPAQUE }
            }
            // Target #7's commonest shape. `free.only_globals` stays false, so
            // the handler is never RE-hoisted: the reference is emitted where it
            // stands, which is correct whether the declaration sits at module
            // scope or inside the component.
            SourceKind::Fn { .. } => {
                Rx { react: React::Static, shape: Shape::Handler, ..Rx::OPAQUE }
            }
            SourceKind::ConstLit => match self.env.konst_of(symbol) {
                Some(value) => konst(value, shape_of_const(value)),
                None => Rx { react: React::Static, ..Rx::OPAQUE },
            },
            SourceKind::Opaque => Rx::OPAQUE,
        }
    }

    fn dep(&self, symbol: oxc::semantic::SymbolId) -> DepSet {
        DepSet::single(self.env.bit_of(symbol))
    }

    fn member(&mut self, object: &Expression<'a>, property: Option<&str>) -> Rx<'a> {
        if let Some(symbol) = symbol_of(self.scoping, object) {
            match self.env.kind_of(symbol) {
                SourceKind::Accessor { nonreactive } => {
                    // `count.set` and `count()` are the same identifier with two
                    // verdicts — the fact a name heuristic cannot represent.
                    return match property {
                        Some(name) if nonreactive.is_inert_member(name) => {
                            Rx { react: React::Static, shape: Shape::Handler, ..Rx::OPAQUE }
                        }
                        _ => Rx::OPAQUE,
                    };
                }
                SourceKind::ReactiveObject => {
                    return Rx { react: React::Reactive, deps: self.dep(symbol), ..Rx::OPAQUE };
                }
                // C3.1/C4: every own property of a props object is a Cell.
                // Taking the reference reads nothing and CALLING it is the read,
                // which is the same shape `Resource<T>` already has below. The
                // pre-M3 verdict — the member read IS the tracked read — was the
                // getter model, and keeping it made `thunk()` wrap a Cell in a
                // second Cell at -O0 while fusion unwrapped one level at -Ox.
                SourceKind::PropsParam => {
                    return Rx {
                        react: React::Static,
                        shape: Shape::Accessor,
                        inner: self.dep(symbol),
                        ..Rx::OPAQUE
                    };
                }
                // `Resource<T>`: the member READ is inert, the CALL is the read.
                SourceKind::AccessorRecord => {
                    return Rx {
                        react: React::Static,
                        shape: Shape::Accessor,
                        inner: self.dep(symbol),
                        ..Rx::OPAQUE
                    };
                }
                _ => {}
            }
        }
        let inner = self.rx(object);
        Rx { react: inner.react, deps: inner.deps, cost: inner.cost, ..Rx::OPAQUE }
    }

    fn call(&mut self, call: &oxc::ast::ast::CallExpression<'a>) -> Rx<'a> {
        // `Call(f, [])` where `f` is an accessor binding IS the tracked read.
        if call.arguments.is_empty()
            && let Some(symbol) = symbol_of(self.scoping, &call.callee)
        {
            match self.env.kind_of(symbol) {
                SourceKind::Accessor { .. } => {
                    return Rx {
                        react: React::Reactive,
                        deps: self.dep(symbol),
                        thunk: Thunk::Eta,
                        ..Rx::OPAQUE
                    };
                }
                SourceKind::Primitive(Prim::Untrack) => {
                    return Rx { react: React::Static, ..Rx::OPAQUE };
                }
                _ => {}
            }
        }
        if let Some(symbol) = symbol_of(self.scoping, &call.callee)
            && self.env.kind_of(symbol) == SourceKind::Primitive(Prim::Untrack)
        {
            // `untrack(fn)` reads nothing, whatever the body does.
            return Rx { react: React::Static, ..Rx::OPAQUE };
        }

        // A member call on a `Resource<T>` — `.state()`, `.loading()` — is the
        // tracked read; `.refetch` / `.mutate` are inert.
        if let Expression::StaticMemberExpression(member) = &call.callee
            && let Some(symbol) = symbol_of(self.scoping, &member.object)
            && self.env.kind_of(symbol) == SourceKind::AccessorRecord
        {
            let inert = matches!(member.property.name.as_str(), "refetch" | "mutate");
            return Rx {
                react: if inert { React::Static } else { React::Reactive },
                deps: if inert { DepSet::EMPTY } else { self.dep(symbol) },
                ..Rx::OPAQUE
            };
        }

        // C4 and §11 Q1's settled spelling: `props.x()` is how a Cell is READ,
        // so it is the tracked read the consumer's effect subscribes to. Without
        // this arm the call is `Opaque`, which `react.rs` emits UNWRAPPED, and
        // the prop lands in the DOM once at construction and never moves again.
        if call.arguments.is_empty()
            && let Some(object) = match &call.callee {
                Expression::StaticMemberExpression(member) => Some(&member.object),
                Expression::ComputedMemberExpression(member) => Some(&member.object),
                _ => None,
            }
            && let Some(symbol) = symbol_of(self.scoping, object)
            && self.env.kind_of(symbol) == SourceKind::PropsParam
        {
            return Rx {
                react: React::Reactive,
                deps: self.dep(symbol),
                thunk: Thunk::Eta,
                ..Rx::OPAQUE
            };
        }

        self.pure_global_call(call).unwrap_or(Rx { cost: Cost::Expensive, ..Rx::OPAQUE })
    }

    /// The only calls the folder is allowed to evaluate: a whitelisted global
    /// that is not shadowed, applied to constants. Anything else is `Opaque`,
    /// which costs nothing because `Opaque` is emitted unwrapped anyway.
    fn pure_global_call(&mut self, call: &oxc::ast::ast::CallExpression<'a>) -> Option<Rx<'a>> {
        let Expression::Identifier(callee) = &call.callee else { return None };
        if symbol_of(self.scoping, &call.callee).is_some() {
            return None;
        }
        let (shape, name) = match callee.name.as_str() {
            "String" => (Shape::Str, "String"),
            "Number" => (Shape::Num, "Number"),
            "Boolean" => (Shape::Bool, "Boolean"),
            _ => return None,
        };
        let mut rx = Rx { react: React::Static, shape, ..Rx::OPAQUE };
        let argument = match call.arguments.len() {
            0 => None,
            1 => Some(call.arguments[0].as_expression()?),
            _ => return None,
        };
        let inner = argument.map(|expression| self.rx(expression));
        if let Some(inner) = inner {
            rx = Rx { react: inner.react, deps: inner.deps, ..rx };
        }
        rx.konst = match (name, inner.and_then(|inner| inner.fold())) {
            ("String", Some(value)) => {
                as_text(value).map(|text| Const::Str(self.allocator.alloc_str(&text)))
            }
            ("Boolean", Some(value)) => truthy(value).map(Const::Bool),
            ("Boolean", None) if argument.is_none() => Some(Const::Bool(false)),
            ("String", None) if argument.is_none() => Some(Const::Str("")),
            _ => None,
        };
        Some(rx)
    }

    // ── closures ──────────────────────────────────────────────────────────

    fn arrow(&mut self, arrow: &ArrowFunctionExpression<'a>) -> Rx<'a> {
        let scope = arrow.scope_id.get();
        let free = self.free_vars(scope, |visitor| visitor.visit_arrow_function_expression(arrow));
        let zero_arg = arrow.params.items.is_empty() && arrow.params.rest.is_none();
        // A user-written `() => …` is an accessor whose BODY carries the deps;
        // creating a closure itself reads nothing.
        let (inner, cost) = if !zero_arg {
            (DepSet::EMPTY, Cost::Cheap)
        } else if let ArrowFunctionBody::FunctionBody(body) = &arrow.body {
            // Statements are where loops live, and the cost model only ever
            // uses `Expensive` to REFUSE a merge.
            (self.body_deps(scope, |visitor| visitor.visit_function_body(body)), Cost::Expensive)
        } else {
            match arrow.body.as_expression() {
                Some(body) => {
                    let body = self.rx(body);
                    (body.deps, body.cost)
                }
                None => (DepSet::EMPTY, Cost::Cheap),
            }
        };
        Rx {
            react: React::Static,
            shape: if zero_arg { Shape::Accessor } else { Shape::Handler },
            inner,
            free,
            cost,
            ..Rx::OPAQUE
        }
    }

    fn function(&mut self, function: &Function<'a>) -> Rx<'a> {
        let scope = function.scope_id.get();
        let free =
            self.free_vars(scope, |visitor| visitor.visit_function(function, ScopeFlags::Function));
        Rx { react: React::Static, shape: Shape::Handler, free, ..Rx::OPAQUE }
    }

    /// A block body is not classified expression by expression; every reactive
    /// binding it mentions is joined in. Over-approximating here can only ever
    /// make a thunk look live, which costs one effect the runtime would have
    /// created anyway.
    fn body_deps(&self, scope: Option<ScopeId>, walk: impl FnOnce(&mut Scan<'_, 'a>)) -> DepSet {
        let mut scan = Scan {
            env: self.env,
            scoping: self.scoping,
            root_scope: self.root_scope,
            own_scope: scope,
            deps: DepSet::EMPTY,
            free: DepSet::EMPTY,
            only_globals: true,
            unhoistable: false,
        };
        walk(&mut scan);
        scan.deps
    }

    /// `only_globals` is target #7's hoisting predicate, answered with the two
    /// integer comparisons `ReactiveEnv::nested` promises.
    fn free_vars(&self, scope: Option<ScopeId>, walk: impl FnOnce(&mut Scan<'_, 'a>)) -> FreeVars {
        let mut scan = Scan {
            env: self.env,
            scoping: self.scoping,
            root_scope: self.root_scope,
            own_scope: scope,
            deps: DepSet::EMPTY,
            free: DepSet::EMPTY,
            only_globals: true,
            unhoistable: false,
        };
        walk(&mut scan);
        FreeVars { mask: scan.free.mask, only_globals: scan.only_globals && !scan.unhoistable }
    }
}

/// One walk answers both questions a closure raises: which tracked bindings its
/// body reads, and whether anything it captures lives below module scope.
struct Scan<'m, 'a> {
    env: &'m ReactiveEnv<'a>,
    scoping: &'m Scoping,
    root_scope: ScopeId,
    own_scope: Option<ScopeId>,
    deps: DepSet,
    free: DepSet,
    only_globals: bool,
    /// Reads something a hoisted copy of this closure would no longer see:
    /// `this`, `arguments`, or `eval`.
    unhoistable: bool,
}

impl<'a> Visit<'a> for Scan<'_, 'a> {
    fn visit_identifier_reference(&mut self, it: &oxc::ast::ast::IdentifierReference<'a>) {
        // Neither resolves to a symbol, so both arrive here as "an unresolved
        // global". `arguments` names the enclosing FUNCTION's arguments object,
        // which a hoisted handler no longer has; `eval` can reach any binding
        // in the scope chain it is called from.
        if matches!(it.name.as_str(), "arguments" | "eval") {
            self.unhoistable = true;
        }
        let Some(reference) = it.reference_id.get() else { return };
        let Some(symbol) = self.scoping.get_reference(reference).symbol_id() else {
            // An unresolved name is a true global; a hoisted handler still sees it.
            return;
        };
        let scope = self.scoping.symbol_scope_id(symbol);
        let bound_inside = self.own_scope.is_some_and(|own| self.env.nested(own, scope));
        if !bound_inside {
            if scope != self.root_scope {
                self.only_globals = false;
            }
            self.free = self.free.join(DepSet::single(self.env.bit_of(symbol)));
        }
        if ReactiveEnv::is_reactive(self.env.kind_of(symbol)) {
            self.deps = self.deps.join(DepSet::single(self.env.bit_of(symbol)));
        }
    }

    fn visit_this_expression(&mut self, _it: &oxc::ast::ast::ThisExpression) {
        // Hoisting an arrow that reads `this` moves it to a different lexical
        // `this`; the two are both `undefined` in a module today, but the
        // equivalence is not worth betting on.
        self.unhoistable = true;
    }
}

// ── the lattice ──────────────────────────────────────────────────────────

fn konst<'a>(value: Const<'a>, shape: Shape) -> Rx<'a> {
    Rx { react: React::Static, konst: Some(value), shape, ..Rx::OPAQUE }
}

fn join<'a>(left: Rx<'a>, right: Rx<'a>) -> Rx<'a> {
    Rx {
        react: left.react.join(right.react),
        deps: left.deps.join(right.deps),
        inner: left.inner.join(right.inner),
        konst: None,
        shape: Shape::Unknown,
        free: FreeVars {
            mask: left.free.mask | right.free.mask,
            only_globals: left.free.only_globals && right.free.only_globals,
        },
        cost: if left.cost == Cost::Expensive || right.cost == Cost::Expensive {
            Cost::Expensive
        } else {
            Cost::Cheap
        },
        thunk: Thunk::None,
    }
}

fn shape_of_const(value: Const<'_>) -> Shape {
    match value {
        Const::Str(_) => Shape::Str,
        Const::Num(_) => Shape::Num,
        Const::Bool(_) => Shape::Bool,
        Const::Null | Const::Undefined => Shape::Nullish,
    }
}

fn shape_of_unary(operator: UnaryOperator) -> Shape {
    match operator {
        UnaryOperator::LogicalNot | UnaryOperator::Delete => Shape::Bool,
        UnaryOperator::UnaryNegation | UnaryOperator::UnaryPlus | UnaryOperator::BitwiseNot => {
            Shape::Num
        }
        UnaryOperator::Typeof => Shape::Str,
        UnaryOperator::Void => Shape::Nullish,
    }
}

fn shape_of_binary(operator: BinaryOperator, left: Shape, right: Shape) -> Shape {
    use BinaryOperator::*;
    match operator {
        Addition => {
            if left == Shape::Str || right == Shape::Str {
                Shape::Str
            } else if left == Shape::Num && right == Shape::Num {
                Shape::Num
            } else {
                Shape::Unknown
            }
        }
        Subtraction | Multiplication | Division | Remainder | Exponential | ShiftLeft
        | ShiftRight | ShiftRightZeroFill | BitwiseAnd | BitwiseOR | BitwiseXOR => Shape::Num,
        _ => Shape::Bool,
    }
}

/// Only the coercions JS performs unambiguously. `Str + Str` and
/// `Str + safe-integer` fold; anything else is refused rather than
/// reimplementing the whole of `ToPrimitive`.
fn fold_binary<'a>(
    operator: BinaryOperator,
    left: Const<'a>,
    right: Const<'a>,
    allocator: &'a Allocator,
) -> Option<Const<'a>> {
    use BinaryOperator::*;
    match operator {
        Addition => match (left, right) {
            (Const::Str(a), b) => {
                let b = as_text(b)?;
                Some(Const::Str(allocator.alloc_str(&format!("{a}{b}"))))
            }
            (a, Const::Str(b)) => {
                let a = as_text(a)?;
                Some(Const::Str(allocator.alloc_str(&format!("{a}{b}"))))
            }
            (Const::Num(a), Const::Num(b)) => Some(Const::Num(a + b)),
            _ => None,
        },
        Subtraction | Multiplication | Division | Remainder => {
            let (Const::Num(a), Const::Num(b)) = (left, right) else { return None };
            Some(Const::Num(match operator {
                Subtraction => a - b,
                Multiplication => a * b,
                Division => a / b,
                _ => a % b,
            }))
        }
        StrictEquality | StrictInequality => {
            let equal = match (left, right) {
                (Const::Str(a), Const::Str(b)) => a == b,
                (Const::Num(a), Const::Num(b)) => a == b,
                (Const::Bool(a), Const::Bool(b)) => a == b,
                (Const::Null, Const::Null) | (Const::Undefined, Const::Undefined) => true,
                _ => false,
            };
            Some(Const::Bool(equal == (operator == StrictEquality)))
        }
        _ => None,
    }
}

fn fold_unary<'a>(operator: UnaryOperator, value: Const<'a>) -> Option<Const<'a>> {
    match operator {
        UnaryOperator::LogicalNot => truthy(value).map(|value| Const::Bool(!value)),
        UnaryOperator::UnaryNegation => match value {
            Const::Num(number) => Some(Const::Num(-number)),
            _ => None,
        },
        UnaryOperator::Void => Some(Const::Undefined),
        _ => None,
    }
}

fn nullish(value: Const<'_>) -> bool {
    matches!(value, Const::Null | Const::Undefined)
}

fn truthy(value: Const<'_>) -> Option<bool> {
    Some(match value {
        Const::Str(text) => !text.is_empty(),
        Const::Num(number) => number != 0.0 && !number.is_nan(),
        Const::Bool(value) => value,
        Const::Null | Const::Undefined => false,
    })
}

/// `String(v)` for the values the folder admits. A double that is not an
/// integer is refused rather than reimplementing JS number formatting.
pub(super) fn as_text(value: Const<'_>) -> Option<String> {
    Some(match value {
        Const::Str(text) => text.to_string(),
        Const::Num(number) => number_to_js_string(number)?,
        Const::Bool(value) => value.to_string(),
        Const::Null => "null".to_string(),
        Const::Undefined => "undefined".to_string(),
    })
}

pub(super) fn number_to_js_string(number: f64) -> Option<String> {
    if number.is_nan() {
        return Some("NaN".to_string());
    }
    if number.is_infinite() {
        return Some(if number > 0.0 { "Infinity" } else { "-Infinity" }.to_string());
    }
    if number == number.trunc() && number.abs() < 9_007_199_254_740_992.0 {
        // `-0` prints as "0" in JS, and `trunc` keeps the sign.
        let integer = number as i64;
        return Some(integer.to_string());
    }
    None
}
