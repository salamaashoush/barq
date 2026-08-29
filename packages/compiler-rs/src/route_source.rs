//! What a route module says about itself, read from its AST.
//!
//! A route module has ONE export and it is called `Route`:
//!
//! ```tsx
//! export const Route = createFileRoute("/posts/$postId")({
//!   ssr: false,
//!   loader: ({ params }) => fetchPost(params.postId),
//!   component: Post,
//! });
//! ```
//!
//! Two things are wanted from it before the module ever loads. `ssr` and
//! `prerender` go in the route table, which is built with no runtime at all,
//! and the module is `lazy()` — so there is no later moment to ask. And the id
//! literal's SPAN, because the generator owns that literal and rewrites it when
//! a file is renamed.
//!
//! THE LIFT HAS NO TANSTACK COUNTERPART. Their `routeTree.gen.ts` imports every
//! route module statically, so `ssr` is an ordinary runtime option they read off
//! the loaded module; their build-time pass over it goes the other way, deleting
//! it from the client bundle (`start-plugin-core/src/vite/start-router-plugin/
//! plugin.ts:166`, `deleteNodes: ['ssr', 'server', 'headers']`). barq's routes
//! are lazy, so barq has to lift the value instead. What IS theirs is the shape
//! of the read — `getCreateFileRouteProps` walks the options `ObjectExpression`
//! and skips computed keys (`router-generator/src/transform/transform.ts:324`).

use oxc::allocator::Allocator;
use oxc::ast::ast::{
    Argument, BindingPattern, Declaration, Expression, ObjectPropertyKind, PropertyKey, Statement,
};
use oxc::parser::Parser;

/// The two declarations a route makes that the TABLE has to carry.
///
/// Both are literals or they are refused. Astro requires exactly
/// `export const prerender = true` and says why in its own error: "Mutable
/// values declared at runtime are not supported." A value the table cannot read
/// is the difference between a page on the CDN and one that 404s, so answering
/// "false, probably" would be the silent failure this channel exists to avoid.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RouteConfig {
    /// `ssr: false` / `ssr: "data-only"`, as the JS literal to re-emit.
    pub ssr: Option<String>,
    pub prerender: Option<bool>,
    /// A declaration that is present but not a literal, for the caller to report.
    pub refused: Vec<String>,
}

/// Which constructor the module called.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RouteKind {
    /// `createFileRoute("<id>")({…})`.
    File,
    /// `createRootRoute({…})` or `createRootRouteWithContext<C>()({…})`.
    Root,
}

/// The id literal as the source spells it, and where it is.
///
/// The span is over the whole argument INCLUDING its quotes, which is what
/// makes the rewrite a byte splice that leaves the rest of the file alone —
/// `s.update(routeIdArg.start, routeIdArg.end, expectedRouteId)` in theirs
/// (`transform.ts:134`). The quote is carried so a project written in single
/// quotes is not reformatted by a rename.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeclaredId {
    pub value: String,
    pub start: u32,
    pub end: u32,
    pub quote: char,
}

/// Everything the scan lifts out of one route file.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RouteModule {
    pub kind: Option<RouteKind>,
    pub id: Option<DeclaredId>,
    pub config: RouteConfig,
    /// `export const ssr` / `export const prerender` at the top level — the old
    /// spelling, which is now BARQ014 rather than a second way to say this.
    pub legacy: Vec<String>,
    /// The option keys the route actually WROTE.
    ///
    /// Emitting a picker for one it did not is not harmless. The router reads an
    /// absent `pendingComponent` as "this boundary shows nothing"
    /// (`router/src/route.ts:257`), and a `lazy()` that resolves to an empty
    /// component is a different answer: a cold `lazy()` throws `NotReadyError`,
    /// which PARKS the loading boundary and renders exactly that fallback. The
    /// whole page came back empty. So the emit asks what was declared, which is
    /// what `getCreateFileRouteProps` collects in theirs
    /// (`router-generator/src/transform/transform.ts:324`).
    pub props: Vec<String>,
}

/// Read a route module.
///
/// A file that exports no `Route` comes back empty rather than as an error: the
/// scan reads every file under the routes directory, and reporting is the
/// caller's to do with the filename in hand.
pub fn read_module(source: &str, filename: &str) -> RouteModule {
    let allocator = Allocator::new();
    let parsed =
        Parser::new(&allocator, source, crate::compile::source_type_for(Some(filename))).parse();
    let mut module = RouteModule::default();

    for statement in &parsed.program.body {
        let Statement::ExportDeclaration(export) = statement else { continue };
        let Declaration::VariableDeclaration(declaration) = &export.declaration else { continue };
        for declarator in &declaration.declarations {
            let BindingPattern::BindingIdentifier(name) = &declarator.id else { continue };
            match name.name.as_str() {
                "Route" => {
                    if let Some(init) = &declarator.init {
                        read_route(init, source, &mut module);
                    }
                }
                // The old spelling. Recorded, not read: a file still carrying it
                // has not been migrated, and honouring it would keep two ways to
                // say the same thing alive in the codebase.
                legacy @ ("ssr" | "prerender") => module.legacy.push(legacy.to_owned()),
                _ => {}
            }
        }
    }
    module
}

