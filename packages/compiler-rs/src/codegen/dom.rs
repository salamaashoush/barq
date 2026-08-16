use oxc::allocator::{Allocator, Box as ArenaBox, Vec as ArenaVec};
use oxc::ast::ast::{
    Argument, ArrayExpressionElement, ArrowFunctionBody, ArrowFunctionExpression, AssignmentTarget,
    BindingPattern, Expression, FormalParameterKind, FormalParameters, IdentifierName,
    MemberExpression, Statement, VariableDeclarationKind, VariableDeclarator,
};
use oxc::span::Span;
use rustc_hash::FxHashSet;

use crate::codegen::backend::{At, Backend, lower};
use crate::codegen::{Emit, Helper};
use crate::ir::{
    Anchor, Chan, Diff, ExprId, HandlerRef, InsertPlan, NameId, NodeId, Op, Patch, RefDef, Region,
    RegionId, RegionKind, Shape, SlotId, Step, Thunk, Unit, WHOLE,
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
    let mut owned: FxHashSet<NodeId> = FxHashSet::default();
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
        let mut backend = Dom { ctx, unit, owned: &mut owned };
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
/// The one op with no row here — `Spread` — reaches the DOM through the props
/// object `createElement` builds (`fallback.rs`), because P1 refuses to put an
/// element carrying one on the template path at all. Returning `None` for it is
/// that decision written down, not a case that fell through: there is no
/// wildcard arm to fall through.
pub struct Dom<'a, 'e, 'm, 'u> {
    pub ctx: &'e mut Emit<'a, 'm>,
    pub unit: &'u mut Unit<'a>,
    /// The elements whose `$$s` this unit has already written. The scope
    /// expando is per ELEMENT, not per delegated type, so a second handler on
    /// the same element writes only its own `$$<type>`.
    pub owned: &'u mut FxHashSet<NodeId>,
}

/// §3.5: the channel is a compile-time fact, so it is a different runtime entry
/// point rather than a string the runtime classifies. Justified on capability —
/// §0.4 measured the dispatch removal at 0-8%, and this is not claimed on speed.
pub(super) fn channel_helper(chan: Chan) -> Helper {
    match chan {
        Chan::Attr => Helper::SetAttr,
        Chan::Prop => Helper::SetDomProp,
        Chan::Live => Helper::SetLive,
        Chan::Bool => Helper::SetBool,
        Chan::Class => Helper::SetClass,
        Chan::Style => Helper::SetStyle,
        Chan::StyleProp => Helper::SetStyleProp,
        Chan::ClassList => Helper::SetClassList,
        Chan::Html => Helper::SetHtml,
    }
}

impl<'a> Dom<'a, '_, '_, '_> {
    /// `_$setAttr(el, "id", value)` — the resolved channel, called directly.
    fn write(
        &mut self,
        at: At<'_>,
        name: NameId,
        chan: Chan,
        value: Expression<'a>,
    ) -> Statement<'a> {
        let span = at.span();
        let element = ref_ident(self.ctx, self.unit, at.target(), span);
        let key = self.ctx.module.interner.name(name).text;
        let key = self.ctx.string(key, span);
        let callee = self.ctx.helper(channel_helper(chan), span);
        let call = self.ctx.call(
            callee,
            vec![Argument::from(element), Argument::from(key), Argument::from(value)],
            span,
        );
        Statement::new_expression_statement(span, call, &self.ctx.ast)
    }
}

impl<'a> Backend<'a> for Dom<'a, '_, '_, '_> {
    type Out = Option<Statement<'a>>;

    /// A value the analysis PROVED static: one write at construction, straight
    /// down the resolved channel. No dispatch, no liveness test, no effect.
    fn set_once(&mut self, at: At<'_>, name: NameId, value: ExprId, chan: Chan) -> Self::Out {
        let value = take(self.ctx, self.unit, value, at.span());
        Some(self.write(at, name, chan, value))
    }

    /// The channel is resolved; the LIVENESS is not, and §3.13 says it cannot
    /// be. `bindProp` is handed the channel and asks the one remaining question.
    fn set_opaque(&mut self, at: At<'_>, name: NameId, value: ExprId, chan: Chan) -> Self::Out {
        let span = at.span();
        let value = take(self.ctx, self.unit, value, span);
        let scope = self.ctx.scope(span);
        let element = ref_ident(self.ctx, self.unit, at.target(), span);
        let key = self.ctx.module.interner.name(name).text;
        let key = self.ctx.string(key, span);
        let write = self.ctx.helper(channel_helper(chan), span);
        let callee = self.ctx.helper(Helper::BindProp, span);
        let call = self.ctx.call(
            callee,
            vec![
                Argument::from(scope),
                Argument::from(element),
                Argument::from(write),
                Argument::from(key),
                Argument::from(value),
            ],
            span,
        );
        Some(Statement::new_expression_statement(span, call, &self.ctx.ast))
    }

