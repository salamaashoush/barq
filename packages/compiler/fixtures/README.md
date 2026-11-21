# Fixture corpus

Every `*.tsx` here is a real, compilable module with these exports:

```ts
export default function Fixture(): JSXElement                 // required
export const steps: Array<() => void>                         // optional, default []
export const events: Array<(root: HTMLElement) => void>       // optional, default []
export const optimality: OptimalityExpectation                // optional
export const ssrDiffers: SsrDivergence                        // optional
```

`steps` drives UPDATE correctness: the harness renders once, then applies each step
and re-snapshots the DOM. Signals therefore live at module scope so a step can write
them; each render gets its own module instance, so there is no cross-render bleed.

`events` drives EVENT correctness, and it is the only thing that can see a handler at
all: a signal write reaches the DOM whether or not `onClick` was ever bound. Each entry
gets the render container and dispatches a real DOM event (`.click()`,
`dispatchEvent(new Event("mouseenter"))`); the harness snapshots after each one. The
container stays attached to `document.body` throughout, because delegated handlers only
fire once the event reaches `document`.

Both exports must actually change the DOM. `oracle.test.ts` fails a fixture whose steps
or events are inert, so a fixture cannot quietly stop testing anything.

## What holds a fixture

There is **nothing for a fixture to declare its way out of**. Every check is absolute
rather than a comparison against a second implementation:

- **Rendered DOM**: every frame, and every element's attribute line, recorded per
  fixture in `__snapshots__/oracle.test.ts.snap`. A change to what the compiler renders
  is a diff to read, not an agreement between two builds that moved together.
- **Effect counts**: `test/effect-counts.test.ts`, one row per fixture: creations, total
  runs, and the busiest single effect, each an **equality**. A one-sided bound would read
  a binding that silently went missing as a win; an equality catches both directions.
- **Marker layout and the attribute partition**: self-checks in `harness.ts
  auditCompiled`. Both sides come off the emitted module and the clones it produced.
- **`-O0` vs `-Ox` vs `interp`**: the differential, in `optimisation.test.ts` and
  `interp.test.ts`.

Fixtures are written in **explicit-thunk style** (`{() => count()}`,
`when={() => flag()}`). A fixture that means to exercise auto-thunking writes
`{count()}` instead; it needs no declaration, because the effect row for it is simply one
higher and a hole that stopped going live moves that number.

`ssrDiffers` is the one declaration left, and it is not an exemption from a reference: it
names markup the string backend is **required** to differ on, because DESIGN §5 drops
`Delegate`, `Listen`, `SetEvent` and `Ref` and a handler cannot exist on the wire. `ssr.test.ts`
fails if the markup is not the declared bytes, and fails as stale if the two backends
stop differing.

## `optimality`: what the compiler must eventually make of this fixture

`steps` and `events` are about behaviour. `optimality` is the other half: the claim that
the emitted code is *good*, stated next to the JSX it is a claim about.

```ts
export const optimality = {
  target: 3,          // which optimization target this fixture proves (see "The corpus by target")
  effects: 0,         // effects the compiled render must create
  templates: 1,       // _$template() calls
  patchCalls: 0,      // _$insert, channel writes on an element, _$bindProp, _$ref, _$listen,
                      // _$bindEvent and _$bindValue calls
  emits: ['class="btn btn--primary"'],
  absent: ["${base}"],
  ordered: [["hoisted handler", "function Component"]] as Array<[string, string]>,
}
```

`optimality.test.ts` asserts every declaration in the corpus; none is pending. A claim the
compiler does not meet yet is a failing test, not a skipped one. Every field is optional
except `target`. `patchCalls` counts every call the module makes after the clone: `_$insert`
holes, the resolved channel writes (`_$setAttr`, `_$setDomProp`, `_$setLive`, `_$setClass`,
`_$setStyle`, `_$setHtml`) whose first argument is an element binding, `_$bindProp`, and the
element channels with entry points of their own (`_$ref`, `_$listen`, `_$bindEvent`,
`_$bindValue`). A control-flow region is not a patch call: its primitive is handed the
`(parent, anchor)` pair and does the joining itself.

The declaration is source like any other and reaches the emitted module, so code-level
assertions compile the fixture through `compileFixtureBody`, which strips it first.
Otherwise `absent: ["=>"]` would satisfy a search for `=>`.

