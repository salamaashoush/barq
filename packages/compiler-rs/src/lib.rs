pub mod analysis;
pub mod codegen;
pub mod compile;
pub mod diag;
/// Generated into `OUT_DIR` by `build.rs`; the lib only needs it to prove the
/// generated tables still match `dom.ts`.
#[cfg(test)]
mod dom_ts;
pub mod harvest;
pub mod ir;
pub mod lower;
pub mod options;
pub mod ownership;
pub mod passes;
pub mod route_source;
pub mod route_split;
pub mod routes;
pub mod scope;
pub mod tables;

use napi::bindgen_prelude::{FromNapiValue, JsValue, Object};
use napi_derive::napi;

pub use compile::{CompileOutput, Diagnostic, Severity, compile};
pub use options::{ResolvedOptions, TransformOptions};

/// One diagnostic, as structured data. The span survives the boundary: `pos` is
/// what Rollup's `this.warn(warning, position)` takes, and that argument is the
/// only thing that produces `pos`/`loc`/`frame`. Flattening this to a string is
/// what left the pipeline with no code frame anywhere, in any mode.
#[napi(object)]
pub struct JsDiagnostic {
    /// `BARQ001`; absent for a parser diagnostic, which is oxc's code space.
    pub code: Option<String>,
    /// `note` | `warning` | `error`
    pub severity: String,
    pub message: String,
    pub file: String,
    /// 1-based
    pub line: u32,
    /// 1-based, UTF-16 code units — what a source map counts
    pub column: u32,
    pub end_line: u32,
    pub end_column: u32,
    /// byte offset into the ORIGINAL source
    pub pos: u32,
    pub end: u32,
    /// path of the docs page for this code, relative to the package root
    pub docs: Option<String>,
}

/// A dev-mode label: which JSX, in which component, produced a hoisted template.
#[napi(object)]
pub struct JsTemplateLabel {
    pub template: String,
    pub component: Option<String>,
    pub line: u32,
    pub column: u32,
}

#[napi(object)]
pub struct TransformResult {
    pub code: String,
    pub map: Option<String>,
    /// Every diagnostic, formatted as `file:line:col: CODE level: message`.
    /// Kept alongside `diagnostics` because a string is what a plain `this.warn`
    /// and a console sink both want; `diagnostics` is what a code frame needs.
    pub warnings: Vec<String>,
    pub diagnostics: Vec<JsDiagnostic>,
    /// Populated under `dev` only.
    pub labels: Vec<JsTemplateLabel>,
    /// The static ownership tree as JSON, under `ownership: true` only.
    /// The oracle's expected value, derived from the source rather than from a
    /// second execution.
    pub ownership: Option<String>,
    /// This module's export surface and which exports are server functions, as
    /// JSON, under `serverFns: true` only. The build reads it to know what to
    /// mount, and a reviewer reads it to see what is public.
    pub server_fns: Option<String>,
    /// The compile-time address table as JSON, under `addresses: true` only.
    /// `(module, unit, position)` for every
    /// position in the module, computed identically by every backend.
    pub addresses: Option<String>,
}

fn js_diagnostic(diagnostic: &Diagnostic) -> JsDiagnostic {
    JsDiagnostic {
        code: diagnostic.code.map(|code| code.as_str().to_string()),
        severity: diagnostic.severity.as_str().to_string(),
        message: diagnostic.message.clone(),
        file: diagnostic.filename.clone(),
        line: diagnostic.line,
        column: diagnostic.column,
        end_line: diagnostic.end_line,
        end_column: diagnostic.end_column,
        pos: diagnostic.pos,
        end: diagnostic.end,
        docs: diagnostic.docs(),
    }
}

// catch_unwind is opt-in: without it napi-derive emits a bare call and any panic
// below aborts the host process instead of surfacing as a JS exception.
/// Reject an option this compiler does not have, rather than dropping it.
///
/// `#[napi(object)]` binds the fields it knows and ignores everything else, so
/// `{ target: "ssr" }` compiled the DOM backend and returned a module that
/// looked right. A silently-ignored option on a surface whose whole job is to
/// pick between two backends is the same silent-failure shape this project
/// exists to remove, so the raw object is enumerated before it is bound.
fn reject_unknown_options(raw: &Object) -> napi::Result<()> {
    let mut unknown: Vec<String> = Object::keys(raw)?
        .into_iter()
        .filter(|key| !options::OPTION_KEYS.contains(&key.as_str()))
        .collect();
    if unknown.is_empty() {
        return Ok(());
    }
    unknown.sort();
    let reasons: Vec<String> = unknown.iter().map(|key| options::unknown_option(key)).collect();
    Err(napi::Error::from_reason(format!(
        "[barq-compiler] {}\n  known options: {}",
        reasons.join("\n[barq-compiler] "),
        options::OPTION_KEYS.join(", ")
    )))
}

