use oxc::allocator::{Allocator, Box as ArenaBox, CloneIn, TakeIn, Vec as ArenaVec};
use oxc::ast::ast::{
    Argument, ArrayExpressionElement, ArrowFunctionBody, BindingPattern, Expression,
    FormalParameter, FormalParameterKind, FormalParameters, IdentifierName, JSXAttributeItem,
    JSXAttributeValue, JSXChild, JSXElement, JSXElementName, JSXExpression, JSXMemberExpression,
    JSXMemberExpressionObject, NumberBase, ObjectProperty, ObjectPropertyKind, PropertyKey,
    PropertyKind, SpreadElement, StringLiteral,
};
use oxc::ast::builder::AstBuilder;
use oxc::ast_visit::VisitMut;
use oxc::ast_visit::walk_mut::{walk_expression, walk_jsx_attribute_value, walk_jsx_child};
use oxc::semantic::SymbolId;
use oxc::span::Span;

use rustc_hash::FxHashMap;

use crate::analysis::symbol_of;
use crate::codegen::{HELPER_COUNT, Helper};
use crate::diag::Code;
use crate::ir::{
    Diag, Flow, HoistId, Hoisted, Keyed, Module, React, Region, Root, Site, SourceKind, Thunk, Uids,
};
use crate::lower::entity;
use crate::lower::jsx::{attribute_expression, attribute_name, expression_of, is_identifier_name};
use crate::lower::text;
use crate::options::ResolvedOptions;

use super::classify::Lift;

/// P4 Shape. Every JSX element whose tag resolves to a COMPONENT — a user
/// component, a control-flow builtin, a `Ns.Provider` member — becomes a real
/// call expression built in the same arena.
///
/// The call is what buys fine-grained flow across a component boundary.
/// `createElement` copies the props object it is handed (`{ ...props }`,
/// `dom.ts:309`), which reads every getter exactly once and freezes the result;
/// a direct call hands the component the object this pass built, so a `Reactive`
/// prop stays a getter and the READER decides when to read it.
///
/// Intrinsic markup the HTML parser reshapes, and fragments, are left as JSX for
/// codegen's `createElement` path: their semantics are the runtime's, not ours.
pub fn run<'a>(
    allocator: &'a Allocator,
    module: &mut Module<'a>,
    options: &ResolvedOptions,
    lower_flow: bool,
) {
    let Module {
        units,
        roots,
        env,
        scoping,
        source,
        uids,
        hoisted,
        helpers,
        regions,
        flow_rewrites,
        ..
    } = module;
    let helpers = *helpers;
    let inert_roots: Vec<bool> = roots
        .iter()
        .map(|root| match root {
            Root::Unit(id) => units.get(*id as usize).is_some_and(|unit| unit.is_pure_static()),
            _ => false,
        })
        .collect();

    let mut diagnostics: Vec<Diag<'a>> = Vec::new();
    let mut retarget: Vec<(u32, Span)> = Vec::new();
    let used;
    {
        let mut shape = Shaper {
            allocator,
            ast: AstBuilder::new(allocator),
            lift: Lift::new(allocator, env, scoping),
            source,
            scope: uids.scope(),
            uids,
            hoisted,
            regions,
            flow_rewrites,
            konsts: FxHashMap::default(),
            spreads: 0,
            retarget: &mut retarget,
            diagnostics: &mut diagnostics,
            dev: options.dev,
            hoist: options.opt.hoist,
            lower_flow,
            inert_roots,
            helpers,
            used: [false; HELPER_COUNT],
        };
        for root in roots.iter_mut() {
            if let Root::Verbatim(expression) = root {
                shape.visit_expression(expression);
            }
        }
        for unit in units.iter_mut() {
            for entry in unit.exprs.entries.iter_mut() {
                if let Some(expression) = entry.src.expression_mut() {
                    shape.visit_expression(expression);
                }
            }
        }
        used = shape.used;
    }
    // A root that became a Block's body is spliced into the arrow instead of
    // paying for an IIFE. It is recorded rather than written in place because
    // `roots` and `units` are both borrowed while the walk runs.
    for (index, span) in retarget {
        if let Some(Root::Unit(id)) = roots.get(index as usize)
            && let Some(unit) = units.get_mut(*id as usize)
        {
            unit.site = Site::ArrowBody(span);
        }
    }
    for (index, used) in used.into_iter().enumerate() {
        module.used_helpers[index] |= used;
    }
    module.env.diagnostics.extend(diagnostics);
}

