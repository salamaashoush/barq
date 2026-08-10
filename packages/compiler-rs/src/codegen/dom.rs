use oxc::allocator::{Box as ArenaBox, Vec as ArenaVec};
use oxc::ast::ast::{
    Argument, ArrayExpressionElement, ArrowFunctionBody, ArrowFunctionExpression, AssignmentTarget,
    BindingPattern, Expression, FormalParameterKind, FormalParameters, IdentifierName,
    MemberExpression, Statement, VariableDeclarationKind, VariableDeclarator,
};
use oxc::span::Span;

use crate::codegen::backend::{At, Backend, lower};
use crate::codegen::{Emit, Helper};
use crate::ir::{
    Anchor, Chan, Diff, ExprId, HandlerRef, InsertPlan, NameId, NodeId, Op, PartRange, Patch,
    RefDef, Shape, SlotId, Step, StrId, Thunk, Unit,
};

/// P8a. One unit becomes the hoisted `template()` clone, the walk to every node
/// a patch addresses, then the patch program in order — as a statement list plus
/// the expression the whole unit evaluates to.
///
/// The caller decides what to do with the list: `Site::Return` / `Init` /
/// `ArrowBody` splice it into the enclosing body, and only `Site::Nested` pays
/// for an IIFE.
pub fn emit_unit_parts<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    span: Span,
) -> (Vec<Statement<'a>>, Expression<'a>) {
    // Target #2: a subtree that produced no patch costs one clone and nothing
    // else — no walk, no arrow, no statements.
    if unit.is_pure_static() {
        return (Vec::new(), clone_call(ctx, unit, span));
    }

    let mut statements = Vec::with_capacity(unit.refs.defs.len() + unit.patch.len());
    // Every ref is materialised before any mutation runs: `insert` splices
    // nodes into the parent, which invalidates a sibling walk taken after it.
    for index in 0..unit.refs.defs.len() {
        let def = unit.refs.defs[index];
        let init = match def.step {
            Step::Root => clone_call(ctx, unit, def.span),
            _ => walk(ctx, unit, &def),
        };
        statements.push(binding(ctx, ctx.module.interner.str(def.name), init, def.span));
    }

    // The driver. It owns traversal — program order, one pass — and the
    // instruction set belongs to the `Backend` impl below, which is the surface
    // the string backend and the reference backend answer on too.
    let mut index = 0;
    while index < unit.patch.len() {
        let patch = unit.patch[index];
        index += 1;
        // A group header's members are the records that follow it, so they are
        // read off the program here and handed to the op that governs them.
        let members: Vec<Patch> = match patch.op {
            Op::EffectGroup { len } => {
                let end = (index + len as usize).min(unit.patch.len());
                let members = unit.patch[index..end].to_vec();
                index = end;
                members
            }
            _ => Vec::new(),
        };
        let mut backend = Dom { ctx, unit };
        if let Some(statement) = lower(&mut backend, At { patch, members: &members }) {
            statements.push(statement);
        }
    }

    let root = ref_ident(ctx, unit, unit.skeleton.roots.0, span);
    (statements, root)
}

/// The expression form, for a site whose statements cannot be spliced.
pub fn emit_unit<'a>(ctx: &mut Emit<'a, '_>, unit: &mut Unit<'a>, span: Span) -> Expression<'a> {
    let (mut statements, root) = emit_unit_parts(ctx, unit, span);
    if statements.is_empty() {
        return root;
    }
    statements.push(Statement::new_return_statement(span, Some(root), &ctx.ast));
    iife(ctx, statements, span)
}

/// P8a's `Backend`. Every op lowers to at most one statement, spliced into the
/// unit's construction sequence in program order.
///
/// The ops with no row here — `SetClass`, `SetStyle`, `Ref`, `Spread`,
/// `SetHtml` — reach the DOM through the props object `createElement` builds
/// (`fallback.rs`), because P1 refuses to put an element carrying one of them on
/// the template path at all. Returning `None` for them is that decision written
/// down, not a case that fell through: there is no wildcard arm to fall through.
pub struct Dom<'a, 'e, 'm, 'u> {
    pub ctx: &'e mut Emit<'a, 'm>,
    pub unit: &'u mut Unit<'a>,
}

