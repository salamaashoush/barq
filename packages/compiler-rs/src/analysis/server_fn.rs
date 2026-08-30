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
use rustc_hash::FxHashMap;

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

    // Every top-level binding, and whether it holds a server function. An
    // export can name a binding declared somewhere else in the module —
    // `export { x }`, `export default x` — and answering that from the export
    // alone is impossible. Keyed by `SymbolId` and not by name, for the reason
    // the module header gives: a shadowing declaration must not match.
    let locals = local_bindings(program, factory, &scoping);

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
                            server_fn: declarator.init.as_ref().is_some_and(|init| {
                                holds_server_fn(init, factory, &scoping, &locals)
                            }),
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
                    // `export { x }` names a binding declared elsewhere in the
                    // module, so the answer is that binding's, looked up by
                    // symbol. Recording it as "other" is what let a server
                    // function reach the client: the module then looked
                    // unmixed, no stub was synthesized, nothing was mounted,
                    // and the handler body shipped.
                    //
                    // A binding this module IMPORTED has no local declaration
                    // and so is not in the map — `export { thing }` re-exporting
                    // a sibling module's server function stays "other", which is
                    // what keeps a route module free to re-export its loaders.
                    scan.exports.push(Export {
                        name: name.name.to_string(),
                        span: specifier.span,
                        server_fn: local_symbol(&specifier.local, &scoping)
                            .is_some_and(|symbol| locals.get(&symbol).copied().unwrap_or(false)),
                    });
                }
            }
            Statement::ExportDefaultDeclaration(export) => {
                // `default` IS a name to derive an id from. The id is minted by
                // the compiler out of the module path and this word, never read
                // back off a bundled symbol, so nothing about it depends on what
                // a bundler does to the binding — which is what the previous
                // reasoning here assumed and why a default-exported server
                // function shipped its body to the browser instead.
                scan.exports.push(Export {
                    name: "default".to_string(),
                    span: export.span,
                    server_fn: export
                        .declaration
                        .as_expression()
                        .is_some_and(|init| holds_server_fn(init, factory, &scoping, &locals)),
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

/// Every top-level binding, and whether its initialiser holds a server function.
///
/// One pass, because an export may name a binding declared after it and a
/// second walk to answer that would be the same walk.
fn local_bindings(
    program: &Program<'_>,
    factory: SymbolId,
    scoping: &Scoping,
) -> FxHashMap<SymbolId, bool> {
    let mut locals = FxHashMap::default();
    for statement in &program.body {
        let declaration = match statement {
            Statement::VariableDeclaration(declaration) => &**declaration,
            Statement::ExportDeclaration(export) => match &export.declaration {
                Declaration::VariableDeclaration(declaration) => &**declaration,
                _ => continue,
            },
            _ => continue,
        };
        for declarator in &declaration.declarations {
            let BindingPattern::BindingIdentifier(id) = &declarator.id else { continue };
            let Some(symbol) = id.symbol_id.get() else { continue };
            let held =
                declarator.init.as_ref().is_some_and(|init| rooted_at(init, factory, scoping));
            locals.insert(symbol, held);
        }
    }
    locals
}

/// The symbol an `export { x }` specifier's LOCAL half refers to.
fn local_symbol(name: &ModuleExportName<'_>, scoping: &Scoping) -> Option<SymbolId> {
    match name {
        ModuleExportName::IdentifierReference(reference) => {
            reference.reference_id.get().and_then(|id| scoping.get_reference(id).symbol_id())
        }
        _ => None,
    }
}

/// Whether an expression evaluates to a server function — either the call chain
/// itself, or a name bound to one earlier in the module.
fn holds_server_fn(
    expression: &Expression<'_>,
    factory: SymbolId,
    scoping: &Scoping,
    locals: &FxHashMap<SymbolId, bool>,
) -> bool {
    if rooted_at(expression, factory, scoping) {
        return true;
    }
    let Expression::Identifier(reference) = expression else { return false };
    reference
        .reference_id
        .get()
        .and_then(|id| scoping.get_reference(id).symbol_id())
        .is_some_and(|symbol| locals.get(&symbol).copied().unwrap_or(false))
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

    /// A default export IS a server function, and `default` is the name its id
    /// is derived from.
    ///
    /// This test asserted the opposite until the leak it caused was measured.
    /// The old reasoning was that "a default export has no name that survives a
    /// bundler" — but the id is minted here, out of the module path and this
    /// word, and is never read back off a bundled symbol. What the old rule
    /// actually produced: no server function in the scan, so `mixed()` was
    /// false and no `BARQ012`; nothing to synthesize, so no client stub; and
    /// `namesOf` filtering on `serverFn` meant nothing was mounted. The handler
    /// body and every import it needed shipped to the browser, silently, which
    /// is the leak this design is meant to be structurally immune to.
    #[test]
    fn a_default_export_is_a_server_function() {
        let scan =
            scan_of(&format!("{IMPORT}export default createServerFn().handler(async () => 2);"));
        assert_eq!(scan.server_fns().count(), 1);
        assert_eq!(scan.server_fns().next().unwrap().name, "default");
        assert!(!scan.mixed());
    }

    /// …and it is still a mix when something else is exported beside it.
    #[test]
    fn a_default_server_function_beside_a_component_is_mixed() {
        let scan = scan_of(&format!(
            "{IMPORT}export default createServerFn().handler(async () => 2);\n\
             export function Widget() {{ return null; }}"
        ));
        assert!(scan.mixed());
    }

    /// `export { x }` answers with x's declaration. Recording it as "other" was
    /// the same leak as the default-export one, by the same three steps.
    #[test]
    fn an_indirect_export_of_a_local_server_function_is_one() {
        let scan = scan_of(&format!(
            "{IMPORT}const inner = createServerFn().handler(async () => 1);\n\
             export {{ inner as save }};"
        ));
        assert_eq!(scan.server_fns().count(), 1);
        assert_eq!(scan.server_fns().next().unwrap().name, "save");
    }

    /// But a binding this module IMPORTED has no local declaration, so it stays
    /// "other" — which is what lets a route module re-export the loaders it
    /// imports from a sibling without becoming a server-function module itself.
    #[test]
    fn an_indirect_export_of_an_imported_binding_is_not_one() {
        let scan = scan_of(&format!(
            "{IMPORT}import {{ listUsers }} from './users.ts';\nexport {{ listUsers }};"
        ));
        assert_eq!(scan.server_fns().count(), 0);
    }

    #[test]
    fn the_cheap_question_is_asked_first() {
        assert!(!mentions("export const x = 1;"));
        assert!(mentions("import { createServerFn } from '@barqjs/start';"));
    }
}
