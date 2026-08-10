# Fixture corpus

Every `*.tsx` here is a real, compilable module with two exports:

```ts
export default function Fixture(): JSXElement                 // required
export const steps: Array<() => void>                         // optional, default []
export const events: Array<(root: HTMLElement) => void>       // optional, default []
export const wins: CompilerWin[]                              // optional, default []
export const goesLive: string[]                               // optional, default []
export const optimality: OptimalityExpectation                // optional
```

`steps` drives UPDATE correctness: the harness renders once, then applies each step
and re-snapshots the DOM. Signals therefore live at module scope so a step can write
them; each render gets its own module instance, so there is no cross-render bleed.

`events` drives EVENT correctness, and it is the only thing that can see a handler at
all — a signal write reaches the DOM whether or not `onClick` was ever bound. Each entry
gets the render container and dispatches a real DOM event (`.click()`,
`dispatchEvent(new Event("mouseenter"))`); the harness snapshots after each one. The
container stays attached to `document.body` throughout, because delegated handlers only
fire once the event reaches `document`.

Both exports must actually change the DOM — `oracle.test.ts` fails a fixture whose steps
or events are inert, so a fixture cannot quietly stop testing anything.

## The invariant, and the two ways out of it

- **Initial-render DOM is identical. No exceptions.** Nothing a fixture exports can
  declare its way out of it — `compareToOracle` never consults a declaration for the
  first frame.
- **Every later frame is identical too, unless the fixture declares a `win`.**
- **Effect counts are an UPPER bound**, lifted per entry in `goesLive`.

`wins` — a step or event where the compiled path is deliberately **more correct** than
the oracle, naming the exact DOM it must produce:

```ts
export const wins: CompilerWin[] = [
  { kind: "step", index: 0, compiled: "<div>…</div>", why: "the oracle appends with marker = null" },
]
```

It is not a licence to differ. The harness fails if the compiled frame is not `compiled`
byte for byte, and fails as **stale** if the two paths stopped differing there. See
`conditional-children.tsx`, the only win in the corpus.

`goesLive` — holes that compiler-mode auto-thunking (O4) turns into live bindings where
the oracle reads them once. Each entry **lifts** the effect-count bound by one and the
effect-run bound by one per driven frame; it does not switch either off, and an entry the
compiler does not actually need is reported as **stale** the way a win is. Empty
everywhere at M2, because nothing is classified yet.

Fixtures are otherwise written in **explicit-thunk style** (`{() => count()}`,
`when={() => flag()}`), which is the un-compiled contract the JSX runtime specifies.
A fixture that means to exercise auto-thunking writes `{count()}` and declares it in
`goesLive`.

## `optimality` — what the compiler must eventually make of this fixture

`steps`, `events` and `wins` are all about behaviour. `optimality` is the other half:
the claim that the emitted code is *good*, stated next to the JSX it is a claim about.

```ts
export const optimality = {
  target: 3,          // which of the ten optimization targets this fixture proves
  milestone: 3,       // the milestone that turns the claim on
  effects: 0,         // effects the compiled render must create
  templates: 1,       // _$template() calls
  patchCalls: 0,      // _$insert + _$setProp + _$spread calls
  emits: ['class="btn btn--primary"'],
  absent: ["${base}"],
  ordered: [["hoisted handler", "function Component"]] as Array<[string, string]>,
}
```

`optimality.test.ts` holds a single `MILESTONE` constant. A declaration at or below it
is **asserted**; one above it is pending, and raising that constant is what turns a whole
milestone's claim on at once. Every field is optional except `target` and `milestone`.

The declaration is source like any other and reaches the emitted module, so code-level
assertions compile the fixture through `compileFixtureBody`, which strips it first —
otherwise `absent: ["=>"]` would satisfy a search for `=>`.

## The channels the DOM diff throws away

`normalize.ts` sorts attributes and drops empty comments, and neither rule can be
weakened without failing every legitimate output. Both are recovered on side channels
that `compareToOracle` asserts separately:

