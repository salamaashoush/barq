//! The lowering table for a custom renderer, over the same analysed IR.
//!
//! A host made with `createRenderer` has no parser to hand a template to and no
//! sibling walk to address a node with, so a unit becomes the calls that build
//! it: one `createElement` per element, one `createTextNode` per text run, one
//! `insertNode` per static child, each node bound to a name as it is made. The
//! patch program then runs over those names in program order, exactly as the
//! DOM backend runs it over the nodes its walk found.
//!
//! Every channel is one `setProp`, because the host owns what a name means:
//! an attribute, a class, an event handler (`setProp(node, "onClick", h)`) and
//! a ref all arrive the same way. Control flow is the same `branch`, `each`,
//! `boundary`, `island` and `reveal` call the DOM backend makes, pointed at the
//! renderer's module by [`super::home`].

use oxc::allocator::Vec as ArenaVec;
use oxc::ast::ast::{Argument, ArrayExpressionElement, Expression, Statement};
use oxc::span::Span;

use crate::codegen::backend::{At, Backend, lower};
use crate::codegen::dom;
use crate::codegen::{Emit, Helper};
use crate::ir::{
    Anchor, Chan, Diff, ExprId, HandlerRef, InsertPlan, NONE, NameId, NodeId, Op, Patch, RegionId,
    SkelAttrValue, SkelNode, SlotId, TagFlags, Thunk, Unit,
};
use crate::lower::entity;

/// The unit's construction, then its patch program, as statements, and the
/// expression the unit evaluates to.
pub fn emit_unit_parts<'a>(
    ctx: &mut Emit<'a, '_>,
    unit: &mut Unit<'a>,
    span: Span,
) -> (Vec<Statement<'a>>, Expression<'a>) {
    let mut build = Build {
        names: vec![None; unit.skeleton.len()],
        named: vec![false; unit.skeleton.len()],
        statements: Vec::with_capacity(unit.skeleton.len() + unit.patch.len()),
    };
    // A text run is created inline unless something reads it again: an insert
    // that anchors on it, or the unit's own value.
    for patch in unit.patch.iter() {
        if let Op::Insert { anchor, .. } | Op::Region { anchor, .. } = patch.op
            && let Some(node) = anchor.node()
        {
            build.named[node as usize] = true;
        }
    }
    let (lo, hi) = unit.skeleton.roots;
    for root in lo..hi {
        build.named[root as usize] = true;
    }
    for root in lo..hi {
        build.node(ctx, unit, root, NONE);
    }

    let mut statements = build.statements;
    let mut grouped = vec![false; unit.patch.len()];
    for index in 0..unit.patch.len() {
        if grouped[index] {
            continue;
        }
        let patch = unit.patch[index];
        let members: Vec<Patch> = match patch.op {
            Op::EffectGroup { len } => crate::passes::group::members(unit, index, len)
                .into_iter()
                .map(|member| {
                    grouped[member] = true;
                    unit.patch[member]
                })
                .collect(),
            _ => Vec::new(),
        };
        let mut backend = Universal { ctx, unit, names: &build.names };
        if let Some(statement) = lower(&mut backend, At { patch, members: &members }) {
            statements.push(statement);
        }
    }

    let roots: Vec<Expression<'a>> = (lo..hi)
        .filter_map(|root| build.names[root as usize].map(|name| ctx.ident(name, span)))
        .collect();
    let value = match <[Expression<'a>; 1]>::try_from(roots) {
        Ok([one]) => one,
        Err(roots) => {
            let elements = roots.into_iter().map(ArrayExpressionElement::from);
            let elements = ArenaVec::from_iter_in(elements, &ctx.allocator);
            Expression::new_array_expression(span, elements, &ctx.ast)
        }
    };
    (statements, value)
}

/// The expression form, for a site whose statements cannot be spliced.
pub fn emit_unit<'a>(ctx: &mut Emit<'a, '_>, unit: &mut Unit<'a>, span: Span) -> Expression<'a> {
    let (mut statements, value) = emit_unit_parts(ctx, unit, span);
    if statements.is_empty() {
        return value;
    }
    statements.push(Statement::new_return_statement(span, Some(value), &ctx.ast));
    dom::iife(ctx, statements, span)
}

/// The construction half: the skeleton, node by node, in document order.
struct Build<'a> {
    names: Vec<Option<&'a str>>,
    /// Which nodes need a name of their own.
    named: Vec<bool>,
    statements: Vec<Statement<'a>>,
}

