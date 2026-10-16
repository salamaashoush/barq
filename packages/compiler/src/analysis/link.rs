//! `BARQ013` — a `<Link to>` that names a path no route matches.
//!
//! The compiler sees one module and the route set is a whole-project fact, so
//! the table arrives as `options.routes` rather than being discovered. Absent
//! turns the check off entirely: a project with no route table must not get a
//! warning on every link it writes.
//!
//! Resolution is by `SymbolId` against `routerSource`, like everything else
//! here. A component named `Link` that came from somewhere else is not this
//! `Link`, and `import { Link as Anchor }` still is.
//!
//! Raised from the driver rather than from `bind`'s rule set, for BARQ012's
//! reason: `bind`'s rules are gated on `options.diagnostics`, which defaults to
//! `dev`, and a link check that only runs in development is a link check that
//! never fails a build.

use oxc::ast::AstKind;
use oxc::ast::ast::{
    Expression, ImportDeclarationSpecifier, JSXAttributeItem, JSXAttributeName, JSXAttributeValue,
    JSXElementName, ModuleExportName, Program, Statement,
};
use oxc::ast_visit::Visit;
use oxc::semantic::{Scoping, SemanticBuilder, SymbolId};
use oxc::span::Span;

/// One `<Link to="…">` whose literal matched nothing.
pub struct Unknown {
    pub to: String,
    pub span: Span,
}

/// The components whose `to` is a route.
const LINK_NAMES: [&str; 2] = ["Link", "NavLink"];

/// The cheap question first, as `server_fn::mentions` does.
pub fn mentions(source: &str) -> bool {
    source.contains("Link")
}

pub fn scan(program: &Program<'_>, router_source: &str, routes: &[String]) -> Vec<Unknown> {
    let scoping = SemanticBuilder::new().build(program).semantic.into_scoping();
    let links = imported_links(program, router_source);
    if links.is_empty() {
        return Vec::new();
    }

    let mut visitor = LinkVisitor { scoping: &scoping, links, routes, found: Vec::new() };
    visitor.visit_program(program);
    visitor.found
}

struct LinkVisitor<'a> {
    scoping: &'a Scoping,
    links: Vec<SymbolId>,
    routes: &'a [String],
    found: Vec<Unknown>,
}

impl<'a> Visit<'a> for LinkVisitor<'_> {
    fn enter_node(&mut self, kind: AstKind<'a>) {
        let AstKind::JSXElement(element) = kind else { return };
        let JSXElementName::IdentifierReference(name) = &element.opening_element.name else {
            return;
        };
        let Some(symbol) =
            name.reference_id.get().and_then(|id| self.scoping.get_reference(id).symbol_id())
        else {
            return;
        };
        if !self.links.contains(&symbol) {
            return;
        }

        for item in &element.opening_element.attributes {
            let JSXAttributeItem::Attribute(attribute) = item else { continue };
            let JSXAttributeName::Identifier(slot) = &attribute.name else { continue };
            if slot.name.as_str() != "to" {
                continue;
            }
            // A literal only. `to={somePath}` is a value the compiler cannot
            // know, and guessing at it is how a check becomes noise.
            let Some(literal) = literal_of(attribute.value.as_ref()) else { continue };
            // A path that leaves the application is not a route.
            if literal.starts_with('#')
                || literal.starts_with("//")
                || literal.contains("://")
                || literal.starts_with("mailto:")
                || literal.starts_with("tel:")
            {
                continue;
            }
            // A relative link resolves against a location the compiler does not
            // know either.
            if !literal.starts_with('/') {
                continue;
            }
            if !self.routes.iter().any(|route| matches(route, &literal)) {
                self.found.push(Unknown { to: literal, span: attribute.span });
            }
        }
    }
}

fn literal_of(value: Option<&JSXAttributeValue<'_>>) -> Option<String> {
    match value? {
        JSXAttributeValue::StringLiteral(string) => Some(string.value.to_string()),
        JSXAttributeValue::ExpressionContainer(container) => {
            match container.expression.as_expression()? {
                Expression::StringLiteral(string) => Some(string.value.to_string()),
                _ => None,
            }
        }
        _ => None,
    }
}

/// The local symbols `Link` / `NavLink` were imported as.
fn imported_links(program: &Program<'_>, router_source: &str) -> Vec<SymbolId> {
    let mut out = Vec::new();
    for statement in &program.body {
        let Statement::ImportDeclaration(declaration) = statement else { continue };
        if declaration.source.value.as_str() != router_source {
            continue;
        }
        let Some(specifiers) = declaration.specifiers.as_ref() else { continue };
        for specifier in specifiers {
            let ImportDeclarationSpecifier::ImportSpecifier(imported) = specifier else { continue };
            let ModuleExportName::IdentifierName(name) = &imported.imported else { continue };
            if !LINK_NAMES.contains(&name.name.as_str()) {
                continue;
            }
            if let Some(symbol) = imported.local.symbol_id.get() {
                out.push(symbol);
            }
        }
    }
    out
}

/// Whether a concrete path matches a route PATTERN.
///
/// The same rule the runtime matcher applies, minus the ranking: `$name` takes
/// one segment, a bare `$` takes the rest. A `to` written as the pattern itself
/// (`/users/$id`, which is what `<Link to>` takes with `params`) matches too,
/// because the segments compare equal.
pub fn matches(pattern: &str, path: &str) -> bool {
    let pattern_segments: Vec<&str> = pattern.split('/').filter(|s| !s.is_empty()).collect();
    let path_segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();

    let mut index = 0;
    for segment in &pattern_segments {
        if *segment == "$" {
            // A splat takes everything that is left, including nothing.
            return true;
        }
        if index >= path_segments.len() {
            return false;
        }
        if !segment.starts_with('$') && *segment != path_segments[index] {
            return false;
        }
        index += 1;
    }
    index == path_segments.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pattern_matches_a_concrete_path() {
        assert!(matches("/users/$id", "/users/7"));
        assert!(matches("/users/$id", "/users/$id"));
        assert!(matches("/", "/"));
        assert!(matches("/files/$", "/files/a/b"));
        assert!(matches("/files/$", "/files"));
    }

    #[test]
    fn and_refuses_one_it_does_not() {
        assert!(!matches("/users/$id", "/users"));
        assert!(!matches("/users/$id", "/users/7/edit"));
        assert!(!matches("/users", "/user"));
        assert!(!matches("/", "/about"));
    }
}
