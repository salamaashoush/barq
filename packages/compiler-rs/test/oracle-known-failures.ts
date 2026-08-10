/**
 * The oracle registry — the un-compiled reference, and what M3 did to it.
 *
 * `oracle.test.ts` compares the compiled path against the fixture's own source
 * lowered by bun's `react-jsx` transform into `@barqjs/core`'s `createElement`.
 * That reference is not a second rendering of the same design: under C1 a
 * component is `Comp(scope, props)` and a control-flow body is
 * `children(scope, item, index)`, and `createElement` was ported to call them
 * that way — but nothing rewrites the raw source's DECLARATIONS, and bun's
 * transform cannot. So for every fixture with a component tag or a slot
 * callback, the reference module binds the SCOPE to the first parameter the
 * author declared. `CODESIGN.md` §11 Q2 accepted that there is no un-compiled
 * authoring path, and §4.1 retires `createElement` at M9. These rows are the
 * interval between those two facts.
 *
 * WHY THE REFERENCE IS NOT SIMPLY REPOINTED AT `Interp`, which M1 built and
 * which `interp.test.ts` already runs green over the whole corpus: `Interp`
 * consumes the SAME analysed IR, so it creates the same effects, in the same
 * groups, at the same time. The oracle here is not only a rendering — it is the
 * BASELINE `boundEffects` measures target #1 and target #4 against ("fewer
 * effects than the oracle is the entire point of the compiler",
 * `harness.ts`). Against `Interp` that delta is identically zero, every `wins`
 * and every `goesLive` declaration in the corpus goes stale at once, and the
 * suite becomes a duplicate of `interp.test.ts` with the optimisation proof
 * deleted. Retiring this oracle needs a replacement baseline, and that is M9's
 * work, not a redirect.
 *
 * Four assertions, in `oracle.test.ts`:
 *
 *   1. a registered fixture that MATCHES the oracle is a suite failure (stale);
 *   2. an unregistered fixture that diverges is a suite failure;
 *   3. a registered fixture that diverges on channels it does not declare is a
 *      suite failure — the divergence kinds are pinned per row, so a NEW defect
 *      inside a registered fixture cannot hide behind an old one;
 *   4. `cause` is evidenced, not asserted: a `C1` row must be a fixture whose
 *      compiled module actually contains a scope-passing call site, which is the
 *      construct the un-compiled path cannot reproduce. A fixture with no such
 *      call site can never be registered under this cause.
 */

export interface OracleFailure {
  /** A `.tsx` under `fixtures/`, without the extension. */
  readonly fixture: string
  /** Every divergence kind this fixture is allowed to produce, sorted. */
  readonly kinds: readonly string[]
  /**
   * `C1` — the reference binds the scope to a declared parameter, so the
   * reference is the wrong side. `C6` — a control-flow body is a Block now, so
   * the compiled path REBUILDS what the eager argument form handed back; the
   * two paths really do differ and the compiled one is the designed behaviour.
   */
  readonly cause: "C1" | "C6"
  /**
   * Whether the STRING backend diverges from the same reference too. The DOM
   * and the string path fail on different fixtures — a node-identity divergence
   * has no string analogue, and an async body settles before either serialises
   * — so `ssr.test.ts` gets its own bit rather than inheriting this one.
   */
  readonly ssr: boolean
  /** The milestone from `CODESIGN.md` §8 after which this row must be deleted. */
  readonly greenAt: string
  readonly reason: string
}

