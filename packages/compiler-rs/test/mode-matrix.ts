/**
 * The L5 mode matrix's pins — `modes.test.ts`.
 *
 * Four exception sets and a census, checked in for the same reason the three
 * known-failure registries are: a suite whose exception set can widen without a
 * diff has stopped being a gate. There is no wildcard here, no glob and no
 * environment variable that widens any of them.
 */

/**
 * The matrix's exception sets: what renders on neither backend, what the
 * browser-only corpus is exempt from, how many divergences the fixtures
 * themselves declare, and which two fixtures emit identically with and without
 * the reference backend.
 *
 * A fixture that renders on neither is not broken. `fixtures/semantics/`
 * contains fixtures whose whole claim is that construction throws —
 * `sem-err-construction-throw` is the gate fixture for the bug the redesign
 * exists for — and `fixtures/l4/` contains sessions the leak harness drives
 * rather than modules with a renderable default export. What would be broken is
 * this list growing quietly: a fixture that stopped rendering has silently left
 * the end-to-end backend comparison, and that comparison would go on reporting
 * green with one fewer subject.
 */
export const MATRIX_EXCEPTIONS = {
  /**
   * Regenerate by reading the failure, never by pasting the observed list
   * without asking why a fixture moved between the two states.
   */
  neither: [
    // Its default export is one half of a two-module fixture; the harness
    // compiles the sibling with it and nothing else can.
    "ownership/own-cross-module",
    // 30 of the 31 L1 fixtures. Their default export is not a page: it is a
    // probe the claim runner drives with a scope and a container it controls,
    // and several of them exist to throw. The near-universality is the fact this
    // list is really recording — L1 is almost the only thing that has ever
    // rendered the L1 corpus, on either backend. The exception is
    // `sem-form-action-slot`, which is a page as well as a probe because B8 is a
    // rule about what the two backends WRITE, and it has been rendering since
    // M10; the "every one of them" this comment used to claim stopped being true
    // then and the count went on being bumped.
    "semantics/sem-async-abort-on-dispose",
    "semantics/sem-async-optimistic-derived",
    "semantics/sem-async-read-mode",
    "semantics/sem-async-stale-response",
    "semantics/sem-async-stream",
    "semantics/sem-calling-convention",
    "semantics/sem-ctx-provider-default-silent",
    "semantics/sem-ctx-provider-direct-child",
    "semantics/sem-ctx-provider-nested",
    "semantics/sem-ctx-provider-wrapper-component",
    "semantics/sem-ctx-value-is-live",
    "semantics/sem-err-construction-throw",
    "semantics/sem-err-fallback-reads-context",
    "semantics/sem-err-handler-throw",
    "semantics/sem-err-notready-passthrough",
    "semantics/sem-form-dom-compare",
    "semantics/sem-form-selection-preserved",
    "semantics/sem-key-identity-default",
    "semantics/sem-loading-value",
    "semantics/sem-own-given-scope-wins",
    "semantics/sem-own-render-disposer-disposes",
    "semantics/sem-own-slot-arguments",
    "semantics/sem-props-block-in-cell-slot",
    "semantics/sem-props-cast-keeps-the-brand",
    "semantics/sem-react-apply-is-untracked",
    "semantics/sem-react-component-body-untracked",
    "semantics/sem-react-untrack-keeps-owner",
    "semantics/sem-reveal-nested-group",
    "semantics/sem-show-nonkeyed-default",
    "semantics/sem-state-linked-reseeds",
    "semantics/sem-testing-wrapper-eager",
  ] as readonly string[],

  /**
   * Fixtures whose `interp` emission is byte-identical to their DOM emission.
   *
   * That looks like the reference backend being ignored and is not: this one
   * leaves the template path entirely, so there is no template for the
   * reference backend to serialise beside the module — `c7-dynamic`'s whole
   * output is a `Dynamic`, which is a component call.
   *
   * `spread-static-mix` was here until M9 and is not any more: a spread stays
   * on the template path now, so the fixture has a template and the reference
   * backend has something to serialise.
   *
   * Pinned by name because "some fixtures are identical" is exactly the sentence
   * a genuinely ignored `interp` option would also satisfy.
   */
  interpIdentical: ["l4/c7-dynamic"] as readonly string[],

  /**
   * `fixtures/browser-only/` exists because happy-dom is structurally unable to
   * judge these — `pre-hole-newline` is about the HTML parser's leading-newline
   * rule inside `<pre>`, which happy-dom does not implement. The DOM path's
   * markup here is happy-dom's answer and not a browser's, so a difference from
   * the string backend is evidence about happy-dom. `browser.test.ts` is the
   * oracle for these and this file is not.
   */
  browserOnly: ["browser-only/pre-hole-newline"] as readonly string[],

  /**
   * Fixtures whose own `ssrDiffers` export declares the divergence, counted
   * rather than listed: the declaration lives in the fixture, which is where a
   * reviewer reads it, and duplicating the list here would let the two drift.
   * The COUNT is here so that a fourth appearing is a diff.
   *
   * Today: `attribute-namespaces`, `class-owns-only-its-tokens`, `ref-binding`,
   * plus the one browser-only exemption above.
   */
  declaredDivergences: 4,
} as const

