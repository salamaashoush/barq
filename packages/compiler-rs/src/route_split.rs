//! Automatic code splitting for a route module.
//!
//! THE PROBLEM THIS SOLVES IS ONE THE STATIC ROUTE TABLE CREATED. `routeTree.
//! gen.ts` imports every route module statically, which is what lets a file
//! route declare `validateSearch`, `beforeLoad`, `errorComponent` and the cache
//! options at all — the router reads every one of them synchronously off
//! `route.definition`, and the `lazy()`-per-option table it replaced could
//! carry none of them. The price is that the route's COMPONENT is eager too,
//! and a component is the large half: kitchen-sink went from five chunks and
//! ~154 kB on its first page to one chunk and 266 kB.
//!
//! So the split moves to the compiler, which is where TanStack puts it
//! (`router-plugin/src/core/constants.ts:4-16`). One route module becomes two:
//!
//!  - the REFERENCE half, which the tree imports, with each split value
//!    replaced by `lazy(() => import("<file>?barq-split"), (m) => m.<key>)`;
//!  - the SPLIT half, served at `<file>?barq-split`, which is the same source
//!    with everything the reference half keeps blanked out.
//!
//! WHAT IS SPLIT, and why it is not their whole list. Theirs defaults to
//! `component`, `errorComponent` and `notFoundComponent`. barq splits
//! `component` and `pendingComponent` and stops there, because those two are
//! exactly the ones `preloadMatched` already waits for (`route.ts:519-527`).
//! An `errorComponent` behind a cold `lazy()` throws `NotReadyError` from
//! inside the error boundary that is already handling a failure — a fallback
//! that can fail is not a fallback. Their `lazyRouteComponent` has a Suspense
//! boundary to park in and barq's error path does not.
//!
//! A ROOT ROUTE IS NEVER SPLIT. `shellComponent` renders `<html>`, so a cold
//! `lazy()` there fails from a position with no boundary above it — measured
//! once already, as "Async value is not ready yet" on the first prerender after
//! the document became JSX. Theirs refuses the root too
//! (`unsplittableCreateRouteFns`, `compilers.ts:130-133`).
//!
//! THE DOUBLE-INITIALISATION HAZARD IS REFUSED, NOT PAPERED OVER. A module-level
//! binding that both halves reach would be evaluated twice, once per module —
//! `const style = css`…`` beside a loader that also reads it. Theirs extracts
//! those into a third `?tsr-shared` module. barq does not split the route at
//! all and says which binding stopped it, which fails safe: the route keeps
//! working and the report names the one line to move. Imports are NOT such a
//! binding — a bundler gives both halves the same module instance.

use oxc::allocator::Allocator;
use oxc::ast::ast::{
    Argument, BindingPattern, Declaration, Expression, ImportDeclarationSpecifier,
    ObjectPropertyKind, Program, PropertyKey, Statement,
};
use oxc::ast_visit::{Visit, walk};
use oxc::parser::Parser;
use oxc::semantic::{Scoping, SemanticBuilder, SymbolId};
use oxc::span::{GetSpan, Span};
use rustc_hash::{FxHashMap, FxHashSet};

/// The options moved into a chunk of their own.
///
/// `component` is the large half of any route. `pendingComponent` joins it
/// because it is shown WHILE the route loads, so its chunk is wanted at exactly
/// the moment the route's own is — and `preloadMatched` waits for both.
pub const SPLIT_KEYS: [&str; 2] = ["component", "pendingComponent"];

/// The query that marks the split half. A QUERY and not a separate path, so the
/// bundler resolves it against the same file and a source map still points at
/// the source the author wrote.
pub const SPLIT_QUERY: &str = "barq-split";

/// Options DELETED from the route module in the CLIENT build.
///
/// `server` holds a route's HTTP handlers — its database queries, its secrets,
/// its `node:` imports. It is reachable from the browser only in the sense that
/// its BODY would sit in the bundle, which is exactly the leak. Theirs deletes
/// the same node and two more (`start-plugin-core/src/vite/start-router-plugin/
/// plugin.ts:166`, `deleteNodes: ['ssr', 'server', 'headers']`); barq's `ssr` is
/// already LIFTED into the generated table as a literal rather than read off the
/// module, so deleting it here would take away a value the table has and the
/// module no longer needs to carry — which it already does not.
///
/// Deletion is not the split. There is no second module, so nothing can be
/// double-initialised and nothing has to be refused: the property goes, and any
/// top-level declaration ONLY it reached goes with it.
pub const CLIENT_STRIP_KEYS: [&str; 1] = ["server"];

/// What a route module compiles to, both halves.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RouteSplit {
    /// The module the generated tree imports.
    pub reference: String,
    /// The module `<file>?barq-split` serves.
    pub split: String,
    /// Why the route was not split, when it was not. Both halves are the
    /// original source in that case, so a refusal costs bytes and never
    /// correctness.
    pub refused: Option<String>,
}