impl<'a> Dom<'a, '_, '_, '_> {
    /// `setProp($s, el, key, value)` — the shape three ops share.
    fn set_prop(&mut self, at: At<'_>, name: NameId, value: Expression<'a>) -> Statement<'a> {
        let span = at.span();
        let scope = self.ctx.scope(span);
        let element = ref_ident(self.ctx, self.unit, at.target(), span);
        let key = self.ctx.module.interner.name(name).text;
        let key = self.ctx.string(key, span);
        let callee = self.ctx.helper(Helper::SetProp, span);
        let call = self.ctx.call(
            callee,
            vec![
                Argument::from(scope),
                Argument::from(element),
                Argument::from(key),
                Argument::from(value),
            ],
            span,
        );
        Statement::new_expression_statement(span, call, &self.ctx.ast)
    }
}

impl<'a> Backend<'a> for Dom<'a, '_, '_, '_> {
    type Out = Option<Statement<'a>>;

    // `SetOnce` and `SetOpaque` emit identically: the value goes into `setProp`
    // unwrapped, so the runtime makes exactly the decision the un-compiled
    // oracle makes. The distinction is what P3 folds on, and the two rows are
    // kept apart here so a change to one cannot silently move the other.
    fn set_once(&mut self, at: At<'_>, name: NameId, value: ExprId, _chan: Chan) -> Self::Out {
        let value = take(self.ctx, self.unit, value, at.span());
        Some(self.set_prop(at, name, value))
    }

    fn set_opaque(&mut self, at: At<'_>, name: NameId, value: ExprId) -> Self::Out {
        let value = take(self.ctx, self.unit, value, at.span());
        Some(self.set_prop(at, name, value))
    }

    /// The one-effect-per-prop form: the runtime sees a function and keeps its
    /// own `prev` across runs. It is what an ungrouped `SetLive` lowers to —
    /// either because effect fusion is off, or because fusion put this prop in a
    /// group of one.
    fn set_live(
        &mut self,
        at: At<'_>,
        name: NameId,
        value: ExprId,
        _chan: Chan,
        _diff: Diff,
    ) -> Self::Out {
        let value = thunk(self.ctx, self.unit, value, at.span());
        Some(self.set_prop(at, name, value))
    }

    /// O4: a hole the compiler PROVED reactive becomes a live binding, where
    /// `createElement` reads it once. That is exactly what compiling buys, and
    /// it is the one place the compiled path deliberately does more reactive
    /// work than the oracle. Everything else — `Once` for a proven static value,
    /// `Opaque` for an unresolvable one — is passed through so `insert` makes
    /// the oracle's decision.
    fn insert(
        &mut self,
        at: At<'_>,
        _slot: SlotId,
        anchor: Anchor,
        value: ExprId,
        plan: InsertPlan,
    ) -> Self::Out {
        let span = at.span();
        let scope = self.ctx.scope(span);
        let parent = ref_ident(self.ctx, self.unit, at.target(), span);
        let value = match plan {
            InsertPlan::Live => thunk(self.ctx, self.unit, value, span),
            InsertPlan::Once | InsertPlan::Opaque => take(self.ctx, self.unit, value, span),
        };
        let anchor = anchor.node().map(|node| ref_ident(self.ctx, self.unit, node, span));
        let callee = self.ctx.helper(Helper::Insert, span);
        let mut arguments =
            vec![Argument::from(scope), Argument::from(parent), Argument::from(value)];
        arguments.extend(anchor.map(Argument::from));
        let call = self.ctx.call(callee, arguments, span);
        Some(Statement::new_expression_statement(span, call, &self.ctx.ast))
    }

