use napi_derive::napi;

pub const DEFAULT_MODULE_SOURCE: &str = "@barqjs/core";

/// Which optimisations run. `CODESIGN.md` §6 L3: the reference for an optimising
/// compiler is the same compiler with the optimisations off, so `-O0` shares the
/// front end, the IR, the ABI and the ownership model and can encode neither a
/// legacy decision nor an optimisation bug. Every field is separately flippable
/// because bisectability — not the level itself — is what L3 buys.
///
/// Nothing here may change what the emitted module MEANS. Each flag removes a
/// transformation whose absence is slower or larger and never different.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Opt {
    /// P3. A `SetOnce` whose value is a proven constant migrates into the
    /// template HTML. Off: it stays a `setProp` call and a constant child stays
    /// an `insert` hole.
    pub fold: bool,
    /// P7. Two units that serialise to the same bytes share one `_tmpl$N`.
    /// Off: one template row per unit.
    pub dedup: bool,
    /// P5's anchor half. A hole anchors against a node the template already
    /// carries. Off: every hole gets its own `<!---->`.
    pub anchor: bool,
    /// P5's grouping half. An element's live props share one `renderEffect`.
    /// Off: every binding becomes its own live effect.
    pub fuse: bool,
    /// P6. A node is addressed from the nearest already-addressed sibling, in
    /// either direction. Off: every node descends from its own parent.
    pub walk: bool,
    /// `x={count()}` emits `count` rather than `() => count()`.
    pub eta: bool,
    /// A capture-free handler becomes a module-scope constant. Off: it is
    /// rebuilt at each use site.
    pub hoist: bool,
    /// A unit whose root sits in a return, a declarator or an arrow body emits
    /// its statements flat into the enclosing body. Off: every unit is an IIFE.
    pub splice: bool,
    /// The flow pass. On: a recognised control-flow construct is lowered onto
    /// one of `flow.ts`'s four primitives, handed the `(parent, anchor)` pair
    /// the template walk already computed and a flags integer carrying what the
    /// compiler proved. Off: it stays `Show($s, {…})` and the runtime adapter
    /// does the work — a props object, an adapter frame, `(null, null)` and
    /// `flags = 0`.
    ///
    /// This is the axis that makes the L3 differential non-vacuous: the two
    /// builds reach the same primitives by two genuinely different routes, so
    /// the `-O0` side is a real reference rather than the same bytes twice.
    pub flow: bool,
}

impl Opt {
    /// `-O0`, the L3 reference.
    pub const NONE: Self = Self {
        fold: false,
        dedup: false,
        anchor: false,
        fuse: false,
        walk: false,
        eta: false,
        hoist: false,
        splice: false,
        flow: false,
    };

    /// `-Ox`, and the default. Byte-for-byte what this compiler has always
    /// emitted.
    pub const ALL: Self = Self {
        fold: true,
        dedup: true,
        anchor: true,
        fuse: true,
        walk: true,
        eta: true,
        hoist: true,
        splice: true,
        flow: true,
    };

    /// The name every knob answers to, on the napi surface and in the Vite
    /// plugin. One table, so a listing cannot drift from what `set` accepts.
    pub const NAMES: [&'static str; 9] =
        ["fold", "dedup", "anchor", "fuse", "walk", "eta", "hoist", "splice", "flow"];

    pub fn level(level: u32) -> Self {
        if level == 0 { Self::NONE } else { Self::ALL }
    }

    /// `false` when the name is not one of [`Opt::NAMES`], so a typo surfaces as
    /// a diagnostic instead of a knob that silently did nothing.
    pub fn set(&mut self, name: &str, on: bool) -> bool {
        let field = match name {
            "fold" => &mut self.fold,
            "dedup" => &mut self.dedup,
            "anchor" => &mut self.anchor,
            "fuse" => &mut self.fuse,
            "walk" => &mut self.walk,
            "eta" => &mut self.eta,
            "hoist" => &mut self.hoist,
            "splice" => &mut self.splice,
            "flow" => &mut self.flow,
            _ => return false,
        };
        *field = on;
        true
    }
}

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
    /// Emit for the reference backend (`CODESIGN.md` §6 L2) instead of the DOM
    /// backend: the analysed IR is serialised beside the module and
    /// `@barqjs/core/interp` walks it. DEV and test only. Wins over `ssr`,
    /// because the two are different backends over the same IR and asking for
    /// both is a caller bug rather than a blend.
    pub interp: Option<bool>,
    /// Run the source-level diagnostic rules (D1, D3). Defaults to `dev`: they
    /// are advice about reactivity, they are delivered through the dev channels,
    /// and a production build should not pay for analysis nobody reads. Set it
    /// explicitly to run them in CI.
    pub diagnostics: Option<bool>,
    /// Per-code severity, `[[code, category]]`. `category` is one of `suppress`,
    /// `note`, `warning`, `error`. napi has no map type, so this is pairs.
    pub checks: Option<Vec<Vec<String>>>,
    /// The category every code takes when `checks` does not name it.
    pub default_category: Option<String>,
    /// Emit the static ownership tree (`CODESIGN.md` §6 L2b) alongside the
    /// code. It is a side artefact: no field it produces reaches lowering, the
    /// passes or codegen, so `code` is byte-identical either way. Off by
    /// default — a production compile does not pay for the extra AST walk.
    pub ownership: Option<bool>,
    /// The optimisation level. `0` turns every optimisation off and is the
    /// oracle's reference (`CODESIGN.md` §6 L3); anything else is the optimising
    /// path, which is the default. It changes no semantics — `-O0` output is
    /// slower and larger and never different.
    pub optimize: Option<u32>,
    /// Per-pass override on top of `optimize`, `[[name, "on"|"off"]]`. napi has
    /// no map type, so this is pairs. The names are `fold`, `dedup`, `anchor`,
    /// `fuse`, `walk`, `eta`, `hoist`, `splice`, `flow` — one flag per
    /// optimisation, because L3's payoff is that every optimisation is
    /// individually bisectable.
    pub passes: Option<Vec<Vec<String>>>,
}