/// Whether a source is worth parsing for this at all.
///
/// The same trade `server_fn::mentions` makes: a module that never names the
/// factory cannot declare a route, and building a symbol table to find that out
/// is pure cost on every non-route module in the project.
pub fn mentions(source: &str) -> bool {
    source.contains("createFileRoute")
}

/// Split one route module, or explain why it was not split.
///
/// `specifier` is what the reference half will `import()` — the module's own id
/// with the split query on it. The caller owns that spelling because the
/// bundler, not the compiler, decides what a module id looks like.
pub fn split(
    source: &str,
    filename: &str,
    specifier: &str,
    for_client: bool,
    split_components: bool,
) -> RouteSplit {
    // What the split half imports `Route` back from: the specifier with the
    // query taken off, which is the reference module's own id.
    let bare = specifier.split('?').next().unwrap_or(specifier);
    let unchanged = |refused: Option<String>| RouteSplit {
        reference: source.to_owned(),
        split: source.to_owned(),
        refused,
    };

    let allocator = Allocator::new();
    let parsed =
        Parser::new(&allocator, source, crate::compile::source_type_for(Some(filename))).parse();
    if !parsed.diagnostics.is_empty() {
        // A parse failure is the JSX compiler's to report, with a position. It
        // is not this pass's, and refusing loudly here would report it twice.
        return unchanged(None);
    }
    let program = &parsed.program;
    let scoping = SemanticBuilder::new().build(program).semantic.into_scoping();

    let Some(route) = find_route(program) else { return unchanged(None) };
    if route.root {
        // Not a refusal worth reporting: a root route is never split, by design.
        return unchanged(None);
    }

    // Splitting is opt-in per call, because the CLIENT strip has to happen even
    // where a project has turned code splitting off — the strip is what keeps a
    // handler's database import out of the browser, not a size optimisation.
    let present: Vec<&Property> = if split_components {
        route
            .properties
            .iter()
            .filter(|property| SPLIT_KEYS.contains(&property.key.as_str()))
            .collect()
    } else {
        Vec::new()
    };
    // What the CLIENT build deletes outright. Empty on the server, where the
    // handlers are the whole point.
    let stripped: Vec<&Property> = if for_client {
        route
            .properties
            .iter()
            .filter(|property| CLIENT_STRIP_KEYS.contains(&property.key.as_str()))
            .collect()
    } else {
        Vec::new()
    };
    if present.is_empty() && stripped.is_empty() {
        return unchanged(None);
    }

    let tops = top_level(program, &scoping);
    let mut graph = dependencies(program, &scoping, &tops);

    // `Route` IS THE ROUTE, so it is pinned to the reference half and its edges
    // are cut. Both halves matter:
    //
    //  - cutting its edges, because a component that calls
    //    `Route.useLoaderData()` — which is the whole authoring convention —
    //    otherwise drags everything the route's OTHER options reach into the
    //    split closure with it. Measured on `kitchen-sink/src/routes/admin.tsx`:
    //    the `export const Route` statement itself was moved into the split
    //    chunk and the generated tree failed to build with "Route is not
    //    exported".
    //  - pinning the binding, because a route reached from both halves is not
    //    duplicated state and must not read as one.
    //
    // Theirs does exactly this and says why (`compilers.ts:169,297,1323`,
    // `removeBindingsTransitivelyDependingOn(…, ['Route'])`).
    if let Some(symbol) = route.symbol {
        graph.remove(&symbol);
    }

    // What each half reaches. `keep` starts from every part of the module that
    // is NOT going into the split chunk — the other options, and any top-level
    // statement with an effect of its own.
    let mut split_roots = FxHashSet::default();
    for property in &present {
        collect_refs(program, &scoping, property.value, &mut split_roots);
    }
    let mut strip_roots = FxHashSet::default();
    for property in &stripped {
        collect_refs(program, &scoping, property.value, &mut strip_roots);
    }
    let mut keep_roots = FxHashSet::default();
    for property in &route.properties {
        // Neither the split half's nor the stripped ones': what is left is what
        // the reference module keeps, and its reachable set is what stays.
        if SPLIT_KEYS.contains(&property.key.as_str())
            || CLIENT_STRIP_KEYS.contains(&property.key.as_str()) && for_client
        {
            continue;
        }
        collect_refs(program, &scoping, property.value, &mut keep_roots);
    }
    // Every top-level statement that is not a declaration runs for its effect,
    // and it stays in the reference half — so whatever it reads is the
    // reference half's too.
    for statement in &program.body {
        if declaration_of(statement).is_none() {
            collect_refs(program, &scoping, statement.span(), &mut keep_roots);
        }
    }

    let split_closure = reachable(&split_roots, &graph);
    let keep_closure = reachable(&keep_roots, &graph);
    // What ONLY the stripped options reach. A declaration the rest of the module
    // also uses stays — deleting a property never has to delete a binding
    // something else reads, so unlike the split this needs no refusal.
    let strip_only: FxHashSet<SymbolId> = reachable(&strip_roots, &graph)
        .into_iter()
        .filter(|symbol| !keep_closure.contains(symbol) && !split_closure.contains(symbol))
        .filter(|symbol| Some(*symbol) != route.symbol)
        .collect();

    // A LOCAL binding both halves reach would be evaluated twice, once per
    // module. An imported one would not — the bundler hands both halves the
    // same instance — so only locals refuse.
    let mut shared: Vec<&str> = split_closure
        .intersection(&keep_closure)
        .filter(|symbol| Some(**symbol) != route.symbol)
        .filter_map(|symbol| tops.get(symbol))
        .filter(|top| !top.imported)
        .map(|top| top.name.as_str())
        .collect();
    if !shared.is_empty() {
        shared.sort_unstable();
        shared.dedup();
        return unchanged(Some(format!(
            "{filename}: not code-split — {} is reached by both this route's \
             component and the rest of its options, and would be evaluated once in each \
             chunk. Move it into a module of its own and import it from both.",
            shared.iter().map(|name| format!("`{name}`")).collect::<Vec<_>>().join(", "),
        )));
    }

    // Nothing is shared, so every top-level declaration belongs to exactly one
    // half — or to neither, in which case it goes with the reference half and
    // the bundler drops it there.
    let mut reference = Blanker::new(source);
    let mut split_out = Blanker::new(source);
    for statement in &program.body {
        // The route's own statement is handled below and never moved.
        if statement.span() == route.statement {
            continue;
        }
        let Some(symbols) = declaration_of(statement) else {
            // An effect statement stays with the reference half.
            split_out.blank(statement.span());
            continue;
        };
        // Only the stripped options reach it, so it leaves BOTH halves — the
        // client build is the only caller that asks for a strip, and there the
        // whole point is that the handler's body and its imports are gone.
        if symbols.iter().any(|symbol| strip_only.contains(symbol)) {
            reference.blank(statement.span());
            split_out.blank(statement.span());
            continue;
        }
        let goes_to_split = symbols.iter().any(|symbol| split_closure.contains(symbol));
        if goes_to_split {
            reference.blank(statement.span());
        } else {
            split_out.blank(statement.span());
        }
    }

    // The reference half keeps the route, with each split value replaced.
    split_out.blank(route.statement);
    // DESCENDING, and this is not a tidiness choice: a replacement longer than
    // the hole it fills splices, which moves every offset after it — so applying
    // them in source order made the second write land inside the first's text
    // and the module stopped parsing. Working backwards leaves every span this
    // pass has not reached yet still valid.
    let mut replacements: Vec<(Span, String)> = stripped
        .iter()
        // The PROPERTY goes, not just its value: `server: undefined` would keep
        // the key on the definition, and `handlersOf` reads truthiness off it.
        // The property's own span STOPS AT ITS VALUE, so blanking it alone
        // leaves the separating comma behind and the object stops parsing —
        // `component: …,` then whitespace then a bare `,`. The comma comes with
        // it.
        .map(|property| (with_trailing_comma(source, property.span), String::new()))
        .chain(present.iter().map(|property| {
            (property.value, format!("$$barqLazy($$barqSplit, (m) => m.{})", property.key))
        }))
        .collect();
    replacements.sort_by_key(|(span, _)| std::cmp::Reverse(span.start));
    for (span, text) in &replacements {
        reference.replace(*span, text);
    }
    let mut reference = reference.finish();
    reference.insert_str(
        0,
        &format!(
            "import {{ lazy as $$barqLazy }} from \"@barqjs/core\";\n\
             const $$barqSplit = () => import({});\n",
            json_string(specifier),
        ),
    );

    // The split half exports the values under their option names.
    let mut split_source = split_out.finish();
    // …and imports `Route` back from the reference half when a component reads
    // it, which is the ordinary authoring convention (`Route.useLoaderData()`).
    // The cycle is not a problem and cannot be: the edge INTO this module is a
    // dynamic `import()`, so the reference half has finished evaluating long
    // before anything here runs.
    if route.symbol.is_some_and(|symbol| split_closure.contains(&symbol)) {
        split_source.insert_str(0, &format!("import {{ Route }} from {};\n", json_string(bare)));
    }
    split_source.push_str("\nexport const $$barqOptions = {");
    for property in &present {
        split_source.push_str(&format!(
            "\n  {}: {},",
            property.key,
            &source[range(property.value)]
        ));
    }
    split_source.push_str("\n};\n");
    for property in &present {
        split_source.push_str(&format!("export const {0} = $$barqOptions.{0};\n", property.key));
    }

    RouteSplit { reference, split: split_source, refused: None }
}