- **anchors** — every `<!---->` in place, with no text fused across one, snapshotted per
  fixture under `test/__snapshots__/oracle.test.ts.snap`. This is the behavioural test for
  target 9 (marker elision): every anchor the pass removes shows up as a line in that
  diff. Text that happens to *read* `<!---->` is escaped on this channel, and the count is
  taken off the nodes (`DomChannels.anchors`), so content can never be mistaken for
  structure — see `marker-literal-text.tsx`.

  The count is bounded independently against the emitted code, and since elision landed
  the bound is *structural* rather than numeric: `auditAnchors` parses each emitted
  template, resolves every `const _elN = _elM.firstChild…` walk against it, and requires
  that every baked anchor is a node some `_$insert` call actually names. An anchor nothing
  inserts before is either an elision the compiler missed or a marker it emitted for
  nothing, and no count could tell the difference once anchors became optional.

  Against the DOM the bound is an EQUALITY, for every fixture. It used to degrade
  to "a module whose templates bake no anchor cannot produce one" whenever the
  emitted code could not be shown to clone each template once — which switched the
  per-frame check off for seven fixtures, including `component-boundary-props`, the
  one the exclusion was written for and one that bakes an anchor. `tracer.ts` now
  wraps `template` and records the node every clone returns (the Chrome
  differential does the same through a `@barqjs/core` shim), so the anchors a frame
  may hold are the anchors of the clones attached to it — exact for a component
  called twice, for a `For` cloning a row per item, and for a `Show` parking its
  body in a detached fragment.
- **attribute order** — every attribute in document order, compared against the ORACLE's
  order (which is source order) partitioned into the attributes the template bakes in and
  the props the patch code applies after the clone. A static that merely trails a dynamic
  one in source is not a divergence; emitting either group backwards is.

## The corpus by target

Every fixture that is the proof of an optimization target declares it. `optimality.test.ts`
asserts the corpus covers targets 1-7 and 9 before the passes land, so "the milestone is
done" is a fact about the corpus rather than about whichever fixture got looked at.

| target | fixtures | the claim |
| --- | --- | --- |
| 1 semantic reactivity | `static-only`, `static-attribute-expression`, `auto-thunked-read`, `inert-member-reads`, `signal-alias`, `signal-methods-in-handler`, `use-store-member`, `component-getter-props`, `live-call-hole` | a provably-static expression gets no effect, no thunk, no closure — and the same identifier can be reactive as a call and inert as a member |
| 2 static subtree | `static-only`, `void-elements`, `whitespace-only`, `svg-nested-in-html`, `fragment-root`, `select-option-multiple` | one clone, zero patch calls, zero effects — including one template per root where a fragment cannot be one |
| 3 constant folding | `literal-class-style`, `escaped-text-and-attribute`, `dom-prop-static-value`, `reassigned-binding` | the concat, the ternary, the style string and a constant TEXT child are baked into the template HTML, escaped; a `DOM_PROPS` name is refused however constant it is; and a binding that is WRITTEN to is not a constant however literal its initialiser looks |
| 4 one effect per element | `multi-prop-one-element`, `class-with-live-siblings`, `reactive-attribute`, `sibling-live-props` | live props on one element share one effect; a runtime-diffed prop (`class`) never joins it; and the group never crosses to the next element |
| 5 walk elision | `sibling-walk`, `deep-walk`, `walk-from-the-back` | the cheapest route to each hole: chained from the previous hole, reached from `lastChild`, and minimal where a `firstChild` chain already is |
| 6 template dedup | `dedup-identical-markup`, `two-components-two-templates` | two components emitting byte-identical markup share one `template()`, and two differing by one byte do not |
| 7 delegated events | `delegated-event`, `non-delegated-event`, `handler-closure`, `handler-no-closure`, `handler-by-reference`, `delegated-handler-tuple` | `$$click` expando writes, one `delegateEvents` per module, closure-free handlers hoisted, and a handler bound to a *variable* at either scope |
| 8 thunk elision | `control-flow-show-static-body`, `control-flow-for-static-body`, `control-flow-nested` | a static `Show` body is passed as a built node; a `For` ROW body keeps its thunk however static it is, because `For` calls it per row; a body with a hole keeps it too |
| 9 marker elision | `text-hole-trailing`, `text-hole-followed`, `text-hole-fused`, `text-hole-adjacent`, `marker-literal-text`, `hole-then-element-sibling`, `two-nested-holes` | no anchor when nothing follows, no anchor when what follows is an element, an anchor only where the text either side would fuse, and ONE anchor for two adjacent holes |
| 8 thunk elision (cont.) | `control-flow-reveal`, `control-flow-show-eager-children`, `control-flow-show-fragment-body`, `portal`, `dynamic`, `for-unkeyed-rows`, `switch-match-component-bodies`, `flow-prop-eta-boundary` | an eager body is handed over as built nodes; `Match` stays a real call; and η-reduction fires on the five props the runtime unwraps and on NOTHING else |
| 9 marker elision (cont.) | `logical-and-child`, `component-child-of-element` | a short-circuit hole and a component hole both take the following ELEMENT as their anchor |
| 10 SSR | `static-only`, `html-entities`, `escaping-adversarial` | escaped static chunks, one concatenation, and every escaping context compared against the DOM the runtime would have built |
| 11 throughput | the whole corpus | under 1 ms per file, measured on output that really was compiled |