    /// Target #7: a direct expando write. `delegatedEventHandler` reads
    /// `$$<type>` and accepts either a function or a `[fn, data]` tuple, so the
    /// tuple needs no second property (V2).
    fn delegate(
        &mut self,
        at: At<'_>,
        event: NameId,
        handler: HandlerRef,
        _data: Option<ExprId>,
    ) -> Self::Out {
        let span = at.span();
        let element = ref_ident(self.ctx, self.unit, at.target(), span);
        let key = self.ctx.module.interner.name(event).text;
        let key = self.ctx.allocator.alloc_str(&format!("$${key}")) as &'a str;
        let target = expando_target(self.ctx, element, key, span);
        let handler = handler_expression(self.ctx, self.unit, handler, span);
        let call = Expression::new_assignment_expression(
            span,
            oxc::ast::ast::AssignmentOperator::Assign,
            target,
            handler,
            &self.ctx.ast,
        );
        Some(Statement::new_expression_statement(span, call, &self.ctx.ast))
    }

    fn listen(&mut self, at: At<'_>, event: NameId, handler: HandlerRef) -> Self::Out {
        let span = at.span();
        let element = ref_ident(self.ctx, self.unit, at.target(), span);
        let key = self.ctx.module.interner.name(event).text;
        let key = self.ctx.string(key, span);
        let handler = handler_expression(self.ctx, self.unit, handler, span);
        let callee = self.ctx.member(element, "addEventListener", span);
        let call = self.ctx.call(callee, vec![Argument::from(key), Argument::from(handler)], span);
        Some(Statement::new_expression_statement(span, call, &self.ctx.ast))
    }

    /// Target #4. A group of one lowers to the cheaper thunk form — same effect
    /// count, less code. Two or more become one `renderEffect` with a threaded
    /// accumulator and per-key `!==` guards.
    fn effect_group(&mut self, at: At<'_>, _len: u16) -> Self::Out {
        if at.members.len() == 1
            && let Some(statement) = lower(self, At::one(at.members[0]))
        {
            return Some(statement);
        }
        Some(fused_effect(self.ctx, self.unit, at.members, at.patch))
    }

    // ── off the template path entirely ────────────────────────────────────
    //
    // P1 refuses to lower an element carrying any of these, so the whole
    // subtree goes through `createElement` and none of them ever reaches a
    // patch program the DOM backend prints. They are answered rather than
    // omitted, because an omission is what a no-drift guarantee has to make
    // impossible.

    fn set_class(
        &mut self,
        _at: At<'_>,
        _base: Option<StrId>,
        _parts: PartRange,
        _live: bool,
    ) -> Self::Out {
        None
    }

    fn set_style(&mut self, _at: At<'_>, _prop: NameId, _value: ExprId, _live: bool) -> Self::Out {
        None
    }

    fn set_ref(&mut self, _at: At<'_>, _value: ExprId) -> Self::Out {
        None
    }

    fn spread(&mut self, _at: At<'_>, _value: ExprId, _live: bool) -> Self::Out {
        None
    }

    fn set_html(&mut self, _at: At<'_>, _value: ExprId, _live: bool) -> Self::Out {
        None
    }
}