    /// One prop the analysis PROVED reactive, standing outside a group — which
    /// is what `-O0` emits, because the grouping pass is a flag. The effect is
    /// the compiler's either way: with no `setProp` there is no runtime left to
    /// own one, so a lone live prop is a fused record of one.
    fn set_live(
        &mut self,
        at: At<'_>,
        _name: NameId,
        _value: ExprId,
        _chan: Chan,
        _diff: Diff,
    ) -> Self::Out {
        Some(fused_effect(self.ctx, self.unit, &[at.patch], at.patch))
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
        slot: SlotId,
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
        let anchor_node = anchor.node();
        let anchor = anchor_node.map(|node| ref_ident(self.ctx, self.unit, node, span));
        // The string backend wrote this hole no boundary comments, so the claim
        // is the parent's whole child list rather than a delimited range. The
        // two backends make this decision from ONE predicate over ONE skeleton,
        // which is what keeps them from disagreeing about a wire format neither
        // of them can see the other half of.
        let whole = self.ctx.hole_owns_child_list(self.unit, at.target(), slot);
        // A LIVE hole is already a thunk, and `insert` runs it inside the claim
        // it made — nothing to wrap. Everything else is an expression JavaScript
        // evaluates before `insert` is entered, and a component call there would
        // claim its root before anything told it which hole it is in.
        let value = if self.ctx.hydratable && !matches!(plan, InsertPlan::Live) {
            let parent = ref_ident(self.ctx, self.unit, at.target(), span);
            let anchor = anchor_node.map(|node| ref_ident(self.ctx, self.unit, node, span));
            hole_call(self.ctx, parent, anchor, value, whole, span)
        } else {
            value
        };
        let callee = self.ctx.helper(Helper::Insert, span);
        let mut arguments =
            vec![Argument::from(scope), Argument::from(parent), Argument::from(value)];
        if whole {
            // Positional, and `whole` implies `Anchor::End` — a slot that owns
            // the child list has nothing after it to anchor against — so the
            // marker slot is spelled `null` rather than left off.
            let null = Expression::new_null_literal(span, &self.ctx.ast);
            arguments.push(Argument::from(anchor.unwrap_or(null)));
            arguments.push(Argument::from(number(self.ctx, WHOLE, span)));
        } else {
            arguments.extend(anchor.map(Argument::from));
        }
        let call = self.ctx.call(callee, arguments, span);
        Some(Statement::new_expression_statement(span, call, &self.ctx.ast))
    }

    /// K5 and K7. The construct is gone; what stands here is the primitive
    /// itself, taking the `(parent, anchor)` pair this unit's own walk produced
    /// and the flags the compiler proved. `anchor = null` means append.
    fn region(&mut self, at: At<'_>, slot: SlotId, anchor: Anchor, region: RegionId) -> Self::Out {
        let span = at.span();
        let parent = ref_ident(self.ctx, self.unit, at.target(), span);
        let anchor = anchor.node().map(|node| ref_ident(self.ctx, self.unit, node, span));
        let mut row = std::mem::replace(
            &mut self.unit.regions[region as usize],
            empty_region(self.ctx, span),
        );
        row.flags |= self.ctx.region_owns_child_list(self.unit, at.target(), slot);
        let call = region_call(self.ctx, row, Some((parent, anchor)), span);
        Some(Statement::new_expression_statement(span, call, &self.ctx.ast))
    }

