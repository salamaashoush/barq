use napi_derive::napi;

pub const DEFAULT_MODULE_SOURCE: &str = "@barqjs/core";

/// Where the string backend's helpers come from. Its own package rather than a
/// subpath of [`DEFAULT_MODULE_SOURCE`]: the server runtime carries a
/// serializer and a streaming loop that no client bundle may pull in, and a
/// subpath export puts that decision in the bundler's hands instead of the
/// dependency graph's.
pub const DEFAULT_SERVER_SOURCE: &str = "@barqjs/server";

/// Where `createServerFn` is imported from. Resolution is by `SymbolId`, so this
/// is the specifier the import must name and not a text the source must contain.
pub const DEFAULT_START_SOURCE: &str = "@barqjs/start";

/// Where the CLIENT stub imports `clientRpc` from, which is deliberately not
/// {@link DEFAULT_START_SOURCE}.
///
/// `@barqjs/start`'s index re-exports `context.ts`, which is `node:async_hooks`,
/// plus the middleware runner, the validators and the error classes — none of
/// which a client stub uses. Importing the index from a stub put all of it in
/// every client bundle that reached one server function, and Vite said so on
/// every build. Measured on `packages/kitchen-sink`: 25.7 kB, and once the route
/// table became a set of STATIC imports that 25.7 kB moved into the set every
/// page preloads.
///
/// The author still writes `import { createServerFn } from "@barqjs/start"` —
/// this is only where the emitted stub points.
pub const DEFAULT_CLIENT_SOURCE: &str = "@barqjs/start/client";

/// Module source for `css`/`keyframes`/`globalCss`. Resolution is by symbol,
/// so this is the specifier an import must name rather than a text the source
/// must contain.
pub const DEFAULT_CSS_SOURCE: &str = "@barqjs/css";
const DEFAULT_ROUTER_SOURCE: &str = "@barqjs/router";

/// Which half of the program is being compiled.
///
/// Orthogonal to `ssr`, which picks a BACKEND. This picks what the module is
/// FOR: under `Client` a module whose exports are all server functions is
/// replaced by stubs rather than compiled, so no handler body, no validator and
/// none of the imports the body needed reach a browser bundle.
///
/// `Server` is the default, so a caller that never heard of the axis gets what
/// it always got.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Env {
    Client,
    Server,
}

impl Env {
    fn parse(text: &str) -> Option<Self> {
        match text {
            "client" => Some(Env::Client),
            "server" => Some(Env::Server),
            _ => None,
        }
    }
}