/// One `renderEffect` with a threaded accumulator and per-key `!==` guards,
/// which works because `recompute` stores a compute's return value and hands it
/// back on the next run (V6). It must never return a function.
fn fused_effect<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    members: &[Patch],
    header: Patch,
) -> Statement<'a> {
    let span = header.span;
    let prev = ctx.module.uids.prev();
    // Every read first, then every guarded write: one place to look for what
    // the effect depends on, and no write can land between two reads.
    let mut reads: Vec<Statement<'a>> = Vec::with_capacity(members.len());
    let mut body: Vec<Statement<'a>> = Vec::with_capacity(members.len() + 1);
    let mut threaded = false;

    for patch in members {
        let Op::SetLive { name, value, diff, .. } = patch.op else { continue };
        let element = ref_ident(ctx, unit, patch.target, patch.span);
        let key_text = ctx.module.interner.name(name).text;
        let key = ctx.string(key_text, patch.span);
        let read = value_expression(ctx, unit, value, patch.span);

        let local = ctx.module.uids.value(ctx.allocator);
        reads.push(binding(ctx, local, read, patch.span));

        let written = match diff {
            Diff::Identity => {
                threaded = true;
                let slot = slot_member(ctx, prev, key_text, patch.span);
                Expression::new_assignment_expression(
                    patch.span,
                    oxc::ast::ast::AssignmentOperator::Assign,
                    assignment_target(slot),
                    ctx.ident(local, patch.span),
                    &ctx.ast,
                )
            }
            Diff::Always => ctx.ident(local, patch.span),
        };

        let scope = ctx.scope(patch.span);
        let callee = ctx.helper(Helper::SetProp, patch.span);
        let write = ctx.call(
            callee,
            vec![
                Argument::from(scope),
                Argument::from(element),
                Argument::from(key),
                Argument::from(written),
            ],
            patch.span,
        );
        let write = Statement::new_expression_statement(patch.span, write, &ctx.ast);

        body.push(match diff {
            Diff::Identity => {
                let slot = slot_member(ctx, prev, key_text, patch.span);
                let test = Expression::new_binary_expression(
                    patch.span,
                    ctx.ident(local, patch.span),
                    oxc::ast::ast::BinaryOperator::StrictInequality,
                    slot,
                    &ctx.ast,
                );
                Statement::new_if_statement(patch.span, test, write, None, &ctx.ast)
            }
            Diff::Always => write,
        });
    }

    reads.append(&mut body);
    let mut body = reads;

    let params = if threaded {
        body.push(Statement::new_return_statement(span, Some(ctx.ident(prev, span)), &ctx.ast));
        accumulator_params(ctx, prev, span)
    } else {
        FormalParameters::boxed(
            span,
            FormalParameterKind::ArrowFormalParameters,
            ArenaVec::new_in(&ctx.allocator),
            None,
            &ctx.ast,
        )
    };

    let statements = ArenaVec::from_iter_in(body, &ctx.allocator);
    let function_body = ArrowFunctionBody::new_function_body(
        span,
        ArenaVec::new_in(&ctx.allocator),
        statements,
        &ctx.ast,
    );
    let arrow = Expression::new_arrow_function_expression(
        span,
        false,
        None,
        params,
        None,
        function_body,
        &ctx.ast,
    );
    let callee = ctx.helper(Helper::RenderEffect, span);
    let call = ctx.call(callee, vec![Argument::from(arrow)], span);
    Statement::new_expression_statement(span, call, &ctx.ast)
}

/// `(_p$ = {}) => …`. The default is what makes the first run see an empty
/// accumulator instead of `undefined`.
fn accumulator_params<'a>(
    ctx: &Emit<'a, '_>,
    name: &'a str,
    span: Span,
) -> ArenaBox<'a, FormalParameters<'a>> {
    let empty = Expression::new_object_expression(span, ArenaVec::new_in(&ctx.allocator), &ctx.ast);
    let pattern = BindingPattern::new_binding_identifier(span, name, &ctx.ast);
    let pattern = BindingPattern::new_assignment_pattern(span, pattern, empty, &ctx.ast);
    let parameter = oxc::ast::ast::FormalParameter::new(
        span,
        ArenaVec::new_in(&ctx.allocator),
        pattern,
        None,
        None,
        false,
        None,
        false,
        false,
        &ctx.ast,
    );
    FormalParameters::boxed(
        span,
        FormalParameterKind::ArrowFormalParameters,
        ArenaVec::from_iter_in([parameter], &ctx.allocator),
        None,
        &ctx.ast,
    )
}

fn slot_member<'a>(ctx: &Emit<'a, '_>, prev: &'a str, key: &'a str, span: Span) -> Expression<'a> {
    let object = ctx.ident(prev, span);
    if crate::lower::jsx::is_identifier_name(key) {
        ctx.member(object, key, span)
    } else {
        let property = ctx.string(key, span);
        Expression::new_computed_member_expression(span, object, property, false, &ctx.ast)
    }
}

fn expando_target<'a>(
    ctx: &Emit<'a, '_>,
    element: Expression<'a>,
    key: &'a str,
    span: Span,
) -> AssignmentTarget<'a> {
    let property = IdentifierName::new(span, key, &ctx.ast);
    let member = Expression::new_static_member_expression(span, element, property, false, &ctx.ast);
    assignment_target(member)
}

fn assignment_target<'a>(expression: Expression<'a>) -> AssignmentTarget<'a> {
    match expression {
        Expression::StaticMemberExpression(member) => {
            AssignmentTarget::from(MemberExpression::StaticMemberExpression(member))
        }
        Expression::ComputedMemberExpression(member) => {
            AssignmentTarget::from(MemberExpression::ComputedMemberExpression(member))
        }
        _ => unreachable!("only a member expression is ever assigned to"),
    }
}

