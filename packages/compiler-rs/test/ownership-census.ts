/**
 * The census: what the ownership channel actually observed, per fixture,
 * declared rather than derived.
 *
 * `ownership-known-failures.ts` catches a defect the channel can NAME. This
 * catches the ones it cannot. Three counts, and each of them closes a hole a
 * mutation walked straight through:
 *
 *   - `clones`. A Block invoked twice per activation builds two DOM subtrees
 *     and drops one. Every test in this repository passes under it — core
 *     809/0, compiler-rs 1408/0, both M0 channels green — and the only trace of
 *     it is the corpus clone total moving from 272 to 274. `SEMANTICS.md` C7
 *     ("a Block is called exactly once per activation") has no runtime channel
 *     until M4; until then a declared per-fixture count is what makes a silent
 *     double invocation a diff. Multiplicity is not decidable from the source
 *     (`ownership.ts`: an `each` position produces one clone per row), so this
 *     is a recorded observation and not a derived expectation — which is
 *     exactly why it has to be checked in.
 *
 *   - `unattributed`. A clone whose template the static tree never placed is a
 *     clone this channel did not check. Asserting it is zero everywhere reads
 *     as "the channel checked everything" and is really "every fixture is a
 *     single file". `own-cross-module` is the one that is not, and its single
 *     unattributed clone is declared here rather than excluded.
 *
 *   - `opaque`. The components the walk could not follow. Non-empty means the
 *     tree is partial for that fixture, and it must be a stated condition, not
 *     something a reader infers from a count.
 *
 * To regenerate after a deliberate change: run the ownership suite, read the
 * per-fixture numbers out of the failure it prints, and edit the row. There is
 * no `--write`, on purpose: a census that rewrites itself would absorb the very
 * regression it exists to catch.
 */

export interface CensusRow {
  readonly fixture: string
  /** template instantiations attributed to a compiled position */
  readonly clones: number
  /** template instantiations the static tree could not place */
  readonly unattributed: number
  /** components the static walk could not follow, so the tree is partial */
  readonly opaque: readonly string[]
}

/**
 * **M4 moved two of these counts, and both are C7 arriving.**
 *
 * A consumer that invokes its Block twice for one activation builds two DOM
 * subtrees and discards one. Nothing else in this repository can see that; this
 * column can, and it is what these two rows record now that the ten
 * hand-written control-flow bodies are one `region` driver:
 *
 *   control-flow-error-boundary            3 -> 2   the fallback was built twice on the
 *                                                   construction throw: once inline in the
 *                                                   `catch`, once again when the effect re-ran
 *                                                   on the captured error
 *   control-flow-await-suspense            4 -> 3   `Suspense` rendered its fallback and then
 *                                                   rendered it again from the microtask pair
 *                                                   that subscribed to nothing
 *
 * Both are strictly fewer clones for identical DOM in every frame, which is the
 * only direction this column may move without a fixture edit.
 */

/**
 * **M3 moved eight of these counts, and every move is C6 arriving.**
 *
 * A slot used to be a value: `fallback={<em/>}` was cloned once, at the call
 * site, whether or not the branch ever showed it, and a body written without a
 * thunk was cloned once and handed over already built. A slot is a `Block` now,
 * so the count is "once per activation" rather than "once per call site", and
 * the number moves in whichever direction the fixture's steps drive it.
 *
 *   control-flow-show-eager-children       3 -> 4   body and fallback each rebuilt on the toggle
 *   control-flow-show-eager-static-body    1 -> 2   the static body is rebuilt when it comes back
 *   control-flow-show-fragment-body        5 -> 9   two roots per activation, across two toggles
 *   renamed-core-import                    6 -> 7   the fallback is built when it shows, not before
 *   control-flow-errored-loading           2 -> 1   the boundary fallback is never activated
 *   dashboard-composite                    6 -> 5   a fallback that never shows is never built
 *   switch-match-component-bodies          5 -> 4   the losing arm's body is never built
 *   for-each-local-function                4 -> 1 -> 4   the row Block is called per row.
 *                                                   It fell to 1 while `each={activeItems}` was
 *                                                   wrapped in a second Cell and the list rendered
 *                                                   EMPTY; §3.0 rule 1 through a binding put the
 *                                                   rows back.
 *
 * The last five are the ones worth reading twice: FEWER clones, because a Block
 * that is not activated is not built. That is the eager-argument cost the
 * redesign exists to remove, showing up as a number.
 */