/// A property's span, extended over the `,` that separates it from the next.
///
/// Blanking the property alone leaves the comma, and `{ a: 1,   , }` does not
/// parse. Trailing whitespace is stepped over first because the comma may not be
/// adjacent.
fn with_trailing_comma(source: &str, span: Span) -> Span {
    let bytes = source.as_bytes();
    let mut index = span.end as usize;
    while index < bytes.len() && bytes[index].is_ascii_whitespace() {
        index += 1;
    }
    if index < bytes.len() && bytes[index] == b',' {
        return Span::new(span.start, index as u32 + 1);
    }
    span
}

fn range(span: Span) -> std::ops::Range<usize> {
    span.start as usize..span.end as usize
}

fn json_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for character in value.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            _ => out.push(character),
        }
    }
    out.push('"');
    out
}

/// A source with regions blanked out.
///
/// BLANKED, not deleted, and the reason is sourcemaps: every byte that survives
/// keeps its original offset, so the JSX compiler that runs after this produces
/// a map against the file the author actually wrote. Newlines are kept for the
/// same reason, one line further along.
struct Blanker {
    out: Vec<u8>,
}

impl Blanker {
    fn new(source: &str) -> Self {
        Self { out: source.as_bytes().to_vec() }
    }

    fn blank(&mut self, span: Span) {
        for index in range(span) {
            if self.out[index] != b'\n' {
                self.out[index] = b' ';
            }
        }
    }