pub(super) fn handler_expression<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    handler: HandlerRef,
    span: Span,
) -> Expression<'a> {
    match handler {
        HandlerRef::Inline(value) => take(ctx, unit, value, span),
        // With hoisting off the handler is rebuilt at its use site, which costs
        // one closure per element and reaches the same DOM: P2 only hoists a
        // handler it proved capture-free, so the two spellings differ in
        // identity and in nothing else.
        HandlerRef::Hoisted(id) if !ctx.opt.hoist => {
            let expression = ctx
                .module
                .hoisted
                .iter()
                .find(|hoisted| hoisted.id() == id)
                .map(|hoisted| match hoisted {
                    crate::ir::Hoisted::Handler { expr, .. }
                    | crate::ir::Hoisted::Frozen { expr, .. }
                    | crate::ir::Hoisted::Cell { expr, .. } => *expr,
                })
                .expect("P2 records every id it hands out");
            oxc::allocator::CloneIn::clone_in(expression, ctx.allocator)
        }
        HandlerRef::Hoisted(id) => {
            let name = ctx.module.uids.handler(id, ctx.allocator);
            ctx.ident(name, span)
        }
    }
}

/// The value a live prop resolves to, read INSIDE the coalesced effect. A
/// user-written `() => expr` is unwrapped rather than called, which deletes the
/// closure the source allocated per element.
fn value_expression<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    value: ExprId,
    span: Span,
) -> Expression<'a> {
    let shape = unit.exprs.rx(value).shape;
    let expression = take(ctx, unit, value, span);
    if shape != Shape::Accessor {
        return expression;
    }
    match expression {
        Expression::ArrowFunctionExpression(arrow) if is_plain_thunk(&arrow) => {
            let ArrowFunctionExpression { body, .. } = arrow.unbox();
            match body {
                ArrowFunctionBody::FunctionBody(_) => unreachable!("checked by is_plain_thunk"),
                other => other.into_expression(),
            }
        }
        // A block body has statements the effect cannot inline, so the closure
        // stays and is called.
        other => ctx.call(other, Vec::new(), span),
    }
}

fn is_plain_thunk(arrow: &ArrowFunctionExpression<'_>) -> bool {
    !arrow.r#async
        && arrow.params.items.is_empty()
        && arrow.params.rest.is_none()
        && !matches!(arrow.body, ArrowFunctionBody::FunctionBody(_))
}

/// The `setProp(el, k, thunk)` form: the runtime sees a function and keeps its
/// own `prev` across runs.
pub(super) fn thunk<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    value: ExprId,
    span: Span,
) -> Expression<'a> {
    let rx = unit.exprs.rx(value);
    let expression = take(ctx, unit, value, span);
    if rx.shape == Shape::Accessor {
        return expression;
    }
    // η-reduction: `count()` is emitted as `count`, saving one closure per hole.
    // Sound because a signal getter IS a Cell and a Cell ignores its arguments;
    // with it off the wrapper stands and the reader sees the same value.
    if ctx.opt.eta
        && rx.thunk == Thunk::Eta
        && let Expression::CallExpression(call) = expression
    {
        return call.unbox().callee;
    }
    let body = ArrowFunctionBody::from(expression);
    let params = FormalParameters::boxed(
        span,
        FormalParameterKind::ArrowFormalParameters,
        ArenaVec::new_in(&ctx.allocator),
        None,
        &ctx.ast,
    );
    Expression::new_arrow_function_expression(span, false, None, params, None, body, &ctx.ast)
}

fn clone_call<'a>(ctx: &mut Emit<'a, '_>, unit: &Unit<'a>, span: Span) -> Expression<'a> {
    let callee = ctx.ident(ctx.template_name(unit.template), span);
    ctx.call(callee, Vec::new(), span)
}