/// `createFileRoute(id)(options)`, `createRootRoute(options)`,
/// `createRootRouteWithContext<C>()(options)`.
///
/// The first and the third are the SAME AST — a call whose callee is a call —
/// so the inner callee's name is what tells them apart, and the third is the
/// reason this cannot key on "has an argument".
fn read_route(init: &Expression, source: &str, module: &mut RouteModule) {
    let Expression::CallExpression(outer) = init.without_parentheses() else { return };

    match outer.callee.without_parentheses() {
        // Curried: `createFileRoute("/x")({…})` / `createRootRouteWithContext<C>()({…})`.
        Expression::CallExpression(inner) => {
            let Expression::Identifier(callee) = inner.callee.without_parentheses() else { return };
            match callee.name.as_str() {
                "createFileRoute" => {
                    module.kind = Some(RouteKind::File);
                    module.id = inner.arguments.first().and_then(|arg| declared_id(arg, source));
                }
                "createRootRouteWithContext" => module.kind = Some(RouteKind::Root),
                _ => return,
            }
        }
        // Direct: `createRootRoute({…})`.
        Expression::Identifier(callee) if callee.name == "createRootRoute" => {
            module.kind = Some(RouteKind::Root);
        }
        _ => return,
    }

    if let Some(Argument::ObjectExpression(options)) = outer.arguments.first() {
        module.config = read_config(options);
        module.props = declared_props(options);
    }
}

fn declared_id(argument: &Argument, source: &str) -> Option<DeclaredId> {
    let Argument::StringLiteral(literal) = argument else { return None };
    let start = literal.span.start;
    let end = literal.span.end;
    // The quote as WRITTEN, not as the AST would re-print it. A rename must not
    // reformat a file that uses single quotes.
    let quote = source[start as usize..].chars().next().unwrap_or('"');
    Some(DeclaredId { value: literal.value.to_string(), start, end, quote })
}

/// `ssr` and `prerender` out of the options object, and only as literals.
fn read_config(options: &oxc::ast::ast::ObjectExpression) -> RouteConfig {
    let mut config = RouteConfig::default();
    for property in &options.properties {
        let ObjectPropertyKind::ObjectProperty(property) = property else { continue };
        // A computed key is not a declaration this can read, and skipping it is
        // what theirs does too (`transform.ts:334`).
        if property.computed {
            continue;
        }
        let name = match &property.key {
            PropertyKey::StaticIdentifier(key) => key.name.as_str(),
            PropertyKey::StringLiteral(key) => key.value.as_str(),
            _ => continue,
        };
        match name {
            "ssr" => match literal_ssr(&property.value) {
                Some(value) => config.ssr = Some(value),
                None => config.refused.push("ssr".to_owned()),
            },
            "prerender" => match &property.value {
                Expression::BooleanLiteral(value) => config.prerender = Some(value.value),
                _ => config.refused.push("prerender".to_owned()),
            },
            _ => {}
        }
    }
    config
}

/// Every non-computed key the options object writes.
fn declared_props(options: &oxc::ast::ast::ObjectExpression) -> Vec<String> {
    let mut out = Vec::new();
    for property in &options.properties {
        let ObjectPropertyKind::ObjectProperty(property) = property else { continue };
        if property.computed {
            continue;
        }
        match &property.key {
            PropertyKey::StaticIdentifier(key) => out.push(key.name.to_string()),
            PropertyKey::StringLiteral(key) => out.push(key.value.to_string()),
            _ => {}
        }
    }
    out
}

fn literal_ssr(value: &Expression) -> Option<String> {
    match value {
        Expression::BooleanLiteral(value) => Some(value.value.to_string()),
        Expression::StringLiteral(value) if value.value == "data-only" => {
            Some("\"data-only\"".to_owned())
        }
        _ => None,
    }
}

