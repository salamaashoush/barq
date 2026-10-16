//! The CLIENT half of a module that declares middleware.
//!
//! `createMiddleware().server(fn)` holds two bodies for two sides. The client
//! needs one of them: `.client(fn)` runs in the browser around the fetch, and
//! `.server(fn)` runs where the handler is and must never leave the server.
//!
//! Deleting the server half is not an optimisation, it is the same rule
//! `route_split::CLIENT_STRIP_KEYS` enforces one level up, and for the same
//! measured reason. A middleware holds the check an application does not want
//! to publish and reaches whatever that check needs — a session, a database, a
//! secret. `packages/kitchen-sink/src/auth.ts` is the ordinary shape and it
//! value-imports `useSession` from `@barqjs/start`, whose index reaches
//! `context.ts` and `node:async_hooks`; a browser answered `Module
//! "node:async_hooks" has been externalized for browser compatibility` and the
//! router entry stopped evaluating there.
//!
//! So a middleware module could not be imported by a client bundle at all until
//! now, and the client stub carried no chain. This is what makes carrying one
//! safe: the `.server(…)` CALL goes, and any top-level declaration only it
//! reached goes with it.
//!
//! `.validator(…)` goes with it, which is TanStack's rule
//! (`handleCreateMiddleware.ts:44-68` strips both). Validation runs on the
//! server and the client half never calls it, so a schema left here is a zod or
//! valibot import in the browser bundle that nothing will ever use.

use oxc::allocator::Allocator;
use oxc::ast::ast::{Expression, Program, Statement};
use oxc::ast_visit::{Visit, walk};
use oxc::parser::Parser;
use oxc::semantic::{Scoping, SemanticBuilder, SymbolId};
use oxc::span::{GetSpan, Span};
use rustc_hash::FxHashSet;

use crate::route_split::{
    Blanker, collect_refs, collect_refs_excluding, declaration_of, dependencies, reachable,
    top_level,
};

/// The cheap question first, as every other pass in the compiler asks it: a
/// module that never mentions the name cannot import it, and a symbol table
/// built to discover that is pure cost.
pub fn mentions(source: &str) -> bool {
    source.contains("createMiddleware")
}

/// Strip every `.server(…)` and `.validator(…)` from a module's middleware, for
/// the client build.
///
/// Returns `None` when there is nothing to strip, so the caller can hand the
/// source through untouched rather than pay a re-print for no change.
/// The exports of `@barqjs/start/middleware`, which is the subpath a client
/// build may import.
///
/// The package INDEX cannot be: it re-exports `context.ts`, which reaches
/// `node:async_hooks`, and a browser answers `Module "node:async_hooks" has
/// been externalized` and stops evaluating there. `clientRpc` has its own
/// subpath for exactly this reason (`DEFAULT_CLIENT_SOURCE`), and this is the
/// same rule for the same import.
///
/// A LIST rather than a resolution, because the compiler cannot read the
/// package: a surviving import naming anything not on it keeps the index and
/// the author gets whatever the index gives them.
const MIDDLEWARE_EXPORTS: [&str; 15] = [
    "BuiltMiddleware",
    "InputError",
    "Middleware",
    "MiddlewareContext",
    "MiddlewareFn",
    "MiddlewareNext",
    "MiddlewareOptions",
    "StandardSchema",
    "UncheckedInputError",
    "ValidationError",
    "Validator",
    "applyValidator",
    "createMiddleware",
    "flattenMiddleware",
    "isBuiltMiddleware",
];

