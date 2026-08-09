use oxc::allocator::Allocator;
use oxc::ast::ast::{
    Expression, JSXAttributeName, JSXAttributeValue, JSXElementName, JSXExpression,
};
use oxc::ast::builder::AstBuilder;

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

pub fn attribute_expression<'a>(
    value: JSXAttributeValue<'a>,
    ast: &AstBuilder<'a>,
) -> Expression<'a> {
    match value {
        JSXAttributeValue::StringLiteral(literal) => Expression::StringLiteral(literal),
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