/// Rewrite the id literal in place, returning the new source.
///
/// A byte splice on the span so the rest of the file is untouched — comments,
/// formatting and the author's quote style included. This is `MagicString`'s
/// `s.update(start, end, next)` in theirs (`transform.ts:134-139`), and the
/// reason the generator can own this literal at all: a rename edits one token.
pub fn rewrite_id(source: &str, id: &DeclaredId, next: &str) -> String {
    let mut out = String::with_capacity(source.len() + next.len());
    out.push_str(&source[..id.start as usize]);
    out.push(id.quote);
    for character in next.chars() {
        if character == id.quote || character == '\\' {
            out.push('\\');
        }
        out.push(character);
    }
    out.push(id.quote);
    out.push_str(&source[id.end as usize..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(source: &str) -> RouteModule {
        read_module(source, "route.tsx")
    }

    #[test]
    fn a_file_route_yields_its_id_and_its_config() {
        let module = read(
            "export const Route = createFileRoute(\"/posts/$postId\")({\n  ssr: false,\n  prerender: true,\n  component: Post,\n});\n",
        );
        assert_eq!(module.kind, Some(RouteKind::File));
        let id = module.id.expect("an id");
        assert_eq!(id.value, "/posts/$postId");
        assert_eq!(id.quote, '"');
        assert_eq!(module.config.ssr.as_deref(), Some("false"));
        assert_eq!(module.config.prerender, Some(true));
        assert!(module.config.refused.is_empty());
        assert_eq!(module.props, ["ssr", "prerender", "component"]);
    }

    /// What a route did NOT declare matters as much as what it did: the router
    /// reads an absent `pendingComponent` as "show nothing", and a picker that
    /// always resolves is a different answer.
    #[test]
    fn the_keys_a_route_did_not_write_are_absent() {
        let module = read("export const Route = createFileRoute('/a')({ component: A });");
        assert_eq!(module.props, ["component"]);
        assert!(!module.props.iter().any(|prop| prop == "pendingComponent"));
    }

    #[test]
    fn the_quote_is_the_one_the_author_wrote() {
        let module = read("export const Route = createFileRoute('/a')({});");
        assert_eq!(module.id.expect("an id").quote, '\'');
    }

    #[test]
    fn data_only_is_the_one_string_ssr_accepts() {
        let module = read("export const Route = createFileRoute('/a')({ ssr: 'data-only' });");
        assert_eq!(module.config.ssr.as_deref(), Some("\"data-only\""));
    }

    /// A value the table cannot read is refused rather than guessed at.
    #[test]
    fn a_computed_declaration_is_refused_not_guessed() {
        let module = read(
            "export const Route = createFileRoute('/a')({ ssr: MODE, prerender: shouldPrerender() });",
        );
        assert_eq!(module.config.ssr, None);
        assert_eq!(module.config.prerender, None);
        assert_eq!(module.config.refused, ["ssr", "prerender"]);
    }

    #[test]
    fn both_root_constructors_are_the_root_and_neither_has_an_id() {
        for source in [
            "export const Route = createRootRoute({ ssr: false });",
            "export const Route = createRootRouteWithContext<Ctx>()({ ssr: false });",
        ] {
            let module = read(source);
            assert_eq!(module.kind, Some(RouteKind::Root), "{source}");
            assert_eq!(module.id, None, "{source}");
            assert_eq!(module.config.ssr.as_deref(), Some("false"), "{source}");
        }
    }

    /// The old spelling is recorded so the caller can report it, and is NOT read.
    #[test]
    fn a_top_level_export_is_legacy_and_does_not_configure_the_route() {
        let module = read("export const ssr = false;\nexport const prerender = true;\n");
        assert_eq!(module.legacy, ["ssr", "prerender"]);
        assert_eq!(module.config, RouteConfig::default());
        assert_eq!(module.kind, None);
    }

    #[test]
    fn a_module_with_no_route_export_is_empty() {
        let module = read("export function helper() {}\nexport default 1;\n");
        assert_eq!(module, RouteModule::default());
    }

    #[test]
    fn a_rewrite_touches_the_literal_and_nothing_else() {
        let source = "// a comment\nexport const Route = createFileRoute('/posts/$postId')({\n  component: Post,\n});\n";
        let id = read(source).id.expect("an id");
        assert_eq!(
            rewrite_id(source, &id, "/posts/$id"),
            "// a comment\nexport const Route = createFileRoute('/posts/$id')({\n  component: Post,\n});\n"
        );
    }

    /// The id is generator-owned and derived from a FILENAME, which can hold a
    /// quote. Splicing one in unescaped would write a file that does not parse.
    #[test]
    fn a_quote_in_the_new_id_is_escaped() {
        let source = "export const Route = createFileRoute('/a')({});";
        let id = read(source).id.expect("an id");
        assert_eq!(
            rewrite_id(source, &id, "/it's"),
            "export const Route = createFileRoute('/it\\'s')({});"
        );
    }
}