    /// Target #7: a direct expando write, and the protocol is unchanged —
    /// `$$<type>` plus one `delegateEvents` call per module, never
    /// `addEventListener` for the delegated set. `delegatedEventHandler` reads
    /// `$$<type>` and accepts either a function or a `[fn, data]` tuple, so the
    /// tuple needs no second property (V2).
    ///
    /// The scope goes beside it in `$$s` — one expando per ELEMENT, not per type
    /// — so the dispatcher can route a throw to `scope.catcher` (E2 #6) instead
    /// of letting it escape to `window.onerror`.
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
        let write = Expression::new_assignment_expression(
            span,
            oxc::ast::ast::AssignmentOperator::Assign,
            target,
            handler,
            &self.ctx.ast,
        );
        if !self.owned.insert(at.target()) {
            return Some(Statement::new_expression_statement(span, write, &self.ctx.ast));
        }
        let element = ref_ident(self.ctx, self.unit, at.target(), span);
        let scope = self.ctx.scope(span);
        let owner = Expression::new_assignment_expression(
            span,
            oxc::ast::ast::AssignmentOperator::Assign,
            expando_target(self.ctx, element, "$$s", span),
            scope,
            &self.ctx.ast,
        );
        let pair = Expression::new_sequence_expression(
            span,
            ArenaVec::from_iter_in([write, owner], &self.ctx.allocator),
            &self.ctx.ast,
        );
        Some(Statement::new_expression_statement(span, pair, &self.ctx.ast))
    }

    /// B4: `addEventListener` paired with a cleanup on the scope that owns the
    /// element, so the listener dies with its position. E2 #6: a throw routes to
    /// the enclosing boundary. Both live in `listen`, so neither can be
    /// forgotten at a call site.
    fn listen(&mut self, at: At<'_>, event: NameId, handler: HandlerRef) -> Self::Out {
        let span = at.span();
        let scope = self.ctx.scope(span);
        let element = ref_ident(self.ctx, self.unit, at.target(), span);
        let key = self.ctx.module.interner.name(event).text;
        let key = self.ctx.string(key, span);
        let handler = handler_expression(self.ctx, self.unit, handler, span);
        let callee = self.ctx.helper(Helper::Listen, span);
        let call = self.ctx.call(
            callee,
            vec![
                Argument::from(scope),
                Argument::from(element),
                Argument::from(key),
                Argument::from(handler),
            ],
            span,
        );
        Some(Statement::new_expression_statement(span, call, &self.ctx.ast))
    }

    /// The type is resolved; the value is not provably a handler, so the
    /// runtime's own `isEventHandlerValue` test decides whether anything binds
    /// — exactly as the un-compiled path does. The delegated/direct split is
    /// still the compiler's, made from the resolved type.
    fn set_event(&mut self, at: At<'_>, event: NameId, value: ExprId) -> Self::Out {
        let span = at.span();
        let scope = self.ctx.scope(span);
        let element = ref_ident(self.ctx, self.unit, at.target(), span);
        let key = self.ctx.module.interner.name(event).text;
        let key = self.ctx.string(key, span);
        let value = take(self.ctx, self.unit, value, span);
        let callee = self.ctx.helper(Helper::BindEvent, span);
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
        Some(Statement::new_expression_statement(span, call, &self.ctx.ast))
    }

    /// §3.10's channel: the property a user edit lands on and the event that
    /// reports it, both decided at compile time from the tag and the `type`.
    fn bind(&mut self, at: At<'_>, prop: NameId, event: NameId, value: ExprId) -> Self::Out {
        let span = at.span();
        let scope = self.ctx.scope(span);
        let element = ref_ident(self.ctx, self.unit, at.target(), span);
        let prop = self.ctx.module.interner.name(prop).text;
        let prop = self.ctx.string(prop, span);
        let event = self.ctx.module.interner.name(event).text;
        let event = self.ctx.string(event, span);
        let value = take(self.ctx, self.unit, value, span);
        let callee = self.ctx.helper(Helper::BindValue, span);
        let call = self.ctx.call(
            callee,
            vec![
                Argument::from(scope),
                Argument::from(element),
                Argument::from(prop),
                Argument::from(event),
                Argument::from(value),
            ],
            span,
        );
        Some(Statement::new_expression_statement(span, call, &self.ctx.ast))
    }

    /// B3: `ref` is not a prop. A writable binding is an ASSIGNMENT — today's
    /// `setProp(el, "ref", el)` READS the variable and never writes it — and
    /// everything else is a scope-owned registration.
    fn set_ref(&mut self, at: At<'_>, value: ExprId, write: bool) -> Self::Out {
        let span = at.span();
        let element = ref_ident(self.ctx, self.unit, at.target(), span);
        let value = take(self.ctx, self.unit, value, span);
        if write {
            let assign = Expression::new_assignment_expression(
                span,
                oxc::ast::ast::AssignmentOperator::Assign,
                writable_target(value),
                element,
                &self.ctx.ast,
            );
            return Some(Statement::new_expression_statement(span, assign, &self.ctx.ast));
        }
        let scope = self.ctx.scope(span);
        let callee = self.ctx.helper(Helper::Ref, span);
        let call = self.ctx.call(
            callee,
            vec![Argument::from(scope), Argument::from(element), Argument::from(value)],
            span,
        );
        Some(Statement::new_expression_statement(span, call, &self.ctx.ast))
    }

    /// Target #4 and B2. Every live prop on one element computes into ONE flat
    /// record and applies by field comparison; a group of one needs no record at
    /// all, because its previous value is a scalar.
    fn effect_group(&mut self, at: At<'_>, _len: u16) -> Self::Out {
        Some(fused_effect(self.ctx, self.unit, at.members, at.patch))
    }

    // ── off the template path entirely ────────────────────────────────────
    //
    // P1 refuses to lower an element carrying a spread, so the whole subtree
    // goes through `createElement` and it never reaches a patch program the DOM
    // backend prints. Answering it is that decision written down, not a case
    // that fell through: there is no wildcard arm to fall through.

    fn spread(&mut self, _at: At<'_>, _value: ExprId, _live: bool) -> Self::Out {
        None
    }
}