fn walk<'a>(ctx: &Emit<'a, '_>, unit: &Unit<'a>, def: &RefDef) -> Expression<'a> {
    let (base, descend, property, hops) = match def.step {
        Step::Root => unreachable!("handled by the caller"),
        Step::FirstChild(base, hops) => (base, Some("firstChild"), "nextSibling", hops),
        Step::LastChild(base, hops) => (base, Some("lastChild"), "previousSibling", hops),
        Step::NextSibling(base, hops) => (base, None, "nextSibling", hops),
        Step::PrevSibling(base, hops) => (base, None, "previousSibling", hops),
    };
    let mut expression = ctx.ident(ctx.module.interner.str(unit.refs.def(base).name), def.span);
    if let Some(descend) = descend {
        expression = ctx.member(expression, descend, def.span);
    }
    for _ in 0..hops {
        expression = ctx.member(expression, property, def.span);
    }
    expression
}

fn ref_ident<'a>(ctx: &Emit<'a, '_>, unit: &Unit<'a>, node: NodeId, span: Span) -> Expression<'a> {
    let id = unit.refs.ref_of(node).expect("every addressed node is in the ref plan");
    ctx.ident(ctx.module.interner.str(unit.refs.def(id).name), span)
}

/// The parsed node moves straight from the `ExprTable` into the emitted call,
/// so it keeps its original span and the sourcemap segment is byte-exact.
pub(super) fn take<'a>(
    ctx: &Emit<'a, '_>,
    unit: &mut Unit<'a>,
    id: u32,
    span: Span,
) -> Expression<'a> {
    unit.exprs.entry_mut(id).src.take().unwrap_or_else(|| Expression::new_void_0(span, &ctx.ast))
}

fn binding<'a>(
    ctx: &Emit<'a, '_>,
    name: &'a str,
    init: Expression<'a>,
    span: Span,
) -> Statement<'a> {
    let declarator = VariableDeclarator::new(
        span,
        VariableDeclarationKind::Const,
        BindingPattern::new_binding_identifier(span, name, &ctx.ast),
        None,
        Some(init),
        false,
        &ctx.ast,
    );
    Statement::new_variable_declaration(
        span,
        VariableDeclarationKind::Const,
        [declarator],
        false,
        &ctx.ast,
    )
}

fn iife<'a>(ctx: &Emit<'a, '_>, statements: Vec<Statement<'a>>, span: Span) -> Expression<'a> {
    let statements = ArenaVec::from_iter_in(statements, &ctx.allocator);
    let body = ArrowFunctionBody::new_function_body(
        span,
        ArenaVec::new_in(&ctx.allocator),
        statements,
        &ctx.ast,
    );
    let params = FormalParameters::boxed(
        span,
        FormalParameterKind::ArrowFormalParameters,
        ArenaVec::new_in(&ctx.allocator),
        None,
        &ctx.ast,
    );
    let arrow =
        Expression::new_arrow_function_expression(span, false, None, params, None, body, &ctx.ast);
    ctx.call(arrow, Vec::new(), span)
}

/// The module-scope `delegateEvents([...])` call: one per module, replacing the
/// N private `ensureDelegatedListener` calls `applyProp` would have made.
pub fn delegated_names<'a>(ctx: &Emit<'a, '_>) -> Vec<&'a str> {
    let mut names = Vec::new();
    for (index, event) in crate::tables::DELEGATED_EVENTS.iter().enumerate() {
        if ctx.module.delegated & (1 << index) != 0 {
            names.push(ctx.allocator.alloc_str(event) as &'a str);
        }
    }
    names
}

pub fn delegate_call<'a>(ctx: &mut Emit<'a, '_>) -> Option<Statement<'a>> {
    let names = delegated_names(ctx);
    if names.is_empty() {
        return None;
    }
    let elements = names
        .into_iter()
        .map(|name| ArrayExpressionElement::from(ctx.string(name, oxc::span::SPAN)))
        .collect::<Vec<_>>();
    let elements = ArenaVec::from_iter_in(elements, &ctx.allocator);
    let array = Expression::new_array_expression(oxc::span::SPAN, elements, &ctx.ast);
    let callee = ctx.helper(Helper::DelegateEvents, oxc::span::SPAN);
    let call = ctx.call(callee, vec![Argument::from(array)], oxc::span::SPAN);
    Some(Statement::new_expression_statement(oxc::span::SPAN, call, &ctx.ast))
}
