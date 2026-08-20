//! Which exports of this module are server functions.
//!
//! The question decides two things. What the build mounts — `@barqjs/start`
//! registers one endpoint per EXPORTED server function, so the export list is
//! the public surface and a build wants it recorded. And whether the module can
//! have a client half synthesized at all, which is what `BARQ012` is about.
//!
//! Resolution is by `SymbolId` and not by name. A scan for the text
//! `createServerFn` would match a local of that name, a property, or a comment;
//! the binder resolves the import to a symbol and every candidate call back to
//! the same one, so a shadowing declaration is not a false positive and an
//! aliased import (`createServerFn as rpc`) is not a false negative.

use oxc::ast::ast::{
    BindingPattern, Declaration, Expression, ImportDeclarationSpecifier, ModuleExportName, Program,
    Statement,
};
use oxc::semantic::{Scoping, SemanticBuilder, SymbolId};
use oxc::span::Span;

/// One export, and whether it is a server function.
pub struct Export {
    pub name: String,
    pub span: Span,
    pub server_fn: bool,
}

#[derive(Default)]
pub struct Scan {
    pub exports: Vec<Export>,
}

impl Scan {
    pub fn server_fns(&self) -> impl Iterator<Item = &Export> {
        self.exports.iter().filter(|export| export.server_fn)
    }

    pub fn others(&self) -> impl Iterator<Item = &Export> {
        self.exports.iter().filter(|export| !export.server_fn)
    }

    /// A module the client half cannot be synthesized from: it carries server
    /// functions AND something else, so replacing it wholesale would delete the
    /// something else and pruning it is the strategy this design rejects.
    pub fn mixed(&self) -> bool {
        self.server_fns().next().is_some() && self.others().next().is_some()
    }
}

/// The cheap question asked before the expensive one. A module that never
/// mentions the name cannot import it, and building a symbol table to discover
/// that is pure cost — the same trade `Suppressions::scan` makes for its
/// directive.
pub fn mentions(source: &str) -> bool {
    source.contains("createServerFn")
}

pub fn scan(program: &Program<'_>, start_source: &str) -> Scan {
    // Semantic first: `symbol_id` is what it populates, so asking an import
    // specifier for one before it has run reads an empty cell and finds nothing.
    let scoping = SemanticBuilder::new().build(program).semantic.into_scoping();
    let Some(factory) = imported_factory(program, start_source) else {
        return Scan::default();
    };

    let mut scan = Scan::default();
    for statement in &program.body {
        match statement {
            Statement::ExportDeclaration(export) => match &export.declaration {
                Declaration::VariableDeclaration(declaration) => {
                    for declarator in &declaration.declarations {
                        let BindingPattern::BindingIdentifier(id) = &declarator.id else {
                            continue;
                        };
                        scan.exports.push(Export {
                            name: id.name.to_string(),
                            span: id.span,
                            server_fn: declarator
                                .init
                                .as_ref()
                                .is_some_and(|init| rooted_at(init, factory, &scoping)),
                        });
                    }
                }
                declaration => {
                    // A function or class declaration is never a server
                    // function: the builder returns a value, and a declaration
                    // is not one.
                    if let Some(id) = declaration_name(declaration) {
                        scan.exports.push(Export { name: id.0, span: id.1, server_fn: false });
                    }
                }
            },
            Statement::ExportNamedDeclaration(export) => {
                for specifier in &export.specifiers {
                    let ModuleExportName::IdentifierName(name) = &specifier.exported else {
                        continue;
                    };
                    // `export { x }` re-exports a binding declared elsewhere in
                    // the module. Whether that binding holds a server function
                    // is a question about its declaration, which the variable
                    // arm above already answered when it was an exported one —
                    // an indirect export is recorded as "other" rather than
                    // guessed at.
                    scan.exports.push(Export {
                        name: name.name.to_string(),
                        span: specifier.span,
                        server_fn: false,
                    });
                }
            }
            Statement::ExportDefaultDeclaration(export) => {
                // A mounted server function needs a name to derive an id from,
                // and a default export has none that survives a bundler.
                scan.exports.push(Export {
                    name: "default".to_string(),
                    span: export.span,
                    server_fn: false,
                });
            }
            _ => {}
        }
    }
    scan
}

fn declaration_name(declaration: &Declaration<'_>) -> Option<(String, Span)> {
    match declaration {
        Declaration::FunctionDeclaration(function) => {
            function.id.as_ref().map(|id| (id.name.to_string(), id.span))
        }
        Declaration::ClassDeclaration(class) => {
            class.id.as_ref().map(|id| (id.name.to_string(), id.span))
        }
        _ => None,
    }
}

/// The local symbol `createServerFn` was imported as, if it was.
fn imported_factory(program: &Program<'_>, start_source: &str) -> Option<SymbolId> {
    for statement in &program.body {
        let Statement::ImportDeclaration(declaration) = statement else { continue };
        if declaration.source.value.as_str() != start_source {
            continue;
        }
        let Some(specifiers) = declaration.specifiers.as_ref() else { continue };
        for specifier in specifiers {
            let ImportDeclarationSpecifier::ImportSpecifier(imported) = specifier else { continue };
            let ModuleExportName::IdentifierName(name) = &imported.imported else { continue };
            if name.name.as_str() != "createServerFn" {
                continue;
            }
            if let Some(symbol) = imported.local.symbol_id.get() {
                return Some(symbol);
            }
        }
    }
    None
}

