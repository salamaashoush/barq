//! BARQ026: markup the browser's HTML parser builds differently from the JSX.
//!
//! The DOM backend never meets it: it splits such an element out of the
//! template and inserts it, which builds exactly what the JSX says. The server
//! writes the markup as a string and the browser parses it, so a `<div>` in a
//! `<p>` arrives as `<p></p><div></div><p></p>`, and hydration walks a tree that
//! is not the one the component builds. The question is the one
//! `lower::parse::reshape` already answers for the template gate, asked of every
//! element where its parent is known: inside the same JSX tree, through the
//! conditionals and list callbacks that place JSX where they stand.

use oxc::allocator::Allocator;
use oxc::ast::ast::{
    Argument, ArrowFunctionExpression, Expression, JSXChild, JSXElement, JSXElementName,
    JSXExpression, JSXFragment, Program,
};
use oxc::ast_visit::{Visit, walk};
use oxc::span::GetSpan;

use crate::diag::Code;
use crate::ir::Diag;
use crate::lower::parse::{Context, Reshape, reshape};
use crate::tables::is_svg_tag;

pub(super) fn check<'a>(allocator: &'a Allocator, program: &Program<'a>) -> Vec<Diag<'a>> {
    let mut nesting = Nesting { allocator, diagnostics: Vec::new() };
    nesting.visit_program(program);
    nesting.diagnostics
}

struct Nesting<'a> {
    allocator: &'a Allocator,
    diagnostics: Vec<Diag<'a>>,
}

impl<'a> Visit<'a> for Nesting<'a> {
    fn visit_jsx_element(&mut self, element: &JSXElement<'a>) {
        self.element(element, Context::default());
    }

    fn visit_jsx_fragment(&mut self, fragment: &JSXFragment<'a>) {
        self.children(&fragment.children, Context::default());
    }
}

impl<'a> Nesting<'a> {
    fn element(&mut self, element: &JSXElement<'a>, at: Context<'a>) {
        let opening = &element.opening_element;
        // A component places its children wherever it renders them, which is
        // not knowable here: they start a tree of their own.
        let JSXElementName::Identifier(name) = &opening.name else {
            for attribute in &opening.attributes {
                self.visit_jsx_attribute_item(attribute);
            }
            self.children(&element.children, Context::default());
            return;
        };
        let tag = name.name.as_str();
        if let Some(how) = reshape(tag, at)
            && !document_structure(tag, at)
        {
            self.report(tag, at, how, opening.span);
        }
        for attribute in &opening.attributes {
            self.visit_jsx_attribute_item(attribute);
        }
        self.children(&element.children, at.inside(tag, is_svg_tag(tag)));
    }