## The channels the DOM diff throws away

`normalize.ts` sorts attributes and drops empty comments, and neither rule can be
weakened without failing every legitimate output. Both are recovered on side channels
that `auditCompiled` and the per-fixture golden assert separately:

- **anchors**: every `<!---->` in place, with no text fused across one, snapshotted per
  fixture under `test/__snapshots__/oracle.test.ts.snap`. This is the behavioural test for
  target 9 (marker elision): every anchor the pass removes shows up as a line in that
  diff. Text that happens to *read* `<!---->` is escaped on this channel, and the count is
  taken off the nodes (`DomChannels.anchors`), so content can never be mistaken for
  structure (see `marker-literal-text.tsx`).

  The count is bounded independently against the emitted code, and since elision landed
  the bound is *structural* rather than numeric: `auditAnchors` parses each emitted
  template, resolves every `const _elN = _elM.firstChild…` walk against it, and requires
  that every baked anchor is a node some `_$insert` call actually names. An anchor nothing
  inserts before is either an elision the compiler missed or a marker it emitted for
  nothing, and no count could tell the difference once anchors became optional.

  Against the DOM the bound is an EQUALITY, for every fixture. `tracer.ts` wraps
  `template` and records the node every clone returns, and the Chrome differential
  does the same through a `@barqjs/web` shim. So the anchors a frame may hold are
  the anchors of the clones attached to it, which is exact for a component called
  twice, for a `For` cloning a row per item, and for a `Show` parking its body in a
  detached fragment.
- **attribute order**: every attribute in document order, compared against source
  order, partitioned into the attributes the template bakes in and
  the props the patch code applies after the clone. A static that merely trails a dynamic
  one in source is not a divergence; emitting either group backwards is.

## The corpus by target

Every fixture that is the proof of an optimization target declares it, and
`optimality.test.ts` asserts each declaration.

- **1 semantic reactivity**: `static-only`, `static-attribute-expression`, `auto-thunked-read`, `inert-member-reads`, `signal-alias`, `signal-methods-in-handler`, `store-member`, `component-getter-props`, `live-call-hole`. A provably-static expression gets no effect, no thunk, no closure, and the same identifier can be reactive as a call and inert as a member.
- **2 static subtree**: `static-only`, `void-elements`, `whitespace-only`, `svg-nested-in-html`, `fragment-root`, `select-option-multiple`. One clone, zero patch calls, zero effects, including one template per root where a fragment cannot be one.
- **3 constant folding**: `literal-class-style`, `escaped-text-and-attribute`, `dom-prop-static-value`, `reassigned-binding`. The concat, the ternary, the style string and a constant TEXT child are baked into the template HTML, escaped; a `DOM_PROPS` name is refused however constant it is; and a binding that is WRITTEN to is not a constant however literal its initialiser looks.
- **4 one effect per template**: `multi-prop-one-element`, `class-with-live-siblings`, `reactive-attribute`, `sibling-live-props`. Every live prop of a template shares one effect, `class` among them, across elements; each field is compared before it is written.
- **5 walk elision**: `sibling-walk`, `deep-walk`, `walk-from-the-back`. The cheapest route to each hole: chained from the previous hole, reached from `lastChild`, and minimal where a `firstChild` chain already is.
- **6 template dedup**: `dedup-identical-markup`, `two-components-two-templates`. Two components emitting byte-identical markup share one `template()`, and two differing by one byte do not.
- **7 delegated events**: `delegated-event`, `non-delegated-event`, `handler-closure`, `handler-no-closure`, `handler-by-reference`, `delegated-handler-tuple`. `__bq_click` expando writes, one `delegateEvents` per module, closure-free handlers hoisted, and a handler bound to a *variable* at either scope.
- **8 thunk elision**: `control-flow-show-static-body`, `control-flow-for-static-body`, `control-flow-nested`. Each construct is a region, so its `insert` is gone. A static `Show` body costs one template and no patch call, cloned inside the Block the `branch` invokes; a `For` ROW body stays a Block however static it is, because `each` calls it per row, with one shared template cloned per row; a body with a hole keeps that hole's patch.
- **9 marker elision**: `text-hole-trailing`, `text-hole-followed`, `text-hole-fused`, `text-hole-adjacent`, `marker-literal-text`, `hole-then-element-sibling`, `two-nested-holes`. No anchor when nothing follows, no anchor when what follows is an element, an anchor only where the text either side would fuse, and ONE anchor for two adjacent holes.
- **8 thunk elision (cont.)**: `control-flow-reveal`, `control-flow-show-eager-children`, `control-flow-show-fragment-body`, `portal`, `dynamic`, `for-unkeyed-rows`, `switch-match-component-bodies`, `flow-prop-eta-boundary`. A body the author wrote without a thunk gets no closure of the compiler's own, only the single clone inside the Block the primitive invokes; a `Switch` over literal `<Match>` arms collapses into ONE `branch` on an integer key; and η-reduction applies to every zero-arity Cell, visible in the primitives' argument lists.
- **9 marker elision (cont.)**: `logical-and-child`, `component-child-of-element`. A short-circuit hole and a component hole both take the following ELEMENT as their anchor.
- **10 SSR**: `static-only`, `html-entities`, `escaping-adversarial`. Escaped static chunks, one concatenation, and every escaping context compared against the DOM the runtime would have built.
- **11 throughput**: the whole corpus. Under 1 ms per file, measured on output that really was compiled.

