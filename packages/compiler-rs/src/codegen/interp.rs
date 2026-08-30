//! The reference backend.
//!
//! It serialises the analysed IR beside the module and lets a small JS
//! interpreter (`@barqjs/core/interp`) walk it. The property the whole layer
//! rests on is that it reads the **same analysed IR** the DOM backend reads:
//! the same anchors P5 chose, the same template bytes P7 wrote, the same ref
//! plan P6 addressed, the same patch program in the same order. "The compiler
//! knows more than the reference" is therefore not a thing that can be true,
//! and there is no O4-style divergence to buy back with per-fixture slack.
//!
//! What is emitted, per unit:
//!
//! ```js
//! const _ir$1 = [_tmpl$1, [["root", null, 0], ["firstChild", 0, 1]], [
//!   ["insert", 1, 0, "live", null],
//! ]];
//! export default function App() {
//!   return _$interp(_s$, _ir$1, [() => count()]);
//! }
//! ```
//!
//! Two halves, and the split is the point. The descriptor is a module-scope
//! constant because the IR is a constant — it holds opcodes, ref indices and
//! slot indices, and nothing that could close over a component's scope. The
//! **slots** are the expressions, which can only be JavaScript: an `ExprId`
//! names a parsed node that reads the user's bindings, so the only faithful
//! serialisation of one is a closure over the site it was written at.
//!
//! Every slot is a nullary function returning the value its use site resolves
//! to, which is what collapses the interpreter's rule for reading one to a
//! single line: a live binding hands the function on (the runtime sees a
//! function and owns the effect, exactly as `setProp`/`insert` do for the DOM
//! backend's thunk), and everything else calls it at the point the patch runs.
//! Evaluation order is therefore the patch program's order, on both backends.
//!
//! Opcodes are spelled with the `Backend` method's own name rather than an
//! index, so the two sides cannot drift by renumbering; `interp.test.ts` checks
//! the name sets against `codegen::backend::OPS` in both directions.

use oxc::allocator::Vec as ArenaVec;
use oxc::ast::ast::{
    ArrayExpressionElement, ArrowFunctionBody, BindingPattern, Expression, FormalParameterKind,
    FormalParameters, NumberBase, Statement, VariableDeclarationKind, VariableDeclarator,
};
use oxc::span::Span;

use crate::codegen::backend::{At, Backend, lower};
use crate::codegen::{Emit, Helper};
use crate::ir::{
    Anchor, Chan, Diff, ExprId, HandlerRef, InsertPlan, NameId, NodeId, Op, Patch, RegionId,
    SlotId, Step, Unit, UnitId,
};

/// One unit becomes a module-scope descriptor plus one `_$interp` call.
pub fn emit_unit<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    id: UnitId,
    span: Span,
) -> Expression<'a> {
    let mut slots: Vec<Expression<'a>> = Vec::new();
    let mut ops: Vec<Expression<'a>> = Vec::new();
    let mut sources: Vec<(&'a str, Expression<'a>)> = Vec::new();

    // The driver, and the one thing the `Backend` trait deliberately does not
    // cover: program order, one pass, group members read off the records that
    // follow their header — the same traversal `dom.rs` performs, because the
    // patch program is the same program.
    let mut index = 0;
    while index < unit.patch.len() {
        let patch = unit.patch[index];
        index += 1;
        let members: Vec<Patch> = match patch.op {
            Op::EffectGroup { len } => {
                let end = (index + len as usize).min(unit.patch.len());
                let members = unit.patch[index..end].to_vec();
                index = end;
                members
            }
            _ => Vec::new(),
        };
        let mut backend = Interp { ctx, unit, slots: &mut slots, sources: &mut sources };
        if let Some(record) = lower(&mut backend, At { patch, members: &members }) {
            ops.push(record);
        }
    }

    let clone = ctx.ident(ctx.template_name(unit.template), span);
    let refs = refs_of(ctx, unit, span);
    let descriptor = array(ctx, vec![clone, refs, array(ctx, ops, span)], span);

    let name = ctx.module.uids.ir(id, ctx.allocator);
    ctx.interp_units.push(binding(ctx, name, descriptor, span));

    let scope = ctx.scope(span);
    let callee = ctx.helper(Helper::Interp, span);
    // Innermost first, so the lists evaluate in region order — the same order
    // the other two backends evaluate them in.
    let mut values = array(ctx, slots, span);
    for (binding, list) in sources.into_iter().rev() {
        values = crate::codegen::dom::bind_sources(ctx, Some((binding, list)), values, span);
    }
    let arguments = vec![
        oxc::ast::ast::Argument::from(scope),
        oxc::ast::ast::Argument::from(ctx.ident(name, span)),
        oxc::ast::ast::Argument::from(values),
    ];
    ctx.call(callee, arguments, span)
}

