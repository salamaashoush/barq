use oxc::allocator::{Box as ArenaBox, Vec as ArenaVec};
use oxc::ast::ast::{
    Argument, ArrayExpressionElement, ArrowFunctionBody, Expression, FormalParameterKind,
    FormalParameters, IdentifierName, JSXAttributeItem, JSXChild, JSXElement, JSXElementName,
    JSXFragment, JSXMemberExpression, JSXMemberExpressionObject, ObjectProperty, ObjectPropertyKind,
    PropertyKey, PropertyKind, SpreadElement, StringLiteral,
};
use oxc::span::{GetSpan, SPAN};

use super::{Emit, Helper};
use crate::lower::entity;
use crate::lower::jsx::{attribute_expression, attribute_name, expression_of, is_identifier_name};
use crate::lower::text;

/// The BUILT path — one element by tag name, for the intrinsic P1 refused.
///
/// Every JSX shape that used to arrive here has left: a fragment is an array, a
/// spread stays on the template path, `<math>`, `<template>` and
/// `<select multiple>` all bake, and a component is a call with a source list.
/// What remains is markup the browser's tree builder would not produce as
/// written — `<td>` outside a row, `<body>` — which no clone can carry and no
/// diagnostic should refuse, because the DOM insertion `element` performs never
/// foster-parents.
impl<'a> Emit<'a, '_> {
    pub(super) fn create_element(
        &mut self,
        element: ArenaBox<'a, JSXElement<'a>>,
    ) -> Expression<'a> {
        let JSXElement { span, opening_element, children, .. } = element.unbox();
        let opening = opening_element.unbox();
        // The subtree is BUILT rather than cloned. The string backend serialised
        // the whole thing inline as one hole's value, so there is no walk for the
        // client to claim it with: everything under this call has to build cold,
        // or a `template()` inside it takes the node belonging to the NEXT
        // position and the handlers land on the wrong elements.
        let cold = self.hydratable;
        let callee = self.helper(Helper::Element, span);
        let scope = self.scope(span);
        let tag = self.element_name(opening.name);
        let props = self.props_with_children(opening.attributes, children, span);
        let call = self.call(
            callee,
            vec![Argument::from(scope), Argument::from(tag), Argument::from(props)],
            span,
        );
        if cold { self.cold_call(call, span) } else { call }
    }

    /// The element's attributes as one object, with its children under
    /// `children` — the shape `element` hands to `spread` and to `insert`.
    fn props_with_children(
        &mut self,
        attributes: ArenaVec<'a, JSXAttributeItem<'a>>,
        children: ArenaVec<'a, JSXChild<'a>>,
        span: oxc::span::Span,
    ) -> Expression<'a> {
        let props = self.props(attributes);
        let kids = self.child_arguments(children, true);
        if kids.is_empty() {
            return props;
        }
        let value = if kids.len() == 1 {
            match kids.into_iter().next().expect("checked") {
                Argument::SpreadElement(spread) => {
                    let elements = ArenaVec::from_iter_in(
                        [ArrayExpressionElement::SpreadElement(spread)],
                        &self.allocator,
                    );
                    Expression::new_array_expression(span, elements, &self.ast)
                }
                other => other.into_expression(),
            }
        } else {
            let elements = kids.into_iter().map(|argument| match argument {
                Argument::SpreadElement(spread) => ArrayExpressionElement::SpreadElement(spread),
                other => ArrayExpressionElement::from(other.into_expression()),
            });
            let elements = ArenaVec::from_iter_in(elements, &self.allocator);
            Expression::new_array_expression(span, elements, &self.ast)
        };
        let property = self.property("children", value, span);
        match props {
            Expression::ObjectExpression(mut object) => {
                object.properties.push(property);
                Expression::ObjectExpression(object)
            }
            _ => {
                let properties = ArenaVec::from_iter_in([property], &self.allocator);
                Expression::new_object_expression(span, properties, &self.ast)
            }
        }
    }

    /// `_$hole(null, null, () => …)` — a position the server did not address.
    ///
    /// The same helper a hole uses, with no address, because that is exactly
    /// what this is: `null` means "there is no range here", and the runtime's
    /// answer to that is to build without claiming anything.
    fn cold_call(&mut self, value: Expression<'a>, span: oxc::span::Span) -> Expression<'a> {
        use oxc::allocator::Vec as ArenaVec;
        use oxc::ast::ast::{ArrowFunctionBody, FormalParameterKind, FormalParameters};
        let params = FormalParameters::boxed(
            span,
            FormalParameterKind::ArrowFormalParameters,
            ArenaVec::new_in(&self.allocator),
            None,
            &self.ast,
        );
        let build = Expression::new_arrow_function_expression(
            span,
            false,
            None,
            params,
            None,
            ArrowFunctionBody::from(value),
            &self.ast,
        );
        let callee = self.helper(Helper::Hole, span);
        let null = Expression::new_null_literal(span, &self.ast);
        let null2 = Expression::new_null_literal(span, &self.ast);
        self.call(
            callee,
            vec![Argument::from(null), Argument::from(null2), Argument::from(build)],
            span,
        )
    }

    /// A fragment is an ARRAY of its parts — one template per root plus the
    /// array, which is what `template()` returning `content.firstChild` forces
    /// (DESIGN §8 V5). There is no `Fragment` component behind it: every
    /// position that admits a child already admits an array of children, so the
    /// wrapper only ever added a call and a second flattening rule.
    pub(super) fn fragment_array(
        &mut self,
        fragment: ArenaBox<'a, JSXFragment<'a>>,
    ) -> Expression<'a> {
        let JSXFragment { span, children, .. } = fragment.unbox();
        let elements = self.child_arguments(children, false).into_iter().map(|argument| match argument {
            Argument::SpreadElement(spread) => ArrayExpressionElement::SpreadElement(spread),
            other => ArrayExpressionElement::from(other.into_expression()),
        });
        let elements = ArenaVec::from_iter_in(elements, &self.allocator);
        Expression::new_array_expression(span, elements, &self.ast)
    }

    fn element_name(&mut self, name: JSXElementName<'a>) -> Expression<'a> {
        match name {
            JSXElementName::Identifier(identifier) => {
                self.string(identifier.name.as_str(), identifier.span)
            }
            JSXElementName::IdentifierReference(identifier) => Expression::Identifier(identifier),
            JSXElementName::ThisExpression(this) => Expression::ThisExpression(this),
            JSXElementName::NamespacedName(namespaced) => {
                let text = self.allocator.alloc_str(&format!(
                    "{}:{}",
                    namespaced.namespace.name.as_str(),
                    namespaced.name.name.as_str()
                ));
                self.string(text, namespaced.span)
            }
            JSXElementName::MemberExpression(member) => self.member_chain(member.unbox()),
        }
    }

    fn member_chain(&mut self, member: JSXMemberExpression<'a>) -> Expression<'a> {
        let object = match member.object {
            JSXMemberExpressionObject::IdentifierReference(identifier) => {
                Expression::Identifier(identifier)
            }
            JSXMemberExpressionObject::ThisExpression(this) => Expression::ThisExpression(this),
            JSXMemberExpressionObject::MemberExpression(inner) => self.member_chain(inner.unbox()),
        };
        self.member(object, member.property.name.as_str(), member.span)
    }

    pub(super) fn props(
        &mut self,
        attributes: ArenaVec<'a, JSXAttributeItem<'a>>,
    ) -> Expression<'a> {
        if attributes.is_empty() {
            return Expression::new_null_literal(SPAN, &self.ast);
        }
        let mut properties = Vec::with_capacity(attributes.len());
        for item in attributes {
            match item {
                JSXAttributeItem::SpreadAttribute(spread) => {
                    let spread = spread.unbox();
                    properties.push(ObjectPropertyKind::SpreadProperty(ArenaBox::new_in(
                        SpreadElement::new(spread.span, spread.argument, &self.ast),
                        &self.allocator,
                    )));
                }
                JSXAttributeItem::Attribute(attribute) => {
                    let attribute = attribute.unbox();
                    let name = attribute_name(&attribute.name, self.allocator);
                    let key = self.property_key(name, attribute.span);
                    let value = match attribute.value {
                        None => Expression::new_boolean_literal(attribute.span, true, &self.ast),
                        Some(value) => attribute_expression(value, &self.ast, self.allocator),
                    };
                    properties.push(ObjectPropertyKind::ObjectProperty(ArenaBox::new_in(
                        ObjectProperty::new(
                            attribute.span,
                            PropertyKind::Init,
                            key,
                            value,
                            false,
                            false,
                            false,
                            &self.ast,
                        ),
                        &self.allocator,
                    )));
                }
            }
        }
        let properties = ArenaVec::from_iter_in(properties, &self.allocator);
        Expression::new_object_expression(SPAN, properties, &self.ast)
    }

    fn property(
        &self,
        name: &'a str,
        value: Expression<'a>,
        span: oxc::span::Span,
    ) -> ObjectPropertyKind<'a> {
        let key = self.property_key(name, span);
        ObjectPropertyKind::ObjectProperty(ArenaBox::new_in(
            ObjectProperty::new(span, PropertyKind::Init, key, value, false, false, false, &self.ast),
            &self.allocator,
        ))
    }

    fn property_key(&self, name: &'a str, span: oxc::span::Span) -> PropertyKey<'a> {
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

    fn child_arguments(
        &mut self,
        children: ArenaVec<'a, JSXChild<'a>>,
        live: bool,
    ) -> Vec<Argument<'a>> {
        let source = self.source;
        let mut out = Vec::with_capacity(children.len());
        for child in children {
            match child {
                JSXChild::Text(text) => {
                    // This becomes a JS string literal, so the references have
                    // to be resolved here rather than by the HTML parser.
                    let raw = text.span.source_text(source);
                    if let Some(cleaned) = text::clean(raw, self.allocator) {
                        let value = self.decoded(cleaned);
                        out.push(Argument::from(self.string(value, text.span)));
                    }
                }
                JSXChild::Element(element) => {
                    out.push(Argument::from(Expression::JSXElement(element)));
                }
                JSXChild::Fragment(fragment) => {
                    out.push(Argument::from(Expression::JSXFragment(fragment)));
                }
                JSXChild::ExpressionContainer(container) => {
                    if let Some(value) = expression_of(container.unbox().expression) {
                        out.push(Argument::from(if live { self.live_child(value) } else { value }));
                    }
                }
                JSXChild::Spread(spread) => {
                    let spread = spread.unbox();
                    out.push(Argument::SpreadElement(ArenaBox::new_in(
                        SpreadElement::new(spread.span, spread.expression, &self.ast),
                        &self.allocator,
                    )));
                }
            }
        }
        out
    }

    /// A `{…}` child of a REFUSED ELEMENT, as something `insert` can keep live.
    ///
    /// Only the element path (`live = true`). A FRAGMENT's parts are left as
    /// they are: a fragment is an array of values, each of which is already
    /// whatever its own position made it, and wrapping a component call there
    /// turns the component's result into a Cell yielding it.
    ///
    /// This path has no `ExprId`, so `dom::thunk`'s reactivity verdict is not
    /// available: `fallback.rs` runs on raw JSX, which is the whole reason P1
    /// refused the element. Without a thunk the expression is evaluated once at
    /// the call site and the child is frozen — `<table>{a()}-{b()}</table>`
    /// emitted `{ children: [a(), "-", b()] }` and never updated again, on a
    /// shape the template path gets right (`_$insert($s, el, a)`).
    ///
    /// So the rule here is conservative in the SAFE direction: everything that
    /// is not provably inert becomes `() => value`. A static value inside a
    /// thunk still renders correctly and costs one effect that runs once; a live
    /// value NOT inside one is a miscompile. Two shapes are left alone — a
    /// literal, which cannot change, and a function, which is already the Cell
    /// or Block `insert` wants and would be double-wrapped.
    fn live_child(&self, value: Expression<'a>) -> Expression<'a> {
        let inert = matches!(
            value,
            Expression::StringLiteral(_)
                | Expression::NumericLiteral(_)
                | Expression::BooleanLiteral(_)
                | Expression::NullLiteral(_)
                | Expression::BigIntLiteral(_)
                | Expression::TemplateLiteral(_)
                | Expression::JSXElement(_)
                | Expression::JSXFragment(_)
                | Expression::ArrowFunctionExpression(_)
                | Expression::FunctionExpression(_)
        );
        // A template literal with an interpolation is NOT inert — only a
        // cooked-only one is, and `quasis.len() == 1` is exactly that test.
        let inert = match &value {
            Expression::TemplateLiteral(literal) => literal.expressions.is_empty(),
            _ => inert,
        };
        if inert {
            return value;
        }
        let span = value.span();
        let params = FormalParameters::boxed(
            span,
            FormalParameterKind::ArrowFormalParameters,
            ArenaVec::new_in(&self.allocator),
            None,
            &self.ast,
        );
        Expression::new_arrow_function_expression(
            span,
            false,
            None,
            params,
            None,
            ArrowFunctionBody::from(value),
            &self.ast,
        )
    }

    fn decoded(&self, text: &'a str) -> &'a str {
        match entity::decode(text) {
            Some(std::borrow::Cow::Borrowed(same)) => same,
            Some(owned) => self.allocator.alloc_str(&owned),
            None => text,
        }
    }
}