    fn children(&mut self, children: &[JSXChild<'a>], at: Context<'a>) {
        for child in children {
            match child {
                JSXChild::Element(element) => self.element(element, at),
                JSXChild::Fragment(fragment) => self.children(&fragment.children, at),
                JSXChild::ExpressionContainer(container) => match &container.expression {
                    JSXExpression::EmptyExpression(_) => {}
                    expression => {
                        if let Some(expression) = expression.as_expression() {
                            self.placed(expression, at);
                        }
                    }
                },
                JSXChild::Spread(spread) => self.placed(&spread.expression, at),
                JSXChild::Text(_) => {}
            }
        }
    }

    /// An expression whose JSX is inserted at `at`: a conditional's branches, a
    /// logical's operands and a list callback's result. Anything else is walked
    /// for JSX of its own.
    fn placed(&mut self, expression: &Expression<'a>, at: Context<'a>) {
        match expression {
            Expression::JSXElement(element) => self.element(element, at),
            Expression::JSXFragment(fragment) => self.children(&fragment.children, at),
            Expression::ParenthesizedExpression(inner) => self.placed(&inner.expression, at),
            Expression::LogicalExpression(logical) => {
                self.placed(&logical.left, at);
                self.placed(&logical.right, at);
            }
            Expression::ConditionalExpression(conditional) => {
                self.visit_expression(&conditional.test);
                self.placed(&conditional.consequent, at);
                self.placed(&conditional.alternate, at);
            }
            Expression::CallExpression(call) => {
                self.visit_expression(&call.callee);
                for argument in &call.arguments {
                    match argument {
                        Argument::ArrowFunctionExpression(arrow) => self.callback(arrow, at),
                        other => self.visit_argument(other),
                    }
                }
            }
            other => walk::walk_expression(self, other),
        }
    }

    fn callback(&mut self, arrow: &ArrowFunctionExpression<'a>, at: Context<'a>) {
        let Some(body) = arrow.body.as_expression() else {
            self.visit_arrow_function_expression(arrow);
            return;
        };
        self.visit_formal_parameters(&arrow.params);
        self.placed(body, at);
    }

    fn report(&mut self, tag: &str, at: Context<'a>, how: Reshape, span: oxc::span::Span) {
        let parent = at.parent.unwrap_or("page");
        let what = match how {
            Reshape::Never => format!(
                "`<{tag}>` is never an element of its own inside a page: the browser's HTML parser \
                 merges its attributes into the document's own `<{tag}>` or drops the tag."
            ),
            Reshape::Misplaced => format!(
                "`<{tag}>` cannot be a child of `<{parent}>`: the browser's HTML parser moves it \
                 out, wraps it in an element it implies (a `<tr>` directly in a `<table>` gets a \
                 `<tbody>`), or drops its tag."
            ),
            Reshape::ClosesP => format!(
                "`<{tag}>` cannot be inside a `<p>`: the browser's HTML parser closes the paragraph \
                 at `<{tag}>`, so the `<{tag}>` lands after the `<p>` and the `</p>` that follows \
                 opens an empty one."
            ),
            Reshape::ClosesOuter => format!(
                "`<{tag}>` cannot be inside another `<{tag}>`: the browser's HTML parser closes the \
                 outer one first, so the two end up side by side."
            ),
        };
        let fix = match how {
            Reshape::Never => format!(
                "Write `<{tag}>` only as part of the document itself: `<html>` at the root of the \
                 component that renders the document, with `<head>` and `<body>` directly in it."
            ),
            _ => format!(
                "Move the `<{tag}>` out of the `<{parent}>`, or change the outer element (a \
                 `<div>` in place of a `<p>`, a `<span>` in place of an inner link)."
            ),
        };
        let message = format!(
            "{what} A server-rendered page then hydrates against a tree that is not the one this \
             JSX builds, which is a hydration mismatch and a full re-render in the browser. {fix}"
        );
        let span = span.span();
        let message = self.allocator.alloc_str(&message) as &'a str;
        self.diagnostics.push(Diag { code: Code::Barq026, span, message });
    }
}

/// The document's own structure, which a component that renders the whole
/// document writes and the browser parses as the document it is.
fn document_structure(tag: &str, at: Context<'_>) -> bool {
    match tag {
        "html" => at.parent.is_none(),
        "head" | "body" => at.parent == Some("html"),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use crate::compile::compile;
    use crate::options::ResolvedOptions;

    fn codes(source: &str) -> Vec<(String, String)> {
        let options = ResolvedOptions { ssr: true, ..ResolvedOptions::with_filename("n.tsx") };
        match compile(source, &options) {
            Ok(output) => output.warnings,
            Err(diagnostics) => diagnostics,
        }
        .into_iter()
        .filter(|diagnostic| diagnostic.code.map(|code| code.as_str()) == Some("BARQ026"))
        .map(|diagnostic| (diagnostic.severity.as_str().to_string(), diagnostic.message))
        .collect()
    }

    #[test]
    fn a_block_in_a_paragraph_is_an_error_that_says_what_the_parser_does() {
        let found = codes("export const A = () => <p>Hello <div>salama</div></p>;\n");
        assert_eq!(found.len(), 1, "{found:?}");
        let (level, message) = &found[0];
        assert_eq!(level, "error");
        assert!(message.starts_with("`<div>` cannot be inside a `<p>`: the browser's HTML parser"));
        assert!(message.contains("hydration mismatch"), "{message}");
        assert!(message.contains("Move the `<div>` out of the `<p>`"), "{message}");
    }

    #[test]
    fn table_parts_nested_links_and_buttons_are_caught() {
        assert_eq!(codes("export const A = () => <table><tr><td>x</td></tr></table>;").len(), 1);
        assert_eq!(codes("export const A = () => <div><td>x</td></div>;").len(), 1);
        assert_eq!(
            codes("export const A = () => <a href=\"/\"><a href=\"/b\">x</a></a>;").len(),
            1
        );
        assert_eq!(codes("export const A = () => <button><button>x</button></button>;").len(), 1);
        assert_eq!(codes("export const A = () => <ul><li><li>x</li></li></ul>;").len(), 1);
    }

    #[test]
    fn jsx_placed_by_a_conditional_or_a_list_is_followed() {
        let source = "export const A = (props) => <p>{props.on && <div>a</div>}{props.items.map((item) => <section>{item}</section>)}{props.x ? <h1>t</h1> : null}</p>;";
        assert_eq!(codes(source).len(), 3);
    }

    #[test]
    fn a_document_component_is_quiet_and_a_stray_body_is_not() {
        let document = "export const Doc = () => <html><head><title>salama</title></head>\
                        <body><main>x</main></body></html>;";
        assert_eq!(codes(document), Vec::<(String, String)>::new());
        let stray = codes("export const A = () => <div><body>x</body></div>;");
        assert_eq!(stray.len(), 1, "{stray:?}");
        assert!(stray[0].1.contains("Write `<body>` only as part of the document itself"));
    }

    #[test]
    fn valid_markup_and_component_children_are_quiet() {
        let source = "const Card = (props) => <div>{props.children}</div>;\n\
                      export const A = () => <><p><span>a</span><b>b</b></p>\
                      <table><tbody><tr><td><div>x</div></td></tr></tbody></table>\
                      <p><Card><div>inside a component</div></Card></p>\
                      <svg><a href=\"/\"><a href=\"/b\">x</a></a></svg></>;";
        assert_eq!(codes(source), Vec::<(String, String)>::new());
    }
}