/// P6's plan, verbatim: `[step, base, hops]` per binding, in emission order, so
/// index == `RefId` and every `base` is an index already resolved.
fn refs_of<'a>(ctx: &Emit<'a, '_>, unit: &Unit<'a>, span: Span) -> Expression<'a> {
    let rows = unit
        .refs
        .defs
        .iter()
        .map(|def| {
            let (kind, base, hops) = match def.step {
                Step::Root => ("root", None, 0),
                Step::FirstChild(base, hops) => ("firstChild", Some(base), hops),
                Step::LastChild(base, hops) => ("lastChild", Some(base), hops),
                Step::NextSibling(base, hops) => ("nextSibling", Some(base), hops),
                Step::PrevSibling(base, hops) => ("prevSibling", Some(base), hops),
            };
            let base = match base {
                Some(base) => number(ctx, base, span),
                None => Expression::new_null_literal(span, &ctx.ast),
            };
            array(ctx, vec![text(ctx, kind, span), base, number(ctx, hops, span)], span)
        })
        .collect();
    array(ctx, rows, span)
}

/// P8c's `Backend`. Every op lowers to at most one record, appended to the
/// unit's program in the order the patches run.
///
/// The one op with no record — `Spread` — is the op P1 refuses to put on the
/// template path at all, so the element carrying one reaches the DOM through
/// `createElement` on this backend for the same reason and by the same route it
/// does on the DOM backend. Answering `None` for it is that decision written
/// down, not a case that fell through: there is no wildcard arm to fall through.
struct Interp<'a, 'e, 'm, 'u, 's> {
    ctx: &'e mut Emit<'a, 'm>,
    unit: &'u mut Unit<'a>,
    slots: &'s mut Vec<Expression<'a>>,
    /// The spread source lists this unit's regions read their props off, in
    /// region order. The DOM and string backends bind one around each primitive
    /// CALL; there is no call here — a region is a data record and its arguments
    /// are slots — so the bindings go around the SLOT ARRAY instead, which is
    /// the one expression every slot is inside and is built exactly once.
    sources: &'s mut Vec<(&'a str, Expression<'a>)>,
}

impl<'a> Interp<'a, '_, '_, '_, '_> {
    /// The binding the DOM backend would have named `_el$N`, as its index.
    fn node(&self, node: NodeId, span: Span) -> Expression<'a> {
        let id = self.unit.refs.ref_of(node).expect("every addressed node is in the ref plan");
        number(self.ctx, id, span)
    }

    /// A slot that yields the expression's own value. `SetOnce` and `SetOpaque`
    /// hand the value to `setProp` unwrapped, so the closure is the whole of the
    /// serialisation.
    fn once(&mut self, value: ExprId, span: Span) -> Expression<'a> {
        let expression = crate::codegen::dom::take(self.ctx, self.unit, value, span);
        self.push(nullary(self.ctx, expression, span), span)
    }

    /// A slot that yields the value a LIVE binding resolves to. It is built by
    /// the DOM backend's own thunk rule — an author's `() => …` is handed on
    /// rather than wrapped, and η-reduction still applies — because the two
    /// backends must read the same expression the same number of times.
    fn read(&mut self, value: ExprId, span: Span) -> Expression<'a> {
        let expression = crate::codegen::dom::thunk(self.ctx, self.unit, value, span);
        self.push(expression, span)
    }

    fn handler(&mut self, handler: HandlerRef, span: Span) -> Expression<'a> {
        let expression =
            crate::codegen::dom::handler_expression(self.ctx, self.unit, handler, span);
        self.push(nullary(self.ctx, expression, span), span)
    }

    /// A slot holding an expression VERBATIM, for the region arguments the
    /// interpreter passes on rather than reads. `None` becomes a `null` field,
    /// which is how an absent `fallback`, `keyOf` or `on` is spelled.
    fn verbatim(&mut self, value: Option<Expression<'a>>, span: Span) -> Expression<'a> {
        match value {
            Some(value) => self.push(value, span),
            None => Expression::new_null_literal(span, &self.ctx.ast),
        }
    }

    fn raw(&mut self, value: Expression<'a>, span: Span) -> Expression<'a> {
        self.push(value, span)
    }

    fn push(&mut self, slot: Expression<'a>, span: Span) -> Expression<'a> {
        let index = self.slots.len() as u32;
        self.slots.push(slot);
        number(self.ctx, index, span)
    }

    fn key(&self, name: NameId, span: Span) -> Expression<'a> {
        let key = self.ctx.module.interner.name(name).text;
        self.ctx.string(key, span)
    }

    fn record(&self, op: &'static str, fields: Vec<Expression<'a>>, span: Span) -> Expression<'a> {
        let mut elements = Vec::with_capacity(fields.len() + 1);
        elements.push(text(self.ctx, op, span));
        elements.extend(fields);
        array(self.ctx, elements, span)
    }
}

