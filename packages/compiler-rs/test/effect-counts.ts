/**
 * L4's absolute effect channel — `CODESIGN.md` §6 L4, the row that reads
 *
 * > Effect counts / run counts | **absolute** | Hand-written expected numbers
 * > per fixture, as Svelte's `tests/signals` does with `log` arrays. These are
 * > optimality claims, never equivalence claims.
 *
 * ## What this replaces, and why it is not the same shape
 *
 * Until M9 the effect channel was `harness.ts boundEffects`: an upper BOUND
 * measured against the un-compiled `createElement` oracle, because "fewer
 * effects than the oracle is the entire point of the compiler". §6 retires that
 * oracle, and `oracle-known-failures.ts` stated the consequence before it
 * happened — the baseline goes with it, and repointing it at `Interp` would
 * make the delta identically zero because `Interp` consumes the same analysed
 * IR.
 *
 * So the channel changes GRADE rather than reference. A bound needs a second
 * implementation to be a bound against; an absolute number needs nothing, and
 * it is strictly stronger in the direction that matters: the old bound was
 * one-sided, so a fixture that created FEWER effects than it should — a binding
 * that silently went missing, target #1 over-applied — was reported as a win.
 * An equality catches that. It also catches the opposite direction the bound
 * caught, and it does so without `goesLive`: O4 auto-thunking makes `{count()}`
 * live, that costs one effect, and the number below simply IS one higher. There
 * is nothing left to declare and nothing left to go stale.
 *
 * ## The columns
 *
 *  - `created`  — effects the compiled render constructs across the whole cycle
 *  - `runs`     — total effect invocations across the whole cycle
 *  - `busiest`  — the highest run count any single effect reached
 *  - `frames`   — initial render + scripted steps + dispatched events
 *
 * `busiest` is the column the aggregate hides: one binding re-running on every
 * frame is invisible in `runs` whenever another binding runs fewer times, which
 * is exactly how a mis-fused effect group used to pass.
 *
 * ## Where the first numbers came from
 *
 * Not from the build alone. Seventeen fixtures already carried a hand-written
 * `optimality.effects` — a number a human wrote next to the JSX it is a claim
 * about — and the `created` column agrees with all seventeen. The rest were
 * taken from a build the retiring oracle still passed, so every one of them was
 * at or under the un-compiled runtime's count at the moment it was recorded.
 * That is the strongest provenance available once the reference is gone, and it
 * is stated here rather than implied.
 *
 * ## Regenerating
 *
 * `BARQ_EFFECTS=print bun test test/effect-counts.test.ts` prints this table's
 * body from the current build. Copying it in is a diff — a number that moved is
 * read in the same change that moves it, which is the only thing that keeps a
 * hand-written table honest. A row that changes without a reason in the commit
 * message is a regression that was pasted over.
 */

export interface EffectCount {
  /** A `.tsx` under `fixtures/`, without the extension. */
  readonly fixture: string
  /** Effects the compiled render creates across every frame. */
  readonly created: number
  /** Total effect runs across every frame. */
  readonly runs: number
  /** The busiest single effect's run count. */
  readonly busiest: number
  /** Initial render plus every scripted step and dispatched event. */
  readonly frames: number
}