/**
 * The matrix's census, pinned in both directions (`ratchet.ts`).
 *
 * Fewer cells means the matrix stopped covering something. More means the
 * corpus grew and nobody asked what the new fixture does through the string
 * backend or the reference backend — which is the question this whole file
 * exists to make somebody answer.
 */
// M10 +2 fixtures, +14 cells, +2 renderableOnBoth: `control-flow-spread-precedence`
// and `control-flow-spread-repeat`, the two shapes the spread lowering added
// that no existing fixture covers — a named prop written after the last spread
// staying static beside one only the spread carries, and `Repeat`'s index shift
// off a slot the primitive does not read. Both render on both backends, which
// is the point: the lowering is in `region_call`, so the two halves reach the
// same primitive with the same arguments.
// Then +1 fixture, +7 cells, +1 renderableOnBoth for `control-flow-spread-show`,
// which is `Show`'s runtime keying arm — both programs emitted, the test at run
// time — and it has to read identically through all seven modes, because the
// test is in the emitted expression rather than in either backend.
// And +1 fixture, +7 cells, +1 renderableOnBoth for `control-flow-show-keyed-false`,
// which is the `Show` arm that had no fixture — the reason its body parameter
// went untyped long enough for the read in it to be applied once.
// And +1 fixture, +7 cells, +1 renderableOnBoth for `form-action`, §3.8's
// compiler surface. It renders on both backends and they deliberately DISAGREE
// about the attribute — the client installs a submit handler, the server writes
// no `action` at all — which is why it is worth one cell in each of the seven.
// `sem-form-action-slot` is the semantics half of the same rule (B8) and adds
// the last +1/+7/+1: four claims, of which two are the defect that shipped.
// And +1/+7/+1 for `control-flow-show-keyed`, the arm that opts in to keying —
// added when M10 flipped the default, so the corpus covers both sides of it.
// And +1 fixture / +7 cells / +1 renderableOnNeither for
// `sem-show-nonkeyed-default`, K1.1's two claims — a claims fixture renders on
// neither backend by construction, which is what the list above is for.
// M11: +1 fixture / +7 cells / +1 renderableOnNeither for
// `sem-reveal-nested-group`, A6's five claims. It is worth a cell in each of the
// seven for a reason the other claims fixtures do not have: `Reveal` is the one
// construct whose two backends run the SAME coordinator — `ssr.ts` builds one
// and provides it exactly as `flow.ts` does — so a nesting rule that compiled
// differently through the string backend would be invisible to the DOM claims.
// And +1/+7/+1 for `sem-async-stream`, A7's two claims. The node's own eight
// procedures run in `async-source.test.ts`; what only a fixture can ask is what
// the BOUNDARY does across a stream's steps, which is the half of A7 that is
// about `Loading` rather than about the node.
// And +1 fixture / +7 cells / +1 renderableOnNeither for `sem-loading-value`,
// A8's two claims. Its second claim needs A5 (f) to be true — it reads
// `isPending` off a live class, because the VALUE cannot separate A8's two
// states: `Loading` revalidation keeps stale content whether the window closed
// or not, so the page reads the same either way and only the pending channel
// differs.
// And +2 fixtures / +14 cells for A5 (f)'s read surface: `read-mode-binding`
// (+1 renderableOnBoth) is the emission and `sem-async-read-mode` (+1
// renderableOnNeither) is the behaviour. They are two fixtures rather than one
// because the claim splits along the backend line — the reference backend
// expresses the same live binding as an interpreter op, so `bindEffect` is a
// fact about the DOM emission and not a conformance verdict. A claim asserting
// it was written into the semantics fixture first and L3 rejected it, which is
// the differential doing exactly what it is for.
export const MODE_MATRIX_REACH: Readonly<Record<string, number>> = Object.freeze({
  fixtures: 195,
  modes: 7,
  cells: 1365,
  renderableOnBoth: 163,
  renderableOnNeither: 32,
})