    /// Blank a span and write text at its start. The replacement must fit, and
    /// every caller's does — `lazy($$barqSplit, (m) => m.component)` is longer
    /// than `Posts`, so the span is widened by padding the source instead.
    fn replace(&mut self, span: Span, text: &str) {
        self.blank(span);
        let start = span.start as usize;
        let bytes = text.as_bytes();
        if bytes.len() <= span.end as usize - start {
            self.out[start..start + bytes.len()].copy_from_slice(bytes);
            return;
        }
        // Longer than the hole: splice it in. Offsets after this point move,
        // which is why it is done ONCE per property and never for a value the
        // JSX compiler will look at — a component reference is an identifier.
        self.out.splice(start..span.end as usize, bytes.iter().copied());
    }

    fn finish(self) -> String {
        String::from_utf8(self.out).expect("blanking preserves utf-8 boundaries")
    }
}

/// One option a route declared, by key and by the span of its value.
struct Property {
    key: String,
    /// The value's span, which is what the split replaces.
    value: Span,
    /// The WHOLE `key: value` span, which is what a strip deletes — leaving
    /// `server: undefined` behind would keep the key, and the dispatch reads
    /// truthiness off `server.handlers`.
    span: Span,
}

struct RouteDeclaration {
    /// The whole `export const Route = …;` statement.
    statement: Span,
    /// The `Route` binding itself, which is PINNED to the reference half.
    symbol: Option<SymbolId>,
    properties: Vec<Property>,
    root: bool,
}

/// `export const Route = createFileRoute(id)({…})`, and the root's two forms.
fn find_route(program: &Program<'_>) -> Option<RouteDeclaration> {
    for statement in &program.body {
        let Statement::ExportDeclaration(export) = statement else { continue };
        let Declaration::VariableDeclaration(declaration) = &export.declaration else { continue };
        for declarator in &declaration.declarations {
            let BindingPattern::BindingIdentifier(name) = &declarator.id else { continue };
            if name.name.as_str() != "Route" {
                continue;
            }
            let init = declarator.init.as_ref()?;
            let Expression::CallExpression(outer) = init.without_parentheses() else { return None };
            let root = match outer.callee.without_parentheses() {
                // `createFileRoute("/x")({…})` and
                // `createRootRouteWithContext<C>()({…})` are the SAME shape, so
                // the inner callee's name is what tells them apart.
                Expression::CallExpression(inner) => match inner.callee.without_parentheses() {
                    Expression::Identifier(id) => id.name.as_str() != "createFileRoute",
                    _ => return None,
                },
                Expression::Identifier(id) => id.name.as_str() != "createFileRoute",
                _ => return None,
            };
            let Some(Argument::ObjectExpression(options)) = outer.arguments.first() else {
                return None;
            };
            let mut properties = Vec::new();
            for property in &options.properties {
                let ObjectPropertyKind::ObjectProperty(property) = property else { continue };
                // A computed key is not a name this can act on — theirs skips
                // them too (`transform.ts:324`).
                let key = match &property.key {
                    PropertyKey::StaticIdentifier(id) => id.name.to_string(),
                    PropertyKey::StringLiteral(literal) => literal.value.to_string(),
                    _ => continue,
                };
                properties.push(Property {
                    key,
                    value: property.value.span(),
                    span: property.span,
                });
            }
            return Some(RouteDeclaration {
                statement: statement.span(),
                symbol: name.symbol_id.get(),
                properties,
                root,
            });
        }
    }
    None
}

