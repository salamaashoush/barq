//! `createIsomorphicFn`, `createServerOnlyFn` and `createClientOnlyFn`.
//!
//! Three shapes that keep recurring in a codebase with a server and a browser
//! in it: something both sides do differently, something only the server may
//! do, and something only the browser can. Written by hand each is a
//! `typeof window === "undefined"` branch, and every one of those ships BOTH
//! bodies to both bundles — the server's database call sitting in the browser's
//! JavaScript, unreachable and readable.
//!
//! This replaces the call with the half that belongs, so the other is absent by
//! construction rather than unreachable. TanStack's
//! `handleCreateIsomorphicFn`/`handleEnvOnly` do the same three rewrites.
//!
//! IT RUNS IN BOTH ENVIRONMENTS, unlike `middleware_split`, because both have
//! something to drop: the server build loses `.client(…)` exactly as the client
//! build loses `.server(…)`.

use oxc::allocator::Allocator;
use oxc::ast::ast::{Expression, ImportDeclarationSpecifier, Program, Statement};
use oxc::ast_visit::{Visit, walk};
use oxc::parser::Parser;
use oxc::semantic::{Scoping, SemanticBuilder, SymbolId};
use oxc::span::{GetSpan, Span};
use rustc_hash::FxHashSet;

use crate::options::Env;
use crate::route_split::{
    Blanker, collect_refs, collect_refs_excluding, declaration_of, dependencies, reachable,
    top_level,
};

/// The three names, and what the subpath that holds them is called.
const NAMES: [&str; 3] = ["createIsomorphicFn", "createServerOnlyFn", "createClientOnlyFn"];

/// The cheap question first, as every other pass asks it.
pub fn mentions(source: &str) -> bool {
    NAMES.iter().any(|name| source.contains(name))
}

/// One rewrite: the span to replace, what to put there, and which part of the
/// replaced text SURVIVES inside it.
///
/// `keeps` is load-bearing. The span being replaced covers the whole chain,
/// both halves of it, and the replacement is one half's source copied out. A
/// reachability walk that excluded the whole span would therefore see the
/// surviving body's references as dead and delete what they read — which
/// deleted the client's own constant, not just the server's.
struct Edit {
    span: Span,
    text: String,
    keeps: Option<Span>,
}

/// Resolve every env-only call for `env`. `None` when there is nothing to do.
pub fn rewrite(source: &str, filename: &str, start_source: &str, env: Env) -> Option<String> {
    let allocator = Allocator::new();
    let parsed =
        Parser::new(&allocator, source, crate::compile::source_type_for(Some(filename))).parse();
    if !parsed.diagnostics.is_empty() {
        // A parse failure is the JSX compiler's to report, with a position.
        return None;
    }
    let program = &parsed.program;
    let scoping = SemanticBuilder::new().build(program).semantic.into_scoping();
    let imported = imported_names(program, start_source, &scoping);
    if imported.iso.is_none() && imported.server_only.is_none() && imported.client_only.is_none() {
        return None;
    }

    let mut edits: Vec<Edit> = Vec::new();
    collect(program, &scoping, &imported, env, source, &mut edits);
    if edits.is_empty() {
        return None;
    }

    // THE IMPORT GOES WITH THE LAST CALL, and that is not tidying. `@barqjs/start`
    // declares no `sideEffects`, so a bundler must assume the module has some
    // and keeps the statement even with every specifier unused — which puts the
    // package index, and `node:async_hooks` through it, in the browser bundle.
    // That is the leak the client stub and the middleware strip both exist to
    // prevent, arriving by a third door.
    let replaced: Vec<Span> = edits.iter().map(|edit| edit.span).collect();
    let mut still_used = FxHashSet::default();
    collect_refs_excluding(program, &scoping, program.span, &replaced, &mut still_used);
    // …plus everything the surviving halves read, which the exclusion above
    // took out with the rest of the chain.
    for edit in &edits {
        if let Some(keeps) = edit.keeps {
            collect_refs(program, &scoping, keeps, &mut still_used);
        }
    }
    for statement in &program.body {
        let Statement::ImportDeclaration(import) = statement else { continue };
        if let Some(edit) = drop_unused(import, &still_used, source) {
            edits.push(edit);
        }
    }

    // …AND WHATEVER ONLY THE DELETED BODY REACHED, which is the same rule
    // `middleware_split` enforces and for the same measured reason. Without it
    // a `const SECRET = "…"` that only the server half read stays in the client
    // module: the body is gone and the secret is not, which is the leak the
    // rewrite exists to close rather than to relocate.
    let tops = top_level(program, &scoping);
    let graph = dependencies(program, &scoping, &tops);
    let mut gone_roots = FxHashSet::default();
    for edit in &edits {
        // The chain MINUS the half that survived: what is leaving is the rest.
        let holes: Vec<Span> = edit.keeps.into_iter().collect();
        collect_refs_excluding(program, &scoping, edit.span, &holes, &mut gone_roots);
    }
    let kept = reachable(&still_used, &graph);
    let gone: FxHashSet<SymbolId> = reachable(&gone_roots, &graph)
        .into_iter()
        .filter(|symbol| !kept.contains(symbol))
        .collect();
    for statement in &program.body {
        if matches!(statement, Statement::ImportDeclaration(_)) {
            continue;
        }
        let Some(symbols) = declaration_of(statement) else { continue };
        // EVERY binding, not any: a declaration the module still reads through
        // one of its names has to stay whole.
        if !symbols.is_empty() && symbols.iter().all(|symbol| gone.contains(symbol)) {
            edits.push(Edit { span: statement.span(), text: String::new(), keeps: None });
        }
    }

    // Back to front: a replacement may be LONGER than what it replaces — the
    // throwing stub usually is — and `Blanker::replace` splices when it does not
    // fit, which moves every offset after it.
    edits.sort_by_key(|edit| std::cmp::Reverse(edit.span.start));
    let mut out = Blanker::new(source);
    for edit in edits {
        out.replace(edit.span, &edit.text);
    }
    Some(out.finish())
}

