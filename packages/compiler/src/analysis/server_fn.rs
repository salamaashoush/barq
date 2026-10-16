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
    Argument, BindingPattern, Declaration, Expression, ImportDeclarationSpecifier,
    ModuleExportName, ObjectPropertyKind, Program, Statement,
};
use oxc::semantic::{Scoping, SemanticBuilder, SymbolId};
use oxc::span::Span;
use rustc_hash::FxHashMap;

/// One export, and whether it is a server function.
pub struct Export {
    pub name: String,
    pub span: Span,
    pub server_fn: bool,
    /// The identifiers this function's `.middleware([…])` named, in order.
    ///
    /// Recorded so the CLIENT stub can carry the chain: a middleware's
    /// `.client()` half runs in the browser, and the stub is synthesized from
    /// nothing, so a chain it does not name is a chain that cannot run.
    ///
    /// EMPTY WHEN IT CANNOT BE LIFTED. `.middleware([a, b])` is an array of
    /// plain identifiers and is the shape every application writes;
    /// `.middleware(chain)` and `.middleware([...rest])` are runtime
    /// expressions and this records nothing for them. That fails in the safe
    /// direction — a client half that does not run, rather than a stub naming a
    /// binding that is not there — and it is the same line the route-action
    /// verifier draws for the same reason.
    pub middleware: Vec<String>,
    /// `"GET"` unless the factory was called `createServerFn({ method: "POST" })`.
    ///
    /// The client stub has to send the method the server answers, and it is
    /// synthesized from nothing, so the method is read here. `GET` is the
    /// default, as it is TanStack's. Only a string literal is read; anything
    /// else is a runtime value this cannot see, and the stub sends the default,
    /// which the server answers with a 405 naming the method it wants.
    pub method: Option<String>,
}

/// One import statement the client stub may need to reproduce.
pub struct ImportLine {
    /// The local names it binds.
    pub names: Vec<String>,
    /// The statement, as written.
    pub text: String,
}