pub(super) struct Shaper<'a, 'm> {
    pub(super) allocator: &'a Allocator,
    pub(super) ast: AstBuilder<'a>,
    pub(super) lift: Lift<'a, 'm>,
    source: &'a str,
    /// The one name the ownership channel travels under (`scope.rs`).
    pub(super) scope: &'a str,
    pub(super) uids: &'m Uids<'a>,
    hoisted: &'m mut oxc::allocator::Vec<'a, Hoisted<'a>>,
    /// The flow pass's staging table. A region lands here and is claimed either
    /// by a unit's patch program or by codegen, which is the same two-sided
    /// arrangement `roots` and `units` already have.
    pub(super) regions: &'m mut oxc::allocator::Vec<'a, Option<Region<'a>>>,
    /// Every reference to a flow binding the lowering consumed, so `install` can
    /// drop an import specifier that has no reader left.
    pub(super) flow_rewrites: &'m mut Vec<SymbolId>,
    /// Printed constant → the `_k$N` already minted for it, so a module with a
    /// thousand `tone="w"` props hoists one thunk.
    konsts: FxHashMap<String, HoistId>,
    /// How many spread source bindings this module has minted. The shape pass
    /// is the only thing that mints them, so the counter lives here rather than
    /// on `Uids`, which the pass holds immutably.
    spreads: u32,
    retarget: &'m mut Vec<(u32, Span)>,
    diagnostics: &'m mut Vec<Diag<'a>>,
    dev: bool,
    hoist: bool,
    /// `Opt::flow`, and off for the string backend: P8b rewrites a flow
    /// component to its own string implementation, so lowering it onto a DOM
    /// primitive first would take that rewrite's subject away.
    lower_flow: bool,
    /// Per root index: the root became a unit whose patch program is EMPTY.
    /// That is `NO_SCOPE`'s proof, and it is read off the lowered IR rather
    /// than off the markup, because P1 has already moved a body's JSX out into
    /// a unit of its own by the time this pass runs.
    inert_roots: Vec<bool>,
    helpers: [&'a str; HELPER_COUNT],
    used: [bool; HELPER_COUNT],
}

/// What a tag resolves to. `Intrinsic` keeps its JSX and goes down the
/// `createElement` path; everything else is called.
pub(super) enum Callee<'a> {
    Intrinsic,
    Component(Expression<'a>, Option<SymbolId>),
}

/// One record of a props source list, or one spread source between two records.
///
/// C9: the sources are the ones the author WROTE, in written order, read
/// last-wins. A record is never merged across a spread, because a later spread
/// has to be able to shadow an earlier literal and an earlier literal has to be
/// able to shadow a still-earlier spread.
pub(super) enum Source<'a> {
    Record(Vec<ObjectPropertyKind<'a>>),
    Spread(Expression<'a>),
}

impl<'a> Shaper<'a, '_> {
    pub(super) fn callee(&self, name: &JSXElementName<'a>) -> Callee<'a> {
        match name {
            // oxc gives a lowercase tag the `Identifier` variant and a
            // capitalised one `IdentifierReference`, so the intrinsic/component
            // split is the parser's and never a name test of ours.
            JSXElementName::Identifier(_) | JSXElementName::NamespacedName(_) => Callee::Intrinsic,
            JSXElementName::IdentifierReference(identifier) => {
                let reference = identifier.reference_id.get();
                let symbol =
                    reference.and_then(|id| self.lift.scoping().get_reference(id).symbol_id());
                // The reference travels with the built callee: P8b resolves a
                // flow component by `SymbolId` off this expression, long after
                // the JSX it came from is gone.
                let callee = self.ident(identifier.name.as_str(), identifier.span);
                if let Expression::Identifier(built) = &callee {
                    built.reference_id.set(reference);
                }
                Callee::Component(callee, symbol)
            }
            // `createElement` calls `tag(finalProps)` with no receiver, so a
            // member tag may not keep its `this`. The comma expression says so.
            JSXElementName::MemberExpression(member) => {
                let chain = self.member_chain(member);
                Callee::Component(self.detached(chain, member.span), None)
            }
            JSXElementName::ThisExpression(this) => {
                let expression = Expression::new_this_expression(this.span, &self.ast);
                Callee::Component(self.detached(expression, this.span), None)
            }
        }
    }

    pub(super) fn ident(&self, name: &str, span: Span) -> Expression<'a> {
        Expression::new_identifier(span, self.allocator.alloc_str(name), &self.ast)
    }

    fn detached(&self, expression: Expression<'a>, span: Span) -> Expression<'a> {
        let zero = Expression::new_numeric_literal(span, 0.0, None, NumberBase::Decimal, &self.ast);
        let parts = ArenaVec::from_iter_in([zero, expression], &self.allocator);
        Expression::new_sequence_expression(span, parts, &self.ast)
    }

    fn member_chain(&self, member: &JSXMemberExpression<'a>) -> Expression<'a> {
        let object = match &member.object {
            // The REFERENCE travels with the name. `<core.For>` is the only
            // spelling of a flow component that reaches codegen as a member
            // expression, and without the reference id the SSR backend has to
            // resolve `core` by name — which is the heuristic this compiler
            // exists to replace.
            JSXMemberExpressionObject::IdentifierReference(identifier) => {
                let expression = self.ident(identifier.name.as_str(), identifier.span);
                if let Expression::Identifier(built) = &expression {
                    built.reference_id.set(identifier.reference_id.get());
                }
                expression
            }
            JSXMemberExpressionObject::ThisExpression(this) => {
                Expression::new_this_expression(this.span, &self.ast)
            }
            JSXMemberExpressionObject::MemberExpression(inner) => self.member_chain(inner),
        };
        let property = IdentifierName::new(
            member.property.span,
            self.allocator.alloc_str(member.property.name.as_str()),
            &self.ast,
        );
        Expression::new_static_member_expression(member.span, object, property, false, &self.ast)
    }

    pub(super) fn flow_of(&self, symbol: Option<SymbolId>) -> Option<Flow> {
        symbol.and_then(|symbol| self.lift.env().kind_of(symbol).flow())
    }

    /// `<Comp a={x}>{k}</Comp>` → `Comp(_s$, { a: () => x, children: _$block((_s$) => k })`.
    ///
    /// C1: the scope the component must run under is its FIRST argument, so
    /// mistiming is a missing argument rather than a runtime surprise. C3: every
    /// own property of the props object is a Cell or a Block, with no exception —
    /// `children`, `onClick`, `each`, `value`, `key`. C9: a spread is a COMPILER
    /// CONSTRUCT, an ordered source list, never a JavaScript spread — so there
    /// is no object to flatten and no getter to read at the copy.
    fn component_call(
        &mut self,
        callee: Expression<'a>,
        symbol: Option<SymbolId>,
        flow: Option<Flow>,
        element: ArenaBox<'a, JSXElement<'a>>,
    ) -> Expression<'a> {
        let JSXElement { span, opening_element, children, .. } = element.unbox();
        let opening = opening_element.unbox();

        let mut sources: Vec<Source<'a>> = vec![Source::Record(Vec::new())];
        let mut keyed = Keyed::ByItem;
        let mut each: Option<(Span, bool)> = None;
        // A `children=` attribute is held back rather than pushed: whether it
        // survives at all depends on JSX children this loop has not read yet.
        // The source and the index it would have taken are kept so it can go
        // back exactly there.
        let mut attribute_children: Option<(usize, usize, Expression<'a>, Span)> = None;

        for item in opening.attributes {
            match item {
                JSXAttributeItem::SpreadAttribute(spread) => {
                    // A spread can carry `keyed` where nothing can read it, so
                    // it resolves to the arm that is safe when wrong — the same
                    // verdict `analysis::bind` takes for the row parameters.
                    keyed = Keyed::ByFn;
                    let spread = spread.unbox();
                    sources.push(Source::Spread(spread.argument));
                    sources.push(Source::Record(Vec::new()));
                }
                JSXAttributeItem::Attribute(attribute) => {
                    let attribute = attribute.unbox();
                    let name = attribute_name(&attribute.name, self.allocator);
                    let at = attribute.span;
                    let value = match attribute.value {
                        None => Expression::new_boolean_literal(at, true, &self.ast),
                        Some(value) => attribute_expression(value, &self.ast, self.allocator),
                    };
                    if name == "keyed" {
                        keyed = Keyed::of_expression(&value);
                    }
                    if name == "each" {
                        each = Some((at, self.unproven_rows(&value)));
                    }
                    let last = sources.len() - 1;
                    if name == "children" {
                        let Source::Record(record) = &sources[last] else { unreachable!() };
                        attribute_children = Some((last, record.len(), value, at));
                        continue;
                    }
                    if self.builds_dom(&value) || self.is_block(&value) {
                        self.block_into_cell_slot(symbol, name, at);
                    }
                    let cell = self.cell_at(value, at, Some(name));
                    let property = self.property(name, cell, at);
                    let Source::Record(record) = &mut sources[last] else { unreachable!() };
                    record.push(property);
                }
            }
        }

        let mut kids = self.children(children);

        // A `children=` attribute is OVERWRITTEN by JSX children. Emitting both
        // spells that as a duplicate key: right by evaluation order, and
        // rejected by ES5-strict tooling and by every linter that reads the
        // output. So the attribute goes back in its own slot only when it
        // survives; when the JSX children overwrite it, a constant is dropped
        // outright and anything else keeps its one evaluation, still in its own
        // slot, as a spread of `null` — which copies no properties at all.
        if let Some((source, index, value, at)) = attribute_children {
            let live = self.lift.rx(&value).konst.is_none();
            let property = if kids.is_empty() {
                if self.builds_dom(&value) || self.is_block(&value) {
                    self.block_into_cell_slot(symbol, "children", at);
                }
                let cell = self.cell_value(value, at);
                Some(self.property("children", cell, at))
            } else if live {
                Some(self.discarded(value, at))
            } else {
                None
            };
            if let Some(property) = property {
                let Source::Record(record) = &mut sources[source] else { unreachable!() };
                record.insert(index, property);
            }
        }

        if !kids.is_empty() {
            // C6. JSX children are a BLOCK — a deferred CONSTRUCTION taking the
            // scope of the construct that receives them. This is the line that
            // makes the Provider bug unrepresentable: there is no expression in
            // the emitted language meaning "children, already built".
            let builds = kids.iter().any(|kid| self.builds_dom(kid));
            let value = if kids.len() == 1 {
                kids.remove(0)
            } else {
                // An opaque CALL among several children is wrapped here and
                // nowhere else. The array goes into a BLOCK, and `buildChild`
                // runs a block untracked on purpose — a component's
                // construction must not be a dependency of the hole that places
                // it — so a read left bare in the array is spent once and never
                // subscribed. An array holding a FUNCTION is a live hole the
                // runtime already knows how to keep.
                let elements = kids
                    .into_iter()
                    .map(|kid| {
                        let wrap = self.lift.rx(&kid).thunk == Thunk::Arrow;
                        let kid = if wrap { self.thunk(kid, span, None) } else { kid };
                        ArrayExpressionElement::from(kid)
                    })
                    .collect::<Vec<_>>();
                let elements = ArenaVec::from_iter_in(elements, &self.allocator);
                Expression::new_array_expression(span, elements, &self.ast)
            };
            if builds {
                self.block_into_cell_slot(symbol, "children", span);
            }
            let value = if builds { self.block(value, span) } else { self.cell_value(value, span) };
            let property = self.property("children", value, span);
            let last = sources.len() - 1;
            let Source::Record(record) = &mut sources[last] else { unreachable!() };
            record.push(property);
        }

        // O3. A by-item row is a plain value, so `{item.name}` is applied once
        // with no thunk and no effect. That is right whenever the rows really are
        // the values `mapArray` recreated, and silently stale when they are store
        // proxies: mutating a proxy field leaves the array identity alone, so no
        // row is recreated and the applied-once read never runs again.
        //
        // The gate is therefore NOT "the compiler knows nothing". A resolvable
        // store — `each={store.items}`, `each={() => store.items}` — is the
        // demonstrable failure case, and gating on `Opaque` stayed silent for
        // exactly it. `keyed={false}` and `keyed={fn}` both hand the row through
        // an accessor, so neither has the hazard at all.
        if self.dev
            && flow == Some(Flow::For)
            && keyed == Keyed::ByItem
            && let Some((at, true)) = each
        {
            self.diagnose(
                Code::Barq004,
                at,
                "For: the origin of `each` cannot be proved to be values `mapArray` recreates, so \
                 a member read on the row item is applied once with no effect (DESIGN O3). If \
                 these rows are store proxies, read them through an accessor instead.",
            );
        }

        // O7 is gone with the getters, and this is where that is recorded. It
        // warned that `Dynamic`'s `{ component: _, ...rest }` reads every getter
        // once and hands the rendered component dead values. Under M3 there are
        // no getters — every prop is a Cell, and a copy of a Cell is the same
        // Cell (C3.4) — so the premise is false and warning anyway would be a
        // lie about the emitted module.

        let props = self.source_list(sources, span);
        let scope = self.ident(self.scope, span);
        let arguments =
            ArenaVec::from_iter_in([Argument::from(scope), Argument::from(props)], &self.allocator);
        Expression::new_call_expression(span, callee, None, arguments, false, &self.ast)
    }

    /// One record → the object itself, which is the overwhelming case and pays
    /// nothing. Otherwise `_$props([…])`, whose sources are in written order and
    /// read last-wins (C9). Empty records are dropped, so `<Foo {...a} />` is one
    /// source rather than three.
    /// A fresh `_o$N` for one construct's spread source list.
    pub(super) fn mint_sources(&mut self) -> &'a str {
        let name = self.uids.sources(self.spreads, self.allocator);
        self.spreads += 1;
        name
    }

    pub(super) fn source_list(&mut self, sources: Vec<Source<'a>>, span: Span) -> Expression<'a> {
        let mut parts: Vec<Expression<'a>> = Vec::with_capacity(sources.len());
        let mut spreads = 0;
        for source in sources {
            match source {
                Source::Record(record) if record.is_empty() => {}
                Source::Record(record) => {
                    let properties = ArenaVec::from_iter_in(record, &self.allocator);
                    parts.push(Expression::new_object_expression(span, properties, &self.ast));
                }
                Source::Spread(expression) => {
                    spreads += 1;
                    parts.push(expression);
                }
            }
        }
        if spreads == 0 {
            return match parts.len() {
                0 => Expression::new_object_expression(
                    span,
                    ArenaVec::new_in(&self.allocator),
                    &self.ast,
                ),
                _ => parts.remove(0),
            };
        }
        let elements = parts.into_iter().map(ArrayExpressionElement::from).collect::<Vec<_>>();
        let elements = ArenaVec::from_iter_in(elements, &self.allocator);
        let list = Expression::new_array_expression(span, elements, &self.ast);
        let callee = self.helper(Helper::Props, span);
        let arguments = ArenaVec::from_iter_in([Argument::from(list)], &self.allocator);
        Expression::new_call_expression(span, callee, None, arguments, false, &self.ast)
    }

    /// The Cell a prop crosses the boundary as — the whole of C3 and C5 in one
    /// place, in the order the cases are tried:
    ///
    /// 1. **JSX lowers to a Block** (C6), never to a built node.
    /// 2. **A value already carrying either calling convention is FORWARDED BY
    ///    NAME**, never re-wrapped. That is C5's identity claim and the reason
    ///    forwarding depth never becomes closure depth (6.73 ns against a
    ///    getter's 455.14 ns).
    /// 3. **η-reduction** — `x={s()}` → `x: s`. Sound because a signal getter
    ///    IS a Cell (R6) and Cells are arity-tolerant (C3.6); refused when the
    ///    reduced expression is JSX, which is a Block (C5.2).
    /// 4. **A literal** crosses through a module-hoisted deduped thunk
    ///    (`_k$N`), so a constant prop costs zero per-instance allocation.
    /// 5. **A value whose identity is observable** — a parameterised function,
    ///    an array, an object — is evaluated once into `_$cell(v)`, so
    ///    `props.onClick()` returns the same object every time.
    /// 6. **Everything else** is `() => expr`: not memoised (C3.2) and neutral
    ///    (C3.3), so the CONSUMER's effect is what subscribes.
    ///
    /// `channel` is the prop NAME when there is one. At a handler channel case 2
    /// is refused for function-valued expressions: see `is_cell`.
    pub(super) fn cell_value(&mut self, value: Expression<'a>, span: Span) -> Expression<'a> {
        self.cell_at(value, span, None)
    }

    pub(super) fn cell_at(
        &mut self,
        value: Expression<'a>,
        span: Span,
        channel: Option<&str>,
    ) -> Expression<'a> {
        if self.builds_dom(&value) {
            return self.block(value, span);
        }
        if self.is_block(&value) {
            // Written in place by `scope.rs` and forwarded by identity (C5),
            // but this IS its definition site, so the brand belongs here.
            return self.brand(value, span);
        }
        // Before the Cell test, because `() => s()` satisfies both and the
        // reduced form is strictly better: one closure fewer per activation,
        // and the same Cell by C3.6.
        if let Some(reduced) = self.eta(&value) {
            return reduced;
        }
        if self.is_cell(&value, channel.is_some_and(is_handler_channel)) {
            return value;
        }
        if let Some(hoisted) = self.konst(&value, span) {
            return hoisted;
        }
        if identity_matters(&value) && !self.rebuilds(&value) {
            let callee = self.helper(Helper::Cell, span);
            let arguments = ArenaVec::from_iter_in([Argument::from(value)], &self.allocator);
            return Expression::new_call_expression(
                span, callee, None, arguments, false, &self.ast,
            );
        }
        self.thunk(value, span, None)
    }

    /// A container literal whose CONTENTS move, so freezing it would freeze the
    /// reads inside it.
    ///
    /// Case 5 above evaluates a value whose identity is observable exactly once.
    /// That is right for a handler and wrong for `style={{ width: size() }}`:
    /// the object was built at the call site, the consumer's effect re-read the
    /// same frozen object forever, and the element never moved. The same
    /// expression on an INTRINSIC element was already correct — `bindEffect`
    /// over `() => ({ width: size() })` — so the two paths disagreed, and only
    /// the component one was wrong.
    ///
    /// A function literal is deliberately not included. Its body is deferred, so
    /// nothing inside it is read at the call site, and its identity is the thing
    /// being passed.
    fn rebuilds(&mut self, value: &Expression<'a>) -> bool {
        let container = matches!(
            strip_wrappers(value),
            Expression::ArrayExpression(_) | Expression::ObjectExpression(_)
        );
        if !container {
            return false;
        }
        let rx = self.lift.rx(value);
        // Proven reactive, or holding an opaque CALL. The second is the one a
        // children array hits: a call is `Opaque`, `join` is `max` and `Opaque`
        // is the top, so the array is never `Reactive` however many moving
        // parts it has.
        rx.react == React::Reactive || rx.thunk == Thunk::Arrow
    }

    /// Whether this expression, when evaluated, BUILDS DOM — a compiled unit's
    /// placeholder, or JSX the lowering refused. Those are exactly the values
    /// that may never be an argument, because an argument is evaluated at the
    /// call site and O2.1 says a child's body runs under the RECEIVING scope.
    pub(super) fn builds_dom(&self, value: &Expression<'a>) -> bool {
        match value {
            Expression::JSXElement(_) | Expression::JSXFragment(_) => true,
            // A type assertion is not a value. `<b/> as never` builds exactly
            // what `<b/>` builds, so a cast that stopped this returning true
            // erased the Block brand and emitted a nullary thunk in its place —
            // C5.1 item 2's stated MUST NOT, reachable from source.
            Expression::ParenthesizedExpression(inner) => self.builds_dom(&inner.expression),
            Expression::TSAsExpression(inner) => self.builds_dom(&inner.expression),
            Expression::TSNonNullExpression(inner) => self.builds_dom(&inner.expression),
            Expression::TSSatisfiesExpression(inner) => self.builds_dom(&inner.expression),
            Expression::Identifier(identifier) => {
                self.uids.root_index(identifier.name.as_str()).is_some()
            }
            _ => false,
        }
    }

    /// A value already carrying the Block calling convention: a function whose
    /// first parameter is the scope name, which is what `scope.rs` left behind
    /// for every JSX-bearing function including a row callback. Forwarded
    /// unchanged — wrapping it would make the consumer's `x($c)` hand back the
    /// Block instead of running it.
    fn is_block(&self, value: &Expression<'a>) -> bool {
        let params = match value {
            Expression::ParenthesizedExpression(inner) => return self.is_block(&inner.expression),
            Expression::TSAsExpression(inner) => return self.is_block(&inner.expression),
            Expression::TSNonNullExpression(inner) => return self.is_block(&inner.expression),
            Expression::TSSatisfiesExpression(inner) => return self.is_block(&inner.expression),
            Expression::ArrowFunctionExpression(arrow) => &arrow.params,
            Expression::FunctionExpression(function) => &function.params,
            _ => return false,
        };
        params
            .items
            .first()
            .and_then(|first| first.pattern.get_binding_identifier())
            .is_some_and(|id| id.name.as_str() == self.scope)
    }

    /// A value already carrying the Cell calling convention, forwarded by name
    /// rather than re-wrapped (C5).
    ///
    /// Three shapes qualify and no others: a binding the analysis proved is an
    /// accessor, which a signal getter is (R6); a member read off a props
    /// parameter, which the total ABI makes a Cell (C3.1); and a zero-arity
    /// function the author wrote, which is literally `() => T` — INLINE or
    /// bound to a name, because the arity rule is about arity and a binding
    /// does
    /// not change it. Refusing the named one is what made `each={activeItems}`
    /// cross as `() => activeItems`, one Cell too many for `For` to unwrap.
    ///
    /// `handler` is the third case's exception and the only thing that settles
    /// it. A zero-arity function literal is `() => T` and a Cell is `() => T`;
    /// no property of the expression tells them apart, so nothing read off the
    /// expression can decide it — arity cannot, and neither can whether the body
    /// happens to produce a value, which is why `onClick={() => setStep(10)}`
    /// survived the arity fix. What decides it is the SLOT: `on*` is the handler
    /// channel, the same channel an intrinsic element already routes to
    /// `delegate`/`listen`, and a function arriving there is the VALUE the
    /// consumer's `props.onClick()` must yield — never the Cell itself. A
    /// forwarded `props.onClick` and a proven signal getter still cross by
    /// identity, because C3.10 rule 4 makes kind travel with the value.
    fn is_cell(&self, value: &Expression<'a>, handler: bool) -> bool {
        match value {
            Expression::ParenthesizedExpression(inner) => self.is_cell(&inner.expression, handler),
            // A type assertion is not a value: `props.children as never` carries
            // the same carrier `props.children` does. Re-wrapping it produced a
            // Cell holding a Block, which is the one shape that then needs a
            // speculative call to take apart again.
            Expression::TSAsExpression(inner) => self.is_cell(&inner.expression, handler),
            Expression::TSNonNullExpression(inner) => self.is_cell(&inner.expression, handler),
            Expression::TSSatisfiesExpression(inner) => self.is_cell(&inner.expression, handler),
            Expression::ArrowFunctionExpression(arrow) => {
                !handler
                    && !arrow.r#async
                    && arrow.params.items.is_empty()
                    && arrow.params.rest.is_none()
                    && super::classify::yields_a_value(&arrow.body)
            }
            Expression::StaticMemberExpression(member) => self.reads_props(&member.object),
            Expression::ComputedMemberExpression(member) => self.reads_props(&member.object),
            Expression::Identifier(_) => symbol_of(self.lift.scoping(), value).is_some_and(|s| {
                match self.lift.env().kind_of(s) {
                    SourceKind::Accessor { .. } => true,
                    SourceKind::Fn { nullary: true } => !handler,
                    _ => false,
                }
            }),
            _ => false,
        }
    }

    fn reads_props(&self, object: &Expression<'a>) -> bool {
        symbol_of(self.lift.scoping(), object)
            .is_some_and(|s| matches!(self.lift.env().kind_of(s), SourceKind::PropsParam))
    }

    /// A literal prop, hoisted once per module and shared by every position that
    /// writes it. With `hoist` off the same thunk is emitted inline: the two
    /// spellings differ in allocation count and in nothing else, which is what
    /// lets the `-O0` differential grade the optimisation instead of the ABI.
    fn konst(&mut self, value: &Expression<'a>, span: Span) -> Option<Expression<'a>> {
        let key = literal_key(value)?;
        if !self.hoist {
            return None;
        }
        if let Some(id) = self.konsts.get(&key) {
            let name = self.uids.konst(*id, self.allocator);
            return Some(self.ident(name, span));
        }
        let id = self.hoisted.len() as HoistId;
        let thunk = self.thunk(value.clone_in(self.allocator), span, None);
        let expr = self.allocator.alloc(thunk) as &'a Expression<'a>;
        self.hoisted.push(Hoisted::Cell { id, expr, span });
        self.konsts.insert(key, id);
        let name = self.uids.konst(id, self.allocator);
        Some(self.ident(name, span))
    }

    /// `(_s$) => value` — a Block. When the body is a compiled unit's
    /// placeholder its site is retargeted, so codegen splices the walk and the
    /// patch program straight into the arrow, costing neither an IIFE nor a
    /// call.
    pub(super) fn block(&mut self, value: Expression<'a>, span: Span) -> Expression<'a> {
        if let Expression::Identifier(identifier) = &value
            && let Some(index) = self.uids.root_index(identifier.name.as_str())
        {
            self.retarget.push((index, span));
        }
        let arrow = self.thunk(value, span, Some(self.scope));
        self.brand(arrow, span)
    }

    /// `_$b(fn)` marks the function in place and hands it back, so
    /// a Block costs one property write at its definition site and no extra
    /// closure at any activation. Kind then travels with the VALUE (rule 4): a
    /// forwarded Block is still branded, a Cell never is, and no consumer has to
    /// guess from arity — which is the guess that put a Scope where a row
    /// callback's item belongs.
    pub(super) fn brand(&mut self, value: Expression<'a>, span: Span) -> Expression<'a> {
        let callee = self.helper(Helper::Block, span);
        let arguments = ArenaVec::from_iter_in([Argument::from(value)], &self.allocator);
        Expression::new_call_expression(span, callee, None, arguments, false, &self.ast)
    }

    pub(super) fn thunk(
        &self,
        value: Expression<'a>,
        span: Span,
        parameter: Option<&'a str>,
    ) -> Expression<'a> {
        let mut items = ArenaVec::new_in(&self.allocator);
        if let Some(name) = parameter {
            let pattern = BindingPattern::new_binding_identifier(span, name, &self.ast);
            items.push(FormalParameter::new(
                span,
                ArenaVec::new_in(&self.allocator),
                pattern,
                None,
                None,
                false,
                None,
                false,
                false,
                &self.ast,
            ));
        }
        let params = FormalParameters::boxed(
            span,
            FormalParameterKind::ArrowFormalParameters,
            items,
            None,
            &self.ast,
        );
        let body = ArrowFunctionBody::from(value);
        Expression::new_arrow_function_expression(span, false, None, params, None, body, &self.ast)
    }

    pub(super) fn helper(&mut self, helper: Helper, span: Span) -> Expression<'a> {
        self.used[helper as usize] = true;
        self.ident(self.helpers[helper as usize], span)
    }

    /// Whether the rows `each` yields might be values `mapArray` does NOT
    /// recreate — a store proxy, a props forward, or an origin the analysis could
    /// not follow at all. Syntactic on purpose: it drives a note, and the honest
    /// answer for anything it cannot see through is "not proven".
    pub(super) fn unproven_rows(&self, value: &Expression<'a>) -> bool {
        match value {
            Expression::ParenthesizedExpression(it) => self.unproven_rows(&it.expression),
            Expression::TSAsExpression(it) => self.unproven_rows(&it.expression),
            Expression::TSNonNullExpression(it) => self.unproven_rows(&it.expression),
            Expression::TSSatisfiesExpression(it) => self.unproven_rows(&it.expression),
            Expression::ArrowFunctionExpression(arrow) => {
                arrow.body.as_expression().is_some_and(|body| self.unproven_rows(body))
            }
            Expression::StaticMemberExpression(member) => self.unproven_rows(&member.object),
            Expression::ComputedMemberExpression(member) => self.unproven_rows(&member.object),
            Expression::CallExpression(call) => self.unproven_rows(&call.callee),
            Expression::Identifier(_) => match symbol_of(self.lift.scoping(), value) {
                // A global the module never bound is as unresolvable as an
                // import the analysis could not follow.
                None => true,
                Some(symbol) => matches!(
                    self.lift.env().kind_of(symbol),
                    SourceKind::ReactiveObject | SourceKind::PropsParam | SourceKind::Opaque
                ),
            },
            _ => false,
        }
    }

    /// `() => f()` → `f`. UNIVERSAL under M3, where it used to be a per-prop
    /// whitelist: the reduction is sound because a signal getter IS a Cell (R6)
    /// and every prop slot is now a Cell slot, so there is no callee contract
    /// left to be ignorant of. It stays refused when the reduced expression is
    /// JSX, which lowers to a Block (C5.2) — that case never reaches here,
    /// because `builds_dom` claims it first.
    fn eta(&self, value: &Expression<'a>) -> Option<Expression<'a>> {
        let Expression::ArrowFunctionExpression(arrow) = value else { return None };
        if arrow.r#async || !arrow.params.items.is_empty() || arrow.params.rest.is_some() {
            return None;
        }
        let Expression::CallExpression(call) = arrow.body.as_expression()? else { return None };
        if !call.arguments.is_empty() || call.optional {
            return None;
        }
        let Expression::Identifier(identifier) = &call.callee else { return None };
        let symbol = symbol_of(self.lift.scoping(), &call.callee)?;
        matches!(self.lift.env().kind_of(symbol), SourceKind::Accessor { .. })
            .then(|| self.ident(identifier.name.as_str(), identifier.span))
    }

    /// `...(expr, null)` — `expr` evaluated for its effect and nothing else.
    /// CopyDataProperties ignores `null`, so the object is untouched, and the
    /// evaluation stays at the position the author wrote it at.
    fn discarded(&self, value: Expression<'a>, span: Span) -> ObjectPropertyKind<'a> {
        let expressions = ArenaVec::from_iter_in(
            [value, Expression::new_null_literal(span, &self.ast)],
            &self.allocator,
        );
        let argument = Expression::new_sequence_expression(span, expressions, &self.ast);
        ObjectPropertyKind::SpreadProperty(ArenaBox::new_in(
            SpreadElement::new(span, argument, &self.ast),
            &self.allocator,
        ))
    }

    pub(super) fn property(
        &self,
        name: &'a str,
        value: Expression<'a>,
        span: Span,
    ) -> ObjectPropertyKind<'a> {
        let key = self.property_key(name, span);
        ObjectPropertyKind::ObjectProperty(ArenaBox::new_in(
            ObjectProperty::new(
                span,
                PropertyKind::Init,
                key,
                value,
                false,
                false,
                false,
                &self.ast,
            ),
            &self.allocator,
        ))
    }

    fn property_key(&self, name: &'a str, span: Span) -> PropertyKey<'a> {
        if is_identifier_name(name) {
            PropertyKey::StaticIdentifier(ArenaBox::new_in(
                IdentifierName::new(span, name, &self.ast),
                &self.allocator,
            ))
        } else {
            PropertyKey::StringLiteral(ArenaBox::new_in(
                StringLiteral::new(span, name, None, &self.ast),
                &self.allocator,
            ))
        }
    }

    pub(super) fn children(&mut self, children: ArenaVec<'a, JSXChild<'a>>) -> Vec<Expression<'a>> {
        let mut out = Vec::with_capacity(children.len());
        for child in children {
            match child {
                JSXChild::Text(child) => {
                    // This becomes a JS string literal, so the references have to
                    // be resolved here rather than by the HTML parser.
                    let raw = child.span.source_text(self.source);
                    if let Some(cleaned) = text::clean(raw, self.allocator) {
                        let value = self.decoded(cleaned);
                        out.push(Expression::new_string_literal(
                            child.span, value, None, &self.ast,
                        ));
                    }
                }
                JSXChild::Element(element) => out.push(Expression::JSXElement(element)),
                JSXChild::Fragment(fragment) => out.push(Expression::JSXFragment(fragment)),
                JSXChild::ExpressionContainer(container) => {
                    if let Some(value) = expression_of(container.unbox().expression) {
                        out.push(value);
                    }
                }
                JSXChild::Spread(_) => unreachable!("refused by `shapeable`"),
            }
        }
        out
    }

    fn decoded(&self, text: &'a str) -> &'a str {
        match entity::decode(text) {
            Some(std::borrow::Cow::Borrowed(same)) => same,
            Some(owned) => self.allocator.alloc_str(&owned),
            None => text,
        }
    }

    /// C5.1 item 1. Within a module the compiler knows the kind of the
    /// forwarded value AND what the callee does with it, so a Block landing in
    /// a Cell slot is a compile-time fact and not something to discover at run
    /// time. Item 2 — the `ScopeMissingError` — is what answers across a module
    /// boundary, where nothing else can.
    ///
    /// The span is the FORWARDING site, which is where the fix is written; the
    /// message carries the consuming position, because a `Diag` holds one span.
    fn block_into_cell_slot(&mut self, callee: Option<SymbolId>, slot: &str, at: Span) {
        if !self.dev {
            return;
        }
        let Some(callee) = callee else { return };
        let Some(read) =
            self.lift.env().cell_slots.iter().find(|e| e.component == callee && e.prop == slot)
        else {
            return;
        };
        let channel = read.channel;
        let (name, read) = (self.lift.scoping().symbol_name(callee).to_string(), read.read);
        // The refusal is a test on the VALUE, not on the scope argument, and the
        // message has to say so: at `ref` the Block would be invoked with the
        // ELEMENT and at `on*` with the EVENT, so "invoked with no scope" is
        // false at exactly the two positions where it is easiest to forward one.
        let refusal = if channel == "ref" || channel.starts_with("on") {
            "A Block reaching a Cell slot is REFUSED with ScopeMissingError (C3.8) — here by a              test on the value, because this position would invoke it with the element or the              event rather than with no scope at all"
        } else {
            "A Block invoked with no scope throws ScopeMissingError (C3.8); it does not fall back              to the ambient owner and it does not stringify"
        };
        // A flow construct's Cell slot is the same compile-time fact as an
        // attribute, and it is NOT on an intrinsic element — naming the wrong
        // position sends the reader to the wrong line.
        let position = match channel {
            "each source" | "branch key" | "portal target" | "boundary on" => {
                "the `{channel}` argument of the primitive that flow construct lowers to"
            }
            _ => "the `{channel}` position on an intrinsic element",
        }
        .replace("{channel}", channel);
        self.diagnose(
            Code::Barq010,
            at,
            &format!(
                "`{slot}` is JSX here, which lowers to a Block, and `{name}` reads `props.{slot}` \
                 as a Cell at byte {}..{} — {position}. \
                 {refusal}. Render it as a child, or hand `{name}` \
                 a Cell — `{slot}={{() => value}}` — instead of JSX.",
                read.start, read.end
            ),
        );
    }

    pub(super) fn diagnose(&mut self, code: Code, span: Span, message: &str) {
        let message = self.allocator.alloc_str(message) as &'a str;
        self.diagnostics.push(Diag { code, span, message });
    }

    fn is_component(&self, element: &JSXElement<'a>) -> bool {
        shapeable(element)
            && matches!(self.callee(&element.opening_element.name), Callee::Component(..))
    }

    fn shape_jsx(&mut self, mut value: Expression<'a>) -> Expression<'a> {
        self.visit_expression(&mut value);
        value
    }

    /// The flow pass's one entry point into the shape walk: a construct it can
    /// lower becomes a `_g$N` placeholder standing for a row in the staging
    /// table, and everything else keeps the component call it always had.
    ///
    /// Returning `None` is the safe direction and the only one that is ever
    /// taken on doubt — a construct that stays a call reaches the same four
    /// primitives through its adapter, one frame and one props object later.
    fn region_placeholder(
        &mut self,
        flow: Flow,
        element: ArenaBox<'a, JSXElement<'a>>,
    ) -> Result<Expression<'a>, ArenaBox<'a, JSXElement<'a>>> {
        if !self.lower_flow {
            return Err(element);
        }
        // `Reveal` is a provide scope rather than a range, so its lowering is a
        // CALL and there is no row for the patch program to hand a
        // `(parent, anchor)` pair to.
        if flow == Flow::Reveal {
            if !super::flow::admits_reveal(self, &element) {
                return Err(element);
            }
            return Ok(super::flow::reveal(self, element));
        }
        if !super::flow::admits(self, flow, &element) {
            return Err(element);
        }
        let span = element.span;
        let region = super::flow::lower(self, flow, element);
        Ok(self.nested_region(region, span))
    }

    /// Stages one region row and returns its id. `Await` uses it twice: the
    /// error boundary it nests is a row of its own, referenced from inside the
    /// loading boundary's Block.
    pub(super) fn stage(&mut self, region: Region<'a>) -> crate::ir::RegionId {
        let id = self.regions.len() as crate::ir::RegionId;
        self.regions.push(Some(region));
        id
    }

    /// The placeholder for a region nested inside another region's body.
    pub(super) fn nested_region(&mut self, region: Region<'a>, span: Span) -> Expression<'a> {
        let id = self.stage(region);
        self.ident(self.uids.region(id, self.allocator), span)
    }

    /// Records that one reference to a flow binding was consumed by the
    /// lowering. `install` drops the import specifier once every reference it
    /// had has been counted here, so a module that lowered all of its `<Show>`s
    /// stops importing `Show`.
    #[inline]
    pub(super) fn dev(&self) -> bool {
        self.dev
    }

    /// The module's source text, for the one question the flow pass asks about
    /// raw JSX: is this text child whitespace between two `<Match>` arms?
    #[inline]
    pub(super) fn source_text(&self) -> &'a str {
        self.source
    }

    /// Whether the root at `index` became a unit with an empty patch program.
    #[inline]
    pub(super) fn inert_root(&self, index: u32) -> bool {
        self.inert_roots.get(index as usize).copied().unwrap_or(false)
    }

    pub(super) fn consumed(&mut self, name: &JSXElementName<'a>) {
        let JSXElementName::IdentifierReference(identifier) = name else { return };
        let Some(reference) = identifier.reference_id.get() else { return };
        if let Some(symbol) = self.lift.scoping().get_reference(reference).symbol_id() {
            self.flow_rewrites.push(symbol);
        }
    }
}

/// A `{...list}` child spreads into `createElement`'s rest parameter, and one
/// `children` value cannot express that, so the whole element stays on the
/// `createElement` path.
fn shapeable(element: &JSXElement<'_>) -> bool {
    !element.children.iter().any(|child| matches!(child, JSXChild::Spread(_)))
}

/// The handler channel, on a component tag as on an intrinsic one.
///
/// `on[A-Z]` rather than the runtime's `on`-prefix test, which exists to catch
/// `onclick` written lowercase on an element. A component prop is read by name
/// in TypeScript, so `once` and `only` are ordinary props and must not be
/// mistaken for events.
pub(crate) fn is_handler_channel(name: &str) -> bool {
    let rest = name.strip_prefix("on");
    rest.and_then(|rest| rest.chars().next()).is_some_and(char::is_uppercase)
}

/// The expression under the casts and parentheses that are not values.
fn strip_wrappers<'e, 'a>(value: &'e Expression<'a>) -> &'e Expression<'a> {
    match value {
        Expression::ParenthesizedExpression(inner) => strip_wrappers(&inner.expression),
        Expression::TSAsExpression(inner) => strip_wrappers(&inner.expression),
        Expression::TSNonNullExpression(inner) => strip_wrappers(&inner.expression),
        Expression::TSSatisfiesExpression(inner) => strip_wrappers(&inner.expression),
        _ => value,
    }
}

/// Whether a value's IDENTITY is observable to the consumer, so the Cell has to
/// carry a value evaluated once rather than an expression evaluated per read.
/// A handler compared across two reads is the case that matters, and the one
/// `component-function-props.tsx` asserts in rendered DOM.
fn identity_matters(value: &Expression<'_>) -> bool {
    match value {
        Expression::ParenthesizedExpression(inner) => identity_matters(&inner.expression),
        Expression::TSAsExpression(inner) => identity_matters(&inner.expression),
        Expression::TSNonNullExpression(inner) => identity_matters(&inner.expression),
        Expression::TSSatisfiesExpression(inner) => identity_matters(&inner.expression),
        Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => true,
        Expression::ArrayExpression(_) | Expression::ObjectExpression(_) => true,
        _ => false,
    }
}

/// The literal props that hoist, keyed by the text a reader would write — so two
/// positions spelling the same constant share one module-scope thunk.
fn literal_key(value: &Expression<'_>) -> Option<String> {
    match value {
        Expression::ParenthesizedExpression(inner) => literal_key(&inner.expression),
        Expression::StringLiteral(it) => Some(format!("s{}", it.value)),
        Expression::NumericLiteral(it) => Some(format!("n{}", it.value)),
        Expression::BooleanLiteral(it) => Some(format!("b{}", it.value)),
        Expression::NullLiteral(_) => Some("null".to_string()),
        _ => None,
    }
}

impl<'a> VisitMut<'a> for Shaper<'a, '_> {
    fn visit_expression(&mut self, it: &mut Expression<'a>) {
        if let Expression::JSXElement(element) = it
            && self.is_component(element)
        {
            let Callee::Component(callee, symbol) = self.callee(&element.opening_element.name)
            else {
                unreachable!("checked by is_component")
            };
            let flow = self.flow_of(symbol);
            let Expression::JSXElement(element) = it.take_in(&self.allocator) else {
                unreachable!("matched above")
            };
            *it = match flow {
                Some(kind) => match self.region_placeholder(kind, element) {
                    Ok(placeholder) => placeholder,
                    Err(element) => self.component_call(callee, symbol, flow, element),
                },
                None => self.component_call(callee, symbol, flow, element),
            };
        }
        walk_expression(self, it);
    }

    fn visit_jsx_child(&mut self, it: &mut JSXChild<'a>) {
        if let JSXChild::Element(element) = it
            && self.is_component(element)
        {
            let span = element.span;
            let JSXChild::Element(element) = it.take_in(&self.allocator) else { unreachable!() };
            let value = self.shape_jsx(Expression::JSXElement(element));
            *it = JSXChild::new_expression_container(span, JSXExpression::from(value), &self.ast);
            return;
        }
        walk_jsx_child(self, it);
    }

    fn visit_jsx_attribute_value(&mut self, it: &mut JSXAttributeValue<'a>) {
        if let JSXAttributeValue::Element(element) = it
            && self.is_component(element)
        {
            let span = element.span;
            let JSXAttributeValue::Element(element) = it.take_in(&self.allocator) else {
                unreachable!()
            };
            let value = self.shape_jsx(Expression::JSXElement(element));
            *it = JSXAttributeValue::new_expression_container(
                span,
                JSXExpression::from(value),
                &self.ast,
            );
            return;
        }
        walk_jsx_attribute_value(self, it);
    }
}

#[cfg(test)]
mod tests {
    use super::is_handler_channel;
    use crate::compile::compile;
    use crate::options::ResolvedOptions;

    fn emit(source: &str) -> crate::compile::CompileOutput {
        compile(source, &ResolvedOptions::with_filename("s.tsx")).expect("compiles")
    }

    fn dev(source: &str) -> crate::compile::CompileOutput {
        let options = ResolvedOptions { dev: true, ..ResolvedOptions::with_filename("s.tsx") };
        compile(source, &options).expect("compiles")
    }
    fn o0(source: &str) -> crate::compile::CompileOutput {
        let options = ResolvedOptions {
            opt: crate::options::Opt::NONE,
            ..ResolvedOptions::with_filename("s.tsx")
        };
        compile(source, &options).expect("compiles")
    }

    /// C1, and the headline of M3. Scope FIRST, on every call, so a component
    /// that is handed no scope is a MISSING ARGUMENT in the emitted text rather
    /// than a runtime surprise — and so the L2b trace can check the argument
    /// against the tree the compiler built.
    #[test]
    fn every_component_call_takes_its_scope_first() {
        let code = emit(
            "const Card = () => <b>x</b>;\n\
             const V = () => <div><Card /></div>;\n\
             function W(props) { return <Card tone={props.tone} /> }\n\
             const X = () => <W tone=\"w\" />;\n",
        )
        .code;
        assert!(code.contains("const Card = (_s$) =>"), "{code}");
        assert!(code.contains("Card(_s$, {})"), "{code}");
        assert!(code.contains("function W(_s$, props)"), "{code}");
        assert!(code.contains("Card(_s$, { tone: props.tone })"), "{code}");
    }

    /// The reason the whole redesign exists: the child may not be an ARGUMENT,
    /// because an argument is evaluated at the call site, before the provider's
    /// scope exists and before its context binding is installed. The emitted
    /// shape is a Block taking a scope, and the only party that can hand it one
    /// is `provide`.
    #[test]
    fn a_child_is_a_block_taking_a_scope_never_a_built_node() {
        let code = emit(
            "import { context } from \"@barqjs/core\";\n\
             const Ctx = context();\n\
             const Child = () => <span>{Ctx.use()()}</span>;\n\
             export const App = () => <Ctx.Provider value={1}><Child /></Ctx.Provider>;\n",
        )
        .code;
        assert!(code.contains("children: _$block((_s$) => Child(_s$, {})"), "{code}");
        // O2's negation, written down: the child as a syntactic argument.
        assert!(!code.contains("children: Child("), "{code}");
        assert!(code.contains("(0, Ctx.Provider)(_s$, {"), "{code}");
    }

    /// C6's other half: markup children are a Block whose body is the compiled
    /// unit itself, spliced rather than wrapped in an IIFE.
    #[test]
    fn markup_children_are_a_block_whose_body_is_the_unit() {
        let code = emit("const V = () => <Panel><b>x</b></Panel>;\n").code;
        assert!(code.contains("children: _$block((_s$) => _tmpl$1()"), "{code}");
        assert!(!code.contains("children: _tmpl$1()"), "{code}");
    }

    /// C3.1/C3.3. A reactive prop crosses as a Cell — `() => expr`, not
    /// memoised and not tracking — so the CONSUMER's effect subscribes, at the
    /// consumer's position. Where it used to be a getter it is now a plain
    /// property, which is what makes `{...props}` in user code correct (C3.4)
    /// and what buys the 8.7x allocation measurement.
    #[test]
    fn a_reactive_prop_crosses_the_boundary_as_a_cell() {
        let code = emit(
            "import { signal } from \"@barqjs/core\";\n\
             const n = signal(0);\n\
             export const V = () => <Badge total={n()} label=\"x\" fn={() => n()} />;\n",
        )
        .code;
        assert!(code.contains("Badge(_s$, {"), "{code}");
        assert!(code.contains("total: () => n()"), "{code}");
        assert!(!code.contains("get total()"), "{code}");
        // A literal hoists (C3.1 + the constant-thunk graft); an author-written
        // zero-arity arrow already IS a Cell and is forwarded untouched.
        assert!(code.contains("label: _k$1"), "{code}");
        assert!(code.contains("const _k$1 = () => \"x\""), "{code}");
        // η-reduction is UNIVERSAL after M3, so an author-written `() => n()`
        // collapses to the accessor itself: the same Cell, one closure fewer.
        assert!(code.contains("fn: n"), "{code}");
    }

    /// Case 5's limit. A container literal is frozen for its IDENTITY, which is
    /// right for a handler and was wrong for `style={{ width: size() }}`: the
    /// object was built once at the call site and the consumer re-read the
    /// frozen copy forever, so the element never moved. The same expression on
    /// an INTRINSIC element was already a `bindEffect`, so the two paths
    /// disagreed and only the component one was wrong.
    #[test]
    fn a_container_literal_holding_a_reactive_read_is_rebuilt_not_frozen() {
        let code = emit(
            "import { signal } from \"@barqjs/core\";\n\
             const n = signal(0);\n\
             const fixed = { a: 1 };\n\
             export const V = () => (\n\
               <>\n\
                 <Box style={{ width: n() }} />\n\
                 <Box list={[n(), 2]} />\n\
                 <Box style={fixed} />\n\
                 <Box onPress={(event) => n() + event} />\n\
               </>\n\
             );\n",
        )
        .code;
        assert!(code.contains("style: () => ({ width: n() })"), "{code}");
        assert!(code.contains("list: () => [n(), 2]"), "{code}");
        // Nothing moves inside it, so it is still evaluated once.
        assert!(
            code.contains("style: () => fixed") || code.contains("style: _$cell(fixed)"),
            "{code}"
        );
        // A function literal's body is deferred and its identity IS the value.
        // A zero-arity one η-reduces instead, so this one takes a parameter.
        assert!(code.contains("onPress: _$cell((event) => n() + event)"), "{code}");
    }

    /// An `Opaque` call at a HOLE is wrapped, not evaluated.
    ///
    /// `Opaque` means "emit it unwrapped and let the runtime decide", which is
    /// sound for a binding — `insert` sees a function and subscribes, or sees a
    /// value and does not. A call is different: unwrapping it means RUNNING it,
    /// and what reaches the runtime is a plain result with the reads already
    /// spent. `<div>{label()}<b/></div>` was applied once and never moved.
    #[test]
    fn an_opaque_call_at_a_hole_is_thunked_rather_than_spent() {
        let code = emit(
            "import { signal } from \"@barqjs/core\";\n\
             const n = signal(0);\n\
             const label = () => \"n\" + n();\n\
             export const V = () => (\n\
               <>\n\
                 <div>{label()}</div>\n\
                 <div>{label()}<b>x</b></div>\n\
                 <div>{n()}<b>x</b></div>\n\
               </>\n\
             );\n",
        )
        .code;
        // Both holes, alone and beside a sibling.
        assert_eq!(code.matches("() => label()").count(), 2, "{code}");
        // A proven accessor still η-reduces: no closure where none is needed.
        assert!(code.contains("_$insert(_s$, _el$4, n, _el$5)"), "{code}");
    }

    /// The same call among a COMPONENT's children, where the array is a block.
    ///
    /// `buildChild` runs a block untracked on purpose — a component's
    /// construction must not be a dependency of the hole that places it — so a
    /// read left bare in the children array is spent once and never subscribed.
    /// An array holding a FUNCTION is a live hole the runtime already keeps.
    #[test]
    fn an_opaque_call_among_a_components_children_is_its_own_hole() {
        let code = emit(
            "import { signal } from \"@barqjs/core\";\n\
             const n = signal(0);\n\
             const label = () => \"n\" + n();\n\
             export const V = () => <Box>{label()}<b>y</b></Box>;\n",
        )
        .code;
        assert!(code.contains("[() => label(), "), "{code}");
    }

    /// C3.2. An opaque expression still crosses as a Cell: the ABI is TOTAL, so
    /// there is no prop shape for which a consumer has to ask what it got. The
    /// price is stated rather than hidden — a Cell is not memoised, so a
    /// consumer that must not evaluate twice reads once.
    #[test]
    fn an_unresolvable_prop_crosses_as_a_cell_like_every_other() {
        let code = emit("const V = () => <Badge total={compute()} />;\n").code;
        assert!(code.contains("Badge(_s$, { total: () => compute() })"), "{code}");
        assert!(!code.contains("get total()"), "{code}");
    }

    /// The constant-thunk graft, from Uniform Deferral: a
    /// proven constant crosses through a module-hoisted DEDUPED thunk, so a
    /// thousand rows spelling `tone="w"` allocate one closure between them.
    ///
    /// With `-O0` the same constant is a thunk at its use site. Both spellings
    /// mean the same thing, which is exactly what makes the difference an
    /// optimisation the L3 differential can grade rather than a semantic fork.
    #[test]
    fn a_constant_prop_is_one_hoisted_thunk_for_the_whole_module() {
        let source = "const A = () => <Badge tone=\"w\" />;\n\
                      const B = () => <Chip tone=\"w\" n={2} />;\n";
        let code = emit(source).code;
        assert_eq!(code.matches("const _k$1 = () => \"w\"").count(), 1, "{code}");
        assert_eq!(code.matches("tone: _k$1").count(), 2, "{code}");
        assert!(code.contains("const _k$2 = () => 2"), "{code}");

        let code = o0(source).code;
        assert!(!code.contains("_k$"), "{code}");
        assert_eq!(code.matches("tone: () => \"w\"").count(), 2, "{code}");
    }

    /// C5. Forwarding is IDENTITY — the same function object, not a new closure
    /// — which is why forwarding depth never becomes closure depth. A getter
    /// cannot satisfy this rule at all: `get x() { return props.x }` allocates a
    /// new descriptor at every hop (455.14 ns against a thunk's 6.73).
    #[test]
    fn a_forwarded_prop_is_the_same_cell_not_a_new_closure() {
        let code = emit(
            "import { signal } from \"@barqjs/core\";\n\
             const n = signal(0);\n\
             const A = (props) => <B x={props.x} y={props.y} />;\n\
             const C = () => <A x={n} />;\n",
        )
        .code;
        assert!(code.contains("x: props.x"), "{code}");
        assert!(code.contains("y: props.y"), "{code}");
        assert!(!code.contains("() => props.x"), "{code}");
        // A signal getter IS a Cell (R6), so it forwards by name too.
        assert!(code.contains("A(_s$, { x: n })"), "{code}");
    }

    /// C3.1 reaches `onClick` like everything else, and C5's identity claim has
    /// to survive it: a handler read twice must be the same object, which
    /// `component-function-props.tsx` asserts in rendered DOM. A parameterised
    /// function is therefore evaluated ONCE into `_$cell`, not rebuilt per read.
    #[test]
    fn a_function_prop_is_a_cell_carrying_one_evaluation() {
        let code = emit(
            "export const V = (props) => <Button onClick={(e) => go(e, props.id)} rows={[1, 2]} />;\n",
        )
        .code;
        assert!(code.contains("onClick: _$cell((e) => go(e, props.id))"), "{code}");
        assert!(code.contains("rows: _$cell([1, 2])"), "{code}");
    }

    /// C9. A spread is a COMPILER CONSTRUCT: an ordered list of sources in
    /// WRITTEN order, read last-wins. There is no object to spread, so the
    /// getter-flattening class — `{...props}`, `mergeProps`, `splitProps`,
    /// `omit` — is impossible by construction rather than diagnosable.
    #[test]
    fn a_spread_becomes_a_source_list_in_written_order() {
        let code = emit("const V = () => <Foo {...a} b={x()} {...c} />;\n").code;
        let list = code.replace(char::is_whitespace, "");
        assert!(list.contains("_$props([a,{b:()=>x()},c])"), "{code}");
        assert!(!code.contains("...a"), "{code}");

        // One plain record is returned unchanged: the overwhelming case pays
        // nothing, which is the whole reason `_$props` is a call and not a shape.
        let code = emit("const V = () => <Foo b={x()} />;\n").code;
        assert!(!code.contains("_$props"), "{code}");
    }

    /// Target #8, restated for M4b. A static control-flow body is one
    /// `template()` clone inside a Block — no IIFE, no element binding — and a
    /// body carrying a patch splices its walk into the same Block.
    ///
    /// The construct itself is gone: what stands here is `branch`, taking a key
    /// that is the author's own `when` read and one body for every key. The
    /// props object, the `Show` frame and the runtime's re-derivation of
    /// `(parent, anchor)` went with it (K5).
    #[test]
    fn a_static_control_flow_body_costs_one_clone_and_nothing_else() {
        let source = "import { Show, signal } from \"@barqjs/core\";\n\
                      const on = signal(false);\n\
                      export const A = () => <Show when={() => on()}><p class=\"s\">x</p></Show>;\n\
                      export const B = () => <Show when={() => on()}><p class=\"s\">{on()}</p></Show>;\n";
        let code = emit(source).code;
        // Non-keyed is the default since M10, so the key is the truthiness
        // INDEX and the bodies are a two-row table whose falsy row is the
        // (absent) fallback.
        assert!(code.contains("_$branch(_s$, null, null, () => on() ? 1 : 0"), "{code}");
        assert!(code.contains("[null, _$block((_s$) => _tmpl$1())]"), "{code}");
        assert!(code.contains("_$insert(_s$, _el$1, on)"), "{code}");
        assert!(!code.contains("Show("), "{code}");
        assert!(!code.contains("when:"), "{code}");

        // With the flow pass off the construct keeps its adapter, and the
        // η-reduction that used to be the only observable here is still what
        // fills the prop: a signal getter IS a Cell (C5.2).
        let code = o0(source).code;
        assert!(code.contains("Show(_s$, {"), "{code}");
        assert!(code.contains("when: on"), "{code}");
        assert!(!code.contains("_$branch"), "{code}");
    }

    /// The boundary of η-reduction, and what M3 changes about it. An arrow the
    /// AUTHOR wrote is a Cell already and is forwarded untouched; a row
    /// callback is a BLOCK already — `scope.rs` gave it the scope parameter —
    /// and is likewise forwarded, never wrapped.
    #[test]
    fn an_author_written_thunk_and_a_row_callback_are_forwarded_untouched() {
        let source = "import { For, Show, signal } from \"@barqjs/core\";\n\
                      const on = signal(false);\n\
                      const rows = signal([1]);\n\
                      export const A = () => <Show when={() => on()}>{() => <p class=\"s\">x</p>}</Show>;\n\
                      export const B = () => <For each={() => rows()}>{() => <li>x</li>}</For>;\n";
        let code = emit(source).code;
        assert!(code.contains("_$block((_s$) => _tmpl$1())"), "{code}");
        assert!(code.contains("_$block((_s$) => _tmpl$2())"), "{code}");
        // The source `each` is the primitive's fourth argument now, and it is
        // still the accessor itself rather than a Cell wrapped around one.
        assert!(code.contains("_$each(_s$, null, null, rows, null,"), "{code}");
    }

    /// A body with a hole is not static, so the Block's body is the compiled
    /// unit and the DOM is only built when the branch is first taken.
    #[test]
    fn a_body_with_a_patch_keeps_its_block() {
        let code = emit(
            "import { Show, signal } from \"@barqjs/core\";\n\
             const on = signal(false);\n\
             const V = () => <Show when={() => on()}>{() => <p>{value}</p>}</Show>;\n",
        )
        .code;
        assert!(code.contains("_$block((_s$) => {"), "{code}");
        assert!(code.contains("_$insert(_s$, _el$1, value)"), "{code}");
        // The two-row table of the non-keyed default, which is what a `Show`
        // with no `keyed` emits since M10.
        assert!(code.contains("[null, _$block("), "{code}");
        // A body that reaches `insert` registers something disposable, so the
        // activation still gets a `Scope` and no flag is shipped.
        assert!(!code.contains("}), 2)"), "{code}");
    }

    /// A `children=` attribute alongside JSX children. ONE `children` key is the
    /// semantics, and two of them is a duplicate key which ES5-strict rejects.
    /// The attribute's own evaluation survives where it cannot be proved
    /// constant, in the slot it was written in, so a side effect still fires
    /// exactly once and still fires before the props that follow it.
    #[test]
    fn a_children_attribute_overwritten_by_jsx_children_leaves_one_key() {
        let code =
            emit("const V = () => <Panel children=\"lit\" tone=\"w\"><b>x</b></Panel>;\n").code;
        assert_eq!(code.matches("children:").count(), 1, "{code}");
        assert!(code.contains("children: _$block((_s$) => _tmpl$1()"), "{code}");
        assert!(!code.contains("\"lit\""), "{code}");

        let code =
            emit("const V = () => <Panel children={f()} tone=\"w\"><b>x</b></Panel>;\n").code;
        assert_eq!(code.matches("children:").count(), 1, "{code}");
        let discard = code.find("...(f(), null)").expect("the discarded evaluation");
        let tone = code.find("tone: _k$1").expect("the prop after it");
        let kids = code.find("children: _$block((_s$) => _tmpl$1()").expect("the JSX children");
        assert!(discard < tone && tone < kids, "{code}");

        // With no JSX children there is nothing to overwrite it, and the
        // attribute is an ordinary Cell-valued prop again.
        let code = emit("const V = () => <Panel children={f()} tone=\"w\" />;\n").code;
        assert!(code.contains("children: () => f()"), "{code}");
        assert!(code.contains("tone: _k$1"), "{code}");
    }

    /// `SourceKind::PropsParam` is what makes `props.total` a Cell REFERENCE
    /// inside the component and a Cell forwarded by identity out of it. Both
    /// halves are pinned here, because the second is what C5 costs if the first
    /// is wrong.
    ///
    /// C4 settled the read spelling as `props.total()`, and the two spellings
    /// converge on ONE emission: the reference is Accessor-shaped so it is
    /// emitted unwrapped, and `() => props.total()` η-reduces to the same Cell.
    /// That convergence is the point — `insert` unwraps exactly one level, and
    /// the pre-M3 `() => props.total` handed it two.
    #[test]
    fn a_props_read_is_live_inside_and_forwards_by_identity_out() {
        let code = emit(
            "import { signal } from \"@barqjs/core\";\n\
             const n = signal(0);\n\
             function Badge(props) { return <span>{props.total()}</span>; }\n\
             function Outer(props) { return <Chip tone={props.tone} />; }\n\
             export default function App() { return <div><Badge total={n()} /><Outer tone=\"w\" /></div>; }\n",
        )
        .code;
        assert!(code.contains("_$insert(_s$, _el$1, props.total)"), "{code}");
        assert!(!code.contains("() => props.total"), "{code}");
        assert!(code.contains("Chip(_s$, { tone: props.tone })"), "{code}");
        assert!(!code.contains("get tone()"), "{code}");

        // The bare reference in the same slot is the same Cell, emitted the
        // same way. A Cell handed to `insert` IS the live read; wrapping it
        // would be the double Cell C3.4 forbids.
        let bare = emit(
            "function Badge(props) { return <span>{props.total}</span>; }\n\
             export default function App() { return <Badge total={1} />; }\n",
        )
        .code;
        assert!(bare.contains("_$insert(_s$, _el$1, props.total)"), "{bare}");
    }

    /// The arity rule through a BINDING. A zero-arity function the author wrote
    /// is
    /// a Cell whether it is written inline or given a name, so `each={rows}`
    /// forwards the accessor itself. Wrapping it was one Cell too many: `For`
    /// unwraps exactly one level, so `each()` handed back the FUNCTION and the
    /// list rendered empty at every frame.
    #[test]
    fn a_named_zero_arity_function_forwards_by_identity() {
        let code = emit(
            "import { For, signal } from \"@barqjs/core\";\n\
             const items = signal([1]);\n\
             const rows = () => items().filter(Boolean);\n\
             export const V = () => <For each={rows}>{(row) => <li>{row()}</li>}</For>;\n",
        )
        .code;
        assert!(code.contains("_$each(_s$, null, null, rows, null,"), "{code}");
        assert!(!code.contains("() => rows"), "{code}");

        // A PARAMETERISED binding is not a Cell — it is a key FUNCTION, and the
        // arity is what tells the two apart. `each` takes it as
        // `keyOf` directly, where the adapter had to re-derive that at run time
        // from `typeof carrier === "function" && carrier.length >= 1`.
        let keyed = emit(
            "import { For, signal } from \"@barqjs/core\";\n\
             const items = signal([1]);\n\
             const byId = (row) => row.id;\n\
             export const V = () => <For each={items} keyed={byId}>{(row) => <li>x</li>}</For>;\n",
        )
        .code;
        assert!(keyed.contains("_$each(_s$, null, null, items, byId,"), "{keyed}");
        assert!(!keyed.contains("() => byId"), "{keyed}");
    }

    /// No function ever crosses a handler channel as the Cell ITSELF.
    ///
    /// The consumer reads `props.onClick()` under C3.1's totality, so a function
    /// forwarded by identity there is INVOKED at construction and its return
    /// value — usually `undefined` — is what gets bound as the handler. That
    /// silently ran every `onClick` in the reference application once at mount
    /// and left the button dead, and no suite saw it, because the emitted code
    /// is well-formed and the damage is written before the first paint.
    ///
    /// Arity could not settle it, and neither could the body: the form that
    /// broke the app is `onClick={() => setStep(10)}`, an expression body that
    /// does yield a value. The SLOT settles it, so every row here is a value
    /// that is a Cell at `value=` and a handler at `onClick=`.
    #[test]
    fn a_function_never_crosses_a_handler_channel_as_the_cell() {
        let prelude = "import { Button } from \"./b\";\n\
                       const block = () => { save() };\n\
                       const expr = () => save();\n";
        // (attribute value, at `onClick=`, at `value=`)
        let cases = [
            // the form that broke the app: an expression body DOES yield a
            // value, so nothing about the function distinguishes it
            ("{() => save()}", "onClick: _$cell(() => save())", "value: () => save()"),
            ("{() => { save() }}", "onClick: _$cell(() => {", "value: _$cell(() => {"),
            ("{expr}", "onClick: () => expr", "value: expr"),
            ("{block}", "onClick: () => block", "value: () => block"),
        ];
        for (value, handler, cell) in cases {
            let at_handler =
                emit(&format!("{prelude}export const V = () => <Button onClick={value}/>;\n")).code;
            assert!(at_handler.contains(handler), "{handler} not in:\n{at_handler}");
            let at_cell =
                emit(&format!("{prelude}export const V = () => <Button value={value}/>;\n")).code;
            assert!(at_cell.contains(cell), "{cell} not in:\n{at_cell}");
        }

        // C3.10 rule 4 — kind travels with the VALUE. A prop read is already a
        // Cell, so the handler channel must not re-wrap it; doing so would make
        // the child's `props.onClick()` yield the parent's Cell instead of the
        // function, which is the same defect one level down.
        let forwarded = emit(&format!(
            "{prelude}export const V = (props) => <Button onClick={{props.onClick}}/>;\n"
        ))
        .code;
        assert!(forwarded.contains("onClick: props.onClick"), "{forwarded}");

        // The channel is `on` + an UPPERCASE letter. `once` is an ordinary prop
        // and a nullary binding still crosses it by identity (C5).
        let once =
            emit(&format!("{prelude}export const V = () => <Button once={{expr}}/>;\n")).code;
        assert!(once.contains("once: expr"), "{once}");
        assert!(is_handler_channel("onClick") && is_handler_channel("onPointerDown"));
        assert!(!is_handler_channel("once") && !is_handler_channel("only"));
        assert!(!is_handler_channel("on") && !is_handler_channel("onclick"));
    }

    /// η-reduction's preconditions, each one negatively. What has to be pinned
    /// is that the reduction only ever fires for a ZERO-ARG ACCESSOR RESOLVED BY
    /// SYMBOL — everything else keeps the author's expression, wrapped by
    /// whichever Cell rule owns it.
    #[test]
    fn eta_refuses_everything_that_is_not_a_bare_accessor_call() {
        let cases = [
            // the callee is a function, not an accessor: calling it is not a read
            (
                "const f = () => [1];\nexport const V = () => <For each={() => f()}>{r}</For>;",
                "null, null, () => f(), null,",
            ),
            // an argument means the arrow is not the identity of the call
            (
                "const f = signal([1]);\nexport const V = () => <For each={() => f(1)}>{r}</For>;",
                "null, null, () => f(1), null,",
            ),
            // a parameter means the arrow is not zero-arity, so it is a VALUE
            // whose identity the consumer may compare
            (
                "const f = signal([1]);\nexport const V = () => <For each={(x) => f()}>{r}</For>;",
                "null, null, _$cell((x) => f()), null,",
            ),
            // a member call is not an identifier reference
            (
                "const o = { f: () => [1] };\nexport const V = () => <For each={() => o.f()}>{r}</For>;",
                "null, null, () => o.f(), null,",
            ),
        ];
        for (body, expected) in cases {
            let source = format!(
                "import {{ For, signal }} from \"@barqjs/core\";\nconst r = (x) => x;\n{body}\n"
            );
            let code = emit(&source).code;
            assert!(code.contains(expected), "{expected} not in:\n{code}");
        }

        // η-reduction is universal now, so a reduced prop is no longer
        // evidence about which binding the tag resolved to. The SymbolId
        // discipline it used to stand for is pinned where it is still
        // observable: a LOCAL `Show` is not the runtime's and gets no string
        // implementation.
        let options = ResolvedOptions { ssr: true, ..ResolvedOptions::with_filename("s.tsx") };
        let local = compile(
            "const Show = (props) => props.when;\n\
             export const V = () => <Show when={() => on()} />;\n",
            &options,
        )
        .expect("compiles")
        .code;
        assert!(!local.contains("_$ssrShow"), "{local}");
    }

    /// A one-parameter JSX-returning arrow is a BLOCK with a slot parameter
    /// (C6), not a component with a props object: a `<For>` row callback and a
    /// `.map` body are spelled the same way, and thunking the row is pure loss.
    #[test]
    fn a_row_callback_parameter_is_not_a_props_object() {
        let code = emit(
            "import { For, signal } from \"@barqjs/core\";\n\
             const rows = signal([{ id: 1, n: \"a\" }]);\n\
             const row = (item) => <li>{item.n}</li>;\n\
             export const V = () => <For each={rows}>{row}</For>;\n",
        )
        .code;
        assert!(code.contains("_$insert(_s$, _el$1, item.n)"), "{code}");
        assert!(!code.contains("() => item.n"), "{code}");
        assert!(code.contains("const row = _$block((_s$, item) =>"), "{code}");
    }

    /// O3 is the one documented divergence M3 leaves standing, so it is not
    /// allowed to be silent. O7 is gone: it warned that `Dynamic` spreading its
    /// props reads every getter once, and after M3 there are no getters to read.
    #[test]
    fn the_documented_divergence_is_reported_and_the_getter_one_is_gone() {
        let notes = dev(
            "import { For } from \"@barqjs/core\";\n\
             export const V = (props) => <For each={props.rows}>{(item) => <li>{item.n}</li>}</For>;\n",
        )
        .warnings;
        assert_eq!(notes.len(), 1, "{notes:?}");
        assert!(notes[0].message.contains("origin of `each`"), "{notes:?}");

        // The case the `Opaque` gate stayed silent for, and the one O3's own
        // message names: a RESOLVABLE store, whose rows `mapArray` never
        // recreates because mutating a proxy field leaves the array alone.
        for each in ["store.items", "() => store.items"] {
            let source = format!(
                "import {{ For, useStore }} from \"@barqjs/core\";\n\
                 const [store] = useStore({{ items: [] }});\n\
                 export const V = () => <For each={{{each}}}>{{(item) => <li>{{item.n}}</li>}}</For>;\n"
            );
            let notes = dev(&source).warnings;
            assert_eq!(notes.len(), 1, "each={each}: {notes:?}");
        }

        // A signal of plain rows IS what mapArray recreates, so there is
        // nothing to say and the note stays out of the way.
        let quiet = dev("import { For, signal } from \"@barqjs/core\";\n\
             const rows = signal([]);\n\
             export const V = () => <For each={rows}>{(item) => <li>{item.n}</li>}</For>;\n")
        .warnings;
        assert!(quiet.is_empty(), "{quiet:?}");

        // `For keyed={false}` is positional, and its row item is an
        // accessor, so O3 does not apply and there is nothing to say.
        let quiet = dev(
            "import { For } from \"@barqjs/core\";\n\
             export const V = (props) => <For each={props.rows} keyed={false}>{(i) => <li>{i()}</li>}</For>;\n",
        )
        .warnings;
        assert!(quiet.is_empty(), "{quiet:?}");

        // A key FUNCTION boxes the row in a signal, so its item is an accessor
        // too and the note has nothing to warn about.
        for keyed in ["(r) => r.id", "keyOf"] {
            let quiet = dev(&format!(
                "import {{ For }} from \"@barqjs/core\";\n\
                 import {{ keyOf }} from \"./keys\";\n\
                 export const V = (props) => <For each={{props.rows}} keyed={{{keyed}}}>{{(i) => <li>{{i().n}}</li>}}</For>;\n",
            ))
            .warnings;
            assert!(quiet.is_empty(), "keyed={keyed}: {quiet:?}");
        }

        // Advice about a runtime behaviour, not a defect in the module, so it is
        // off on a production build.
        assert!(
            emit(
                "import { For } from \"@barqjs/core\";\n\
                 export const V = (props) => <For each={props.rows}>{(i) => <li>{i.n}</li>}</For>;\n"
            )
            .warnings
            .is_empty()
        );

        // O7's shape, now silent, and the emitted module says why: no getter.
        let dynamic = dev("import { Dynamic, signal } from \"@barqjs/core\";\n\
             const n = signal(0);\n\
             const V = () => <Dynamic component=\"b\" total={n()} />;\n");
        assert!(dynamic.warnings.is_empty(), "{:?}", dynamic.warnings);
        assert!(!dynamic.code.contains("get total()"), "{}", dynamic.code);
        assert!(dynamic.code.contains("total: () => n()"), "{}", dynamic.code);
    }
}