impl<'a> Build<'a> {
    fn node(&mut self, ctx: &mut Emit<'a, '_>, unit: &Unit<'a>, node: NodeId, parent: NodeId) {
        let span = unit.spans.get(node as usize).copied().unwrap_or_default();
        let made = match *unit.skeleton.node(node) {
            SkelNode::Element(element) => {
                let tag = ctx.module.interner.tag(element.tag).text;
                let callee = ctx.helper(Helper::CreateElement, span);
                let call = ctx.call(callee, vec![Argument::from(ctx.string(tag, span))], span);
                let name = self.bind(ctx, node, call, span);
                for attribute in element.attrs {
                    let key = ctx.module.interner.name(attribute.name).text;
                    let value = match attribute.value {
                        SkelAttrValue::Bare => {
                            Expression::new_boolean_literal(span, true, &ctx.ast)
                        }
                        SkelAttrValue::Str(id) => {
                            let text = decoded(ctx, ctx.module.interner.str(id));
                            ctx.string(text, span)
                        }
                    };
                    let target = ctx.ident(name, span);
                    let statement = set_prop(ctx, target, key, value, span);
                    self.statements.push(statement);
                }
                self.attach(ctx, parent, name, span);
                let (lo, hi) = element.children;
                for child in lo..hi {
                    self.node(ctx, unit, child, node);
                }
                return;
            }
            SkelNode::Text(text) => {
                // A raw-text parent's bytes were never escaped, so there is
                // nothing to decode.
                let raw = parent != NONE
                    && unit.skeleton.node(parent).as_element().is_some_and(|element| {
                        ctx.module.interner.tag(element.tag).flags.contains(TagFlags::RAW_TEXT)
                    });
                let text = if raw { text } else { decoded(ctx, text) };
                text_node(ctx, text, span)
            }
            // The anchor the anchor pass gave a hole that had none standing
            // after it. It renders nothing.
            SkelNode::Marker(_) => text_node(ctx, "", span),
            SkelNode::RawHtml(html) => {
                if parent == NONE {
                    return;
                }
                let target = ctx.ident(self.names[parent as usize].expect("built first"), span);
                let value = ctx.string(html, span);
                let statement = set_prop(ctx, target, "innerHTML", value, span);
                self.statements.push(statement);
                return;
            }
            SkelNode::Slot(_) | SkelNode::Empty => return,
        };
        if self.named[node as usize] || matches!(unit.skeleton.node(node), SkelNode::Marker(_)) {
            let name = self.bind(ctx, node, made, span);
            self.attach(ctx, parent, name, span);
        } else if parent != NONE {
            let parent = ctx.ident(self.names[parent as usize].expect("built first"), span);
            let callee = ctx.helper(Helper::InsertNode, span);
            let call = ctx.call(callee, vec![Argument::from(parent), Argument::from(made)], span);
            self.statements.push(Statement::new_expression_statement(span, call, &ctx.ast));
        }
    }

    fn bind(
        &mut self,
        ctx: &mut Emit<'a, '_>,
        node: NodeId,
        init: Expression<'a>,
        span: Span,
    ) -> &'a str {
        let name = ctx.module.uids.element(ctx.allocator);
        self.statements.push(ctx.binding(name, init, span));
        self.names[node as usize] = Some(name);
        name
    }

    fn attach(&mut self, ctx: &mut Emit<'a, '_>, parent: NodeId, name: &'a str, span: Span) {
        if parent == NONE {
            return;
        }
        let parent = ctx.ident(self.names[parent as usize].expect("built first"), span);
        let callee = ctx.helper(Helper::InsertNode, span);
        let child = ctx.ident(name, span);
        let call = ctx.call(callee, vec![Argument::from(parent), Argument::from(child)], span);
        self.statements.push(Statement::new_expression_statement(span, call, &ctx.ast));
    }
}

fn text_node<'a>(ctx: &mut Emit<'a, '_>, text: &'a str, span: Span) -> Expression<'a> {
    let callee = ctx.helper(Helper::CreateTextNode, span);
    ctx.call(callee, vec![Argument::from(ctx.string(text, span))], span)
}

/// Skeleton bytes are escaped for markup, and a host is owed the text.
fn decoded<'a>(ctx: &Emit<'a, '_>, text: &'a str) -> &'a str {
    match entity::decode(text) {
        Some(std::borrow::Cow::Borrowed(same)) => same,
        Some(owned) => ctx.allocator.alloc_str(&owned),
        None => text,
    }
}

fn set_prop<'a>(
    ctx: &mut Emit<'a, '_>,
    node: Expression<'a>,
    name: &'a str,
    value: Expression<'a>,
    span: Span,
) -> Statement<'a> {
    let callee = ctx.helper(Helper::SetProp, span);
    let call = ctx.call(
        callee,
        vec![Argument::from(node), Argument::from(ctx.string(name, span)), Argument::from(value)],
        span,
    );
    Statement::new_expression_statement(span, call, &ctx.ast)
}