/// A top-level binding: its name, and whether it came from an import.
struct Top {
    name: String,
    imported: bool,
}

/// Every module-level binding, by symbol.
fn top_level(program: &Program<'_>, scoping: &Scoping) -> FxHashMap<SymbolId, Top> {
    let mut out = FxHashMap::default();
    for statement in &program.body {
        if let Statement::ImportDeclaration(import) = statement {
            for specifier in import.specifiers.iter().flatten() {
                let local = match specifier {
                    ImportDeclarationSpecifier::ImportSpecifier(one) => &one.local,
                    ImportDeclarationSpecifier::ImportDefaultSpecifier(one) => &one.local,
                    ImportDeclarationSpecifier::ImportNamespaceSpecifier(one) => &one.local,
                };
                if let Some(symbol) = local.symbol_id.get() {
                    out.insert(symbol, Top { name: local.name.to_string(), imported: true });
                }
            }
            continue;
        }
        for symbol in bindings_of(statement) {
            out.insert(
                symbol,
                Top { name: scoping.symbol_name(symbol).to_owned(), imported: false },
            );
        }
    }
    out
}

/// The declaration a statement makes, as symbols, or `None` for an effect.
fn declaration_of(statement: &Statement<'_>) -> Option<Vec<SymbolId>> {
    match statement {
        Statement::ImportDeclaration(_) => Some(bindings_of(statement)),
        Statement::FunctionDeclaration(_)
        | Statement::ClassDeclaration(_)
        | Statement::VariableDeclaration(_)
        | Statement::TSTypeAliasDeclaration(_)
        | Statement::TSInterfaceDeclaration(_) => Some(bindings_of(statement)),
        Statement::ExportDeclaration(_) => Some(bindings_of(statement)),
        _ => None,
    }
}

fn bindings_of(statement: &Statement<'_>) -> Vec<SymbolId> {
    let mut out = Vec::new();
    let mut push = |pattern: &BindingPattern<'_>| {
        if let BindingPattern::BindingIdentifier(id) = pattern
            && let Some(symbol) = id.symbol_id.get()
        {
            out.push(symbol);
        }
    };
    match statement {
        Statement::ImportDeclaration(import) => {
            for specifier in import.specifiers.iter().flatten() {
                let local = match specifier {
                    ImportDeclarationSpecifier::ImportSpecifier(one) => &one.local,
                    ImportDeclarationSpecifier::ImportDefaultSpecifier(one) => &one.local,
                    ImportDeclarationSpecifier::ImportNamespaceSpecifier(one) => &one.local,
                };
                if let Some(symbol) = local.symbol_id.get() {
                    out.push(symbol);
                }
            }
        }
        Statement::FunctionDeclaration(function) => {
            if let Some(id) = &function.id
                && let Some(symbol) = id.symbol_id.get()
            {
                out.push(symbol);
            }
        }
        Statement::ClassDeclaration(class) => {
            if let Some(id) = &class.id
                && let Some(symbol) = id.symbol_id.get()
            {
                out.push(symbol);
            }
        }
        Statement::VariableDeclaration(declaration) => {
            for declarator in &declaration.declarations {
                push(&declarator.id);
            }
        }
        Statement::ExportDeclaration(export) => match &export.declaration {
            Declaration::VariableDeclaration(declaration) => {
                for declarator in &declaration.declarations {
                    push(&declarator.id);
                }
            }
            Declaration::FunctionDeclaration(function) => {
                if let Some(id) = &function.id
                    && let Some(symbol) = id.symbol_id.get()
                {
                    out.push(symbol);
                }
            }
            Declaration::ClassDeclaration(class) => {
                if let Some(id) = &class.id
                    && let Some(symbol) = id.symbol_id.get()
                {
                    out.push(symbol);
                }
            }
            _ => {}
        },
        _ => {}
    }
    out
}

/// Top-level symbol -> the top-level symbols its own declaration reaches.
fn dependencies(
    program: &Program<'_>,
    scoping: &Scoping,
    tops: &FxHashMap<SymbolId, Top>,
) -> FxHashMap<SymbolId, FxHashSet<SymbolId>> {
    let mut out: FxHashMap<SymbolId, FxHashSet<SymbolId>> = FxHashMap::default();
    for statement in &program.body {
        let declared = bindings_of(statement);
        if declared.is_empty() {
            continue;
        }
        let mut reached = FxHashSet::default();
        collect_refs(program, scoping, statement.span(), &mut reached);
        reached.retain(|symbol| tops.contains_key(symbol) && !declared.contains(symbol));
        for symbol in declared {
            out.entry(symbol).or_default().extend(reached.iter().copied());
        }
    }
    out
}