/// Which optimisations run. The reference for an optimising
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
    /// P5's grouping half. An element's live props share one `bindEffect`.
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
/// every component and every reactive read resolves by `SymbolId` in P0,
/// and `autoComputed` rewrote statements OUTSIDE JSX, which this pipeline never
/// touches: lowering takes no `Program` and codegen only splices at the sites
/// harvest recorded.
#[napi(object)]
#[derive(Debug, Clone, Default)]
pub struct TransformOptions {
    pub filename: Option<String>,
    pub sourcemap: Option<bool>,
    pub module_source: Option<String>,
    /// Module source for the string backend's helpers.
    /// @default `@barqjs/server`
    pub server_source: Option<String>,
    /// Module source for `createServerFn`.
    /// @default `@barqjs/start`
    pub start_source: Option<String>,
    /// Where the emitted CLIENT stub imports `clientRpc` from. Not the same
    /// module as {@link start_source} — see `DEFAULT_CLIENT_SOURCE`.
    /// @default `@barqjs/start/client`
    pub client_source: Option<String>,
    /// Module source for `Link` and `NavLink`.
    /// @default `@barqjs/router`
    pub router_source: Option<String>,
    /// Module source for `css`, `keyframes` and `globalCss`.
    /// @default `@barqjs/css`
    pub css_source: Option<String>,
    /// Every route pattern in the project, for `BARQ013` to check `<Link to>`
    /// against. The compiler sees ONE module; the route set is a whole-project
    /// fact, so it arrives as an option rather than being discovered.
    ///
    /// Absent (rather than empty) turns the check off, so a project without a
    /// route table does not get a warning on every link it writes.
    pub routes: Option<Vec<String>>,
    /// `"client"` or `"server"`. Picks which half of the program this module is
    /// being compiled for, which is a different question from `ssr`'s backend.
    /// @default `"server"`
    pub env: Option<String>,
    /// Project root. Server-function ids are derived relative to it, so an id
    /// carries no absolute path — RedwoodSDK ships `/src/path.ts#name` verbatim
    /// in its client bundle, which hands an attacker the source tree layout.
    pub root: Option<String>,
    /// Emit the module's server-function exports alongside the code. A side
    /// artefact on the same terms as `ownership` and `addresses`: nothing it
    /// produces reaches lowering, the passes or codegen, so `code` is
    /// byte-identical either way.
    pub server_fns: Option<bool>,
    pub dev: Option<bool>,
    pub templates: Option<bool>,
    pub ssr: Option<bool>,
    /// Emit for the reference backend instead of the DOM
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
    /// Emit the static ownership tree alongside the
    /// code. It is a side artefact: no field it produces reaches lowering, the
    /// passes or codegen, so `code` is byte-identical either way. Off by
    /// default — a production compile does not pay for the extra AST walk.
    pub ownership: Option<bool>,
    /// Emit the compile-time address table alongside the code. A side artefact
    /// on the same terms as `ownership`: nothing it produces reaches lowering,
    /// the passes or codegen, so `code` is byte-identical either way. Its point
    /// is that the DOM and the string backend can be compiled from one source
    /// and their address sets diffed.
    pub addresses: Option<bool>,
    /// Emit for CLAIM-BASED HYDRATION.
    ///
    /// Unlike `ownership` and `addresses` this one DOES change the emitted
    /// module, on both backends, and that is the point: the
    /// string backend writes `<!--[-->` … `<!--]-->` at every hole and
    /// `<!--[k-->` at every range, and the DOM backend walks through `child`
    /// and `sib` — a hydration-only logical index that steps over those ranges
    /// — instead of `.firstChild`/`.nextSibling`.
    ///
    /// Off by default, so a page that is never hydrated pays neither the wire
    /// bytes nor the indirection. H3's falsification procedure is exactly the
    /// diff between the two settings.
    pub hydratable: Option<bool>,
    /// The optimisation level. `0` turns every optimisation off and is the
    /// oracle's reference; anything else is the optimising
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

/// Every key `TransformOptions` reads, in the CAMEL CASE napi converts them to.
///
/// `#[napi(object)]` reads the fields it knows by name and drops the rest, so a
/// typo'd or renamed option is silently ignored and the compile proceeds with
/// the default. That is the worst available failure for this surface: asking
/// for `{ target: "ssr" }` compiles the DOM backend and returns a plausible
/// module, and the mistake is only visible to a reader who already knows what
/// the SSR emission should import. It cost a wrong backend comparison in the
/// M11 session, which is why the list exists.
///
/// Kept beside the struct deliberately: adding a field without adding it here
/// makes that field unusable, which `options_keys_cover_every_field` catches.
pub const OPTION_KEYS: &[&str] = &[
    "filename",
    "sourcemap",
    "moduleSource",
    "serverSource",
    "startSource",
    "clientSource",
    "env",
    "root",
    "serverFns",
    "dev",
    "templates",
    "ssr",
    "interp",
    "diagnostics",
    "checks",
    "defaultCategory",
    "ownership",
    "addresses",
    "hydratable",
    "optimize",
    "passes",
    "routerSource",
    "routes",
    "cssSource",
];

/// The message for an option this compiler does not have. Names the nearest
/// known key when there is one, because the overwhelmingly common cause is a
/// spelling rather than an invention.
pub fn unknown_option(key: &str) -> String {
    let lower = key.to_ascii_lowercase();
    let near = OPTION_KEYS.iter().find(|known| {
        let known_lower = known.to_ascii_lowercase();
        known_lower.contains(&lower) || lower.contains(&known_lower)
    });
    match near {
        Some(known) => format!("unknown option `{key}` (did you mean `{known}`?)"),
        None => format!("unknown option `{key}`"),
    }
}

#[derive(Debug, Clone)]
pub struct ResolvedOptions {
    pub filename: Option<String>,
    pub sourcemap: bool,
    pub module_source: String,
    pub server_source: String,
    pub start_source: String,
    pub client_source: String,
    pub router_source: String,
    pub css_source: String,
    pub routes: Option<Vec<String>>,
    pub env: Env,
    pub root: Option<String>,
    pub server_fns: bool,
    pub dev: bool,
    pub templates: bool,
    pub ssr: bool,
    pub interp: bool,
    pub diagnostics: bool,
    pub ownership: bool,
    pub addresses: bool,
    pub hydratable: bool,
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
            server_source: DEFAULT_SERVER_SOURCE.to_string(),
            start_source: DEFAULT_START_SOURCE.to_string(),
            client_source: DEFAULT_CLIENT_SOURCE.to_string(),
            router_source: DEFAULT_ROUTER_SOURCE.to_string(),
            css_source: DEFAULT_CSS_SOURCE.to_string(),
            routes: None,
            env: Env::Server,
            root: None,
            server_fns: false,
            dev: false,
            templates: true,
            ssr: false,
            interp: false,
            diagnostics: false,
            ownership: false,
            addresses: false,
            hydratable: false,
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
            server_source: self.server_source.unwrap_or_else(|| DEFAULT_SERVER_SOURCE.to_string()),
            start_source: self.start_source.unwrap_or_else(|| DEFAULT_START_SOURCE.to_string()),
            client_source: self.client_source.unwrap_or_else(|| DEFAULT_CLIENT_SOURCE.to_string()),
            router_source: self.router_source.unwrap_or_else(|| DEFAULT_ROUTER_SOURCE.to_string()),
            css_source: self.css_source.unwrap_or_else(|| DEFAULT_CSS_SOURCE.to_string()),
            routes: self.routes,
            env: self.env.as_deref().and_then(Env::parse).unwrap_or(Env::Server),
            root: self.root,
            server_fns: self.server_fns.unwrap_or(false),
            dev,
            templates: self.templates.unwrap_or(true),
            ssr: self.ssr.unwrap_or(false),
            interp: self.interp.unwrap_or(false),
            diagnostics: self.diagnostics.unwrap_or(dev),
            ownership: self.ownership.unwrap_or(false),
            addresses: self.addresses.unwrap_or(false),
            hydratable: self.hydratable.unwrap_or(false),
            opt,
            unknown_passes,
            severities: crate::diag::Severities::new(&checks, self.default_category.as_deref()),
        }
    }
}

