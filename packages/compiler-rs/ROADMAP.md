# Roadmap — what comes after M7

Milestones 1–6 built the compiler; M7 closes the measured gaps in `MILESTONES.md` §5. This file
plans what comes next, in the order it should be built. Same shape as `DESIGN.md` §10: each
milestone names its deliverable, the one risk that could sink it, the cost constraint, and the
acceptance test — plus, new in this revision, the prior art that justifies each design choice and a
note on what the research changed.

The previous version of this file was written from a read of this repository alone. It has since
been checked against how Solid, Svelte, Vue, Vue Vapor, Angular, React, Marko, Qwik, MobX, Astro and
Flutter solve the same three problems, against their issue trackers, and against three original
measurements (marker payload under gzip/brotli, claim-vs-replace hydration in real Chromium,
cross-module dedup savings under compression). Where the evidence contradicted the plan, each
milestone carries a **What changed after research** note. Two deliverables were deleted outright and
are recorded in *Considered and rejected* with the reason and the citation — that section is
load-bearing and should be read before anyone proposes them again.

Every design choice below carries the prior art that justifies it. A choice with no citation does
not belong in this file.

---

## Ordering

**Now (un-milestoned): wire `getNextChildId` into `createAsync`.**
**Then: M8a → M8b → M9 → M10.** M11 is optional and separate.

The previous ordering rationale was "M8 costs the least and closes a regression this project
created; M9 is DX payoff on infrastructure that already exists; M10 is last because it reverses a
documented design decision and needs a new serialisation mode." Two of those three claims are false
(see the per-milestone notes), so the order needs a new justification. It is:

1. **M8a is infrastructure the other two consume.** M9 needs a leading-comment reader for
   `@refresh skip` / `@refresh reload` — a pragma set every refresh implementation ships
   ([solid-refresh](https://github.com/solidjs/solid-refresh/blob/main/README.md),
   [react-refresh](https://raw.githubusercontent.com/facebook/react/main/packages/react-refresh/src/ReactFreshBabelPlugin.js)).
   M10 needs a diagnostic channel for the unclaimed-node sweep and for the two SSR-safety rules that
   only become load-bearing once hydration claims nodes. Building the engine once, first, is
   cheaper than building two ad-hoc channels.
2. **M8a is the only one of the three with no `packages/core` dependency.** M9 and M10 both need
   runtime work in a second package; M8a is entirely inside `compiler-rs` plus the Vite plugin.
3. **M9 before M10** because M9's payoff is larger than the previous version of this file claimed
   (today every barq edit is a full page reload — see M9), and because M10's `hydratable` codegen
   variant will need the fixture corpus regenerated, which is easier once the HMR-on variant has
   already forced that machinery to exist.

**The honest counter-ranking.** If you order by *user-visible wrongness in code that ships today*,
M10 outranks everything except the `createAsync` fix, because replace-based hydration destroys focus
and discards typed input on every page load (M10, risk section). That is a correctness bug, not a
performance gap. If that matters more than the infrastructure argument, run M10 second and M9 third;
nothing in M10 depends on M9.

---

## Now — wire `getNextChildId` into `createAsync` auto-keying

Not a milestone. Small, orthogonal to all three, and a footgun in shipped behaviour.

`createAsync` (`packages/core/src/signals.ts:2232`) does `if (key === undefined) return computed(fn,
options)` — **no SSR serialisation at all** unless the developer remembers to pass `{ key }`. So
barq's SSR data seeding silently does nothing by default. Solid auto-keys resources off the
hydration counter, which is why nobody writes keys by hand there
([hydration.ts](https://raw.githubusercontent.com/solidjs/solid/main/packages/solid/src/render/hydration.ts)).

Meanwhile `getNextChildId` / `peekNextChildId` (`signals.ts:1806`, `:1813`) are **dead code**: the
only non-test callers are `ownerId`'s own recursion at `signals.ts:1799` and the re-exports at
`index.ts:52`/`:56`. `formatChildId` (`signals.ts:1789`) is a near-exact re-implementation of
Solid's `getContextId` — same variable-length-prefix trick, differing only in base-36 vs decimal —
so it was obviously written *for* this consumer.

Wire it. Note that this is an **owner-tree** id, not a DOM-position id: it is the right key for
seeded data and the wrong key for claiming nodes, so it does not reduce M10's scope.

---

## M8a — Diagnostic engine, and the two rules that survive scrutiny

### What changed after research

Four things, and the first is the one that matters.

**1. Delivery is not solved.** The previous version treated it as done because
`TransformResult.warnings` reaches Vite's `this.warn()`. Traced through the repo, the chain is:
`Diag { level, span, message }` (`src/ir/symbols.rs:230`) → `Diagnostic { severity, message,
filename, line, column }` (`src/compile.rs:476`) → `warnings: Vec<String>` (`src/lib.rs:37`, and
`index.d.ts` declares `Array<string>`) — **the span is flattened into prose at the napi boundary** —
→ `this.warn(warning)` at `packages/compiler/src/vite.ts:169` **with no `position` argument**.
Rollup only produces `pos`/`loc`/`frame` when given a position
([plugin-development](https://rollupjs.org/plugin-development/)), so there is no code frame anywhere
today. Measured against Vite 6.4.1: the build-mode line has no frame even when `position` *is*
passed, and scrolls above the size summary; the dev-mode block does render a caret'd frame, but
**fires exactly once per transform** — three successive page loads produce one occurrence, and only
an edit re-fires it — and `logLevel: 'error'` silences plugin warnings entirely in both modes.
Vite's own overlay is fatal-only and single-severity: `ErrorOverlay` takes `ErrorPayload['err']` and
has one red border, with no warning payload type
([overlay.ts](https://raw.githubusercontent.com/vitejs/vite/main/packages/vite/src/client/overlay.ts)).

**2. Severity does not exist.** `src/compile.rs:488` sets `severity: Severity::Warning` for **both**
`DiagLevel::Note` and `DiagLevel::Warning`; the level survives only as a `"note: "` prefix inside
the message string. The previous version's own escape hatch — "a rule that cannot be made precise
should ship as a note, not a warning" — is therefore not currently expressible. Building it is a
prerequisite, not a nicety.

**3. D1's headline example is already TypeScript's job.** Run against barq's actual `Signal<T>`
(`signals.ts:1136`, a callable interface `(): T; set(); update(); peek()`) with the repo's own tsc
under `--strict`:

| already caught by tsc | code |
|---|---|
| `count * 2` | TS2362 |
| `count > 1` | TS2365 |
| `count === 5`, `count == 5` | TS2367 |
| `count ? a : b` | TS2774 — *"Did you mean to call it instead?"* |
| `count.toFixed(2)` | TS2339 |

| invisible to tsc (verified zero errors) |
|---|
| `` `${count}` `` · `count + ""` · `"x" + count` · `-count` · `+count` · `!count` · `String(count)` · `JSON.stringify({count})` |

So `count * 2` — the previous version's headline case and stated "whole reason for M8" — is one
TypeScript already flags with a decent message. D1 survives, but its real target is
**string-coercion and unary positions, plus all of the above for JS users**. `` `${count}` ``
renders the accessor's source text into the DOM and `-count` yields `NaN`; nothing catches those.
(Angular needed NG8109 because Angular templates are not typechecked by `tsc` by default — hence
`strictTemplates` is a hard prerequisite for it,
[extended-diagnostics](https://angular.dev/extended-diagnostics). barq's JSX *is* typechecked.)

**4. Three of the six rules move or disappear.** D2 and D5 move to the runtime (M8b); D6 is already
shipped in the runtime; D4 stays the note it already is. Reasons in the rule table below.

### Prior art

| choice | source |
|---|---|
| Analysis in the compiler, delivery through the editor's channel, linter does not require the compiler | React Compiler's validation passes are "primarily surfaced through `eslint-plugin-react-hooks`", and "the linter does not require the compiler to be installed" — [react.dev/blog/2025/10/07/react-compiler-1](https://react.dev/blog/2025/10/07/react-compiler-1) |
| One code per message, not one name per rule family | [eslint-plugin-solid#180](https://github.com/solidjs-community/eslint-plugin-solid/issues/180) — `solid/reactivity` bundles eight `messageId`s under one disable name, so you cannot run the confident checks in CI while ignoring the speculative ones. React's compiler-powered lints ship one rule name per diagnostic class |
| Never fail the build by default | [react.dev/reference/eslint-plugin-react-hooks](https://react.dev/reference/eslint-plugin-react-hooks) — the compiler "safely skips optimization rather than risk changing your app's behavior"; Angular's extended diagnostics are warnings by default |
| Per-code severity map + `defaultCategory` | [angular.dev/extended-diagnostics](https://angular.dev/extended-diagnostics) — `extendedDiagnostics: { checks: { … : "suppress" }, defaultCategory: "error" }`, three levels `warning | error | suppress` |
| Per-line suppression carrying the code, with a reason | [Svelte compiler warnings](https://svelte.dev/docs/svelte/compiler-warnings) — `<!-- svelte-ignore a11y_autofocus (form requires auto-focus) -->`, comma-separated codes, optional parenthetical; [typescript-eslint ban-ts-comment](https://typescript-eslint.io/rules/ban-ts-comment/) — `descriptionFormat` / `minimumDescriptionLength` (10 in strict), because it "forces developers to articulate why" |
| Suppression scoped to code **and span**, not line | [microsoft/TypeScript#47551](https://github.com/microsoft/TypeScript/issues/47551), labelled **"Design Limitation"** — a `@ts-expect-error` on one property swallows an unrelated error about a missing property, unfixable without architectural change |
| Mandatory code in the directive | [microsoft/TypeScript#38288](https://github.com/microsoft/TypeScript/issues/38288), open since May 2020 — the codeless form is a mistake you cannot undo |
| Unused suppression is a **warning**, never an error | [microsoft/TypeScript#62579](https://github.com/microsoft/TypeScript/issues/62579) — `@ts-expect-error` "halts the entire build/CI pipeline when the suppression becomes unused", which pushes teams to the unsafe `@ts-ignore` that then silently swallows *new* errors |
| Never rename a code | [sveltejs/svelte#11414](https://github.com/sveltejs/svelte/issues/11414) — Svelte 5 renamed every code from dashes to underscores and silently invalidated every `svelte-ignore` comment in every codebase, breaking CI and blocking upgrades. Ignore comments in user code are a public API |
| Second, persistent, non-modal delivery channel | [vite-plugin-checker](https://vite-plugin-checker.netlify.app/configuration/config.html) — `terminal` + its own `overlay` with `initialIsOpen: true \| 'error' \| false`, deliberately *not* reusing Vite's fatal-only overlay |
| Build on `OxcDiagnostic`, not a hand-rolled type | [oxc diagnostics](https://docs.rs/oxc/latest/oxc/diagnostics/index.html) — codes, labelled spans, severity and a miette `GraphicalReportHandler` for free; already in the dependency tree at oxc 0.143 |
| LSP over `tower-lsp-server` with LSP 3.17 **pull** diagnostics | [oxc.rs linter editors](https://oxc.rs/docs/guide/usage/linter/editors) — `oxlint --lsp` is exactly this shape, one binary and thin clients; pull avoids re-running analysis per keystroke |
| **Not** a TypeScript language service plugin | it requires every user to switch VS Code to the workspace TypeScript version, and "only affects errors displayed in code editors and does not affect the diagnostics returned from compilation" — two sources of truth ([writeup](https://dev.to/ngnijland/how-to-write-a-diagnostics-typescript-language-service-plugin-ggm)) |
| No autofix, ever | [react#18051](https://github.com/react/react/issues/18051) — `exhaustive-deps` ships an autofix that **removes** a dependency to satisfy the analyser, changing runtime behaviour and able to introduce the bug it warns about. barq's codegen only splices at recorded `Site`s so it cannot autofix anyway; print the rewrite as message text and record that as a deliberate choice |
| Never emit for generated or `node_modules` code | [sveltejs/svelte#17289](https://github.com/sveltejs/svelte/issues/17289) — a warning broadened in patch 5.45.3 started firing inside SvelteKit's own generated `root.svelte`; volume alone, independent of correctness, blocked the upgrade |
| A `barq-ignore` must never affect codegen | [react#34261](https://github.com/react/react/issues/34261) — React Compiler treated the *presence* of an `eslint-disable` comment as grounds to bail out of optimising the whole component, deoptimising perfectly memoizable code |

### Deliverables

**1. The engine.** On `OxcDiagnostic`. Stable `BARQ001`-style codes, one per message, never renamed,
one docs page per code. Real `Note` / `Warning` / `Error` severities carried end to end — spans must
survive the napi boundary as structured data, not prose. Suppression:
`// barq-ignore-next-line BARQ001, BARQ004 (reason text)` — code mandatory, multiple codes allowed,
reason required with a minimum length, scoped to the code *and the span*. Unused suppressions
reported at warning level. A project-level severity map (`checks: { BARQ001: "suppress" | "warning"
| "error" }` plus `defaultCategory`) with **one** severity resolution shared by the compiler, the
Vite plugin and any CLI — Svelte's split between `onwarn` and `svelte-check` means a code silenced in
one channel stays loud in the other, and people file issues about it
([language-tools#650](https://github.com/sveltejs/language-tools/issues/650)).

Semver rule, from Angular's own caveat: adding a code in a minor must be a warning-only event, or
`defaultCategory: "error"` turns a minor upgrade into a build break.

**2. Delivery, two channels.** `this.warn` **with `position`** for build and CI — that one argument
is what produces `pos`/`loc`/`frame`. Plus a persistent, non-modal, per-severity in-page panel fed
over a custom HMR event (`server.hot.send({ type: 'custom', event: 'barq:diagnostics', … })` +
`import.meta.hot.on` in a dev-only client shim), because the terminal warning fires once per
transform and is gone after a reload. Whether to write this or to depend on vite-plugin-checker's
custom-checker hook is worth one afternoon of source reading before M8a starts.

**3. The rules.** Two, plus labels.

| code | rule | shape | source |
|---|---|---|---|
| **D1** | signal-typed binding read without being called, in a **position allowlist** | "no correct program could put a signal here" | Vue's `no-ref-as-operand` |
| **D3** | props destructured in the **parameter list only** | purely syntactic | `solid/no-destructure` |
| — | dev-mode component/source labels from `Skeleton::origin` | — | unchanged from the previous plan |

**D1's position allowlist**, taken from
[`vue/no-ref-as-operand`](https://eslint.vuejs.org/rules/no-ref-as-operand.html) and its
[implementation](https://raw.githubusercontent.com/vuejs/eslint-plugin-vue/master/lib/rules/no-ref-as-operand.ts),
which has a handful of known issues where `solid/reactivity` has ~25 — and the reason is that it
reports only where no correct program could put a ref: `IfStatement`, `SwitchStatement`,
`UnaryExpression`, `UpdateExpression`, `BinaryExpression`, `AssignmentExpression` (skipping the RHS
of a plain `=`), `LogicalExpression` **left operand only and only when the declaration is `const`**,
`ConditionalExpression` **test position only**, `TemplateLiteral` **excluding tagged templates**,
`MemberExpression` in object position **excluding computed access**. Every narrowing is a refusal to
guess: `other || refValue` is a normal way to pass a ref along, and a `let` may have been reassigned
to a plain value. barq's `SymbolId` resolution is strictly stronger than Vue's `defineChain` origin
tracking, so the entire precision budget goes on the position list rather than on origin discovery.

**D1 must not include a JSX arm.** eslint-plugin-solid's `badSignal` fires on
`JSXExpressionContainer` in children position and on lowercase-element attributes. barq's runtime
treats a function value as reactive in **both**: `dom.ts:954` `insert()` does
`if (typeof value === "function") { renderEffect(…) }`, and the attribute path does the same. So
`<div>{count}</div>` and `<div id={count}>` are correct barq code and the fine-grained path. Porting
Solid's JSX arm makes D1 fire on the framework's own idiom in the first fixture anyone writes.

**Known false negative, accepted deliberately:** cross-module signals are invisible, because P0 Bind
is module-scoped — the same limitation as
[eslint-plugin-solid#127](https://github.com/solidjs-community/eslint-plugin-solid/issues/127).
Record it; do **not** reach for a name heuristic to cover it. Reaching for the heuristic is what
produced eslint-plugin-solid's `/[pP]rops/` regex and `/^(?:use|create)[A-Z]/` callee test, and
those are the proximate cause of its
[#184](https://github.com/solidjs-community/eslint-plugin-solid/issues/184),
[#190](https://github.com/solidjs-community/eslint-plugin-solid/issues/190) and
[#199](https://github.com/solidjs-community/eslint-plugin-solid/issues/199).

**D3's message must not imply the pattern is wrong.** Vue and Svelte both moved props destructuring
*into* the compiler and made it work — Vue's Reactive Props Destructure compiles `const { count } =
defineProps()` to `__props.count`, justified as "Props is a component-only concept… the boundary
here is very clear. The magic never leaks into normal JS/TS code"
([RFC discussion #502](https://github.com/vuejs/rfcs/discussions/502)). Only Solid lints it. barq
cannot follow Vue and Svelte because `lower::lower` takes no `Program` and codegen only splices at
recorded `Site`s. So D3 should say "barq cannot make this reactive", print the `mergeProps` /
`splitProps` rewrite as text, and stop. Scope it to the parameter list exactly as
[`solid/no-destructure`](https://raw.githubusercontent.com/solidjs-community/eslint-plugin-solid/main/packages/eslint-plugin-solid/docs/no-destructure.md)
does — that rule has **zero** false-positive issues in its tracker, and its own docs say why:
"catching it in the params covers the most common cases with good DX."

### The risk that sinks this

**False positives — and the mitigation is rule *shape*, not test count.** The previous version named
the risk correctly and prescribed the wrong fix ("a negative fixture plus an adversarial pass").
What actually separates precise rules from noisy ones, across every system surveyed, is which of two
forms the rule takes:

- *"this reactive value is in a syntactic slot where no correct program could put it"* — Vue's
  `no-ref-as-operand`, `solid/no-destructure`. A handful of issues, or none.
- *"this reactive value is in a place that can never re-run"* — `solid/reactivity`. ~25 open
  false-positive reports, including the plugin's **own documented pattern**
  ([#74](https://github.com/solidjs-community/eslint-plugin-solid/issues/74), closed as not-planned
  and relabelled "question") and `<MyContext.Provider value={props.value}>` reported as "should be
  used within JSX" while visibly in JSX
  ([#209](https://github.com/solidjs-community/eslint-plugin-solid/issues/209)). The maintainers'
  answer is a conceded v2 rewrite
  ([#87](https://github.com/solidjs-community/eslint-plugin-solid/issues/87)) because the current
  design cannot reach the needed precision.

D1 and D3 are both the first form. That is why they are the two that ship.

**Ship D1 alone before D3 if there is any doubt.** Angular's NG8109 is D1 verbatim, shipped, and
still needed a correctness fix in 17.0.9, a dedicated **performance** fix in 18.2.0-rc.0, and still
has a live false positive — `[innerHTML]="alerttext()"`, correctly invoked, still warns
([angular#56135](https://github.com/angular/angular/issues/56135), closed as not planned, with no
inline suppression available). Angular has *types*; barq has binding analysis. Angular's
false-positive rate is a floor, not a ceiling. One false positive in a multi-rule launch discredits
every rule in it.

### Cost constraint

Rides P0 Bind's and P2 Classify's existing traversals. **No new pass.** Both D1 and D3 are position
tests over data those passes already compute, so the constraint holds for this rule set — it would
*not* have held for D2, which needs flow sensitivity neither pass has, and that is a second
independent reason D2 moved to the runtime.

M7 is recovering a measured **+5.7%/file** throughput regression from exactly this kind of accretion
(`MILESTONES.md` §4: M1–M4 binary 0.0318 ms → M6 binary 0.0336 ms on a typical component file).
Budget is 1 ms/file; the compiler is currently at ~3.4% of it. Measure before and after and report
both — Angular's NG8109 needed a dedicated performance release, so a signal-in-position check is
not free.

The engine itself has a second cost the rules do not: carrying spans and severities through the napi
boundary changes `TransformResult`, and the in-page diagnostic panel is dev-only JS that must not
ship to production.

### Acceptance

Per rule: a positive fixture that fires, a negative fixture that must not, and a suppression test.
Specifically, `` `${count}` `` and `-count` must produce a diagnostic naming the symbol and printing
the fix — those are the cases nothing else catches. `<div>{count}</div>` and `<div id={count}>` must
produce **nothing**. A stale-suppression fixture must warn and not error. A `logLevel: 'error'`
run must still surface diagnostics through the in-page channel. Compile throughput unchanged within
noise against the 1 ms budget.

---

## M8b — the rules that belong in the runtime

### What changed after research

This milestone did not exist in the previous version. Three of its six compile-time rules belong
here instead, and the channel they belong in **already exists and was never mentioned**:
`packages/core/src/signals.ts:105–175` ships `DEV.diagnostics.subscribe` / `.capture`, a
`diagnosticsOn` single-load hot-path guard (`signals.ts:120`), a structured
`DiagnosticEvent { sequence, code, severity, message, nodeName, data }`, and five live codes —
`REACTIVE_WRITE_IN_OWNED_SCOPE`, `ASYNC_OUTSIDE_LOADING_BOUNDARY`, `RUN_WITH_DISPOSED_OWNER`,
`NO_OWNER_CLEANUP`, `INFINITE_LOOP`.

### Prior art

Svelte independently arrived at compiler warnings **and** runtime dev warnings for the same bug
class, because they are complementary rather than redundant: `await_reactivity_loss`,
`state_proxy_equality_mismatch`, `derived_inert` and `hydration_mismatch` catch exactly what a static
pass cannot — whether a read actually happened, whether an identity comparison actually failed
([runtime-warnings](https://svelte.dev/docs/svelte/runtime-warnings)).

The decisive citation is MobX, which is the only production implementation of two of these rules:

- **D2** ≡ `observableRequiresReaction`. Runtime, opt-in, **off by default**, and the docs state
  why: it "can't be true by default, because actions are optional by default and working with
  observable models outside of reactive context is completely valid"
  ([configuration](https://mobx.js.org/configuration.html)). Even with perfect runtime information
  it misfires — [mobx#2195](https://github.com/mobxjs/mobx/issues/2195) in the `POSSIBLY_STALE`
  state, and mobx-react#806 firing inside an `observer`.
- **D5** ≡ `reactionRequiresObservable`. Runtime, opt-in, off by default. Angular has an **open
  feature request** for the static version ([angular#55647](https://github.com/angular/angular/issues/55647))
  and has not shipped it; the requester's own example is
  `effect(() => { this.calendarRef?.setInput('selected', this.range()) })`, where optional chaining
  decides *at runtime* whether the signal is read, and the requester concedes the static version
  would be "harder."

**D6 is already shipped.** `signals.ts:1201` emits `REACTIVE_WRITE_IN_OWNED_SCOPE` on a write inside
a derived computation, suppressible per-signal via `signal(v, { ownedWrite: true })`
(`SignalOptions.ownedWrite`, `signals.ts:98`), with a passing suppression test in
`diagnostics.test.ts`. If a static D6 is ever still wanted, React's `set-state-in-render` fires only
on **unconditional** setState — conditional setState-during-render is officially documented as valid
(`if (items !== prevItems) { setPrevItems(items); setSelection(null); }`,
[set-state-in-render](https://react.dev/reference/eslint-plugin-react-hooks/lints/set-state-in-render)) —
so a D6 that fires on any setter reachable from render fires on correct code. React needed five
separate correctness PRs on the sibling `set-state-in-effect` rule in the 7.1.0 cycle alone.

### Deliverables

1. `READ_OUTSIDE_TRACKED_SCOPE` (D2) — new code in `DEV.diagnostics`, **default off**.
2. `EFFECT_TRACKS_NOTHING` (D5) — new code, default off or note-level.
3. D6: struck as already done. Document `REACTIVE_WRITE_IN_OWNED_SCOPE` as its implementation.
4. D4 (store proxy reaching `<For each>`) stays the compile-time **note** it already is
   (`passes/shape.rs:280`, O3). See the risk below.

### The risk that sinks this

**A runtime warning with no suppression path.** [sveltejs/svelte#14295](https://github.com/sveltejs/svelte/issues/14295)
is a `$state` object whose class comes from a third-party package, producing an unsuppressable
`binding_property_non_reactive` warning on working code — closed as not planned. barq already has the
right shape here (`ownedWrite` is a per-signal opt-out); every new code needs an equivalent before it
ships, not after.

**Separately, on D4:** promoting it from note to warning is the highest-variance item left. No
equivalent rule exists in any of the six systems surveyed. The nearest analogues in
`solid/reactivity`'s store handling produced [#99](https://github.com/solidjs-community/eslint-plugin-solid/issues/99)
(direct mutation of `createMutable` state) and #184 (store destructured in a class constructor).
Leave it a note.

### Cost constraint

Zero compiler cost — nothing here touches `compiler-rs`. The runtime cost is bounded by the existing
`diagnosticsOn` guard (`signals.ts:139`, `if (!diagnosticsOn) return;`), which is already a
single-load fast path on the hot path. New codes must sit behind it and must not add a branch outside
it. Both new codes default off, so the shipped-app cost is one boolean test.

### Acceptance

Each code: a fixture that fires it, a fixture that must not, and a per-site opt-out that silences it.
Benchmark the reactive hot path with diagnostics off and assert no regression against the current
figures — the whole point of the `diagnosticsOn` guard is that the off path is free.

---

## M9 — Framework-aware HMR

### What changed after research

**The premise was wrong, the scope was wrong, and the payoff was understated.**

**1. "Patch instead of re-evaluating the module" is not expressible under Vite.** A hot update is a
re-`import()` of the module URL with `?t=<timestamp>`; the module body **always** re-evaluates. There
is no patch channel. `acceptExports` (partial accept) is gated behind
`experimental.hmrPartialAccept`, default `false`
([api-hmr](https://vite.dev/guide/api-hmr), [config.ts](https://github.com/vitejs/vite/blob/main/packages/vite/src/node/config.ts)),
so a design that needs it needs a config flag from every user.

**2. Module re-eval is not the bottleneck either.** Evan You's benchmark — 1000 components, a Node
watcher stamping the HMR start and the updated component rendering `Date.now()` — measures leaf
component **141.8 ms** (Vite) vs **84.4 ms** (Turbopack), and root component with 1000 children
**338.2** vs **334.6** ([vite-vs-next-turbo-hmr](https://github.com/yyx990803/vite-vs-next-turbo-hmr)).
Bundler work is worth ~57 ms on a trivial leaf and ~0 once the framework has real work. The dominant
term is how much of the reactive tree gets torn down and rebuilt — a **state-preservation** problem,
not a patch-transmission problem.

**3. Nobody does binding-level patching, and the closest prior art designed exactly M9's plan and
abandoned it.** Vue's unit is one whole render function per component
([hmr.ts](https://github.com/vuejs/core/blob/main/packages/runtime-core/src/hmr.ts)). Vue **Vapor** —
a compiled fine-grained runtime with per-binding update functions and no VDOM, i.e. barq's exact
architectural position — does `hmrRerender`: stop every render effect, remove the **entire block**,
re-run the whole render against the same `setupState`, reinsert at the anchor. Its source carries the
retreat as a comment:

> *"Align child reloads with VDOM HMR: rerender the parent instead of surgically swapping the child
> instance. A local swap can leave parent block ownership, component refs, or exposed instances
> pointing at the old instance."*
> — [runtime-vapor/src/hmr.ts](https://github.com/vuejs/core/blob/minor/packages/runtime-vapor/src/hmr.ts)

And solid-refresh issue #35, "Idea: Full Granular Mode", is M9's proposal almost verbatim — split
each component into `$$setup(...)` and `$$template(...)`, hash each separately, communicate through
"a reactive proxy lexical scope." Its author listed the blockers himself ("How to work through
static branched code", "How to manage event listeners for elements since those are only registered
once") and closed it: *"the theoretical API isn't going to be leading this."*
([#35](https://github.com/solidjs/solid-refresh/issues/35)). Ryan Carniato on
[solid#2419](https://github.com/solidjs/solid/issues/2419): *"it could be doable but we'd need to
create a whole thing to do it… even then you still lose the state below that point."*

**4. "Both build on P7's content hashing" is wrong twice.** (a) Wrong key: P7's hash answers "is this
markup identical?" The HMR decision needs "did the state-creating code change" **and** "did any free
variable the component closes over change *value*." solid-refresh needs both a `signature` (source
hash) and a `dependencies: () => ({ … })` **thunk returning runtime values** — the second is
something no compile-time content hash can see. Vue compares whole script ASTs with
`loc`/`range`/comments stripped (`isEqualAst`,
[handleHotUpdate.ts](https://raw.githubusercontent.com/vitejs/vite-plugin-vue/main/packages/plugin-vue/src/handleHotUpdate.ts));
barq's per-`Unit` spans mean a naive hash churns on whitespace and produces spurious remounts.
(b) **There is no notion of a component anywhere in the pipeline.** `src/harvest.rs` visits
`ReturnStatement` / `VariableDeclarator` / `ArrowFunctionExpression` / `Expression`, takes the
outermost JSX, and never looks at the enclosing function. `Site` (`src/ir/module.rs:56`) is
`Return | Init | ArrowBody | Nested` — a **splice location**, not a component identity. The entire
refresh family is built on identifying component declarations and registering them by id; barq
cannot currently name one. That is new analysis, not existing infrastructure.

**5. The payoff is much larger than claimed.** `packages/compiler/src/vite.ts` is 182 lines with zero
`import.meta.hot`, and `packages/core` has no HMR surface. Under Vite's `propagateUpdate`, a module
with no self-accepting boundary anywhere up the importer chain is a dead end → `full-reload`
([hmr.ts](https://github.com/vitejs/vite/blob/main/packages/vite/src/node/server/hmr.ts)). **Today
every barq edit is a full page reload with total state loss.** So the win is not 140 ms → 85 ms; it
is *full page reload → ~100 ms with the parent tree intact*, and it comes entirely from the boring
design, not from surgical patching.

**6. Cross-module template dedup is deleted.** See *Considered and rejected*.

### Prior art

The three-layer split is stated most clearly by react-refresh and followed by solid-refresh, prefresh
and Angular: the **compiler** emits identity + a change signature and nothing else; the **runtime**
owns the registry and the preserve-vs-remount decision; the **bundler plugin** owns the Vite protocol
and the bail-out policy
([ReactFreshBabelPlugin.js](https://raw.githubusercontent.com/facebook/react/main/packages/react-refresh/src/ReactFreshBabelPlugin.js),
[ReactFreshRuntime.js](https://raw.githubusercontent.com/facebook/react/main/packages/react-refresh/src/ReactFreshRuntime.js),
[refresh-utils.ts](https://github.com/vitejs/vite-plugin-react/blob/main/packages/common/refresh-utils.ts)).
The two systems that put HMR *entirely* in the compiler ended up with **less** capability, not more:
Svelte 5's `hmr: true` preserves no state at all
([svelte#14434](https://github.com/sveltejs/svelte/issues/14434)) and Angular's emitted patch callback
throws on a two-way binding ([angular#58915](https://github.com/angular/angular/issues/58915)).

| choice | source |
|---|---|
| Per-module registry + proxy-over-signal swap | [solid-refresh runtime](https://github.com/solidjs/solid-refresh/blob/main/src/runtime/index.ts) — `createSignal(component)` + memo + `Proxy`; every importer holds the proxy, so writing the signal swaps the implementation in place |
| "First version owns the block effect, incoming points at it" | both [solid-refresh](https://github.com/solidjs/solid-refresh/blob/main/src/runtime/index.ts) (`newData.update(() => oldData.proxy)`) and [Svelte 5](https://github.com/sveltejs/svelte/blob/main/packages/svelte/src/internal/client/dev/hmr.js) — without it you accumulate a wrapper per edit |
| Source hash **plus** a free-variable value thunk | solid-refresh's `signature` + `dependencies`, compared by `isListUpdated` (unordered key/value `!==` with an explicit NaN case) |
| Four bail-out rules | react-refresh's `validateRefreshBoundaryAndEnqueueUpdate`: export removed → invalidate; new export → invalidate; non-component export whose **value** changed → invalidate; zero exports → do nothing. ~40 lines, and the difference between HMR working and HMR silently serving stale code |
| Conservative in one direction only | react-refresh and [prefresh](https://github.com/preactjs/prefresh/blob/main/packages/utils/src/index.js) both set `forceReset = true` inside the `catch`. Any failure to compute the signature degrades to remount, never to "assume unchanged" |
| Batch the registry patch | [solid-refresh#80](https://github.com/solidjs/solid-refresh/issues/80) (open) — `App` → `CompA` → `CompB` logs `B A B` after a save because each signal is written un-batched. React debounces at 16 ms for the same reason |
| `hot.prune` handler | [solid-refresh#73](https://github.com/solidjs/solid-refresh/issues/73) (open) — registry entries are never deleted and each holds a signal setter, so nothing in an edited module is GC'd for the session |
| Wrap top-level `render()` in `hot.dispose(cleanup)` | solid-refresh's `fixRender`. Without it the app double-mounts on every edit. Solid's own starter templates ship `/* @refresh reload */` at the top of `src/index.tsx` — i.e. the entry opts out by convention, which is the workaround, not the fix ([#43](https://github.com/solidjs/solid-refresh/issues/43), [#67](https://github.com/solidjs/solid-refresh/issues/67)) |
| Do **not** patch context/provider objects by mutation | four solid-refresh issues ([#15](https://github.com/solidjs/solid-refresh/issues/15), #42, #71, [#85](https://github.com/solidjs/solid-refresh/issues/85)) and a maintainer statement that "2.0 HMR for createContext has been dropped temporarily" |
| Do **not** take React's export-shape boundary rule | it leaks into file layout badly enough that three linters exist solely to police it — `eslint-plugin-react-refresh`, oxlint `react/only-export-components`, biome `use-component-export-only-modules`; [vite-plugin-react#411](https://github.com/vitejs/vite-plugin-react/issues/411) and [#243](https://github.com/vitejs/vite-plugin-react/issues/243) are the recurring user pain |
| Emit the literal bytes `import.meta.hot.accept(` | Vite requires it whitespace-sensitively for static analysis ([api-hmr](https://vite.dev/guide/api-hmr)) |
| Registry lives in `hot.data` | it is the only thing persisted across module instances; solid-refresh keys it `'solid-refresh'` / `'solid-refresh-prev'` |
| Call `hot.invalidate(msg)` **inside** the accept callback | the docs are explicit: "you should always call `import.meta.hot.accept` even if you plan to call `invalidate` immediately afterwards, or else the HMR client won't listen for future changes" |

### Deliverables

1. **Component identification** — new analysis in `compiler-rs`. This is the part the previous
   version assumed existed. Key by **`(file, SymbolId)`**, not by a name string: that deletes
   solid-refresh [#76](https://github.com/solidjs/solid-refresh/issues/76) (a type and a component
   sharing a name collide in the registry) and #43/#67 (anonymous default export gets no identity)
   **by construction**, because a `SymbolId` is unique per declaration site and survives reordering.
   Registration is a write at a location harvest never recorded, so harvest or a sibling pass has to
   start recording it. `src/codegen/install.rs:51` already rebuilds `program.body`, so appending the
   accept footer is reachable today.
2. **Registry + swap in `packages/core`**, dev-only: signal-backed proxy per component, `hot.data`
   storage, `hot.prune` cleanup, one batched flush per update.
3. **Signature + dependency thunk** emitted per component: a source hash computed over the component
   body with spans and comments stripped (Vue's `isEqualAst` discipline), plus
   `() => ({ freeVar1, freeVar2 })` over the free variables — which `analysis::bind` already resolves
   by `SymbolId`, so collecting them is cheap.
4. **Vite plugin wiring** in `packages/compiler/src/vite.ts`: the accept footer, the four bail-out
   rules, `hot.dispose` around top-level `render()`, and `@refresh skip` / `@refresh reload`
   pragmas riding M8a's comment reader.
5. **Clear hydration claim state on update.** [solid#2919](https://github.com/solidjs/solid/issues/2919)
   and #2920 record HMR duplicating streamed boundary content and lazy-component hydration crashing
   during refresh registration. Neither milestone mentioned the other; this is the seam.

### The risk that sinks this

**Codegen divergence, not state correctness.** The previous version named stale reactive state, which
is real but is handled by "conservative in one direction only" plus the bail-out rules. The risk
nothing anticipated is that **the optimisation that made barq fast removes the anchors HMR needs**.
Svelte disables its `is_standalone` anchor optimisation when `hmr: true` — "in a case like
`{#if x}<Foo />{/if}`, we don't need to wrap the child in comments" is explicitly turned off
([phases/3-transform/utils.js](https://github.com/sveltejs/svelte/blob/main/packages/svelte/src/compiler/phases/3-transform/utils.js)) —
and Vue Vapor's `findBlockBoundary` needs a real anchor to reinsert at. Commit `1f8c895` ("drop the
marker pair around every dynamic hole") is barq's exact analogue. Plan for `dev+hmr` codegen to
differ from prod codegen, and budget an HMR-on variant of the 106 fixtures and the real-Chrome
differential.

### Cost constraint

Component identification is a **new traversal or a new hook into an existing one**, which is exactly
the accretion M7 is recovering from (+5.7%/file). Two mitigations: gate the whole thing on
`options.dev && options.hmr` so production compiles pay nothing, and fold the free-variable
collection into `analysis::bind`, which already walks every reference by `SymbolId`. Measure the dev
path and the prod path separately and report both against the 1 ms budget; a prod-path regression is
not acceptable at any size, and a dev-path regression is acceptable only if it stays inside the
budget.

### Acceptance

The previous version's criterion — "DOM and reactive state after N surgical updates equal a cold
render of the final source" — is right and insufficient. The scripted edit sequence must include:

- a **branch flip that changes which signals are created** (solid-better-refresh's worst documented
  failure);
- a **keyed-list reorder** (its second-worst);
- an element carrying a **`ref` and a delegated event handler** — the case that breaks Angular's
  emitted patch callback ([#58915](https://github.com/angular/angular/issues/58915)) and the case
  solid-refresh's own author named as a blocker ("event listeners… are only registered once");
- a **component rename and a component delete**, to assert the invalidate path actually fires;
- a save with **no change at all**, which must produce no remount — solid-refresh#35's own stated
  failure mode is "HMR can happen even if the file is unchanged… components in the file would just
  remount."

And it must assert **no throw at apply time**, not only final-state equality. Plus a nested
parent→child fixture asserting exactly one construction per component per update (solid-refresh#80),
and a repeated-edit fixture asserting the registry does not grow without bound (#73).

Accept explicitly, in the docs: there will be a list of edits barq's HMR silently does not apply, and
the mitigation is a clear message plus a one-click full reload. That is what Flutter
([hot-reload](https://docs.flutter.dev/tools/hot-reload) — static initialisers, `main()`,
`initState()`, enum↔class changes, generic arity changes, all silently not applied), Vue (`tryWrap`'s
"[HMR] Something went wrong during Vue component hot-reload. Full reload required.") and Prefresh
(`window.location.reload()`) all settled on. Nobody promises otherwise.

---

## M10 — Hydration

### What changed after research

**All three framing claims in the previous version were wrong, and the strongest justification was
missing.**

**1. Do not reverse `DESIGN.md` §5 — add a flag beside it.** Nobody pays markers unconditionally.
`babel-plugin-jsx-dom-expressions` ships a `hydratable` option that **defaults to false**
([README](https://raw.githubusercontent.com/ryansolid/dom-expressions/main/packages/babel-plugin-jsx-dom-expressions/README.md));
Solid gates again at runtime, with `ssrHydrationKey()` returning `''` whenever
`sharedConfig.context` is unset ([server.js](https://raw.githubusercontent.com/ryansolid/dom-expressions/main/packages/dom-expressions/src/server.js));
Svelte 4 had `hydratable: true`. So §5 stays the **default** and gains a `hydratable` sibling — a
boolean threaded through the SSR context, not "a third serialisation mode."

**2. Do not emit a hydration key per unit.** Solid's per-template-root key is simultaneously the
expensive option and the fragile one. Measured (own experiment: same component tree compiled twice
with solid-js 1.9.10 / babel-preset-solid 1.9.12, `generate:'ssr'`, `hydratable` true vs false):

| rows | nodes | raw | gzip | brotli |
|---|---|---|---|---|
| 10 | 114 | +8.1% | +13.2% | +14.0% |
| 100 | 744 | +7.4% | +20.0% | +15.7% |
| 500 | 3544 | +7.6% | +23.9% | +21.2% |
| 2000 | 14044 | +7.8% | +24.5% | +32.0% |

The compressed column inverts the usual intuition and grows with page size: static markup compresses
~40:1 while unique monotonic keys barely compress at all. Anyone budgeting markers at "7% raw"
understates the wire cost by 3x. Solid 2.0 conceded this by **breaking a public attribute name** —
` data-hk="K"` → ` _hk=K`, measured −36% marker cost — which is not something a framework does for a
rounding error.

And the keys are fragile because allocation is a **side effect of evaluation order**: reading
`props.children` twice ([solid-start#1993](https://github.com/solidjs/solid-start/issues/1993)), a
ternary taking a different branch ([solid#2976](https://github.com/solidjs/solid/issues/2976)), a
spread plus a conditional attribute beside a `For` ([solid#2959](https://github.com/solidjs/solid/issues/2959)),
or merely nesting a route in a subfolder ([solid-start#1473](https://github.com/solidjs/solid-start/issues/1473),
key `0-0-0-0-0-0-0-0-1-0-0-0-1-0-0-0-0-0-1`) shifts every downstream key and reports it far from the
divergence. **barq structurally does not have this bug class**, because P8b inlines `For`/`Show`/
`Switch` as `.map().join("")` and ternaries — there is no per-component counter to desync. Adopting
Solid's keys would import Solid's single largest bug class for no structural reason.

**3. The right mechanism is positional claiming on the walk barq already emits.** Svelte 5 uses
**zero** per-element ids — only `<!--[-->` / `<!--]-->` (8 bytes each) per *block*, with one
module-level `hydrate_node` cursor advanced by the compiled walk
([hydration.js](https://raw.githubusercontent.com/sveltejs/svelte/main/packages/svelte/src/internal/client/dom/hydration.js),
[constants.js](https://raw.githubusercontent.com/sveltejs/svelte/main/packages/svelte/src/constants.js)).
Marko 6 drives both fresh render and node reuse from one compiler-generated **walk string**, and its
`walker.ts` states the residual case exactly: *"Replace must only be used to insert between two
static text nodes"*
([walker.ts](https://api.github.com/repos/marko-js/marko/contents/packages/runtime-tags/src/dom/walker.ts)).

barq already emits walk instructions (P6 Address), and — the connection reading this repo alone could
not make — **`src/passes/anchor.rs` already computes the exact predicate.** Its
`Prev::{Nothing, Text, Node}` state machine exists to decide whether a hole has an addressable
boundary, with the comment at `anchor.rs:16`: *"the HTML parser fuses two literal text runs into ONE
node, so a hole between them has no addressable boundary to anchor against."* That is Marko's rule,
already implemented, for a different purpose. **The hydration boundary set is a second consumer of an
existing analysis, not a new pass.** Note it is *not* `SkelNode::Marker`: §5 drops Marker because it
is a DOM insert anchor, and the hydration question is ambiguity. The two sets do not coincide.

Applied to a 500-row fixture where every in-row hole is a sole child (`<td>{x}</td>`), the marker set
collapses from ~500 keys (~8.9 KB) to roughly two boundary pairs (~32 bytes).

**4. Scope by subtree, not by page.** Astro's argument — "JavaScript is one of the slowest assets
that you can load per-byte, so every byte counts", and SPAs "lack the native ability to selectively
and strategically hydrate" ([islands](https://docs.astro.build/en/concepts/islands/)) — plus Solid's
`<NoHydration>` / `<Hydration>` pair ([docs](https://docs.solidjs.com/reference/components/no-hydration)),
which is roughly one `noHydrate` flag on the SSR context. That turns the measured overhead into that
fraction of only the interactive part of the page. A prose fixture measured 3 keys and 4 comments
total.

**5. The strongest justification was absent, and it is a correctness bug.** See the risk section.

### Prior art

| choice | source |
|---|---|
| `hydratable` build flag, non-hydratable default | `babel-plugin-jsx-dom-expressions` (defaults false); Svelte 4's `hydratable: true`; vite-plugin-solid selects among `{generate:'ssr',hydratable:true}` / `{generate:'dom',hydratable:true}` / `{generate:'dom',hydratable:false}` |
| Positional cursor, no per-element ids | [Svelte 5 hydration.js](https://raw.githubusercontent.com/sveltejs/svelte/main/packages/svelte/src/internal/client/dom/hydration.js) |
| One compiler-generated walk driving both fresh render and reuse | [Marko 6 walker.ts / resume.ts](https://api.github.com/repos/marko-js/marko/contents/packages/runtime-tags/src/dom/walker.ts) |
| Markers only where the walk is not determinate | Marko's "Laws of the walks string"; barq's own `anchor.rs:16` comment |
| Per-subtree opt-out | Solid's `<NoHydration>` / `<Hydration>`; Astro's `client:*` |
| Catch → fall back to a full client render | [Svelte render.js](https://raw.githubusercontent.com/sveltejs/svelte/main/packages/svelte/src/internal/client/render.js) — on `HYDRATION_ERROR` it logs, `clear_text_content(target)`, `return mount(component, options)`, unless `recover: false` |
| Dev-only unclaimed-node sweep | Solid 2.0's `sharedConfig.verifyHydration()`: *"Hydration completed with N unclaimed server-rendered node(s):"* — added after living with the silent-failure mode |
| Suppress DOM writes while hydrating | Solid's `setProperty` returns the value unwritten when `isHydrating(node)`; `insertExpression` collects rather than inserts |
| Data seeding is a separate channel | Solid's `_$HY.r` / `sharedConfig.load(id)`; barq's equivalent already exists (`getHydrationData`, `getSeed`, `__BARQ_DATA__`) |
| Do **not** copy React's "don't validate, it's too expensive" | that reasoning is priced for a VDOM diff over the whole tree ([hydrateRoot](https://react.dev/reference/react-dom/client/hydrateRoot)); barq's markers are few and positional, so a boundary check is cheap |

### Deliverables

1. **`hydratable` flag** on `TransformOptions`, default false. `DESIGN.md` §5 stays the default path.
2. **Boundary emission** in the SSR backend, driven by a predicate reusing `anchor.rs`'s existing
   `Prev` analysis: emit a boundary only for (a) variable-length regions — `For`/`Index`/`Repeat`/
   `Show`/`Switch`/`Dynamic` and the async flow components — and (b) adjacent-text ambiguity, where
   `a{b}c` serialises to one parsed text node but is three nodes on a client render. A hole that is
   the sole child of an element needs nothing.
3. **Claim cursor + write suppression** in `packages/core`, plus a **hydration-aware `insert()`** —
   see the repo-specific blocker below.
4. **Per-subtree opt-out**: one `noHydrate` flag on the SSR context, nested-context form to re-enable.
5. **Dev-only unclaimed-node sweep** at end of hydration.
6. **Keep replace-based `hydrate()` as the fallback.** `dom.ts:1194` already *is* Svelte's `mount()`
   path — `render()` + `flush()` + `replayCapturedEvents()`.

### The risk that sinks this

**Not mismatch — silent success.** The previous version named mismatch as "the hardest class of bug
in this whole domain", and the recovery story defuses most of it: Svelte wraps the whole pass in
try/catch and falls back to a full client render, and **barq already owns that fallback**. So M10
does not have to be correct to ship; it has to be *detectably incorrect* and degrade to exactly
today's behaviour. Worst case is the status quo.

What genuinely needs guarding is the opposite: hydration that claims the wrong nodes and reports
nothing. [solid-start#1807](https://github.com/solidjs/solid-start/issues/1807) is titled "hydration
fails silently without an error"; Solid's production `getNextElement` throws only under `_DX_DEV_`
and otherwise falls through to `template()`, orphaning the server node beside a duplicate; React
refuses to repair and documents the consequence — *"In the best case, they'll lead to a slowdown; in
the worst case, event handlers can get attached to the wrong elements."* Hence deliverable 5, which
is Solid 2.0's answer, cheap with positional markers.

**And a repo-specific blocker the previous version could not have known.** Commit `1f8c895` ("drop
the marker pair around every dynamic hole") made a hole with no following sibling write straight
through `parent.textContent` — "no node of its own at all" — so `<span>{x}</span>` compiles to
`<span></span>` plus `_$insert(_el$2, x)`. On hydration that write **destroys the server-rendered
text node**. Node reuse for the single-hole case therefore needs either the marker back (payload) or
a hydration-aware `insert()` that adopts existing children (no payload, Svelte's approach). Either
way hydrating codegen or runtime diverges from the benchmarked prod path — barq's exact analogue of
Svelte's `is_standalone` deopt under `hmr` and of Vue Vapor's `findBlockBoundary` needing a real
anchor.

### What actually justifies this milestone

The previous version justified M10 on reuse correctness and payload. The measured result is stronger
and different. Real Chromium, Solid SSR page, `hydrate()` vs `container.textContent=''; render()`
(the latter being barq's current strategy), medians of 4 runs after warmup:

| nodes | claim script | replace script | claim layout | replace layout | claim→paint | replace→paint |
|---|---|---|---|---|---|---|
| 114 | 1.0 | 1.1 | 0 | 0.5 | **1.3** | **1.9** |
| 744 | 1.4 | 1.7 | 0.1 | 2.3 | **1.8** | **4.3** |
| 3544 | 3.2 | 4.0 | 0.1 | 10.1 | **3.8** | **14.8** |
| 14044 | 7.8 | 11.8 | 0.1 | 41.7 | **9.3** | **54.4** |

The script difference is nearly irrelevant (1.2–1.5x). The entire gap is **layout**: replacing the
subtree forces a full-document relayout at ~3 ms per 1000 nodes. Past ~3500 nodes replace blows a
60 Hz frame on a *desktop*; at 14k nodes it is a 54 ms long task, INP/TBT territory before you
multiply by 4–6x for a mid-tier phone.

**But the decisive result is not on that table.** At **every** page size, replace measured
`focusKept: false` and `inputValueKept: ""`, against `true` / `"typed-by-user"` for claim.
**Replace-based hydration destroys focus and discards anything the user typed before the bundle
booted.** The repo already concedes this: `server.ts:158` records that capture is coordinate-based
*"(as coordinates - the nodes get replaced)"* and *"Keyboard/input events can't be"* replayed, which
is why `replayCapturedEvents()` uses `document.elementFromPoint(x, y)` and the captured list is
pointer-only. That is a correctness bug in shipped code, it does not scale down with page size, and
it is independent of every byte count above.

Note also what claim-based hydration *removes*: the coordinate-replay hack exists only because nodes
get replaced. Claiming makes keyboard and input replay possible at all.

### Cost constraint

The boundary predicate is a **second consumer of `anchor.rs`'s existing `Prev` analysis**, so the
compile cost on the non-hydratable path is zero and on the hydratable path is one extra decision per
hole in a pass that already runs. **No new pass**, same as M8a.

The real cost is elsewhere and must be budgeted: a `hydratable` codegen variant means the 106
fixtures and the real-Chrome differential need a second arm, and the hydration-aware `insert()` must
not slow the non-hydrating path — it is on the hot path that the DOM benchmarks measure. Gate it on
a module-level hydrating flag checked once, in the shape of `signals.ts:139`'s `diagnosticsOn` guard.
Report both compile throughput arms against the 1 ms budget and the DOM benchmark unchanged.

### Two M8 rules that become load-bearing here

Neither appeared in the previous rule table, and both are better-founded than D2/D4/D5:

- **SSR-unsafe reads during render** — `Date`, `Math.random`, `window`, `localStorage`.
- **Invalid element nesting** — `<div>` inside `<p>`, `<a>` inside `<a>`.

These are the top *documented* hydration-mismatch causes across React, Next and Solid
([react-hydration-error](https://nextjs.org/docs/messages/react-hydration-error)). Both are
statically visible in P0/P2's existing traversal, and invalid nesting is visible **directly in the
skeleton**. Invalid nesting is the higher-value one: the HTML parser *relocates* the node, so the
server string and the parsed DOM differ before any JS runs, and it corrupts hydration with no
application bug to find. Ship them with M10, not M8a — they are cheap but only matter once claiming
exists.

The rest of that documented list — browser extensions mutating HTML
([react#24430](https://github.com/facebook/react/issues/24430)), CDN/edge minification such as
Cloudflare Auto Minify, iOS auto-linking phone numbers and dates — is not statically detectable and
is precisely what the unclaimed-node sweep is for.

### Acceptance

Every fixture: SSR render → hydrate → DOM identical to a cold client render, with the node-identity
channel from M5 proving reuse rather than replacement, and effect counts proving hydration did not
re-run work the server already did. Plus, new:

- the **unclaimed-node sweep asserts zero** on every fixture;
- **focus preservation** and **input-value preservation** across hydration — the property that
  actually motivates the milestone;
- a deliberate-mismatch fixture asserting the **fallback fires** and produces exactly today's
  behaviour;
- a `hydratable: false` arm asserting byte-identical SSR output to today's, so §5's default path is
  provably untouched;
- a `<NoHydration>` fixture asserting zero markers in the excluded subtree.

---

## Considered and rejected

This section is load-bearing. Both entries were deliverables in the previous version of this file.

### Cross-module template dedup — **rejected on measurement**

Was M9 deliverable 2. The previous version's own *Not planned* section says items belong there "only
once one of them has a benchmark attached." This one now has a benchmark, and the benchmark says no.

**Measured** (two bundle variants built around barq's real 182,276-byte minified kitchen-sink bundle,
templates interleaved, raw / gzip -9 / brotli q11):

| config | raw saved | gzip saved | brotli saved |
|---|---|---|---|
| 5 templates, 20 sites, 15 duplicates | 4,055 B (2.15%) | 336 B (0.63%) | **31 B (0.07%)** |
| 20 templates, 60 sites | 10,780 B (5.39%) | 1,051 B (1.90%) | **166 B (0.35%)** |
| 30 templates, 200 sites, 170 duplicates | 46,730 B (19.30%) | 4,101 B (6.90%) | **709 B (1.45%)** |

The last row is deliberately absurd — 170 of 200 template sites byte-identical is not an app. A second
run with uniform filler produced **negative** gzip and brotli deltas in 4 of 9 configurations:
deduping made the compressed output *larger*. The 5–21% raw figure is the number that makes the
feature look attractive and the number nobody ships.

This is not a novel result. Closure Compiler shipped exactly this transform (`AliasStrings`) and
documents it as a mistake: *"Turning on this pass usually hurts code size after gzip… Aliasing
strings manually almost always makes the compressed code size bigger, because it subverts gzip's own
algorithm for aliasing"*
([AliasStrings.java](https://raw.githubusercontent.com/google/closure-compiler/master/src/com/google/javascript/jscomp/AliasStrings.java),
[FAQ](https://github.com/google/closure-compiler/wiki/FAQ)). It is off by default and the only
exception named is a client that cannot accept gzip. The gzip-32 KB-window counterargument dies
against brotli's 4–16 MB window.

Three costs beyond the bytes:

- **Build-level state does not exist in Vite dev.** Vite transforms modules on demand with no view of
  the graph. StyleX is the only surveyed system doing true cross-module aggregation, and its dev path
  produces `@media var(--xgageza)` and a LightningCSS crash because "the breakpoints module hasn't
  been fully evaluated yet"
  ([writeup](https://dev.to/sal_lancaster/debugging-stylex-vite-the-mystery-of-invalid-empty-selector-158k));
  [stylex#1043](https://github.com/facebook/stylex/discussions/1043) is dev-works/prod-empty. Dev/prod
  divergence is structural, not a bug.
- **It fights M9 directly.** A content-hash-keyed shared artifact that everything imports is exactly
  the structure behind [vanilla-extract#190](https://github.com/vanilla-extract-css/vanilla-extract/issues/190)
  — stable key, changed content, HMR cannot tell them apart — and
  [panda#3110](https://github.com/chakra-ui/panda/discussions/3110)'s double-compile. One-file edit →
  invalidate every importer is the opposite of what M9 is for.
- **Rollup chunking.** Hoisting into a shared module adds an import edge from every consumer, so a
  route either fetches a new common chunk or pulls templates it never renders
  ([rollup#2070](https://github.com/rollup/rollup/issues/2070),
  [granular-chunking](https://web.dev/articles/granular-chunking-nextjs)). Against 31–709 bytes, one
  extra request is a net loss.

**If cross-module sharing is still wanted**, take vanilla-extract's sprinkles pattern
([docs](https://vanilla-extract.style/documentation/packages/sprinkles/)): let users hoist a shared
`template()` into a shared module and import it. Zero compiler work, zero plugin state, no dev/prod
divergence, and the bundler owns the sharing. Note also that this rejection is a rejection of *going
wider*, not of P7 — barq's module-wide content-hash-plus-byte-compare is already strictly stronger
than the reference implementation, which does a linear exact-string scan over Babel scope data
destroyed at Program exit
([template.js](https://raw.githubusercontent.com/ryansolid/dom-expressions/main/packages/babel-plugin-jsx-dom-expressions/src/dom/template.js)).

### Binding-level surgical HMR (`$$setup` / `$$template` split) — **rejected on prior art**

Was M9 deliverable 1, as stated. Rejected for three independent reasons, any one sufficient: Vite has
no patch channel so the module always re-evaluates; module re-eval is not the dominant latency term
anyway; and the design was written down, blockers enumerated, and closed by the author of the closest
prior art ([solid-refresh#35](https://github.com/solidjs/solid-refresh/issues/35)), while the one team
with every structural reason to build it — Vue Vapor, a compiled fine-grained runtime — implemented
whole-block rerender instead and left the retreat as a source comment.

What remains from it is M9 as scoped above, which delivers *full page reload → ~100 ms with the parent
tree intact*. That is most of the available win.

### Solid-style per-unit hydration keys — **rejected on measurement and bug class**

Was implied by M10's "a hydration key per unit". Rejected: 20–25% gzip / up to 32% brotli overhead,
and a bug class (evaluation-order counter desync) that barq structurally does not have because P8b
inlines control flow. Full argument in M10's *What changed after research*.

---

## Optional, separate — M11: HMR state preservation

Only if M9 lands and the demand is still there. This is the thing users actually ask for
([solid#2419](https://github.com/solidjs/solid/issues/2419), whose matrix is react-vite ✅, vue-vite ✅,
solid-vite ❌, svelte-vite ❌, svelte-kit ❌).

**Design**: rewrite reactive-creation sites into keyed `persist(key, factory)` calls into `hot.data`,
invalidated by "the set of reactive `SymbolId`s this component creates." This is
[solid-better-refresh](https://github.com/biowaffeln/solid-better-refresh)'s design with `SymbolId`
resolution replacing its call-order keying. Every limitation in its own
[ARCHITECTURE.md](https://github.com/biowaffeln/solid-better-refresh/blob/main/packages/solid-better-refresh/ARCHITECTURE.md)
traces to one root cause — it keys by call order because from outside the compiler it has no other
stable handle — so `SymbolId` deletes its two worst documented failures (branch-flip swaps,
declaration reordering) **at the source**. `harvest`'s existing per-root `Site` supplies the
call-site identity needed for multi-instance disambiguation, which the outside package has to
synthesize with an injected `__hmrSite` prop.

**Why it is optional, and the warning attached.** svelte-hmr shipped opt-in state preservation, then
turned it off in v0.12, and the README says why: *"this behaviour has been deemed too confusing and
hard to anticipate, so preservation of state is now disabled by default."* Its author concluded the
feature "could probably only be implemented cleanly in the compiler itself"
([svelte-hmr#40](https://github.com/sveltejs/svelte-hmr/issues/40)); Svelte 5 then implemented HMR in
the compiler and shipped **zero** state preservation. Two independent teams, ten years of hindsight,
endpoint "remount, keep it predictable." Do **not** ship per-variable annotations like
`@hmr:keep` — that is precisely the surface that got turned off for being unpredictable.

Two limitations that do not go away and must be designed for: `SymbolId` identifies a *declaration*,
not an *instance* (three `<Counter/>` siblings share one), and state follows position in a reordered
keyed list unless `For`'s key is used as the identity.

Orthogonal to template hashing, which is why it is a separate milestone rather than a stretch goal
inside M9.

---

## Not planned

Compile-time render of fully-static components (SSG), dead-branch elimination for
`<Show when={false}>`, unrolling `<For>` over a literal array, extracting static template text to an
i18n catalogue or atomic CSS, and non-DOM backends. All plausible from the IR; none scoped, none
measured, none justified by a number yet. They belong here only once one of them has a benchmark
attached — the standard cross-module dedup just failed.

---

## One documentation fix, outside all milestones

`MILESTONES.md` §5.2 currently reads as a capability regretted: the deleted Babel plugin's implicit
accessor rewrite is described as something this pipeline structurally cannot do. Vue shipped exactly
that feature — Reactivity Transform, `let count = $ref(0); count++` — deprecated it in 3.3 and
**removed it in 3.4** and in `@vitejs/plugin-vue` 5.0. The stated reason was legibility, not
implementability: *"Losing .value makes it harder to tell what is being tracked and which line is
triggering a reactive effect… the mental overhead becomes much more noticeable in large codebases,
especially if the syntax is also used outside of SFCs"*
([reactivity-transform](https://vuejs.org/guide/extras/reactivity-transform),
[RFC discussion #369](https://github.com/vuejs/rfcs/discussions/369)). That converts "we couldn't do
it" into "we shouldn't", and it is worth citing there. This file may not edit `MILESTONES.md`;
recording the pending change here.
