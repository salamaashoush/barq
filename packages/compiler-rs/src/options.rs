use napi_derive::napi;

pub const DEFAULT_MODULE_SOURCE: &str = "@barqjs/core";

/// `autoComputed` and the three component NAME LISTS the deleted Babel plugin
/// took are not here and will not be. Nothing in this compiler could read them —
/// every component and every reactive read resolves by `SymbolId` in P0 (§12 O6),
/// and `autoComputed` rewrote statements OUTSIDE JSX, which this pipeline never
/// touches: lowering takes no `Program` and codegen only splices at the sites
/// harvest recorded.
#[napi(object)]
#[derive(Debug, Clone, Default)]
pub struct TransformOptions {
    pub filename: Option<String>,
    pub sourcemap: Option<bool>,
    pub module_source: Option<String>,
    pub dev: Option<bool>,
    pub templates: Option<bool>,
    pub ssr: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct ResolvedOptions {
    pub filename: Option<String>,
    pub sourcemap: bool,
    pub module_source: String,
    pub dev: bool,
    pub templates: bool,
    pub ssr: bool,
}

impl Default for ResolvedOptions {
    fn default() -> Self {
        Self {
            filename: None,
            sourcemap: false,
            module_source: DEFAULT_MODULE_SOURCE.to_string(),
            dev: false,
            templates: true,
            ssr: false,
        }
    }
}

impl ResolvedOptions {
    pub fn with_filename(filename: impl Into<String>) -> Self {
        Self { filename: Some(filename.into()), ..Self::default() }
    }
}

impl TransformOptions {
    pub fn resolve(self) -> ResolvedOptions {
        ResolvedOptions {
            filename: self.filename,
            sourcemap: self.sourcemap.unwrap_or(false),
            module_source: self.module_source.unwrap_or_else(|| DEFAULT_MODULE_SOURCE.to_string()),
            dev: self.dev.unwrap_or(false),
            templates: self.templates.unwrap_or(true),
            ssr: self.ssr.unwrap_or(false),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_options_resolve_to_documented_defaults() {
        let resolved = TransformOptions::default().resolve();
        assert!(resolved.templates);
        assert!(!resolved.dev);
        assert!(!resolved.ssr);
        assert!(!resolved.sourcemap);
        assert_eq!(resolved.module_source, "@barqjs/core");
        assert!(resolved.filename.is_none());
    }

    /// Every option this surface advertises has to reach a decision the compiler
    /// actually makes. `autoComputed` and the three component name lists did
    /// not, and were removed rather than left as a lie the Vite plugin forwards.
    #[test]
    fn explicit_false_is_not_overwritten_by_the_default() {
        let resolved =
            TransformOptions { templates: Some(false), ..TransformOptions::default() }.resolve();
        assert!(!resolved.templates);
        let resolved =
            TransformOptions { dev: Some(true), ..TransformOptions::default() }.resolve();
        assert!(resolved.dev);
    }
}