/// Whether an expression is a call chain whose root callee is `factory`.
///
/// `createServerFn().validator(s).handler(f)` is a `CallExpression` whose callee
/// is a member of a call of a member of … of an `IdentifierReference`. Walking
/// to that identifier and comparing symbols is what makes `.handler(` on some
/// unrelated object not a match — the shape TanStack's regex prescan
/// (`\.\s*handler\s*\(`) cannot tell apart.
fn rooted_at(expression: &Expression<'_>, factory: SymbolId, scoping: &Scoping) -> bool {
    let mut current = expression;
    loop {
        match current {
            Expression::ParenthesizedExpression(inner) => current = &inner.expression,
            Expression::CallExpression(call) => current = &call.callee,
            Expression::StaticMemberExpression(member) => current = &member.object,
            Expression::Identifier(reference) => {
                return reference
                    .reference_id
                    .get()
                    .and_then(|id| scoping.get_reference(id).symbol_id())
                    .is_some_and(|symbol| symbol == factory);
            }
            _ => return false,
        }
    }
}

/// Where to point `BARQ012`: the first export that is not a server function.
pub fn first_other(scan: &Scan) -> Option<Span> {
    scan.others().next().map(|export| export.span)
}

#[cfg(test)]
mod tests {
    use super::*;
    use oxc::allocator::Allocator;
    use oxc::parser::Parser;
    use oxc::span::SourceType;

    fn scan_of(source: &str) -> Scan {
        let allocator = Allocator::new();
        let parsed = Parser::new(&allocator, source, SourceType::ts()).parse();
        scan(&parsed.program, "@barqjs/start")
    }

    const IMPORT: &str = "import { createServerFn } from '@barqjs/start';\n";

    #[test]
    fn an_exported_builder_chain_is_a_server_function() {
        let scan = scan_of(&format!(
            "{IMPORT}export const getUser = createServerFn().validator(s).handler(async () => 1);"
        ));
        let names: Vec<&str> = scan.server_fns().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["getUser"]);
        assert!(!scan.mixed());
    }

    /// Export-ness decides the mounted surface: an unexported one has no id and
    /// no endpoint, and is still callable from its siblings.
    #[test]
    fn a_non_exported_server_function_is_not_in_the_surface() {
        let scan = scan_of(&format!(
            "{IMPORT}const internal = createServerFn().handler(async () => 1);\n\
             export const shown = createServerFn().handler(async () => 2);"
        ));
        let names: Vec<&str> = scan.server_fns().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["shown"]);
    }

    /// The reason resolution is by `SymbolId`. A scan for the TEXT
    /// `createServerFn` matches this and is wrong; the binder finds no import to
    /// resolve against, so nothing here is a server function.
    #[test]
    fn a_local_of_the_same_name_is_not_the_factory() {
        let scan = scan_of(
            "const createServerFn = () => ({ handler: (f) => f });\n\
             export const nope = createServerFn().handler(async () => 1);",
        );
        assert_eq!(scan.server_fns().count(), 0);
    }

    /// The other half of the same reason: an alias is still the same symbol, and
    /// a name match would miss it.
    #[test]
    fn an_aliased_import_is_still_the_factory() {
        let scan = scan_of(
            "import { createServerFn as rpc } from '@barqjs/start';\n\
             export const go = rpc().handler(async () => 1);",
        );
        assert_eq!(scan.server_fns().count(), 1);
    }

    #[test]
    fn a_component_beside_a_server_function_is_a_mix() {
        let scan = scan_of(&format!(
            "{IMPORT}export const save = createServerFn().handler(async () => 1);\n\
             export function Widget() {{ return null; }}"
        ));
        assert!(scan.mixed());
        let others: Vec<&str> = scan.others().map(|e| e.name.as_str()).collect();
        assert_eq!(others, vec!["Widget"]);
        assert!(first_other(&scan).is_some());
    }

    /// A module with no server functions is not a mix however much else it
    /// exports — the rule is about synthesis, and there is nothing to synthesize.
    #[test]
    fn a_module_with_no_server_functions_is_never_mixed() {
        let scan = scan_of("export function Widget() { return null; }\nexport const x = 1;");
        assert!(!scan.mixed());
    }

    /// A default export has no name that survives a bundler, so it cannot carry
    /// an id — and a module that mixes one with a server function is a mix.
    #[test]
    fn a_default_export_is_not_a_server_function() {
        let scan = scan_of(&format!(
            "{IMPORT}export const save = createServerFn().handler(async () => 1);\n\
             export default createServerFn().handler(async () => 2);"
        ));
        assert!(scan.mixed());
    }

    #[test]
    fn the_cheap_question_is_asked_first() {
        assert!(!mentions("export const x = 1;"));
        assert!(mentions("import { createServerFn } from '@barqjs/start';"));
    }
}