/// The stand-in a claimed region leaves behind. A `Unit` is printed once, so
/// nothing reads this; it exists because the row is MOVED into the emitted call
/// and a vector cannot hold a hole.
pub(super) fn empty_region<'a>(ctx: &Emit<'a, '_>, span: Span) -> Region<'a> {
    Region {
        flow: crate::ir::Flow::Show,
        kind: RegionKind::Branch,
        flags: 0,
        span,
        key: None,
        body: Expression::new_null_literal(span, &ctx.ast),
        keyed: None,
        fallback: None,
        on: None,
    }
}

/// One region, as the primitive call `flow.ts` declares.
///
/// `site` is `Some` when a patch owns the region: the pair is the one the
/// template walk computed, and `None` for the anchor means append. It is `None`
/// when the construct stands free of any template — a whole root, a prop value,
/// a hole expression that is more than the construct — and then the primitive
/// gets `(null, null)` and returns the anchor for the caller to insert, which is
/// the path `siteFor` already had.
///
/// The trailing arguments are omitted wherever the runtime's own defaults say
/// the same thing, so a construct that proved nothing emits no `0`.
pub fn region_call<'a>(
    ctx: &mut Emit<'a, '_>,
    region: Region<'a>,
    site: Option<(Expression<'a>, Option<Expression<'a>>)>,
    span: Span,
) -> Expression<'a> {
    let Region { kind, flags, key, body, keyed, fallback, on, .. } = region;
    // The flags the compiler ADDS rather than proves.
    //
    // `HYDRATE` goes to BOTH backends from one option, which is what makes the
    // string backend's `<!--[-->` and the DOM backend's claim of it one decision
    // rather than two that have to agree. `WHOLE` rides the same integer for the
    // same reason: the two halves have to agree that a range wrote no comments.
    //
    // `DETECT` goes to the STRING backend alone, and that is not an asymmetry in
    // the ABI — it is where the asymmetry already is. The key is a byte on the
    // wire, so only the writer needs to be told; the reader finds it or does
    // not, and finding no key has always meant "claim positionally". The DOM
    // half's detection is threaded through `template()` instead, at the one call
    // that holds both trees. Sending the bit to a runtime with no reader for it
    // would be a flag with no row, which §8 deletes.
    let flags = flags
        | if ctx.hydratable { crate::ir::HYDRATE } else { 0 }
        | if ctx.detect && ctx.target == crate::codegen::Target::Ssr {
            crate::ir::DETECT
        } else {
            0
        };
    let flags = RegionKind::shipped(kind, flags);
    let (parent, anchor) = match site {
        Some((parent, anchor)) => (Some(parent), anchor),
        None => (None, None),
    };

    // `portal` takes no insertion pair at all: it returns a marker standing at
    // its LEXICAL position, and the surrounding tree is what places it.
    if kind == RegionKind::Portal {
        let scope = ctx.scope(span);
        let callee = ctx.helper(Helper::Portal, span);
        let mut arguments = vec![
            Argument::from(scope),
            Argument::from(key.expect("a portal always carries a target")),
            Argument::from(body),
        ];
        if flags != 0 {
            arguments.push(Argument::from(number(ctx, flags, span)));
        }
        let call = ctx.call(callee, arguments, span);
        let Some(parent) = parent else { return call };
        let scope = ctx.scope(span);
        let callee = ctx.helper(Helper::Insert, span);
        let mut arguments =
            vec![Argument::from(scope), Argument::from(parent), Argument::from(call)];
        arguments.extend(anchor.map(Argument::from));
        return ctx.call(callee, arguments, span);
    }

    let scope = ctx.scope(span);
    let parent = parent.unwrap_or_else(|| Expression::new_null_literal(span, &ctx.ast));
    let anchor = anchor.unwrap_or_else(|| Expression::new_null_literal(span, &ctx.ast));
    let mut arguments = vec![Argument::from(scope), Argument::from(parent), Argument::from(anchor)];

    let helper = match kind {
        RegionKind::Branch => Helper::Branch,
        RegionKind::Each => Helper::Each,
        RegionKind::Error | RegionKind::Loading => Helper::Boundary,
        RegionKind::Portal => unreachable!("handled above"),
    };
    let callee = ctx.helper(helper, span);

    // The tail after `(scope, parent, anchor)` is the primitive's own signature,
    // written out once per primitive so a wrong order is a wrong line here
    // rather than a wrong value at run time.
    let mut trailing: Vec<Option<Expression<'a>>> = Vec::new();
    match kind {
        RegionKind::Branch => {
            arguments.push(Argument::from(key.expect("a branch always carries a key")));
            arguments.push(Argument::from(body));
            trailing.push((flags != 0).then(|| number(ctx, flags, span)));
        }
        RegionKind::Each => {
            arguments.push(Argument::from(key.expect("an each always carries a source")));
            let keyed = keyed.unwrap_or_else(|| Expression::new_null_literal(span, &ctx.ast));
            arguments.push(Argument::from(keyed));
            arguments.push(Argument::from(body));
            // `flags` is positional and `fallback` follows it, so a fallback
            // forces the zero `each` never reads — and so does `HYDRATE`, which
            // `each` DOES read: it is the primitive, not the compiler, that
            // knows how many rows it wrote.
            let needed = fallback.is_some() || flags & crate::ir::HYDRATE != 0;
            trailing.push(needed.then(|| number(ctx, flags, span)));
            trailing.push(fallback);
        }
        RegionKind::Error | RegionKind::Loading => {
            let name = if kind == RegionKind::Error { "error" } else { "loading" };
            arguments.push(Argument::from(ctx.string(name, span)));
            let fallback = fallback.unwrap_or_else(|| Expression::new_null_literal(span, &ctx.ast));
            arguments.push(Argument::from(fallback));
            arguments.push(Argument::from(body));
            let needed = on.is_some() || flags & crate::ir::HYDRATE != 0;
            trailing.push(needed.then(|| number(ctx, flags, span)));
            trailing.push(on);
        }
        RegionKind::Portal => unreachable!("handled above"),
    }
    // A trailing argument only survives if something after it does, which is
    // what keeps `_$branch(_s$, _el$1, null, k, b)` from growing a `, 0`.
    while matches!(trailing.last(), Some(None)) {
        trailing.pop();
    }
    for value in trailing {
        let value = value.unwrap_or_else(|| Expression::new_null_literal(span, &ctx.ast));
        arguments.push(Argument::from(value));
    }
    ctx.call(callee, arguments, span)
}

