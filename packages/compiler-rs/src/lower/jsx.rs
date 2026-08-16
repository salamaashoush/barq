use std::borrow::Cow;

use oxc::allocator::Allocator;
use oxc::ast::ast::{
    Expression, JSXAttributeName, JSXAttributeValue, JSXElementName, JSXExpression,
};
use oxc::ast::builder::AstBuilder;

use crate::lower::entity;

pub fn intrinsic_tag<'a>(name: &JSXElementName<'a>) -> Option<&'a str> {
    match name {
        JSXElementName::Identifier(identifier) => Some(identifier.name.as_str()),
        _ => None,
    }
}

pub fn attribute_name<'a>(name: &JSXAttributeName<'a>, allocator: &'a Allocator) -> &'a str {
    match name {
        JSXAttributeName::Identifier(identifier) => identifier.name.as_str(),
        JSXAttributeName::NamespacedName(namespaced) => allocator.alloc_str(&format!(
            "{}:{}",
            namespaced.namespace.name.as_str(),
            namespaced.name.name.as_str()
        )),
    }
}

/// A JSX attribute as a JS VALUE.
///
/// Every caller of this is building an expression the runtime will read, never
/// bytes the HTML parser will. That distinction is the whole of the entity rule:
/// a JSX attribute string is not a JS string, and its character references are
/// resolved by the TRANSFORM. Down the template channel the parser resolves them
/// out of the baked bytes; down every channel that reaches here nothing would,
/// so `title="a &quot; b"` would hand the runtime the six characters `&quot;`
/// and `setAttribute` would put them in the document verbatim.
///
/// Found by M9: retiring the `createElement` oracle re-pointed `ssr.test.ts`'s
/// reshaped-probe comparison at the DOM backend, and the DOM backend was the
/// side that had never been read. `element(scope, tag, props)` and a component's
/// props both arrive here, and both were double-escaping.
pub fn attribute_expression<'a>(
    value: JSXAttributeValue<'a>,
    ast: &AstBuilder<'a>,
    allocator: &'a Allocator,
) -> Expression<'a> {
    match value {
        JSXAttributeValue::StringLiteral(literal) => {
            let raw = literal.value.as_str();
            if !raw.contains('&') {
                return Expression::StringLiteral(literal);
            }
            match entity::decode(raw) {
                Some(Cow::Borrowed(_)) | None => Expression::StringLiteral(literal),
                Some(Cow::Owned(decoded)) => Expression::new_string_literal(
                    literal.span,
                    allocator.alloc_str(&decoded) as &'a str,
                    None,
                    ast,
                ),
            }
        }
        JSXAttributeValue::Element(element) => Expression::JSXElement(element),
        JSXAttributeValue::Fragment(fragment) => Expression::JSXFragment(fragment),
        JSXAttributeValue::ExpressionContainer(container) => {
            let span = container.span;
            // `foo={}` has no value; the un-compiled path reads `undefined`.
            expression_of(container.unbox().expression)
                .unwrap_or_else(|| Expression::new_void_0(span, ast))
        }
    }
}

/// `{}` and `{/* comment */}` carry no value at all.
pub fn expression_of(expression: JSXExpression<'_>) -> Option<Expression<'_>> {
    match expression {
        JSXExpression::EmptyExpression(_) => None,
        other => Some(other.into_expression()),
    }
}

pub fn is_identifier_name(name: &str) -> bool {
    let mut bytes = name.bytes();
    let Some(first) = bytes.next() else { return false };
    (first.is_ascii_alphabetic() || first == b'_' || first == b'$')
        && bytes.all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'$')
}