struct Universal<'a, 'e, 'm, 'u> {
    ctx: &'e mut Emit<'a, 'm>,
    unit: &'u mut Unit<'a>,
    names: &'u [Option<&'a str>],
}

impl<'a> Universal<'a, '_, '_, '_> {
    fn node(&self, node: NodeId, span: Span) -> Expression<'a> {
        let name = self.names[node as usize].expect("every node a patch addresses is built");
        self.ctx.ident(name, span)
    }

    fn write(&mut self, at: At<'_>, name: &'a str, value: Expression<'a>) -> Option<Statement<'a>> {
        let node = self.node(at.target(), at.span());
        Some(set_prop(self.ctx, node, name, value, at.span()))
    }

    fn name(&self, name: NameId) -> &'a str {
        self.ctx.module.interner.name(name).text
    }

    /// The read half of one live binding, inside the effect.
    fn read(&mut self, name: NameId, value: ExprId, opaque: bool, span: Span) -> Expression<'a> {
        if !opaque {
            return dom::value_expression(self.ctx, self.unit, value, span);
        }
        // Taken as written: the read is the effect's compute, so a call in it
        // is tracked where it runs, and only a function it yields is a Cell.
        let callable = self.unit.exprs.rx(value).shape.may_be_callable();
        let value = dom::take(self.ctx, self.unit, value, span);
        if !callable || dom::is_primitive_valued(&value) {
            return value;
        }
        // An opaque value is a Cell when it is a function, as an attribute is
        // in the document, and a Block there is refused with the prop's name.
        let origin = self.ctx.allocator.alloc_str(&format!("The `{}` prop", self.name(name)));
        let callee = self.ctx.helper(Helper::ReadSlot, span);
        let origin = self.ctx.string(origin, span);
        self.ctx.call(callee, vec![Argument::from(value), Argument::from(origin)], span)
    }

    /// One effect for every live binding of the unit that the grouping pass
    /// put together: the compute reads them all into one record, and the apply
    /// writes each that changed.
    ///
    /// ```js
    /// _$bindEffect(() => ({ a: w(), b: h() }), (_v$, _p$ = {}) => {
    ///   if (_v$.a !== _p$.a) _$setProp(_el$1, "width", _v$.a, _p$.a);
    ///   if (_v$.b !== _p$.b) _$setProp(_el$1, "height", _v$.b, _p$.b);
    /// });
    /// ```
    fn effect(&mut self, members: &[Patch], header: Patch) -> Statement<'a> {
        let span = header.span;
        let rows: Vec<(Patch, NameId, ExprId, Diff, bool)> = members
            .iter()
            .filter_map(|patch| match patch.op {
                Op::SetLive { name, value, diff, .. } => Some((*patch, name, value, diff, false)),
                Op::SetOpaque { name, value, .. } => {
                    Some((*patch, name, value, Diff::Identity, true))
                }
                _ => None,
            })
            .collect();

        // The bindings whose reads cannot change once the fields of one plain
        // object are known are written once, apart from those that can, so the
        // effect that remains computes no record for what never moves.
        let mut base: Option<&'a str> = None;
        let mut keys: Vec<&'a str> = Vec::new();
        let mut once = Vec::new();
        let mut live = Vec::new();
        for (patch, name, one, diff, opaque) in rows {
            let read = self.read(name, one, opaque, patch.span);
            let mut plain = Some((None, Vec::new()));
            self.plain_read(&read, &mut plain);
            match plain {
                Some((own, read_keys)) if own.is_none() || base.is_none() || own == base => {
                    if own.is_some() {
                        base = own;
                    }
                    for key in read_keys {
                        if !keys.contains(&key) {
                            keys.push(key);
                        }
                    }
                    once.push((patch, name, diff, read));
                }
                _ => live.push((patch, name, diff, read)),
            }
        }
        let mut statements = Vec::with_capacity(2);
        if !once.is_empty() {
            statements.push(self.group(once, Some((base, keys)), span));
        }
        if !live.is_empty() {
            statements.push(self.group(live, None, span));
        }
        if statements.len() == 1 {
            return statements.pop().unwrap_or_else(|| unreachable!());
        }
        Statement::new_block_statement(
            span,
            ArenaVec::from_iter_in(statements, &self.ctx.allocator),
            &self.ctx.ast,
        )
    }

    /// One binding of some of a unit's props: a scalar compute and write for
    /// one, a record compared field by field for several.
    fn group(
        &mut self,
        rows: Vec<(Patch, NameId, Diff, Expression<'a>)>,
        plain: Option<(Option<&'a str>, Vec<&'a str>)>,
        span: Span,
    ) -> Statement<'a> {
        let value = self.ctx.module.uids.temp();
        let prev = self.ctx.module.uids.prev();
        if rows.len() == 1 {
            let Some((patch, name, _, read)) = rows.into_iter().next() else {
                unreachable!();
            };
            let compute = self.ctx.thunk(read, span);
            let node = self.node(patch.target, patch.span);
            let held = self.ctx.ident(value, patch.span);
            let theirs = self.ctx.ident(prev, patch.span);
            let key = self.ctx.string(self.name(name), patch.span);
            let callee = self.ctx.helper(Helper::SetProp, patch.span);
            let write = self.ctx.call(
                callee,
                vec![
                    Argument::from(node),
                    Argument::from(key),
                    Argument::from(held),
                    Argument::from(theirs),
                ],
                patch.span,
            );
            let write = Statement::new_expression_statement(patch.span, write, &self.ctx.ast);
            let params = dom::apply_params(self.ctx, value, Some((prev, false)), span);
            let apply = dom::arrow(self.ctx, params, dom::block(self.ctx, vec![write], span), span);
            return self.bind(compute, apply, plain, span);
        }

        let mut properties = Vec::with_capacity(rows.len());
        let mut body = Vec::with_capacity(rows.len());
        for (index, (patch, name, diff, read)) in rows.into_iter().enumerate() {
            let key = dom::slot_key(index, self.ctx.allocator);
            properties.push(dom::property(self.ctx, key, read, patch.span));

            let field = |ctx: &Emit<'a, '_>, of: &'a str| {
                ctx.member(ctx.ident(of, patch.span), key, patch.span)
            };
            let node = self.node(patch.target, patch.span);
            let callee = self.ctx.helper(Helper::SetProp, patch.span);
            let write = self.ctx.call(
                callee,
                vec![
                    Argument::from(node),
                    Argument::from(self.ctx.string(self.name(name), patch.span)),
                    Argument::from(field(self.ctx, value)),
                    Argument::from(field(self.ctx, prev)),
                ],
                patch.span,
            );
            let write = Statement::new_expression_statement(patch.span, write, &self.ctx.ast);
            // An object may be mutated in place, so its identity says nothing
            // and it is written every time.
            if diff == Diff::Always {
                body.push(write);
                continue;
            }
            let test = Expression::new_binary_expression(
                patch.span,
                field(self.ctx, value),
                oxc::ast::ast::BinaryOperator::StrictInequality,
                field(self.ctx, prev),
                &self.ctx.ast,
            );
            body.push(Statement::new_if_statement(patch.span, test, write, None, &self.ctx.ast));
        }
        let record = Expression::new_object_expression(
            span,
            ArenaVec::from_iter_in(properties, &self.ctx.allocator),
            &self.ctx.ast,
        );
        let compute = self.ctx.thunk(record, span);
        let params = dom::apply_params(self.ctx, value, Some((prev, true)), span);
        let apply = dom::arrow(self.ctx, params, dom::block(self.ctx, body, span), span);
        self.bind(compute, apply, plain, span)
    }

    /// Narrow `plain` by one emitted read: it stays `Some` while every read is
    /// a literal, a name, or a field of one object (`[p.x, p.y, 0]`), with
    /// that object and the fields read. Such a read changes only if the object
    /// is reactive (a store, a getter, a field holding a Cell), which
    /// `bindPlain` asks at run time; a call, a deeper path or anything else
    /// keeps the effect.
    fn plain_read(
        &self,
        read: &Expression<'a>,
        plain: &mut Option<(Option<&'a str>, Vec<&'a str>)>,
    ) {
        let Some((base, keys)) = plain else {
            return;
        };
        let read_slot = self.ctx.local[Helper::ReadSlot as usize];
        if !inert(read, read_slot, base, keys) {
            *plain = None;
        }
    }
    fn bind(
        &mut self,
        compute: Expression<'a>,
        apply: Expression<'a>,
        plain: Option<(Option<&'a str>, Vec<&'a str>)>,
        span: Span,
    ) -> Statement<'a> {
        let Some((base, keys)) = plain else {
            return dom::effect_call(self.ctx, compute, apply, span);
        };
        let keys = keys
            .into_iter()
            .map(|key| ArrayExpressionElement::from(self.ctx.string(key, span)))
            .collect::<Vec<_>>();
        let keys = Expression::new_array_expression(
            span,
            ArenaVec::from_iter_in(keys, &self.ctx.allocator),
            &self.ctx.ast,
        );
        let base = match base {
            Some(name) => self.ctx.ident(name, span),
            None => Expression::new_void_0(span, &self.ctx.ast),
        };
        let callee = self.ctx.helper(Helper::BindPlain, span);
        let call = self.ctx.call(
            callee,
            vec![
                Argument::from(compute),
                Argument::from(apply),
                Argument::from(keys),
                Argument::from(base),
            ],
            span,
        );
        Statement::new_expression_statement(span, call, &self.ctx.ast)
    }
}