const ROWS: readonly OracleFailure[] = [
  {
    fixture: "component-boundary-props",
    ssr: true,
    kinds: ["THREW"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. `Greeting(props)` receives the scope in its `props` slot, so `props.name` is undefined. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "component-children-slot",
    ssr: true,
    kinds: ["initial-dom", "step-dom"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. `Panel(props)` receives the scope, so its `children` slot and title read nothing. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "component-forwarded-handler-tuple",
    ssr: true,
    kinds: ["THREW"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. `Row(props)` receives the scope, so `props.handler` is undefined. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "component-function-props",
    ssr: true,
    kinds: ["THREW"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. `Chip(props)` receives the scope, so `props.legacy` is undefined. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "component-getter-props",
    ssr: true,
    kinds: ["initial-dom"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. `Badge(props)` receives the scope, so the badge renders empty. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "component-spread",
    ssr: true,
    kinds: ["THREW"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. `Chip(props)` receives the scope, so `props.tone` is undefined. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "control-flow-await-suspense",
    ssr: false,
    kinds: ["step-dom"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the `Await` body callback receives the scope in its value slot, so it renders `[object Object]`. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "control-flow-error-boundary",
    ssr: true,
    kinds: ["effect-runs", "event-dom", "initial-dom"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the boundary's fallback receives the scope where the error goes, so `error.message` is undefined. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "control-flow-errored-loading",
    ssr: true,
    kinds: ["THREW"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the fallback receives the scope where the error goes. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "control-flow-for",
    ssr: true,
    kinds: ["THREW"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the row callback receives the scope in its item slot, so `index()` is the scope. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "control-flow-for-keyed-by-item",
    ssr: true,
    kinds: ["initial-dom", "step-dom"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the row callback receives the scope in its item slot, so every row renders empty. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "control-flow-for-keyed-false",
    ssr: true,
    kinds: ["THREW"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the row callback receives the scope in its row slot. The compiled side is the correct one in every frame. Since M4b the row also diverges on `marker-count`, and that half is K7 rather than C1: a region the compiler hands `(parent, anchor)` owns no anchor node of its own, while the un-compiled reference reaches `branch`/`each` with `(null, null)` and `siteFor` gives it one empty text node. The compiled side carries one node fewer per construct, which is the whole point of the pair.",
  },
  {
    fixture: "control-flow-for-keyed-fn",
    ssr: true,
    kinds: ["THREW"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the row callback receives the scope in its row slot. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "control-flow-for-keyed-spread",
    ssr: true,
    kinds: ["THREW"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the row callback receives the scope in its row slot. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "control-flow-for-keyed-unprovable",
    ssr: true,
    kinds: ["THREW"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the row callback receives the scope in its row slot. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "control-flow-index",
    ssr: true,
    kinds: ["THREW"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the row callback receives the scope in its item slot. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "control-flow-nested",
    ssr: true,
    kinds: ["initial-dom", "step-dom"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the nested row callback receives the scope, so each `<li>` renders `[object Object]`. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "control-flow-repeat",
    ssr: true,
    kinds: ["initial-dom", "step-dom"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the `Repeat` body receives the scope in its index slot. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "control-flow-show-eager-children",
    ssr: false,
    kinds: ["node-identity-differential"],
    cause: "C6",
    greenAt: "M9",
    reason:
      "Not the reference's fault and not a defect: under C6 a control-flow body is a Block, so a branch that comes back is REBUILT, where the eager argument form handed the same node back. The un-compiled path can only express the eager form, so it is the only reference that disagrees \u2014 `optimality.test.ts` target 8 pins the new shape directly.",
  },
  {
    fixture: "control-flow-show-eager-static-body",
    ssr: false,
    kinds: ["node-identity-differential"],
    cause: "C6",
    greenAt: "M9",
    reason:
      "Not the reference's fault and not a defect: under C6 a control-flow body is a Block, so a branch that comes back is REBUILT, where the eager argument form handed the same node back. The un-compiled path can only express the eager form, so it is the only reference that disagrees \u2014 `optimality.test.ts` target 8 pins the new shape directly.",
  },
  {
    fixture: "control-flow-show-fragment-body",
    ssr: false,
    kinds: ["node-identity-differential"],
    cause: "C6",
    greenAt: "M9",
    reason:
      "Not the reference's fault and not a defect: under C6 a control-flow body is a Block, so a branch that comes back is REBUILT, where the eager argument form handed the same node back. The un-compiled path can only express the eager form, so it is the only reference that disagrees \u2014 `optimality.test.ts` target 8 pins the new shape directly.",
  },
  {
    fixture: "dashboard-composite",
    ssr: true,
    kinds: ["effect-runs", "event-dom", "initial-dom", "step-dom"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. every component and row callback in the composite receives the scope in its first declared slot. The compiled side is the correct one in every frame. Since M4b the row also diverges on `effect-runs`, and that half is K5 rather than C1: the compiled side reaches `branch`/`each` directly, so the `computed` every `Show` adapter opens over its own `when` is not created at all. The compiled side runs one effect fewer per construct, which is what deleting the adapter frame buys.",
  },
  {
    fixture: "flow-prop-eta-boundary",
    ssr: true,
    kinds: ["initial-dom", "marker-count", "step-dom"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the row callback receives the scope in its row slot. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "for-each-local-function",
    ssr: true,
    kinds: ["initial-dom", "step-dom"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the row callback receives the scope in its item slot, so every row renders empty. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "for-unkeyed-rows",
    ssr: true,
    kinds: ["THREW"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the row callback receives the scope in its word slot. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "props-destructured-body",
    ssr: true,
    kinds: ["effect-count", "effect-runs", "initial-dom", "step-dom"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the component receives the scope in its `props` slot, so the destructured names are undefined. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "props-destructured-param",
    ssr: true,
    kinds: ["effect-count", "effect-runs", "initial-dom", "step-dom"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the component receives the scope in its `props` slot, so the parameter pattern destructures the scope. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "props-raw-forward",
    ssr: true,
    kinds: ["initial-dom"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the component receives the scope in its `props` slot. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "props-renamed-and-defaulted",
    ssr: true,
    kinds: ["effect-count", "effect-runs", "initial-dom", "step-dom"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the component receives the scope in its `props` slot, so every default fires. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "props-rest-spread",
    ssr: true,
    kinds: ["effect-count", "effect-runs", "initial-dom", "step-dom"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the component receives the scope in its `props` slot, so the rest element spreads the scope onto the element. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "ref-on-component",
    ssr: true,
    kinds: ["initial-dom", "step-dom"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the component receives the scope in its `props` slot, so `props.ref` is undefined. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "renamed-core-import",
    ssr: true,
    kinds: ["initial-dom", "step-dom"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the components behind the renamed imports receive the scope in their `props` slots. The compiled side is the correct one in every frame.",
  },
  {
    fixture: "table-rows",
    ssr: true,
    kinds: ["initial-dom", "step-dom"],
    cause: "C1",
    greenAt: "M9",
    reason:
      "C1: the reference module is loaded UN-COMPILED, so bun's `react-jsx` transform lowers it to `createElement`, which invokes a component as `tag(getOwner(), props)` and a row as `children(scope, item, index)` \u2014 while nothing rewrote the fixture's DECLARATIONS to take a scope first. the row callback receives the scope in its row slot, so `data-id` is `undefined`. The compiled side is the correct one in every frame.",
  },
]

export const ORACLE_FAILURES: readonly OracleFailure[] = Object.freeze(
  ROWS.map((row) => Object.freeze({ ...row, kinds: Object.freeze([...row.kinds]) })),
)

export function oracleRegistry(): Map<string, OracleFailure> {
  const byFixture = new Map<string, OracleFailure>()
  for (const row of ORACLE_FAILURES) byFixture.set(row.fixture, row)
  return byFixture
}

/** Two rows for one fixture would make the second unreachable and unreviewed. */
export function duplicateOracleRows(): string[] {
  const seen = new Set<string>()
  const twice: string[] = []
  for (const row of ORACLE_FAILURES) {
    if (seen.has(row.fixture)) twice.push(row.fixture)
    seen.add(row.fixture)
  }
  return twice
}