const ROWS: readonly CensusRow[] = [
  { fixture: "array-hole", clones: 9, unattributed: 0, opaque: [] },
  { fixture: "attribute-namespaces", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "arrow-body-component", clones: 2, unattributed: 0, opaque: [] },
  { fixture: "auto-thunked-read", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "boolean-and-nullish-props", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "bind-family", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "bind-value-channel", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "class-empty-string", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "class-list-array-object", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "class-list-prop", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "class-owns-only-its-tokens", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "class-with-live-siblings", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "component-boundary-props", clones: 3, unattributed: 0, opaque: [] },
  { fixture: "component-child-of-element", clones: 4, unattributed: 0, opaque: [] },
  { fixture: "component-children-slot", clones: 5, unattributed: 0, opaque: [] },
  { fixture: "component-forwarded-handler-tuple", clones: 2, unattributed: 0, opaque: [] },
  { fixture: "component-function-props", clones: 2, unattributed: 0, opaque: [] },
  { fixture: "component-getter-props", clones: 2, unattributed: 0, opaque: [] },
  { fixture: "component-spread", clones: 3, unattributed: 0, opaque: [] },
  { fixture: "conditional-children", clones: 4, unattributed: 0, opaque: [] },
  { fixture: "context-provider", clones: 3, unattributed: 0, opaque: [] },
  { fixture: "control-flow-await-suspense", clones: 3, unattributed: 0, opaque: [] },
  { fixture: "control-flow-error-boundary", clones: 2, unattributed: 0, opaque: [] },
  { fixture: "control-flow-errored-loading", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "control-flow-for", clones: 5, unattributed: 0, opaque: [] },
  { fixture: "control-flow-for-keyed-by-item", clones: 5, unattributed: 0, opaque: [] },
  { fixture: "control-flow-for-keyed-false", clones: 4, unattributed: 0, opaque: [] },
  { fixture: "control-flow-for-keyed-fn", clones: 4, unattributed: 0, opaque: [] },
  { fixture: "control-flow-for-keyed-spread", clones: 3, unattributed: 0, opaque: [] },
  { fixture: "control-flow-for-keyed-unprovable", clones: 3, unattributed: 0, opaque: [] },
  { fixture: "control-flow-for-static-body", clones: 4, unattributed: 0, opaque: [] },
  { fixture: "control-flow-index", clones: 7, unattributed: 0, opaque: [] },
  { fixture: "control-flow-nested", clones: 12, unattributed: 0, opaque: [] },
  { fixture: "control-flow-repeat", clones: 5, unattributed: 0, opaque: [] },
  { fixture: "control-flow-show-keyed-false", clones: 4, unattributed: 0, opaque: [] },
  { fixture: "control-flow-spread-show", clones: 4, unattributed: 0, opaque: [] },
  { fixture: "control-flow-spread-precedence", clones: 4, unattributed: 0, opaque: [] },
  { fixture: "control-flow-spread-repeat", clones: 5, unattributed: 0, opaque: [] },
  { fixture: "control-flow-reveal", clones: 3, unattributed: 0, opaque: [] },
  { fixture: "control-flow-show", clones: 4, unattributed: 0, opaque: [] },
  { fixture: "control-flow-show-eager-children", clones: 4, unattributed: 0, opaque: [] },
  { fixture: "control-flow-show-cleanup-body", clones: 3, unattributed: 0, opaque: [] },
  { fixture: "control-flow-show-eager-static-body", clones: 2, unattributed: 0, opaque: [] },
  { fixture: "control-flow-show-fragment-body", clones: 9, unattributed: 0, opaque: [] },
  { fixture: "control-flow-show-static-body", clones: 2, unattributed: 0, opaque: [] },
  { fixture: "control-flow-show-static-key", clones: 3, unattributed: 0, opaque: [] },
  { fixture: "control-flow-switch-match", clones: 5, unattributed: 0, opaque: [] },
  { fixture: "control-flow-switch-static-key", clones: 2, unattributed: 0, opaque: [] },
  { fixture: "async-value", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "optimistic-signal", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "projection-store", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "custom-elements", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "dangerously-set-inner-html", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "dashboard-composite", clones: 5, unattributed: 0, opaque: [] },
  { fixture: "dedup-identical-markup", clones: 3, unattributed: 0, opaque: [] },
  { fixture: "deep-walk", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "delegated-event", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "delegated-two-types", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "delegated-handler-tuple", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "derived-local-thunk", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "diagnostic-accessor-coercion", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "dom-prop-static-value", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "dynamic", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "equal-liveness", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "escaped-text-and-attribute", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "escaping-adversarial", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "flow-prop-eta-boundary", clones: 6, unattributed: 0, opaque: [] },
  { fixture: "for-each-local-function", clones: 4, unattributed: 0, opaque: [] },
  { fixture: "for-unkeyed-rows", clones: 4, unattributed: 0, opaque: [] },
  { fixture: "fragment-root", clones: 3, unattributed: 0, opaque: [] },
  { fixture: "handler-by-reference", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "handler-closure", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "handler-no-closure", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "hole-then-element-sibling", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "html-entities", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "hygiene-shifted-uids", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "inert-member-reads", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "inner-html-with-children", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "literal-class-style", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "live-call-hole", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "logical-and-child", clones: 3, unattributed: 0, opaque: [] },
  { fixture: "marker-literal-text", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "mathml", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "multi-prop-one-element", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "multi-signal-expression", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "nested-fragments", clones: 5, unattributed: 0, opaque: [] },
  { fixture: "nested-template-element", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "non-delegated-event", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "numeric-and-boolean-attrs", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "portal", clones: 2, unattributed: 0, opaque: [] },
  { fixture: "pre-dynamic-leading-newline", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "pre-leading-newline", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "pre-whitespace", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "property-attrs", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "props-destructured-body", clones: 2, unattributed: 0, opaque: [] },
  { fixture: "props-destructured-param", clones: 3, unattributed: 0, opaque: [] },
  { fixture: "props-raw-forward", clones: 2, unattributed: 0, opaque: [] },
  { fixture: "props-renamed-and-defaulted", clones: 3, unattributed: 0, opaque: [] },
  { fixture: "props-rest-spread", clones: 2, unattributed: 0, opaque: [] },
  { fixture: "reactive-attribute", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "reassigned-binding", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "ref-cleanup", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "ref-binding", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "ref-writable-binding", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "ref-on-component", clones: 2, unattributed: 0, opaque: [] },
  { fixture: "renamed-core-import", clones: 7, unattributed: 0, opaque: [] },
  { fixture: "select-option-multiple", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "sibling-live-props", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "sibling-walk", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "signal-alias", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "signal-methods-in-handler", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "spread-static-mix", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "static-attribute-expression", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "static-only", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "style-object", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "svg", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "svg-dynamic-class", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "svg-nested-in-html", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "switch-match-component-bodies", clones: 4, unattributed: 0, opaque: [] },
  { fixture: "table-root-shapes", clones: 6, unattributed: 0, opaque: [] },
  { fixture: "table-rows", clones: 4, unattributed: 0, opaque: [] },
  { fixture: "text-gt-hole", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "text-hole-adjacent", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "text-hole-followed", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "text-hole-fused", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "text-hole-trailing", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "two-components-two-templates", clones: 3, unattributed: 0, opaque: [] },
  { fixture: "two-nested-holes", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "unicode-long-template", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "computed-derived", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "signal-object", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "store-member", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "void-elements", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "walk-from-the-back", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "whitespace-only", clones: 1, unattributed: 0, opaque: [] },
  { fixture: "own-cross-module", clones: 1, unattributed: 1, opaque: ["Card"] },
  { fixture: "own-nested-scopes-dispose", clones: 4, unattributed: 0, opaque: [] },
  { fixture: "own-provider-direct", clones: 2, unattributed: 0, opaque: [] },
  { fixture: "own-provider-thunked", clones: 2, unattributed: 0, opaque: [] },
  { fixture: "own-provider-wrapper", clones: 2, unattributed: 0, opaque: [] },
]

export const OWNERSHIP_CENSUS: readonly CensusRow[] = Object.freeze(
  ROWS.map((row) => Object.freeze({ ...row, opaque: Object.freeze([...row.opaque]) })),
)

export function censusIndex(): Map<string, CensusRow> {
  const byFixture = new Map<string, CensusRow>()
  for (const row of OWNERSHIP_CENSUS) {
    if (byFixture.has(row.fixture)) throw new Error(`the census has two rows for ${row.fixture}`)
    byFixture.set(row.fixture, row)
  }
  return byFixture
}