// The parameter is a raw `Object` so `reject_unknown_options` can enumerate the
// keys the caller actually passed — `#[napi(object)]` binds what it knows and
// drops the rest, which is the whole defect. `ts_args_type` puts the real type
// back in the generated `.d.ts`, so a TypeScript caller still fails at COMPILE
// time and only an untyped one reaches the runtime check.
#[napi(catch_unwind, ts_args_type = "code: string, options?: TransformOptions | undefined | null")]
pub fn transform(code: String, options: Option<Object>) -> napi::Result<TransformResult> {
    let options = match options {
        Some(raw) => {
            reject_unknown_options(&raw)?;
            unsafe { TransformOptions::from_napi_value(raw.value().env, raw.raw())? }
        }
        None => TransformOptions::default(),
    };
    let options = options.resolve();
    match compile::compile(&code, &options) {
        Ok(output) => Ok(TransformResult {
            code: output.code,
            map: output.map,
            warnings: output.warnings.iter().map(ToString::to_string).collect(),
            diagnostics: output.warnings.iter().map(js_diagnostic).collect(),
            labels: output
                .labels
                .iter()
                .map(|label| JsTemplateLabel {
                    template: label.template.clone(),
                    component: label.component.clone(),
                    line: label.line,
                    column: label.column,
                })
                .collect(),
            ownership: output.ownership,
            addresses: output.addresses,
            server_fns: output.server_fns,
        }),
        Err(diagnostics) => Err(napi::Error::from_reason(format!(
            "[barq-compiler] {}\n{}",
            options.filename.as_deref().unwrap_or(compile::DEFAULT_FILENAME),
            compile::format_diagnostics(&diagnostics)
        ))),
    }
}

/// Every diagnostic this build can raise, with its default level and its docs
/// page. One resolution of the code table, shared by the Vite plugin and any
/// CLI, so a listing cannot drift from what the compiler actually emits.
#[napi(object)]
pub struct JsCode {
    pub code: String,
    pub level: String,
    pub summary: String,
    pub docs: String,
}

/// The `Backend` trait's whole instruction set, by `Op` variant name, generated
/// from the same macro list the trait and its dispatch are generated from
/// (`codegen::backend::OPS`).
///
/// It crosses the boundary so the reference backend's JS half can be checked
/// against it in BOTH directions. Rust exhaustiveness makes a new `Op` a compile
/// error in every `impl Backend`; nothing in the language can make it a compile
/// error in `interp.ts`, so the name sets are asserted equal instead — the same
/// bidirectional pinning discipline the rule IDs use.
#[napi]
pub fn opcodes() -> Vec<String> {
    codegen::backend::OPS.iter().map(|name| (*name).to_string()).collect()
}

#[napi]
pub fn diagnostic_codes() -> Vec<JsCode> {
    diag::Code::ALL
        .iter()
        .map(|code| JsCode {
            code: code.as_str().to_string(),
            level: code.default_level().as_str().to_string(),
            summary: code.summary().to_string(),
            docs: code.docs(),
        })
        .collect()
}

/// One route's id and the source file it came from.
///
/// The route table itself carries `src` per node, but a build wants the mapping
/// WITHOUT parsing the module it just generated — a second reader of our own
/// emit is a second thing to keep in step. `<link rel="modulepreload">` and the
/// route-action manifest both start from this.
#[napi(object)]
pub struct RouteEntry {
    /// The route id, as `RouteMap` keys it.
    pub id: String,
    /// Project-relative source path, without the leading slash the module uses.
    pub file: String,
}

/// The generated route table, its types, and what produced them.
#[napi(object)]
pub struct RouteTreeResult {
    /// The contents of `routeTree.gen.ts` — the table AND its types.
    ///
    /// One file rather than a virtual module plus a `.d.ts`, which is
    /// TanStack's arrangement, whose generated tree defaults to
    /// `./src/routeTree.gen.ts`. The caller writes it where `out_file` said.
    pub source: String,
    /// Every route file found, project-relative. The caller registers these
    /// with its watcher — file EVENTS are the one part of this that cannot move
    /// into the compiler, because the bundler owns them.
    pub files: Vec<String>,
    /// Every leaf pattern, which is what `routes` wants for `BARQ013`.
    pub patterns: Vec<String>,
    /// Route id to source file, layouts included, for the build-time checks.
    pub entries: Vec<RouteEntry>,
    /// Declarations a route made that are present but not literals. The caller
    /// reports these; the table cannot carry them and will not guess.
    pub warnings: Vec<String>,
    /// Route files whose `createFileRoute` id literal disagrees with the id
    /// their FILENAME derives, and that were not rewritten. Empty when
    /// `writeIds` asked for the rewrite and it succeeded.
    pub mismatches: Vec<RouteIdMismatch>,
    /// Route files whose id literal was rewritten on disk this call.
    pub rewritten: Vec<String>,
}

