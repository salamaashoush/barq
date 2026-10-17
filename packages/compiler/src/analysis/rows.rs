use oxc::ast::ast::{
    ArrowFunctionBody, ArrowFunctionExpression, AssignmentExpression, AssignmentTarget,
    BindingPattern, CallExpression, Class, ComputedMemberExpression, Expression, FormalParameters,
    Function, FunctionBody, JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXChild,
    JSXElement, JSXElementName, JSXFragment, JSXMemberExpressionObject, NewExpression,
    PrivateFieldExpression, SpreadElement, StaticMemberExpression, VariableDeclarator,
};
use oxc::ast_visit::{Visit, walk};
use oxc::semantic::{ScopeFlags, Scoping, SymbolId};

use super::bind::is_component_tag;
use super::symbol_of;

/// How the compiler sees the parameter of the callback a `<For>` hands its rows
/// to.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Callback {
    /// A function written in the `<For>` itself. A field read off the row in a
    /// JSX hole is emitted as a read the hole's effect repeats.
    Inline,
    /// Declared on its own and passed by name. Its parameter is not known to be
    /// a row, so a plain field read in a hole is emitted as a value and applied
    /// once, and every field read is taken as one.
    Named,
}

/// A row callback's body, written as a block or as an arrow's expression.
#[derive(Clone, Copy)]
pub(super) enum Body<'b, 'a> {
    Block(&'b FunctionBody<'a>),
    Arrow(&'b ArrowFunctionBody<'a>),
}

/// Whether a row callback reads a field of its row where nothing will read it
/// again after the row is built. That is the half of BARQ004's claim the
/// compiler can decide: a row the store writes in place is kept, so a field
/// read only once keeps showing the value it had.
pub(super) fn reads_fields_once(
    scoping: &Scoping,
    params: &FormalParameters<'_>,
    body: Body<'_, '_>,
    callback: Callback,
) -> bool {
    let pattern = match (params.items.first(), &params.rest) {
        (Some(first), _) => &first.pattern,
        // `(...rows)` holds the row at `rows[0]`, so a read of that is a read of
        // the row's container, live or once by the same rule.
        (None, Some(rest)) => &rest.rest.argument,
        (None, None) => return false,
    };
    let pattern = match pattern {
        BindingPattern::AssignmentPattern(defaulted) => &defaulted.left,
        pattern => pattern,
    };
    let BindingPattern::BindingIdentifier(identifier) = pattern else {
        // A destructured row is every field it names, read once.
        return true;
    };
    let Some(row) = identifier.symbol_id.get() else { return false };
    let mut scan = Scan { scoping, row, callback, in_svg: false, found: false };
    match body {
        Body::Block(body) => scan.visit_function_body(body),
        Body::Arrow(body) => scan.visit_arrow_function_body(body),
    }
    scan.found
}

struct Scan<'s> {
    scoping: &'s Scoping,
    row: SymbolId,
    callback: Callback,
    in_svg: bool,
    found: bool,
}