/// A read that changes only through the fields of its one object: literals,
/// names, `base.field`, and arrays, objects and operators over them.
fn inert<'a>(
    expression: &Expression<'a>,
    read_slot: &str,
    base: &mut Option<&'a str>,
    keys: &mut Vec<&'a str>,
) -> bool {
    let inert =
        |expression: &Expression<'a>, base: &mut Option<&'a str>, keys: &mut Vec<&'a str>| {
            inert(expression, read_slot, base, keys)
        };
    match expression {
        // `readSlot(p.x, "...")`, the Cell-slot read of an opaque field: it
        // calls the field only when it holds a function, which `bindPlain`
        // refuses at run time.
        Expression::CallExpression(call) => {
            matches!(&call.callee, Expression::Identifier(callee) if callee.name.as_str() == read_slot)
                && call.arguments.len() == 2
                && call.arguments[0].as_expression().is_some_and(|inner| inert(inner, base, keys))
        }
        Expression::NumericLiteral(_)
        | Expression::StringLiteral(_)
        | Expression::BooleanLiteral(_)
        | Expression::NullLiteral(_)
        | Expression::BigIntLiteral(_)
        | Expression::Identifier(_) => true,
        Expression::StaticMemberExpression(member) => {
            let Expression::Identifier(object) = &member.object else {
                return false;
            };
            let name = object.name.as_str();
            if base.is_some_and(|known| known != name) {
                return false;
            }
            *base = Some(name);
            let key = member.property.name.as_str();
            if !keys.contains(&key) {
                keys.push(key);
            }
            true
        }
        Expression::ArrayExpression(array) => array.elements.iter().all(|element| match element {
            ArrayExpressionElement::SpreadElement(_) => false,
            ArrayExpressionElement::Elision(_) => true,
            other => other.as_expression().is_some_and(|inner| inert(inner, base, keys)),
        }),
        Expression::ObjectExpression(object) => {
            object.properties.iter().all(|property| match property {
                oxc::ast::ast::ObjectPropertyKind::ObjectProperty(property) => {
                    !property.computed
                        && !property.method
                        && property.kind == oxc::ast::ast::PropertyKind::Init
                        && inert(&property.value, base, keys)
                }
                oxc::ast::ast::ObjectPropertyKind::SpreadProperty(_) => false,
            })
        }
        Expression::UnaryExpression(unary) => {
            unary.operator != oxc::syntax::operator::UnaryOperator::Delete
                && inert(&unary.argument, base, keys)
        }
        Expression::BinaryExpression(binary) => {
            inert(&binary.left, base, keys) && inert(&binary.right, base, keys)
        }
        Expression::LogicalExpression(logical) => {
            inert(&logical.left, base, keys) && inert(&logical.right, base, keys)
        }
        Expression::ConditionalExpression(conditional) => {
            inert(&conditional.test, base, keys)
                && inert(&conditional.consequent, base, keys)
                && inert(&conditional.alternate, base, keys)
        }
        Expression::TemplateLiteral(template) => {
            template.expressions.iter().all(|inner| inert(inner, base, keys))
        }
        Expression::ParenthesizedExpression(inner) => inert(&inner.expression, base, keys),
        _ => false,
    }
}