/// Rewrite an import statement without the specifiers nothing references any
/// more, or blank it when none survive. `None` when it is unchanged.
fn drop_unused(
    import: &oxc::ast::ast::ImportDeclaration<'_>,
    still_used: &FxHashSet<SymbolId>,
    source: &str,
) -> Option<Edit> {
    let specifiers = import.specifiers.as_ref()?;
    let mut kept: Vec<String> = Vec::new();
    for specifier in specifiers {
        let ImportDeclarationSpecifier::ImportSpecifier(named) = specifier else {
            // A default or namespace binding is not in a brace list, so a
            // statement holding one is left exactly as it stands.
            return None;
        };
        let symbol = named.local.symbol_id.get();
        if symbol.is_some_and(|symbol| !still_used.contains(&symbol))
            && NAMES.contains(&named.imported.name().as_str())
        {
            continue;
        }
        let bare = if named.imported.name() == named.local.name {
            named.local.name.to_string()
        } else {
            format!("{} as {}", named.imported.name(), named.local.name)
        };
        kept.push(if named.import_kind.is_type() { format!("type {bare}") } else { bare });
    }
    if kept.len() == specifiers.len() {
        return None;
    }
    let _ = source;
    Some(Edit {
        keeps: None,
        span: import.span,
        text: if kept.is_empty() {
            String::new()
        } else {
            format!("import {{ {} }} from {:?};", kept.join(", "), import.source.value.as_str())
        },
    })
}

#[derive(Default)]
struct Imported {
    iso: Option<SymbolId>,
    server_only: Option<SymbolId>,
    client_only: Option<SymbolId>,
}

/// The local bindings the three were imported under. By symbol, so a shadowing
/// local is not a false positive and a rename is not a false negative.
fn imported_names(program: &Program<'_>, start_source: &str, _scoping: &Scoping) -> Imported {
    let mut out = Imported::default();
    for statement in &program.body {
        let Statement::ImportDeclaration(import) = statement else { continue };
        let specifier = import.source.value.as_str();
        // The package, or the subpath the client build rewrites imports to.
        if specifier != start_source && specifier != format!("{start_source}/env") {
            continue;
        }
        for specifier in import.specifiers.iter().flatten() {
            let ImportDeclarationSpecifier::ImportSpecifier(named) = specifier else { continue };
            let symbol = named.local.symbol_id.get();
            match named.imported.name().as_str() {
                "createIsomorphicFn" => out.iso = symbol,
                "createServerOnlyFn" => out.server_only = symbol,
                "createClientOnlyFn" => out.client_only = symbol,
                _ => {}
            }
        }
    }
    out
}