pub fn split(source: &str, filename: &str, start_source: &str) -> Option<String> {
    let allocator = Allocator::new();
    let parsed =
        Parser::new(&allocator, source, crate::compile::source_type_for(Some(filename))).parse();
    if !parsed.diagnostics.is_empty() {
        // A parse failure is the JSX compiler's to report, with a position.
        // Reporting it here too would report it twice.
        return None;
    }
    let program = &parsed.program;
    let scoping = SemanticBuilder::new().build(program).semantic.into_scoping();
    let factory = imported_factory(program, start_source)?;

    // Every `.server(arg)` and `.validator(arg)` whose chain root is that
    // import: the span of the whole suffix, and the span of the argument alone.
    let mut calls: Vec<(Span, Span)> = Vec::new();
    collect_server_halves(program, factory, &scoping, &mut calls);
    if calls.is_empty() {
        return None;
    }

    // What ONLY the deleted bodies reach. A declaration the rest of the module
    // also uses stays, so unlike a code split this needs no refusal: deleting a
    // call never has to delete a binding something else reads.
    let tops = top_level(program, &scoping);
    let graph = dependencies(program, &scoping, &tops);
    let mut gone_roots = FxHashSet::default();
    for (_, argument) in &calls {
        collect_refs(program, &scoping, *argument, &mut gone_roots);
    }
    // What the module reaches with those bodies taken out. A binding both a
    // deleted body and the surviving module use is KEPT, which is what makes
    // this need no refusal where a code split does: nothing is duplicated,
    // something is only removed.
    let holes: Vec<Span> = calls.iter().map(|(_, argument)| *argument).collect();
    let mut kept_roots = FxHashSet::default();
    collect_refs_excluding(program, &scoping, program.span, &holes, &mut kept_roots);
    let kept = reachable(&kept_roots, &graph);
    let gone: FxHashSet<SymbolId> = reachable(&gone_roots, &graph)
        .into_iter()
        .filter(|symbol| !kept.contains(symbol))
        .collect();

    // EVERY EDIT FIRST, THEN APPLIED BACK TO FRONT.
    //
    // A rewritten import can be LONGER than what it replaces —
    // `"@barqjs/start/middleware"` is a longer specifier than `"@barqjs/start"`
    // — and `Blanker::replace` splices when it does not fit, which moves every
    // offset after it. Applied in descending order of start, a splice can only
    // move spans that have already been written.
    let mut edits: Vec<(Span, Option<String>)> = Vec::new();
    for (call, _) in &calls {
        edits.push((*call, None));
    }
    for statement in &program.body {
        // AN IMPORT IS REWRITTEN, NOT BLANKED, and that distinction is the one
        // `route_split` records paying for: `import { createMiddleware,
        // useSession }` binds one name the module still needs and one only the
        // deleted body reached, so blanking the statement took both and the
        // client half called an identifier it no longer imported.
        //
        // The replacement is always SHORTER — a name has been removed — so it
        // fits in the hole and `Blanker` pads rather than splices, which is what
        // keeps every later span in this loop pointing where it did.
        if let Statement::ImportDeclaration(import) = statement {
            if let Some(edit) = import_edit(import, &gone, start_source) {
                edits.push(edit);
            }
            continue;
        }
        let Some(symbols) = declaration_of(statement) else { continue };
        // EVERY binding, not any: a declaration the module still reads through
        // one of its names has to stay whole.
        if !symbols.is_empty() && symbols.iter().all(|symbol| gone.contains(symbol)) {
            edits.push((statement.span(), None));
        }
    }

    edits.sort_by_key(|(span, _)| std::cmp::Reverse(span.start));
    let mut out = Blanker::new(source);
    for (span, replacement) in edits {
        match replacement {
            Some(text) => out.replace(span, &text),
            None => out.blank(span),
        }
    }
    Some(out.finish())
}