impl<'a> Backend<'a> for Universal<'a, '_, '_, '_> {
    type Out = Option<Statement<'a>>;

    fn set_once(&mut self, at: At<'_>, name: NameId, value: ExprId, _chan: Chan) -> Self::Out {
        let value = dom::take(self.ctx, self.unit, value, at.span());
        self.write(at, self.name(name), value)
    }

    fn set_live(
        &mut self,
        at: At<'_>,
        _name: NameId,
        _value: ExprId,
        _chan: Chan,
        _diff: Diff,
    ) -> Self::Out {
        Some(self.effect(&[at.patch], at.patch))
    }

    /// A value the analysis could not classify. One that reads nothing and
    /// cannot be a function is written once. Anything else is read inside a
    /// binding: a call or an operator over reads (`"count " + count()`) is
    /// tracked there, and a function it yields is followed as a Cell.
    fn set_opaque(&mut self, at: At<'_>, name: NameId, value: ExprId, _chan: Chan) -> Self::Out {
        let rx = self.unit.exprs.rx(value);
        if rx.thunk != Thunk::Arrow && !rx.shape.may_be_callable() {
            let value = dom::take(self.ctx, self.unit, value, at.span());
            return self.write(at, self.name(name), value);
        }
        // A bare name reads nothing reactive by being named, so whether it is
        // a Cell is asked at run time, as `bindProp` asks it in the document:
        // a value that is not one costs a write and no effect.
        let bare = matches!(
            self.unit.exprs.entry_mut(value).src.expression(),
            Some(Expression::Identifier(_))
        );
        if bare {
            let span = at.span();
            let node = self.node(at.target(), span);
            let write = self.ctx.helper(Helper::SetProp, span);
            let key = self.ctx.string(self.name(name), span);
            let value = dom::take(self.ctx, self.unit, value, span);
            let callee = self.ctx.helper(Helper::BindSlot, span);
            let call = self.ctx.call(
                callee,
                vec![
                    Argument::from(node),
                    Argument::from(write),
                    Argument::from(key),
                    Argument::from(value),
                ],
                span,
            );
            return Some(Statement::new_expression_statement(span, call, &self.ctx.ast));
        }
        Some(self.effect(&[at.patch], at.patch))
    }