fn collect(
    program: &Program<'_>,
    scoping: &Scoping,
    imported: &Imported,
    env: Env,
    source: &str,
    out: &mut Vec<Edit>,
) {
    struct Finder<'a, 'b> {
        scoping: &'b Scoping,
        imported: &'b Imported,
        env: Env,
        source: &'b str,
        out: &'b mut Vec<Edit>,
        /// Spans already rewritten, so a nested match inside a replaced body is
        /// not rewritten a second time at an offset that no longer exists.
        done: FxHashSet<u32>,
        marker: std::marker::PhantomData<&'a ()>,
    }
    impl<'a> Visit<'a> for Finder<'a, '_> {
        fn visit_call_expression(&mut self, call: &oxc::ast::ast::CallExpression<'a>) {
            if self.done.iter().any(|start| *start < call.span.start) {
                // Inside something already replaced; its text was taken whole.
            }
            if let Some(edit) = self.consider(call) {
                self.done.insert(edit.span.start);
                self.out.push(edit);
                // Do NOT walk into it: the body is copied verbatim, and a
                // rewrite inside it would edit text that is about to move.
                return;
            }
            walk::walk_call_expression(self, call);
        }
    }
    impl Finder<'_, '_> {
        fn consider(&self, call: &oxc::ast::ast::CallExpression<'_>) -> Option<Edit> {
            // `createServerOnlyFn(f)` / `createClientOnlyFn(f)`: a bare call.
            if let Expression::Identifier(reference) = &call.callee {
                let symbol = reference
                    .reference_id
                    .get()
                    .and_then(|id| self.scoping.get_reference(id).symbol_id())?;
                let (wanted, label) = if Some(symbol) == self.imported.server_only {
                    (Env::Server, "createServerOnlyFn")
                } else if Some(symbol) == self.imported.client_only {
                    (Env::Client, "createClientOnlyFn")
                } else {
                    return None;
                };
                let inner = call.arguments.first()?.as_expression()?;
                let keeps = (self.env == wanted).then(|| inner.span());
                return Some(Edit {
                    keeps,
                    span: call.span,
                    text: if self.env == wanted {
                        self.slice(inner.span())
                    } else {
                        // A THROW, not a no-op: the author said this belongs to
                        // one side, so reaching it from the other is a bug and
                        // silence would hide it.
                        format!(
                            "(()=>{{throw new Error({:?})}})",
                            format!(
                                "[barq] {label}() may only be called on the {}",
                                env_name(wanted)
                            ),
                        )
                    },
                });
            }

            // `createIsomorphicFn().server(f).client(g)`: a member chain.
            let iso = self.imported.iso?;
            // From the CALLEE: the chain's spine is `callee -> object -> …`, and
            // the call node itself is the top of it rather than a link in it.
            if !rooted_at(&call.callee, iso, self.scoping) {
                return None;
            }
            // Only the OUTERMOST call of the chain is rewritten, and a chain is
            // outermost when nothing above it is part of the same chain — which
            // is what returning early from the visitor guarantees.
            let (text, keeps) = self.half_for(call, self.env)?;
            Some(Edit { span: call.span, text, keeps })
        }

        /// The body this environment keeps, or a no-op when none was declared.
        ///
        /// A NO-OP rather than a throw, which is theirs: an isomorphic function
        /// is one an author expects to call from anywhere, and refusing where
        /// they wrote no body would make every call site test the environment
        /// again — the branch this exists to delete.
        fn half_for(
            &self,
            call: &oxc::ast::ast::CallExpression<'_>,
            env: Env,
        ) -> Option<(String, Option<Span>)> {
            let wanted = if env == Env::Client { "client" } else { "server" };
            // The OUTERMOST call is handed in; each step down is `callee`, so
            // this walks `.client(g)` then `.server(f)` then the factory call.
            if let Some(found) = self.step(call, wanted) {
                return Some((self.slice(found), Some(found)));
            }
            Some(("(()=>{})".to_string(), None))
        }

        /// Walk one chain looking for `.<wanted>(fn)`, innermost last.
        fn step(&self, call: &oxc::ast::ast::CallExpression<'_>, wanted: &str) -> Option<Span> {
            if let Expression::StaticMemberExpression(member) = &call.callee {
                if member.property.name == wanted
                    && let Some(argument) = call.arguments.first()
                    && let Some(expression) = argument.as_expression()
                {
                    return Some(expression.span());
                }
                let mut object: &Expression<'_> = &member.object;
                loop {
                    match object {
                        Expression::ParenthesizedExpression(inner) => object = &inner.expression,
                        Expression::CallExpression(inner) => return self.step(inner, wanted),
                        Expression::StaticMemberExpression(inner) => object = &inner.object,
                        _ => return None,
                    }
                }
            }
            None
        }

        fn slice(&self, span: Span) -> String {
            self.source[span.start as usize..span.end as usize].to_string()
        }
    }

    let mut finder = Finder {
        scoping,
        imported,
        env,
        source,
        out,
        done: FxHashSet::default(),
        marker: std::marker::PhantomData,
    };
    finder.visit_program(program);
}