/// A route file whose id literal is out of date.
///
/// The literal is generator-owned: it is derived from the filename, so a rename
/// makes it wrong and hand-maintaining it is the chore `createFileRoute` exists
/// to remove.
#[napi(object)]
pub struct RouteIdMismatch {
    /// Project-relative source path.
    pub file: String,
    /// What the file says.
    pub declared: String,
    /// What its name derives.
    pub expected: String,
}

/// Both halves of a code-split route module.
#[napi(object)]
pub struct RouteSplitResult {
    /// The module the generated tree imports, with each split value replaced by
    /// a `lazy()` over the other half.
    pub reference: String,
    /// The module `<file>?barq-split` serves.
    pub split: String,
    /// Why the route was NOT split. Both halves are the original source in that
    /// case, so a refusal costs bytes and never correctness.
    pub refused: Option<String>,
}

/// Split a route module into the half the tree imports and the half it loads.
///
/// The static route table is what makes a file route able to declare the whole
/// option set — the router reads `validateSearch`, `beforeLoad` and the cache
/// options synchronously — and the price is an eager component. This is where
/// that price is paid back, and it is where TanStack pays it too
/// (`router-plugin/src/core/constants.ts:4-16`).
///
/// `specifier` is what the reference half will `import()`. The caller owns that
/// spelling because the BUNDLER decides what a module id looks like, not the
/// compiler.
///
/// `for_client` also DELETES the `server` option, which holds a route's HTTP
/// handlers. Without it a handler's body — and whatever it imports to reach a
/// database — sits in the browser bundle. Theirs deletes the same node.
#[napi]
pub fn route_split(
    source: String,
    filename: String,
    specifier: String,
    for_client: Option<bool>,
    split_components: Option<bool>,
) -> RouteSplitResult {
    if !route_split::mentions(&source) {
        return RouteSplitResult { reference: source.clone(), split: source, refused: None };
    }
    let out = route_split::split(
        &source,
        &filename,
        &specifier,
        for_client.unwrap_or(false),
        split_components.unwrap_or(true),
    );
    RouteSplitResult { reference: out.reference, split: out.split, refused: out.refused }
}

/// The directory part of a project-relative path, POSIX, no trailing slash.
///
/// The generated file's own directory is what every import specifier in it is
/// relative to, and a root-absolute specifier is the FILESYSTEM root to
/// TypeScript — which resolved to `any` and made every generated type
/// permissive, once, silently.
fn parent_of(file: &str) -> String {
    let normalized = file.replace('\\', "/");
    match normalized.rfind('/') {
        Some(slash) => normalized[..slash].to_owned(),
        None => String::new(),
    }
}

/// Scan a directory of route files and emit the table and its types.
///
/// The whole of file-based routing, in one call. The plugin asks and
/// invalidates; it does not read the directory, derive a route from a filename,
/// or build a string — so a route table cannot mean two things.
///
/// `out_file` is where the caller will write `source`, project-relative — the
/// import specifiers it emits are relative to that file's own directory.
///
/// `write_ids` is the one thing here that TOUCHES the project: a route's id
/// literal is generator-owned, so a rename makes it wrong, and dev rewrites it
/// in place the way their plugin does (`transform.ts:133-140`). A BUILD does
/// not — it reports the disagreement instead, so CI cannot pass on a file the
/// build silently edited.
#[napi]
pub fn route_tree(
    root: String,
    dir: String,
    out_file: Option<String>,
    write_ids: Option<bool>,
) -> RouteTreeResult {
    let root_path = std::path::Path::new(&root);
    let mut files = routes::scan(root_path, &dir);
    let mut warnings = routes::refusals(&files);
    let mut rewritten = Vec::new();
    let mut mismatches = routes::id_mismatches(&files);

    if write_ids.unwrap_or(false) && !mismatches.is_empty() {
        for file in &files {
            match routes::write_id(root_path, file) {
                Ok(true) => rewritten.push(file.file.clone()),
                Ok(false) => {}
                Err(error) => warnings
                    .push(format!("{}: could not rewrite the route id — {error}", file.file)),
            }
        }
        // Re-read, so what the table carries is what is now on disk.
        files = routes::scan(root_path, &dir);
        mismatches = routes::id_mismatches(&files);
    }

    let tree = routes::build_tree(&files);
    RouteTreeResult {
        warnings,
        rewritten,
        mismatches: mismatches
            .into_iter()
            .map(|mismatch| RouteIdMismatch {
                file: mismatch.file,
                declared: mismatch.declared,
                expected: mismatch.expected,
            })
            .collect(),
        source: routes::generate_route_tree(&tree, &parent_of(out_file.as_deref().unwrap_or(""))),
        files: files.into_iter().map(|file| file.file).collect(),
        patterns: routes::patterns(&tree),
        entries: routes::entries(&tree)
            .into_iter()
            .map(|(id, file)| RouteEntry { id, file })
            .collect(),
    }
}
