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
| 1 semantic reactivity | `static-only`, `static-attribute-expression`, `auto-thunked-read` | a provably-static expression gets no effect, no thunk, no closure |
| 2 static subtree | `static-only` | one clone, zero patch calls, zero effects |
| 3 constant folding | `literal-class-style` | the concat, the ternary and the style string are baked into the template HTML |
| 4 one effect per element | `multi-prop-one-element`, `class-with-live-siblings`, `reactive-attribute` | live props on one element share one effect; a runtime-diffed prop (`class`) never joins it |
| 5 walk elision | `sibling-walk`, `deep-walk`, `walk-from-the-back` | the cheapest route to each hole: chained from the previous hole, reached from `lastChild`, and minimal where a `firstChild` chain already is |
| 6 template dedup | `dedup-identical-markup` | two components emitting byte-identical markup share one `template()` |
| 7 delegated events | `delegated-event`, `non-delegated-event`, `handler-closure`, `handler-no-closure`, `handler-by-reference`, `delegated-handler-tuple` | `$$click` expando writes, one `delegateEvents` per module, closure-free handlers hoisted, and a handler bound to a *variable* at either scope |
| 8 thunk elision | `control-flow-show-static-body` | a static control-flow body is passed as a built node (M5) |
| 9 marker elision | `text-hole-trailing`, `text-hole-followed`, `text-hole-fused`, `text-hole-adjacent`, `marker-literal-text` | no anchor when nothing follows, no anchor when what follows is an element, an anchor only where the text either side would fuse |
| 10 SSR | `static-only`, `html-entities` | escaped static chunks, one concatenation (M6) |
| 11 throughput | the whole corpus | under 1 ms per file, measured on output that really was compiled |

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
