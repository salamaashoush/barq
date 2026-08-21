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
    /// `CODESIGN.md` §6 L2b — the oracle's expected value, derived from the
    /// source rather than from a second execution.
    pub ownership: Option<String>,
    /// This module's export surface and which exports are server functions, as
    /// JSON, under `serverFns: true` only. The build reads it to know what to
    /// mount, and a reviewer reads it to see what is public.
    pub server_fns: Option<String>,
    /// The compile-time address table as JSON, under `addresses: true` only.
    /// `CODESIGN.md` §3.11 and §5.2 P6 — `(module, unit, position)` for every
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
/// bidirectional pinning discipline `SEMANTICS.md` §0.3 uses for rule IDs.
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

/// The generated route table, its types, and what produced them.
#[napi(object)]
pub struct RouteTreeResult {
    /// The module `virtual:barq-routes` resolves to.
    pub module: String,
    /// The `.d.ts` a project writes beside its source.
    pub types: String,
    /// Every route file found, project-relative. The caller registers these
    /// with its watcher — file EVENTS are the one part of this that cannot move
    /// into the compiler, because the bundler owns them.
    pub files: Vec<String>,
    /// Every leaf pattern, which is what `routes` wants for `BARQ013`.
    pub patterns: Vec<String>,
}

/// Scan a directory of route files and emit the table and its types.
///
/// The whole of file-based routing, in one call. The plugin asks and
/// invalidates; it does not read the directory, derive a route from a filename,
/// or build a string — so a route table cannot mean two things.
#[napi]
pub fn route_tree(root: String, dir: String) -> RouteTreeResult {
    let files = routes::scan(std::path::Path::new(&root), &dir);
    let tree = routes::build_tree(&files);
    RouteTreeResult {
        module: routes::generate_module(&tree),
        types: routes::generate_types(&tree),
        files: files.into_iter().map(|file| file.file).collect(),
        patterns: routes::patterns(&tree),
    }
}
