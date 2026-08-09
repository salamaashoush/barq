# Ergonomics — what breaks silently, what we should fix, and what we should refuse

> **Status: research, not a plan of record.** Every behavioural claim below was compiled through
> `barq-compiler.linux-x64-gnu.node` or read out of `packages/core` at the cited line. Where a claim
> came from a research packet and was *not* reproduced here, it is marked **unverified**. Where the
> research is thin, §7 says so instead of padding.
>
> Three findings in §4 are **live defects that ship today**, not ergonomic wishes. They are ranked
> first for that reason.

---

## 1. The shape of the problem

### Pattern A — one failure signature covers two thirds of every complaint list

*First render correct. Never updates again. No diagnostic.*

Destructuring props, `splitProps`, `const doubled = count * 2`, `` `${count}` ``, `Provider
value={count()}`, `onClick={props.onClick}`, `.map()` in a JSX child, early return from a component,
tracking lost after `await` — these look like nine bugs and are one operation: **a reactive edge was
read exactly once and the result stored.** A React developer's whole debugging vocabulary (add a
log, check the dep array, check the key, check StrictMode) returns "the value is right" every time,
because the value *was* right — once.

The ecosystem's answer to this is a linter that guesses. `eslint-plugin-solid` decides reactivity by
**name**: it permits `createSignal(props.initialCount)` and `props.staticName` because of the
identifier prefix, and its own docs concede the rule is ["limited to variable references; can't
analyze all reactive expressions"](https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/reactivity.md).

barq answers the same question by `SymbolId`. `Prim::of_export` (`src/ir/symbols.rs:125`) resolves by
module specifier plus imported name, so `import { signal as sig }` classifies and a user's
`const signal = 1` does not. That is a real, publishable differentiator — and §3 explains why it
argues for *diagnostics* rather than for the transform it superficially seems to unlock.

### Pattern B — barq is two languages sharing one syntax, and nothing verifies which one you are in

Compiled, props cross component boundaries as getters and JSX holes are live bindings. Uncompiled,
`createElement` copies `{ ...props }` and every hole is read once. The only marker distinguishing
them is `IsCompilerMode` (`packages/core/src/config.ts:63`), a **global type-level declaration that
nothing checks in either direction**. Turn it on in a package (`packages/kitchen-sink/src/barq.d.ts:7`
does exactly this, package-wide) and let one file escape the Vite plugin — a `bun test`, a Storybook
story, an SSR entry — and `when={count() > 5}` typechecks and freezes at its mount value forever.

All 111 fixtures are written in the explicit-thunk dialect that `IsCompilerMode` exists to make
unnecessary. **The ergonomic mode is the untested mode.**

### Pattern C — the inversions are where barq is currently *worse* than Solid, and they are not compiler problems

The ecosystem moved toward explicitness (Svelte runes, Vue removing its reactivity transform,
Ryan Carniato rejecting undestructure twice). barq followed that, correctly. But **nobody retreated
from keeping the helpers lazy**, and barq did:

| | Solid | barq |
|---|---|---|
| `splitProps`/`mergeProps` | forwarding proxies, edge survives | `for..in` value copy, edge dies — `packages/core/src/components.ts:1240-1252` |
| `render(fn, el)` | wraps in a root; dispose is real | takes a built node, opens no scope, dispose is `container.textContent = ""` — `packages/core/src/dom.ts:1112-1138` |
| `<Show>` default | non-keyed | keyed — `packages/core/src/components.ts:138` |
| `.map()` in a JSX child | re-renders (blanket wrap) | **frozen** — verified below |

These are not ergonomic debates. They are defects where barq loses a comparison it should win, and
none of them touch harvest.

---

## 2. What applies to barq and what does not

### Already avoided — drop these complaints rather than restating them

| Solid complaint | barq's position | Evidence |
|---|---|---|
| `createSignal` returns a tuple you must name twice, no `peek` | `signal()` is one callable carrying `.set`/`.update`/`.peek`. Load-bearing for the compiler too: `SourceKind::Accessor { nonreactive: MemberMask::SIGNAL }` lets one identifier answer three questions correctly | `packages/core/src/signals.ts:1136`, `src/analysis/bind.rs:321`, `src/ir/symbols.rs:20` |
| `useContext` returns `undefined` in four situations | Throws `ContextNotFoundError` / `NoOwnerError`. This is the wrapper Solid's docs tell every user to hand-write, shipped in the primitive | `packages/core/src/signals.ts:2313`, `:2375` |
| Dep arrays silently absorbed as `initialValue` | `effect(compute, apply)` types its second parameter as a function; an array literal is a type error | `packages/core/src/signals.ts:1456` |
| JSX props blanket-wrapped in getters, so `p={Math.random()}` re-executes per read | A getter is emitted **only** for a value the analysis proved reactive. Verified: `<B p={Math.random()} />` → `B({ p: Math.random() })`, evaluated once, matching the uncompiled oracle exactly | `src/passes/shape.rs:320-328` |
| `value={undefined}` prints the string `"undefined"` | Attribute path treats null/undefined/false as removal | `packages/core/src/dom.ts:668`, `:686`, `:965` — **property path unverified**, see §7 |
| `For` vs `Index` are two components | Merged behind `For keyed={false}`, which delegates to `Index`. `Index` still exists as a separate export | `packages/core/src/components.ts:239-245`, `:445` |
| No dev warnings for reactivity mistakes | `DEV.diagnostics` is a typed, subscribable, capturable stream with six emitters and a zero-cost gate. Better than Solid has | `packages/core/src/signals.ts:120-179`, `packages/core/src/diagnostics.test.ts` |
| Tests need `flush()` everywhere | `@barqjs/testing` already flushes after every `fireEvent` dispatch and in `act()` | `packages/testing/src/index.ts:228-256` |
| `className`/`htmlFor`/camelCase style | **Silently normalised by both paths.** Verified: `<input className="x">` compiles to template `<input class="x">` | `src/lower/names.rs:8`, `packages/core/src/dom.ts:474` |

### Lands identically or worse

| Complaint | barq | Evidence |
|---|---|---|
| Destructuring props kills reactivity | Identical. `function Chip({text,tone})` → `_$setProp(_el$1,"data-tone",tone)`, applied once. The fixture that pins this calls it "the commonest way real code loses reactivity by accident" and pins the silent behaviour as correct | verified compile; `fixtures/props-destructured-param.tsx:5-18` |
| `splitProps`/`mergeProps` flatten getters | Identical, and **four times over** (`splitProps`, `mergeProps`, `merge`, `omit`) | `packages/core/src/components.ts:1240`, `:1264`, `:1300`, `:1315` |
| Provider `value` not reactive | Worse. `<Ctx.Provider value={s()}>` compiles to `get value()`, which Provider reads **once** at setup and stores | verified compile; `packages/core/src/signals.ts:2285` |
| Eager control-flow children | Worse. `<Ctx.Provider value={v}><Consumer /></Ctx.Provider>` compiles to `children: Consumer({})` — evaluated as an *argument*, before Provider runs, before the context is set. The `{() => (...)}` pyramid in `packages/extra/src/router.tsx:1767` is not stylistic; it is load-bearing | verified compile |
| `.map()` instead of `<For>` | **Worse than Solid.** `<ul>{items().map(i => <li>{i.name}</li>)}</ul>` compiles to `_$insert(_el$1, items().map(...))` — an array of Nodes, inserted once, with `items()` read outside any effect. Solid's blanket wrap makes the same code re-render. barq's list is frozen | verified compile |
| `<Show>` keyed default | **Inverted** relative to Solid, and the non-keyed alternative is broken (§4.3) | `packages/core/src/components.ts:138` |
| `useState` under a React name | Element 0 is an accessor. `` `${firstName} ${lastName}` `` renders `"() => s() () => s()"` and typechecks clean. This ships in the demo app | `packages/core/src/hooks.ts:11`; `packages/kitchen-sink/src/demos/SignalsDemo.tsx:78` |
| Write-then-read is stale | Inherited by design (microtask flush). Mitigated in `@barqjs/testing`, unmitigated in app code — correctly so | core invariant |

---

## 3. The prior art verdict

> **This is the thinnest section in the document.** The prior-art research packet came back `null` —
> nobody researched Vue, Svelte or the React Compiler for this. What follows is stated from general
> knowledge and should be **verified before it is cited in a design decision**. The conclusion it
> supports is independently supported by evidence I did verify, which is why it is here at all.

Three data points, all pointing the same way:

1. **Vue shipped a reactivity transform that hid `.value`, then removed it.** It was experimental in
   3.3 and deprecated out of core in 3.4, surviving only as an opt-in macro package. The stated
   reason was that it made the reactivity of a variable depend on where it was declared rather than
   on how it was written.
2. **Svelte moved from implicit `$:` reactivity to explicit runes** in Svelte 5, for essentially the
   same reason: implicit reactivity did not compose across module boundaries and the compiler's
   inference was not something a reader could run in their head.
3. **The React Compiler has explicit bail-out rules** for what static analysis must not conclude,
   plus a `"use no memo"` escape hatch. It is deliberately conservative and does not attempt
   cross-module inference.

And one data point I *did* verify, which is stronger than all three:

```
import { count } from "./store";
export const A = () => <p>{count * 2}</p>;
```

compiles to `_$insert(_el$1, count * 2)` with `count` classified `Opaque`, because
`Binder::imports` (`src/analysis/bind.rs:140-145`) resolves imports **only** when the declaration's
source equals `module_source` — i.e. only direct imports from `@barqjs/core`.

**What this implies for barq.**

- SymbolId resolution does **not** close the cross-module gap Ryan Carniato named. It makes the gap
  *precise*. A transform would have to either rewrite symbols it cannot classify (unsound) or skip
  them — and skipping is exactly the renders-correctly-once failure, now with the compiler's own
  rewrite standing between the author and the bug.
- The same evidence argues **against** something that otherwise looks attractive: "we resolve by
  SymbolId, so we can safely do the undestructure/implicit-accessor transform Solid refused." We
  cannot. The precision is real inside a module and absent across one, and a props object forwarded
  through a helper in another module is the normal case, not the exotic one.
- It argues **for** diagnostics, which have neither problem. A diagnostic that stays silent on a
  cross-module accessor is a false negative — the correct direction to fail.

---

## 4. The ranked proposals

Each carries: complaint → proposal → before/after → mechanism → **both reviewers' verdicts** →
silent-failure risk → value/cost. Where the two reviewers disagreed, both arguments are given.

---

### 4.1 `<For keyed={fn}>` is miscompiled and renders `undefined` — **live defect**

**Complaint.** `<For>` keyed by object identity destroys DOM on immutable updates (focus loss per
keystroke — [SO 72288357](https://stackoverflow.com/questions/72288357/solidjs-input-field-loses-focus-when-typing)).
The research proposed adding a `by={item => item.id}` prop.

**What is actually true.** The affordance already exists, undocumented, as `keyed={fn}`
(`packages/core/src/components.ts:222`, `:256`), and it is **miscompiled**.

- Runtime: `map.ts:57` sets `itemIsSignal = byIndex || keyFn !== undefined`, so with a key function
  the row item reaches children as an **accessor** (`map.ts:39-43` types it `map: (value: () => Item,
  index: () => number)`).
- Compiler: `bind.rs:450-462` computes `keyed` as *"no attribute named `keyed` whose value is the
  boolean literal `false`"*. A function-valued `keyed` therefore reads as `keyed = true`, and
  `bind.rs:466` classifies the row parameter as `SourceKind::RowValue` — a plain value.

Verified compile:

```jsx
<For each={t} keyed={(x) => x.id}>{(x) => <p>{x.text}</p>}</For>
```
```js
For({ each: t, keyed: (x) => x.id,
  children: (x) => { const _el$1 = _tmpl$1(); _$insert(_el$1, x.text); return _el$1; } })
```

`x` is a function at runtime. `x.text` is `undefined`. Permanently, silently, today.

**Proposal.** Not a new prop — a bug fix in `bind.rs::row_params`. Distinguish three states instead
of two: `keyed` absent or `true` → `[RowValue, accessor]`; `keyed={false}` → `[accessor, Inert]`;
`keyed={<any non-boolean-literal expression>}` → `[accessor, accessor]`. The third case is not
statically decidable in general (`keyed={cond ? fn : true}`), so the honest rule is: any
non-boolean-literal value forces the accessor attribution. Then either wire the dead
`ForProps.keyFn` (`components.ts:224`, accepted by the type, passed in seven tests, read by
nothing) to `props.keyed` or delete it. Then **document `keyed={fn}` as the answer** to the
immutable-update / focus-loss problem.

**Mechanism.** Compiler fix (`bind.rs`) + type cleanup. **Verdicts:** structural — *feasible, and
"the highest-value item on the whole map"*; adversarial — *the proposed `by` prop is infeasible
because it adds a second spelling of a live bug; the fix is mandatory first*. **They agree.**

**Silent-failure risk.** The fixture corpus has **no `keyed={fn}` case at all** across 111 fixtures,
which is why this shipped. Two fixtures are mandatory: a `keyed={fn}` case with a member read, and
an oracle case where the array is replaced with `{...item, text}` objects sharing an id. Note also
that O3's note (`shape.rs:273`) does **not** fire here, because `each={t}` is a provable signal — so
the one diagnostic that exists in this area is silent for the case where it is most needed.

**Value: high. Cost: small** (~20 lines + two fixtures).

---

### 4.2 `.map()` in a JSX child freezes the list — **live defect, and worse than Solid**

**Complaint.** [Solid docs](https://docs.solidjs.com/reference/components/for) and
`solid/prefer-for` treat `.map()` as a performance issue: correct output, no fine-grained updates.

**What is actually true in barq.** Verified compile:

```js
_$insert(_el$1, items().map((i) => { ... }))
```

The argument is an `Array` of `Node`s, not a function, so `dom.ts:954-963` takes the non-function
path and inserts once. `items()` is read outside any effect. **The list never re-renders on any
array change.** The complaint's own framing ("it produces correct output while discarding
fine-grained rendering") is false here — it produces *wrong* output.

**Proposal.** Warn at `DiagLevel::Warning` when a `.map()` call appears directly as a JSX child and
the callback yields JSX. `yields_jsx` (`bind.rs:553`) already performs exactly this test. Message
must say *the list never updates*, not *this is un-optimized*. **Do not autofix to `<For>`**: `For`'s
index is an accessor while `.map`'s is a number, so mechanically rewriting `i + 1` silently produces
string concatenation of a function — a wrong render generated by the fixer itself.

**Mechanism.** Compiler diagnostic. **Verdicts:** structural — *feasible-with-changes; detection
belongs in `bind`, not `shape`, because by the time shape sees the hole the nested JSX has become a
root of its own*; adversarial — *feasible as described, and under-rated by a category; should lead
M8 ahead of D1*. **They agree on substance; the placement note is structural's and is correct.**

**Silent-failure risk.** None for the diagnostic. Worth stating out loud: the uncompiled oracle
*agrees* with the frozen behaviour (`createElement` also evaluates once), so the differential
harness is green on a frozen list. **The oracle here enshrines the bug.** That is the one place in
this document where "matches the oracle" is not a correctness argument.

**Value: high. Cost: small.**

---

### 4.3 Non-keyed `<Show>` / `<Match>` bodies are already frozen in compiled output

**Complaint.** `<Show>` is keyed by default in barq — the inverse of Solid — so any change to a
truthy `when` value tears down and rebuilds the body, losing focus, scroll and node identity
(`components.ts:138`). The research proposed flipping the default to non-keyed.

**What is actually true.** The flip target is broken. `bind.rs::row_params` (`:465-470`) attributes
row parameters for `Flow::For`, `Flow::Index` and `Flow::Repeat` only; `Flow::Show` and `Flow::Match`
hit `_ => return`, so a `Show` children parameter stays `SourceKind::Opaque`. Verified compile:

```jsx
<Show when={() => u()} keyed={false}>{(v) => <p>{v().name}</p>}</Show>
```
```js
Show({ when: u, keyed: false,
  children: (v) => { const _el$1 = _tmpl$1(); _$insert(_el$1, v().name); return _el$1; } })
```

`v().name` is a string, evaluated once. `dom.ts:954` only opens a `renderEffect` for a function
argument. **Non-keyed `Show` never updates in compiled code.** The keyed default compiles to
`_$insert(_el$1, v.name)`, also once — which is *correct*, because the whole body is rebuilt.

**Proposal — and this is a demotion of what the research asked for.** Do **not** flip the default.
Instead: (1) extend `row_params` to attribute Show/Match children params as accessors when
non-keyed, so the mode the type union already advertises actually works; (2) add fixtures with an
object-valued `when` — every existing `Show` fixture uses a boolean `when`, where keyed and
non-keyed are behaviourally indistinguishable, so the corpus cannot see this; (3) document the keyed
default and the `keyed={false}` opt-out. Revisit the default only after (1) and (2) land.

**Mechanism.** Compiler fix + fixtures. **Verdicts:** structural — *the flip is
"feasible-but-unwise"; ship the diagnostic and docs, leave the default alone*; adversarial —
*the flip is "infeasible": it converts every `Show` from "rebuilds, correct" to "never rebuilds,
never updates"*. **Both reject the flip; adversarial's reason is the stronger one and I verified it.**

**Silent-failure risk.** Flipping the default without (1) is the project's worst failure shape
inflicted globally. Even *with* (1), the flip silently converts "remount the body when the record
changes" — a deliberate, widely used idiom — into "keep the old local state", with no diagnostic.
That is why the default question is deferred, not merely sequenced.

**Value: high. Cost: medium.**

---

### 4.4 `render()` opens no owner

**Complaint.** `onMount` never fires through the owner path, `onCleanup` emits `NO_OWNER_CLEANUP`
and never runs, and the returned dispose leaves every effect live against a cleared container. This
is the path the demo app uses (`packages/kitchen-sink/src/main.tsx:73`).

**Confirmed.** `packages/core/src/dom.ts:1112-1138`: `render` takes an already-constructed
`JSXElement`, appends it, and returns `() => { container.textContent = ""; }`. No scope. Because
`render(<App/>, el)` compiles to `render(App({}), el)` — `render` is not in the `Prim` table — the
whole tree is built *before* `render` is entered.

**Proposal.** Add an overload `render(fn: () => JSXElement, container)` that wraps construction in
`createScope` and returns the real dispose. Keep the eager form, emit a new DEV code
`RENDER_WITHOUT_ROOT` for it. Update `main.tsx` and `@barqjs/testing` (which re-exports core's
`render` at `packages/testing/src/index.ts:21` and inherits the bug) in the same pass.

**Before/after.** `render(<App />, container)` → `render(() => <App />, container)`. Emitted output
unchanged; `render` is invisible to every compiler stage.

**Mechanism.** Runtime. **Verdicts:** both reviewers *feasible as described*. **They agree.**

**Silent-failure risk.** The important one is stated by the proposal itself and must not be lost:
wrapping the *existing* body in `createScope` without the signature change produces a dispose that
**looks** real, disposes an empty root, and leaves the actual app effects running — a fix worse than
the bug, because it stops anyone from looking again.

**Value: high. Cost: small.**

---

### 4.5 `onMount` throws when the callback returns a non-function

**Complaint.** In the no-owner branch, `onMount` invokes the callback's return value unconditionally.
`onMount(() => logs.push("x"))` typechecks (`() => void | (() => void)` accepts it) and throws
`TypeError: cleanup is not a function` inside a `queueMicrotask` — uncatchable, unsourcemapped.

**Confirmed verbatim**, `packages/core/src/signals.ts:1649-1652`:

```ts
} else if (!owner) {
  cleanup = untrack(fn);
  cleanup?.();          // optional-call guards null/undefined only
}
```

`onSettled` is `export const onSettled = onMount` (`:1657`), so it is the same three lines.

**Proposal.** `if (typeof cleanup === "function") cleanup();`. Guard both call sites (`:1636` and
`:1651`) for symmetry.

**Mechanism.** Runtime. **Verdicts:** both *feasible as described*. **Agree.**

**Silent-failure risk.** None — strictly crash-to-no-crash. Land it **with** 4.4, not after: fixing
`render` first makes the no-owner branch rare and would mask this rather than fix it.

**Value: medium. Cost: trivial.**

---

### 4.6 D1 — accessor used without being called

**Complaint.** `MILESTONES.md` §5.2's own honest gap, and `ROADMAP.md`'s D1. `const doubled = count *
2` is `NaN`; `` `${count}` `` renders the function's source text. Live and broken in barq's own demo
app at `packages/kitchen-sink/src/demos/SignalsDemo.tsx:78`, under a nine-line header (`:5-9`)
advertising the deleted Babel plugin. `bun run --cwd packages/kitchen-sink typecheck` exits 0 over it.

**Proposal.** A diagnostic — **not** a rewrite. Record `(SymbolId, Span, PositionKind)` for
references to accessor-producing symbols during `bind`'s existing walk, then emit after `fixpoint()`
and `props_params()`.

**Two of the six report positions the research proposed are false positives.** Verified compile:

```jsx
<p title={count}>{count}</p>
```
```js
_$setProp(_el$1, "title", count);
_$insert(_el$1, count);
```

Both unwrap and track at runtime (`dom.ts:380`, `dom.ts:954`, `isSignalGetter` at
`type-utils.ts:30`). A bare accessor in a JSX child or attribute is **correct and fully reactive** —
that is `fixtures/auto-thunked-read.tsx`'s whole point. Warning there would fire on `<For each={items}>`,
`<Show when={count}>`, `<Child value={count} />`, `effect(count)` and `untrack(count)`.

**Narrow to genuine coercion contexts only:** arithmetic/relational `BinaryExpression` operands,
template-literal interpolation, `String()`/`JSON.stringify` arguments, `+` concatenation. Exclude
every JSX position and every argument position. TypeScript already catches the arithmetic half
(a function is not a number), so the unique value is the **template-literal and `String()` half** —
which is exactly `SignalsDemo.tsx:78`.

**Mechanism.** Compiler diagnostic. **Verdicts:** both *feasible-with-changes*, with different
changes, and **both sets are required**:

- **Structural:** the ordering is wrong as specified. `bind.rs:101-103` is `visit_program` → `fixpoint`
  → `props_params`; `env.kind` is all `Opaque` during the walk. Also `SemanticBuilder::new()`
  (`analysis/mod.rs:20`) does not build `AstNodes`, so there is no parent pointer to recover a span
  from a resolved reference. Both force collect-then-emit. And `Diag.message` is a `StrId`, so
  `Binder` needs the interner it does not currently hold.
- **Adversarial:** two report positions are false positives (above); and the analysis is **gated off
  for the files that matter** — `compile.rs:248` runs `bind` only `if source_type.is_jsx()` and the
  Vite plugin includes only `.tsx`/`.jsx`, so a `.ts` store or hooks module containing
  `const doubled = count * 2` gets nothing.

**Silent-failure risk.** None from the diagnostic. Two false-negative classes to state in the docs
rather than hide: cross-module accessors are `Opaque` (§3), and `.ts` files are not analysed at all.
Closing the `.ts` gap means lifting `is_jsx()`, widening the plugin's include list, and reprinting
every `.ts` file through oxc codegen — real throughput cost against the 22–27× claim and real
formatting churn. **Do not bundle it.**

**Value: high. Cost: medium.**

---

### 4.7 D3 — destructured props diagnostic

**Complaint.** [The single most-cited Solid complaint](https://github.com/solidjs/solid/discussions/2425);
dedicated ESLint rule `solid/no-destructure`; dedicated closed issue
[#2151](https://github.com/solidjs/solid/issues/2151). Lands identically in barq — verified,
`function Chip({text,tone})` → `_$setProp(_el$1,"data-tone",tone)`, once.

**Proposal.** Warn at the pattern's span, listing the drained keys and noting that a prop whose
*value* is an author-written accessor survives. **Do not rewrite** — see §5.7.

**Mechanism.** Compiler diagnostic. **Verdicts:** both *feasible-with-changes*, and both found the
same missing hook: `props_symbol` (`bind.rs:498-506`) returns `None` unless the single parameter is
a `BindingIdentifier`, so a destructured component **never becomes a candidate** and there is
nothing to "also check". The in-body form (`const { text } = props`) is a second detection again:
`Binder::record` (`bind.rs:391-430`) matches only `BindingIdentifier` and `ArrayPattern`, swallowing
`ObjectPattern` declarators entirely.

Needs a parallel `destructured: Vec<(Option<SymbolId>, Span, keys)>` list drained in
`props_params()` under the same tagged-or-exported evidence gate. **This shares D1's
collect-then-emit plumbing**, which is an argument for costing them together rather than
independently.

**Silent-failure risk.** None. The false negatives are correct-directional: `props_params`
(`bind.rs:252-263`) requires both halves of evidence, so a component that is neither tagged nor
exported in this module gets no warning.

**Value: high. Cost: medium** (small on top of D1).

---

### 4.8 Context — box the stored value; the eager-children hazard is live

**Complaint.** Three compounding problems: `useContext` always returns an accessor; a
function-valued context is indistinguishable from one; and Provider evaluates non-function children
eagerly. barq's own router pays all three
(`packages/extra/src/router.tsx:1767`, with the comment *"Must use function children so inner JSX is
evaluated AFTER context is set"*).

**Two things verified that raise the priority.**

1. In compiled mode `props.value` is a **getter**: `<Ctx.Provider value={s()}>` → `get value() {
   return s(); }`, which `signals.ts:2285` reads exactly once at setup and stores. **A compiled
   Provider given a raw reactive value is frozen today.** That is a stronger case for boxing than
   the function-value ambiguity the research led with.
2. `<Ctx.Provider value={v}><Consumer /></Ctx.Provider>` compiles to `children: Consumer({})` —
   evaluated as an argument, before `Provider` runs. The `{() => (...)}` pyramid is **required for
   correctness**, not stylistic, and should be documented as such rather than apologised for.

**Proposal — (a) only.** Box: `owner._context[id] = { v: props.value }`, unwrap-then-classify in
`useContext`/`getContext`/`setContext`/`hasContext`. Self-contained, ~10 lines, fixes a live
compiled-mode freeze.

**Reject (b)** (teach the compiler about Provider). **Verdicts:** structural — *(b) is
"feasible-with-changes" but much larger than "a `Prim` table row"; `shape.rs::callee` returns
`Callee::Component(chain, None)` for a `JSXMemberExpression`, symbol `None`, so `flow_of` can never
resolve it*; adversarial — *(b) is "infeasible": `Ctx.Provider` is a member of an object returned by
`createContext`, which is not in the `Prim` table, and `Ctx` is typically imported from a user
module; verified `const P = Ctx.Provider` compiles fully `Opaque`*. **They agree; adversarial's
compile is the harder evidence.** Worse, (b)'s children half **collides head-on with target #8**
(`shape.rs:302-312`), which guarantees the compiler never manufactures a thunk — so applying #8's
elision to Provider would ship the exact bug (b) was written to remove.

**Silent-failure risk.** For (a): none. For (b), if anyone revisits it: a Provider excluded from
thunk elision incorrectly produces consumers that silently pick up an *outer* provider's value,
which is worse than throwing.

**Value: high (a). Cost: small (a).**

---

### 4.9 `splitProps` / `mergeProps` / `merge` / `omit` flatten getters — **the reviewers disagree**

**Complaint.** All four copy values with `for..in` (`components.ts:1240`, `:1264`, `:1300`, `:1315`),
freezing every getter. This is the O7 `Dynamic` bug (`shape.rs:288`) four more times, and only
`Dynamic` warns.

**The disagreement, stated fairly.**

- **Structural: *feasible-with-changes, medium cost.*** Replace the four value copies with
  `Object.defineProperty(target, key, { get: () => props[key], enumerable: true, configurable: true })`
  — prefer `defineProperty` over `Proxy` so `Object.keys`/`in`/`JSON.stringify` semantics are
  unchanged. The compiler diagnostic is a belt, not the fix.
- **Adversarial: *infeasible as scoped.*** The runtime fix does not reach the bug in compiled code,
  for two independently verified reasons:
  - The consumer flattens anyway. `<span {...rest} />` compiles to `_$createElement("span", { ...rest })`
    — an object-literal spread, which invokes every own enumerable getter once at construction. It
    does **not** compile to the reactive `spread()` helper (`dom.ts:1005`), which is the only path
    that re-reads inside a `renderEffect`.
  - The named half is `Opaque`. `splitProps` is absent from `Prim::of_export`, so
    `const [l, r] = splitProps(props, ["size"])` gives `l` `Opaque` and `l.size` compiles to a
    plain applied-once read. Verified: `_$createElement("span", { ...r }, l.size)`.

**My reading.** Adversarial is right about the facts and structural is right that the work is
worth doing; they differ on *scope*, not on evidence. A runtime-only fix would pass an uncompiled
test and leave the product broken — and it would break the oracle in the worst direction, making
**uncompiled more reactive than compiled**, which is the inverse of O4's defensible divergence.

**Proposal.** Treat this as a **milestone, not a task**, in four ordered parts: (1) `Prim` rows +
`Binder::returns` shapes for the four helpers, so member reads become reactive and get thunked;
(2) decide what `{...rest}` on a host element must emit when `rest` is `PropsParam` — today's
object-literal spread must become a `spread(el, () => rest)` call, a real codegen change;
(3) the runtime `defineProperty` rewrite; (4) fixtures — `grep -l 'splitProps\|mergeProps'
fixtures/` returns **nothing** across 111 fixtures.

**Silent-failure risk.** High and worth spelling out: any prop whose value is side-effectful now
fires per read instead of once, which is precisely the tradeoff `prop_value` (`shape.rs:321-323`)
makes deliberately in the other direction. Mirror it — forward lazily, never make an
already-materialised value lazy.

**Value: high. Cost: large.**

---

### 4.10 `SIGNAL_SELF_WRITE_BLOCKED`

**Complaint.** Mutating an object in a signal and setting it back does nothing — default `===`
equality blocks the **write**, not just the notification. Three high-traffic SO questions
([71962713](https://stackoverflow.com/questions/71962713/how-do-i-simply-mutate-the-array-inside-a-signal),
[76830360](https://stackoverflow.com/questions/76830360/array-of-objects-isnt-reactive-in-solidjs),
[76533210](https://stackoverflow.com/questions/76533210/why-signal-update-is-not-reflected-in-the-ui)),
~12k views.

**Proposal.** New DEV emitter: when a write's value is `===` the current value **and** is a non-null
object, emit a warning naming the signal (`signals.ts:194` already carries `_name`). One conditional
in each of the two write paths (`signals.ts:965-970`, and the derived path), behind the existing `diagnosticsOn` fast
path. Solid has no diagnostic for this class at all.

**Mechanism.** Runtime diagnostic. **Verdicts:** both *feasible as described*. **Agree.**

**Silent-failure risk.** None. One inert false positive: `s.set(s.peek())` as a deliberate no-op.
**Visibility caveat that applies to every `DEV.diagnostics` proposal:** `diagnosticsOn` is false
until `addDiagnosticListener` runs (`signals.ts:120-129`), and a repo-wide grep finds subscribers
only in test files. In a browser, nobody is listening. **A default DEV-build console listener is a
prerequisite for this whole family**, and it is currently nobody's task.

**Value: medium. Cost: small.**

---

### 4.11 Early-return diagnostic

**Complaint.** `if (loading) return <Spinner/>` is the most universal React component shape and it
pins the branch forever. Needed its own ESLint rule upstream
([`solid/components-return-once`](https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/components-return-once.md))
with a multi-case autofixer.

**Proposal.** Syntactic check in `bind`'s `visit_function`: a `ReturnStatement` that is not the final
statement, in a function that also returns JSX. `statements_return_jsx` (`bind.rs:523-551`) already
walks exactly the statement forms involved. **Note level, dev-gated.** Do not desugar into a
`Switch`/`Match` chain (§5.8).

**Mechanism.** Compiler diagnostic. **Verdicts:** structural — *feasible as described, ~30 lines*;
adversarial — *feasible-with-changes; the false-positive rate is understated*. `function Icon(props){
if (props.variant === 'a') return <A/>; return <B/> }` is normal, correct code, and in compiled mode
`props.variant` is a getter, so the compiler cannot distinguish "constant for this instance" from
"reactive". Same for `if (import.meta.env.SSR) return …`.

**Resolution.** Take adversarial's narrowing: fire only when the guard's test reads a symbol
classified `Accessor`/`AccessorRecord`/`ReactiveObject`, not merely `PropsParam`. That covers
`r.loading()` and `count() > n` and excludes the constant-prop shape. Requires D1's post-fixpoint
pass. **Expect this to be the noisiest rule on the list even after narrowing** — `ROADMAP.md` names
false positives as the risk that sinks M8, and this is where it will bite.

**Value: medium. Cost: small** (on top of D1's plumbing).

---

### 4.12 `StrictChild` is dead surface area — apply it or delete it

**Complaint.** `StrictChild` is defined with worked examples at `packages/core/src/config.ts:135`,
re-exported at `packages/core/src/index.ts:88`, and **applied to nothing**. Confirmed by grep: those
two lines are the only occurrences in the repo. `ShowProps.children` is ungated; `Switch`/`Match`
write the same logic inline as an `IsCompilerMode` conditional.

**Proposal.** Apply it to the children props of Show/Match/Switch/For/Index/Repeat, and separately
tighten `Context.Provider`'s `children: unknown` (`signals.ts:2271`).

**Mechanism.** Type-level. **Verdicts:** both *feasible as described / with changes*. One
correction from adversarial: applying `StrictChild` to the flow components would **not** have caught
the Provider eager-children hazard, because that Provider's type lives in `signals.ts` and takes
`children: unknown`. Fixing it means changing Provider's own signature — which, given that the thunk
pyramid is currently mandatory for correctness (§4.8), is arguably right independent of the
`StrictChild` question.

**Silent-failure risk.** None (types only). Breaking for uncompiled call sites passing eager
children — which is the point.

**Value: low–medium. Cost: small.**

---

### 4.13 Type narrowing: export `narrow`/`isDef`, give `MatchProps` a `keyed` discriminant

**Complaint.** [Solid #1527](https://github.com/solidjs/solid/discussions/1527) /
[#1575](https://github.com/solidjs/solid/discussions/1575) /
[#2031](https://github.com/solidjs/solid/discussions/2031) — TypeScript cannot narrow across an
accessor call. Rarely blogged, drove at least one documented evaluator away.

**Proposal.** barq starts ahead: `ShowProps` is already a discriminated union on `keyed` with
`NonNullable<T>` / `() => NonNullable<T>` children (`components.ts:113-125`). Three gaps: (a) export
`narrow`/`isDef` accessor type guards that every app currently hand-rolls; (b) give `MatchProps`
(`components.ts:515-517`) the same `keyed` discriminant; (c) **document that the bare
discriminated-union case in non-callback children is unfixable at the type level** — JSX children
are not a narrowed lexical scope and no `.d.ts` can make them one.

**Mechanism.** Type-level, no compiler surface. **Verdicts:** structural — *feasible as described*;
adversarial — *feasible-with-changes*, with the same trap as §4.3: add **only** the keyed narrowing
branch to `MatchProps`. Mirroring Show's *non-keyed* branch onto Match would typecheck and freeze,
because `row_params` does not classify Match children either. **Adversarial is right; take the
narrowing.**

**Silent-failure risk.** None. Document that `keyed` costs a subtree rebuild, so it is not a pure
typing device.

**Value: medium. Cost: small.**

---

### 4.14 `onChange` on a text input

**Complaint.** React's `onChange` fires per keystroke; the native `change` event fires on blur. A
React developer's controlled-input pattern appears to "lag by one field" and reads as a reactivity
bug.

**Confirmed.** `<input onChange={e => 0} />` compiles to `_el$1.addEventListener("change", _h$1)`.
Genuine native semantics.

**Proposal.** Warn on `onChange` bound to a text-like `input`/`textarea`/`select`, naming `onInput`.
Emit from P1 `lower`, where the name is already being inspected and the tag is in hand
(`src/lower/names.rs:32`, `:53`). **This is the only survivor of the "React-isms" rule family** —
see §5.5.

**Mechanism.** Compiler diagnostic. **Verdicts:** structural — *feasible-but-unwise as a family;
ship this one alone*; adversarial — *same conclusion, verified by compile*. **Agree.**

**Silent-failure risk.** None.

**Value: medium. Cost: small.**

---

### 4.15 Repo hygiene: the demo app advertises a deleted feature and ships a broken line

**Complaint.** `packages/kitchen-sink/src/demos/SignalsDemo.tsx:5-9` is a nine-line header promising
*"Signal reads: `count` instead of `count()`"*, *"JSX expressions: `{count + 1}`"* and
*"Auto-computed: `const doubled = count * 2`"* — three capabilities the pipeline cannot host and one
(`when={visible}`) that is real. Line 78 restates the claim inline directly above
`` const fullName = `${firstName} ${lastName}` ``, which renders the function source text.
`ComponentsDemo.tsx:5` and `StoreDemo.tsx:5` carry the same stale header.

**Proposal.** Fix line 78, delete three headers, switch `main.tsx:73` to the thunk form once §4.4
lands. Configure `typescript-eslint`'s `restrict-template-expressions` on the package — it would
have caught line 78 and will catch the next one, including in `.ts` files that D1 cannot see.

**Mechanism.** Docs/hygiene. **Verdicts:** both *feasible as described*. **Agree.**

**Value: medium** — this is the shop window, and it currently demonstrates the opposite of the
project's thesis. **Cost: trivial.**

---

### 4.16 Naming and documentation (batched)

Four items, all docs, no mechanism risk. Both reviewers concur on all four.

- **Do not add `create*` aliases.** `createSignal` would have to return either barq's callable
  (wrong shape for a name that promises a tuple) or a tuple (a fourth shape for one concept, needing
  its own `Produced` row). Publish a Solid→barq / React→barq mapping table instead, and name the
  Solid-style family canonical — the `Prim` table and the `MemberMask::SIGNAL` design are built
  around `signal`'s callable shape.
- **Deprecate the React aliases** rather than repair them. `useState`'s slot 0 is an accessor while
  `useStore`'s is a value and `useMemo` returns a `Computed` — three shapes behind one prefix. A
  familiar name that means something else is worse than an unfamiliar one. Do **not** try to make
  `useState` React-shaped; a value in slot 0 is the implicit-accessor feature under another name.
- **Deprecate `Index`** in favour of `For keyed={false}`. Document that `keyed` now has **three**
  meanings, not two: absent/true (row value), `false` (row accessor, index number), a key function
  (row accessor, index accessor). Ship this **after** §4.1, not bundled with any `Show` change.
- **Store setter:** document the draft/`produce` form as the default idiom; leave the variadic path
  form alone. Cost the deep recursive path types on a large store shape before attempting them.

---

## 5. What we should not do

A roadmap with no rejections is not a roadmap. Each of these looked attractive in the research and
has a concrete counterexample.

### 5.1 `UNCOMPILED_RAW_FLOW_PROP` — the runtime emitter for the compiler-mode gap

**Proposed:** when a flow component hits the defensive `typeof props.when === "function" ? … : …`
else-branch (`components.ts:135`), emit a DEV diagnostic, because "compiled output never passes a
raw value for the five unwrapped flow props".

**Killed.** The premise is false. `shape.rs:324` emits a **getter**, not a function:

```jsx
<Show when={n() > 5}><p>big</p></Show>
```
```js
Show({ get when() { return n() > 5; }, children: _tmpl$1() })
```

Reading `props.when` yields a boolean, so `typeof … === "function"` is **false** and the else-branch
runs on the most common compiled `Show` in existence. Only the eta-reduced shape (`when={() => n()>5}`
→ `when: () => n()>5`) and `each: xs` yield functions. The diagnostic has zero discriminating power.

**What survives.** The paired suggestion — a **Vite-plugin-side check** that every file matching the
include globs actually passed through `transform` — is sound in both directions and needs no runtime
change. Ship that. A runtime signal is possible in principle
(`Object.getOwnPropertyDescriptor(props,'when')?.get !== undefined` proves compilation) but cannot
distinguish a compiled `when={true}` from an uncompiled raw read, so it is not worth the branch.

### 5.2 Flipping `<Show>`'s default to non-keyed

**Killed** — see §4.3. Non-keyed `Show` compiles to an applied-once read today, so the flip converts
every `Show` from "rebuilds, correct" to "never rebuilds, never updates", and the corpus stays green
through it because every `Show` fixture uses a boolean `when`.

### 5.3 A `by={item => item.id}` prop on `<For>`

**Killed** — see §4.1. The affordance already exists as `keyed={fn}` and is miscompiled. Adding a
second spelling adds a second spelling of the bug, and the proposal's own before/after (an `<input>`
surviving an immutable update) would render a preserved node with permanently `undefined` text.

### 5.4 Late-resolving event handlers via a `(source, key)` expando

**Proposed:** store `el.$$click = {s: props, k: 'onClick'}` so a forwarded handler rebinds.

**Killed.** There is no `$$click` expando on that path. Verified:

```jsx
<button onClick={props.onClick}>x</button>
```
```js
_$setProp(_el$1, "onClick", props.onClick);
```

`classify.rs::event` (`:172-178`) requires shape `Handler`/`Accessor`/`HandlerTuple`; a static member
read on a `PropsParam` is none of those, so the compiler declines the event entirely and the runtime
resolves once. `getter_shaped` never enters it. The cheap-looking alternative (emit a thunk and let
`applyProp` unwrap) collides with `isSignalGetter` being literally `typeof value === "function"`
(`type-utils.ts:30`) — the runtime **cannot** distinguish a handler from an accessor returning one,
so it would bind the thunk itself. Fixing this starts in the runtime's value protocol, not in
codegen. **Also note the oracle problem:** a compiled `{s,k}` expando and an uncompiled resolved
function differ in identity, in `removeEventListener` behaviour, and in how many times the props
getter runs per click — and nothing in `IsCompilerMode` declares that divergence.

**Recommendation:** document the freeze and stop. The identity guarantee it buys is load-bearing.

### 5.5 Warning on `className` / `htmlFor` / camelCase style keys

**Killed** for three of four. Verified: `<input className="x" style={{fontSize:14}} />` compiles to
template `<input class="x">` — the compiler already normalises silently (`src/lower/names.rs:8`),
and the runtime agrees (`dom.ts:474`). Warning here teaches authors that
**working code is broken**, which is the fastest route to getting the whole diagnostic channel
switched off — the exact risk `ROADMAP.md` names as the one that sinks M8. Only `onChange` survives
(§4.14).

One residual worth a separate look: the silent `className` → `class` rename would break a component
legitimately forwarding a prop named `className` to a third-party consumer. That is a possible
existing bug in the name table, and it is a different argument from the diagnostic one.

### 5.6 A note when `getter_shaped` refuses a getter

**Proposed:** warn when `rx.react == React::Reactive && !getter_shaped(rx)`, for cases like
`render={props.on ? () => props.long() : () => props.short()}`.

**Killed as specified — reviewers split, adversarial is right.** Structural rated it *"feasible as
described, three lines, the cheapest item on the map"*; adversarial rated it *infeasible* because the
predicate never matches the headline example. Verified:

```js
Chip({ render: props.on ? () => props.long() : () => props.short(),
       get tone() { return props.label; } })
```

`render` is a plain property. `getter_shaped` (`shape.rs:523`) is false only for
`Accessor`/`Handler`/`HandlerTuple`; a `ConditionalExpression` of arrows is none of those, so
`getter_shaped` was **true** — meaning the branch actually taken was `rx.react != Reactive`. The
proposed predicate matches *only* the forwarded-handler shapes, where the freeze is correct and a
note is pure noise.

**What survives.** Structural's point that the *emit site* is right stands. The predicate that would
be useful is a new one — "contains a reactive read but did not classify as `Reactive`", answerable
from a non-empty `DepSet` mask with `react == Opaque`, which `ir/react.rs` does not currently
expose. Cheap, but a different rule. Not scheduled.

### 5.7 Restoring implicit accessor calls / adding a props-undestructure transform

**Killed — and the usual argument for killing it is wrong.**

The architectural claim in `MILESTONES.md` §5.2, `README.md`, and `index.d.ts`'s own doc comment —
that the pipeline "structurally cannot host" this because lowering takes no `Program` and codegen
only splices at recorded sites — **is checkable and false**. `codegen/mod.rs:321` is
`impl<'a> VisitMut<'a> for Emit<'a, '_>`, walking every statement and expression in the module with
`&mut Program`, carrying `module.env` and `module.scoping`. A SymbolId-resolved accessor-insertion
rewrite is mechanically reachable there today, with no harvest change and no new `Site` variant.
Sourcemaps would survive, since oxc maps by span.

**What actually kills it is soundness, and that kills it thoroughly.** Verified in §3:
`import { count } from "./store"` classifies `Opaque`, because `Binder::imports` resolves only
imports whose source equals `module_source`. So the transform would have to skip exactly the symbols
whose skipping produces "renders correctly once" — with the compiler's own rewrite standing between
the author and the bug. And the transform is not total in a second way: rewriting
`const doubled = count * 2` into a thunk forces **every consumer of `doubled`** to become a call,
across module boundaries the compiler cannot see.

Ryan Carniato's formulation is the right one and now has evidence behind it: the transform "obscures
the actual behavior in a way that doesn't prevent you from still needing to know that behavior."

**Action:** correct the doc comment in `index.d.ts` and `MILESTONES.md` §5.2 to cite the soundness
argument rather than the architectural one. The architectural claim will not survive the first
person who reads `codegen/mod.rs`, and losing it should not cost us the decision.

### 5.8 Desugaring guard clauses into `Switch`/`Match`

**Killed.** Requires owning the whole component body, and silently changes both the order and the
**count** of evaluation for every statement between the guards. A `const [u] = useResource(...)`
hoisted above a manufactured chain changes when the resource is created; not hoisted, it creates one
per branch evaluation. Neither is a transform the compiler can pick correctly without the primitive's
identity semantics — which is exactly what `Binder::returns` (`bind.rs:320-345`) knows and cannot
share across a module boundary. Ship the diagnostic (§4.11).

### 5.9 Autofixing `.map()` → `<For>`

**Killed.** `For`'s index is an accessor; `.map`'s is a number. A mechanical rewrite of `i + 1`
produces string concatenation of a function — a silent wrong render *generated by the fixer*, which
is categorically worse than the frozen list it replaced.

### 5.10 Already shipped — do not build

- **Test wrappers that flush.** `packages/testing/src/index.ts:244-256` already flushes after every
  `fireEvent` dispatch, with per-key variants, and `act()` at `:228-236`. The un-flushed primitives
  remain available from core. **Nothing to build — this is a docs win being left on the table.**

### 5.11 Two diagnostics whose predicates are not observable

- **`props.children` read-count warning.** Mechanically easy (`bind.rs:609` already implements
  `visit_static_member_expression`), but **the message would be false in compiled barq**. The parent
  emits `children: Expensive({})` — an already-constructed node passed as a plain property, so two
  reads return the *same* node. There is no double instantiation and `onMount` does not fire twice.
  The real compiled hazard is different: `insert` **moves** the node, so an earlier read sees a live
  node that the later read relocates. Double instantiation only occurs when the parent emitted
  `get children()`, which the compiler cannot know per-callee. If shipped at all, the message must be
  the weaker always-true one.
- **`UNTRACKED_REACTIVE_READ`.** "The read is lexically inside a scope that had an owner" is
  source-level information the runtime does not have. What it can observe — "no active observer while
  an owner exists" — is true of every `untrack` body, every event handler, every `onMount` callback
  and every render-phase read. Unusable noise on its first run. **What survives is a documentation
  point:** barq's two-argument `effect(compute, apply)` (`signals.ts:1456`) already removes this class
  structurally; most code just does not use it. That is the deliverable.

---

## 6. Recommended sequence

### Immediate — not a milestone, these are defects

| # | Item | Mechanism | Cost |
|---|---|---|---|
| 1 | `For keyed={fn}` row misclassification + dead `keyFn` (§4.1) | compiler + types | small |
| 2 | `onMount` cleanup guard (§4.5) | runtime | trivial |
| 3 | `render(fn, container)` overload (§4.4) — **land with 2** | runtime | small |
| 4 | Context value boxing (§4.8a) | runtime | small |
| 5 | kitchen-sink hygiene (§4.15) | docs | trivial |

Every one of these ships broken behaviour today and none needs a design decision.

### M8 — Diagnostics

`ROADMAP.md` already scopes M8 with D1–D6, a diagnostic engine with stable codes and suppression,
and names **false positives as the risk that sinks it**. This research changes M8's contents in four
ways:

- **Promote `.map()`-in-JSX-child (§4.2) ahead of D1.** It is cheaper, it is sound, and the failure
  is worse than D1's — a frozen list versus a visibly wrong string.
- **Narrow D1 (§4.6)** to coercion positions only. Two of the six proposed positions fire on
  correct, fully reactive code.
- **D3 (§4.7) shares D1's plumbing** — collect during the walk, emit after `props_params()`. Cost
  them together.
- **Add the early-return rule (§4.11)** narrowed to reactive guard tests, and **`onChange` (§4.14)**.
  Drop the rest of the React-isms family (§5.5).
- **Prerequisite nobody has scoped:** a default DEV-build listener for `DEV.diagnostics`. Every
  runtime-diagnostic proposal in this document (§4.10, and the surviving half of §5.11) is invisible
  without it, because `diagnosticsOn` is false until someone subscribes and only tests subscribe.

M8 should also carry the non-diagnostic type work, which is cheap and unblocked: `narrow`/`isDef`
plus `MatchProps` keyed narrowing (§4.13), and resolving `StrictChild` (§4.12).

Also in M8's cost budget: the **Vite-plugin-side compiled-file check** from §5.1 — the surviving
half of the compiler-mode-gap proposal, and the only sound answer to Pattern B.

### M9 — HMR and cross-module dedup

Unchanged by this research, with one addition worth stating in the milestone: barq starts ahead of
Solid here. `solid-refresh` issues #15 and #33 are "contexts become undefined during HMR", and Ryan's
own answer is that fixing it properly is several steps removed from current work. A Site-based splice
model with content-hashed templates has a structural advantage that is worth claiming explicitly.

### M10 — Hydration

Unchanged.

### Fits no milestone

- **Lazy props helpers (§4.9)** is milestone-sized on its own: `Prim` rows, a codegen change to how
  `{...rest}` compiles on a host element, the runtime rewrite, and four fixtures that do not exist.
  It does not belong inside M8 and it is not HMR. **Schedule it as its own milestone or accept that
  `splitProps` stays broken and document it.**
- **Non-keyed `Show`/`Match` row attribution (§4.3)** is a compiler fix with no milestone home. It is
  small; put it in M8's fixture work.
- **The `.ts` analysis gap.** D1 cannot see a store or hooks module. Closing it means lifting
  `is_jsx()` (`compile.rs:248`), widening the plugin's include globs, and reprinting every `.ts` file
  through oxc codegen. Real throughput cost against the 22–27× claim, real formatting churn. **Needs
  a decision, and it is not an M8 decision.**
- **Devtools.** Out of scope, but `DEV.diagnostics` is already the data layer such a panel needs, and
  it is unusual to have that before the panel.

---

## 7. Where this research is thin

Stated plainly rather than padded.

1. **Prior art was never researched.** The packet came back `null`. §3's Vue/Svelte/React-Compiler
   claims are from general knowledge with no retrieved sources and should be verified before being
   cited in a design decision. The conclusion they support is independently carried by the verified
   cross-module `Opaque` result, which is why §3 stands.
2. **No Reddit or Discord data.** `r/solidjs` is hard-blocked to the research tooling and the Solid
   Discord is unreachable. Several GitHub threads reference Discord conversations that are almost
   certainly the highest-density source of "what beginners actually hit".
3. **Store internals were not measured.** The Map/Set-not-proxied and store-from-store-aliasing
   claims were carried from research and **not** checked against `packages/core/src/store.ts` by
   anyone. Confirm both shapes before scheduling either. Note `store.ts` uses `Map` internally for
   its own node bookkeeping, so a naive "throw on any Map" guard needs care about placement.
4. **The `value={undefined}` property path is unverified.** The attribute path is confirmed
   (`dom.ts:668`, `:686`, `:965`); the input `value` **property** path is not. One targeted test
   before the claim is published.
5. **The `style={{fontSize: 14}}` end state is unverified.** The compile shows the object literal
   reaching `_$setProp` untouched; whether `dom.ts`'s style branch kebab-cases it and appends `px`
   was not traced to the end.
6. **Nobody measured throughput for any diagnostic.** M8's stated constraint is "no new pass" against
   a 1 ms budget, and M7 is currently recovering a 5.7%/file regression from exactly this kind of
   accretion. Every proposal here claims to ride an existing traversal; none has been benchmarked.
7. **Whether the destructuring complaint survives past month three is unresolved.** One credible
   report says it evaporates with experience; one says it never does, because team composition churns
   and each new hire re-pays the cost. Both are single data points. If barq optimises for team
   adoption rather than individual adoption, the second argues for diagnostics over documentation —
   which is the assumption this document makes, and it is an assumption.