## The shape catalogue

The corpus is the catalogue of the JSX SHAPES a compiler for this runtime has to
handle, including every case of the Babel plugin `packages/compiler` once held.
Each shape is judged by the rendered DOM rather than by a string match against
some printer's output. **This corpus is the only record of them**, so a shape that
leaves this directory leaves the project. The rows worth knowing about are:

- **the P0 return-shape table**: `signal-object` (the `[read, write]` pair `createSignal` returns),
  `store-member` (proxy, member reads), `computed-derived` (a memo, which is an accessor),
  `async-value` (behind a call), `optimistic-signal` (`createOptimistic`, a pair
  again), `projection-store` (the proxy directly). Each primitive
  returns a different shape and every one of them is a different lifting rule.
- **resolution by SymbolId, never by name**: `renamed-core-import` imports
  `createSignal as sig`, `Show as When` and `For as Each`, so nothing in the module is
  spelled the way a regex would look for it; `signal-alias` puts a reactive and
  a non-reactive `const` side by side in one scope.
- **props, every shape**: `component-boundary-props` (plain),
  `props-destructured-param`, `props-destructured-body`,
  `props-renamed-and-defaulted`, `props-rest-spread`, `component-spread`,
  `component-getter-props`. Props are Cells at run time and values in source, and
  the failure mode is a read spent once where it should stay live: each shape (a
  destructure, a default, a rest, a spread, a forward) is a different place the
  props pass has to keep it live.
- **every flow component** (`For`, `Repeat`, `Show`, `Switch`, `Match`,
  `Loading`, `Errored`, `Reveal`, `Portal`, `NoHydration`) and the `dynamic`
  factory, plus `control-flow-nested`, `for-unkeyed-rows` (`keyed={false}`,
  which INVERTS the row contract) and `for-each-local-function`.
  `control-flow-await-suspense` and `control-flow-error-boundary` keep the names
  of the 1.x spellings they were written for; both now use `Loading` and
  `Errored`, because Solid 2.0 has no `Suspense`, `Await` or `ErrorBoundary`.
- **splice sites and roots**: `arrow-body-component` (a concise arrow body),
  `fragment-root` (multi-root), `component-child-of-element`.
- **the two shapes the catalogue was missing**: `component-children-slot`, a
  user-defined component with JSX CHILDREN between static siblings. Every other
  `children` in the corpus belongs to a FLOW component, whose children the
  runtime calls itself. And `logical-and-child`, the short-circuit conditional
  `{cond && <jsx/>}` with its `||` and `??` siblings. `conditional-children` is
  a ternary, which always yields one of two branches; a short-circuit yields the
  falsy OPERAND: `false`, `""`, `0` or `null`. Every one of them has to render as
  nothing, while `0` still renders as itself when it is the value rather than
  the guard.
- **two boundaries nothing else reaches**: `component-forwarded-handler-tuple`
  pins the identity of the two prop shapes where identity is observable — an
  array evaluated once into `_$cell` and an author-written zero-arity arrow
  forwarded as the Cell it already is, each read twice and compared — and
  `flow-prop-eta-boundary` carries η-reduction across three different flow
  primitives in one module, with the shapes it must not reduce beside them.