/// Keep only the specifiers whose bindings the module still reaches.
///
/// Blanks the statement when none survive, so a module imported purely for a
/// deleted body leaves the client graph entirely.
fn import_edit(
    import: &oxc::ast::ast::ImportDeclaration<'_>,
    gone: &FxHashSet<SymbolId>,
    start_source: &str,
) -> Option<(Span, Option<String>)> {
    use oxc::ast::ast::ImportDeclarationSpecifier;
    let specifiers = import.specifiers.as_ref()?;
    // `(text, is_type)`. The TYPE marker has to survive the rewrite: dropping it
    // turns `import { type SessionConfig }` into a value import of something the
    // module exports only as a type, which is a live binding of `undefined` that
    // happens to work because nothing reads it. It also decides the specifier
    // below — a type is erased, so it cannot keep the import on the index.
    let survivor = |specifier: &ImportDeclarationSpecifier<'_>| -> Option<(String, bool)> {
        let ImportDeclarationSpecifier::ImportSpecifier(named) = specifier else {
            // A default or namespace binding is not in a brace list, so a mixed
            // statement holding one is left alone rather than reassembled
            // wrongly. Nothing in this codebase writes one for a middleware.
            return Some((String::new(), false));
        };
        if named.local.symbol_id.get().is_some_and(|symbol| gone.contains(&symbol)) {
            return None;
        }
        let is_type = named.import_kind.is_type();
        let bare = if named.imported.name() == named.local.name {
            named.local.name.to_string()
        } else {
            format!("{} as {}", named.imported.name(), named.local.name)
        };
        Some((if is_type { format!("type {bare}") } else { bare }, is_type))
    };
    let kept: Vec<(String, bool)> = specifiers.iter().filter_map(survivor).collect();
    if kept.len() == specifiers.len() {
        return None;
    }
    if kept.is_empty() {
        return Some((import.span, None));
    }
    // A default or namespace binding survived beside a named one. Reassembling
    // that correctly is more shapes than any application here writes, so the
    // statement is left exactly as it stands.
    if kept.iter().any(|(text, _)| text.is_empty()) {
        return None;
    }
    // THE SUBPATH, when everything left is middleware. `import { createMiddleware,
    // useSession } from "@barqjs/start"` loses `useSession` here, and what is
    // left must not keep reaching the index — that is where `node:async_hooks`
    // is, and the whole strip would have been for nothing.
    let specifier = if import.source.value.as_str() == start_source
        // A TYPE is erased and cannot pull anything into the bundle, so it does
        // not decide where the runtime import points.
        && kept.iter().filter(|(_, is_type)| !is_type).all(|(name, _)| {
            MIDDLEWARE_EXPORTS.contains(&name.split(" as ").next().unwrap_or(name))
        }) {
        format!("{start_source}/middleware")
    } else {
        import.source.value.to_string()
    };
    let names = kept.iter().map(|(text, _)| text.as_str()).collect::<Vec<_>>().join(", ");
    Some((import.span, Some(format!("import {{ {names} }} from {specifier:?};"))))
}

/// The local binding `createMiddleware` was imported under, whatever it was
/// renamed to. By symbol, so a shadowing local is not a false positive and
/// `createMiddleware as guard` is not a false negative.
fn imported_factory(program: &Program<'_>, start_source: &str) -> Option<SymbolId> {
    use oxc::ast::ast::ImportDeclarationSpecifier;
    for statement in &program.body {
        let Statement::ImportDeclaration(import) = statement else { continue };
        if import.source.value.as_str() != start_source {
            continue;
        }
        for specifier in import.specifiers.iter().flatten() {
            let ImportDeclarationSpecifier::ImportSpecifier(named) = specifier else { continue };
            if named.imported.name() == "createMiddleware" {
                return named.local.symbol_id.get();
            }
        }
    }
    None
}