/// The transitive closure of a root set over the dependency graph.
fn reachable(
    roots: &FxHashSet<SymbolId>,
    graph: &FxHashMap<SymbolId, FxHashSet<SymbolId>>,
) -> FxHashSet<SymbolId> {
    let mut seen: FxHashSet<SymbolId> = FxHashSet::default();
    let mut stack: Vec<SymbolId> = roots.iter().copied().collect();
    while let Some(symbol) = stack.pop() {
        if !seen.insert(symbol) {
            continue;
        }
        if let Some(next) = graph.get(&symbol) {
            stack.extend(next.iter().copied());
        }
    }
    seen
}

/// Every symbol an identifier inside `span` resolves to.
///
/// By SPAN rather than by node, so one visitor serves both a statement and a
/// single option value. Resolution is by `SymbolId`: a scan for the text would
/// match a shadowing local, a property name and a comment.
fn collect_refs(
    program: &Program<'_>,
    scoping: &Scoping,
    span: Span,
    out: &mut FxHashSet<SymbolId>,
) {
    struct Collector<'a, 'b> {
        scoping: &'a Scoping,
        span: Span,
        out: &'b mut FxHashSet<SymbolId>,
    }
    impl<'a> Visit<'a> for Collector<'_, '_> {
        fn visit_identifier_reference(&mut self, it: &oxc::ast::ast::IdentifierReference<'a>) {
            if it.span.start < self.span.start || it.span.end > self.span.end {
                return;
            }
            if let Some(id) = it.reference_id.get()
                && let Some(symbol) = self.scoping.get_reference(id).symbol_id()
            {
                self.out.insert(symbol);
            }
        }
        fn visit_jsx_identifier(&mut self, _it: &oxc::ast::ast::JSXIdentifier<'a>) {
            // A JSX element name is not an `IdentifierReference` in the AST, and
            // the binder resolves it through `JSXElementName::IdentifierReference`
            // — which the walk above already visits. Nothing to do here, and it
            // is stated rather than left as an omission somebody re-derives.
        }
    }
    let mut collector = Collector { scoping, span, out };
    walk::walk_program(&mut collector, program);
}

#[cfg(test)]
mod tests {
    use super::*;

    const SPEC: &str = "/src/routes/posts.tsx?barq-split";

    fn run(source: &str) -> RouteSplit {
        split(source, "src/routes/posts.tsx", SPEC, false, true)
    }

    /// The CLIENT build, which also deletes `server`.
    fn client(source: &str) -> RouteSplit {
        split(source, "src/routes/posts.tsx", SPEC, true, true)
    }