const ROWS: readonly EffectCount[] = [
  { fixture: "array-hole", created: 2, runs: 10, busiest: 5, frames: 5 },
  { fixture: "arrow-body-component", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "async-value", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "attribute-namespaces", created: 2, runs: 5, busiest: 3, frames: 5 },
  { fixture: "auto-thunked-read", created: 3, runs: 6, busiest: 2, frames: 2 },
  { fixture: "bind-family", created: 6, runs: 14, busiest: 4, frames: 6 },
  { fixture: "bind-value-channel", created: 2, runs: 6, busiest: 3, frames: 3 },
  { fixture: "boolean-and-nullish-props", created: 2, runs: 6, busiest: 3, frames: 3 },
  { fixture: "class-empty-string", created: 3, runs: 6, busiest: 2, frames: 3 },
  { fixture: "class-list-array-object", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "class-list-prop", created: 2, runs: 6, busiest: 3, frames: 3 },
  { fixture: "class-owns-only-its-tokens", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "class-with-live-siblings", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "component-boundary-props", created: 4, runs: 5, busiest: 2, frames: 2 },
  { fixture: "component-child-of-element", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "component-children-slot", created: 3, runs: 5, busiest: 3, frames: 3 },
  { fixture: "component-forwarded-handler-tuple", created: 3, runs: 4, busiest: 2, frames: 2 },
  { fixture: "component-function-props", created: 2, runs: 3, busiest: 2, frames: 2 },
  { fixture: "component-getter-props", created: 1, runs: 2, busiest: 2, frames: 2 },
  { fixture: "component-spread", created: 4, runs: 5, busiest: 2, frames: 2 },
  { fixture: "computed-derived", created: 2, runs: 6, busiest: 3, frames: 3 },
  { fixture: "conditional-children", created: 1, runs: 4, busiest: 4, frames: 4 },
  { fixture: "context-provider", created: 2, runs: 3, busiest: 2, frames: 2 },
  { fixture: "control-flow-await-suspense", created: 8, runs: 11, busiest: 2, frames: 2 },
  { fixture: "control-flow-error-boundary", created: 1, runs: 2, busiest: 2, frames: 2 },
  { fixture: "control-flow-errored-loading", created: 4, runs: 5, busiest: 2, frames: 2 },
  { fixture: "control-flow-for", created: 4, runs: 9, busiest: 4, frames: 4 },
  { fixture: "control-flow-for-keyed-by-item", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "control-flow-for-keyed-false", created: 4, runs: 10, busiest: 4, frames: 4 },
  { fixture: "control-flow-for-keyed-fn", created: 5, runs: 14, busiest: 4, frames: 4 },
  { fixture: "control-flow-for-keyed-spread", created: 3, runs: 8, busiest: 3, frames: 3 },
  { fixture: "control-flow-for-keyed-unprovable", created: 3, runs: 8, busiest: 3, frames: 3 },
  { fixture: "control-flow-for-static-body", created: 1, runs: 4, busiest: 4, frames: 4 },
  { fixture: "control-flow-index", created: 7, runs: 12, busiest: 4, frames: 4 },
  { fixture: "control-flow-nested", created: 3, runs: 7, busiest: 3, frames: 5 },
  { fixture: "control-flow-repeat", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "control-flow-reveal", created: 1, runs: 2, busiest: 2, frames: 2 },
  { fixture: "control-flow-show", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "control-flow-show-cleanup-body", created: 2, runs: 8, busiest: 4, frames: 4 },
  { fixture: "control-flow-show-eager-children", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "control-flow-show-eager-static-body", created: 1, runs: 4, busiest: 4, frames: 4 },
  { fixture: "control-flow-show-fragment-body", created: 1, runs: 4, busiest: 4, frames: 4 },
  { fixture: "control-flow-show-static-body", created: 1, runs: 4, busiest: 4, frames: 4 },
  { fixture: "control-flow-show-static-key", created: 1, runs: 2, busiest: 2, frames: 2 },
  { fixture: "control-flow-spread-show", created: 1, runs: 4, busiest: 4, frames: 4 },
  { fixture: "control-flow-show-keyed-false", created: 3, runs: 7, busiest: 4, frames: 4 },
  { fixture: "control-flow-spread-precedence", created: 4, runs: 10, busiest: 4, frames: 4 },
  { fixture: "control-flow-spread-repeat", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "control-flow-switch-match", created: 1, runs: 4, busiest: 4, frames: 4 },
  { fixture: "control-flow-switch-static-key", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "optimistic-signal", created: 1, runs: 2, busiest: 2, frames: 2 },
  { fixture: "projection-store", created: 2, runs: 6, busiest: 3, frames: 3 },
  { fixture: "custom-elements", created: 1, runs: 2, busiest: 2, frames: 2 },
  { fixture: "dangerously-set-inner-html", created: 1, runs: 1, busiest: 1, frames: 1 },
  { fixture: "dashboard-composite", created: 5, runs: 11, busiest: 3, frames: 6 },
  { fixture: "dedup-identical-markup", created: 0, runs: 0, busiest: 0, frames: 1 },
  { fixture: "deep-walk", created: 1, runs: 2, busiest: 2, frames: 2 },
  { fixture: "delegated-event", created: 1, runs: 4, busiest: 4, frames: 4 },
  { fixture: "delegated-handler-tuple", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "delegated-two-types", created: 1, runs: 5, busiest: 5, frames: 5 },
  { fixture: "derived-local-thunk", created: 2, runs: 6, busiest: 3, frames: 3 },
  { fixture: "diagnostic-accessor-coercion", created: 2, runs: 4, busiest: 2, frames: 2 },
  { fixture: "dom-prop-static-value", created: 0, runs: 0, busiest: 0, frames: 1 },
  { fixture: "dynamic", created: 7, runs: 9, busiest: 3, frames: 3 },
  { fixture: "equal-liveness", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "escaped-text-and-attribute", created: 0, runs: 0, busiest: 0, frames: 1 },
  { fixture: "escaping-adversarial", created: 4, runs: 12, busiest: 3, frames: 5 },
  { fixture: "flow-prop-eta-boundary", created: 3, runs: 7, busiest: 3, frames: 6 },
  { fixture: "for-each-local-function", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "for-unkeyed-rows", created: 4, runs: 7, busiest: 3, frames: 3 },
  { fixture: "form-action", created: 2, runs: 5, busiest: 3, frames: 2 },
  { fixture: "fragment-root", created: 1, runs: 2, busiest: 2, frames: 2 },
  { fixture: "handler-by-reference", created: 1, runs: 4, busiest: 4, frames: 4 },
  { fixture: "handler-closure", created: 1, runs: 4, busiest: 4, frames: 4 },
  { fixture: "handler-no-closure", created: 0, runs: 0, busiest: 0, frames: 2 },
  { fixture: "hole-then-element-sibling", created: 2, runs: 5, busiest: 3, frames: 4 },
  { fixture: "html-entities", created: 0, runs: 0, busiest: 0, frames: 1 },
  { fixture: "hygiene-shifted-uids", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "inert-member-reads", created: 0, runs: 0, busiest: 0, frames: 1 },
  { fixture: "inner-html-with-children", created: 0, runs: 0, busiest: 0, frames: 1 },
  { fixture: "literal-class-style", created: 0, runs: 0, busiest: 0, frames: 1 },
  { fixture: "live-call-hole", created: 3, runs: 6, busiest: 2, frames: 3 },
  { fixture: "logical-and-child", created: 4, runs: 10, busiest: 3, frames: 7 },
  { fixture: "marker-literal-text", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "mathml", created: 0, runs: 0, busiest: 0, frames: 1 },
  { fixture: "multi-prop-one-element", created: 1, runs: 4, busiest: 4, frames: 4 },
  { fixture: "multi-signal-expression", created: 2, runs: 6, busiest: 3, frames: 3 },
  { fixture: "nested-fragments", created: 1, runs: 2, busiest: 2, frames: 2 },
  { fixture: "nested-template-element", created: 0, runs: 0, busiest: 0, frames: 1 },
  { fixture: "non-delegated-event", created: 1, runs: 6, busiest: 6, frames: 6 },
  { fixture: "numeric-and-boolean-attrs", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "portal", created: 1, runs: 1, busiest: 1, frames: 1 },
  { fixture: "pre-dynamic-leading-newline", created: 2, runs: 4, busiest: 2, frames: 3 },
  { fixture: "pre-leading-newline", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "pre-whitespace", created: 0, runs: 0, busiest: 0, frames: 1 },
  { fixture: "property-attrs", created: 2, runs: 4, busiest: 2, frames: 3 },
  { fixture: "props-destructured-body", created: 2, runs: 3, busiest: 2, frames: 2 },
  { fixture: "props-destructured-param", created: 4, runs: 5, busiest: 2, frames: 2 },
  { fixture: "props-raw-forward", created: 2, runs: 4, busiest: 2, frames: 2 },
  { fixture: "props-renamed-and-defaulted", created: 3, runs: 4, busiest: 2, frames: 2 },
  { fixture: "props-rest-spread", created: 2, runs: 3, busiest: 2, frames: 2 },
  { fixture: "reactive-attribute", created: 1, runs: 4, busiest: 4, frames: 4 },
  { fixture: "reassigned-binding", created: 0, runs: 0, busiest: 0, frames: 1 },
  { fixture: "ref-binding", created: 0, runs: 0, busiest: 0, frames: 2 },
  { fixture: "ref-cleanup", created: 0, runs: 0, busiest: 0, frames: 1 },
  { fixture: "ref-on-component", created: 1, runs: 1, busiest: 1, frames: 2 },
  { fixture: "ref-writable-binding", created: 0, runs: 0, busiest: 0, frames: 2 },
  { fixture: "renamed-core-import", created: 3, runs: 6, busiest: 3, frames: 4 },
  { fixture: "select-option-multiple", created: 0, runs: 0, busiest: 0, frames: 1 },
  { fixture: "sibling-live-props", created: 2, runs: 4, busiest: 2, frames: 3 },
  { fixture: "sibling-walk", created: 2, runs: 4, busiest: 2, frames: 3 },
  { fixture: "signal-alias", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "signal-methods-in-handler", created: 2, runs: 6, busiest: 3, frames: 3 },
  { fixture: "signal-object", created: 2, runs: 8, busiest: 4, frames: 4 },
  { fixture: "spread-static-mix", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "static-attribute-expression", created: 0, runs: 0, busiest: 0, frames: 1 },
  { fixture: "static-only", created: 0, runs: 0, busiest: 0, frames: 1 },
  { fixture: "store-member", created: 2, runs: 5, busiest: 3, frames: 4 },
  { fixture: "style-object", created: 1, runs: 2, busiest: 2, frames: 2 },
  { fixture: "svg", created: 1, runs: 2, busiest: 2, frames: 2 },
  { fixture: "svg-dynamic-class", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "svg-nested-in-html", created: 0, runs: 0, busiest: 0, frames: 1 },
  { fixture: "switch-match-component-bodies", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "table-root-shapes", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "table-rows", created: 4, runs: 10, busiest: 4, frames: 5 },
  { fixture: "text-gt-hole", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "text-hole-adjacent", created: 2, runs: 5, busiest: 3, frames: 4 },
  { fixture: "text-hole-followed", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "text-hole-fused", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "text-hole-trailing", created: 1, runs: 4, busiest: 4, frames: 4 },
  { fixture: "two-components-two-templates", created: 0, runs: 0, busiest: 0, frames: 1 },
  { fixture: "two-nested-holes", created: 2, runs: 4, busiest: 2, frames: 3 },
  { fixture: "unicode-long-template", created: 1, runs: 3, busiest: 3, frames: 3 },
  { fixture: "void-elements", created: 0, runs: 0, busiest: 0, frames: 1 },
  { fixture: "walk-from-the-back", created: 2, runs: 4, busiest: 2, frames: 3 },
  { fixture: "whitespace-only", created: 0, runs: 0, busiest: 0, frames: 1 },
]

export const EFFECT_COUNTS: readonly EffectCount[] = Object.freeze(
  ROWS.map((row) => Object.freeze(row)),
)

export function effectCounts(): Map<string, EffectCount> {
  const byFixture = new Map<string, EffectCount>()
  for (const row of EFFECT_COUNTS) byFixture.set(row.fixture, row)
  return byFixture
}

/** The literal a row should carry, in the form the table is written in. */
export function formatEffectRow(row: EffectCount): string {
  return (
    `  { fixture: ${JSON.stringify(row.fixture)}, created: ${row.created}, ` +
    `runs: ${row.runs}, busiest: ${row.busiest}, frames: ${row.frames} },`
  )
}

/** Two rows for one fixture would make the second unreachable and unreviewed. */
export function duplicateEffectRows(): string[] {
  const seen = new Set<string>()
  const twice: string[] = []
  for (const row of EFFECT_COUNTS) {
    if (seen.has(row.fixture)) twice.push(row.fixture)
    seen.add(row.fixture)
  }
  return twice
}
