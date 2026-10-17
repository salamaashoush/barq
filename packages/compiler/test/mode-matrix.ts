/**
 * The mode matrix's exception sets, for `modes.test.ts`.
 *
 * Checked in because a suite whose exception set can widen without a diff has
 * stopped being a gate. There is no wildcard here, no glob and no environment
 * variable that widens any of them.
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
    // 26 of the 27 semantics fixtures. Their default export is not a page: it is a
    // probe the claim runner drives with a scope and a container it controls,
    // and several of them exist to throw. The near-universality is the fact this
    // list is really recording — the claim runner is almost the only thing
    // that renders them, on either backend. The exception is
    // `sem-form-action-slot`, which is a page as well as a probe because B8 is a
    // rule about what the two backends WRITE.
    "semantics/sem-async-optimistic-derived",
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
   * output is a `dynamic` component, which is a component call.
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
} as const;