impl<'a> Backend<'a> for Interp<'a, '_, '_, '_, '_> {
    type Out = Option<Expression<'a>>;

    fn set_once(&mut self, at: At<'_>, name: NameId, value: ExprId, chan: Chan) -> Self::Out {
        let span = at.span();
        let (node, key) = (self.node(at.target(), span), self.key(name, span));
        let slot = self.once(value, span);
        let chan = text(self.ctx, chan_name(chan), span);
        Some(self.record("setOnce", vec![node, key, slot, chan], span))
    }

    fn set_opaque(&mut self, at: At<'_>, name: NameId, value: ExprId, chan: Chan) -> Self::Out {
        let span = at.span();
        let (node, key) = (self.node(at.target(), span), self.key(name, span));
        let slot = self.once(value, span);
        let chan = text(self.ctx, chan_name(chan), span);
        Some(self.record("setOpaque", vec![node, key, slot, chan], span))
    }

    fn set_live(
        &mut self,
        at: At<'_>,
        name: NameId,
        value: ExprId,
        chan: Chan,
        diff: Diff,
    ) -> Self::Out {
        let span = at.span();
        let (node, key) = (self.node(at.target(), span), self.key(name, span));
        let slot = self.read(value, span);
        let diff = text(
            self.ctx,
            match diff {
                Diff::Identity => "identity",
                Diff::Always => "always",
                Diff::Thread => "thread",
            },
            span,
        );
        let chan = text(self.ctx, chan_name(chan), span);
        Some(self.record("setLive", vec![node, key, slot, diff, chan], span))
    }

    /// The resolved type with a value the compiler could not prove is a handler.
    fn set_event(&mut self, at: At<'_>, event: NameId, value: ExprId) -> Self::Out {
        let span = at.span();
        let (node, key) = (self.node(at.target(), span), self.key(event, span));
        let slot = self.once(value, span);
        Some(self.record("setEvent", vec![node, key, slot], span))
    }

    /// A writable binding cannot be READ back through a nullary slot, so the
    /// assignment itself is what the slot holds: the interpreter calls it with
    /// the element instead of calling `ref` with a value.
    fn form_action(&mut self, at: At<'_>, value: ExprId) -> Self::Out {
        let span = at.span();
        let node = self.node(at.target(), span);
        let slot = self.once(value, span);
        Some(self.record("formAction", vec![node, slot], span))
    }

    fn set_ref(&mut self, at: At<'_>, value: ExprId, write: bool) -> Self::Out {
        let span = at.span();
        let node = self.node(at.target(), span);
        let expression = crate::codegen::dom::take(self.ctx, self.unit, value, span);
        let (slot, kind) = if write {
            (unary(self.ctx, expression, span), "assign")
        } else {
            (nullary(self.ctx, expression, span), "apply")
        };
        let slot = self.raw(slot, span);
        let kind = text(self.ctx, kind, span);
        Some(self.record("ref", vec![node, slot, kind], span))
    }

    fn bind(&mut self, at: At<'_>, prop: NameId, event: NameId, value: ExprId) -> Self::Out {
        let span = at.span();
        let node = self.node(at.target(), span);
        let (prop, event) = (self.key(prop, span), self.key(event, span));
        let expression = crate::codegen::dom::take(self.ctx, self.unit, value, span);
        let slot = self.raw(expression, span);
        Some(self.record("bind", vec![node, prop, event, slot], span))
    }

    fn insert(
        &mut self,
        at: At<'_>,
        _slot: SlotId,
        anchor: Anchor,
        value: ExprId,
        plan: InsertPlan,
    ) -> Self::Out {
        let span = at.span();
        let parent = self.node(at.target(), span);
        let slot = match plan {
            InsertPlan::Live => self.read(value, span),
            InsertPlan::Once | InsertPlan::Opaque => self.once(value, span),
        };
        let plan = text(
            self.ctx,
            match plan {
                InsertPlan::Once => "once",
                InsertPlan::Live => "live",
                InsertPlan::Opaque => "opaque",
            },
            span,
        );
        let anchor = match anchor.node() {
            Some(node) => self.node(node, span),
            None => Expression::new_null_literal(span, &self.ctx.ast),
        };
        Some(self.record("insert", vec![parent, slot, plan, anchor], span))
    }

    /// A control-flow region, as data. Every argument the primitive takes is a
    /// slot holding the expression VERBATIM — a key Cell, a body Block, a body
    /// table — because all of them are already functions or arrays and the
    /// interpreter passes them on rather than reading them. The two backends
    /// therefore hand the same four primitives the same arguments, built at the
    /// same point of the same construction.
    fn region(&mut self, at: At<'_>, _slot: SlotId, anchor: Anchor, region: RegionId) -> Self::Out {
        let span = at.span();
        let parent = self.node(at.target(), span);
        let anchor = match anchor.node() {
            Some(node) => self.node(node, span),
            None => Expression::new_null_literal(span, &self.ctx.ast),
        };
        let row = std::mem::replace(
            &mut self.unit.regions[region as usize],
            crate::codegen::dom::empty_region(self.ctx, span),
        );
        let kind = text_of(self.ctx, row.kind.as_str(), span);
        let flags = number(self.ctx, u32::from(row.emitted_flags()), span);
        if let Some(sources) = row.sources {
            self.sources.push(sources);
        }
        let key = self.verbatim(row.key, span);
        let body = self.raw(row.body, span);
        let keyed = self.verbatim(row.keyed, span);
        let fallback = self.verbatim(row.fallback, span);
        let on = self.verbatim(row.on, span);
        Some(self.record(
            "region",
            vec![parent, anchor, kind, key, body, keyed, fallback, on, flags],
            span,
        ))
    }

    /// `el.$$click = h`. The tuple form lives inside the handler expression, so
    /// `data` is carried by the IR and read by neither backend (V2).
    fn delegate(
        &mut self,
        at: At<'_>,
        event: NameId,
        handler: HandlerRef,
        _data: Option<ExprId>,
    ) -> Self::Out {
        let span = at.span();
        let node = self.node(at.target(), span);
        let key = self.ctx.module.interner.name(event).text;
        let key = self.ctx.allocator.alloc_str(&format!("$${key}")) as &'a str;
        let key = self.ctx.string(key, span);
        let slot = self.handler(handler, span);
        Some(self.record("delegate", vec![node, key, slot], span))
    }

    fn listen(&mut self, at: At<'_>, event: NameId, handler: HandlerRef) -> Self::Out {
        let span = at.span();
        let (node, key) = (self.node(at.target(), span), self.key(event, span));
        let slot = self.handler(handler, span);
        Some(self.record("listen", vec![node, key, slot], span))
    }

    /// A group of one lowers to the member's own record, which is the cheaper
    /// thunk form the DOM backend also falls back to: same effect count, one
    /// fewer level of nesting, and the runtime keeps the `prev` instead of the
    /// interpreter.
    fn effect_group(&mut self, at: At<'_>, _len: u16) -> Self::Out {
        if at.members.len() == 1
            && let Some(record) = lower(self, At::one(at.members[0]))
        {
            return Some(record);
        }
        let members: Vec<Expression<'a>> = at
            .members
            .iter()
            .filter(|patch| matches!(patch.op, Op::SetLive { .. }))
            .filter_map(|patch| lower(self, At::one(*patch)))
            .collect();
        let span = at.span();
        let members = array(self.ctx, members, span);
        Some(self.record("effectGroup", vec![members], span))
    }

    /// The one channel whose names are runtime data. `live` decides whether the
    /// interpreter re-reads the source, exactly as it decides whether the DOM
    /// backend hands `spread` a thunk.
    fn spread(&mut self, at: At<'_>, value: ExprId, live: bool) -> Self::Out {
        let span = at.span();
        let node = self.node(at.target(), span);
        let slot = if live { self.read(value, span) } else { self.once(value, span) };
        let live = Expression::new_boolean_literal(span, live, &self.ctx.ast);
        Some(self.record("spread", vec![node, slot, live], span))
    }
}