## The shape catalogue

`packages/compiler` used to hold a Babel plugin. Its expected OUTPUT was never a
target — but its 55 test cases were a catalogue of the JSX SHAPES a compiler for
this runtime has to handle, and DESIGN §10 named mining them as M5's deliverable
and as the evidence for deleting the plugin in M6.

Every one of those shapes is a fixture here, judged by the oracle comparison
rather than by a string match against what Babel used to print. **This corpus is
now the only record of them** — the plugin and its tests were deleted at M6, so a
shape that leaves this directory leaves the project. The rows worth knowing about
are:

- **the P0 return-shape table** — `use-state-tuple` (`[accessor, setter]`),
  `use-store-member` (proxy, member reads), `use-memo-derived` (`Computed`),
  `create-async-value` (behind a call), `create-optimistic-signal` (a `Signal`,
  not a tuple), `create-projection-store` (the proxy directly). Each primitive
  returns a different shape and every one of them is a different lifting rule.
- **resolution by SymbolId, never by name** — `renamed-core-import` imports
  `signal as sig`, `Show as When` and `For as Each`, so nothing in the module is
  spelled the way a regex would look for it; `signal-alias` puts a reactive and
  a non-reactive `const` side by side in one scope.
- **props, every shape** — `component-boundary-props` (plain),
  `props-destructured-param`, `props-destructured-body`,
  `props-renamed-and-defaulted`, `props-rest-spread`, `component-spread`,
  `component-getter-props`. Flattening a getter is the failure mode, and each
  shape flattens at a different moment.
- **all fourteen flow components** — `For`, `Index`, `Repeat`, `Show`, `Switch`,
  `Match`, `Loading`, `Errored`, `Reveal`, `Suspense`, `Await`, `Portal`,
  `Dynamic`, `ErrorBoundary`, plus `control-flow-nested`, `for-unkeyed-rows`
  (which delegates to `Index` and INVERTS the row contract) and
  `for-each-local-function`.
- **splice sites and roots** — `arrow-body-component` (a concise arrow body),
  `fragment-root` (multi-root), `component-child-of-element`.
- **the two shapes the catalogue was missing** — `component-children-slot`, a
  user-defined component with JSX CHILDREN between static siblings (every other
  `children` in the corpus belongs to a FLOW component, whose children the
  runtime calls itself); and `logical-and-child`, the short-circuit conditional
  `{cond && <jsx/>}` with its `||` and `??` siblings (`conditional-children` is
  a ternary, which always yields one of two branches, where a short-circuit
  yields the falsy OPERAND — `false`, `""`, `0`, `null` — and every one of them
  has to render as nothing while `0` still renders as itself when it is the
  value rather than the guard).
- **the two refusals nothing reached** — `component-forwarded-handler-tuple`
  makes `getter_shaped`'s refusal branch reachable (a prop that is both
  `React::Reactive` and function-shaped, which needs two props reads inside one
  array or one conditional), and `flow-prop-eta-boundary` carries the
  η-reduction whitelist from both sides in one module. Widening either was a
  fully green mutation across the whole corpus before they existed.

## `ssrDiffers` — markup the string backend is REQUIRED to lose

DESIGN §5's opcode table drops `Delegate`, `Listen` and `Ref` on the SSR target:
a handler and a ref resolve to a NODE, and there are no nodes on the wire. A
fixture whose DOM render differs from its string render only BECAUSE one of them
ran declares it:

```ts
export const ssrDiffers = {
  markup: '<div><div class="boxed">target</div><span>callback</span></div>',
  why: "a ref callback is a client-only effect; §5 drops the Ref opcode",
}
```