/// `_$hole(parent, anchor, () => value)` — the claim, made where the address is
/// known, around the expression that fills it.
fn hole_call<'a>(
    ctx: &mut Emit<'a, '_>,
    parent: Expression<'a>,
    anchor: Option<Expression<'a>>,
    value: Expression<'a>,
    whole: bool,
    span: Span,
) -> Expression<'a> {
    let anchor = anchor.unwrap_or_else(|| Expression::new_null_literal(span, &ctx.ast));
    let params = FormalParameters::boxed(
        span,
        FormalParameterKind::ArrowFormalParameters,
        ArenaVec::new_in(&ctx.allocator),
        None,
        &ctx.ast,
    );
    let build = Expression::new_arrow_function_expression(
        span,
        false,
        None,
        params,
        None,
        ArrowFunctionBody::from(value),
        &ctx.ast,
    );
    let callee = ctx.helper(Helper::Hole, span);
    let mut arguments = vec![Argument::from(parent), Argument::from(anchor), Argument::from(build)];
    if whole {
        arguments.push(Argument::from(number(ctx, WHOLE, span)));
    }
    ctx.call(callee, arguments, span)
}

fn number<'a>(ctx: &Emit<'a, '_>, value: u8, span: Span) -> Expression<'a> {
    Expression::new_numeric_literal(
        span,
        f64::from(value),
        None,
        oxc::ast::ast::NumberBase::Decimal,
        &ctx.ast,
    )
}