#[derive(Debug, Clone)]
pub struct ResolvedOptions {
    pub filename: Option<String>,
    pub sourcemap: bool,
    pub module_source: String,
    pub dev: bool,
    pub templates: bool,
    pub ssr: bool,
    pub interp: bool,
    pub diagnostics: bool,
    pub ownership: bool,
    pub opt: Opt,
    /// Pass names the caller asked for that this build does not have. Carried
    /// rather than dropped so `compile` can warn: a knob that silently does
    /// nothing is the shape of lie this option surface already refuses.
    pub unknown_passes: Vec<String>,
    pub severities: crate::diag::Severities,
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
            interp: false,
            diagnostics: false,
            ownership: false,
            opt: Opt::ALL,
            unknown_passes: Vec::new(),
            severities: crate::diag::Severities::default(),
        }
    }
}

impl ResolvedOptions {
    pub fn with_filename(filename: impl Into<String>) -> Self {
        Self { filename: Some(filename.into()), ..Self::default() }
    }

    /// The same options with every optimisation off — the L3 reference build of
    /// this exact input.
    pub fn at_o0(self) -> Self {
        Self { opt: Opt::NONE, ..self }
    }
}

impl TransformOptions {
    pub fn resolve(self) -> ResolvedOptions {
        let dev = self.dev.unwrap_or(false);
        let checks: Vec<(String, String)> = self
            .checks
            .unwrap_or_default()
            .into_iter()
            .filter(|pair| pair.len() == 2)
            .map(|pair| {
                let mut pair = pair.into_iter();
                (pair.next().unwrap_or_default(), pair.next().unwrap_or_default())
            })
            .collect();
        let mut opt = Opt::level(self.optimize.unwrap_or(1));
        let mut unknown_passes = Vec::new();
        for pair in self.passes.unwrap_or_default() {
            let (Some(name), Some(state)) = (pair.first(), pair.get(1)) else { continue };
            if !opt.set(name, matches!(state.as_str(), "on" | "true" | "1")) {
                unknown_passes.push(name.clone());
            }
        }
        ResolvedOptions {
            filename: self.filename,
            sourcemap: self.sourcemap.unwrap_or(false),
            module_source: self.module_source.unwrap_or_else(|| DEFAULT_MODULE_SOURCE.to_string()),
            dev,
            templates: self.templates.unwrap_or(true),
            ssr: self.ssr.unwrap_or(false),
            interp: self.interp.unwrap_or(false),
            diagnostics: self.diagnostics.unwrap_or(dev),
            ownership: self.ownership.unwrap_or(false),
            opt,
            unknown_passes,
            severities: crate::diag::Severities::new(&checks, self.default_category.as_deref()),
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
        assert!(!resolved.interp);
        assert!(!resolved.sourcemap);
        assert_eq!(resolved.module_source, "@barqjs/core");
        assert!(resolved.filename.is_none());
        assert!(!resolved.ownership);
        // The default is the optimising path, so an existing caller that never
        // heard of the axis gets exactly the bytes it always got.
        assert_eq!(resolved.opt, Opt::ALL);
        assert!(resolved.unknown_passes.is_empty());
    }

    #[test]
    fn optimize_zero_turns_every_knob_off_and_nothing_else_does() {
        let resolved =
            TransformOptions { optimize: Some(0), ..TransformOptions::default() }.resolve();
        assert_eq!(resolved.opt, Opt::NONE);
        let resolved =
            TransformOptions { optimize: Some(1), ..TransformOptions::default() }.resolve();
        assert_eq!(resolved.opt, Opt::ALL);
    }

    /// L3's payoff is that every optimisation is bisectable by flipping ONE
    /// flag, which only holds if each name reaches its own field and no other.
    #[test]
    fn every_named_pass_is_individually_flippable_in_both_directions() {
        for name in Opt::NAMES {
            let mut off = Opt::ALL;
            assert!(off.set(name, false), "{name} is in NAMES but `set` refuses it");
            let mut on = Opt::NONE;
            assert!(on.set(name, true));

            let flipped = Opt::NAMES.iter().filter(|other| {
                let (mut a, mut b) = (Opt::ALL, Opt::NONE);
                a.set(other, false);
                b.set(other, true);
                a == off && b == on
            });
            assert_eq!(flipped.count(), 1, "{name} does not have a field to itself");
        }
    }

    #[test]
    fn a_pass_override_wins_over_the_level_and_a_typo_is_reported() {
        let resolved = TransformOptions {
            optimize: Some(0),
            passes: Some(vec![
                vec!["dedup".into(), "on".into()],
                vec!["tempaltes".into(), "off".into()],
            ]),
            ..TransformOptions::default()
        }
        .resolve();
        assert_eq!(resolved.opt, Opt { dedup: true, ..Opt::NONE });
        assert_eq!(resolved.unknown_passes, vec!["tempaltes".to_string()]);
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