/// Walk the module for `<chain>.server(arg)` calls rooted at `factory`.
fn collect_server_halves(
    program: &Program<'_>,
    factory: SymbolId,
    scoping: &Scoping,
    out: &mut Vec<(Span, Span)>,
) {
    struct Finder<'a, 'b> {
        factory: SymbolId,
        scoping: &'b Scoping,
        out: &'b mut Vec<(Span, Span)>,
        marker: std::marker::PhantomData<&'a ()>,
    }
    impl<'a> Visit<'a> for Finder<'a, '_> {
        fn visit_call_expression(&mut self, call: &oxc::ast::ast::CallExpression<'a>) {
            if let Expression::StaticMemberExpression(member) = &call.callee
                && matches!(member.property.name.as_str(), "server" | "validator")
                && rooted_at(&member.object, self.factory, self.scoping)
                && let Some(argument) = call.arguments.first()
                && let Some(expression) = argument.as_expression()
            {
                // From the end of the object to the closing `)`, so
                // `createMiddleware().server(f)` becomes `createMiddleware()` —
                // a middleware with no server half, which the runner passes
                // straight through rather than refusing.
                //
                // A SPREAD is skipped: `.server(...pair)` is a runtime
                // expression, so blanking it would change what the remaining
                // argument list means. It survives into the client bundle,
                // which is the safe direction — bytes rather than a wrong
                // program — and no application writes it.
                self.out
                    .push((Span::new(member.object.span().end, call.span.end), expression.span()));
            }
            walk::walk_call_expression(self, call);
        }
    }
    let mut finder = Finder { factory, scoping, out, marker: std::marker::PhantomData };
    finder.visit_program(program);
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

    fn run(source: &str) -> Option<String> {
        split(source, "src/auth.ts", START)
    }

    /// The whole point: the server body goes and so does the import only it
    /// reached, which is what once left a page with nothing interactive on it.
    #[test]
    fn the_server_half_and_what_only_it_reached_are_deleted() {
        let out = run(r#"import { createMiddleware, useSession } from "@barqjs/start";
import { db } from "./db";

export const requireSession = createMiddleware().server(async ({ next }) => {
  const session = await useSession({ password: "x" });
  await db.touch(session.id);
  return next({ context: { user: session.data.user } });
});
"#)
        .expect("a module with a server half is split");
        assert!(!out.contains("useSession("), "{out}");
        assert!(!out.contains("db.touch"), "{out}");
        assert!(!out.contains(r#"from "./db""#), "{out}");
        assert!(out.contains("createMiddleware()"), "{out}");
        assert!(out.contains("export const requireSession"), "{out}");
    }

    #[test]
    fn the_client_half_survives() {
        let out = run(r#"import { createMiddleware } from "@barqjs/start";
import { tabId } from "./tab";

export const tagged = createMiddleware()
  .client(async ({ next }) => next({ sendContext: { tab: tabId } }))
  .server(async ({ next }) => next());
"#)
        .expect("split");
        assert!(out.contains("sendContext"), "{out}");
        assert!(out.contains("tabId"), "{out}");
        assert!(out.contains(r#"from "./tab""#), "{out}");
    }

    /// A binding BOTH halves reach stays. Deleting a call never has to delete a
    /// binding something else reads, which is why this needs no refusal where a
    /// code split does.
    #[test]
    fn a_binding_both_halves_reach_stays() {
        let out = run(r#"import { createMiddleware } from "@barqjs/start";
import { KEY } from "./key";

export const both = createMiddleware()
  .client(async ({ next }) => next({ sendContext: { k: KEY } }))
  .server(async ({ next }) => next({ context: { k: KEY } }));
"#)
        .expect("split");
        assert!(out.contains(r#"from "./key""#), "{out}");
    }

    /// `.validator(…)` goes too, which is theirs: validation runs on the server
    /// and the client half never calls it, so a schema left here is a zod
    /// import in the browser bundle that nothing uses.
    #[test]
    fn the_validator_and_its_schema_are_deleted() {
        let out = run(r#"import { createMiddleware } from "@barqjs/start";
import { Payload } from "./schema";

export const checked = createMiddleware()
  .validator(Payload)
  .client(async ({ next }) => next())
  .server(async ({ next }) => next());
"#)
        .expect("split");
        assert!(!out.contains("Payload"), "{out}");
        assert!(!out.contains(r#"from "./schema""#), "{out}");
        assert!(out.contains(".client("), "{out}");
    }

    /// A MIXED import keeps the names the module still reaches.
    ///
    /// `route_split` records paying for this exact trap once: blanking the
    /// statement took the binding the surviving code needed with it, and the
    /// client half called an identifier it no longer imported.
    #[test]
    fn a_mixed_import_keeps_what_survives() {
        let out = run(r#"import { createMiddleware, useSession } from "@barqjs/start";

export const m = createMiddleware().server(async ({ next }) => {
  await useSession({});
  return next();
});
"#)
        .expect("split");
        assert!(out.contains("createMiddleware"), "{out}");
        assert!(!out.contains("useSession"), "{out}");
        // Still parses, which blanking half a brace list does not.
        let allocator = oxc::allocator::Allocator::new();
        let parsed = oxc::parser::Parser::new(
            &allocator,
            &out,
            crate::compile::source_type_for(Some("src/auth.ts")),
        )
        .parse();
        assert!(parsed.diagnostics.is_empty(), "{out}");
    }

    /// The surviving import points at the SUBPATH, not the package index.
    ///
    /// The index re-exports `context.ts` and reaches `node:async_hooks`, so
    /// leaving it there would undo the whole strip — measured in Chrome as
    /// `Module "node:async_hooks" has been externalized` on a page that then
    /// did nothing. `clientRpc` has its own subpath for the same reason.
    #[test]
    fn the_surviving_start_import_moves_to_the_middleware_subpath() {
        let out = run(r#"import { createMiddleware, useSession } from "@barqjs/start";

export const m = createMiddleware().server(async ({ next }) => {
  await useSession({});
  return next();
});
"#)
        .expect("split");
        assert!(out.contains(r#"from "@barqjs/start/middleware""#), "{out}");
        assert!(!out.contains(r#"from "@barqjs/start";"#), "{out}");
    }

    /// A TYPE-ONLY specifier keeps its marker and does not decide the source.
    ///
    /// Dropping `type` turns it into a value import of something exported only
    /// as a type — a binding of `undefined` that works because nothing reads
    /// it — and counting it as a value would keep the import on the index for a
    /// name that is erased before the browser ever sees it.
    #[test]
    fn a_type_only_specifier_survives_as_one() {
        let out = run(
            r#"import { type SessionConfig, createMiddleware, useSession } from "@barqjs/start";

export const config: SessionConfig = { password: "x" };
export const m = createMiddleware().server(async ({ next }) => {
  await useSession(config);
  return next();
});
"#,
        )
        .expect("split");
        assert!(out.contains("type SessionConfig"), "{out}");
        assert!(out.contains(r#"from "@barqjs/start/middleware""#), "{out}");
        assert!(!out.contains("useSession"), "{out}");
    }

    /// …and it does NOT move when something the subpath does not export
    /// survives, because the compiler cannot read the package to check.
    #[test]
    fn an_import_keeping_something_else_stays_on_the_index() {
        let out = run(r#"import { createMiddleware, getRequest, useSession } from "@barqjs/start";

export const m = createMiddleware().server(async ({ next }) => {
  await useSession({});
  return next();
});
export const who = () => getRequest();
"#)
        .expect("split");
        assert!(out.contains(r#"from "@barqjs/start""#), "{out}");
        assert!(!out.contains("/middleware"), "{out}");
        assert!(!out.contains("useSession"), "{out}");
    }

    /// A rewritten import is longer than what it replaced, so the edits are
    /// applied back to front. Without that the statement after it is blanked at
    /// the wrong offset, which is a syntax error rather than a wrong answer.
    #[test]
    fn a_longer_rewrite_does_not_move_the_edits_after_it() {
        let out = run(r#"import { createMiddleware, useSession } from "@barqjs/start";
import { db } from "./db";

export const m = createMiddleware().server(async ({ next }) => {
  await useSession({});
  await db.touch();
  return next();
});
"#)
        .expect("split");
        assert!(!out.contains("db"), "{out}");
        let allocator = oxc::allocator::Allocator::new();
        let parsed = oxc::parser::Parser::new(
            &allocator,
            &out,
            crate::compile::source_type_for(Some("src/auth.ts")),
        )
        .parse();
        assert!(parsed.diagnostics.is_empty(), "{out}");
    }

    #[test]
    fn an_import_reached_only_by_a_deleted_body_goes_entirely() {
        let out = run(r#"import { createMiddleware } from "@barqjs/start";
import { db } from "./db";

export const m = createMiddleware().server(async ({ next }) => {
  await db.touch();
  return next();
});
"#)
        .expect("split");
        assert!(!out.contains(r#"from "./db""#), "{out}");
    }

    #[test]
    fn a_module_with_no_server_half_is_left_alone() {
        assert!(
            run(r#"import { createMiddleware } from "@barqjs/start";
export const m = createMiddleware().client(async ({ next }) => next());
"#)
            .is_none()
        );
    }

    /// By SYMBOL, so an unrelated `.server(…)` on something else is not a match
    /// — the shape a text scan cannot tell apart.
    #[test]
    fn an_unrelated_server_call_is_not_a_match() {
        assert!(
            run(r#"import { createMiddleware } from "@barqjs/start";
import { app } from "./app";
app.server(() => 1);
export const m = createMiddleware().client(async ({ next }) => next());
"#)
            .is_none()
        );
    }

    /// A renamed import still resolves, and a shadowing local does not.
    #[test]
    fn the_import_is_resolved_by_symbol() {
        let out = run(r#"import { createMiddleware as guard } from "@barqjs/start";
import { secret } from "./secret";
export const m = guard().server(async ({ next }) => next({ context: { secret } }));
"#)
        .expect("split");
        assert!(!out.contains(r#"from "./secret""#), "{out}");
    }

    #[test]
    fn a_module_that_never_mentions_it_is_not_parsed() {
        assert!(!mentions("export const x = 1;"));
        assert!(mentions("createMiddleware()"));
    }

    /// Blanking preserves offsets, so a source map over the client half still
    /// points at the author's lines.
    #[test]
    fn the_output_is_the_same_length() {
        let source = r#"import { createMiddleware } from "@barqjs/start";
export const m = createMiddleware().server(async ({ next }) => next());
"#;
        let out = run(source).expect("split");
        assert_eq!(out.len(), source.len());
    }
}