    /// The prop name is the author's (`onClick`), kept by the lowering for this
    /// target, and the host decides what an event is.
    fn set_event(&mut self, at: At<'_>, event: NameId, value: ExprId, _capture: bool) -> Self::Out {
        let value = dom::take(self.ctx, self.unit, value, at.span());
        self.write(at, self.name(event), value)
    }

    fn delegate(
        &mut self,
        at: At<'_>,
        event: NameId,
        handler: HandlerRef,
        _data: Option<ExprId>,
    ) -> Self::Out {
        let handler = dom::handler_expression(self.ctx, self.unit, handler, at.span());
        self.write(at, self.name(event), handler)
    }

    fn listen(
        &mut self,
        at: At<'_>,
        event: NameId,
        handler: HandlerRef,
        _capture: bool,
    ) -> Self::Out {
        let handler = dom::handler_expression(self.ctx, self.unit, handler, at.span());
        self.write(at, self.name(event), handler)
    }

    fn set_ref(&mut self, at: At<'_>, value: ExprId, write: bool) -> Self::Out {
        let span = at.span();
        let value = dom::take(self.ctx, self.unit, value, span);
        if write {
            // The variable is handed what the host hands a ref rather than the
            // node: a host's node can stand for an object it builds later,
            // once a property the object's constructor needs has arrived.
            let assign = Expression::new_assignment_expression(
                span,
                oxc::ast::ast::AssignmentOperator::Assign,
                dom::writable_target(value),
                self.ctx.ident("_r$", span),
                &self.ctx.ast,
            );
            let body = vec![Statement::new_expression_statement(span, assign, &self.ctx.ast)];
            let params = dom::apply_params(self.ctx, "_r$", None, span);
            let deliver = dom::arrow(self.ctx, params, dom::block(self.ctx, body, span), span);
            return self.write(at, "ref", deliver);
        }
        self.write(at, "ref", value)
    }

    /// Reported as BARQ027 and emitted as nothing: a submit handler is a
    /// document's form concept.
    fn form_action(&mut self, _at: At<'_>, _value: ExprId) -> Self::Out {
        None
    }

    /// Reported as BARQ027 and emitted as nothing: a two-way binding needs the
    /// property a user edits and the event that reports it, which only the
    /// document's form controls define.
    fn bind(&mut self, _at: At<'_>, _prop: NameId, _event: NameId, _value: ExprId) -> Self::Out {
        None
    }

    fn spread(&mut self, at: At<'_>, value: ExprId, live: bool) -> Self::Out {
        let span = at.span();
        let node = self.node(at.target(), span);
        let value = if live {
            dom::thunk(self.ctx, self.unit, value, span)
        } else {
            dom::take(self.ctx, self.unit, value, span)
        };
        let callee = self.ctx.helper(Helper::Spread, span);
        let mut arguments = vec![Argument::from(node), Argument::from(value)];
        if let Some(later) = dom::spread_later(self.ctx, self.unit, span) {
            arguments.push(Argument::from(later));
        }
        let call = self.ctx.call(callee, arguments, span);
        Some(Statement::new_expression_statement(span, call, &self.ctx.ast))
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
        let value = match plan {
            InsertPlan::Live => dom::thunk(self.ctx, self.unit, value, span),
            InsertPlan::Once | InsertPlan::Opaque => dom::take(self.ctx, self.unit, value, span),
        };
        let mut arguments = vec![Argument::from(parent), Argument::from(value)];
        arguments.extend(anchor.node().map(|node| Argument::from(self.node(node, span))));
        let callee = self.ctx.helper(Helper::Insert, span);
        let call = self.ctx.call(callee, arguments, span);
        Some(Statement::new_expression_statement(span, call, &self.ctx.ast))
    }