    /// The whole point, in one case: the component's imports leave the
    /// reference half and the loader's leave the split half.
    #[test]
    fn each_half_keeps_only_what_it_reaches() {
        let out = run(r#"import { createFileRoute } from "@barqjs/router";
import { fetchPosts } from "../data/posts";
import { Heavy } from "../components/Heavy";

function Posts() {
  return <Heavy />;
}

export const Route = createFileRoute("/posts")({
  loader: () => fetchPosts(),
  component: Posts,
});
"#);
        assert_eq!(out.refused, None, "{out:#?}");

        // The reference half keeps the loader and its import, and has lost the
        // component and the heavy import it reached.
        assert!(out.reference.contains("fetchPosts"), "{}", out.reference);
        assert!(!out.reference.contains("Heavy"), "{}", out.reference);
        assert!(!out.reference.contains("function Posts"), "{}", out.reference);
        assert!(
            out.reference.contains("component: $$barqLazy($$barqSplit, (m) => m.component)"),
            "{}",
            out.reference
        );
        assert!(out.reference.contains(&format!("import({SPEC:?})")), "{}", out.reference);

        // The split half is the mirror image: the component and `Heavy`, no
        // loader and no `fetchPosts`.
        assert!(out.split.contains("function Posts"), "{}", out.split);
        assert!(out.split.contains("Heavy"), "{}", out.split);
        assert!(!out.split.contains("fetchPosts"), "{}", out.split);
        assert!(out.split.contains("export const component ="), "{}", out.split);
        // …and it does not build a route, which would run the factory twice.
        assert!(!out.split.contains("createFileRoute(\"/posts\")"), "{}", out.split);
    }

    /// Both halves still parse. A split that emits a syntax error is worse than
    /// no split, and blanking spans out of a source is exactly the operation
    /// that can produce one.
    #[test]
    fn both_halves_parse() {
        let out = run(r#"import { createFileRoute } from "@barqjs/router";
import { load } from "../data";
const NAMES = ["a", "b"];
function Posts() {
  return <ul>{NAMES.map((n) => n)}</ul>;
}
function Pending() {
  return <p>loading</p>;
}
export const Route = createFileRoute("/posts")({
  loader: load,
  staleTime: 5000,
  component: Posts,
  pendingComponent: Pending,
});
"#);
        assert_eq!(out.refused, None, "{out:#?}");
        for (half, source) in [("reference", &out.reference), ("split", &out.split)] {
            let allocator = Allocator::new();
            let parsed = Parser::new(
                &allocator,
                source,
                crate::compile::source_type_for(Some("src/routes/posts.tsx")),
            )
            .parse();
            assert!(parsed.diagnostics.is_empty(), "{half}:\n{source}\n{:?}", parsed.diagnostics);
        }
        // Both split keys moved, and the options that are not components stayed.
        assert!(out.reference.contains("staleTime: 5000"), "{}", out.reference);
        assert!(out.reference.contains("(m) => m.pendingComponent"), "{}", out.reference);
        assert!(out.split.contains("export const pendingComponent ="), "{}", out.split);
        // `NAMES` is reached only by the component, so it went with it.
        assert!(out.split.contains("const NAMES"), "{}", out.split);
        assert!(!out.reference.contains("const NAMES"), "{}", out.reference);
    }

    /// A binding both halves reach would run ONCE PER MODULE. Theirs extracts it
    /// into a third module; barq refuses the split and names the binding, which
    /// keeps the route correct either way.
    #[test]
    fn a_binding_both_halves_reach_refuses_the_split() {
        let out = run(r#"import { createFileRoute } from "@barqjs/router";
const shared = { hits: 0 };
function Posts() {
  return <p>{shared.hits}</p>;
}
export const Route = createFileRoute("/posts")({
  loader: () => shared.hits++,
  component: Posts,
});
"#);
        let refused = out.refused.expect("a refusal naming the binding");
        assert!(refused.contains("`shared`"), "{refused}");
        assert!(refused.contains("not code-split"), "{refused}");
        // And the route is UNTOUCHED, so refusing costs bytes and not behaviour.
        assert!(out.reference.contains("component: Posts"), "{}", out.reference);
        assert_eq!(out.reference, out.split);
    }

    /// An IMPORT reached by both halves is not shared state: a bundler hands
    /// both modules the same instance. Refusing on one would refuse nearly every
    /// route, since both halves import from `@barqjs/router`.
    #[test]
    fn an_import_both_halves_reach_is_not_a_refusal() {
        let out = run(r#"import { createFileRoute, Link } from "@barqjs/router";
import { format } from "../format";
function Posts() {
  return <Link to={format("/a")} />;
}
export const Route = createFileRoute("/posts")({
  loader: () => format("/b"),
  component: Posts,
});
"#);
        assert_eq!(out.refused, None, "{out:#?}");
        // `format` is imported by both halves, which costs one duplicated import
        // statement and no duplicated evaluation.
        assert!(out.reference.contains("format"), "{}", out.reference);
        assert!(out.split.contains("format"), "{}", out.split);
    }

    /// A ROOT ROUTE is never split: `shellComponent` renders `<html>`, so a cold
    /// `lazy()` there fails from a position with no boundary above it.
    #[test]
    fn a_root_route_is_left_whole() {
        for source in [
            "import { createRootRoute } from \"@barqjs/router\";\nfunction L() { return <p/>; }\nexport const Route = createRootRoute({ component: L });\n",
            "import { createRootRouteWithContext } from \"@barqjs/router\";\nfunction L() { return <p/>; }\nexport const Route = createRootRouteWithContext<{}>()({ component: L });\n",
        ] {
            let out = split(source, "src/routes/__root.tsx", SPEC, false, true);
            assert_eq!(out.refused, None);
            assert_eq!(out.reference, source, "a root route must not be rewritten");
            assert_eq!(out.split, source);
        }
    }

    /// A module that declares no route, or a route with nothing to split, comes
    /// back untouched rather than as an error.
    #[test]
    fn nothing_to_split_is_not_a_failure() {
        for source in [
            "export const helper = 1;\n",
            "import { createFileRoute } from \"@barqjs/router\";\nexport const Route = createFileRoute(\"/x\")({ loader: () => 1 });\n",
        ] {
            let out = run(source);
            assert_eq!(out.refused, None);
            assert_eq!(out.reference, source);
        }
    }

    /// `Route.useLoaderData()` inside the component is the ORDINARY authoring
    /// convention, and it is the case that broke the first version of this pass.
    ///
    /// `Route` is reached by the component, so a naive closure moved the
    /// `export const Route` statement itself into the split chunk — and the
    /// generated tree then failed to build with "Route is not exported by
    /// src/routes/admin.tsx". It also dragged everything the route's OTHER
    /// options reach along with it.
    #[test]
    fn a_component_that_reads_its_own_route_pins_it_and_imports_it_back() {
        let out = run(r#"import { createFileRoute } from "@barqjs/router";
import { adminStats } from "../data/admin";
import { requireSession } from "../auth";

function Admin() {
  const stats = Route.useLoaderData();
  return <p>{stats()?.users}</p>;
}

export const Route = createFileRoute("/admin")({
  middleware: [requireSession],
  loader: async () => adminStats(),
  component: Admin,
});
"#);
        assert_eq!(out.refused, None, "{out:#?}");

        // The route itself stays where the tree can import it.
        assert!(
            out.reference.contains("export const Route = createFileRoute"),
            "{}",
            out.reference
        );
        assert!(!out.split.contains("export const Route"), "{}", out.split);

        // The component moved, and takes `Route` back by import — a cycle the
        // dynamic edge into this module makes safe.
        assert!(out.split.contains("function Admin"), "{}", out.split);
        assert!(
            out.split.contains("import { Route } from \"/src/routes/posts.tsx\";"),
            "{}",
            out.split
        );

        // …and the loader's imports did NOT follow the component out. That is
        // the second half of the same bug: `Route`'s edges are cut, so reaching
        // `Route` does not reach everything `Route` reaches.
        assert!(out.reference.contains("adminStats"), "{}", out.reference);
        assert!(out.reference.contains("requireSession"), "{}", out.reference);
        assert!(!out.split.contains("adminStats"), "{}", out.split);
        assert!(!out.split.contains("requireSession"), "{}", out.split);
    }

    /// The CLIENT build deletes `server`, so a route's HTTP handlers — and
    /// whatever they import to reach a database — never sit in the browser
    /// bundle. Theirs deletes the same node
    /// (`start-plugin-core/src/vite/start-router-plugin/plugin.ts:166`).
    #[test]
    fn the_client_build_deletes_the_server_handlers() {
        let source = r#"import { createFileRoute } from "@barqjs/router";
import { db } from "../db";
import { render } from "../render";

const SECRET = "do-not-ship-me";

function Page() {
  return render();
}

export const Route = createFileRoute("/posts")({
  component: Page,
  server: {
    handlers: {
      GET: async () => Response.json(await db.query(SECRET)),
    },
  },
});
"#;

        // On the SERVER the handlers are the whole point, so nothing is deleted.
        let server = run(source);
        assert!(server.reference.contains("handlers"), "{}", server.reference);
        assert!(server.reference.contains("SECRET"), "{}", server.reference);
        assert!(server.reference.contains("db"), "{}", server.reference);

        let out = client(source);
        assert_eq!(out.refused, None, "{out:#?}");
        // The option, the handler body, the secret and the import it needed are
        // all gone from what the browser loads.
        assert!(!out.reference.contains("handlers"), "{}", out.reference);
        assert!(!out.reference.contains("db.query"), "{}", out.reference);
        assert!(!out.reference.contains("SECRET"), "{}", out.reference);
        assert!(!out.reference.contains("../db"), "{}", out.reference);
        // …and the route still builds, with its component still split out.
        assert!(
            out.reference.contains("export const Route = createFileRoute"),
            "{}",
            out.reference
        );
        assert!(out.reference.contains("component: $$barqLazy"), "{}", out.reference);
        assert!(out.split.contains("function Page"), "{}", out.split);

        let allocator = Allocator::new();
        let parsed = Parser::new(
            &allocator,
            &out.reference,
            crate::compile::source_type_for(Some("src/routes/posts.tsx")),
        )
        .parse();
        assert!(parsed.diagnostics.is_empty(), "{}\n{:?}", out.reference, parsed.diagnostics);
    }

    /// A binding the handlers share with the rest of the module STAYS. Deleting
    /// a property never has to delete something else still reads, so unlike the
    /// split this case needs no refusal — just care.
    #[test]
    fn a_binding_the_rest_of_the_module_also_uses_survives_the_strip() {
        let out = client(
            r#"import { createFileRoute } from "@barqjs/router";
import { format } from "../format";
export const Route = createFileRoute("/posts")({
  loader: () => format("a"),
  server: { handlers: { GET: async () => Response.json(format("b")) } },
});
"#,
        );
        assert_eq!(out.refused, None, "{out:#?}");
        assert!(!out.reference.contains("handlers"), "{}", out.reference);
        // The loader still needs it.
        assert!(out.reference.contains("format"), "{}", out.reference);
    }

    /// A route with handlers and NO component is still stripped. The early
    /// return for "nothing to split" skipped it, which shipped every
    /// handler-only API route's body to the browser.
    #[test]
    fn a_route_with_no_component_is_still_stripped() {
        let out = client(
            r#"import { createFileRoute } from "@barqjs/router";
import { db } from "../db";
export const Route = createFileRoute("/api/users")({
  server: { handlers: { GET: async () => Response.json(await db.all()) } },
});
"#,
        );
        assert_eq!(out.refused, None, "{out:#?}");
        assert!(!out.reference.contains("db"), "{}", out.reference);
        assert!(!out.reference.contains("handlers"), "{}", out.reference);
    }

    /// The cheap question, asked before the expensive one.
    #[test]
    fn a_module_that_never_names_the_factory_is_not_parsed() {
        assert!(!mentions("export const x = 1;"));
        assert!(mentions("createFileRoute(\"/x\")"));
    }
}