fn nullary<'a>(ctx: &Emit<'a, '_>, body: Expression<'a>, span: Span) -> Expression<'a> {
    let params = FormalParameters::boxed(
        span,
        FormalParameterKind::ArrowFormalParameters,
        ArenaVec::new_in(&ctx.allocator),
        None,
        &ctx.ast,
    );
    Expression::new_arrow_function_expression(
        span,
        false,
        None,
        params,
        None,
        ArrowFunctionBody::from(body),
        &ctx.ast,
    )
}

/// `(_v$) => (binding = _v$)` — the ONE slot shape that is written rather than
/// read. `ref={binding}` with a writable binding is an assignment (B3), and an
/// assignment cannot be serialised as a value.
fn unary<'a>(ctx: &mut Emit<'a, '_>, target: Expression<'a>, span: Span) -> Expression<'a> {
    let name = ctx.module.uids.value(ctx.allocator);
    let pattern = BindingPattern::new_binding_identifier(span, name, &ctx.ast);
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
    let params = FormalParameters::boxed(
        span,
        FormalParameterKind::ArrowFormalParameters,
        ArenaVec::from_iter_in([parameter], &ctx.allocator),
        None,
        &ctx.ast,
    );
    let assign = Expression::new_assignment_expression(
        span,
        oxc::ast::ast::AssignmentOperator::Assign,
        match target {
            Expression::Identifier(identifier) => {
                oxc::ast::ast::AssignmentTarget::AssignmentTargetIdentifier(identifier)
            }
            _ => unreachable!("P1 proves the binding is writable before setting `write`"),
        },
        ctx.ident(name, span),
        &ctx.ast,
    );
    Expression::new_arrow_function_expression(
        span,
        false,
        None,
        params,
        None,
        ArrowFunctionBody::from(assign),
        &ctx.ast,
    )
}