    fn region(&mut self, at: At<'_>, _slot: SlotId, anchor: Anchor, region: RegionId) -> Self::Out {
        let span = at.span();
        let parent = self.node(at.target(), span);
        let anchor = anchor.node().map(|node| self.node(node, span));
        let row = std::mem::replace(
            &mut self.unit.regions[region as usize],
            dom::empty_region(self.ctx, span),
        );
        let call = dom::region_call(self.ctx, row, Some((parent, anchor)), span);
        Some(Statement::new_expression_statement(span, call, &self.ctx.ast))
    }

    fn effect_group(&mut self, at: At<'_>, _len: u16) -> Self::Out {
        Some(self.effect(at.members, at.patch))
    }
}

#[cfg(test)]
mod tests {
    use crate::compile::{CompileOutput, compile};
    use crate::diag::Code;
    use crate::options::{RenderTarget, ResolvedOptions};

    const RENDERER: &str = "./renderer.ts";

    fn options(filename: &str) -> ResolvedOptions {
        ResolvedOptions {
            target: RenderTarget::Universal,
            module_source: RENDERER.to_string(),
            ..ResolvedOptions::with_filename(filename)
        }
    }

    fn universal(source: &str) -> CompileOutput {
        compile(source, &options("u.tsx")).expect("compiles")
    }

    fn codes(out: &CompileOutput) -> Vec<Code> {
        out.warnings.iter().filter_map(|warning| warning.code).collect()
    }

    #[test]
    fn a_unit_is_built_by_calls_with_no_template_and_no_walk() {
        let code = universal(
            "export const V = () => <box title=\"a &amp; b\" hidden><label>hi</label>{x}</box>;\n",
        )
        .code;
        for expected in [
            "const _el$1 = _$createElement(\"box\");",
            "_$setProp(_el$1, \"title\", \"a & b\");",
            "_$setProp(_el$1, \"hidden\", true);",
            "_$insertNode(_el$1, _el$2);",
            "_$insertNode(_el$2, _$createTextNode(\"hi\"));",
            "_$insert(_el$1, x);",
            "from \"./renderer.ts\"",
        ] {
            assert!(code.contains(expected), "{expected} missing from\n{code}");
        }
        for document in ["_$template", "firstChild", "nextSibling", "@barqjs/web", "document."] {
            assert!(!code.contains(document), "{document} in\n{code}");
        }
    }

    #[test]
    fn every_channel_and_event_is_one_set_prop_under_the_authors_name() {
        let code = universal(
            "export const V = (p) => <box className={p.c} style={{ color: \"red\" }} \
             onClick={p.go} onKeyDownCapture={p.key} strokeWidth={2} ref={p.r} />;\n",
        )
        .code;
        for expected in [
            "\"className\"",
            "_$setProp(_el$1, \"style\", { color: \"red\" });",
            "_$setProp(_el$1, \"onClick\", p.go);",
            "_$setProp(_el$1, \"onKeyDownCapture\", p.key);",
            "_$setProp(_el$1, \"strokeWidth\", 2);",
            "_$setProp(_el$1, \"ref\", p.r);",
        ] {
            assert!(code.contains(expected), "{expected} missing from\n{code}");
        }
        for document in ["_$setClass", "_$setStyle", "_$setAttr", "__bq_", "_$listen", "_$ref("] {
            assert!(!code.contains(document), "{document} in\n{code}");
        }
    }

    #[test]
    fn a_bare_name_asks_at_run_time_whether_it_is_a_cell_and_a_member_read_is_followed() {
        let code = universal(
            "import { shared } from \"./shared\";\n\
             export const V = (p) => <box geometry={shared} position={p.at} />;\n",
        )
        .code;
        assert!(code.contains("_$bindSlot(_el$1, _$setProp, \"geometry\", shared);"), "{code}");
        assert_eq!(code.matches("_$bindEffect(").count(), 1, "{code}");
        assert!(code.contains("p.at"), "{code}");
    }

    #[test]
    fn fields_of_one_object_are_bound_plain_and_a_call_keeps_its_effect() {
        let code = universal(
            "import { For } from \"@barqjs/core\";\n\
             export const V = (p) => <For each={p.rows()}>{(row) => \
             <box position={[row.x, row.y, 0]} label={`#${row.id}`} spin={row.speed * 2} />}</For>;\n\
             export const W = (p) => <For each={p.rows()}>{(row) => <box spin={row.speed()} />}</For>;\n",
        )
        .code;
        assert_eq!(code.matches("_$bindPlain(").count(), 1, "{code}");
        assert!(code.contains("], row);"), "{code}");
        for key in ["\"x\"", "\"y\"", "\"id\"", "\"speed\""] {
            assert!(code.contains(key), "{key} in {code}");
        }
        assert_eq!(code.matches("_$bindEffect(").count(), 1, "{code}");
    }