fn env_name(env: Env) -> &'static str {
    if env == Env::Client { "client" } else { "server" }
}

/// Whether an expression is a call chain whose root callee is `factory`.
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

#[cfg(test)]
mod tests {
    use super::*;

    const START: &str = "@barqjs/start";

    fn on(source: &str, env: Env) -> Option<String> {
        rewrite(source, "src/env.ts", START, env)
    }

    /// The whole point, in one case: neither bundle carries the other's body.
    #[test]
    fn each_environment_keeps_its_own_half() {
        let source = r#"import { createIsomorphicFn } from "@barqjs/start";
import { readFile } from "node:fs/promises";

export const load = createIsomorphicFn()
  .server(() => readFile("/etc/secret"))
  .client(() => fetch("/api/thing"));
"#;
        let server = on(source, Env::Server).expect("rewritten");
        assert!(server.contains("readFile(\"/etc/secret\")"), "{server}");
        assert!(!server.contains("fetch(\"/api/thing\")"), "{server}");

        let client = on(source, Env::Client).expect("rewritten");
        assert!(client.contains("fetch(\"/api/thing\")"), "{client}");
        assert!(!client.contains("/etc/secret"), "{client}");
    }

    /// A HALF THAT WAS NOT DECLARED is a no-op rather than a throw, which is
    /// theirs: an isomorphic function is one an author calls from anywhere, and
    /// refusing where they wrote no body would put the environment test back at
    /// every call site.
    #[test]
    fn a_missing_half_becomes_a_no_op() {
        let out = on(
            r#"import { createIsomorphicFn } from "@barqjs/start";
export const ping = createIsomorphicFn().server(() => 1);
"#,
            Env::Client,
        )
        .expect("rewritten");
        assert!(out.contains("(()=>{})"), "{out}");
        assert!(!out.contains("=> 1"), "{out}");
    }

    /// `createServerOnlyFn` throws on the client, because the author said this
    /// belongs to one side and silence would hide reaching it from the other.
    #[test]
    fn a_server_only_fn_throws_on_the_client() {
        let source = r#"import { createServerOnlyFn } from "@barqjs/start";
export const secret = createServerOnlyFn(() => process.env.TOKEN);
"#;
        let server = on(source, Env::Server).expect("rewritten");
        assert!(server.contains("process.env.TOKEN"), "{server}");

        let client = on(source, Env::Client).expect("rewritten");
        assert!(!client.contains("TOKEN"), "{client}");
        assert!(client.contains("throw new Error"), "{client}");
        assert!(client.contains("only be called on the server"), "{client}");
    }

    #[test]
    fn a_client_only_fn_throws_on_the_server() {
        let source = r#"import { createClientOnlyFn } from "@barqjs/start";
export const measure = createClientOnlyFn(() => window.innerWidth);
"#;
        let client = on(source, Env::Client).expect("rewritten");
        assert!(client.contains("window.innerWidth"), "{client}");

        let server = on(source, Env::Server).expect("rewritten");
        assert!(!server.contains("innerWidth"), "{server}");
        assert!(server.contains("only be called on the client"), "{server}");
    }

    /// By SYMBOL, so an unrelated function of the same name is not a match —
    /// the shape a text scan cannot tell apart.
    #[test]
    fn an_unrelated_call_of_the_same_name_is_not_a_match() {
        assert!(
            on(
                r#"import { createServerOnlyFn } from "./mine";
export const x = createServerOnlyFn(() => 1);
"#,
                Env::Client,
            )
            .is_none()
        );
    }

    #[test]
    fn a_renamed_import_still_resolves() {
        let out = on(
            r#"import { createServerOnlyFn as only } from "@barqjs/start";
export const secret = only(() => process.env.TOKEN);
"#,
            Env::Client,
        )
        .expect("rewritten");
        assert!(!out.contains("TOKEN"), "{out}");
    }

    /// The subpath the client build rewrites imports to resolves too, so a
    /// module that has been through `middleware_split` is still handled.
    #[test]
    fn the_env_subpath_resolves() {
        let out = on(
            r#"import { createServerOnlyFn } from "@barqjs/start/env";
export const secret = createServerOnlyFn(() => process.env.TOKEN);
"#,
            Env::Client,
        )
        .expect("rewritten");
        assert!(!out.contains("TOKEN"), "{out}");
    }