/// The channel name, spelled the same way on both sides so the reference
/// backend cannot resolve a name differently from the DOM backend.
fn chan_name(chan: Chan) -> &'static str {
    match chan {
        Chan::Attr => "attr",
        Chan::Prop => "prop",
        Chan::Live => "live",
        Chan::Bool => "bool",
        Chan::Class => "class",
        Chan::Style => "style",
        Chan::StyleProp => "styleProp",
        Chan::ClassList => "classList",
        Chan::Html => "html",
    }
}

fn array<'a>(ctx: &Emit<'a, '_>, items: Vec<Expression<'a>>, span: Span) -> Expression<'a> {
    let elements =
        ArenaVec::from_iter_in(items.into_iter().map(ArrayExpressionElement::from), &ctx.allocator);
    Expression::new_array_expression(span, elements, &ctx.ast)
}

fn number<'a>(ctx: &Emit<'a, '_>, value: u32, span: Span) -> Expression<'a> {
    Expression::new_numeric_literal(span, f64::from(value), None, NumberBase::Decimal, &ctx.ast)
}

fn text<'a>(ctx: &Emit<'a, '_>, value: &'static str, span: Span) -> Expression<'a> {
    ctx.string(ctx.allocator.alloc_str(value), span)
}

fn text_of<'a>(ctx: &Emit<'a, '_>, value: &str, span: Span) -> Expression<'a> {
    ctx.string(ctx.allocator.alloc_str(value), span)
}

fn binding<'a>(
    ctx: &Emit<'a, '_>,
    name: &'a str,
    init: Expression<'a>,
    span: Span,
) -> Statement<'a> {
    let declarator = VariableDeclarator::new(
        span,
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
