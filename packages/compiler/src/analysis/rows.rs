use oxc::ast::ast::{
    ArrowFunctionBody, ArrowFunctionExpression, AssignmentExpression, AssignmentTarget,
    BindingPattern, CallExpression, Class, ComputedMemberExpression, Expression, FormalParameters,
    Function, FunctionBody, JSXChild, JSXElement, JSXElementName, JSXFragment,
    JSXMemberExpressionObject, NewExpression, PrivateFieldExpression, SpreadElement,
    StaticMemberExpression, VariableDeclarator,
};
use oxc::ast_visit::{Visit, walk};
use oxc::semantic::{ScopeFlags, Scoping, SymbolId};

use super::symbol_of;

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
///
/// The callback's parameter is typed as a row whether it is written inline or
/// passed by name, so a field read in a JSX hole, whether a child, an element
/// attribute or a component prop, is emitted as a read that is repeated when the
/// field changes. Only the markup around the holes is built once. A handler or
/// a `ref` in a hole is handed over once whatever its source, a signal's
/// included, so a row field read there is not a row going stale either.
pub(super) fn reads_fields_once(
    scoping: &Scoping,
    params: &FormalParameters<'_>,
    body: Body<'_, '_>,
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
    let mut scan = Scan { scoping, row, found: false };
    match body {
        Body::Block(body) => scan.visit_function_body(body),
        Body::Arrow(body) => scan.visit_arrow_function_body(body),
    }
    scan.found
}

struct Scan<'s> {
    scoping: &'s Scoping,
    row: SymbolId,
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

    fn children(&mut self, children: &[JSXChild<'_>]) {
        for child in children {
            match child {
                JSXChild::Element(element) => self.visit_jsx_element(element),
                JSXChild::Fragment(fragment) => self.visit_jsx_fragment(fragment),
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
        if self.tag_reads_row(&it.opening_element.name) {
            self.found = true;
            return;
        }
        self.children(&it.children);
    }

    fn visit_jsx_fragment(&mut self, it: &JSXFragment<'a>) {
        self.children(&it.children);
    }
}