    /// Every output still parses, which a span rewrite is exactly the kind of
    /// change to break.
    #[test]
    fn every_output_parses() {
        let sources = [
            r#"import { createIsomorphicFn, createServerOnlyFn } from "@barqjs/start";
export const a = createIsomorphicFn().server(() => 1).client(() => 2);
export const b = createServerOnlyFn(async (x: number) => x + 1);
export const c = [a, b].map((f) => f);
"#,
            r#"import { createIsomorphicFn } from "@barqjs/start";
export const nested = { run: createIsomorphicFn().client(() => ({ deep: true })) };
"#,
        ];
        for source in sources {
            for env in [Env::Server, Env::Client] {
                let out = on(source, env).expect("rewritten");
                let allocator = Allocator::new();
                let parsed = Parser::new(
                    &allocator,
                    &out,
                    crate::compile::source_type_for(Some("src/env.ts")),
                )
                .parse();
                assert!(parsed.diagnostics.is_empty(), "{out}");
            }
        }
    }

    /// THE IMPORT GOES TOO. `@barqjs/start` declares no `sideEffects`, so a
    /// bundler keeps the statement even with every specifier unused — which
    /// puts the package index, and `node:async_hooks` through it, in the
    /// browser bundle.
    #[test]
    fn the_import_goes_when_nothing_references_it_any_more() {
        let out = on(
            r#"import { createServerOnlyFn } from "@barqjs/start";
export const secret = createServerOnlyFn(() => process.env.TOKEN);
"#,
            Env::Client,
        )
        .expect("rewritten");
        assert!(!out.contains("@barqjs/start"), "{out}");
    }

    /// …and a specifier something ELSE uses stays, with the statement rebuilt
    /// around it. Blanking it whole is the trap `route_split` records.
    #[test]
    fn a_mixed_import_keeps_what_is_still_used() {
        let out = on(
            r#"import { createServerOnlyFn, getRequest } from "@barqjs/start";
export const secret = createServerOnlyFn(() => process.env.TOKEN);
export const who = () => getRequest();
"#,
            Env::Client,
        )
        .expect("rewritten");
        assert!(out.contains(r#"import { getRequest } from "@barqjs/start""#), "{out}");
        // The IMPORT loses it; the throw message still names it, which is the
        // whole point of the message.
        assert!(!out.contains("import { createServerOnlyFn"), "{out}");
        let allocator = Allocator::new();
        let parsed =
            Parser::new(&allocator, &out, crate::compile::source_type_for(Some("src/env.ts")))
                .parse();
        assert!(parsed.diagnostics.is_empty(), "{out}");
    }

    /// A name still referenced OUTSIDE a replaced call keeps its import: an
    /// author who passes the factory around has a use this cannot see through.
    #[test]
    fn a_factory_used_as_a_value_keeps_its_import() {
        let out = on(
            r#"import { createServerOnlyFn } from "@barqjs/start";
export const secret = createServerOnlyFn(() => 1);
export const also = createServerOnlyFn;
"#,
            Env::Client,
        )
        .expect("rewritten");
        assert!(out.contains("@barqjs/start"), "{out}");
    }

    /// WHATEVER ONLY THE DELETED BODY READ goes too. Without it the body is
    /// gone and the secret it read is not, which relocates the leak rather than
    /// closing it — measured against a real dev server before this existed.
    #[test]
    fn a_constant_only_the_deleted_half_read_is_deleted() {
        let out = on(
            r#"import { createIsomorphicFn } from "@barqjs/start";

const SERVER_SECRET = "s3cr3t";
const CLIENT_MARK = "mark";

export const where = createIsomorphicFn()
  .server(() => SERVER_SECRET)
  .client(() => CLIENT_MARK);
"#,
            Env::Client,
        )
        .expect("rewritten");
        assert!(!out.contains("s3cr3t"), "{out}");
        assert!(out.contains("mark"), "{out}");
    }

    /// …and a constant BOTH halves read stays, so this never has to refuse.
    #[test]
    fn a_constant_both_halves_read_stays() {
        let out = on(
            r#"import { createIsomorphicFn } from "@barqjs/start";

const SHARED = "shared";

export const where = createIsomorphicFn()
  .server(() => SHARED)
  .client(() => SHARED);
"#,
            Env::Client,
        )
        .expect("rewritten");
        assert!(out.contains("shared"), "{out}");
    }

    #[test]
    fn a_module_that_never_mentions_them_is_not_parsed() {
        assert!(!mentions("export const x = 1;"));
        assert!(mentions("createIsomorphicFn()"));
    }
}
