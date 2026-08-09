pub mod analysis;
pub mod codegen;
pub mod compile;
/// Generated into `OUT_DIR` by `build.rs`; the lib only needs it to prove the
/// generated tables still match `dom.ts`.
#[cfg(test)]
mod dom_ts;
pub mod harvest;
pub mod ir;
pub mod lower;
pub mod options;
pub mod passes;
pub mod tables;

use napi_derive::napi;

pub use compile::{CompileOutput, Diagnostic, Severity, compile};
pub use options::{ResolvedOptions, TransformOptions};

#[napi(object)]
pub struct TransformResult {
    pub code: String,
    pub map: Option<String>,
    /// Non-fatal parser diagnostics, formatted as `file:line:col: message`.
    pub warnings: Vec<String>,
}

// catch_unwind is opt-in: without it napi-derive emits a bare call and any panic
// below aborts the host process instead of surfacing as a JS exception.
#[napi(catch_unwind)]
pub fn transform(code: String, options: Option<TransformOptions>) -> napi::Result<TransformResult> {
    let options = options.unwrap_or_default().resolve();
    match compile::compile(&code, &options) {
        Ok(output) => Ok(TransformResult {
            code: output.code,
            map: output.map,
            warnings: output.warnings.iter().map(ToString::to_string).collect(),
        }),
        Err(diagnostics) => Err(napi::Error::from_reason(format!(
            "[barq-compiler] {}\n{}",
            options.filename.as_deref().unwrap_or(compile::DEFAULT_FILENAME),
            compile::format_diagnostics(&diagnostics)
        ))),
    }
}
