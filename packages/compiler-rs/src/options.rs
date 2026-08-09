use napi_derive::napi;

pub const DEFAULT_MODULE_SOURCE: &str = "@barqjs/core";

pub const DEFAULT_CONTROL_FLOW_COMPONENTS: &[&str] = &[
    "Show",
    "Match",
    "Switch",
    "ErrorBoundary",
    "Errored",
    "Suspense",
    "Loading",
    "Reveal",
    "Await",
];

pub const DEFAULT_LIST_COMPONENTS: &[&str] = &["For", "Index", "Repeat"];

/// The three name lists below are carried for napi shape compatibility with the
/// existing `BarqCompilerOptions` and nothing else. Everything resolves by
/// `SymbolId` in P0 (§12 O6); if nothing reads them by M5 the fields go too.

#[napi(object)]
#[derive(Debug, Clone, Default)]
pub struct TransformOptions {
    pub filename: Option<String>,
    pub sourcemap: Option<bool>,
    pub auto_computed: Option<bool>,
    pub control_flow_components: Option<Vec<String>>,
    pub list_components: Option<Vec<String>>,
    pub provider_components: Option<Vec<String>>,
    pub module_source: Option<String>,
    pub dev: Option<bool>,
    pub templates: Option<bool>,
    pub ssr: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct ResolvedOptions {
    pub filename: Option<String>,
    pub sourcemap: bool,
    pub auto_computed: bool,
    pub control_flow_components: Vec<String>,
    pub list_components: Vec<String>,
    pub provider_components: Vec<String>,
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
            auto_computed: true,
            control_flow_components: to_owned(DEFAULT_CONTROL_FLOW_COMPONENTS),
            list_components: to_owned(DEFAULT_LIST_COMPONENTS),
            provider_components: Vec::new(),
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
            auto_computed: self.auto_computed.unwrap_or(true),
            control_flow_components: self
                .control_flow_components
                .unwrap_or_else(|| to_owned(DEFAULT_CONTROL_FLOW_COMPONENTS)),
            list_components: self
                .list_components
                .unwrap_or_else(|| to_owned(DEFAULT_LIST_COMPONENTS)),
            provider_components: self.provider_components.unwrap_or_default(),
            module_source: self.module_source.unwrap_or_else(|| DEFAULT_MODULE_SOURCE.to_string()),
            dev: self.dev.unwrap_or(false),
            templates: self.templates.unwrap_or(true),
            ssr: self.ssr.unwrap_or(false),
        }
    }
}

fn to_owned(values: &[&str]) -> Vec<String> {
    values.iter().map(|v| (*v).to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_options_resolve_to_documented_defaults() {
        let resolved = TransformOptions::default().resolve();
        assert!(resolved.auto_computed);
        assert!(resolved.templates);
        assert!(!resolved.dev);
        assert!(!resolved.ssr);
        assert!(!resolved.sourcemap);
        assert_eq!(resolved.module_source, "@barqjs/core");
        assert_eq!(resolved.control_flow_components, to_owned(DEFAULT_CONTROL_FLOW_COMPONENTS));
        assert_eq!(resolved.list_components, to_owned(DEFAULT_LIST_COMPONENTS));
        assert!(resolved.provider_components.is_empty());
        assert!(resolved.filename.is_none());
    }

    #[test]
    fn explicit_false_is_not_overwritten_by_the_default() {
        let resolved =
            TransformOptions { auto_computed: Some(false), ..TransformOptions::default() }
                .resolve();
        assert!(!resolved.auto_computed);
    }
}