/// The assignment target `ref={binding}` writes into. P1 only sets `write` for
/// an identifier that resolves to a mutable binding, so nothing else reaches
/// here.
fn writable_target(value: Expression<'_>) -> AssignmentTarget<'_> {
    match value {
        Expression::Identifier(identifier) => {
            AssignmentTarget::AssignmentTargetIdentifier(identifier)
        }
        _ => unreachable!("P1 proves the binding is writable before setting `write`"),
    }
}

/// B2 — the fused compute/apply record (`CODESIGN.md` §3.5).
///
/// ```js
/// _$bindEffect(_s$, () => ({ a: cls(), b: id() }), (_v$, _p$ = {}) => {
///   _v$.a = _$setClass(_el$1, "class", _v$.a, _p$.a);
///   if (_v$.b !== _p$.b) _$setAttr(_el$1, "id", _v$.b);
/// });
/// ```
///
/// Three properties, and each of them is why the shape is this one:
///
/// - **the apply CANNOT SUBSCRIBE.** `recompute` runs it with `tracking` off, so
///   a DOM read there — `offsetWidth`, `namespaceURI`, `classList` — can never
///   become a dependency (R2). That is structural: there is no discipline to
///   keep, because the second argument is not a tracking scope.
/// - **the prev store is the compute's own return.** Nothing is allocated by the
///   runtime and no expando is stamped on the element; the record IS the
///   accumulator, and a channel whose applied form differs from its input
///   (`Diff::Thread`) writes that form back into the same slot.
/// - **the apply is independently schedulable**, because it is a separate
///   function reached with a value rather than a suffix of the compute.
///
/// A fused effect must never return a FUNCTION: a one-argument effect registers
/// its return as the cleanup. Returning the record is what makes that
/// unrepresentable — an object literal is not callable, and the write half no
/// longer sits in the returning position at all.
fn fused_effect<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    members: &[Patch],
    header: Patch,
) -> Statement<'a> {
    let span = header.span;
    let value = ctx.module.uids.temp();
    let prev = ctx.module.uids.prev();

    let rows: Vec<(Patch, NameId, ExprId, Chan, Diff)> = members
        .iter()
        .filter_map(|patch| match patch.op {
            Op::SetLive { name, value, chan, diff } => Some((*patch, name, value, chan, diff)),
            _ => None,
        })
        .collect();

    // One prop whose applied form IS its value needs no record: the previous
    // value is a scalar and the compute returns it directly.
    if let [(patch, name, one, chan, diff)] = rows[..]
        && diff != Diff::Thread
    {
        let read = value_expression(ctx, unit, one, patch.span);
        let compute = arrow(ctx, no_params(ctx, span), ArrowFunctionBody::from(read), span);
        let held = ctx.ident(value, patch.span);
        let write = channel_write(ctx, unit, patch, name, chan, vec![held], patch.span);
        let (body, params) = match diff {
            Diff::Identity => {
                let mine = ctx.ident(value, patch.span);
                let theirs = ctx.ident(prev, patch.span);
                let test = Expression::new_binary_expression(
                    patch.span,
                    mine,
                    oxc::ast::ast::BinaryOperator::StrictInequality,
                    theirs,
                    &ctx.ast,
                );
                (
                    vec![Statement::new_if_statement(patch.span, test, write, None, &ctx.ast)],
                    apply_params(ctx, value, Some((prev, false)), span),
                )
            }
            _ => (vec![write], apply_params(ctx, value, None, span)),
        };
        let apply = arrow(ctx, params, block(ctx, body, span), span);
        return effect_call(ctx, compute, apply, span);
    }

    let mut properties: Vec<oxc::ast::ast::ObjectPropertyKind<'a>> = Vec::with_capacity(rows.len());
    let mut body: Vec<Statement<'a>> = Vec::with_capacity(rows.len());
    let mut reads_prev = false;

    for (index, (patch, name, one, chan, diff)) in rows.iter().copied().enumerate() {
        let key = slot_key(index, ctx.allocator);
        let read = value_expression(ctx, unit, one, patch.span);
        properties.push(property(ctx, key, read, patch.span));

        let mine = ctx.member(ctx.ident(value, patch.span), key, patch.span);
        match diff {
            // `v.a = chan(el, "class", v.a, p.a)`. The guard is INSIDE the
            // channel because only the channel knows what "unchanged" means for
            // a class map or a css object, and the applied form it hands back is
            // what the next run must compare against.
            Diff::Thread => {
                reads_prev = true;
                let theirs = ctx.member(ctx.ident(prev, patch.span), key, patch.span);
                let call = channel_call(ctx, unit, patch, name, chan, vec![mine, theirs]);
                let target = ctx.member(ctx.ident(value, patch.span), key, patch.span);
                let store = Expression::new_assignment_expression(
                    patch.span,
                    oxc::ast::ast::AssignmentOperator::Assign,
                    assignment_target(target),
                    call,
                    &ctx.ast,
                );
                body.push(Statement::new_expression_statement(patch.span, store, &ctx.ast));
            }
            Diff::Identity => {
                reads_prev = true;
                let theirs = ctx.member(ctx.ident(prev, patch.span), key, patch.span);
                let test = Expression::new_binary_expression(
                    patch.span,
                    mine,
                    oxc::ast::ast::BinaryOperator::StrictInequality,
                    theirs,
                    &ctx.ast,
                );
                let held = ctx.member(ctx.ident(value, patch.span), key, patch.span);
                let write = channel_write(ctx, unit, patch, name, chan, vec![held], patch.span);
                body.push(Statement::new_if_statement(patch.span, test, write, None, &ctx.ast));
            }
            // An object may be mutated in place, so its identity says nothing:
            // write every run and compare against nothing.
            Diff::Always => {
                let write = channel_write(ctx, unit, patch, name, chan, vec![mine], patch.span);
                body.push(write);
            }
        }
    }

    let record = Expression::new_object_expression(
        span,
        ArenaVec::from_iter_in(properties, &ctx.allocator),
        &ctx.ast,
    );
    let compute = arrow(ctx, no_params(ctx, span), ArrowFunctionBody::from(record), span);
    let params = apply_params(ctx, value, reads_prev.then_some((prev, true)), span);
    let apply = arrow(ctx, params, block(ctx, body, span), span);
    effect_call(ctx, compute, apply, span)
}