## `ssrDiffers`: markup the string backend is REQUIRED to lose

DESIGN §5's opcode table drops `Delegate`, `Listen`, `SetEvent` and `Ref` on the SSR
target: a handler and a ref resolve to a NODE, and there are no nodes on the wire. A
fixture whose DOM render differs from its string render only BECAUSE one of them
ran declares it:

```ts
export const ssrDiffers = {
  markup: '<div><div class="boxed">target</div><span>callback</span></div>',
  why: "a ref callback is a client-only effect; §5 drops the Ref opcode",
}
```

`ssr.test.ts` fails if the SSR markup is not `markup` byte for byte, fails as
**stale** if the two paths stopped differing, and fails if the emitted DOM module
binds no client-only channel (a `__bq_<type>` or `__bqs` expando, `_$ref`,
`_$listen`, `_$bindEvent` or `_$bindValue`), so it cannot become a way to sign
off on an ordinary bug. Three fixtures declare one: `ref-binding`,
`class-owns-only-its-tokens` and `attribute-namespaces` (where `prop:` writes a
property, which has no markup).

## The SSR conformance suite

`ssr.test.ts` renders every fixture two ways and diffs the markup:

1. The compiled DOM module, serialised by the runtime. Both backends share one
   front end and one IR and nothing else.
2. The compiled SSR module's own string.

Comparing bytes is what catches the compiler's template text disagreeing with
what the runtime builds. `oracle.test.ts` cannot see that: it compares parsed
trees, and `&amp;` and `&` parse the same.

Whether (2) runs is **detected**, and the detection is three-valued: `live`,
`absent`, `broken`. Existence is read off `index.d.ts` (napi generates it from
the Rust option struct, so there is nothing to forget to flip); whether it WORKS
is asked separately, by compiling a probe and comparing it against a plain
compile of the same source. No option is `absent` and the suite says so. An
option that throws, or that emits the same module with and without it, is
`broken`: a hard failure, never a skip. Two-valued detection is fail-open in
both directions: a build that panics the SSR compile turns every claim below into
a silent pass, and a build that IGNORES `ssr: true` compares DOM against DOM and
calls it a string-backend differential.

Beside the corpus runs an escaping matrix, nine contexts by sixteen values, each
cell asserted as a ROUND TRIP: parse the markup back and the value is still the
value. Not "the output contains `&lt;`", which is a claim about which escaper was
chosen; this is a claim about what a browser will do with the bytes, and it is
the only one an XSS cannot satisfy. The contexts do not agree on what needs
escaping (`<` is legal inside a quoted attribute value and fatal in text), so
each is asked the question that is dangerous for it.

## `semantics/`: claims against SEMANTICS.md

`fixtures/semantics/` asks whether the observed behaviour matches what
`SEMANTICS.md` says it MUST be, with no second implementation involved. The
explicit-thunk style above is the hand-written workaround for the Provider
defect, so these fixtures are written in the direct form on purpose, and they
export claims rather than DOM:

```ts
export const rules: string[]      // rule IDs from SEMANTICS.md this fixture pins
export const claims: Claim[]      // one falsification procedure each, carrying its rule
```

They are out of `listFixtures()`'s reach, for the same reason `browser-only/` is:
`oracle.test.ts` and `ssr.test.ts` judge rendered markup, and a claim fixture's
point can be that something throws. `semantics.test.ts` runs every claim and
fails on any that does not hold. Every fixture also carries at least one CONTROL
claim in the explicit-thunk form; without it a failure is evidence that something
is broken but not evidence about what.

## `browser-only/`

Fixtures a FAKE DOM cannot judge. happy-dom does not implement HTML
tree construction faithfully (the "ignore one U+000A after `<pre>`" rule among
others), so a fixture that depends on one would report a divergence against the
oracle for a rule the fake parser simply does not have, and the initial-render
invariant admits no exception.

They are not parked and not skipped. `browser-differential.ts` runs them beside
the whole corpus in Chrome, with no exception of any kind: it drives the compiled
module, checks the marker layout and the attribute partition against the real
parser, and diffs a deliberately corrupted run against the clean one.
`browser-parse-check.ts` parses their templates too.
A real browser is the only oracle that can judge them, so it is the only one
that does. `listFixtures()` does not see them, which is what keeps the
happy-dom suite honest about what it can and cannot measure.