#[derive(Default)]
pub struct Scan {
    pub exports: Vec<Export>,
    /// The module's PROJECT-RELATIVE imports, which are the only ones a client
    /// stub may reproduce.
    ///
    /// A bare package specifier is excluded and the exclusion is the safety
    /// rule rather than a simplification. A stub is synthesized precisely so
    /// that nothing the handler imported reaches the browser, and
    /// `import { rateLimit } from "@barqjs/start"` in one would put
    /// `node:async_hooks` there — the leak the route strip already had to fix
    /// once. A relative module is the application's own, and `middleware_split`
    /// has already taken the server halves out of it.
    pub imports: Vec<ImportLine>,
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

pub fn scan(program: &Program<'_>, start_source: &str, client_source: &str) -> Scan {
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
        if let Statement::ImportDeclaration(import) = statement {
            let specifier = import.source.value.as_str();
            // The client subpath as well: the stub already imports `clientRpc`
            // from it, so it is client-safe by definition, and it is where a
            // middleware the package ships for the client half lives.
            if specifier.starts_with('.')
                || specifier.starts_with('/')
                || specifier == client_source
            {
                let names = import
                    .specifiers
                    .iter()
                    .flatten()
                    .map(|specifier| match specifier {
                        ImportDeclarationSpecifier::ImportSpecifier(named) => {
                            named.local.name.to_string()
                        }
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(default) => {
                            default.local.name.to_string()
                        }
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(star) => {
                            star.local.name.to_string()
                        }
                    })
                    .collect();
                scan.imports.push(ImportLine {
                    names,
                    text: program.source_text[import.span.start as usize..import.span.end as usize]
                        .to_string(),
                });
            }
        }
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
                            middleware: declarator
                                .init
                                .as_ref()
                                .map(|init| declared_middleware(init, factory, &scoping, &locals))
                                .unwrap_or_default(),
                            method: declarator
                                .init
                                .as_ref()
                                .and_then(|init| declared_method(init, factory, &scoping, &locals)),
                        });
                    }
                }
                declaration => {
                    // A function or class declaration is never a server
                    // function: the builder returns a value, and a declaration
                    // is not one.
                    if let Some(id) = declaration_name(declaration) {
                        scan.exports.push(Export {
                            name: id.0,
                            span: id.1,
                            server_fn: false,
                            middleware: Vec::new(),
                            method: None,
                        });
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
                            .is_some_and(|symbol| matches!(locals.get(&symbol), Some(Some(_)))),
                        // A re-exported binding's chain is declared where the
                        // binding is, and this module cannot see through the
                        // alias to it.
                        middleware: Vec::new(),
                        method: local_symbol(&specifier.local, &scoping)
                            .and_then(|symbol| locals.get(&symbol).copied().flatten())
                            .and_then(|init| declared_method(init, factory, &scoping, &locals)),
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
                    middleware: export
                        .declaration
                        .as_expression()
                        .map(|init| declared_middleware(init, factory, &scoping, &locals))
                        .unwrap_or_default(),
                    method: export
                        .declaration
                        .as_expression()
                        .and_then(|init| declared_method(init, factory, &scoping, &locals)),
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

/// How this module can reach `createServerFn`: by the name it imported it
/// under, or as a member of a namespace import of the package.
#[derive(Clone, Copy)]
struct Factory {
    named: Option<SymbolId>,
    namespace: Option<SymbolId>,
}

/// The local symbols `createServerFn` can be reached through, if any.
fn imported_factory(program: &Program<'_>, start_source: &str) -> Option<Factory> {
    let mut factory = Factory { named: None, namespace: None };
    for statement in &program.body {
        let Statement::ImportDeclaration(declaration) = statement else { continue };
        if declaration.source.value.as_str() != start_source {
            continue;
        }
        let Some(specifiers) = declaration.specifiers.as_ref() else { continue };
        for specifier in specifiers {
            match specifier {
                ImportDeclarationSpecifier::ImportSpecifier(imported) => {
                    let ModuleExportName::IdentifierName(name) = &imported.imported else {
                        continue;
                    };
                    if name.name.as_str() == "createServerFn" && factory.named.is_none() {
                        factory.named = imported.local.symbol_id.get();
                    }
                }
                ImportDeclarationSpecifier::ImportNamespaceSpecifier(star) => {
                    if factory.namespace.is_none() {
                        factory.namespace = star.local.symbol_id.get();
                    }
                }
                ImportDeclarationSpecifier::ImportDefaultSpecifier(_) => {}
            }
        }
    }
    (factory.named.is_some() || factory.namespace.is_some()).then_some(factory)
}

/// Every top-level binding: the chain it was initialised with, when that chain
/// is rooted at the factory.
///
/// A binding is both things a later statement can do with one. Exported, it is
/// a server function; continued — `base.handler(…)` — it is the builder the
/// chain goes on from, and a chain that starts at such a name is rooted where
/// the name's own chain is.
type Locals<'p, 'a> = FxHashMap<SymbolId, Option<&'p Expression<'a>>>;

/// One pass, in source order: a builder is declared before the chain that
/// continues it, and a name used before its declaration is in the dead zone.
fn local_bindings<'p, 'a>(
    program: &'p Program<'a>,
    factory: Factory,
    scoping: &Scoping,
) -> Locals<'p, 'a> {
    let mut locals: Locals<'p, 'a> = FxHashMap::default();
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
                declarator.init.as_ref().filter(|init| rooted_at(init, factory, scoping, &locals));
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
    factory: Factory,
    scoping: &Scoping,
    locals: &Locals<'_, '_>,
) -> bool {
    rooted_at(expression, factory, scoping, locals)
}

/// The expression with everything that is not a value taken off it: parentheses
/// and the TypeScript forms that assert, check or instantiate a type.
///
/// `createServerFn().handler(f) as Typed` is the chain it wraps. Read as some
/// other expression, the module was not recognised as holding a server function
/// at all, and the client build shipped it whole — handler body included.
fn unwrapped<'p, 'a>(expression: &'p Expression<'a>) -> &'p Expression<'a> {
    let mut current = expression;
    loop {
        current = match current {
            Expression::ParenthesizedExpression(inner) => &inner.expression,
            Expression::TSAsExpression(inner) => &inner.expression,
            Expression::TSSatisfiesExpression(inner) => &inner.expression,
            Expression::TSNonNullExpression(inner) => &inner.expression,
            Expression::TSTypeAssertion(inner) => &inner.expression,
            Expression::TSInstantiationExpression(inner) => &inner.expression,
            _ => return current,
        };
    }
}

fn symbol_of(expression: &Expression<'_>, scoping: &Scoping) -> Option<SymbolId> {
    let Expression::Identifier(reference) = unwrapped(expression) else { return None };
    reference.reference_id.get().and_then(|id| scoping.get_reference(id).symbol_id())
}

/// The identifiers `.middleware([…])` named, walking the builder chain.
///
/// The chain is a `CallExpression` whose callee is a member of a call of a
/// member of … so this walks the same spine `rooted_at` walks and reads the
/// argument at the step spelled `middleware`. Only a plain array of plain
/// identifiers is lifted; see {@link Export::middleware} for why anything else
/// records nothing.
fn declared_middleware(
    expression: &Expression<'_>,
    factory: Factory,
    scoping: &Scoping,
    locals: &Locals<'_, '_>,
) -> Vec<String> {
    if !rooted_at(expression, factory, scoping, locals) {
        return Vec::new();
    }
    let mut current = expression;
    loop {
        match unwrapped(current) {
            Expression::CallExpression(call) => {
                if let Expression::StaticMemberExpression(member) = &call.callee
                    && member.property.name == "middleware"
                    && let Some(Argument::ArrayExpression(array)) = call.arguments.first()
                {
                    let mut names = Vec::with_capacity(array.elements.len());
                    for element in &array.elements {
                        // A hole, a spread or anything that is not a bare
                        // identifier makes the whole list unliftable: a partial
                        // chain would be worse than none, because the stub would
                        // silently run fewer client halves than were written.
                        let Some(Expression::Identifier(reference)) = element.as_expression()
                        else {
                            return Vec::new();
                        };
                        names.push(reference.name.to_string());
                    }
                    return names;
                }
                current = &call.callee;
            }
            Expression::StaticMemberExpression(member) => current = &member.object,
            // The chain goes on from a builder bound earlier, and so does this.
            other => match symbol_of(other, scoping).and_then(|symbol| locals.get(&symbol)) {
                Some(Some(init)) => current = init,
                _ => return Vec::new(),
            },
        }
    }
}

/// `"GET"` unless the factory call names `"POST"` as a literal.
///
/// Walks the spine `rooted_at` walks, to the call whose callee IS the factory,
/// and reads `{ method: "POST" }` off its first argument.
fn declared_method(
    expression: &Expression<'_>,
    factory: Factory,
    scoping: &Scoping,
    locals: &Locals<'_, '_>,
) -> Option<String> {
    if !rooted_at(expression, factory, scoping, locals) {
        return None;
    }
    let mut current = expression;
    loop {
        match unwrapped(current) {
            Expression::CallExpression(call) => {
                if is_factory(&call.callee, factory, scoping) {
                    let posts = matches!(
                        call.arguments.first(),
                        Some(Argument::ObjectExpression(options))
                            if options.properties.iter().any(|property| {
                                let ObjectPropertyKind::ObjectProperty(property) = property else {
                                    return false;
                                };
                                !property.computed
                                    && property.key.static_name().as_deref() == Some("method")
                                    && matches!(
                                        unwrapped(&property.value),
                                        Expression::StringLiteral(value) if value.value == "POST"
                                    )
                            })
                    );
                    return if posts { None } else { Some("GET".to_string()) };
                }
                current = &call.callee;
            }
            Expression::StaticMemberExpression(member) => current = &member.object,
            other => match symbol_of(other, scoping).and_then(|symbol| locals.get(&symbol)) {
                Some(Some(init)) => current = init,
                _ => return None,
            },
        }
    }
}

/// Whether a callee is the factory itself: the imported name, or the member of
/// a namespace import.
fn is_factory(callee: &Expression<'_>, factory: Factory, scoping: &Scoping) -> bool {
    match unwrapped(callee) {
        Expression::StaticMemberExpression(member) => {
            member.property.name == "createServerFn"
                && factory.namespace.is_some()
                && symbol_of(&member.object, scoping) == factory.namespace
        }
        other => factory.named.is_some() && symbol_of(other, scoping) == factory.named,
    }
}

/// Whether an expression is a call chain rooted at the factory.
///
/// `createServerFn().validator(s).handler(f)` is a `CallExpression` whose callee
/// is a member of a call of a member of … of an `IdentifierReference`. Walking
/// to that identifier and comparing symbols is what makes `.handler(` on some
/// unrelated object not a match — the shape TanStack's regex prescan
/// (`\.\s*handler\s*\(`) cannot tell apart.
///
/// The root is the imported name, a member of a namespace import of the
/// package, or a name bound earlier to a chain that is itself rooted there.
fn rooted_at(
    expression: &Expression<'_>,
    factory: Factory,
    scoping: &Scoping,
    locals: &Locals<'_, '_>,
) -> bool {
    let mut current = expression;
    loop {
        match unwrapped(current) {
            Expression::CallExpression(call) => current = &call.callee,
            Expression::StaticMemberExpression(member) => {
                if member.property.name == "createServerFn"
                    && factory.namespace.is_some()
                    && symbol_of(&member.object, scoping) == factory.namespace
                {
                    return true;
                }
                current = &member.object;
            }
            other => {
                let Some(symbol) = symbol_of(other, scoping) else { return false };
                return Some(symbol) == factory.named
                    || matches!(locals.get(&symbol), Some(Some(_)));
            }
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
        scan(&parsed.program, "@barqjs/start", "@barqjs/start/client")
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

    /// A chain is the chain whatever type is asserted over it. Read as some
    /// other expression, the export was not a server function at all, and the
    /// client build then shipped the module whole.
    #[test]
    fn a_type_asserted_or_checked_chain_is_still_a_server_function() {
        let scan = scan_of(&format!(
            "{IMPORT}export const cast = createServerFn().handler(async () => 1) as unknown as () => Promise<number>;\n\
             export const checked = createServerFn().handler(async () => 2) satisfies () => Promise<number>;\n\
             export const sure = createServerFn().handler(async () => 3)!;"
        ));
        let names: Vec<&str> = scan.server_fns().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["cast", "checked", "sure"]);
    }

    #[test]
    fn a_member_of_a_namespace_import_is_the_factory() {
        let scan = scan_of(
            "import * as start from '@barqjs/start';\n\
             export const go = start.createServerFn().handler(async () => 1);\n\
             export const other = start.somethingElse().handler(async () => 2);",
        );
        let names: Vec<&str> = scan.server_fns().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["go"]);
    }

    /// A builder bound to a name and continued from it is one chain written in
    /// two statements, and its middleware is the builder's.
    #[test]
    fn a_chain_continued_from_a_held_builder_is_rooted_where_the_builder_is() {
        let scan = scan_of(&format!(
            "{IMPORT}const guarded = createServerFn().middleware([requireSession]);\n\
             export const load = guarded.handler(async () => 1);\n\
             const unrelated = somethingElse();\n\
             export const nope = unrelated.handler(async () => 2);"
        ));
        let names: Vec<&str> = scan.server_fns().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["load"]);
        let load = scan.server_fns().next().expect("found above");
        assert_eq!(load.middleware, vec!["requireSession".to_string()]);
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

    /// The stub has to send the method the server answers, and the literal on
    /// the factory call is the only place it is written.
    #[test]
    fn a_function_is_get_unless_it_says_post() {
        let scan = scan_of(&format!(
            "{IMPORT}export const read = createServerFn({{ method: 'GET' }}).handler(async () => 1);\n\
             const base = createServerFn({{ method: \"GET\" }}).middleware([audit]);\n\
             export const held = base.handler(async () => 2);\n\
             export const write = createServerFn({{ method: 'POST' }}).handler(async () => 3);\n\
             export const plain = createServerFn().handler(async () => 4);\n\
             const chosen = 'GET';\n\
             export const dynamic = createServerFn({{ method: chosen }}).handler(async () => 5);"
        ));
        let methods: Vec<(&str, Option<&str>)> =
            scan.server_fns().map(|e| (e.name.as_str(), e.method.as_deref())).collect();
        assert_eq!(
            methods,
            vec![
                ("read", Some("GET")),
                ("held", Some("GET")),
                ("write", None),
                ("plain", Some("GET")),
                ("dynamic", Some("GET")),
            ]
        );
    }

    #[test]
    fn the_cheap_question_is_asked_first() {
        assert!(!mentions("export const x = 1;"));
        assert!(mentions("import { createServerFn } from '@barqjs/start';"));
    }
}