/// The record's field names are POSITIONAL, not the attribute names. Two props
/// on one element cannot collide, the emitted bytes do not grow with the name,
/// and `__proto__` — which as an object-literal key would set the prototype
/// rather than create a slot — is not a case that has to be excluded.
fn slot_key(index: usize, allocator: &Allocator) -> &str {
    let mut out = String::with_capacity(2);
    let mut index = index;
    loop {
        out.insert(0, (b'a' + (index % 26) as u8) as char);
        if index < 26 {
            break;
        }
        index = index / 26 - 1;
    }
    allocator.alloc_str(&out)
}

fn property<'a>(
    ctx: &Emit<'a, '_>,
    key: &'a str,
    value: Expression<'a>,
    span: Span,
) -> oxc::ast::ast::ObjectPropertyKind<'a> {
    let key = oxc::ast::ast::PropertyKey::StaticIdentifier(ArenaBox::new_in(
        IdentifierName::new(span, key, &ctx.ast),
        &ctx.allocator,
    ));
    oxc::ast::ast::ObjectPropertyKind::ObjectProperty(ArenaBox::new_in(
        oxc::ast::ast::ObjectProperty::new(
            span,
            oxc::ast::ast::PropertyKind::Init,
            key,
            value,
            false,
            false,
            false,
            &ctx.ast,
        ),
        &ctx.allocator,
    ))
}

/// `_$setAttr(_el$1, "id", …)` — the resolved channel, with the arguments after
/// the name supplied by the caller.
fn channel_call<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    patch: Patch,
    name: NameId,
    chan: Chan,
    rest: Vec<Expression<'a>>,
) -> Expression<'a> {
    let element = ref_ident(ctx, unit, patch.target, patch.span);
    let key = ctx.module.interner.name(name).text;
    let key = ctx.string(key, patch.span);
    let callee = ctx.helper(channel_helper(chan), patch.span);
    let mut arguments = vec![Argument::from(element), Argument::from(key)];
    arguments.extend(rest.into_iter().map(Argument::from));
    ctx.call(callee, arguments, patch.span)
}

fn channel_write<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    patch: Patch,
    name: NameId,
    chan: Chan,
    rest: Vec<Expression<'a>>,
    span: Span,
) -> Statement<'a> {
    let call = channel_call(ctx, unit, patch, name, chan, rest);
    Statement::new_expression_statement(span, call, &ctx.ast)
}

fn effect_call<'a>(
    ctx: &mut Emit<'a, '_>,
    compute: Expression<'a>,
    apply: Expression<'a>,
    span: Span,
) -> Statement<'a> {
    let callee = ctx.helper(Helper::BindEffect, span);
    let scope = ctx.scope(span);
    let call = ctx.call(
        callee,
        vec![Argument::from(scope), Argument::from(compute), Argument::from(apply)],
        span,
    );
    Statement::new_expression_statement(span, call, &ctx.ast)
}

fn arrow<'a>(
    ctx: &Emit<'a, '_>,
    params: ArenaBox<'a, FormalParameters<'a>>,
    body: ArrowFunctionBody<'a>,
    span: Span,
) -> Expression<'a> {
    Expression::new_arrow_function_expression(span, false, None, params, None, body, &ctx.ast)
}

fn block<'a>(
    ctx: &Emit<'a, '_>,
    statements: Vec<Statement<'a>>,
    span: Span,
) -> ArrowFunctionBody<'a> {
    ArrowFunctionBody::new_function_body(
        span,
        ArenaVec::new_in(&ctx.allocator),
        ArenaVec::from_iter_in(statements, &ctx.allocator),
        &ctx.ast,
    )
}

