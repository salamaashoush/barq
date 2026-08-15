# CODESIGN — the compiler and the runtime, designed together

**Status.** This supersedes the earlier CODESIGN pass, whose framing ("the smallest change that does
the job", "most of this system is right", `signals.ts` declared out of scope) no longer matches the
directive. That document's *facts* were reliable — I re-verified every claim of it I depended on and
none failed — and a copy is preserved at
`/tmp/claude-1000/-home-sashoush-Workspace-barq/891b4642-1558-4131-a8ad-fe14d2cbba23/scratchpad/CODESIGN.prev-pass.md`
so nothing is lost. What changes is the conclusion: `packages/core`'s rendering layer is replaced,
not evolved, and `signals.ts` is opened.

Everything below that carries a number was measured on this machine in this session unless it is
labelled otherwise. Scripts are in the scratchpad directory named above.

---

## 0. What was measured before anything was decided

### 0.1 The bar, re-measured today

| | barq | Solid | ratio
| | barq | Solid | ratio |
| ----------------------------------------------------------- | ------------------- | ----------- |
 |
|---|---|---|---|
| reactivity head-to-head, 11 cases vs `@solidjs/signals` 2.0 | — | — | **10 wins / 1 tie**, up to 6.25x |
| SSR 100-row page, `renderToString` envelope (51×100) | 4.66 µs | 9.88 µs | **2.10x**, Wilcoxon p=2.6e-7 |
| *the same, re-measured at M5's repair round* | 4.87 µs | 9.10 µs | **1.86x**, p=7.3e-8 |
| SSR same page, barq forced onto the DOM fallback | 202.73 µs | — | **41.88x slower**, p=5.3e-10 |
| *the same deopt, re-measured at M6 before the change* | 191.61 µs | 5.25 µs | **36.10x slower**, p=5.3e-10 |
| *the same page and the same module, M6 after, two runs* | 4.35 / 4.51 µs | 4.69 / 4.90 µs | **1.07x / 1.09x FASTER** |
| *SSR 100-row envelope vs Solid, M6, two runs* | 4.55 / 4.62 µs | 10.57 / 10.46 µs | **2.35x / 2.30x** |
| compile throughput | 0.013–0.025 ms/file | budget 1 ms | ~40x headroom |

**The SSR ratio drifted and barq is not what moved.** Five runs at M5's repair round put the envelope
at 1.86–1.87x, outside the p25–p75 band of the recorded 2.10x. barq's own absolute time is 4.87 µs
against 4.66 µs recorded — inside its own run-to-run spread, which spans 4.62–4.99 µs across those
runs. Solid's is 9.10 µs against 9.88 µs, an 8% improvement, and `packages/benchmark` depends on
`solid-js@^1.9.3` while resolving 1.9.10. **A ratio against a floating dependency is not a bar anyone
can hold**, and §9.1's "hold ≥2.10x" cannot be met or missed on the evidence: it is not established
whether the drift is the patch bump, the machine, or something in the envelope. What IS established is
that barq's own number has not regressed. The fix is to pin the comparand and state the bar in absolute
microseconds beside the ratio; that is a decision for the next milestone and is recorded here rather
than absorbed.

The 41.88x number is the largest single number available in this system and it is triggered by one
import: `compile.rs:609` `uninlinable_flow` scans every symbol and drops the **entire module** to the
DOM backend if any of eight flow components is referenced. That is the cost of having a per-component
string implementation.

**M6 collected it and then removed it.** The row is now permanent in
`packages/benchmark/src/ssr-head-to-head.ts` rather than a one-off: the same 100-row page is rendered
from a plain module and from a module that also declares a `<Portal>` component, and the emitted
module is READ to decide which backend it reached (`_$html(` vs `_$template(`) so nobody has to keep a
boolean in step. Before: 36.10x. After: 1.07x faster, which is two rows measuring identical work.
The page's markup is asserted byte-identical between the two modules before either is timed, so the
comparison cannot drift into measuring two different pages.

### 0.2 Props carriers — the measurement that decides the props model

Node, min-of-9 over 3M iterations:

```
VALUE  props construct+read                      1.16 ns
GETTER props construct+read                    127.64 ns      110x
THUNK  props construct+read (hoisted constant)   1.83 ns
THUNK  props construct+read (fresh closure)      3.49 ns

VALUE  spread-forward then read                  6.56 ns
GETTER spread-forward then read                455.14 ns       69x
THUNK  spread-forward then read                  6.73 ns
```

And at component-instantiation scale (stub DOM, 200 rows, min-of-11):

```
A current: eager children, value props            9.328 us
G getter props (Solid's emitted shape)           81.283 us     8.7x
B thunk props + block children                   11.627 us
```

**A getter is not merely fragile under copying — it is 8.7x more expensive to allocate at the scale a
props object is allocated (once per component instance, i.e. once per list row).** Every one of the
three submitted designs rejected getters on the copy-flattening argument alone; the allocation number
is stronger and it is the one to quote. Copy-flattening is separately confirmed: `{...p}` over a
counting getter reports `reads-at-copy: 1, still a getter: false`.

### 0.3 The calling convention is NOT a performance decision

Stub DOM (isolates JS overhead from DOM cost), 200 rows, min-of-11. **The baseline row is included.**

```
A current: eager children, value props                   9.328 us      1.00x   (baseline)
B thunk props + block children, return-DOM              11.627 us      1.25x
C thunk props + block children, (parent, anchor)        11.711 us      1.26x
D + explicit scope argument (ownership-passing)         11.537 us      1.24x   ← the chosen convention
D2 + explicit scope arg, one Scope allocated PER ROW    12.989 us      1.39x
E compiler-inlined, no component frame at all            9.927 us      1.06x
```

Same six, through happy-dom (what `packages/benchmark` uses), 200 rows, min-of-9:

```
A current 535.64 us · B 527.92 · C 530.73 · D 516.21 · E 526.92
```

Four conclusions, two of which contradict submitted claims and one of which is against this document's
own chosen design:

1. **Return-DOM, append-to-anchor and scope-passing are within noise of each other.** Pick the
   convention on structural grounds. Nobody may claim a speed win for any of them.
2. **A Scope per position costs 7.3 ns.** (12.989 − 11.537, over 200.) Real but small; worth a
   `NO_SCOPE` flag, not worth a design.
3. **Component inlining is not worth 30–40% of mount.** It is 15% of *JS overhead* on a stub DOM and
   **0% on happy-dom** (526.92 vs 530.73 — noise). Anvil's headline optimisation does not survive
   contact with a DOM implementation. It goes to the backlog.
4. **The chosen convention costs 23.7% of JS overhead against what ships today** (11.537 vs 9.328 µs
   on the stub DOM). Independently reproduced at 1.16–1.24x. The B/C/D/E comparison above is a
   comparison *among candidates* and calling it noise is correct only within that set — it says
   nothing about the distance from A, and the earlier draft of this section omitted the A row, which
   is precisely the omission this document withdrew three rivals' claims for. **The convention still
   stands**, on two grounds and not on a third: it is the only design in which the Provider bug's fix
   is structural rather than conventional (§1, Correctness), and the overhead is **0% through a DOM**
   — D is in fact 3.6% *faster* than A on happy-dom (516.21 vs 535.64), which is where a real
   application lives. It does **not** stand on being free in JS, because it is not. The number is
   carried into §9.1 as an accepted, bounded regression with a real-browser re-measurement, because
   happy-dom has hidden four distinct bug classes on this project (§11 Q9) and a 0% happy-dom result
   is not sufficient evidence on its own.

### 0.4 `setProp` dispatch — the claim that did not reproduce

happy-dom, min-of-9 over 200k:

```
setProp(el,'id',v)      149.01 ns   vs  el.setAttribute('id',v)  149.11 ns    ( parity )
setProp(inp,'value',v)   36.81 ns   vs  inp.value = v             33.96 ns    ( +8% )
setProp(el,'class',v)   153.21 ns   vs  el.className = v         149.79 ns    ( +2% )
```

All three designs claim removing the dispatcher is worth 10–25% per write. **On this machine it is
0–8%.** The branch cascade is well predicted. Compile-time channel resolution stays in the design —
but justified on *capability* (custom elements, `bind:`, class bitmasks, and getting `class`/`style`
into the fused effect), never on speed. This is exactly the kind of unmeasured claim the directive
forbids.

### 0.5 Reactivity-core ablations (scratch copy of `signals.ts`, repo untouched)

min-of-15 over 4000 iterations, with correctness assertions on every variant:

| case | baseline | no epoch dedupe | no `markWave` |
|---|---|---|---|
|
| ---- | -------- | --------------- | ------------- |

|
| -------------------- | -------- | -------------------------- | ------------------- |
|
 100 writes + 1 flush | 225.9 ns | **536.1 ns (2.37x worse)** | 242.8 ns (7% worse) |
| 1 write + flush | 38.4 | 37.2 | 38.6 |
| diamond | 174.4 | 174.5 | 170.2 (2% better) |
| wide(10) | 444.2 | 455.8 | 473.8 (6.7% worse) |

- **The epoch write-dedupe (`signals.ts:1224`) is load-bearing and carries forward unchanged.**
  One `&&` is worth 2.37x on the case barq currently wins 3.21x; without it that win becomes ~1.35x.
- **`markWave` earns its keep, marginally**, contrary to all three submissions, which proposed
  deleting it pending re-justification. This is that justification: +7% on two of four cases, −2% on
  one. Keep, and re-measure after the Scope split.

### 0.6 Everything else the designs assert about this codebase, verified

Compiled against the checked-in `barq-compiler.linux-x64-gnu.node`, all with `warnings: []`:

```js
// <Ctx.Provider value={1}><Child/></Ctx.Provider>
(0, Ctx.Provider)({ value: 1, children: Child({}) })          // child runs at the CALL SITE
// <Errored fallback={…}><Boom/></Errored>
Errored({ fallback: (e) => _tmpl$2(), children: Boom({}) })   // throws before the boundary exists
// <b class={s()} id={s()} title={s()} />
_$setProp(_el$1, "class", s());                                // DEAD — one-shot
_$renderEffect((_p$ = {}) => { … id … title … });               // LIVE
// <div ref={el} />  where el is a `let`
_$setProp(_el$1, "ref", el);                                   // reads el, never writes it
// <button {...props} class={cls()} />
_$createElement("button", { ...props, class: cls() });         // off the template path entirely
// <table><tr><td>x</td></tr></table>
two templates + _$insert                                       // artefact of the createElement oracle
// <><b/>{s()}</>
_$createElement(_$Fragment, null, _tmpl$1(), s());             // Fragment drops the live hole
```

Runtime probe, happy-dom:

```
OWNER-AT-COMPONENT: null
CLEANUP-RAN: false     EFFECT runs before/after dispose: 1 → 2     (the graph survives unmount)
PROVIDER-EAGER: <span>THREW:ContextNotFoundError</span>
PROVIDER-LAZY:  <span>1</span>
FRAGMENT: "<b></b>txt5"  childNodes: 3          (5 children in — the accessor and the array vanish)
SPREAD reads: 1  still getter: false
```

Context provisioning, spread-copy vs prototype fork:

```
keys=  1   3.8 ns  vs   3.5 ns
keys= 10  72.6 ns  vs   6.8 ns
keys= 50  4219.9 ns vs  6.9 ns          611x
keys=200 19117.0 ns vs  6.8 ns         2811x
```

Ambient ownership vs explicit threading, depth 8:

```
explicit scope argument                    2.05 ns
ambient set/restore with try/finally      10.20 ns
```

Corpus: 120 fixtures in `fixtures/`, plus 1 `browser-only/` and the `semantics/` and `ownership/`
sub-corpora, which `listFixtures()` does not enumerate. Every count in this document is a reading of
the suite's own banners at the time it was written, and the banners are what to trust: at M0 this said
119 against an actual 117. **12 declare `wins`** (the compiled path is *more* correct than the oracle and
names the exact DOM it must produce) and **16 declare `goesLive`** (O4 slack). `packages/extra/src/router.tsx`
is 1958 lines with 90 `() =>` wrappers and the author's own comment at :1766 — *"Must use function
children so inner JSX is evaluated AFTER context is set"* — which is a hand-written statement of the
bug being fixed.

---

## 1. Scoring the three designs

Primary axis first, as instructed. Scores are against what a framework should be, never against how
close a design stays to what exists.

| | Uniform Deferral | Anvil | Arena (OPS)
| | Uniform Deferral | Anvil | Arena (OPS) |
| ---------------------------------- | ---------------- | ------- |
 |
|---|---|---|---|
| **Surface coverage** | 8 | **9** | 8.5 |
| Correctness (Provider + relatives) | 8 | 9 | **10** |
| Optimality | 8 | 7.5 | **8.5** |
| Simplicity of contract | **9** | 7 | 8.5 |
| Migration cost (lower is better) | **7** | 5.5 | 6 |
| Oracle | 7.5 | **9.5** | 8.5 |

**Surface coverage.** All three cover component invocation, props, children, control flow, events,
ownership, refs, errors, async, state, forms, styling, server, interop, routing and DX; all three
correctly declare CSS *authoring* out of scope rather than half-owning it. Anvil edges ahead on two
sections nobody else wrote: §19, an explicit list of what **cannot** move to compile time (cross-module
shapes, the dependency graph, list reconciliation, dynamic tags, user-mutable DOM state, async timing,
dynamic escaping, three parser facts, clone-vs-construct), and §20, what the un-compiled path becomes.
§19 is the thing that stops flag proliferation, which is Anvil's own named risk. Arena is the only one
that covers where a leak is **still** possible after the redesign (§I4) and the only one that routes
event-handler throws to a boundary. Deferral is the thinnest — its stores section admits the seam is
unworked, and transitions are named rather than specified.

**Correctness.** All three make the Provider bug unrepresentable, by three different mechanisms, and
they are not equally strong:

- Deferral emits `children: () => Child({})`. A thunk. *Anyone* holding it can invoke it, anywhere.
  The invariant "the provider is the one who calls it" is a convention about who holds the thunk.
- Anvil emits a block `(parent, anchor) => void` and lowers `Provider` to `pushCtx(…); kids(p,a); popCtx(…)`.
  Better — but `pushCtx` writes a module-global current scope, so the invariant is "the emitted
  bracketing is correct", i.e. a compiler-enforced convention. Anvil's own weakness list concedes this
  is the shape of Vapor's shipped double-insertion bug (vuejs/core#13203).
- Arena emits `_$provide($s, Ctx, v, ($c) => Child($c, {}))`. The child **cannot run** without a scope
  argument, and the only party holding `$c` is `provide`. Mistiming is a *missing argument* — visible
  in the emitted text and mechanically checkable.

That difference is the whole reason this redesign exists. A runtime convention is exactly what failed.

**Optimality.** All three preserve the reactivity core, which is where the head-to-head bar lives, and all three
delete the SSR fallback cliff (41.88x measured), which is the largest available win. Arena is the only
one that attacks the reactivity numbers themselves — splitting `Scope` off `ComputedNode` takes six
slots (`cleanups`, `children`, `disposed`, `dispose`, `_parent`, `_context`) off the hottest object in
the system. Anvil loses half a point for a headline optimisation (inlining, 30–40% of mount) that I
measured at 0% against a DOM. Deferral loses nothing but claims nothing new; its "thunks are cheaper
than values once forwarded" is parity in my measurement (6.73 vs 6.56 ns), not a win.

**Simplicity.** Deferral's "everything crossing a boundary is a nullary thunk" is the cleanest single
rule, and it pays off: `mergeProps` becomes `Object.assign`, `splitProps` becomes two object literals.
It is docked because it has a seam it names itself — a spread of a props object is fine-grained
per key while a spread of an opaque object is one reactive unit, and a user cannot tell which they
got. Arena is a hair behind on rule count and ahead on explanatory power: one field (`Scope`) answers
twelve questions. Anvil's three region primitives plus a six-bit flags integer plus an inline-budget
model is the most machinery.

**Migration.** All three are one breaking branch and all three correctly refuse a compat shim, for the
same reason: a shim that lifts value-props into lazy props reintroduces the two-implementations problem
that caused the bug. Deferral is smallest (props and children only). Arena adds a parameter to every
component signature — more invasive to hand-written code, though the compiler rewrites declarations.
Anvil is largest (inlining, an interpreter, an `-O0` axis, five new passes).

**Oracle.** Anvil wins clearly. All three correctly retire `createElement` as the reference and all
three reach for a written semantics plus an `-O0` differential. Anvil adds the piece that actually
dissolves the problem: a `Backend` trait over the IR with **three** implementations — `Dom`, `Ssr`,
`Interp` — where `Interp` is a small JS interpreter over the serialised IR. Because it consumes the
*same analysed IR* codegen consumes, it is structurally incapable of knowing less than the compiled
path, which is precisely the flaw that forced the 12 `wins` and 16 `goesLive` declarations now in the
corpus. Rust exhaustiveness makes a new `Op` a compile error in all three backends, so they cannot
drift. Arena's ownership trace is a genuinely novel channel no other project in the survey has — but
Arena concedes it "proves the tree, never the values". Deferral's is the weakest of the three,
essentially `-O0` plus conformance suites.

---

## 2. Verdict

**Arena (ownership-passing style) is the spine. Anvil's oracle and compile-time machinery and
Deferral's props laws are grafted onto it.**

The bug that prompted this work is an ownership-timing bug. Arena is the only design in which the fix
is structural rather than conventional, and the measurements say its extra parameter is free
(11.537 vs 11.627 vs 11.711 µs, all noise; ambient threading with `try/finally` is 5x *more*
expensive at depth 8 than passing the argument). It is also the only design that opens the reactivity
core, which the directive explicitly puts in scope.

### Grafted from Anvil

| Taken | Why |
|---|---|
|
| ----- | --- |

|
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|
 `Backend` trait over the IR; `Dom` / `Ssr` / `Interp` implementations | The oracle answer. A reference that is a projection of the same analysed IR can never be less informed than codegen, which kills the `wins`/`goesLive` exemption class at the root. |
| Mutation testing generalised: one operator per optimisation pass, kill rate reported | barq's `oracle.test.ts` self-checks are unique across a twelve-project survey. Generalising them is free leverage. |
| §19 verbatim in spirit — the written list of what cannot move to compile time | The only thing that stops flag proliferation, which is the named risk of every compiler-first design. |
| Compile-time diagnostic: keyless `each` whose row block contains stateful DOM | Only a compiler can see the row's markup. It covers the correctness half of the index-keying default that nothing else covers. |
| `prop:` / `attr:` / `bool:` / `on:` namespaces; the `bind:` family with DOM-compare for user-mutable properties | Closes the custom-element hole and the controlled-input divergence. |
| Feature-gated runtime chunks (Marko's `.feat` discipline) | An app that never renders a list should not ship LIS. |

### Grafted from Uniform Deferral

| Taken | Why |
|---|---|
|
| ----- | --- |

|
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|
 Laws 1–5 as the **props** contract (totality, purity-cheapness, neutrality, copy-transparency, boundary scope) | The clearest statement of why a value-carried deferral beats a descriptor-carried one, and it makes every props helper a one-liner. |
| The compute/apply split with a **compiler-allocated** flat record | Apply cannot subscribe (a whole bug class gone), apply is independently schedulable (transitions), and `class`/`style` join the record so `STATEFUL_DIFF` dies. |
| `_$k` constant tagging, module-level hoisting of constant thunks, universal η-reduction | Constant props cost zero per-instance allocation; η-reduction is sound because the ABI is total. |
| Claim-based hydration with branch-key comments | Mismatch with a local blast radius beats zero bytes with no detection. |

### Rejected, with reasons

| Rejected | Why
| Rejected | Why |
| ---------------------------------------------------------------------------- |
 |
|---|---|
| **Anvil's component inlining as a first-class optimisation** | Measured 0% on happy-dom, 15% of JS overhead on a stub DOM. Anvil's own weakness list calls it the riskiest transform in the design. Backlog, behind its own mutation operators. |
| **All three designs' "setProp dispatch is worth 10–25%"** | Measured 0–8%. The pass stays; the justification changes to capability. |
| **Deferral's return-View-only convention** | Arena's split is better: constructs whose content can change own a range and take `(parent, anchor)`; constructs built once return `Out`. Gets the SSR unification without a fragment allocation per multi-root level. |
| **All three designs' proposal to delete `markWave`** | Measured: it earns ~7% on two of four cases. Keep. |
| **Arena's unconditional move of `_affected`/`_snapshot` off the node shape** | `signals.ts:223-232` documents that the opposite tradeoff was made deliberately for the async fields. Gate it on measurement. |
| **A compiler rewrite of `props.x` → `props.x()`** | Fails the criterion all three designs cite: a transform is legitimate only if the untransformed code has the same semantics. Vue's two-year production experiment with implicit reads ended in removal. The cost stands, stated in §10. |

---

## 3. THE CONTRACT

### 3.0 Types — the whole compiler↔runtime surface

```ts
type Cell<T>  = (...ignored: never[]) => T                // deferred READ. No identity. Callable many
                                                          // times. ARITY-TOLERANT: ignores every arg.
type Block    = (s: Scope, ...args: Cell<unknown>[]) => Out  // deferred CONSTRUCTION under a supplied
                                                          // scope. `s` is NOT optional and has no
                                                          // ambient fallback.
type Out      = Node | Node[] | Cell<Out> | null          // DOM backend
type Out      = string                                    // SSR backend

type Slot<T>  = T extends Out ? Cell<T> | Block : Cell<T> // a renderable slot takes either; every
                                                          // other slot takes a Cell only
type Props<P> = { [K in keyof P]-?: Slot<P[K]> } & { $?: Source[] }        // the typed view (C4)
type Props    = { [k: string]: Cell<unknown> | Block } & { $?: Source[] }  // its erasure
type Component = (s: Scope, props: Props) => Out

interface Scope {
  parent:   Scope | null
  ctx:      object | null            // prototype-chained; SHARED by reference until a provide forks it
  cleanups: (() => void)[] | null    // lazily allocated
  kids:     Scope[] | null           // lazily allocated
  catcher:  Boundary | null          // nearest catching ancestor, copied at enter — O(1), never walked
  gen:      number                   // bumped on dispose; async continuations compare against it
  dead:     boolean
  origin?:  Address                  // DEV only: (module, unit, position) + component name
}
```

**`Cell` and `Block` have different calling conventions (`x()` vs `x($s)`) and a consumer holding an
opaque `props.children` cannot tell which it has.** Four rules reconcile them; `SEMANTICS.md` C3.6–C3.9
is the normative statement.

1. **A Cell ignores every argument.** The compiler only ever emits `() => expr`, forwards an existing
   Cell by name, or passes a signal getter — none declare a parameter — so `cell($s)` and `cell()` are
   the same call, for free. A hand-written "Cell" that declares a parameter or reads `arguments` is
   outside the ABI and is a DEV diagnostic.
2. **A Cell is therefore safe in a Block slot; a Block is not safe in a Cell slot.** The Block-slot
   consumer calls `x($c)` and a Cell degrades to `x()` yielding `T`, which the slot accepts iff `T` is
   `Out`. The Cell-slot consumer calls `x()` and a Block receives `s === undefined`. The asymmetry is
   the whole content of the rule.
3. **A Block invoked without a scope throws, and never falls back to `CURRENT`.** `ScopeMissingError`,
   carrying the Block's `origin`. A fallback to the ambient owner would reintroduce the Provider bug
   at the one place nobody would look for it. The compiler brands the Blocks that *use* their scope
   (`_$b`, once per definition site, zero per activation), so the check is a property test rather than
   an arity guess; a Block that ignores its scope — an arity-0 `template()`, C6 — is simultaneously a
   legal Cell and needs no brand.
4. **Kind travels with the value, not with the name.** Forwarding is identity (C5), so a forwarded
   Block is still a Block. The only way a Block reaches a Cell slot is a consumer reading a
   Block-carrying name with `()`, which is a type error when the prop is typed (`Slot<T>`) and rule 3
   at runtime when it is not.

Runtime primitives — this list is the entire thing the compiler may emit:

```
enter(parent) → Scope        exit(s)        dispose(s)        pin(s, block) → Block
mount(s, block, parent, anchor) → Range
branch(s, parent, anchor, key: Cell<K>, bodies: Block[], flags)
each(s, parent, anchor, src: Cell<T[]>, keyOf, row: Block, flags)
dyn(s, parent, anchor, cell: Cell<Out>)
provide(s, ctx, value: Cell<T>, block: Block) → Out
boundary(s, parent, anchor, kind, fallback: Block, block: Block, flags)
portal(s, target: Cell<Node>, block: Block)
props(sources: Source[]) → Props    cell(v: T) → Cell<T>

fx(compute: () => R, apply: (r: R, prev: R) => void)
template(html) → () => Node      child/next/nth      setText
setAttr / setProp / setBool / setClassBits / setStyleProp
delegate(el, type, handler, s)   listen(el, type, handler, opts, s)   ref(s, el, fn)
```
`cell(v)` is the carrier for a prop whose IDENTITY the consumer can observe — a parameterised handler,
an array, an object. It evaluates once and returns a stable `Cell`, which is what keeps
`props.onClick() === props.onClick()` true under C3.1's totality. A Cell built from an expression
(`() => expr`) is not memoised (C3.2); a Cell built from a value has nothing to memoise. Both are
Cells, and no consumer can tell which it holds — which is the point.


There is no second implementation of any of these. The non-compiled path **is** this primitive set —
Vapor's answer, and the right one, because having a second semantically-different implementation of
component invocation is the actual root cause of the Provider bug.

### 3.1 Ownership — the spine

**O1. The scope creation set is closed.** Scopes are created by exactly six things: `render`, a
`branch` instance, an `each` row, `provide`, `boundary`, `portal`. **A component call creates no
scope.** A component in a fine-grained system never re-runs, so its death is exactly its position's
death; a separate scope buys one allocation and one indirection and nothing else. Solid ships this in
production (`createComponent = untrack(() => Comp(props))`); Svelte allocates a context per component
and pays for it. Target: **zero Scope allocations attributable to components** per 1,000-component
mount.

**O2. A Block runs under the scope it is *given*, and it is given a fresh child of the scope of the
construct it is lexically written inside.** Ownership is dynamic (invocation-time), not lexical.
Escape hatch: `pin(s, block)` returns a Block that ignores its argument and uses `s`.

**O3. Disposal is total and ordered.** `dispose(s)`: mark dead, bump `gen`, dispose `kids` in reverse
creation order depth-first, run `cleanups` LIFO, abort the scope's `AbortSignal` (killing native
listeners and in-flight fetches), remove the DOM range. A cleanup that throws routes to `s.catcher`
and does not abort the rest. **Invariant: after `dispose()`, zero scheduled effects, zero registered
listeners, zero in-flight fetches, zero retained nodes for that subtree.** Checkable only because
ownership is total; today it is not checkable at all.

**O4. Ambient hygiene.** *(Revised. The original claimed "the only `try/finally` in the system is where
a `catch` was already required", which §7.1's own `provide` — `try { return block(c) } finally { exit(c) }`
— contradicts. The adversarial prototype needed that `finally`: without it a throw inside a Block
leaves `CURRENT` dangling until a catcher unwinds, and nothing specified which scope the catcher
restores to. The rule is weakened to what is true and the restoration target is specified.
`SEMANTICS.md` §2 O4 is the normative statement; this is the summary.)*

`CURRENT` exists only so user-written `onCleanup()` / `Ctx.use()` can find the owner without being
handed a scope.

- **O4.1 Restoration is required on both paths.** A construct that enters a scope and returns a value
  into the caller's expression — `provide`, `boundary`, `dyn`, any Block invocation whose result is
  consumed — has no opportunity other than a `finally`, so `try { … } finally { exit(c) }` is the
  conforming implementation for those. **§7.1's `provide` is correct as written.**
- **O4.2 The cost claim is what survives, not the syntactic claim.** At most one `try/finally` per
  *scope-entering primitive invocation*; **none** per component call and **none** per element, because
  neither creates a scope (O1). Measured: explicit threading 2.05 ns vs ambient set/restore with
  `finally` 10.20 ns at depth 8 — which is why ownership is *passed* explicitly and only *observed*
  ambiently.
- **O4.3 Which scope a catcher restores to.** Every construct with a `catch` captures
  `const prev = CURRENT` on the statement immediately before its `enter`, and its `catch` clause
  assigns `CURRENT = prev` as its first statement, before any user code — including the fallback —
  runs. `prev` is a local of the catching frame, so this needs no unwind stack and no chain walk. It
  is **not** `s.parent` and **not** `getOwner()` at catch time; both are wrong under `pin`.
- **O4.4 No partially constructed subtree survives a throw.** Every scope entered after `prev` and not
  yet exited is **disposed**, not abandoned: the catcher disposes the failed instance scope, which by
  O3 disposes its kids depth-first, runs their cleanups, aborts their signals and removes their range.
- **O4.5 `CURRENT` is never read to decide ownership.** A primitive that consults `CURRENT` where a
  `Scope` argument is in scope is a defect — it is the ambient-ownership shape this redesign exists to
  remove. This is the load-bearing half of O4; O4.1's `finally` is hygiene.

**O5. `render(block, container) → dispose`** takes a Block, opens a root scope, calls it, inserts,
flushes, and returns a disposer that disposes the scope **and** removes its range. Today `render`
takes an already-built element, opens no owner (`getOwner()` is `null` inside a component, verified)
and its disposer clears `textContent` while every effect keeps running (verified: an effect re-ran
after unmount). Every barq mount currently leaks its whole reactive graph. This is the framework's
spine and it is missing.

**O6. Owner and observer are separate ambients, and only the observer must be ambient.** `untrack`
changes the observer and never the owner. `enter`/`exit` change the owner and never the observer.
Conflating them is a bug source; separating them is free.

### 3.2 Components

**C1.** `Comp(s: Scope, props: Props) → Out`. Scope first. The compiler rewrites the declaration of
every function containing JSX in value position to this signature and every JSX use to this call.

**C2. Components are declared, not inferred.** A function containing JSX *is* a component and cannot
be called directly; doing so is a diagnostic naming the fix. This is a real language rule and it is
the price of having exactly one implementation of invocation.

**C3. Props are an object whose every member is a `Cell` or a `Block`, never a getter, plus an ordered
source list for spreads.**

```
<Foo {...a} b={x()} {...c} />   →   Foo($s, _$props([a, { b: () => x() }, c]))
```

`_$props` returns its single argument unchanged when the list is one plain record — the overwhelming
case pays nothing. Otherwise a Proxy walks the list backwards on read and unions `ownKeys`/`has`;
a Proxy over an existing `$` concatenates rather than nesting, so merged merges stay linear. Vue Vapor
(`RawProps.$`) and Solid 2 (`$SOURCES`) converged on this independently.

**Why a value and not a descriptor (Deferral's Laws, adopted):**

1. *Totality.* Every own property of a props object is a `Cell` or a `Block`. No exceptions —
   `children`, `onClick`, `each`, `value`, `key`.
2. *Purity-cheapness.* A compiler-emitted Cell is exactly `() => <the JSX expression>` and is **not**
   memoised. Calling it twice evaluates twice. Consumers that must not evaluate twice call once.
3. *Neutrality.* A Cell neither enters nor exits tracking; it inherits the caller's tracking state.
   This is what makes "read at the point of use" mean something: the *consumer's* effect subscribes.
4. *Copy-transparency.* Any operation that copies own enumerable properties preserves law 1 — a
   guarantee of the language, not of the runtime. So `mergeProps` becomes `Object.assign({}, ...)`,
   `splitProps` becomes two object literals, `omit` becomes a rest destructure, and **`{...props}` in
   user code becomes correct**. All six of barq's current helpers flatten getters (verified); all six
   become correct with their bodies untouched.
5. *Boundary scope.* Laws 1–4 govern values crossing a **component** boundary. Element attributes,
   template holes and static text are compiler-internal and lower to direct writes; no Cell is
   materialised for them.

**C4. Props are read by calling: `props.x()`.** No compiler rewrite of `props.x`. One rule — *a Cell
is called* — holds uniformly across props, context, rows, refs, resources and slot arguments. The
cost is stated in §10 and accepted. The type is

```ts
type Props<P> = { [K in keyof P]-?: Slot<P[K]> } & { $?: Source[] }
type Slot<T>  = T extends Out ? Cell<T> | Block : Cell<T>
```

which makes a forgotten `()` a **type error in value position**, not a silent copy — and which is the
*typed* view of §3.0's `Props = { [k: string]: Cell<unknown> | Block }` rather than a second claim
about it. (The earlier `Props<P> = { [K in keyof P]-?: Cell<P[K]> }` contradicted §3.0 outright: it
admitted no Blocks at all, so `children` was untypable. `Slot<T>` is the fix: a renderable slot takes
either kind, every other slot takes a Cell only, and a Block landing in a Cell slot is a type error at
the read site.)

**C5. Forwarding is free, depth-independent, and kind-preserving.** `<B x={props.x} />` emits
`B($s, { x: props.x })` — the *same* Cell, not a new closure. A getter cannot do this:
`get x() { return props.x }` allocates a new descriptor at every hop, so forwarding depth becomes
closure depth. Measured: thunk spread-forward 6.73 ns vs getter 455.14 ns.

Because forwarding is identity it cannot change a value's kind, so **a Block landing in a Cell slot**
arises exactly two ways and each has a defined outcome:

- **Within a module**, the compiler knows the forwarded value's kind and emits a diagnostic at the
  forwarding site when a scope-using Block is forwarded into a slot the callee declares as `Cell`,
  naming both positions.
- **Across a module boundary** the compiler cannot know (§3.13 item 1). The consumer's `props.x()`
  then hits §3.0 rule 3 and throws `ScopeMissingError` with the Block's origin and the consuming
  scope's origin chain. It never silently renders under `CURRENT` and never silently yields
  `undefined`.

η-reduction (`x={s()}` → `x: s`) is sound because a signal getter *is* a Cell and Cells are
arity-tolerant; it is **not** applied when the reduced expression is JSX, which lowers to a Block.

**C6. Children are Blocks; slots are Block-valued props.**

```jsx
<Panel header={<h1>t</h1>}><b>{x()}</b></Panel>
```
```js
Panel($s, {
  header: _tmpl$1,                                  // arity-0 template IS a legal Block. Zero allocation.
  children: ($c) => { const _n1 = _tmpl$2(); _$insert($c, _n1, x, null); return _n1; },
})
```

Three structural reasons a Block beats a getter, all visible in Svelte's output: a getter cannot
receive an anchor; a getter cannot take slot parameters; a getter can only be read, whereas a Block
may be rendered at several anchors or none. Slot parameters are extra `Cell` arguments.

**C7. A Block is called exactly once per live instance of its position.** Calling it twice builds
twice — correct, because DOM has identity. Every consumer is a primitive owning exactly one
compile-addressed slot; a second call at that slot is a DEV assertion failure. This is why Solid needs
`children()` (two lazy memos, because `Show` reads `props.children` at four syntactic sites) and this
design needs nothing.

**C8. Fragments are a compile-time multi-root unit, never a runtime component.** `Out` admits
`Node[]`. `Fragment` is deleted — today it silently drops function children and nested arrays
(verified: 5 children in, 3 nodes out, and the live hole renders nothing).

### 3.3 Context and DI

`provide(s, Ctx, value: Cell<T>, block: Block) → Out`. `Ctx.use() → Cell<T>`.

- **Storage is a prototype chain, forked lazily.** A scope shares its parent's `ctx` object by
  reference; `provide` does `s.ctx = Object.create(s.ctx); s.ctx[id] = cell`. Measured against the
  current `owner._context = {...owner._context, [k]: v}` at seven call sites: 6.9 ns vs 4219.9 ns at
  50 keys, 6.8 vs 19117.0 at 200.
- **Lookup is at read time, up the chain.** So a scope created *before* a provider installed still
  sees the value. That ordering is what `ErrorBoundary` gets wrong today (it builds children in a
  computed at `components.ts:942`, then installs `ERROR_BOUNDARY` at :985).
- **Cross-boundary reads follow the scope chain, not the DOM chain.** A portalled modal reads the
  provider it is *written* under.
- **Values are Cells**, so a provider whose value changes does not re-render its children; consumers
  see it live. No copy-based design can offer this.
- No default → `use()` throws carrying the consuming scope's `origin` chain, which is a component
  stack, free, because the scope chain *is* the logical tree.

### 3.4 Control flow — emitted JavaScript over three primitives

`Show`, `Switch`, `Match`, `Index`, `Repeat`, `Dynamic`, `Portal` **cease to exist as components**.
They are recognised by `SymbolId` resolved to the framework module — never by name, which is unsound
under shadowing — and lowered.

**`branch(s, parent, anchor, key: Cell<K>, bodies, flags)`.** The runtime never evaluates a
condition; the key expression is plain emitted JavaScript. `key` unchanged → **nothing happens** (no
teardown, no rebuild — the identity-gated re-render the router hand-rolls in ten lines at
`router.tsx:1576`). `key` changed → dispose the old instance scope, clear its range, `enter` a fresh
child scope, call `bodies[k]` under it, insert. One primitive serves `Show`, `Switch`/`Match`,
ternaries, `&&`, `Dynamic` (keyed on the component value), boundaries, and a router `Outlet`.

**`each(s, parent, anchor, src, keyOf, row, flags)`.** A row *is* a scope; row disposal is scope
disposal. The LIS move-minimisation in `map.ts:127-208` is retained wholesale — it is genuinely
independent of ownership.

**`dyn(s, parent, anchor, cell)`** — a hole whose value is arbitrary. `Portal` is `dyn` with the
insertion target elsewhere and a scope whose parent is the **lexical** parent.

**The keying contract, written down** (it is undefined at every level today, which is how `keyed={fn}`
came to be miscompiled while SSR modelled it correctly):

- Default identity is the **index**. Item-identity default means any immutable update recreates every
  row, silently destroying focus, `<video>` position and animation state; that failure is invisible
  and catastrophic. The index default's failure (a reorder re-renders more than needed) is visible and
  cheap. Opt in with `key={r => r.id}`.
- **Anvil's graft:** the compiler emits a diagnostic when a keyless `each`'s row Block contains
  stateful DOM (`input`, `textarea`, `select`, `video`, `audio`, `details`, `canvas`, custom
  elements). Only a compiler can see the row's markup. This covers the correctness half of the trade;
  the performance half (O(n) writes on a reorder) is documented, not covered.
- A row whose key is unchanged is **never** torn down: its scope, its nodes and their identity survive
  a move. Asserted metamorphically.
- Duplicate keys are a DEV error; the second occurrence is treated as index-keyed.

**Flags — the compiler ships proofs, the runtime has gated fast paths.** `STATIC_KEY` (key reads
nothing reactive → no effect, no branch record), `NO_SCOPE` (body registers nothing disposable → no
Scope; worth 7.3 ns/instance measured), `SINGLE_NODE`, `FAST_CLEAR` (`textContent = ""`),
`INDEX_UNUSED`, `KEEPALIVE`. **Discipline, enforced in review: a flag that moves neither an allocation
count nor a wall-clock number on a named benchmark is deleted, not kept.**

*M4 outcome, re-measured at M4b on the flags the COMPILER emits.* Two shipped and two were deleted
for failing the rule. Until M4b `bench:flags` called `branch(...)` by hand with the integer it wanted
to measure, which measures the runtime and says nothing about the compiler — and `STATIC_KEY` was in
exactly that position for a whole milestone, emittable, never emitted, and measured anyway. Each row
now names a corpus fixture, compiles it, asserts the emitted integer is the one the row claims, and
takes its pair by clearing ONE BIT in that integer. `STATIC_KEY` eliminates the region's
`renderEffect` outright (`control-flow-switch-static-key`, flags 1: 2.00 → 1.00 effect allocations
per mount, exact on every run) and `NO_SCOPE` eliminates the per-activation `Scope`
(`control-flow-show-static-body`, flags 2: 2.00 → 1.00 scope allocations per mount). Neither moves
the clock at a significance worth quoting — over four runs of 81 trials × 400 iterations the deltas
ranged +2.5% to +11.5% (p 1.8e-1 … 4.2e-1) and +3.9% to −1.2% (p 1.3e-1 … 7.0e-1) — so both survive
on the allocation counter alone, which is the reading M4 took for `NO_SCOPE` and the same one applies
here. `FAST_CLEAR` and `INDEX_UNUSED` moved
neither counter at 50 rows (p = 4.4e-1 and 5.8e-1) and are gone from the runtime; the discipline is
now machine-checked rather than "enforced in review" — `bench:flags` reads the flag declarations out
of `flow.ts` and throws if one has no row in its table. `SINGLE_NODE` was never written (the range is
tracked either way, so there was nothing to skip) and `KEEPALIVE` is transitions, which A5 leaves
unspecified.

**No marker comments in client rendering.** A range owner receives `(parent, anchor)` from the
compiler's own template walk; `anchor = null` means append. Two adjacent dynamic siblings share one
empty text node baked into the template — one byte, no comment node.

**Ambient insertion state is rejected.** Vapor shipped it, hit a `v-if`+component double-insertion
(vuejs/core#13203), partly reverted, and still carries defensive snapshot-and-reset in every block
constructor. A module global that must be consumed exactly once by a consumer nobody enumerated is the
same bug class this redesign exists to remove.

### 3.5 Elements, class and style

**There is no `setProp` dispatcher on the compiled path.** Every attribute resolves at compile time to
exactly one channel — `attr`, `attrNS`, `prop`, `bool`, `class`, `classBits`, `style`, `styleProp`,
`text`, `event`, `ref`, `bind` — from `NameFlags` plus the element type, with `prop:` / `attr:` /
`bool:` overrides. Justified on capability, not speed (§0.4).

**One fused effect per element, with a compiler-allocated flat record:**

```js
_$fx(() => ({ a: cls(), b: id(), c: w() }), (v, p) => {
  if (v.a !== p.a) _$setClassBits(_n1, v.a);
  if (v.b !== p.b) _n1.setAttribute("id", v.b);
  if (v.c !== p.c) _n1.style.width = v.c;
});
```

The apply phase runs untracked, so a DOM read there can never become a dependency. The previous-value
store is the compute's own return value — no runtime-allocated object, no per-element expando.
**Because the compiler owns the prev slot, `class`, `style` and `classList` join the record and the
entire `STATEFUL_DIFF` exclusion at `classify.rs:118` disappears** — with it the shipped bug where
`class={s()}` is a one-shot write on the same element where `id={s()}` is live, five hand-written
`class={() => c()}` workarounds in `extra` and `kitchen-sink`, and the guard the benchmark file
carries against the free win this would otherwise hand it.

Conditional classes lower to an integer: `class={{a: x(), b: y()}}` →
`setClassBits(el, (x()?1:0)|(y()?2:0), _NAMES, "base")`, early-returning on `bits === el.$cb`. Static
class fragments fold into the template string.

**`ref` is not a prop.** `<div ref={el}>` with a writable binding emits `el = _n1` (today it emits
`_$setProp(_el$1, "ref", el)`, which reads the variable and never writes it — verified). `ref={fn}`
emits `_$ref($s, _n1, fn)`, drained after insertion, children before parents, with a returned function
registered as a cleanup. `useRef()` and `{current}` are deleted.

### 3.6 Events

Resolved entirely at compile time into one of three emissions; no runtime name dispatch.

```
onClick={h}                → _n1.$$click = h            + module-level delegate([...]) of names USED
on:wheel.passive={h}       → _n1.addEventListener("wheel", h, _OPTS3)   // hoisted options
on:click={cell}            → _n1.$$click = (e) => cell()(e)             // explicit reactive handler
on:my-event={h}            → verbatim name, no lowercasing
```

- Every listener registers a cleanup on the scope, so a listener dies with its position. This is the
  cleanest ownership dividend in the design: removal costs zero bookkeeping and cannot be forgotten.
  Today only `spread` removes listeners.
- The delegated set is compiler-driven — exactly the names this module used, not a fixed 23-name
  table.
- **The delegated dispatcher stores the owning scope alongside the handler and routes a throw to
  `scope.catcher`.** Today a handler exception escapes to `window.onerror` with no framework
  involvement (`dom.ts:169-200`, no `try`). A handler is code the framework invoked; the framework
  owns its failure.
- Handler identity is bound once by default. `on:click={cell}` is the explicit live form. What is not
  defensible is the current state, where a handler silently differs from every other prop on the same
  element.

### 3.7 Errors

Every entry into user code goes through a scope, and every scope knows its catcher in O(1)
(`s.catcher` copied at `enter`). Routed entry points: Block invocation, component body, computed
evaluation, effect body, cleanup, **event handler**, ref callback, async continuation.

A boundary is a `branch` on `{content | fallback}` plus a `try`. Construction throws land in the try
because the child is a Block called *inside* it. `reset()` bumps the key — recovery is a branch flip,
uniform with everything else. `NotReadyError` is re-thrown, never captured as an error (the check
`ErrorBoundary` lacks today). In DEV, `enter` stamps `s.origin` with `(module, unit, position, name)`
and an error carries the scope chain as a component stack — free, because the scope chain is the
logical tree.

### 3.8 Async

One system. `resource(sourceCell, fetcher)` returns a `Cell<T>` backed by a memo that throws
`NotReady` before settlement.

- **Cancellation is structural.** The `AbortController` is a cleanup on the scope that created the
  resource; dispose aborts, re-run aborts the previous, and the signal is actually passed to the
  fetcher (today it is created and never handed over).
- **Staleness by `s.gen` captured at call time.** Today the abort guard reads a mutable outer
  variable that by then points at the newest controller, so a slow first response overwrites a fresh
  second one.
- `Loading` is a boundary with `KEEPALIVE`: the content instance is **parked**, not disposed — its
  scope stays alive, its DOM moves to a detached fragment, its effects suspend. Focus, scroll and
  playback survive a suspense flip.
- `transition(fn)` creates a pending scope beside the live one. A branch that would swap instead
  builds under the pending scope, holds it detached until every resource registered there settles,
  then commits. Only expressible because an instance *is* a scope with a settle set. Measurable: a
  `MutationObserver` sees zero mutations before commit.
- **Optimistic state is derived, never restored:** `() => reduce(base(), pending())`. Today
  `registerRevert` captures `revertTo` once per (target, action), so a real write landing during the
  action is rolled back to a value that is now wrong, and `createOptimisticStore` `structuredClone`s
  the whole store to do it. With no snapshot there is nothing to clobber.
- Deleted: `Suspense` (two `queueMicrotask`s that subscribe to nothing and flip regardless), `Await`,
  `createResource`, `suspend`, `awaitAll`.

### 3.9 State

`signal`, `computed`, `effect`, `batch`, `untrack`, `store` (deep), `produce`, `reconcile` retained in
kind. A signal getter **is** a Cell, with `.set`/`.peek`/`.update` on the function object — so a
signal is passable as a prop with zero adaptation and η-reduction (`x={s()}` → `x: s`) is sound by
construction. `useState`'s degraded getter (`hooks.ts:11-22` returns a bare `() => s()`, dropping all
three) is deleted.

**New: `linked(source, compute, {equal})`** — writable derived state that re-seeds when its source
changes. One primitive covering three problems the ergonomics work identified separately: the
read-copy trap (`useState(props.value)` freezing at the first value), controlled inputs, and two-way
component props. Angular's `linkedSignal` is the shipped precedent.

**Reactivity is entered** only inside `fx` / `effect` / `computed` / the internal compute of
`branch`/`each`. **Exited** by `untrack`, `peek`, and structurally by the apply phase of every element
effect and by component bodies running untracked.

### 3.10 Forms and binding

`bind:value`, `bind:checked`, `bind:group`, `bind:files`, `bind:open`, `bind:this` are compiler
syntax. Three things no runtime-only design can do:

1. **Compare against the element, not against the last framework write**, for the user-mutable set
   (`value`, `checked`, `selected`, `scrollTop/Left`, `open`, `currentTime`, `volume`, contenteditable
   text). Today `applyResolvedProp` short-circuits on `value === prev` where `prev` is what the
   *framework* wrote, so a handler that **rejects** a keystroke leaves the DOM permanently diverged
   from the signal — the defining case controlled inputs exist for. The compiler knows the tag and the
   channel, so it emits the DOM-compare form only where it is needed and the cheap cached compare
   everywhere else.
2. **Preserve selection**: save/restore `selectionStart/End/direction` around a write to a focused
   text input. Emitted only where a `value` binding on a text input exists; zero cost elsewhere.
3. **Coerce by input type at compile time**: `number` → `valueAsNumber`, `date` → `valueAsDate`,
   `checkbox` → `checked`, `<select multiple>` → option loop.

Component two-way: `bind:x={sig}` passes `{ x: sig, "x$set": sig.set }` — a writable Cell pair,
nothing magic. **This is the dividend a getter representation structurally cannot pay: a getter can
be read but not written.** Validation is a library's job.

### 3.11 Server and hydration

**Two code generators, one IR, one identifier namespace.** The shared artefact is a compile-time
**address** `(module path, unit index, position index)`. Marko's discipline, adopted because it is
the only thing that lets the two emitters make checkable claims about each other.

**One ABI means no fallback cliff.** Every component — built-in and userland — is `(s, props) → Out`
and every Block is `(s, …) → Out`, so the string backend can drive all of them. `uninlinable_flow`,
the eight-component non-inlinable set and the per-module downgrade at `compile.rs:302-310` are deleted.
The 41.88x cliff becomes unreachable rather than fixed.

**Hydration is claim-based.** *(Delivered. `SEMANTICS.md` H1–H4 and H6 are `HOLDS`.)* A range owner
writes Svelte's branch instruction at **block boundaries only** — `<!--[k-->` … `<!--]-->` — and the
client reads `k` rather than re-evaluating the condition (which is unsound: it may read data not yet
seeded). Elements are claimed by the same walk carrying a hydration-only logical index
(`child(n, 3)`), which costs nothing on the client-render path. On mismatch, only that branch
re-renders. `container.textContent = ""` is gone from the hydration path — `mount(block, container,
claiming)` is the one line that decides — and `markerId` no longer participates in anything the
compiler emits.

Two things the design did not anticipate, both found by building it:

- **A HOLE needs the boundary comments as much as a branch does.** Not for a key — it has none — but
  because the parser fuses a dynamic text run with the static one beside it before the client ever
  sees them, and because the closing comment is the anchor that keeps `insert` off the
  sole-occupant `parent.textContent` write. That write is §10 Q4's blocker, and the marker is what
  makes it unreachable rather than what makes it correct.
- **Skeleton `<!---->` markers have to be on the wire too.** The logical index counts them, so a
  marker the string backend omitted would shift every index after it by one — which is why the anchor
  pass now runs for the string target under `hydratable`, and only under it.

Chosen deliberately against Vapor's zero-byte scheme: mismatch detection with a local blast radius is
worth the bytes. **Stated honestly: today's 2.10x SSR headline is a bytes-out number that prices
hydration at exactly zero, so the comparison is not like-for-like in either direction, and this design
may make the headline worse before it makes time-to-interactive better.**

Streaming falls out of Blocks: an unready boundary flushes `<!--[b:7-->fallback<!--]-->` plus a
continuation record `(Block, Scope)`; when its promises settle the server flushes a `<template>` and a
swap. The Block is re-invocable with its scope, so there is no second code path.

### 3.12 Interop and escape hatches

- Property-vs-attribute is a **stated rule with an explicit override**, not an eleven-name table:
  known HTML attribute → attribute; else if the property exists on the prototype chain → property;
  else attribute; `prop:`/`attr:`/`bool:` force it. `<my-grid rows={arr}>` stops becoming
  `setAttribute("rows", "[object Object]")`.
- `on:` takes verbatim names — the other half of the custom-element story.
- Per-element attribute interfaces generated from the same tables the compiler uses (one source of
  truth), with `declare module` augmentation. Today every intrinsic shares one flat `HTMLAttributes`,
  so `<div value={x} checked/>` typechecks.
- Deliberate exits: `untrack` (leave reactivity, keep ownership), `pin` (leave dynamic ownership, keep
  a captured scope), `ref` + `onCleanup` (hand an element to a third-party library and take it back),
  `scope.run(fn)`.
- **Where a leak is still possible, stated:** a `pin`ned Block held forever; a global registry holding
  a Cell closing over a disposed scope's signals; a listener added with raw `addEventListener`; a
  promise resolving into a disposed scope (guarded by `gen`, so it cannot *write*, but its closure is
  retained until it settles). Everything else is closed by O3 plus scope-owned listeners plus
  structural cancellation.

### 3.13 What CANNOT move to compile time (Anvil §19, adopted)

This list is normative. A proposal that requires an item on it is wrong, and the list is the reason
the flags set stays small.

1. **Cross-module component shapes.** The compiler sees one module. Mitigated by making the ABI
   *total* — every prop slot is a Cell unconditionally — so no cross-module knowledge is needed for
   *correctness*. Honest cost: `NO_SCOPE`, `SINGLE_NODE` and `STATIC_KEY` are unavailable across
   module boundaries, and an app assembled from many small imported components gets the general path.
2. **The dependency graph.** Svelte tried compile-time dependency derivation and retreated to signals
   in v5; Marko keeps it only because it owns its language and can forbid aliasing. barq compiles JSX
   inside arbitrary TypeScript where a signal can be arrayed, exported or stored on an object. The
   graph stays at runtime.
3. **List reconciliation.** The permutation is data. The compiler supplies flags and the key
   extractor; the diff is runtime.
4. **Dynamic components and tags** whose value is not a module-local `const`.
5. **User-mutable DOM state** beyond the recognised set — IME composition, third-party widget state
   stashed on elements, scroll containers.
6. **Async timing, network, resolution order.** Compile time numbers boundaries; it cannot decide what
   resolves when.
7. **Escaping of dynamic SSR values.**
8. **Three parser facts**, which constrain the compiler rather than being compiled away:
   `<pre>`/`<textarea>`/`<listing>` newline eating (the two backends genuinely need different answers,
   and `&#10;` does not escape it — the tokenizer emits the same character token); SVG namespace entry
   (only a template root reaches the SVG namespace); `<select multiple>` child/`selectedIndex`
   ordering. These survive any design.
9. **Whether a clone beats imperative construction** for a given shape is a browser fact — measured,
   not proved.

---

## 4. WHAT `packages/core` BECOMES

### 4.1 Deleted outright (~1,950 impl lines of 9,319, plus ~350 already dead)

| What | Lines | Why it stops existing
| What | Lines | Why it stops existing |
| ------------------------------------------------------------------------------------------------- | ----- |
 |
|---|---|---|
| `createElement` (`dom.ts:294-340`) | 47 | There is one calling convention. A second implementation of component invocation is the root cause of the Provider bug. Verified: `Helper` has 23 entries and does not contain `jsx`, `jsxs`, `jsxDEV` or `spread`, so compiled code stopped calling most of this long ago. |
| `jsx`/`jsxs`/`jsxDEV` (`jsx-runtime.ts:770-800`) | 31 | Bun's JSX transform cannot produce scope-taking Blocks, so an un-compiled *authoring* path cannot have the same semantics. The JSX **types** stay. |
| `spread()` (`dom.ts:999-1069`) | 71 | Never emitted by the DOM backend; zero callers in `extra`/`kitchen-sink`. Replaced by `_$props` source lists. |
| `appendChildren`/`appendChild`/`childToNodes` ×2/`drainFragment` | ~146 | Artefacts of the eager-children convention. |
| `markers.ts` entire | 51 | Anchor identity is a compile-time address. A process-global `markerId` makes two renders of one tree differ byte-for-byte, which is precisely what makes hydration impossible. |
| `Fragment` component | 19 | A fragment is a compile-time multi-root unit. Today it silently drops function children and nested arrays (verified). |
| `Show`/`Switch`/`Match`/`Index`/`Repeat`/`Dynamic`/`Portal`/`Reveal` as **components** | ~450 | Ten copy-pasted `dispose → clearRange → createScope → insertNodes` bodies, each with its own bugs: `Show` re-registers `onCleanup` **inside** its renderEffect (`components.ts:154`); `Dynamic` and `Portal` use detached scopes where `Show` uses attached; `Dynamic`'s string branch is a fifth element-creation path that JSON-stringifies objects into attributes and never removes its listeners. |
| `Suspense`, `Await`, `ErrorBoundary` | ~196 | Legacy duplicates of `Loading`/`resource`/`Errored`. `ErrorBoundary` reads its children **outside** its own boundary and lacks the `NotReady` guard. |
| `createResource`/`suspend`/`awaitAll` (`async.ts:154-234`) | 81 | Not exported from `index.ts`; referenced only by their own tests. |
| `setProp`/`applyProp`/`applyResolvedProp`/`diffClassList`/`diffStyleObjects` dispatch | ~180 | The compiler holds every fact these re-derive as a `NameFlags` bit. Tables move to Rust and to the generated `.d.ts` — one source of truth. |
| `mergeProps`/`merge`/`omit`/`splitProps` `for…in` bodies | ~90 | Become one-liners over `Object.assign` and destructuring. Law 4 does the work. |
| `useRef()` and the `{current}` shape | — | Refs get their own channel. |
| Snapshot capture, `markInMotion`, `affects`, `peekNextChildId`, `getNextChildId`, `resetChildIds` | ~120 | Zero consumers outside core's own tests, and the first three cost `_affected` and `_snapshot` slots on **every** signal node. |
| ~40 exports with no consumer anywhere | ~350 | `JSXFragment`, `SUPPORTS_PROXY`, `VERSION`, `asElement`, `asNode`, `getProperty`, `isFunction`, `onSettled`, … Of 132 value exports, 62 have no consumer outside `packages/core`. |

The API restarts from the ~70 exports that are actually used and re-earns the rest. Anything kept for
parity is import-flipped so it is tree-shakeable and off the node shape.

### 4.2 `signals.ts` — opened, contrary to the previous pass

**Kept because I would design it this way, each with its warrant:**

- **Epoch-stamped write-dedupe** (`signals.ts:1224`). `markEpoch` bumps only when a mark is *consumed*,
  so N writes between two flushes cost O(1) marking. Ablated: **2.37x** on "100 writes + 1 flush". No
  coupling to props, children, markers, context or the DOM.
- **`markWave` visit-dedupe.** All three designs proposed deleting it pending justification. Ablated:
  +7% on "100 writes + 1 flush" and "wide(10)", −2% on diamond. **Keep**, and re-measure after the
  Scope split.
- **Monomorphic node shape as a hard budget.** `signals.ts:189-192` states it: every field present on
  every instance so `_fn`/`_equals`/`_epoch` loads stay monomorphic. Adding a field is a measurable
  regression, not a free change.
- Single integer gate for rare read modes; height-bucketed intrusive heaps with maintained
  `_min`/`_max`; per-link `_lastValue` snapshots gating recompute; lazily-allocated `cleanups`/`children`.

**Changed:**

- **`Scope` becomes a separate object from `ComputedNode`.** `ComputedNode` loses `cleanups`,
  `children`, `disposed`, `dispose`, `_parent`, `_context` (`signals.ts:215-218, 441-443`) and gains
  one `_scope` pointer, usually null. Six slots off the hottest object in the system. This is the
  single largest reactivity change and it is a direct consequence of taking ownership seriously
  instead of letting it ride on the graph. **Gated on measurement** — see §7, and see §10 Q6: nodes
  that *do* own things now pay an extra allocation and an indirection, and the shape change may
  perturb inline caches the current discipline was tuned around.
- `_affected`/`_snapshot` move off the base shape behind the rare-mode gate. **Also gated** —
  `signals.ts:223-232` documents that the opposite tradeoff was chosen deliberately for the async
  fields, which is direct evidence the intuition can fail.
- `createScope`/`getOwner`/`runWithOwner` → `enter`/`exit`/`dispose`/`pin`. `owner._context` spread →
  prototype fork.
- `untrack` documented and tested to change **only** the observer.
- `renderEffect` → `fx(compute, apply)`.

### 4.3 Added

`scope.ts` (~250 lines: enter/exit/dispose/pin/ctx), the three region primitives with their flag-gated
paths, `_$props`/`mergeSlots` (~40), `bind.ts` (~200: coercion table, selection preservation),
`stream.ts` (~200: server continuations), `trace.ts` (~150, DEV only: the ownership trace),
`@barqjs/core/interp` (the IR interpreter — see §6).

**Packaging.** The runtime ships as a core plus **feature-gated chunks** the compiler imports only when
a module uses them (Marko's `.feat` discipline): `each`'s LIS reconciler, `boundary`, `stream`, `bind`,
`portal`, `store`, `transition`. An app that never renders a list never ships LIS. The emitted module
asserts the ABI version it was compiled against (`import "@barqjs/core/abi-2"`, Svelte's
`disclose-version` trick), so a compiler/runtime skew is a load-time error rather than a mystery.

Net: ~9,300 impl lines → an estimated ~6,500, with the reactivity core the largest surviving piece.
The reduction is not a goal; it is what happens when there is one path from `(tag, props)` to DOM
instead of the four that disagree today (template path, `createElement`, `spread`, `Dynamic`'s inline
branch).

---

## 5. WHAT THE COMPILER BECOMES

The spine survives — `parse → bind (oxc_semantic, reactivity by SymbolId, never by name) → harvest →
lower → passes → codegen` — and I would design it this way. Resolution by `SymbolId` is
non-negotiable: it is what makes a *local* `Show` not the runtime's, what makes `import { signal as sig }`
work, and what makes `count.set` and `count()` two verdicts on one identifier. The flat `Patch`/`Op`
program, `Skeleton`/`Materialisation`, the `React::{Static,Reactive,Opaque}` lattice, `DepSet`, `Shape`,
`Thunk` and `Cost` all survive because the IR holds no AST and names no target — exactly what a
three-backend design needs.

### 5.1 The structural change that comes first

- **A `Backend` trait over the IR**, with a method per `Op` and per structural event, implemented
  three times: `Dom` (emits JS), `Ssr` (emits JS), `Interp` (serialises the IR for the JS
  interpreter). Rust exhaustiveness then makes a new `Op` a compile error in all three.
- **An orthogonal optimisation-level axis.** `-O0` disables template dedup, static hoisting, effect
  fusion, anchor elision, constant folding into templates, walk-from-nearest-sibling, η-reduction,
  every flag (emitted as `0`) and every binding becomes its own live effect — while emitting the
  **same ABI** from the **same IR**. This is not a debug mode; it is the correctness reference.

### 5.2 New and changed passes

- **P0 `bind`** gains `IsComponent` (does this function contain JSX in value position?), the settable-Cell
  verdict per binding (for `bind:`), and the escape analysis for props spreads.
- **P-new `scope`** — the ownership pass. Builds the **static ownership tree** from JSX nesting and
  emits three things: the `($s, parent, anchor)` threading for every call; the `NO_SCOPE` proof
  (conservative on any opaque callee, **per-position fallback, never per-module** — React Compiler's
  whole-function bailout, where one `ref.current` read emits the component byte-identical to input, is
  the failure granularity to avoid); and the static ownership tree serialised as a compile artefact,
  which is the oracle's L2 expected value.
- **P-new `flow`** — `if`/ternary/`&&`/`Show`/`Switch`/`Match` chains become emitted JavaScript
  computing an integer key plus a hoisted body table plus one `branch` call. `Flow` in `ir/symbols.rs`
  stops selecting a runtime component and starts selecting a lowering.
- **P2 `classify`** — the `STATEFUL_DIFF` early return at `classify.rs:118-120` is **deleted**;
  `class`/`style`/`classList` join the fused effect and `ref` leaves the prop channel entirely. Adds
  full `Chan` resolution (`Attr`, `AttrNS`, `Prop`, `Bool`, `Class`, `ClassBits`, `Style`, `StyleProp`,
  `UserMutableProp`, `Event`, `Ref`, `Bind`).
- **P-new `classbits`** — conditional-class partition: static prefix into the template, names hoisted,
  condition reduced to an integer expression.
- **P4 `shape`** — the getter gate is replaced by an emission table. Every boundary-crossing value
  emits a Cell, with three exceptions: a proven constant crosses via a module-hoisted deduped thunk
  (`_$k`); a bare identifier already a Cell is **forwarded by name, not re-wrapped** (this is what
  makes forwarding depth-independent); element props inside a compiled unit are inlined into the fused
  effect and never cross. Children and JSX-valued props lower to Blocks. Spreads lower to `_$props([…])`.
  The member-tag comma expression `(0, Ctx.Provider)(…)` disappears — it existed only because
  `createElement` called `tag(finalProps)` receiverless.
- **P1 `lower`** — the tree-construction gate at `lower/mod.rs:158` is re-based from *"whether the HTML
  parser reproduces this element exactly as `createElement` would"* to *"what a browser's tree builder
  produces"*. `<table><tr><td>` becomes **one template and one clone** instead of two templates plus an
  insert. A JSX spread stops abandoning the template path. The three parser refusals in §3.13 item 8
  survive.
- **P-new `bind`** — `bind:*` lowering: DOM-compare vs cached-compare selection from the tag×channel
  table, selection preservation, type-driven coercion, group/files handling.
- **P6 `address`** — every position gets a stable `(module, unit, position)`. Both backends consume it
  for hydration claiming, HMR granularity, branch instructions, async seeding keys and error labels.
  A fixture compiles the whole corpus both ways and diffs the address sets — an agreement that is
  currently not assertable at all.

### 5.3 Deleted from the compiler

`compile.rs:609-630 uninlinable_flow` and the eight-component set; the module-level SSR→DOM downgrade
at `compile.rs:302-310`; `codegen/fallback.rs`'s `createElement` path; the `classify.rs` `STATEFUL_DIFF`
early return; every `Helper` entry naming a deleted runtime export; the `createElement`-parity
tree-construction refusals.

### 5.4 Compile budget

Today 0.013–0.025 ms/file against 1 ms — ~40x headroom. Every new pass is a linear walk over an IR
that already exists. **Budget: ≤0.1 ms/typical file**, i.e. spend at most 4x the current cost and sit
10x inside the budget, enforced by the existing `throughput.test.ts`. `-O0` doubles fixture compile
work in CI only (120 × 2 × 0.1 ms = 24 ms — irrelevant). **Compile time is the cheapest resource in
this system by roughly 40x and must not be treated as a constraint on the design.**

---

## 6. THE ORACLE

The un-compiled `createElement`/`jsx` path is **retired as an oracle**, for three reasons in order of
force:

1. **It is blind to the bug that prompted this.** Both paths render a blank page for
   `<Provider><Child/></Provider>` (verified), so the harness was green. A second implementation that
   shares your defect is worse than no oracle, because it certifies the defect.
2. **The exemption machinery is already a written specification in the least reviewable possible
   form.** 12 fixtures declare `wins` (the compiled path is *more* correct and names the exact DOM it
   must produce); 16 declare `goesLive`. Every time the compiler learns something the runtime cannot
   know, the oracle needs another exemption — and the fixtures needing exemptions are exactly the
   interesting ones.
3. **No UI framework in a twelve-project survey does this.** dom-expressions ships three
   implementations of one semantics and documents the divergence as an API difference; Vue had both
   runtimes in one repo — same team, same corpus — and chose duplicated hand-written suites over a
   diff, because the two runtimes have different calling conventions and no shared test body can drive
   both. That is precisely the constraint this design lifts.

Six layers replace it, each owning the channels it suits.

### L1 — `SEMANTICS.md`, a written and fixture-pinned specification

On the WebAssembly model: prose + executable reference + conformance suite in one repo (Wasm ships 97
`.wast` files; barq has ~120, so this is affordable). Numbered rules, each with a fixture:
O1 (the scope creation set), O2 (a Block runs under the scope it is given), O3 (disposal order), O4
(ambient hygiene), C7 (single evaluation), X3 (context resolves at read time), the keying contract,
the routed error entry points, the mount ordering, where reactivity is entered and exited, the
hydration claim rules.

**This is the only layer that catches the Provider class, and no oracle substitutes for it.** Nobody
had ever written down what `<Provider><Child/></Provider>` must do, so neither implementation was
wrong *against anything*. Alive2 is the precedent: validating LLVM against a semantics produced eight
patches to the LangRef, because the act of checking forces the spec to exist.

### L2 — A generated reference, not a hand-written one (Anvil's graft)

One lowering `JSX → IR`, one `Backend` trait, three implementations. `Interp` is a small JS
interpreter over the serialised IR, shipped as `@barqjs/core/interp`, DEV/test only. This is the first
Futamura projection / tagless-final construction — one term, many interpretations — and Glimmer ships
the deep version in a production UI framework. Three properties matter: it consumes the *same analysed
IR* codegen consumes, so "the compiler knows more" is structurally impossible and there is no O4-style
divergence to buy back with slack; it carries zero legacy decisions because it did not exist before;
and it cannot drift, because a new `Op` variant is a Rust compile error in all three backends. It
replaces ~4,060 lines of hand-maintained un-compiled runtime that must be kept in lockstep by hand
(`jsx-runtime.ts` 800, `dom.ts` 1,270, `components.ts` 1,333, `markers.ts` 51, `ssr.ts` 608) with a few
hundred that cannot fall out of lockstep.

### L2b — The ownership trace (Arena's contribution; no other project has this)

In DEV, `enter`/`exit`/`dispose` and every Block invocation append to a trace. The compiler already
built the static ownership tree (P-new `scope`) and emitted it as an artefact. The oracle asserts, per
fixture:

> the runtime scope tree is isomorphic to the compiler's static ownership tree, and every Block
> executed under exactly the scope the compiler said it would.

**Total, absolute, and needs no reference implementation**, because the expected value is derived from
the source rather than from a second execution. It is the direct regression test for the Provider bug
class and it generalises: a component constructed under the wrong owner, a branch body owned by its
sibling, a row outliving its list, a portal resolving context through the DOM instead of the scope
chain. Companion: a **leak oracle** — after `dispose()`, zero live scopes, zero listeners, zero pending
resources, zero retained DOM. Formulable only because ownership is total.

Honest limit, stated by the design that proposed it: the trace proves the tree, never the values. A
compiler that gets every scope right and every DOM write wrong passes L2b completely. L3 carries that
weight.

### L3 — `-O0` vs `-Ox` differential

The settled answer in the optimising-compiler literature: the reference for an optimising compiler is
**your own compiler with the optimisations off**, not a hand-written sibling with its own history and
its own bugs. Csmith across `-O` levels; terser's `ufuzz` running original-vs-minified through one
sandbox (`sandbox.same_stdout`); V8/DUMPLING dumping optimised-vs-unoptimised state inside one engine,
which found eight new bugs in an engine already fuzzed for a decade.

`-O0` shares the front end, the IR, the ABI, the props model and the ownership model, so it **cannot**
encode a legacy decision and **cannot** share an optimisation bug. Every optimisation becomes
individually bisectable by flipping one flag — a throughput improvement over the current arrangement,
not a cost.

Driven three ways: the fixture corpus; a JSX generator; and **EMI-style mutation** — any subtree a
fixture's driver never renders (an untaken branch, an unselected `Match`, an uninstantiated component)
is arbitrarily mutated and the rendered DOM, effect counts and node identities must be byte-identical.
That directly stresses template-dedup hashing, walk paths computed after anchor elision, and false
`NO_SCOPE` judgements — where a template compiler's wrong-but-plausible bugs actually live — and needs
no reference at all.

#### What L3 is blind to, stated

**L3 grades nothing that happens before the first gated pass.** `passes::run` gates `fold`, `fuse`,
`anchor`, `walk` and `dedup`; codegen gates `eta`, `hoist` and `splice`. `analysis::bind`, `harvest`,
`lower`, P2 `classify` and P4 `shape` are *shared* — roughly 5000 lines against 1200 gated ones — and
every claim L3 makes has the form "the two builds agree". A front end that is wrong is wrong on both
sides, so L3 stays green. L2 is blind the same way and for a stronger reason: `Interp` consumes the
same analysed IR *by design*, which is exactly what makes it a reference and exactly what stops it
being one here.

Measured, not feared: mutating `classify` so that every tracked signal read comes out `React::Static`
— the most consequential single bug this compiler can have — left the whole `-O0` differential and the
whole `Interp` differential fully green. Only the `createElement` oracle and the optimality claims
caught it, and only on nine fixtures, because `fixtures/README.md`'s explicit-thunk style immunises the
rest by construction.

**Gating the front end does not fix this, and the reason is not effort.** The pessimal choice for an
optimisation is a slower program; the pessimal choice for the reactivity analysis is a *different*
program. With P2 skipped, every patch stays the `Op::SetOpaque` / `InsertPlan::Opaque` that P1 emitted,
and `codegen::dom` hands those to the runtime UNWRAPPED — so `{count()}` is read once and `-O0` would
be non-reactive where `-Ox` is reactive. Forcing `Rx::OPAQUE` while still resolving patches moves the
damage instead of removing it: `getter_shaped` turns a function prop into a getter, and
`component-function-props` asserts in rendered DOM that `props.cb === props.cb`. A knob that changes
what the program means is not an optimisation level, and `-O0` sharing the props model is a promise
made two paragraphs above this one.

So the ungated front end needs an **absolute** grader, and two exist. The `createElement` oracle is one
— which is why L4 retiring five channels must not be read as retiring `oracle.test.ts` while nothing
has replaced it for P2 and P4. The other is executable and lives in `test/optimisation.test.ts`
("the front end L3 cannot grade, graded absolutely"): the smallest claims that pin what the classifier
decides — a tracked read is live wherever it is written, a snapshot of one is not — asserted in every
live mode, and written in the DIRECT form the corpus steers away from.

### L4 — Graded properties, replacing five of the seven current channels

React's `itRenders` grades its properties (full equality on clean render, node identity across
hydration, text-content-only on deliberately bad markup) and needs no exemption machinery as a result.
barq applies near-total equality everywhere and buys exceptions back.

| Channel | Family | Property
| Channel | Family | Property |
| --------------------------------------------------------- | -------------------------------- |
 |
|---|---|---|
| Rendered DOM across frames | differential | `-O0` vs `-Ox` byte-identical |
| Node identity | **metamorphic** | Glimmer's `assertStableRerender`: re-render with unchanged inputs preserves every node; a write that does not change a branch key preserves every node in that branch; a keyed move preserves the moved row's nodes. Strictly stronger than matching whatever `createElement` incidentally kept — and unlike today's channel it is never skipped when shapes disagree. |
| Effect counts / run counts | **absolute** | Hand-written expected numbers per fixture, as Svelte's `tests/signals` does with `log` arrays. These are optimality claims, never equivalence claims. |
| Marker layout / anchor accounting | **self-check** | Both sides are already read off the emitted module; add "anchors in the live DOM equal anchors the clones bake in". |
| Anchor POSITION | **ungraded at M1**, stated | No layer compares where a marker sits. `normalize.ts` says so in its own header — `a<!---->b` and `a b<!---->` serialize identically — so the DOM diff cannot see it; L3 must not compare it, because `-O0` turns elision off and demanding agreement would demand the optimisation do nothing; and `Interp` does compare it but reads the same `anchor::run` output, so a wrong elision reaches both sides identically. A content-neutral misplacement is invisible to all of M1. The self-check above bounds the COUNT, not the position. |
| Attribute order / emitted bytes / diagnostics / sourcemap | **one fused golden per fixture** | Qwik's `snapshot_res!`. A silently-dropped diagnostic, a corrupted mapping or a size regression becomes a visible diff. |

### L5 — Mode matrix, plus two self-invariants

Every fixture runs in five modes: `dom -Ox`, `dom -O0`, `interp`, `ssr`, `ssr → hydrate`. Every
surveyed project independently converged on this (Svelte four, Marko two, Qwik two, React five). Plus:
**clean unmount leaves nothing behind** (zero live effects, listeners, scopes) and **no unexpected
console output**. The first would have caught the finding that `render`'s disposer stops nothing.

### L6 — Mutation testing of the harness, generalised

`oracle.test.ts`'s corruption self-checks (`drop`, `inTemplates`, `anchorAfterEveryText`,
`reverseBakedAttributes`, `reverseAppliedProps`) are the **only** mechanism in the entire survey that
asks "would my suite notice a wrong compiler change?" — Svelte, Vue, Marko, Qwik, Solid, React and
Glimmer all lack it. Generalise to **one mutation operator per optimisation pass** — drop a flag,
invert a flag, mis-order a walk step, alias two template hashes, drop a Scope, elide a needed anchor —
run over the whole corpus, fail on any surviving mutant. **Mutant kill rate per pass becomes a
reported number the project does not currently have.**

### What this cannot catch, stated

A defect in the specification itself. If `SEMANTICS.md` says the wrong thing, `-O0` and `-Ox` will
agree on it, the ownership trace will match, every conformance test will pass. That residual is
irreducible and is why the spec is reviewed as a design artefact, not generated from the
implementation. It is also why every mode shares `analysis::bind` — a mis-classified `SourceKind` is
wrong everywhere simultaneously, which is exactly the failure shape of the Provider bug. L1's
hand-written absolute expectations are the only defence and they are the weakest layer because they
are human.

### The migration gate

**L1 and L2b land first, against the current compiler, where the Provider fixture and the boundary
fixture must FAIL.** Proving the new oracle detects the known bug before any redesign begins is the
only way to know the oracle works, and it means the project is never without a correctness reference.

---

## 7. WORKED EXAMPLES, END TO END

### 7.1 The Provider case — from silently broken to unrepresentable

**Source**

```jsx
const Ctx = createContext();                       // no default → a miss THROWS
const Child = () => <span>{Ctx.use()()}</span>;
export const App = () => <Ctx value={1}><Child /></Ctx>;
```

**Emitted today** (verified against `barq-compiler.linux-x64-gnu.node`, `warnings: []`)

```js
export const App = () => (0, Ctx.Provider)({ value: 1, children: Child({}) });
```

`Child({})` is an **argument**. It runs at the call site, under the caller's owner, before
`createScope` inside the Provider has created the scope that `owner._context[id] = props.value` writes
into. Runtime, verified: `<span>THREW:ContextNotFoundError</span>`. With a default present the failure
is silent and the page is blank.

**Emitted under this design**

```js
import { template as _$template, insert as _$insert, provide as _$provide } from "@barqjs/core";
const _tmpl$1 = /* @__PURE__ */ _$template(`<span> </span>`);
const _k1 = () => 1;                                     // hoisted constant Cell, deduped module-wide

const Child = ($s) => {
  const _n1 = _tmpl$1();
  _$insert($s, _n1, _n1.firstChild, Ctx.use());          // the context Cell IS the hole's Cell
  return _n1;
};
const _b1 = ($c) => Child($c, {});                       // hoisted Block: takes a scope, returns Out

export const App = ($s) => _$provide($s, Ctx, _k1, _b1);
```

**Runtime**

```js
function provide(s, ctx, value, block) {
  const c = enter(s);
  c.ctx = Object.create(c.ctx);                          // O(1), not a spread copy
  c.ctx[ctx.id] = value;                                 // the VALUE is a Cell → provider updates are live
  try { return block(c); } finally { exit(c); }
}
```

**Why it cannot regress.** There is no expression in the emitted language that means "children,
already built". `children` is a `Block`, and a Block **cannot run without a scope argument**. The only
party holding `$c` is `provide`, which enters the scope and writes the context before invoking it.
This is strictly stronger than emitting a thunk: a thunk `() => Child({})` is invocable by anyone, and
today's compiler already emits exactly that mistake for element children (`children: (() => {…})()`).
A scope-taking Block makes the mistake **visible in the emitted text** (a `$s` appears where a Block
is expected) and **checkable by the L2b ownership trace**, which asserts every Block ran under the
scope the compiler said.

The boundary variant is the same mechanism: `_$boundary($s, p, a, KIND_ERROR, _fb, _b1)` enters a
scope, installs the catcher, and **then** calls `_b1` inside a `try`, so a child that throws during
construction lands inside the boundary. Today `Errored({ fallback: …, children: Boom({}) })` throws at
the call site (verified). And because context resolves at read time up a prototype chain, the
install-then-read ordering stops being something five components each have to remember — one of them,
`ErrorBoundary`, currently gets it wrong.

### 7.2 A control-flow case — `Show` stops being a component

**Source**

```jsx
const on = signal(true);
export const V = () => <div><Show when={on()} fallback={<i>no</i>}><p>yes</p></Show></div>;
```

**Emitted today**

```js
export const V = () => Show({ when: on, children: _tmpl$1() });
```

One props object, one call, one owner question, and — the load-bearing part — `_tmpl$1()` is a **built
node** where a re-mount needs a fresh build, so a hide/show cycle hands the same node back.

**Emitted under this design**

```js
const _tmpl$1 = /* @__PURE__ */ _$template(`<div> </div>`);   // one text node = the anchor, 1 byte, no comment
const _tmpl$2 = /* @__PURE__ */ _$template(`<p>yes</p>`);
const _tmpl$3 = /* @__PURE__ */ _$template(`<i>no</i>`);
const _K1 = [_tmpl$2, _tmpl$3];      // arity-0 templates ARE legal Blocks — passed by name, zero allocation

export const V = ($s) => {
  const _n1 = _tmpl$1();
  _$branch($s, _n1, _n1.firstChild, () => (on() ? 0 : 1), _K1,
           0b1110 /* SINGLE_NODE | NO_SCOPE | FAST_CLEAR */);
  return _n1;
};
```

**Runtime.** `branch` opens one effect on the key Cell. Key unchanged → **nothing happens** (no
teardown, no rebuild). Key changed → dispose the instance scope (which disposes its effects, runs its
cleanups LIFO, aborts its `AbortSignal`, removes its nodes), `enter` a fresh child scope, call
`_K1[k]` under it, insert at the anchor. With `NO_SCOPE` proved, no Scope is allocated at all — worth
the 7.3 ns/instance I measured.

What this deletes: ten copy-pasted `dispose → clearRange → createScope → insertNodes` bodies with
their divergent bugs; two comment nodes per control-flow instance; the props object and the call per
instance; and the router's fourteen direct uses of `createMarkerPair`/`clearRange`/`insertNodes`, which
become the public `branch()` handle.

Note the arity-0 point: because `Block = (s, …) => Out` and a hoisted `template()` is `() => Node`,
a pure-static branch body is **the template function itself**. No arrow, no IIFE, no closure. This is a
direct dividend of choosing `Out`-returning Blocks over `void`-returning ones for the one-shot case.

### 7.3 A fully static case — the component IS the template

**Source**

```jsx
export const Card = () => <div class="card"><h1>Title</h1><p>body</p></div>;
```

**Emitted**

```js
const _tmpl$1 = /* @__PURE__ */ _$template(`<div class="card"><h1>Title</h1><p>body</p></div>`);
export const Card = _tmpl$1;
```

`_tmpl$1` is `() => Node`, and `Component = (s, props) => Out` — a function that ignores both
arguments and returns a `Node` satisfies it. So the component costs **one clone and nothing else**:
no props object, no scope, no wrapper, no arrow. `<Card/>` inside another template emits
`Card($s, _EMPTY)` and the callee ignores both.

Under `-O0` the same source emits the un-optimised form — no dedup, no hoisting, an explicit
`($s, props) => { const n = document.createElement("div"); … }` — and L3 asserts the two produce
byte-identical DOM, identical effect counts and identical node identities. That is how "the template
optimisation is correct" becomes a checkable statement rather than a reviewed snapshot.

---

## 8. MIGRATION PATH AND MILESTONE ORDER

This is a breaking redesign on a single branch. An incremental path would require both ABIs to
coexist, which reintroduces exactly the two-implementations-of-invocation problem the design exists to
remove. No compat shim will be offered.

**M0 — the oracle, against the CURRENT compiler.** `SEMANTICS.md` (L1). The ownership trace and the
static-ownership-tree artefact (L2b). The Provider and boundary regression fixtures. **These fixtures
must FAIL here.** Nothing else starts until the suite is green-except-for-the-known-failures. This is
substantial work with no user-visible payoff and it is the largest practical risk in the plan; it is
also the only way to know the oracle works.

**M1 — the `Backend` trait and `-O0`.** Refactor `codegen` behind the trait; add the optimisation-level
axis; port the corpus. `Interp` lands here. L3 differential green over the corpus.

**M2 — `Scope` and the root.** `scope.ts`, `enter`/`exit`/`dispose`/`pin`, prototype context,
`render(block, container)` with a disposer that disposes. **Re-run the eleven reactivity cases here** —
this is where the `ComputedNode` split is proved or reverted (§10 Q6).

**M3 — the calling convention.** `Comp($s, props)`, Cell props, Block children, `_$props` source lists,
the `shape` and `scope` passes. The Provider and boundary fixtures go green. Laziness conformance
(a counting Cell must read **0** after spread, rest-destructure, `Object.assign`, `for…in`,
`mergeProps`, `splitProps`, `omit`, and forwarding through three wrappers).

**M4 — control flow.** `branch`/`each`/`boundary`/`portal` replace the ten component copies; the `flow`
pass; the flags with their measurements. L4 properties and the leak oracle land. Single-evaluation
conformance: every built-in consumer driven with an instrumented Block, asserted to call it exactly
once per activation.

**M5 — elements.** Channel resolution, the fused compute/apply record, class bitmasks, `ref` as a
channel, events with scope-owned cleanup and boundary routing. `STATEFUL_DIFF` deleted; the `class`
one-shot bug becomes unrepresentable.

*Landed with FIVE semantic changes, not the four the build phases reported.* The fifth is
`codegen/brand.rs`: §3.0 rule 3's brand applied at the DEFINITION site of an author-written component,
not only to the arrows `shape` synthesises. Before it, `isBlock(Wrap)` was false for the whole
author-written surface — a component invoked with no scope resolved `useContext` against `CURRENT`
instead of throwing, and a component REFERENCE crossing a Cell slot (`<Sink thing={Leaf}/>`, emitted
`thing: () => Leaf`) walked past `readSlot`'s brand probe and was stringified into an attribute, which
is the outcome `BARQ010` says cannot happen.

It shipped applying to EVERY component, which rule 3 does not ask for and C3.8 names as the
alternative it weighed: "the compiler brands the Blocks that *use* their scope … a Block that ignores
its scope — an arity-0 `template()`, C6 — is simultaneously a legal Cell and needs no brand." The
repair round narrowed it to the emitted bodies that actually read `_s$`. Three things follow, and the
first is why it mattered beyond bytes:

- `block()` installs an entry guard, so branding a scope-ignoring component RETIRES the dual
  Block/Cell use rule 3 grants it. 40 of the corpus's 152 components (26%) are in that class, and
  `static-only` is one — which is why target 2's "one clone and nothing else" was red.
- **Emitted bytes.** Over the 123 fixtures shared with HEAD: 198,255 at HEAD → 202,920 at M5's four
  changes (+2.35%) → 211,247 with the brand on every component (+6.55%) → **209,726 narrowed
  (+5.79%)**. The whole 130-fixture corpus emits **224,933 bytes**; re-measure with
  `listFixtures().map(compileFixture)` and diff against that number.
- **The SSR bar did NOT move with it, and the brand was not the cause.** `block()` costs a call frame
  and an `arguments`-based `.apply` per component ACTIVATION on both backends, and the 100-row page is
  component activation, so this was the obvious suspect. It is not: over-broad brand 1.99x / 1.87x,
  narrowed 1.86x / 1.87x / 1.86x on three back-to-back runs of a quiet machine (a fourth, taken first
  on a cold machine, read 2.22x and is an outlier — the three agree to two decimal places). See §0.1.

**M6 — server.** The string backend over the same ABI; `uninlinable_flow` deleted; compile-time
addresses; claim-based hydration; streaming. **This is where the 41.88x number is collected.**

*Landed, minus claim-based hydration, which is the next agent's and which this milestone deliberately
left the ground clear for.* What shipped:

- **The string backend implements the four primitives.** `passes::run`'s flow lowering is no longer
  gated on `Target::walks_the_dom()`, `claim_regions` runs for every target, and `Ssr::region` calls
  the SAME `dom::region_call` the DOM backend calls, with `(parent, anchor) = (null, null)`. One
  lowered IR, two emissions. `branch`/`each`/`boundary`/`portal`/`COUNT` — and `props`/`cell`/`block`
  with them — are exported by both runtime halves under one name and one argument order, and the
  compiler chooses between them by choosing the import SOURCE (`codegen::SHARED_ABI`). A
  string-compiled module now imports from `@barqjs/core/server` and from nothing else.
- **`uninlinable_flow` is deleted**, with `Flow::inlinable_on_server`, the eight-component set, the
  module-level SSR→DOM downgrade and `BARQ007` — the diagnostic that announced it. All fourteen
  constructs have a string component in `ssr.ts` (eleven of them reached only when the flow pass
  refuses a shape it cannot read statically), so nothing anywhere sends a module to another backend.
  `test/ssr.test.ts`'s `SSR_FALLBACK` list is now empty and asserted empty in both directions, and
  `test/addresses.test.ts` plus the corpus rows pin the rest.
- **Compile-time addresses.** `passes::address::locate` numbers every position `(module, unit,
  position)` for every target, off the patch program — never off a `NodeId`, because the anchor pass
  makes the two targets' skeletons differ. Exposed as the `addresses` option, a side artefact on the
  same terms as `ownership`. §5.2's acceptance test exists and passes: 130 fixtures × 2 backends ×
  2 optimisation levels, address sets identical. **H5 moves from `VIOLATED` to `HOLDS`.**
- **Streaming.** `renderToStream` in `server.ts`. An unready `Loading` flushes
  `<!--[b:N-->fallback<!--]-->` and parks `(content Block, Scope)`; the loop settles, re-invokes the
  SAME Block under the SAME scope through `ssr.ts::resumeDeferred`, and flushes a `<template>` plus a
  swap. The client half is a real function shipped by `toString()`, so the snippet and the thing the
  tests drive cannot be two implementations.

**The 41.88x row, re-measured (§0.1).** Before: the 100-row page in a module that also mentions
`Portal` rendered **36.10x slower** than the same page in a plain module (191.61 µs vs 5.25 µs,
Wilcoxon p=5.3e-10) — one import, and every unrelated page in the module lost its string backend.
After: **1.07x faster** (4.35 µs vs 4.69 µs, p=1.2e-4), which is the two rows measuring the same work
and differing by run order. The cliff is not narrowed; it is unreachable.

**What M6 did NOT do, stated.** The branch-instruction comment `<!--[k-->` is written at a DEFERRED
boundary and nowhere else. §11 Q4 settled that hydration pays those bytes to get mismatch detection
and §3.11 writes the format down, but the byte cost is only defensible against a claim algorithm that
spends it, and emitting them now would (a) charge every client-rendered page for bytes nothing reads
and (b) break the property this backend is checked by — the two backends produce byte-identical
markup, which is what lets the dual-render suite compare them with no normalisation step that could
hide a real divergence. The addresses are landed and diffed; wiring them into wire bytes is the
hydration pass's call, made with its own measurement.

**M6b — claim-based hydration.** The call M6 deferred, made: the bytes are written, and they are
written behind a compile-time flag so M6's byte-identity property survives untouched with it off.

- **`hydratable`, a compile option that changes BOTH backends.** The string backend writes
  `<!--[-->` … `<!--]-->` at every hole and `<!--[k-->` at every range, where `k` is the key the
  primitive CHOSE; the DOM backend's template walk goes through `child`/`sib` — a logical index that
  steps over those ranges — instead of `.firstChild`/`.nextSibling`, and a hole whose value is an
  expression rather than a thunk is wrapped in `hole(parent, anchor, …)` so the claim is made before
  the value is built. Off by default: a page that is never hydrated pays neither the wire bytes nor
  the indirection, which is H3's falsification procedure and is run over the whole corpus.
- **`hydrate` no longer clears the container.** `mount(block, container, claiming)` is one function
  with one line of difference, so the claim path cannot drift from the path everything else is
  measured on. **115 of 130 fixtures reuse 100% of the server's nodes**; the 15 that do not are
  registered with their exact reuse and a reason.
- **Mismatch is detected and the blast radius is stated per corruption.** Eleven wire corruptions plus
  the build-level one (compile without the flag and hydrate anyway); every one is detected, every one
  ends at a tree the client would have built, and the worst case is a full client render — exactly
  today's behaviour. The row that motivated the subtree check: an EXTRA element in the middle of a
  claimed subtree survived silently, because the walk indexes from both ends.
- **§10 Q4's repo-specific blocker is SOLVED, by the marker.** `<span>{x}</span>` still compiles to
  `<span></span>` plus an `insert`, and the sole-occupant `parent.textContent` write still exists —
  it is simply unreachable on a hydrating page, because `insert` seeds its `current` with the claimed
  nodes and that path requires `current.length === 0`. The hydrating path therefore diverges from the
  benchmarked production path in exactly one place, and it is a `null` check. **Declared:** the wire
  is 55.7% larger raw and 7.3% larger gzipped on the 100-row page.
- **Rules moved.** H1, H2, H3, H4 and H6, `VIOLATED`/`PLANNED` → `HOLDS`. All five moved on CHANNELS,
  not on fixtures, and §14.1's five planned hydration fixtures were struck rather than written: a
  percentage over a corpus, a diff between two compiles and a corrupted WIRE are none of them a source
  file. Coverage 32 → 37 of 88.
- **What it is NOT.** Claiming is 1.4–1.6x more *node work* than replacing in happy-dom, measured at
  four page sizes. That is a lower bound on the claim's advantage rather than an upper one — happy-dom
  models no layout, no paint and no focus, which is where every cost of replacing actually lands — but
  it is the honest number this harness can produce, and the frame-budget half of §10 Q4's table needs
  a real browser and belongs with the Chrome differential.

**The registry gate M6 added, because a milestone that closes rows needs one.** Every known-failure
row carries a `greenAt` and nothing compared it to a clock: three rows promised green at M5 and were
still `VIOLATED` after M6 with no assertion able to see it. `test/milestone.ts` exports
`CURRENT_MILESTONE`, and `semantics.test.ts`, `leaks.test.ts`, `ownership.test.ts` and
`oracle.test.ts` each fail a row that is behind it. The three M5 rows moved to M9 with their reasons
rewritten — see `SEMANTICS.md` §15.7, which also records the measurement that rules out the fix C3.8's
row used to propose, and the one decision left open for the user.

**The M2 gate round, which closed the last two ownership holes the corpus could not see.** Both
were the same mistake in two places: taking a rule that is about a VALUE and enforcing it at an
ARGUMENT.

- **C3.8 at `ref` and at an event handler.** `block`'s entry guard fires on `scope === undefined`, and
  those are the two slots where the value is invoked with something else — the Element, the Event. So
  a forwarded Block ran, `requireScope` accepted a DOM node as its scope, and everything below it was
  parented to that node: a permanent leak that survived root disposal, measured. The brand is a
  property of the value, so the refusal moved to the read — `applyRefs`, `listen`, `delegate`, and the
  delegated dispatcher, which is the only place the compiled `_el$1.$$click = h` expando is visible at
  all. Three new slots in `sem-props-block-in-cell-slot`, nine slots and 18 pairs.
- **O4.5 in the compiled element-binding channel.** `insert` and `setProp` honoured their scope
  argument; the channel beside them emitted a bare `renderEffect(compute, apply)` taking no scope at
  all, so attribute, class, style and DOM-property bindings were ambient-owned in 34 of the corpus's
  fixtures while the registry read "closed for `setProp`" — `setProp` being the un-compiled
  dispatcher. `bindEffect(s, …)` replaces it, `block`'s wrapper establishes the handed scope as
  `CURRENT` so the argument decides for `useContext`/`onCleanup`/`effect` too, and the delegated
  dispatcher runs a handler under the element's scope instead of with `CURRENT === null` — where its
  work was an orphan the next flush released, owned by nobody, forever.
- **The channel that could not see any of it, and now can.** The L2b trace recorded scopes, template
  clones and block spans, and no EFFECT — so an effect opened under the wrong owner produced a
  byte-identical trace and the whole effect half of O2/O4.5 was structurally invisible. `own` is the
  new event; `blockFindings` holds an effect to the same "at or below the scope this block was given"
  test it already applied to a clone and to a scope; the banner reports the effect count so "nothing
  was misplaced" can never be confused with "nothing was recorded". 239 effects, 0 findings.
- **Consequences the compiler pays for.** `brand`'s predicate is "uses its scope", and "names `_s$`"
  was a proxy for it that missed both of the above: with `bindEffect` taking the scope, 40 unbranded
  component declarations became 24, and widening the predicate to include `createElement` — the
  un-compiled walk, which opens its own bindings and takes no scope — closed the rest. The 24 that
  remain are genuinely static. Snapshots moved for exactly two reasons and nothing else: the effect
  call gained its leading `_s$`, and the components that fact newly brands gained their `_$block(…)`
  rebind.

**M7 — async and forms.** One resource with structural cancellation and `gen`-guarded staleness;
`KEEPALIVE` parking; transitions as scope forks; derived optimistic state; the `bind:` family with
DOM-compare and selection preservation; `linked`.

**M8 — consumers.** `packages/extra` and `kitchen-sink`. **The router is the acceptance test for the
whole design.** Its nine enumerated workarounds must all become deletions:
7 `value={() => state}` sites and the surrounding `{() => …}` wrappers (verified: 90 `() =>` in the
file); `contextState() || getMainBrowserRouter()` (the module-global context fallback);
14 uses of `createMarkerPair`/`clearRange`/`insertNodes`/`childToNodes` → `branch()`; the hand-rolled
`route === prevRoute && data === prevData` memo → the branch key; the `detached: true` scope plus
manual `disposeCurrentRoute` → branch disposal; the duplicated first render at :1691 (*"avoids 404
flash when Router effect hasn't run yet"*) → the stated mount schedule; `OutletLevelContext` depth
threading → slot parameters; `return useMemo(…) as unknown as JSXElement` → `Out` admits a Cell; the
`Link` relative-href bug (it reads `state.location()` at construction, so relative hrefs never
re-resolve, while `NavLink` sixty lines below reads it inside the memo and is correct).
**If the router still needs a workaround after M8, the design is wrong.** That is the falsifiable
criterion. Estimated: 300–400 lines shorter, almost entirely by deletion.

**What M3 → M8 looks like from the outside, stated so it is a declared state and not a discovery.**
`packages/extra` and `packages/kitchen-sink` are on the pre-M3 convention for five milestones, and the
consequences are:

- `packages/extra`'s suite is RED — 46 pass / 54 fail of 100, every failure one signature
  (`props.initialPath` off a Scope for 53 of them; the 54th is `config.base`, the same cause observed
  from inside a `createScope`, where `getOwner()` returns a Scope rather than `null` so the throw is
  displaced one frame into `initMemoryRouter`). Root `bun run test` therefore exits non-zero, and so
  does the CI job that runs it; `bun run test:gated` is the M2→M8 gate.
- **`packages/kitchen-sink` renders a BLANK PAGE.** `<div id="app"></div>` stays empty, with
  `TypeError: routes is not iterable` from `packages/extra/src/router.tsx`: `Router` reads
  `props.config` as a value while props are Cells, so `state.config.routes` is `undefined` and
  `precompileRoutes` iterates it. The reference application is blank at M3 for a reason that has
  nothing to do with the Provider defect the redesign exists to remove — that one is fixed — and it
  stays blank until this milestone.

- `packages/benchmark` is a THIRD consumer and was discovered by running a bar rather than declared
  here. `bench:ssr` exited 1 on `barqStatic.default()` — a compiled component invoked with no scope,
  which `block`'s entry guard turned into a `ScopeMissingError` the moment M5 branded it. It is one
  call site, it is fixed (`barqStatic.default(null)`, matching the two sections beside it), and it is
  written down here so the next agent to run a bar does not find it again. The benches are in no CI
  job; `bench:ssr`, `bench:eleven` and `test/throughput.test.ts` are the three the measured bars come
  from and all three are green.

Both `extra` and `kitchen-sink` are pinned by `packages/extra/src/m8-convention.test.ts`, which
asserts the package is *still* on the pre-M3 convention and that the runtime ABI has moved, so a migration that leaves the rows behind
fails and "blank page" cannot quietly come to mean something new.

**Why the codemod was not run early.** §8's `barq migrate` rewrites `props.x` to `props.x()` inside
component bodies, which is sound and is not the binding constraint: `packages/extra` is compiled by
Bun's `react-jsx` transform into `@barqjs/core/jsx-runtime` — the un-compiled authoring path §11 Q2
deletes — so no body rewrite reaches the defect, and `_$props` source lists cannot be emitted for it
at all. Running it early would also destroy the evidence this milestone needs: the router is the
acceptance test, its nine workarounds must become DELETIONS, and a mechanical `props.x()` pass
preserves all nine.

**M9 — deletion.** The old path goes. Mutation kill rate reported per optimisation pass.

**Codemod.** `barq migrate` ships with the compiler and does three mechanical rewrites: `props.x` →
`props.x()` inside component bodies (the compiler already assigns `SourceKind::PropsParam` at bind, so
this is a sound oxc rewrite), `useRef()` → a plain binding, `class={() => c()}` → `class={c()}`.
Estimated coverage 90%+. The residue is a **type error at the exact call site**, which is the desired
failure mode, because `Props<P>` makes an un-called Cell a type error in value position.

**The migration gate is the mutation suite, not the fixture suite.** No optimisation pass ships until a
mutation operator exists for it and no mutant survives.

---

## 9. MEASUREMENT PLAN

Every claim is a benchmark file plus a **Wilcoxon signed-rank p-value across ≥5 processes**, never a
single-run ratio. The methodology is the one `packages/benchmark` already uses.

### 9.1 Must not regress

1. **Reactivity: hold or beat all eleven rows** of `head-to-head.ts` vs `@solidjs/signals` 2.0
   (today 10 wins and 1 tie, `create: signal` being the tie). Rows 2, 3 and 11 should **improve** — components stop allocating owners
   and `ComputedNode` loses six slots. The epoch dedupe carries forward (ablated at 2.37x) and so does
   `markWave` (ablated at +7%/−2%). **Acceptance: no row regresses.**
2. **SSR: hold ≥2.10x** on the 100-row page (4.66 µs vs 9.88 µs today). *Restated at M5's repair
   round, because the criterion as written cannot be met or missed:* the ratio is against
   `solid-js@^1.9.3`, which resolves to whatever the lockfile last took, and it drifted to 1.86x on a
   Solid side that got 8% faster while barq stayed at 4.87 µs. **Hold barq's own absolute time at
   ≤4.7 µs median**, and re-state the ratio against a PINNED Solid version. §0.1 carries both numbers.
3. **DOM: hold or beat the three real wins** — text-hole update 1.37x, class update 1.29x, replace-all
   1.13x. **The other four (clone static tree 1.01x, insert single text hole 1.10x, create 100 rows
   1.03x, swap 2 of 200 1.10x) straddle 1.0 across processes and will be reported as parity, not
   defended as wins** — the benchmark file says so itself. The `class update` row must be **re-measured
   through emitted code**: today's 1.29x is measured through `setProp(el,'class',()=>…)`, which the
   compiler never emits, so that number is not currently attributable to anything.
4. **The calling convention's JS overhead is an accepted, bounded regression, not a neutral change.**
   §0.3: 11.537 vs 9.328 µs on a stub DOM — **1.24x**, independently reproduced at 1.16–1.24x. It is
   0% through happy-dom (D 516.21 vs A 535.64, D marginally ahead), which is the ground the convention
   is defended on. **Acceptance at M3: ≤1.25x on the stub-DOM mount benchmark, and parity within ±2%
   through a real DOM, measured in Chrome and not only in happy-dom** (§11 Q9: happy-dom has hidden
   four distinct bug classes on this project, so a fake-DOM parity result is not sufficient evidence
   on its own). If the real-browser number is a regression rather than parity, the convention is not
   reopened — §1 Correctness decides that — but the number is published beside the SSR and reactivity
   headlines rather than omitted, which is the failure mode §0.3 was corrected for.

### 9.2 New numbers the design is claiming

| Claim | Method | Target
| Claim | Method | Target |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
 |
|---|---|---|
| SSR fallback cliff deleted | `ssr-head-to-head.ts` with a `Loading` in the module | 202.73 µs → the 4–5 µs class |
| Zero Scope allocations per component | heap-snapshot object count for `Scope` after a 1,000-component 3-deep mount | 0 attributable to components (today: 1 per boundary/flow component plus 1 per Provider) |
| `NO_SCOPE` earns its flag | 1,000-row list of static cells, flag forced off vs on | must move an allocation count AND a wall-clock number, or the flag is deleted |
| Partial update is O(changed) | 10 of 1,000 rows, `MutationObserver` write count + JS comparison count | exactly 10 text writes |
| No-op class toggle is free | 1,000 elements with a conditional class, toggle something irrelevant | `MutationObserver` count 0; an integer compare |
| Control flow as emitted JS | 1,000 `{#if}`-equivalent cells, mount + update, vs the `<Show>` component form | fewer allocations and lower wall time |
| Marker elimination | `createTreeWalker(root, SHOW_COMMENT)` count per rendered page | 0 in client rendering |
| Listener teardown | leak oracle: registered-listener count after `dispose()` | 0 |
| Hydration, never priced before | node-reuse %, time from parse to first handled interaction, `focusKept`, `inputValueKept`; plus a deliberate-mismatch fixture measuring blast radius in nodes replaced | reuse 0% → 100% on match; blast radius = that branch only |
| SSR bytes with `hydratable` | bytes per 100-row page with and without branch instructions | reported alongside TTI, honestly, since today's headline prices hydration at zero |
| Shipped bytes | gzipped runtime, minimal app vs kitchen-sink | the delta is what is genuinely feature-gated |
| Mutant kill rate | one operator per optimisation pass over the whole corpus | 100%; any surviving mutant fails CI |

### 9.3 Claims explicitly withdrawn

- **"Removing `setProp` dispatch is worth 10–25% per write."** Measured 0–8% (§0.4). The pass is
  justified on capability.
- **"Component inlining is worth 30–40% of mount."** Measured 0% on happy-dom, 15% of JS overhead on a
  stub DOM (§0.3). Backlog.
- **"Thunk props are cheaper than value props once forwarded."** Measured parity, 6.73 vs 6.56 ns.
- **"`markWave` costs 7%."** Measured: it *earns* ~7% (§0.5).
- **"Class bitmasks reduce a conditional class list to an integer compare" (§3.5).** Not built at M5,
  and the numbers are the reason. `test/classbits.bench.ts` compares three arms over 80,000 class
  writes on 200 rows with the conditional flipping 1 frame in 8. **The channel in isolation: 2.2–2.7x
  faster than the object-literal form it would replace, 1.75–2.2x faster than the string form.**
  **End to end — the same write inside the fused record it is actually emitted in, driven by a signal
  and a flush: 1.10–1.21x**, because the reactive graph, not the class write, is the frame. That is
  §0.4's shape again, measured before anything was built on it rather than after. Against 10–20% on
  the most favourable workload it can be given, a bitmask costs a new `Op`, a new lowering for
  statically-keyed object class values, a hoisted name table, a new channel and its SSR half — and it
  applies to **1 of 128 corpus fixtures**. Revisit on a list benchmark where the class write is the
  measured cost, not on the strength of the isolated number.

---

## 10. OPEN QUESTIONS

Each is phrased so it can be answered in a sentence.

**Q1 — `props.x()` or `props.x`?** The design requires the call, so that one rule ("a Cell is called")
holds across props, context, rows, refs and slot arguments, and so a mis-read is a type error rather
than a silent copy. The price is a permanent, visible ergonomic regression against React and Solid at
every read site, and I have refused the compiler rewrite that would hide it because it fails the
"untransformed code has the same semantics" criterion. **Do you accept the call, or is prop-reading
ergonomics important enough to reopen it?**

**Q2 — scope-first or ambient?** `Comp($s, props)` makes mistiming a missing argument and costs
nothing measurable (11.537 vs 11.627 µs). It also makes the compiler a hard dependency: no CDN script
tag, no REPL, no Storybook without the plugin, no hand-written component that does not know the ABI.
**Is losing every un-compiled authoring story acceptable?**

**Q3 — keying default.** Index-keyed by default is cheapest-correct and never silently destroys focus
or media state; identity-keyed by default gives O(1) moves but recreates every row under immutable
updates. I chose index plus a compile-time diagnostic for stateful row DOM, which covers the
correctness half and leaves the performance half uncovered. **Index or identity?**

**Q4 — hydration bytes vs mismatch detection.** Svelte's branch-index comments (`<!--[0-->`) cost bytes
on the metric barq currently publishes and buy locally-recoverable mismatch; Vapor's logical index
costs zero bytes and cannot detect a mismatch. **Do you want the bytes number or the recovery?**

**Q5 — does the framework own CSS?** All three designs, and this one, declare scoping and extraction
out of scope and delete `packages/extra/src/css.ts` (a goober wrapper with a pragma shim that
re-implements element creation a fifth time). A compiler already parsing every template could scope
classes almost for free, so this is declining an opportunity on scope-discipline grounds.
**Framework-owned scoping, or ecosystem?**

**Q6 — how hard is the `Scope`-off-`ComputedNode` split gated?** It takes six slots off the hottest
object, but nodes that *do* own things pay an extra allocation and an indirection, and the shape change
may perturb inline caches the current monomorphic discipline was tuned around — `signals.ts:223-232`
documents that the opposite tradeoff was chosen deliberately for the async fields. **If it measures
neutral rather than positive on the eleven cases, do we keep it for the ownership clarity or revert it?**

**Q7 — transitions.** `KEEPALIVE` parking and transitions-as-scope-forks are the least designed part of
this document and they are load-bearing for the async story. Unspecified: what a write to a parked
subtree does, whether parked effects are suspended or merely detached, and — the hard one — what
happens when the live scope and the pending transition scope both write the same signal. Nobody solves
that last one without a copy-on-write reactive graph. **Is a transition allowed to fork the graph, or
must it be expressible with scope forks alone?**

**Q8 — M0 discipline.** The oracle work (SEMANTICS.md, the ownership trace, the `Backend` trait, `-O0`,
`Interp`) must land before any semantic change and has no user-visible payoff. If it is truncated under
pressure, the design ships with strictly less verification than the system it replaces. **Is M0 a hard
gate, or may M2/M3 start in parallel?**

**Q9 — inlining.** I measured it at 0% against a DOM and moved it to the backlog. It is still the only
thing that removes the component frame entirely, and it may matter more in a real browser than in
happy-dom. **Do you want it re-measured in Chrome and Firefox before it is written off, or is the
happy-dom result enough?**

---

## 11. DECISIONS (2026-08-09)

Answered by the user. These are settled; implementation follows them without re-litigating.

**Q1 — `props.x()`. ACCEPTED.** One rule holds across props, context, rows, refs and slot arguments:
a Cell is called. A mis-read is a type error rather than a silent copy. The ergonomic cost against
React and Solid is accepted, and the compiler rewrite that would hide it stays refused — it fails the
"untransformed code has the same semantics" criterion, and Vue shipped that feature and removed it.

**Q2 — the compiler is a hard dependency. ACCEPTED.** There is one calling convention. No un-compiled
authoring path: no CDN script tag, no REPL, no Storybook without the plugin, no hand-written
component that does not know the ABI. A second implementation of component invocation is the root
cause of the Provider bug, and the generated `Interp` backend covers the testing and REPL needs that
the un-compiled path was serving.

**Q3 — index-keyed by default, plus the compile-time diagnostic. ACCEPTED.** Cheapest-correct, never
silently destroys focus or media state. The diagnostic fires when a keyless row block contains
stateful DOM, which only a compiler can see. The performance half stays uncovered by default and is
opt-in via `keyed`.

**Q8 — M0 is a HARD GATE. ACCEPTED.** No semantic change lands until `SEMANTICS.md`, the `Backend`
trait, the `Interp` reference and the ownership trace exist and every fixture passes against `Interp`.
M2 and M3 do not start in parallel. The Provider bug is what shipped when verification lagged
implementation, and the old harness — whatever its blindness — is why seven milestones shipped
without a silently-wrong compiler.

### Q4–Q7, Q9 — not M0-blocking; decided by Claude, revisit on evidence

**Q4 — hydration: take the bytes, get the recovery.** Branch-index comments over Vapor's zero-byte
logical index. This project has already shipped two silent-failure classes (the Provider bug and
`keyed={fn}`), and the ergonomics research found silent failure is the dominant harm in this class of
framework. A locally-recoverable mismatch beats a smaller payload with no detection. Revisit if the
measured byte cost is material on a real page.

**Q5 — CSS scoping is ecosystem, not framework.** Declining the opportunity on scope discipline.
`packages/extra/src/css.ts` is deleted as planned; it is a goober wrapper whose pragma shim
re-implements element creation a fifth time. Revisit after M3, when the compiler already parses every
template and the marginal cost is visible.

**Q6 — gate the `Scope`-off-`ComputedNode` split on measurement, and revert if neutral.**
`signals.ts:223-232` documents that the opposite tradeoff was chosen deliberately for the async
fields, and the shape change may perturb inline caches the current monomorphic discipline was tuned
around. Ownership clarity is not worth a shape change without a number.

**ANSWERED at the M2 gate round: the split measures POSITIVE, so it stays.** M2 shipped it with "the
split ships only if it measures" written into the commit message and no measurement recorded anywhere,
which left it kept on NO result rather than on a neutral one. The number now exists. The probe puts
six always-present ownership slots back on the base shape — the SLOT half of the question, isolated,
with `_owner`/`_scope` and every code path left alone — and runs the eleven cases, twice each way:

| case (barq ns, A min) | split | +6 slots on the base shape |
|---|---|---|
| dispose: root with 50 memos | 33610 / 34759 | **37457 / 37615** |
| create: root + signal + effect + flush + dispose | 94.3 / 94.2 | **99.4 / 100.2** |
| every other row | — | within noise |

The two owner-heavy rows are 8-11% and ~6% slower with the slots back, reproducibly, and `dispose:
root with 50 memos` moves from 0.65-0.67x of Solid to 0.74-0.75x. Nothing regressed. What the probe
does NOT measure is the indirection half — the extra allocation a node that DOES own something pays —
because that needs the full four-edit revert; the rows above are the ones where that cost would show
up most and they got faster, which bounds it. The revert instructions stay at the field site.

**Q7 — OVERRULED by the user. Transitions get a real design, modelled on Solid 2.0.**
My answer was "scope forks only, defer the hard case", and the user rejected it: deferring the one
case nobody solves without a forked graph is not a design, it is the absence of one. The intent is
proper transitions in the Solid 2.0 sense, not a scope-fork approximation.

Not designed yet, and deliberately not researched yet — the user has deprioritised further research
until the work already in flight lands. Until that design exists:
 - §3.8's transition story is UNSETTLED. Do not implement against it.
 - Nothing may be built on `KEEPALIVE` parking.
 - M7 (async and forms) cannot start until this is designed, since transitions are load-bearing for
   the async story.
The three questions the design must answer: what a write to a parked subtree does, whether parked
effects are suspended or merely detached, and what happens when the live scope and the pending
transition scope write the same signal. Solid 2.0's `@solidjs/signals` is the reference to read.

**Q9 — re-measure inlining in real Chrome before writing it off.** happy-dom has hidden four distinct
bug classes on this project (HTML tree construction, NULL rewriting, SVG `className`, a text run split
at `>`), so a 0% happy-dom result is not sufficient evidence. Cheap to check; stays backlogged either
way until the M0 gate passes.

### Carried into M0 from the adversarial review

1. **`packages/testing` has the identical bug and appears zero times in this document.**
   `packages/testing/src/index.ts:74` is `const wrappedUi = wrapper ? () => wrapper({ children: ui() }) : ui;`
   — the same eager-children shape, and its own JSDoc example is a `ThemeProvider` wrapper. Reproduced:
   `THREW:ContextNotFoundError`. The framework's own test harness cannot test a context-consuming
   component. It is a 445-line shipped package and it is a first-class consumer of the new contract.
2. **§3.1 O4 contradicts §7.1.** O4 says the only `try/finally` in the system is where a `catch` was
   already required; §7.1's own `provide` is `try { return block(c) } finally { exit(c) }`. The
   prototype needed the `finally` — without it a throw inside a Block leaves `CURRENT` dangling.
   Resolve by weakening O4, and specify which scope a catcher restores to.
   **RESOLVED.** §3.1 O4 is rewritten as O4.1–O4.5: restoration is required on both paths and
   `provide`'s `finally` is conforming; the surviving claim is the *cost* claim (no `try` per
   component call, none per element) and the load-bearing clause is O4.5, not O4.1. A catcher restores
   `CURRENT` to `prev`, captured on the statement before its own `enter` — not `s.parent`, not
   `getOwner()` at catch time, both of which are wrong under `pin` — and every scope entered after
   `prev` is disposed rather than abandoned. Normative statement: `SEMANTICS.md` §2 O4, pinned by
   `sem-err-current-restored-after-throw`.
3. **`Cell` and `Block` have different calling conventions** (`x()` vs `x($s)`) and C4's
   `Props<P> = { [K in keyof P]-?: Cell<P[K]> }` contradicts §3.0's
   `Props = { [k: string]: Cell<unknown> | Block }`. A consumer holding an opaque `props.children`
   cannot tell which it has. Reconcilable if a Cell ignores an extra argument — but say so, fix C4's
   type, and give C5 a rule for a Block landing in a Cell slot.
   **RESOLVED.** §3.0 now states `Cell<T> = (...ignored: never[]) => T` explicitly, plus four calling
   rules: a Cell ignores every argument; a Cell is therefore safe in a Block slot and a Block is not
   safe in a Cell slot; a Block invoked without a scope throws `ScopeMissingError` and **never** falls
   back to `CURRENT`; kind travels with the value, not with the name. C4's type becomes
   `Props<P> = { [K in keyof P]-?: Slot<P[K]> }` with `Slot<T> = T extends Out ? Cell<T> | Block : Cell<T>`,
   which makes §3.0's unparameterised `Props` its erasure rather than a rival claim. C5 gains the
   Block-in-a-Cell-slot rule: an in-module diagnostic at the forwarding site, a runtime throw across a
   module boundary where §3.13 item 1 says the compiler cannot know. Normative statement:
   `SEMANTICS.md` C3.6–C3.9, C4, C5.1–C5.2, pinned by `sem-props-block-in-cell-slot`.
4. **§0.3 buries a 23.7% JS-overhead regression** in the chosen convention (§0.2's `A current
   9.328 us` against §0.3's `D 11.537 us`), comparing only B/C/D/E and calling it noise. Independently
   reproduced at 1.16–1.24x. The convention still stands — it is 0% against a real DOM — but the
   number belongs in §0.3 and in the measurement plan.
   **RESOLVED.** §0.3's table now carries the A row with ratios, and a fourth conclusion states the
   1.24x plainly, names the omission as the same failure this document withdrew three rivals' claims
   for, and separates what the convention stands on (structural correctness, §1) from what it does not
   (being free in JS, which it is not). §9.1 gains item 4: acceptance ≤1.25x on the stub-DOM benchmark
   and ±2% parity through a **real browser**, since §11 Q9 records that happy-dom has hidden four
   distinct bug classes on this project.