Same contract as a `win`: `ssr.test.ts` fails if the SSR markup is not `markup`
byte for byte, fails as **stale** if the two paths stopped differing, and fails
if the fixture binds none of the three dropped opcodes — so it cannot become a
way to sign off on an ordinary bug. `ref-binding` is the only one.

## The SSR conformance suite

`ssr.test.ts` renders every fixture three ways and diffs the markup:

1. `renderToString` over the un-compiled `createElement` tree — the ORACLE.
2. `renderToString` over the compiled DOM module. Same serialiser, so a
   divergence is the compiler's template BYTES disagreeing with the runtime's
   node building. `oracle.test.ts` cannot see this: it compares parsed trees, and
   `&amp;` and `&` parse the same.
3. The compiled SSR module's own string.

Whether (3) runs is **detected**, and the detection is three-valued: `live`,
`absent`, `broken`. Existence is read off `index.d.ts` (napi generates it from
the Rust option struct, so there is nothing to forget to flip); whether it WORKS
is asked separately, by compiling a probe and comparing it against a plain
compile of the same source. No option is `absent` and the suite says so. An
option that throws, or that emits the same module with and without it, is
`broken` — a hard failure, never a skip. Two-valued detection was fail-open in
both directions: a mutant that panicked the SSR compile on 106 of 117 fixtures
turned every claim below into a silent pass, and a build that IGNORED `ssr: true`
compared DOM against DOM and called it a string-backend differential.

Beside the corpus runs an escaping matrix, seven contexts by fifteen values, each
cell asserted as a ROUND TRIP — parse the markup back and the value is still the
value. Not "the output contains `&lt;`", which is a claim about which escaper was
chosen; this is a claim about what a browser will do with the bytes, and it is
the only one an XSS cannot satisfy. The contexts do not agree on what needs
escaping (`<` is legal inside a quoted attribute value and fatal in text), so
each is asked the question that is dangerous for it.

## `semantics/` — the L1 fixtures, which are expected to FAIL

Everything above this line is judged by comparing two implementations. The corpus
missed the Provider defect for four years because both of them fail it identically:
the `createElement` oracle evaluates `children` at the call site exactly the way the
compiled path does, so `compareToOracle` certified the bug. Worse, the style rule
this file states — explicit-thunk children, `{() => <Badge />}` — **is** the
hand-written workaround for that defect, so no fixture written to this README's
convention can reach it. `context-provider.tsx` is written that way and passes.

`fixtures/semantics/` asks the other question: does the observed behaviour match
what `SEMANTICS.md` says it MUST be, with no second implementation involved. Those
fixtures are written in the direct form on purpose, and they export claims rather
than DOM:

```ts
export const rules: string[]      // rule IDs from SEMANTICS.md this fixture pins
export const claims: Claim[]      // one falsification procedure each, carrying its rule
```

They are out of `listFixtures()`'s reach, for the same reason `browser-only/` is:
`oracle.test.ts` compares two implementations that are both wrong here, and
`ssr.test.ts` asks for markup from a fixture whose point is that it throws. Keeping
them separate is what lets M0 add eight fixtures without moving a single existing
number.

Most of their claims **fail**, and that is the intended state — a fixture here that
passes means the oracle cannot see the defect it was written for. Which failures are
acceptable is decided by `test/known-failures.ts` alone: a registered claim that
starts passing is reported as stale, an unregistered failure fails the suite, and a
registered failure whose message does not name its rule fails the suite as the wrong
reason. Every fixture also carries at least one CONTROL claim in the explicit-thunk
form, which passes; without it a failure is evidence that something is broken but not
evidence about what.

## `browser-only/`

Fixtures a FAKE DOM cannot judge. happy-dom does not implement HTML
tree construction faithfully — the "ignore one U+000A after `<pre>`" rule among
others — so a fixture that depends on one would report a divergence against the
oracle for a rule the fake parser simply does not have, and the initial-render
invariant admits no exception.

They are not parked and not skipped. `browser-differential.ts` runs them beside
the whole corpus in Chrome, against the same `createElement` oracle, with no
exception of any kind, and `browser-parse-check.ts` parses their templates too.
A real browser is the only oracle that can judge them, so it is the only one
that does. `listFixtures()` does not see them, which is what keeps the
happy-dom suite honest about what it can and cannot measure.