fn no_params<'a>(ctx: &Emit<'a, '_>, span: Span) -> ArenaBox<'a, FormalParameters<'a>> {
    FormalParameters::boxed(
        span,
        FormalParameterKind::ArrowFormalParameters,
        ArenaVec::new_in(&ctx.allocator),
        None,
        &ctx.ast,
    )
}

/// `(_v$)` or `(_v$, _p$)` or `(_v$, _p$ = {})`. The default is what makes the
/// FIRST apply see an empty record rather than `undefined`; a scalar prev needs
/// none, because comparing against `undefined` is exactly the first-run write.
fn apply_params<'a>(
    ctx: &Emit<'a, '_>,
    value: &'a str,
    prev: Option<(&'a str, bool)>,
    span: Span,
) -> ArenaBox<'a, FormalParameters<'a>> {
    let mut parameters = Vec::with_capacity(2);
    parameters.push(parameter(
        ctx,
        BindingPattern::new_binding_identifier(span, value, &ctx.ast),
        span,
    ));
    if let Some((name, empty)) = prev {
        let mut pattern = BindingPattern::new_binding_identifier(span, name, &ctx.ast);
        if empty {
            let record =
                Expression::new_object_expression(span, ArenaVec::new_in(&ctx.allocator), &ctx.ast);
            pattern = BindingPattern::new_assignment_pattern(span, pattern, record, &ctx.ast);
        }
        parameters.push(parameter(ctx, pattern, span));
    }
    FormalParameters::boxed(
        span,
        FormalParameterKind::ArrowFormalParameters,
        ArenaVec::from_iter_in(parameters, &ctx.allocator),
        None,
        &ctx.ast,
    )
}

fn parameter<'a>(
    ctx: &Emit<'a, '_>,
    pattern: BindingPattern<'a>,
    span: Span,
) -> oxc::ast::ast::FormalParameter<'a> {
    oxc::ast::ast::FormalParameter::new(
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
    )
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

fn walk<'a>(ctx: &mut Emit<'a, '_>, unit: &Unit<'a>, def: &RefDef) -> Expression<'a> {
    let (base, descend, property, hops) = match def.step {
        Step::Root => unreachable!("handled by the caller"),
        Step::FirstChild(base, hops) => (base, Some("firstChild"), "nextSibling", hops),
        Step::LastChild(base, hops) => (base, Some("lastChild"), "previousSibling", hops),
        Step::NextSibling(base, hops) => (base, None, "nextSibling", hops),
        Step::PrevSibling(base, hops) => (base, None, "previousSibling", hops),
    };
    let object = ctx.ident(ctx.module.interner.str(unit.refs.def(base).name), def.span);
    if ctx.hydratable {
        return logical_walk(ctx, object, def, descend, property, hops);
    }
    let mut expression = object;
    if let Some(descend) = descend {
        expression = ctx.member(expression, descend, def.span);
    }
    for _ in 0..hops {
        expression = ctx.member(expression, property, def.span);
    }
    expression
}

/// H3's `child(n, 3)`, and the reason it cannot be `.firstChild` repeated.
///
/// The server's child list is the template's skeleton with a `<!--[-->` …
/// `<!--]-->` range spliced in at every hole, and a native sibling step counts
/// every node in that range. A LOGICAL step counts the range as nothing, so the
/// same index that addresses the template addresses the server's document — the
/// one property that lets the walk the client already runs claim rather than
/// build.
///
/// One helper per axis, and the direction is a third argument rather than a
/// sign: `child(el, 2)` is the third logical child, `child(el, 0, 1)` the last,
/// `sib(el, 1, 1)` one logical sibling BACK. The walk pass already chose the
/// direction; this only spells it.
fn logical_walk<'a>(
    ctx: &mut Emit<'a, '_>,
    object: Expression<'a>,
    def: &RefDef,
    descend: Option<&str>,
    property: &str,
    hops: u32,
) -> Expression<'a> {
    let backwards = property == "previousSibling";
    let helper = if descend.is_some() { Helper::Child } else { Helper::Sib };
    let callee = ctx.helper(helper, def.span);
    let hops = u8::try_from(hops).expect("a template with 256 siblings to step over is not a walk");
    let mut arguments = vec![Argument::from(object), Argument::from(number(ctx, hops, def.span))];
    if backwards {
        arguments.push(Argument::from(number(ctx, 1, def.span)));
    }
    ctx.call(callee, arguments, def.span)
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