impl Scan<'_> {
    fn is_row(&self, expression: &Expression<'_>) -> bool {
        symbol_of(self.scoping, expression) == Some(self.row)
    }

    fn tag_reads_row(&self, name: &JSXElementName<'_>) -> bool {
        let JSXElementName::MemberExpression(member) = name else { return false };
        let mut object = &member.object;
        loop {
            match object {
                JSXMemberExpressionObject::MemberExpression(inner) => object = &inner.object,
                JSXMemberExpressionObject::IdentifierReference(identifier) => {
                    return identifier
                        .reference_id
                        .get()
                        .and_then(|id| self.scoping.get_reference(id).symbol_id())
                        == Some(self.row);
                }
                JSXMemberExpressionObject::ThisExpression(_) => return false,
            }
        }
    }

    /// The row's JSX. In an inline callback a field read in a hole, whether a
    /// child, an element attribute or a component prop, is emitted as a read
    /// that is repeated when the field changes, so only the markup around the
    /// holes is built once. In a callback passed by name the same reads may be
    /// emitted as values and applied once.
    ///
    /// A handler, a `ref`, a `bind:` pair and a form action are handed over
    /// once whatever their source, a signal's or a store's alike, so a row
    /// field read there is not a row going stale and is not what this reports.
    fn element(&mut self, element: &JSXElement<'_>) {
        let opening = &element.opening_element;
        if self.tag_reads_row(&opening.name) {
            self.found = true;
            return;
        }
        let outer = self.in_svg;
        let tag = (!is_component_tag(&opening.name)).then(|| opening.name.to_string());
        if let Some(tag) = &tag {
            self.in_svg = tag != "foreignObject" && (outer || tag == "svg");
        }
        if self.callback == Callback::Named {
            let last_spread = opening
                .attributes
                .iter()
                .rposition(|item| matches!(item, JSXAttributeItem::SpreadAttribute(_)));
            for (index, item) in opening.attributes.iter().enumerate() {
                let JSXAttributeItem::Attribute(attribute) = item else { continue };
                if let Some(tag) = &tag {
                    let raw = match &attribute.name {
                        JSXAttributeName::Identifier(name) => name.name.to_string(),
                        JSXAttributeName::NamespacedName(name) => {
                            format!("{}:{}", name.namespace.name, name.name.name)
                        }
                    };
                    let before_a_spread = last_spread.is_some_and(|last| index < last);
                    if crate::lower::applied_once(&raw, self.in_svg, tag, before_a_spread) {
                        continue;
                    }
                }
                match &attribute.value {
                    Some(JSXAttributeValue::ExpressionContainer(container)) => {
                        if let Some(value) = container.expression.as_expression() {
                            self.visit_expression(value);
                        }
                    }
                    Some(JSXAttributeValue::Element(inner)) => self.visit_jsx_element(inner),
                    Some(JSXAttributeValue::Fragment(inner)) => self.visit_jsx_fragment(inner),
                    Some(JSXAttributeValue::StringLiteral(_)) | None => {}
                }
            }
        }
        self.children(&element.children);
        self.in_svg = outer;
    }

    fn children(&mut self, children: &[JSXChild<'_>]) {
        for child in children {
            match child {
                JSXChild::Element(element) => self.visit_jsx_element(element),
                JSXChild::Fragment(fragment) => self.visit_jsx_fragment(fragment),
                JSXChild::ExpressionContainer(container) if self.callback == Callback::Named => {
                    if let Some(value) = container.expression.as_expression() {
                        self.visit_expression(value);
                    }
                }
                JSXChild::ExpressionContainer(_) | JSXChild::Text(_) | JSXChild::Spread(_) => {}
            }
        }
    }
}

impl<'a> Visit<'a> for Scan<'_> {
    // A function the row builds reads its fields when it is called, which is
    // either inside a tracked scope or at a time the row does not decide.
    fn visit_function(&mut self, _: &Function<'a>, _: ScopeFlags) {}

    fn visit_arrow_function_expression(&mut self, _: &ArrowFunctionExpression<'a>) {}

    fn visit_class(&mut self, _: &Class<'a>) {}

    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        if self.is_row(&it.object) {
            self.found = true;
            return;
        }
        walk::walk_static_member_expression(self, it);
    }

    fn visit_computed_member_expression(&mut self, it: &ComputedMemberExpression<'a>) {
        if self.is_row(&it.object) {
            self.found = true;
            return;
        }
        walk::walk_computed_member_expression(self, it);
    }

    fn visit_private_field_expression(&mut self, it: &PrivateFieldExpression<'a>) {
        if self.is_row(&it.object) {
            self.found = true;
            return;
        }
        walk::walk_private_field_expression(self, it);
    }

    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        if !matches!(it.id, BindingPattern::BindingIdentifier(_))
            && it.init.as_ref().is_some_and(|init| self.is_row(init))
        {
            self.found = true;
            return;
        }
        walk::walk_variable_declarator(self, it);
    }

    fn visit_assignment_expression(&mut self, it: &AssignmentExpression<'a>) {
        if matches!(
            it.left,
            AssignmentTarget::ArrayAssignmentTarget(_)
                | AssignmentTarget::ObjectAssignmentTarget(_)
        ) && self.is_row(&it.right)
        {
            self.found = true;
            return;
        }
        walk::walk_assignment_expression(self, it);
    }

    fn visit_spread_element(&mut self, it: &SpreadElement<'a>) {
        if self.is_row(&it.argument) {
            self.found = true;
            return;
        }
        walk::walk_spread_element(self, it);
    }

    // Handed to a function, the row is whatever that function reads of it.
    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        if it
            .arguments
            .iter()
            .any(|argument| argument.as_expression().is_some_and(|e| self.is_row(e)))
        {
            self.found = true;
            return;
        }
        walk::walk_call_expression(self, it);
    }

    fn visit_new_expression(&mut self, it: &NewExpression<'a>) {
        if it
            .arguments
            .iter()
            .any(|argument| argument.as_expression().is_some_and(|e| self.is_row(e)))
        {
            self.found = true;
            return;
        }
        walk::walk_new_expression(self, it);
    }

    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        if !self.found {
            self.element(it);
        }
    }

    fn visit_jsx_fragment(&mut self, it: &JSXFragment<'a>) {
        self.children(&it.children);
    }
}