    #[test]
    fn a_ref_written_into_a_variable_is_delivered_by_the_host() {
        let code =
            universal("export function V() { let r; const v = <box ref={r} />; return [v, r]; }\n")
                .code;
        assert!(code.contains("_$setProp(_el$1, \"ref\", (_r$) => {"), "{code}");
        assert!(code.contains("r = _r$;"), "{code}");
        assert!(!code.contains("r = _el$1"), "{code}");
    }

    #[test]
    fn a_units_live_bindings_share_one_effect() {
        let code = universal("export const V = (p) => <box a={p.a()} b={p.b()} />;\n").code;
        assert_eq!(code.matches("_$bindEffect(").count(), 1, "{code}");
        assert!(
            code.contains("if (_v$.a !== _p$.a) _$setProp(_el$1, \"a\", _v$.a, _p$.a);"),
            "{code}"
        );
    }

    /// A value the analysis leaves to the runtime is still read where it can
    /// change: an operator over a call is a binding, not a write at mount.
    #[test]
    fn an_opaque_value_that_reads_is_bound_and_a_constant_is_written_once() {
        let code = universal(
            "import { count } from \"./state.ts\";\n\
             export const V = () => <label text={\"count \" + count()} size={3} />;\n",
        )
        .code;
        assert!(code.contains("_$bindEffect(() => \"count \" + count(),"), "{code}");
        assert!(code.contains("_$setProp(_el$1, \"size\", 3);"), "{code}");
    }

    #[test]
    fn control_flow_reaches_the_renderers_own_primitives() {
        let code = universal(
            "import { For, Show } from \"@barqjs/core\";\n\
             export const V = (p) => <list><Show when={p.on}><a/></Show>\
             <For each={p.rows}>{(row) => <item>{row}</item>}</For></list>;\n",
        )
        .code;
        let renderer =
            code.lines().find(|line| line.contains(RENDERER)).expect("a renderer import");
        for helper in ["branch as", "each as", "createElement as", "insertNode as"] {
            assert!(renderer.contains(helper), "{helper} missing from {renderer}");
        }
        assert!(!code.contains("@barqjs/web"), "{code}");
    }

    #[test]
    fn a_module_that_calls_a_component_loads_the_renderer_that_hosts_it() {
        // A component held as a value is called by whoever receives it, at run
        // time, so nothing lowers it.
        let code = universal(
            "import { Show } from \"@barqjs/core\";\n\
             export const pick = () => Show;\n",
        )
        .code;
        assert!(code.contains("import \"./renderer.ts\";"), "{code}");
        assert!(!code.contains("/host"), "{code}");
    }

    #[test]
    fn a_document_form_binding_is_barq027() {
        let bound = universal("export const V = (p) => <input bind:value={p.pair} />;\n");
        assert_eq!(codes(&bound), vec![Code::Barq027]);
        assert!(!bound.code.contains("bindValue"), "{}", bound.code);
        let action = universal("export const V = (p) => <form action={p.save} />;\n");
        assert_eq!(codes(&action), vec![Code::Barq027]);
        assert!(!action.code.contains("formAction"), "{}", action.code);
        // A literal URL is a property like any other.
        let url = universal("export const V = () => <form action=\"/save\" />;\n");
        assert_eq!(codes(&url), vec![]);
    }

    #[test]
    fn a_document_option_beside_the_universal_target_is_barq028() {
        let resolved = crate::options::TransformOptions {
            filename: Some("u.tsx".into()),
            target: Some("universal".into()),
            module_source: Some(RENDERER.into()),
            hydratable: Some(true),
            ..crate::options::TransformOptions::default()
        }
        .resolve();
        let out = compile("export const V = () => <box>{x}</box>;\n", &resolved).expect("compiles");
        assert_eq!(codes(&out), vec![Code::Barq028]);
        assert!(!out.code.contains("_$hole"), "{}", out.code);
    }

    /// The whole corpus compiles for a custom host, with nothing of the
    /// document's left in it.
    #[test]
    fn every_fixture_compiles_for_a_custom_renderer() {
        let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures");
        let mut compiled = 0;
        for entry in std::fs::read_dir(&directory).expect("the fixture corpus") {
            let path = entry.expect("a fixture").path();
            if path.extension().is_none_or(|extension| extension != "tsx") {
                continue;
            }
            let name = path.file_name().expect("a name").to_string_lossy().to_string();
            let source = std::fs::read_to_string(&path).expect("a readable fixture");
            let out = compile(&source, &options(&name))
                .unwrap_or_else(|errors| panic!("{name}: {errors:?}"));
            for document in
                ["template as _$", "setAttr as _$", "delegateEvents as _$", "child as _$"]
            {
                assert!(!out.code.contains(document), "{name}: {document} in\n{}", out.code);
            }
            compiled += 1;
        }
        assert!(compiled >= 130, "only {compiled} fixtures");
    }
}