#[cfg(test)]
mod tests {
    /// `OPTION_KEYS` is hand-written beside a `#[napi(object)]` struct, so the
    /// one way it rots is a field added without a key. That field would then be
    /// REJECTED at the boundary — the failure is loud rather than silent, but it
    /// makes the option unusable, so it is worth a test rather than a comment.
    ///
    /// The struct's field names are snake_case and napi converts them to camel,
    /// so the comparison is done on a normalised form.
    #[test]
    fn options_keys_cover_every_field() {
        fn camel(field: &str) -> String {
            let mut out = String::new();
            let mut upper = false;
            for ch in field.chars() {
                if ch == '_' {
                    upper = true;
                } else if upper {
                    out.push(ch.to_ascii_uppercase());
                    upper = false;
                } else {
                    out.push(ch);
                }
            }
            out
        }

        // Read the field list off the struct's own source rather than repeating
        // it: a list repeated twice in one file is two lists.
        let source = include_str!("options.rs");
        let start =
            source.find("pub struct TransformOptions {").expect("TransformOptions declaration");
        // Past the declaration line itself, or `struct TransformOptions {` parses
        // as a field named `struct`.
        let body = &source[start + "pub struct TransformOptions {".len()..];
        let end = body.find("\n}").expect("end of TransformOptions");
        let fields: Vec<String> = body[..end]
            .lines()
            .filter_map(|line| {
                let line = line.trim();
                let rest = line.strip_prefix("pub ")?;
                let name = rest.split(':').next()?;
                Some(camel(name))
            })
            .collect();

        assert!(!fields.is_empty(), "parsed no fields off TransformOptions");
        for field in &fields {
            assert!(
                OPTION_KEYS.contains(&field.as_str()),
                "TransformOptions has `{field}` and OPTION_KEYS does not, so passing it would be \
                 rejected at the boundary and the option would be unusable"
            );
        }
        for key in OPTION_KEYS {
            assert!(
                fields.iter().any(|field| field == key),
                "OPTION_KEYS names `{key}` and TransformOptions has no such field"
            );
        }
    }

    #[test]
    fn unknown_option_names_the_nearest_key() {
        // The case that motivated the check: `target` is not an option and the
        // caller meant a backend, but nothing here is close enough to guess.
        assert_eq!(unknown_option("target"), "unknown option `target`");
        // A spelling, which is the common case.
        assert!(unknown_option("Hydratable").contains("did you mean `hydratable`"));
        assert!(unknown_option("sourcemaps").contains("did you mean `sourcemap`"));
    }

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
        assert_eq!(resolved.server_source, "@barqjs/server");
        assert_eq!(resolved.start_source, "@barqjs/start");
        // The stub points at the CLIENT subpath, which is the whole point of it
        // being a separate option: the index drags `node:async_hooks`.
        assert_eq!(resolved.client_source, "@barqjs/start/client");
        assert_eq!(resolved.env, Env::Server);
        assert!(!resolved.server_fns);
        assert!(resolved.filename.is_none());
        assert!(!resolved.ownership);
        assert!(!resolved.addresses);
        // A page that is never hydrated pays neither the wire bytes nor the
        // indirection, so this one has to be asked for.
        assert!(!resolved.hydratable);
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
