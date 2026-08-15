use oxc::allocator::{Box as ArenaBox, Vec as ArenaVec};
use oxc::ast::ast::{
    Argument, Expression, IdentifierName, JSXAttributeItem, JSXChild, JSXElement, JSXElementName,
    JSXFragment, JSXMemberExpression, JSXMemberExpressionObject, ObjectProperty,
    ObjectPropertyKind, PropertyKey, PropertyKind, SpreadElement, StringLiteral,
};
use oxc::span::SPAN;

use super::{Emit, Helper};
use crate::lower::entity;
use crate::lower::jsx::{attribute_expression, attribute_name, expression_of, is_identifier_name};
use crate::lower::text;

/// The un-compiled path, for every JSX shape a template cannot express: user
/// components, fragments, spreads, and the markup the HTML parser reshapes.
impl<'a> Emit<'a, '_> {
    pub(super) fn create_element(
        &mut self,
        element: ArenaBox<'a, JSXElement<'a>>,
    ) -> Expression<'a> {
        let JSXElement { span, opening_element, children, .. } = element.unbox();
        let opening = opening_element.unbox();
        // An INTRINSIC tag here is an element the template path refused — a
        // spread, `<select>`, `<template>`, a foreign namespace — and it is
        // BUILT rather than cloned. The string backend serialised the whole
        // subtree inline as one hole's value, so there is no walk for the
        // client to claim it with: everything under this call has to build
        // cold, or a `template()` inside it takes the node belonging to the
        // NEXT position and the handlers land on the wrong elements.
        //
        // A COMPONENT tag is left alone. Its children are Blocks and its
        // subtree is compiled the ordinary way, so the positions under it are
        // exactly the positions the server wrote.
        let cold = self.hydratable && matches!(opening.name, JSXElementName::Identifier(_));
        let callee = self.helper(Helper::CreateElement, span);
        let tag = self.element_name(opening.name);
        let mut arguments =
            vec![Argument::from(tag), Argument::from(self.props(opening.attributes))];
        arguments.extend(self.child_arguments(children));
        let call = self.call(callee, arguments, span);
        if cold { self.cold_call(call, span) } else { call }
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

    pub(super) fn fragment_call(
        &mut self,
        fragment: ArenaBox<'a, JSXFragment<'a>>,
    ) -> Expression<'a> {
        let JSXFragment { span, children, .. } = fragment.unbox();
        let callee = self.helper(Helper::CreateElement, span);
        let tag = self.helper(Helper::Fragment, span);
        let null = Expression::new_null_literal(span, &self.ast);
        let mut arguments = vec![Argument::from(tag), Argument::from(null)];
        arguments.extend(self.child_arguments(children));
        self.call(callee, arguments, span)
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
                        Some(value) => attribute_expression(value, &self.ast),
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

    fn child_arguments(&mut self, children: ArenaVec<'a, JSXChild<'a>>) -> Vec<Argument<'a>> {
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
                        out.push(Argument::from(value));
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

    fn decoded(&self, text: &'a str) -> &'a str {
        match entity::decode(text) {
            Some(std::borrow::Cow::Borrowed(same)) => same,
            Some(owned) => self.allocator.alloc_str(&owned),
            None => text,
        }
    }
}
