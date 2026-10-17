# What barq means: the semantics the compiler and the runtime are held to

This document is the specification the compiler, the runtime and the conformance suite are all
checked *against*. It is not a description of what the code currently does. Where the two differ,
the code is wrong, and the rule's **Status.** line says so.

**Why it exists.** A differential harness that compares the compiler against a second
implementation certifies any defect the two share. `<Provider><Child/></Provider>` rendered a blank
page while every comparison was green, because nobody had written down what it must do. §12 answers
that question on this document's own terms, and doing so is its acceptance test.

**Reading the rules against the code.** Two conventions reach many sections:

- **The emitted convention carries no scope argument.** A component is `Comp(props)`, a Block is
  `block(() => …)`, and a construct makes the scope it opened the engine's current owner
  (`runWithOwner`) before it invokes a Block. Where a rule writes a scope as the first argument
  (`$s`, `_s$`, `block(c)`), read "made current by the construct". The ownership claims themselves
  (O2.1, X1, X3) are checked by the ownership trace.
- **The reactive engine is `@solidjs/signals`.** `packages/core/src/signals.ts` re-exports it under
  Solid 2.0's names (`createSignal` pairs, `createMemo`, `createEffect`, `flush`) and adds scopes,
  Blocks and context beside it. A context is its own provider: `<Ctx value={…}>` provides and
  `useContext(Ctx)` reads.

---

## 0. How to read this

### 0.1 Conformance keywords

**MUST**, **MUST NOT**, **MAY** are normative. Prose outside a numbered rule is rationale and binds
nothing. Every numbered rule has three parts:

1. **the rule**: a statement that can be false;
2. **falsified by**: the observation that would make it false, stated as a procedure a test can run;
3. **status**: whether the implementation meets it, and what pins that observation.

A rule with no falsification procedure is not a rule and does not belong here. "Context resolves
correctly" is not a rule. O2 is.

### 0.2 Rule status

Every rule carries exactly one status against the implementation as it stands.

| Status | Meaning |
|---|---|
| `HOLDS` | the implementation satisfies the rule, and what pins it must keep passing |
| `HOLDS-with-registry` | the procedure runs over the whole corpus and every shortfall is enumerated, with its exact measurement, in a registry the suite checks |
| `VIOLATED` | the implementation is **wrong**; this is a defect |
| `PLANNED` | the implementation deliberately differs, and the design changes it |
| `UNOBSERVABLE` | the rule is right but no channel can currently see it |
| `IMPLEMENTED, UNEXERCISED` | the primitive exists and its own unit test passes, but no production caller reaches it, so the falsification procedure cannot be run |
| `PARTIAL` | one clause of a multi-clause rule holds and another does not, with both named |

`VIOLATED` and `PLANNED` are different in kind and must not be conflated. A `VIOLATED` rule is a bug
that shipped. A `PLANNED` rule is a semantic change the design chose, on the record.

### 0.3 Pinning discipline

A fixture under `fixtures/semantics/` declares which rules it pins, by ID, as a module export, and
carries one claim per falsification procedure, each naming its rule:

```ts
export const rules = ["O2", "X1", "X3"]
```

`test/semantics.test.ts` runs every claim and fails on any that does not hold. Every claim fixture
also carries at least one CONTROL claim in the explicit-thunk form, so a failure says what broke.

Existing corpus fixtures pin DOM output, not ownership. Where one is named below it is because the
ownership trace runs over the **whole** corpus, so every fixture is a subject of O1-O3 whether or
not it was written to be. The fixture named for a rule is the one that **discriminates** it: the one
whose trace differs if the rule is broken.

### 0.4 Backends

`Out` is backend-parameterised. On the DOM backend `Out = Node | Node[] | Cell<Out> | null`; on the SSR
backend `Out = string`. Every rule below holds on both backends unless it is explicitly scoped to one
(the ordering rules M3 and M5 and the whole of §9 are DOM-only; §11 is SSR+hydrate). A rule that
cannot be stated for both backends is a design smell and is marked as such.

---

## 1. Vocabulary

These are the only nouns this document uses.

**Scope** — the unit of ownership and the unit of death. A scope owns cleanups, child scopes, a
context record, a catcher, a generation counter and (on the DOM backend) a range of nodes. It is a
runtime object; it is *not* a reactive node and *not* a DOM node.

**Cell** — a deferred read. `Cell<T> = (...ignored: never[]) => T`. No identity, no memoisation,
callable any number of times, **arity-tolerant** (C3.6). A signal getter is a Cell. A context accessor
is a Cell. A props member is a Cell.

**Block** — a deferred *construction* under a supplied scope. `Block = (s: Scope, ...args: Cell<any>[]) => Out`.
A Block is not a Cell: it takes a scope and it builds. Its first parameter is the ownership channel and
is not optional (C3.8).

**Position** — a compile-time address `(module, unit, position)`. A position is where a construct is
written. It is stable across renders, across the two backends, and across `-O0`/`-Ox`.

**Activation** — one live occupancy of a position. A `branch` whose key flips has two activations of
one position. An `each` with three rows has three activations of the row position.

**Instance scope** — the scope a construct creates for one activation. One activation, one instance
scope, one Block invocation (C7).

**Owner** — the scope user code is currently running under. Reachable as `CURRENT` / `getOwner()`.

**Observer** — the reactive node currently collecting dependencies. Distinct from the owner (O6).

**Catcher** — the nearest ancestor scope that is an error boundary, copied onto every scope at
`enter` so lookup is O(1) and never walks.

**Range** — the contiguous span of DOM nodes a construct owns, delimited by its `(parent, anchor)`.


---

## 2. O — Ownership

Ownership is the spine. Every other section depends on this one; the Provider bug is an ownership
bug.

### O1 — the scope creation set is closed

**Rule.** A scope is created by exactly six constructs and by nothing else: `render`, a `branch`
instance, an `each` row, `provide`, `boundary`, `portal`. **A component call MUST NOT create a
scope.** An element MUST NOT create a scope. A Block invocation MUST NOT create a scope — the
*construct that invokes it* created the scope and handed it over (O2).

**Falsified by.** Mount a tree of 1,000 components, three deep, containing no branch, no list, no
provider, no boundary and no portal. Count `Scope` allocations. The count MUST be 1 (the `render`
root). Any other number falsifies O1, and the trace names the construct that allocated. The trace
counts ENTERED scopes, and a computation materialises its scope lazily through no `enter`, so the
count this procedure asks for is allocations, not trace events.

**Status.** `PLANNED`: a plain component allocates no scope, and the flow components, a provider and
an error boundary each allocate one per instance. No fixture pins the count.

### O2 — a Block runs under the scope it is given, never under an ambient one

**Rule.** Let `K` be a scope-creating construct at position `p`. For each activation of `p`, `K` MUST:

1. create exactly one fresh scope `c` whose parent is the scope `K` itself was invoked under;
2. install everything that activation owns onto `c` — its context bindings (X1), its catcher (E1), its
   abort signal — **before** step 3;
3. invoke the Block for that activation with `c` as the current owner.

A Block MUST run under the scope its construct opened for it. The emitted code passes no scope: the
construct makes `c` current with `runWithOwner` before it invokes the Block, so the owner the Block
reads is `c` and never the one that was ambient at the call site. `CURRENT` is an *observation*
channel (O4.5), never a decision channel.

> **O2.1.** A component's body executes while the current scope is the scope of the construct that
> received it as `children`, and after that scope's context bindings are installed. It MUST NOT
> execute at the call site of the construct, before that scope exists.

**Escape hatch.** `pin(s, block)` returns a Block that ignores its scope argument and uses `s`. It is
the only sanctioned way to break dynamic ownership and it is visible in the emitted text.

**Falsified by.** `<Ctx value={1}><Child/></Ctx>` where `Child` calls `useContext(Ctx)`
and `Ctx` has no default. If `Child` throws `ContextNotFoundError`, or renders the default when a
provider is present, or the ownership trace records `Child` running under a scope that is not the
provider's instance scope, O2 is false. **`Child` MUST NOT be a syntactic argument of the provider
call in the emitted module** — that shape is O2's negation written down. A construct handed a scope
that is NOT the ambient one must put its subtree under the scope it was handed.

**Status.** `HOLDS`, and O2.1 with it: the emission is `Ctx({ value: _k$1, children: _$block(() =>
Child({})) })`, so `Child` is constructed by the provider, inside the instance scope, after the
binding is written. Pinned by `sem-ctx-provider-direct-child.tsx` (the direct form, with no
`{() => …}` wrapper) and `packages/core`'s `calling-convention.test.ts`.

### O3 — disposal is total and ordered

**Rule.** `dispose(s)` MUST perform exactly these steps, in this order, and MUST be idempotent:

- **O3.1** mark `s` dead and bump `s.gen`, **before** anything else runs, so a cleanup that schedules
  work observes a dead scope;
- **O3.2** dispose `s.kids` in **reverse creation order**, depth-first — a child is fully disposed
  before its earlier sibling begins;
- **O3.3** run `s.cleanups` **LIFO**, after all kids are disposed;
- **O3.4** abort `s`'s `AbortSignal`, killing native listeners and in-flight fetches;
- **O3.5** remove `s`'s DOM range.

A conforming runtime MUST keep kids and cleanups in two distinct lists: a child scope's disposer is
a KID, not a cleanup, and the ordering above is observable only if the two can be told apart.

**O3.6.** A cleanup that throws MUST route to `s.catcher` (E2 entry 5) and MUST NOT abort the remaining
cleanups, the remaining kids, or the range removal.

**O3.7 — the leak invariant.** After `dispose(s)` returns, the subtree rooted at `s` MUST have: zero
scheduled effects, zero registered listeners, zero in-flight fetches, zero live scopes, zero retained
DOM nodes.

**Falsified by.** (a) Ordering: register a cleanup at every scope in a three-level tree, each pushing
its address onto a log; dispose the root; the log MUST be the reverse of the creation order,
depth-first. (b) Leaks: render, dispose, then write a signal the tree depended on — no effect may run,
no DOM may be written. (c) Cleanup throw: make the second of three cleanups throw; all three must
still have run and the boundary must have caught one error.

**Status.** O3.1-O3.3, O3.5 and O3.7 `HOLDS`; O3.4 `IMPLEMENTED, UNEXERCISED` (nothing calls
`abortSignal`); O3.6 `VIOLATED` (the engine runs cleanups last-registered first with no `try` around
each, so a throw leaves `dispose` and the earlier cleanups never run). Pinned by
`sem-own-render-disposer-disposes.tsx`, `packages/core/src/flow.test.ts`, the metamorphic channel
(`test/metamorphic.ts`, which joins DOM survival and the ownership trace per step), and the whole
corpus through `test/leaks.ts`, whose five probes (scope, effect, listener, async, node) are taken
from outside the runtime after `dispose()` returns and find nothing.

### O4 — ambient hygiene

**O4.1 — restoration is required on both paths.** `CURRENT` MUST be restored to its prior value on
the normal path *and* on the exceptional path. A construct that enters a scope and returns a value
into the caller's expression — `provide`, `boundary`, `dynamic`, and any Block invocation whose result is
consumed — has no other opportunity, so `try { … } finally { exit(c) }` is the conforming
implementation for those.

**O4.2 — the cost claim is what survives, not the syntactic claim.** There is at most one `try/finally`
per *scope-entering primitive invocation*. There is **none** per component call and **none** per
element, because neither creates a scope (O1). Ambient state is how ownership is *observed*, never
how it is *passed*.

**O4.3 — which scope a catcher restores to.** Every construct with a `catch` MUST capture
`const prev = CURRENT` on the statement immediately before its `enter`, and its `catch` clause MUST
assign `CURRENT = prev` as its **first** statement, before any user code — including the fallback —
runs. `prev` is a local of the catching frame, so this is well defined without an unwind stack and
without walking the scope chain. It is *not* `s.parent`, and it is *not* `getOwner()` at catch time:
both are wrong under `pin`.

**O4.4 — a partially constructed subtree never survives a throw.** On the exceptional path every scope
entered after `prev` and not yet exited MUST be disposed, not merely abandoned. The catcher disposes
the failed instance scope, which by O3 disposes its kids depth-first, runs their cleanups, aborts
their signals and removes their range. Half-built DOM is never left in the document and half-registered
cleanups are never left unrun.

**O4.5 — `CURRENT` is never read to decide ownership.** It exists so that user-written `onCleanup()`
and `useContext(Ctx)` can find their owner without being handed a scope. A framework primitive that
consults `CURRENT` at a point where a `Scope` argument is in scope is a defect. The delegated
dispatcher runs a handler under NO owner, and the scope stapled to the element is where a throw from
it is routed (E2 entry 6).

**Falsified by.** Throw from a Block under a boundary. After the fallback has rendered: (a)
`getOwner()` at the boundary's call site MUST be the same object it was before the boundary was
called; (b) every cleanup registered by the failed subtree MUST have run; (c) no node built by the
failed subtree may remain in the document; (d) a second, sibling boundary must still catch its own
throw afterwards, which it cannot if `CURRENT` was left dangling. For O4.5: enter scope A, leave it,
enter B, and hand A to a primitive or to a compiled binding; everything it creates must be owned by A.

**Status.** O4.1-O4.2 `VIOLATED` (no restoration on the exceptional path); O4.3 `VIOLATED` and
untestable as written, because an engine owner has no `catcher` field; O4.4 `PARTIAL` (`provide`
disposes its instance scope on a throw, and `sem-err-construction-throw`'s
`the-failed-subtree-is-disposed-not-abandoned` pins clause (b)); O4.5 `HOLDS`, pinned by
`sem-own-given-scope-wins.tsx`, whose fourth claim drives the compiled emission.

### O5 — `render` opens a root and returns a disposer that disposes

**Rule.** `render(block, container) → dispose` MUST: open a root scope; establish that root as a
catcher, so O4.3's "the nearest catching scope always exists" is true by construction; invoke `block`
with the root scope; insert the result; flush. The returned disposer MUST `dispose()` the root scope
(O3, with all of O3.7) **and** remove its range.

**Falsified by.** Render a tree containing an effect. Call the disposer. Write a signal the effect
depends on. If the effect runs, O5 is false.

**Status.** `HOLDS` for every spelling a compiled module can produce: the `scope` pass wraps a bare
JSX argument in `render`/`hydrate`'s first position into a Block, so the eager form has no compiled
spelling. The runtime still accepts an already-built subtree from a hand-written caller and warns
(`RENDER_SUBTREE_NOT_OWNED`) when an owner was current. Pinned by
`sem-own-render-disposer-disposes.tsx`, which drives the compiled spelling, the hand-written Block and
a subtree built through a local.

### O6 — owner and observer are separate ambients, and only the observer must be ambient

**Rule.** `untrack` MUST change the observer and MUST NOT change the owner. `enter`/`exit` MUST change
the owner and MUST NOT change the observer. A cleanup registered inside `untrack` MUST attach to the
same scope it would have attached to outside it.

**Falsified by.** Inside `untrack`, call `onCleanup(f)`; dispose the enclosing scope; `f` MUST run.
Inside `untrack`, read a signal; the enclosing effect MUST NOT re-run when it is written.

**Status.** `HOLDS`, both directions. Pinned by `sem-react-untrack-keeps-owner.tsx`.

---

## 3. C — Components, props and children

### C1 — one calling convention

**Rule.** Every component is `Comp(props: Props) → Out`, called under the owner of the construct that
invoked it. There is exactly one implementation of component invocation in the system. There is
**no** un-compiled authoring path: a second, semantically-different implementation of component
invocation is the root cause of the Provider bug and is not permitted to exist.

**Falsified by.** Any emitted call to a user component in a shape other than `Comp(props)`; any
runtime path that constructs an element from `(tag, props)` other than the compiled one.

**Status.** `HOLDS` for the compiled path. `compile.rs`'s
`the_whole_corpus_emits_one_calling_convention_at_both_levels` re-parses the emitted module for every
fixture on every backend at both levels, and `optimality` asserts no emission mentions `_s$`. Pinned
by `component-boundary-props.tsx` and `arrow-body-component.tsx`.

### C2 — components are declared, not inferred

**Rule.** A function containing JSX in value position **is** a component and MUST NOT be called
directly as a plain function. Doing so is a diagnostic that names the fix. This is a real language
rule and it is the price of C1.

**Falsified by.** `const x = MyComponent({a: 1})` in a compiled module producing no diagnostic. In
the other direction: a component whose body does not syntactically return JSX, written as a tag, must
be treated as a component, and `rows.map((row) => <li/>)` must keep the arity `map` calls it with.

**Status.** `HOLDS`: `analysis::bind` records every named function-valued declaration, and the call
site and the declaration read the same set. Pinned by `sem-calling-convention.tsx`, whose two C2
claims are the two directions.

### C3 — props are Cells and Blocks; the five laws

**Rule.** Every own property of a props object is a `Cell` or a `Block`. No exceptions — `children`,
`onClick`, `each`, `value`, `key`. A props member is **never** a getter and **never** a bare value.

- **C3.1 Totality.** Stated above. It is what makes the ABI total and therefore what makes
  cross-module correctness need no cross-module knowledge.
- **C3.2 Purity-cheapness.** A compiler-emitted Cell is exactly `() => <the JSX expression>` and is
  **not** memoised. Calling it twice evaluates twice. A consumer that must not evaluate twice calls
  once.
- **C3.3 Neutrality.** A Cell neither enters nor exits tracking; it inherits the caller's tracking
  state. This is what makes "read at the point of use" mean something: the **consumer's** effect
  subscribes, at the consumer's position, not the producer's.
- **C3.4 Copy-transparency.** Any operation that copies own enumerable properties preserves C3.1 —
  a guarantee of the language, not of the runtime. Therefore `{...props}`, rest destructuring,
  `Object.assign`, `for…in`, `merge` and `omit` are all correct with their bodies untouched.
- **C3.5 Boundary scope.** C3.1–C3.4 govern values crossing a **component** boundary. Element
  attributes, template holes and static text are compiler-internal and lower to direct writes; no Cell
  is materialised for them.

The Cell/Block reconciliation:

- **C3.6 — Cells are arity-tolerant.** `Cell<T> = (...ignored: never[]) => T`. A Cell MUST ignore
  every argument it is passed. The compiler only ever emits `() => expr`, forwards existing Cells by
  name, or passes a signal getter — none of which declare a parameter — so this is free. A
  hand-written "Cell" that declares a parameter or reads `arguments` is outside the ABI and is a DEV
  diagnostic. **Consequence: `cell($s)` and `cell()` are the same call.**
- **C3.7 — a Cell is safe in a Block slot; a Block is not safe in a Cell slot.** A Block-slot consumer
  invokes `x($c)`. If `x` is a Cell this degrades by C3.6 to `x()` and yields `T`, which the slot
  accepts iff `T` is `Out`. A Cell-slot consumer invokes `x()`. If `x` is a Block it receives
  `s === undefined`. The asymmetry is the whole content of the rule.
- **C3.8 — a Block invoked without a scope MUST throw, never fall back.** `s === undefined` at a Block
  entry raises `ScopeMissingError` carrying the Block's `origin`. It MUST NOT fall back to `CURRENT`.
  A fallback to `CURRENT` is exactly the ambient-ownership shape this design removes, and it would
  reintroduce the Provider bug at the one place nobody would look for it. Blocks that *use* their
  scope are branded by the compiler (`_$b`) at their definition site — once per module for a hoisted
  Block, zero per activation — so the check is a property test, not an arity guess. Blocks that ignore
  their scope (an arity-0 `template()`, C6) need no brand: they are simultaneously legal Cells and the
  degradation is harmless for C3.8's purpose. The brand is a property of the VALUE, so the refusal is
  made where a slot READS the value: a `ref` slot invokes it with the Element and an event slot with
  the Event, where an entry guard testing `s === undefined` is unreachable.

  It is **not** harmless for C7's, and the two rules have to be read together. C7 counts invocations
  per activation and forbids a second one; C3.2 says a Cell is not memoised and calling it twice is
  ordinary. An unbranded arity-0 `template()` is both, so nothing at runtime can tell a permitted
  second Cell read from a forbidden second Block invocation. **C7's counter is therefore scoped to
  BRANDED Blocks**, and an arity-0 slot is outside it.
- **C3.9 — kind travels with the value, not with the name.** Forwarding is identity (C5), so a
  forwarded Block is still a Block and a forwarded Cell is still a Cell. The only way a Block reaches
  a Cell slot is a *consumer* reading a Block-carrying name with `()`, which is caught statically by
  `Props<P>` when the prop is typed and dynamically by C3.8 when it is not.

**Falsified by.** (a) A counting Cell handed as a prop and then spread, rest-destructured,
`Object.assign`ed, `for…in`ed and forwarded through three wrappers MUST report **0 reads**. (b) A Cell
called twice MUST evaluate twice. (c) A Cell read inside a consumer's effect MUST make that effect
re-run when the underlying signal is written. (d) Invoking a scope-using Block with no scope MUST
throw `ScopeMissingError`, not render under an ambient owner.

**Status.** C3.6-C3.9 `HOLDS`: every one of eighteen (shape, slot) pairs takes a Block and refuses a
Block where a Cell belongs, pinned by `sem-props-block-in-cell-slot.tsx`. C3.1-C3.5 `VIOLATED` as last
observed: the compiler emits no getter anywhere, which is C3.4's precondition, but procedures (a) and
(b) have no fixture.

### C4 — props are read by calling, and the type says so

**Rule.** `props.x()`. One rule — *a Cell is called* — holds uniformly across props, context, rows,
refs, resources and slot arguments. There is **no** compiler rewrite of `props.x` to `props.x()`: a
transform is legitimate only if the untransformed code has the same semantics, and this one does not.

**The type:**

```ts
type Cell<T>   = (...ignored: never[]) => T                    // arity-tolerant (C3.6)
type Block     = (s: Scope, ...args: Cell<unknown>[]) => Out    // scope is NOT optional (C3.8)
type Slot<T>   = [T] extends [never] ? never
               : T extends Out ? Cell<T> | Block               // an Out-typed slot accepts either
               : Cell<T>                                       // anything else is a Cell slot only
type Props<P>  = { [K in keyof P]-?: Slot<P[K]> } & { $?: Source[] }
type Props     = { [k: string]: Cell<unknown> | Block } & { $?: Source[] }   // the erased view
```

The unparameterised `Props` is the **erasure** of `Props<P>`, not a second claim about it.
`Slot<T>` is the reconciliation: a slot whose declared type is renderable accepts a Block *or* a Cell
(C3.7 makes the Cell case safe); every other slot accepts a Cell only, and a Block landing there is a
type error in value position — which is the point of stating the type at all.

**Falsified by.** `props.x` in value position where `x: string` MUST be a type error, not a silent
`() => string`. `props.children()` where `children: JSX.Element` MUST be a type error (a `Block`
requires a `Scope`).

**Status.** `HOLDS`, in the type channel only. Pinned by
`packages/core/src/jsx-types/props-typed-slot.types.tsx`, typechecked by
`jsx-types/attribute-types.test.ts`, which asserts the positives compile and every
`@ts-expect-error` still fires.

### C5 — forwarding is free, depth-independent, and kind-preserving

**Rule.** `<B x={props.x} />` MUST emit `B($s, { x: props.x })` — the **same** function object, not a
new closure. Forwarding depth MUST NOT become closure depth.

**C5.1 — a Block landing in a Cell slot.** Because forwarding is identity, forwarding cannot change a
value's kind (C3.9). Therefore this situation arises only two ways, and each has a defined outcome:

1. **Within a module and through NAMED attribute forwards**, the compiler knows the kind of the
   forwarded value and MUST emit a diagnostic at the forwarding site when a value it knows to be a
   scope-using Block is forwarded into a slot the callee declares as `Cell` — naming both positions.
   Two kinds of position are Cell slots and both are diagnosed: a named attribute on an INTRINSIC
   element, and a named Cell slot of a FLOW construct — `For`'s `each`, `Repeat`'s
   `count`/`from`, `Show`/`Match`'s `when`, `Portal`'s `mount`, `Loading`'s `on`, `Reveal`'s
   `order`/`collapsed` (`Flow::cell_slot`).

   The bounds:
   - a SPREAD on either side ends the chain — `{...rest}` names no key, so the fixpoint has nothing
     to carry the verdict across;
   - only an ATTRIBUTE position contributes evidence: a text child (`{"x" + props.thing}`) does not,
     though a Block reaching one is legal there anyway (C3.7);
   - the read must be `props.thing` at the consuming site — aliasing through a local
     (`const v = props.thing`) is invisible to the pass;
   - a context's `value` (`<Ctx value={…}>`) is a Cell slot the runtime refuses, but a context is
     not a FLOW construct, so its `value` is not one of the slots above and it is not diagnosed;
   - and the whole thing is DEV-only, so a production build gets item 2 and nothing else.

   None is a gap in the guarantee, because item 2 is total; all of them bound what item 1 promises.
2. **Across a module boundary**, the compiler cannot know. The consumer's `props.x()` then hits C3.8
   and throws `ScopeMissingError` with the Block's `origin` and the consuming scope's origin chain. It
   MUST NOT silently render under `CURRENT` and it MUST NOT silently produce `undefined`.

**C5.2 — η-reduction is sound and is restricted to Cells.** `x={s()}` → `x: s` is sound because a
signal getter *is* a Cell (R6) and Cells are arity-tolerant. It MUST NOT be applied when the reduced
expression is JSX, which lowers to a Block, nor when the callee's slot is a Block slot the compiler
cannot see.

**Falsified by.** Assert `childProps.x === parentProps.x` by reference after three hops. A getter
cannot satisfy this rule at all, because `get x() { return props.x }` allocates a new descriptor at
every hop.

**Status.** `HOLDS`, with C5.1 and C5.2: a forward emits the same function object, item 1 is
`BARQ010` and item 2 is C3.8's throw. Pinned by `props-raw-forward.tsx`, `flow-prop-eta-boundary.tsx`,
`sem-props-block-in-cell-slot.tsx` and `docs/BARQ010.md`.

### C6 — children are Blocks; slots are Block-valued props

**Rule.** JSX children lower to a `Block`. A JSX-valued prop lowers to a `Block`. An arity-0
`template()` **is** a legal Block and is passed by name with zero allocation. Slot parameters are
extra `Cell` arguments to the Block.

**Falsified by.** An emitted `children:` whose value is a built node, an already-invoked expression, a
nullary thunk, or an array of nodes. All four are O2's negation in different clothes.

**Status.** `HOLDS`: every children and JSX-valued slot is emitted as `_$block(…)`, branded, and the
runtime reads every renderable slot by calling it. Nothing the compiler emits takes the arity-0
`template()` form, because the brand C3.8 and C7 rely on costs one closure per construction.
`compile.rs`'s `the_whole_corpus_emits_one_calling_convention_at_both_levels` fails on any of the
four falsifiers in any slot, and `the_calling_convention_audit_sees_all_four_of_c6s_falsifiers` shows
it can see each. Pinned by `component-children-slot.tsx`, `sem-own-slot-arguments.tsx` and
`sem-props-cast-keeps-the-brand.tsx`.

### C7 — a Block is called exactly once per activation

**Rule.** For each activation of a position, its Block is invoked **exactly once**. Not zero times,
not twice. Every consumer of a Block is a primitive owning exactly one compile-addressed slot; a
second invocation at that slot is a DEV assertion failure naming the position.

**Scope of the counter.** BRANDED Blocks only (C3.8). An unbranded arity-0 `template()` is
simultaneously a legal Cell, and C3.2 permits calling a Cell twice, so counting it would make C7 and
C3.2 contradict each other on one value.

Calling a Block twice is *not* an error of the Block — building twice is correct behaviour, because
DOM has identity and two invocations mean two subtrees. It is an error of the **consumer**.

**Falsified by.** Instrument a Block with a counter and drive every built-in consumer — `branch`,
`each`, `boundary`, `portal`, `provide`, `dynamic` — through mount, one no-op update, one key flip and
one dispose. The counter MUST equal the number of activations, exactly. In particular: a key flip
from A to B to A MUST show A's Block invoked twice (two activations) and a *no-op* write MUST show no
additional invocation (K2).

**Status.** `HOLDS`. `flow.ts`'s `invoke` is the one site any consumer invokes a Block from, and it
emits `BLOCK_EVALUATED_TWICE` on a second call for one activation. Pinned by
`packages/core/src/flow.test.ts` and by `test/single-evaluation.test.ts`, which compiles the
`fixtures/l4/` fixtures (`mm-branch-flip`, `mm-branch-key-stable`, `c7-portal`, `c7-provider`,
`c7-error-boundary`, `c7-error-boundary-fallback`, `c7-await-suspense`, `c7-repeat`,
`c7-each-fallback`, `c7-dynamic`, `c7-reveal`, `c7-loading-errored`) and compares each recorded
invocation sequence with the one the fixture declares, over a consumer map asserted total.

### C8 — fragments are a compile-time multi-root unit, never a runtime component

**Rule.** `Out` admits `Node[]`. A fragment is a compile-time multi-root unit. It MUST NOT drop
children of any kind: not function children, not nested arrays, not live holes, not `null`s that
occupy a position.

**Falsified by.** A fragment with five children — a static element, a nested array, a function child,
a live hole and a text node — MUST produce all five in the output, in order.

**Status.** `VIOLATED` as last measured: five children in, three nodes out, with the accessor and the
array dropped. No fixture pins it; `fragment-root.tsx` and `nested-fragments.tsx` put no array beside
a function child.

### C9 — the props source list

**Rule.** `<Foo {...a} b={x()} {...c} />` MUST emit `Foo($s, _$props([a, { b: () => x() }, c]))`, with
the sources in **written order** and read **last-wins**. `_$props` returns its single argument
unchanged when the list is one plain record. A Proxy over an existing `$` concatenates rather than
nesting, so merged merges stay linear.

**Falsified by.** Later sources MUST shadow earlier ones on read; `ownKeys` and `has` MUST union all
sources; a spread of a spread MUST NOT deepen the read path.

**Status.** `HOLDS`: the `shape` pass emits `_$props([…])` in written order and a component with no
spread emits the object itself. Pinned by `component-spread.tsx`, `spread-static-mix.tsx` and
`packages/core/src/props.test.ts`.

---

## 4. X — Context and DI

### X1 — provision creates a scope, forks the record, and installs before invoking

**Rule.** `provide(s, Ctx, value, block)` MUST, in this order: `enter(s)` to create instance scope
`c`; fork `c.ctx` as `Object.create(c.ctx)`; write `c.ctx[Ctx.id] = value`; **then** invoke
`block(c)`. Every step before the invocation is mandatory and ordered. `provide` MUST restore
`CURRENT` on both paths (O4.1). The fork is `Object.create`, not a spread copy, so its cost does not
grow with the keys already in scope (X6).

**Falsified by.** The ownership trace for `<Provider><Child/></Provider>` must show, in order:
`enter(provider)`, `ctx-write(provider)`, `block-invoke(child, provider)`. Any other order falsifies
X1. Reading the context in `Child` must return the provided value. The trace records no context
write, so X1 is observable only through that DOM-visible consequence.

**Status.** `HOLDS`. Pinned by `sem-ctx-provider-direct-child.tsx` and
`sem-ctx-provider-wrapper-component.tsx`.

### X2 — a provided value is a Cell, so provider updates are live

**Rule.** The value stored is a `Cell<T>`. A provider whose value changes MUST NOT re-render its
children; consumers see the new value through their own reads, at their own positions. Node identity
across a provider-value change MUST be total: every node in the subtree survives. Every public write
that can take a plain value stores it as a Cell, so one key read through any accessor gives the same
answer.

**Falsified by.** Change the provided value; assert every node in the consuming subtree is the same
object it was, and the consumed text changed.

**Status.** `HOLDS`, for a value written as an expression and as an accessor, and `getContext` and
`useContext` agree on a plain value and on a function set as one. Pinned by
`test/context-value-live.test.ts`, `context-provider.tsx` and `sem-ctx-value-is-live.tsx`.

### X3 — context resolves at READ time, through the scope chain

**Rule.** A context read resolves **when the read happens**, by walking the scope chain from the
reading scope. It MUST NOT resolve at scope-creation time and it MUST NOT be captured at construction.

**The consequence.** A scope created *before* a provider installed its value still sees that value,
provided the provider is an ancestor at read time.

**X3 does not make X1 optional.** X3 governs RESOLUTION: a read is a walk, performed whenever the
read happens. X1 governs the ordering that puts something on the chain for the walk to find. Moving
`provide`'s write to *after* it invokes its block satisfies X3's letter and breaks every thunked
control claim in `fixtures/semantics/`. A read from a fully disposed scope still resolves, because
disposal does not clear the record, and there is no diagnostic on the read side.

**Falsified by.** Build a consumer's scope, then install a provider above it, then read. The read must
see the provided value.

**Status.** `HOLDS`, at depth, under shadowing, and through a `pin` whose ambient differs from its
lexical parent. Pinned by `control-flow-error-boundary.tsx` and the `fixtures/semantics/` context
fixtures.

### X4 — cross-boundary reads follow the scope chain, not the DOM chain

**Rule.** A portalled subtree reads the provider it is **written** under, not the provider that
happens to be an ancestor of its DOM insertion target. `portal` creates a scope whose parent is the
**lexical** parent and whose insertion target is elsewhere.

**Falsified by.** Two providers with different values; a portal written under provider A and inserted
inside provider B's DOM. The portalled content MUST read A.

**Status.** `UNOBSERVABLE`: no fixture puts a context around a portal.

### X5 — a miss with no default throws, carrying the component stack

**Rule.** `useContext(Ctx)` with no provider and no default MUST throw, and the error MUST carry the
consuming scope's `origin` chain as a component stack. This is free, because the scope chain **is**
the logical tree.

**Falsified by.** The thrown error's stack must name the consuming component and each enclosing
construct, in order, in DEV.

**Status.** `PARTIAL`: the throw `HOLDS`; the stack is `PLANNED`, because a scope carries no
`origin`.

### X6 — the context record is shared by reference until a provide forks it

**Rule.** A scope shares its parent's `ctx` object **by reference**. Only `provide` forks. Therefore
the cost of a scope that provides nothing is zero, and the cost of a provider is one `Object.create`
regardless of how many keys are in scope.

**Falsified by.** Allocate 200 scopes under 200 keys of context; the per-scope cost must not scale
with the key count.

**Status.** `HOLDS` by construction (`provideOn` forks once, on the first provide). No benchmark
pins the flat cost.

---

## 5. K — Control flow and the keying contract

### K1 — the default row identity is the item

**Rule.** One list primitive, three modes, and the default is **identity**:

| `keyed` | row identity | the row Block receives |
|---|---|---|
| absent, or `true` | the item itself | `(item, index: Cell)` |
| a function | `keyed(item)` | `(item: Cell, index: Cell)` |
| `false` | the position | `(item: Cell, index)` |

There is no fourth spelling.

**Why identity.** An index default leaves a row's DOM state (a caret, a selection, a scroll offset,
a `<video>` position, an open `<dialog>`, a widget behind a `ref`) with slot N rather than with the
item in it, so a reorder leaves it behind **silently**, and no compile-time diagnostic can see
through a component boundary to warn about it. The identity default's cost is visible instead: an
immutable update that replaces the row objects rebuilds every row, and `keyed={r => r.id}` is the
opt-out that keeps the row across a replacement.

**Falsified by.** Three procedures, each of which must observe an UPDATE, because the first frame is
identical under all three modes:

 1. `<For each={rows}>` with no `keyed`; type into an `<input>` in each row, then reorder the SAME row
    objects. Every row's nodes MUST be the same objects, in their items' new positions, and the typed
    text MUST have travelled with the item.
 2. The same list, with `rows` replaced by a structurally-equal array of FRESH objects. No row's nodes
    may survive. A survivor means the runtime is comparing something other than the item, and the
    row would go on reading the item it was built with.
 3. The same list under `keyed={false}`, reordered. The nodes MUST stay put and the values MUST move
    through them; the typed text stays at its slot. (This is K3's half.)

**Status.** `HOLDS`. Pinned by `sem-key-identity-default.tsx` for all three procedures, and for the
emission by `control-flow-for.tsx`, `control-flow-for-keyed-by-item.tsx` (identity),
`control-flow-for-keyed-false.tsx`, `control-flow-index.tsx`, `for-unkeyed-rows.tsx` (position) and
`control-flow-for-keyed-fn.tsx` (key function).

### K1.1 — a `Show` is NON-KEYED by default, and the asymmetry with `For` is the point

**Rule.** `Show` and `Match` default to `keyed: false`: the key is TRUTHINESS, the content survives a
change from one truthy value to another, and the children Block is handed the narrowed ACCESSOR.
`keyed` opts into the other one, where the value IS the key and a new value is a new instance with
the raw value handed over. `For` keeps the identity default (K1). The two defaults disagree on
purpose.

| construct | default | key | children receive |
|---|---|---|---|
| `For` | identity | the item | the item, raw |
| `Show` / `Match` | non-keyed | truthiness | a narrowed accessor |

**Why they disagree.** A list row is identified BY ITS DATA, so rebuilding it on an immutable update
is the lesser failure. A `Show`'s `when` is usually a CONDITION and not an identity; for a boolean
the two modes are indistinguishable, so the non-keyed default costs nothing where it is not needed
and saves the subtree (and the text a user typed into it) where it is. This matches Solid 2.0's
defaults.

**Falsified by.** Two procedures, both of which must observe an UPDATE.

 1. `<Show when={user}>` with no `keyed`, containing an `<input>`. Type into it, then set `user` to a
    structurally-different object that is still truthy. The `<input>` MUST be the same node and the
    typed text MUST survive; a read of the accessor MUST show the new value.
 2. The same shape written `keyed`. The node MUST be replaced and the typed text MUST be gone —
    without which "the default preserves" and "nothing ever rebuilds" are the same observation.

**Status.** `HOLDS`. Pinned by `sem-show-nonkeyed-default.tsx`, `control-flow-show-keyed-false.tsx`
and `control-flow-show-keyed.tsx`.

### K2 — an unchanged key is a no-op

**Rule.** A row whose key is unchanged MUST NOT be torn down: its scope, its nodes, their identity,
their focus and their listeners all survive a move. A `branch` whose key expression evaluates to an
unchanged value MUST do **nothing** — no teardown, no rebuild, no Block invocation (C7).

**Falsified by.** Metamorphic: write a signal that changes nothing the key depends on; assert every
node in the branch is the same object and the Block's invocation counter did not move. Then reorder a
keyed list; assert the moved row's nodes are the same objects.

**Status.** `HOLDS`: `region` returns before anything else when the key equals the previous one.
Pinned by `packages/core/src/flow.test.ts` and the metamorphic channel (`test/metamorphic.ts`) over
`fixtures/l4/` `mm-branch-key-stable.tsx`, `mm-branch-nonkeyed-truthy.tsx` (the one fixture where the
region's own comparison is the only thing between a write and a rebuild), `mm-keyed-move.tsx` and
`mm-index-row-stable.tsx`, plus `control-flow-for-keyed-by-item.tsx`.

### K3 — a positional row containing stateful DOM is a compile-time hint

**Rule.** Under `keyed={false}` a row's identity is its POSITION, so DOM state inside the row belongs
to slot N rather than to the item in it and a reorder leaves it behind. When the row Block's **inline**
markup contains `input`, `textarea`, `select`, `video`, `audio`, `details`, `canvas`, `dialog` or a
custom element, the compiler SHOULD say so: `BARQ011`, at note level, under `dev`. It sees inline
markup only, so it is a HINT about a spelling the author asked for, not a proof, and nothing else in
this document may rest on it.

**Falsified by.** Two halves. The BEHAVIOUR: a `keyed={false}` list, typed into and then reordered,
whose typed text moved with the item rather than staying at the slot. The HINT: a `<For keyed={false}>`
whose row contains an `<input>` and produces no `BARQ011`, or any `<For>` in the corpus that produces
one without asking for the positional mode.

**Status.** `HOLDS`. Pinned by `sem-key-identity-default.tsx` for the behaviour and
`test/diagnostics.test.ts` for the code.

### K4 — duplicate keys are a DEV error and degrade to index

**Rule.** Duplicate keys are a DEV error naming both positions. The second and later occurrences are
treated as index-keyed. Rendering MUST NOT be abandoned and rows MUST NOT be silently dropped.

**Falsified by.** A list with two rows sharing a key must render two rows and log one error.

**Status.** `PLANNED`. No fixture.

### K5 — a key expression is plain emitted JavaScript

**Rule.** The runtime never evaluates a condition. `branch` receives a `Cell<K>` computing an integer
key; `Show`, `Switch`/`Match`, ternaries, `&&`, `Dynamic` and a router `Outlet` all lower onto it.
`Show`, `Switch`, `Match`, `Repeat`, `Dynamic` and `Portal` **cease to exist as components**
and are recognised by `SymbolId` resolved to the framework module — never by name, which is unsound
under shadowing.

**Falsified by.** A locally-shadowed `Show` MUST be treated as a user component, not lowered. An
imported-and-renamed `Show` MUST be lowered.

**Status.** `HOLDS`. `passes/flow.rs` lowers `Show` and `Switch`/`Match` to `branch`, `For`/`Repeat`
to `each`, `Loading` and `Errored` to `boundary` and `Portal` to `portal`, with the key as plain
emitted JavaScript (`() => visible() ? 1 : 0`) and the `(parent, anchor)` pair from the template
walk. A refused shape (a mapped list of `<Match>`, `Dynamic` behind a spread) keeps the component
call, which reaches the same primitive through an adapter; `Reveal` lowers to a `reveal` call. The
`STATIC_KEY` and `NO_SCOPE` flags are written only where the compiler proves them. Pinned by
`renamed-core-import.tsx`, `signal-alias.tsx`, the control-flow fixtures' `optimality` declarations,
`control-flow-show-static-key.tsx`, `control-flow-switch-static-key.tsx` and the flag census in
`test/optimisation.test.ts`.

### K6 — each activation of a branch gets a fresh scope and a fresh build

**Rule.** On a key change: dispose the old instance scope (O3, in full), clear its range, `enter` a
fresh child scope, invoke `bodies[k]` under it, insert at the anchor. A hide/show cycle MUST produce
**fresh nodes**, never the same node handed back.

**Falsified by.** Toggle a `Show` off and on; the re-shown nodes MUST NOT be the same objects as
before.

**Status.** `HOLDS` for every construct that reaches `branch`/`each`/`boundary`/`portal`. Pinned by
`packages/core/src/flow.test.ts`, `control-flow-show.tsx`, and the metamorphic channel over
`fixtures/l4/` `mm-branch-flip.tsx`, `mm-switch-arm.tsx` and `c7-dynamic.tsx`, whose steps are
declared `rebuilds` and are checked off the DOM and off the ownership trace.

### K7 — no marker comments in client rendering

**Rule.** A range owner receives `(parent, anchor)` from the compiler's template walk. `anchor = null`
means append. Two adjacent dynamic siblings share one empty text node baked into the template. A
client-rendered page MUST contain **zero** framework comment nodes.

**Falsified by.** `createTreeWalker(root, SHOW_COMMENT)` over a rendered page must count 0.

**Status.** `PARTIAL`. No framework marker PAIRS exist: the four primitives take `(parent, anchor)`
and a region the compiler cannot hand a parent carries one empty text node, not a comment. A
`<!---->` still separates two adjacent dynamic siblings (`passes/anchor.rs`), because `innerHTML`
cannot materialise an empty text node, so the rule as written cannot be met. Pinned by the anchor
snapshot channel over the whole corpus and `marker-literal-text.tsx`.

### K8 — ambient insertion state is rejected

**Rule.** There MUST NOT be a module-global "current insertion point" that block constructors read and
must consume exactly once. Insertion targets are arguments. A module global that must be consumed
exactly once by a consumer nobody enumerated is the same bug class as the Provider bug (vuejs/core#13203).

**Falsified by.** Any module-level mutable insertion state in the runtime. Checked by inspection, not
by a fixture.

**Status.** `HOLDS`, structurally.

---

## 6. E — Errors

### E1 — every scope knows its catcher in O(1)

**Rule.** `s.catcher` is copied from the parent at `enter`. Lookup MUST NOT walk the chain. `render`
establishes a root catcher, so **a catcher always exists** — which is what makes O4.3 total.

**Falsified by.** A throw at depth 20 must reach the boundary at depth 2 with no chain walk
observable in the trace; a throw with no user boundary must reach the root, not `window.onerror`.

**Status.** `PLANNED`. No fixture.

### E2 — the routed entry points, enumerated

**Rule.** Exactly these entries into user code are routed to `s.catcher`, and there are no others:

| # | Entry point | Which boundary catches it | Status |
|---|---|---|---|
| 1 | **Block invocation** (construction) | the boundary the Block is invoked *inside* | `HOLDS` |
| 2 | **component body** | the boundary enclosing its position | `VIOLATED` |
| 3 | **computed evaluation** | the boundary of the scope that created the computed | `HOLDS` |
| 4 | **effect body** | the boundary of the scope that created the effect | `HOLDS` |
| 5 | **cleanup** | the disposing scope's catcher; does not abort the rest (O3.6) | `VIOLATED` |
| 6 | **event handler** | the boundary owning the *element*, via the scope stored beside the handler | `HOLDS` |
| 7 | **ref callback** | the boundary owning the element | `VIOLATED` |
| 8 | **async continuation** | the boundary of the scope that created the resource, if `gen` still matches | `VIOLATED` |

**E2.1 — construction throws land inside the boundary.** A boundary enters its scope, installs the
catcher, and **then** invokes the content Block inside a `try`. The child therefore throws *inside*
the boundary, not at its call site.

**Falsified by.** `<Errored fallback={…}><Boom/></Errored>` where `Boom` throws during construction:
the fallback MUST render.

**E2.2 — a handler throw is the framework's problem.** A handler is code the framework invoked, so the
framework owns its failure. The delegated dispatcher stores the owning scope alongside the handler —
one `$$s` expando per ELEMENT, beside the `$$<type>` the protocol already had — and routes a throw to
the nearest `ERROR_BOUNDARY` on that scope's chain. A listener the element owns routes the same way,
inside `listen`, and so does one bound through `spread`, so no registration can be given one
behaviour and another a different one.

**E2.3 — `NotReadyError` is re-thrown, never captured as an error.** An error boundary MUST pass it
through to the nearest `Loading` boundary.

**Status.** `PARTIAL`: entries 1, 3, 4 and 6 are routed, the rest are not. Entry 7 is routed by
`ref`, but no channel observes it, so it is not recorded as holding. E2.1, E2.2 and E2.3 each `HOLDS`. Pinned by
`sem-err-construction-throw.tsx` (E2.1, in the direct form across `Errored`, `Loading` and a
`Reveal > Loading > Errored` stack), `sem-err-handler-throw.tsx` and `packages/core/src/dom.test.ts`
(E2.2), `sem-err-notready-passthrough.tsx` (E2.3), and `control-flow-error-boundary.tsx` and
`control-flow-errored-loading.tsx` for entries 3-4.

### E3 — a boundary is a branch plus a try

**Rule.** A boundary is a `branch` keyed on `{content | fallback}` plus a `try`. `reset()` bumps the
key, so recovery is a branch flip and is uniform with all other control flow (K6: fresh scope, fresh
build). A boundary MUST NOT have a bespoke teardown path. Its catcher both records the error and
re-reads the key, so an error raised during the flush that built the region is acted on in that
flush.

**Falsified by.** After `reset()`, the retried content MUST be freshly built (K6) and its scope MUST
be a new object.

**Status.** `HOLDS`: `boundary` is the same `region` driver `branch` uses. Pinned by
`control-flow-error-boundary.tsx`.

### E4 — an error carries the scope chain as a component stack

**Rule.** In DEV, `enter` stamps `s.origin` with `(module, unit, position, name)` and a routed error
carries the scope chain. This is free, because the scope chain **is** the logical tree — there is no
second structure to maintain and nothing to keep in sync.

**Falsified by.** A throw at depth 5 must produce a stack naming all five enclosing constructs, in
order, with their source positions.

**Status.** `PLANNED`. No fixture.

---

## 7. M — Mount and update ordering

These rules are DOM-backend-scoped. The SSR backend has no ordering to observe beyond byte order.

### M1 — construction is depth-first in document order

**Rule.** A subtree is fully constructed before its next sibling begins. A Block returns only after its
own subtree exists.

**Falsified by.** Log at every component entry and exit; the log MUST be a well-formed balanced
sequence in document order.

**Status.** `HOLDS`. Pinned by `dashboard-composite.tsx`.

### M2 — a binding's first write happens during construction, not after

**Rule.** Every reactive binding runs its compute-and-apply **once, synchronously, at creation**. The
first frame is complete before `render` returns. There MUST NOT be an intermediate frame in which a
hole is empty and a subsequent flush fills it.

**Falsified by.** A `MutationObserver` installed on the container before `render` must see the
element's attributes and text in their **final** state at the moment of insertion, never a
placeholder followed by a correction.

**Status.** `HOLDS`. Pinned by `reactive-attribute.tsx` and `text-hole-fused.tsx`; no fixture runs the
`MutationObserver` half.

### M3 — a ref runs at creation, in document order, before insertion

**Rule.** A `ref` callback runs synchronously when its element is created, right after the element's
template is cloned. Refs therefore run in document order, a parent's before its children's, and
before the element is inserted into the parent its render is building. At that point the element
has its static children and its parent within the same template; children a component or a hole
builds are not there yet, and a component's root element has no parent. Work that needs the
connected, fully built DOM belongs in `onSettled` or an effect, which run after the render settles.
A ref callback that returns a function has that function registered as a cleanup on the scope that
owns the element. The timing is Solid 2.0's (`packages/web/src/client.ts`, `ref`), which applies the
callback inline at creation; Solid ignores the returned value, barq registers it.

**Falsified by.** A parent's ref logged after a child's; a ref on a component's root element that
sees a parent; a parent's ref that sees children a component child builds; a returned function that
does not run at dispose, or when a branch holding the element leaves.

**Status.** `HOLDS`. Pinned by `test/ref.test.ts`, `ref-binding.tsx` and `ref-on-component.tsx`.

### M4 — updates flush on a microtask; render effects before user effects

**Rule.** A write schedules a flush on the microtask queue. Within a flush, **render** effects drain
completely before **user** effects, and the loop repeats until both heaps are empty. `flush()` drains
now, and `flush(fn)` runs `fn` and then drains.

**Falsified by.** Write two signals in one turn; assert exactly one flush, all DOM writes before any
user effect, and every user effect observing final DOM.

**Status.** `HOLDS` (the scheduler of `@solidjs/signals`). Pinned by every fixture with `steps`, and
discriminated by `multi-signal-expression.tsx`.

### M5 — a stable re-render preserves every node

**Rule.** Re-rendering with unchanged inputs preserves every node object. A write that does not change
a branch key preserves every node inside that branch. A keyed move preserves the moved row's nodes.
This is a **metamorphic** property: it needs no reference implementation.

**Falsified by.** Snapshot node identities; drive a no-op step; compare. Any replaced node falsifies
M5 and the diff names the position.

**Status.** `HOLDS` for element bindings and for a `Show`'s content across a truthy-to-truthy change
(K1.1). By design an identity-keyed `For` replaces a row whose item object is replaced (K1). Pinned
by the metamorphic channel over `fixtures/l4/`.

### M6 — insertion is idempotent under interruption

**Rule.** A construct that is disposed while constructing MUST leave no nodes in the document (O4.4)
and MUST NOT insert after disposal. A Block whose scope died mid-construction MUST NOT complete its
insertion.

**Falsified by.** Dispose from inside a ref callback halfway down a subtree; the container MUST end
empty.

**Status.** `UNOBSERVABLE`. No fixture.

---

## 8. R — Where reactivity is entered and exited

### R1 — reactivity is entered in exactly four places

**Rule.** A dependency is recorded only inside: `fx` (an element's fused compute), `effect`,
`computed`, and the internal compute of `branch` / `each`. Nowhere else. In particular a **component
body is not a tracking scope**: reads in a component body MUST NOT subscribe anything.

**Falsified by.** Read a signal in a component body; write it; the component MUST NOT re-run and
nothing may re-render on account of that read.

**Status.** `HOLDS`, in both halves. Pinned by `sem-react-component-body-untracked.tsx`.

### R2 — reactivity is exited in exactly three places

**Rule.** Tracking is left by `untrack`, by `peek`, and **structurally** by the apply phase of every
element effect. The apply phase runs untracked, so a DOM read there can never become a dependency.

**Falsified by.** Reach a SIGNAL from inside an apply phase (a value whose `toString` reads it, which
`setAttr` coerces); writing that signal MUST NOT re-run the effect, while the compute still
subscribes. Reading a DOM property such as `el.offsetWidth` cannot discriminate, because no DOM
property is reactive.

**Status.** `HOLDS`: the compiler emits compute and apply as two functions and the engine runs the
second untracked. Pinned by `sem-react-apply-is-untracked.tsx`.

### R3 — a Cell is neutral

**Rule.** Calling a Cell neither enters nor exits tracking (C3.3). The **consumer's** tracking state
decides whether the read subscribes. This is the rule that makes props fine-grained: a prop read
inside a child's effect subscribes that child's effect, at the child's position, with no involvement
from the parent.

**Falsified by.** Pass `x={sig()}` (η-reduced to `x: sig`); read `props.x()` inside the child's effect;
write `sig`. Only that child's effect may re-run. Read the same prop in the child's body; write `sig`;
nothing may re-run.

**Status.** `PLANNED`. Pinned in part by `component-boundary-props.tsx`; no fixture runs the
procedure.

### R4 — `untrack` changes only the observer

**Rule.** See O6. Stated twice deliberately: it is an ownership rule and a reactivity rule, and
conflating owner with observer is the bug source both sections exist to prevent.

**Status.** `HOLDS`, with O6's observation. Pinned by `sem-react-untrack-keeps-owner.tsx`.

### R5 — the epoch write-dedupe and `markWave` are load-bearing

**Rule.** N writes between two flushes cost O(1) marking. While the mark epoch is unchanged no mark
has been consumed anywhere, so a later write in the same batch stops at a node the current wave
already visited: four writes in one batch cost one traversal, not four. See R8 for the marking
invariant this rests on.

**Falsified by.** An ablation harness with correctness assertions on every variant: removing the
dedupe must cost more than it saves on "100 writes + 1 flush".

**Status.** `UNOBSERVABLE` here: marking belongs to `@solidjs/signals`, and barq carries no ablation
harness for it.

### R6 — a signal getter is a Cell

**Rule.** The read half of `createSignal` **is** a `Cell`: a function of no arguments that reads.
Therefore a signal is passable as a prop with zero adaptation and η-reduction (`x={s()}` → `x: s`) is
sound by construction (C5.2).

**Falsified by.** A getter that is not a plain read.

**Status.** `HOLDS` for `createSignal`'s read half. Pinned by `signal-object.tsx` and
`signal-methods-in-handler.tsx`.

### R7 — `linked` is writable derived state that re-seeds

**Rule.** A derived signal, `createSignal(fn)`, returns a pair whose read is a `Cell` that is
WRITABLE. A write holds until what `fn` reads next changes; that change recomputes `fn(previous)` and
the write is gone. `fn` receives the previous value, so "keep the user's choice if the new list still
contains it" is expressible without a second signal to reconcile. (`linked` names the same contract.)

**Falsified by.** The read-copy trap: a signal seeded from a prop freezes at the first value it ever
saw. Write, change the source, read — the recomputation MUST win. Write, do NOT change the source,
read — the write MUST win. A framework that only ever does one of the two passes one half and fails
the other, which is why both are claims.

**Status.** `HOLDS`. Pinned by `sem-state-linked-reseeds.tsx`.

### R8 — a mark on a pure node implies its whole closure is marked, and propagation is linear in depth

**Rule.** `markNode` MUST NOT mark a pure computed without also marking that node's subscribers.
Therefore a pure computed that is currently CHECK or DIRTY has its entire descendant closure marked
at CHECK or above, and re-marking after a recompute MUST touch the DIRECT subscribers only. The
direct level takes the CHECK→DIRTY upgrade, since DIRTY is the only mark that survives an `equals`
comparison against an unchanged snapshot; below it CHECK is already correct, because any change must
pass through a direct subscriber to reach anything further down. A subscriber found CLEAN is outside
what this rule asserts and MUST get the full walk.

The consequence is the rule's observable form, and it is the one to test: **the cost of propagating
one write MUST be linear in graph depth. Milliseconds per layer MUST NOT rise as layers are added.**

**Falsified by.** A recompute that re-walks its transitive closure. It changes no flag, because the
marks are already standing, so no correctness test can see it; only counting or timing propagation
against depth can.

**Status.** `HOLDS` as far as barq can observe: marking belongs to `@solidjs/signals`, and the depth
sweep is the twelfth case of `packages/benchmark/src/eleven-cases.ts` (`chain(500)`) and the
`__jrbDepth` sweep in `packages/benchmark/src/tier2/jrb.ts`. Benchmark, not fixture.

---

## 9. B — Bindings, events and refs (DOM backend)

Derived rules. `class={s()}` being a one-shot write on the same element where `id={s()}` is live is
a defect a specification has to be able to name.

### B1 — every binding on an element is equally live

**Rule.** Two bindings written the same way on the same element MUST have the same liveness. There is
no attribute name for which a reactive expression silently becomes a one-shot write.

**Falsified by.** `<b class={s()} id={s()} title={s()} />`; write `s`; **all three** must change.

**Status.** `HOLDS`: no name decides liveness; a channel whose applied value differs from its input
threads that value through the fused record (`Diff::Thread`, B2). Pinned by `equal-liveness.tsx`
(three bare reads), `class-with-live-siblings.tsx` and `class-owns-only-its-tokens.tsx`, and by the
front-end probe in `test/optimisation.test.ts`.

### B2 — one fused effect per template, with a compiler-allocated prev record

**Rule.** All of a template's reactive attribute, property, class and style bindings, on every
element of it, compute into one flat record and apply by field comparison, as Solid 2.0 fuses them.
An opaque call joins the record and is read through `readOpaque`, the read `bindProp` makes. The
previous-value store is the compute's own return value: no runtime-allocated object, no per-element
expando. `class` and `style` are members of that record like any other. Child holes
keep their own effects.

- **The apply cannot subscribe.** It is the second argument, and it runs with tracking off (R2).
- **The prev store is the compute's own return.** A channel whose applied form differs from its
  input writes that form back into the same slot, which is how `class`, `style` and
  `dangerouslySetInnerHTML` keep the REMOVAL half of their diff inside a shared effect.
- **The fields are POSITIONAL.** `__proto__` as a record key would write through
  `Object.prototype`'s setter instead of creating an own slot.
- **A fused effect never returns a function.** The compute returns an object literal and the apply
  returns nothing, so neither can be registered as a cleanup.

One live prop needs no record at all: its previous value is a scalar and the compute returns it
directly.

**Falsified by.** Count effects per template clone with N reactive bindings over any number of
elements: it MUST be 1, not N.

**Status.** `HOLDS`. Pinned by `multi-prop-one-element.tsx`, `reactive-attribute.tsx`,
`class-with-live-siblings.tsx`, `equal-liveness.tsx`, `sibling-live-props.tsx` (two elements, one
record) and `sem-react-apply-is-untracked.tsx`.

### B3 — `ref` is not a prop

**Rule.** `<div ref={el}>` with a writable binding MUST emit an assignment `el = _n1`. `ref={fn}` MUST
emit a ref registration that runs per M3. `useRef()` and the `{current}` shape are deleted.

**Falsified by.** After render, the `let` binding MUST hold the element.

**Status.** `PARTIAL`. The channel holds: `ref` is `Op::Ref`, a writable binding lowers to an
assignment and every other shape to `_$ref`, which owns the cleanup a callback returns and routes a
callback throw. `_$ref` still accepts the object and array forms.
Pinned by `ref-writable-binding.tsx`, `ref-binding.tsx` and `ref-on-component.tsx`.

### B4 — a listener dies with its position

**Rule.** Every listener registers a cleanup on the owning scope. Removal costs zero bookkeeping and
cannot be forgotten. Handler identity is bound once.

**Falsified by.** The leak oracle: registered-listener count after `dispose()` MUST be 0, for direct
and delegated listeners alike (a root's delegated listeners sit on its container and leave with it).

**Status.** `HOLDS`. `listen` pairs `addEventListener` with an `onCleanup` on the owning scope, and
`spread` owns the removal of the listeners it binds. Pinned by the whole corpus through
`test/leaks.ts` (zero outstanding listeners, with the probe shown to still see an un-removed one),
`delegated-event.tsx`, `non-delegated-event.tsx`, `ref-cleanup.tsx` and
`packages/core/src/dom.test.ts` for the `spread` channel.

### B5 — property-vs-attribute is a stated rule with an explicit override

**Rule.** Known HTML attribute → attribute; else if the property exists on the prototype chain →
property; else attribute. `prop:` forces the property on a custom element.

**Falsified by.** `<my-grid rows={arr}>` MUST NOT become `setAttribute("rows", "[object Object]")`.

**Status.** `PARTIAL`. The override holds: `prop:` and `bind:` are decided at compile time. The
default does not: the compiler answers it from the `DOM_PROPS` table rather than a prototype probe,
so `<my-grid rows={arr}>` without a prefix is an attribute write. Pinned by
`attribute-namespaces.tsx`, `bind-value-channel.tsx`, `custom-elements.tsx`, `property-attrs.tsx` and
`dom-prop-static-value.tsx`.

### B6 — a user-mutable property is compared against the ELEMENT

**Rule.** For the user-mutable set — `value` on `input`/`textarea`/`select`, `checked` and
`indeterminate` on `input`, `selected` on `option`, `open` on `details`/`dialog`, `scrollTop` and
`scrollLeft` anywhere, `currentTime` and `volume` on the media elements, and a contenteditable's text
— a write MUST compare against **what the element currently holds** and skip when equal. It MUST NOT
be guarded by the fused record's `!==`, whose subject is what the FRAMEWORK last wrote. `bind:` MUST
additionally re-assert the signal **synchronously, inside the reported edit**.

The channel is resolved from the **pair** `(tag, property)`, not from the property. `<option
value={s()}>` is not on it: an option's `value` falls back to its text, so a compare against the
element reports "already holds it" and the reflected attribute never appears.

**Falsified by.** Two writers, one property. (1) Bind an input to a signal whose setter REJECTS a
keystroke — `set(v => v.replace(/\d/g, ""))`. Type `a1`. When the event returns the element MUST read
`a`. (2) The channel is per-pair: compile `<option value={s()}>` and `<input value={s()}>`; only the
second reaches it.

**Status.** `HOLDS`: `Chan::Live` compares against the element (from `USER_MUTABLE_PROPS`, which
`build.rs` reads out of `dom.ts`), and `bindValue` writes the signal's value back inside the event.
The string backend drops the `value` attribute of a checkbox or radio `<input>`, so `bind:group` is
driven under `fixtures/semantics/` rather than in the SSR corpus. Pinned by
`sem-form-dom-compare.tsx`, `bind-family.tsx`, `property-attrs.tsx`, `dom-prop-static-value.tsx` and
`test/tables.test.ts`.

### B7 — a write preserves the selection and the focus

**Rule.** A write that LANDS on a focused text control MUST restore `selectionStart`, `selectionEnd`
and `selectionDirection`, clamped to the text that is now there, and the element MUST still be the
document's `activeElement` when the write returns. A contenteditable's caret is preserved by TEXT
OFFSET, so it survives the replacement of the text node it was in.

**Falsified by.** Focus an input, type, select a range inside it, then set the bound signal **from
elsewhere**. `selectionStart` and `selectionEnd` MUST both survive. Without it `element.value = x`
moves the text entry cursor to the end of the control (HTML §4.10.5.5) and the range is gone.

**Status.** `HOLDS`, except `<select multiple>`, which `bind:value` binds through the
single-selection `value` property. Pinned by `sem-form-selection-preserved.tsx` (the arithmetic, in
happy-dom) and `test/browser-caret-check.ts` (real keystrokes through CDP in Chrome).

### B8 — `action` on a `<form>` is decided by the SLOT, not by the value's shape

**Rule.** `action` on a `<form>` is the form's URL when it holds a string and its SUBMIT HANDLER when
it holds a function. The handler MUST NOT be called to obtain an attribute, MUST NOT be serialised
into the target, and MUST run on submit with the form's `FormData` — including the submitter's own
name and value — with the browser's default navigation prevented. The listener is owned by the
position (B4). A literal URL MUST still fold into the template bytes, and `action` on any other
element MUST stay the attribute it always was. An `action()` has arity 0 and would read as a Cell, so
nothing about the expression separates a Cell yielding a URL from a handler: the SLOT decides.

**Falsified by.** Render `<form action={fn}>` and observe TWO things before any interaction: `fn`
MUST NOT have been called, and `getAttribute("action")` MUST be null. Then submit: `fn` MUST receive
a `FormData` carrying the form's fields, and `location` MUST NOT change.

**Status.** `HOLDS`. The string backend writes a URL and nothing for a handler, so a form submitted
before hydration performs the browser's own default submit. Pinned by `sem-form-action-slot.tsx` and
`form-action.tsx`.

---

## 10. A — Async

The reactive engine is `@solidjs/signals`, so the async model is Solid 2.0's and is specified and
tested there: a pending read throws `NotReady` to the nearest `Loading`, a later re-ask keeps serving
the settled value while `isPending` reports the one in flight, a write made inside an `action` is held
until the action returns, and an optimistic write shows over that hold and gives way when it ends.
What this section specifies is what barq's own layer has to get right on top of that model: how a
boundary and a reveal group place nodes, and what a string render does with a value that has not
arrived.

### A3 — `NotReady` is a control signal, not an error

**Rule.** A memo that has not settled throws `NotReady`. A `Loading` boundary catches it; an error
boundary re-throws it (E2.3). It never reaches user error handling.

**Status.** `HOLDS`: with an `Errored` between a pending read and the `Loading` above it, the loading
fallback answers, and a genuine failure through the same two boundaries still reaches the error
fallback. Pinned by `sem-err-notready-passthrough.tsx` and `control-flow-await-suspense.tsx`.

### A4 — optimistic state is derived, never restored

**Rule.** `() => reduce(base(), pending())`. There is no snapshot, therefore there is nothing to
clobber. A real write landing during an action is not rolled back.

**Falsified by.** Start an optimistic action; land a real write to the same target mid-flight; settle;
the real write MUST survive.

**Status.** `HOLDS`. Pinned by `sem-async-optimistic-derived.tsx` and `optimistic-signal.tsx`.

### A6 — reveal ordering is a slot contract, and a nested group is ONE composite slot

**Rule.** Six clauses.

**(a) The coordinator is a PROVIDE, and the boundary carries an ordering channel. They are not
alternatives.** A `Reveal` creates a provide scope (O1 lists `provide` separately from `branch`;
it owns no range) and publishes one coordinator on it. That provide is how a slot FINDS its group,
and it has to be a context read through the scope chain rather than anything lexical, because a
`<Loading>` three components deep is still in the group (X3, X4). The channel is what a slot must
EXPOSE in order to BE one, and it is on the boundary because the thing registering is not
always a boundary — clause (c). The reference does both too: `RevealControllerContext` is a
context, and `CollectionQueue` carries `_revealController`, `_disabled` and `_collapsed`.

**(b) The channel is two predicates up and one decision down.**

| direction | name | meaning |
|---|---|---|
| up | `ready()` | every boundary in this slot has settled |
| up | `minimallyReady()` | this slot has its own first visible content, under its own order |
| down | `display()` | `content` \| `fallback` \| `nothing` |

For a LEAF the two predicates are one accessor and there would be no reason to have two. They
differ only for a group, which is clause (c), and that is the whole reason the channel carries two.

Both predicates are facts about DATA and neither is a fact about what the slot is currently
showing. The coordinator maps readiness onto display and never the reverse — which is what stops a
held group from deadlocking against its own hold: its leaves are on their fallbacks *because* it is
held, and if being on a fallback counted against readiness the hold could never lift.

**(c) A nested group registers as ONE composite slot in the enclosing group.** Not as its leaves,
and not not at all. It is held on its fallbacks until the outer releases that slot, and once
released it runs its own order locally over whatever is still pending. There is no opt-out: nesting
under an outer group means participating in its ordering.

**(d) What each order calls "minimally ready".** This is the predicate an enclosing `together`
releases on, and it is why `together` can promise a single cohesive reveal without waiting for every
grandchild.

| order | minimally ready when |
|---|---|
| `together` | every direct slot is |
| `sequential` | the FIRST direct slot is — the frontier can advance |
| `natural` | ANY direct slot is |

An empty group is minimally ready and ready under all three.

**(e) Two places an outer RELEASES a composite instead of holding it.** Both are about composites
only; a leaf is held in both.

- Under `natural`, always. The mode exists FOR nesting — at the top level it is indistinguishable
  from omitting the `Reveal` — so holding a composite would make `natural` a `sequential` of one.
- Under `sequential`, the FRONTIER slot. Holding a LEAF is exactly what keeps its fallback visible;
  a composite is released instead, so its own leaves each show their own fallback while it fills in.
  The outer still waits on the composite's full `ready()` before advancing PAST it, which is the one
  place the two predicates are read for two different decisions about the same slot.

**(f) A hold propagates through the whole subtree, carrying the outer's collapsed policy, and the
inner order is ignored while held.** A group held as `nothing` shows nothing anywhere below it
regardless of its own `collapsed`. `collapsed` is consulted under `sequential` only — the other two
orders have no frontier for a slot to be past.

**The default order is `sequential`.** `natural` is the one order that does nothing at the top
level, so defaulting to it makes `<Reveal>` with no props a no-op.

**A registration is released by disposal.** A slot list that only grows is not a contract: a
boundary that dies inside a `Show` would otherwise hold its group's frontier at its own index for
the rest of the page, and nothing reports it.

**Falsified by.** Seven procedures. Each must observe a moment at which an inner group's order and
its outer's DISAGREE, because a flat group behaves identically under a one-predicate coordinator and
under this one.

1. Outer `sequential` over `[leafA, group(B, C)]`, the group `natural`. Settle B. Nothing may
   change: the group is slot 1 and is held, so its own order does not run. *(Fails if a nested group
   registers nothing — B reveals on its own schedule and the outer's order means nothing below the
   first level.)*
2. Then settle A. The group becomes the frontier and MUST be released rather than held: B shows and
   C stays on its fallback. *(Fails if a frontier composite is held like a leaf — the whole group
   waits on its slowest member before showing anything.)*
3. Outer `sequential` COLLAPSED over `[group(B, C), leafD]`. Settle B. D must still render nothing:
   the group is minimally ready and not ready, and `sequential` advances on `ready`. *(Fails if
   `sequential` reads `minimallyReady` — the two predicates then have no reason to be two. Collapsed
   is what makes the frontier's position observable at all: past it a slot renders nothing rather
   than a fallback, so D's fallback appearing IS the outer having advanced.)*
4. Outer `together` over `[leafA, group(B, C)]`, the group `sequential`. Settle A and B but not C.
   The whole outer group MUST release. *(Fails if `together` waits on full readiness: the cohesive
   reveal it exists to give never happens until the slowest grandchild lands.)*
5. Outer `natural` over `[leafA, group(B, C)]`. Settle B. B must show while C does not. *(Fails if
   a composite is held-until-ready under `natural`, which is the rule a LEAF gets.)*
6. Outer `sequential` COLLAPSED over `[leafA, group(B)]`, the group not collapsed. Before A settles
   the page must be A's fallback ALONE. *(Fails if the hold does not carry the outer's collapsed
   policy down — the inner group's own `collapsed: false` then gets a say while it is held.)*
7. A group over `[leafA, leafB]` where A's boundary is torn down without ever settling. B must
   reveal. *(Fails if a registration outlives its boundary: the frontier pins on an index nothing
   will ever fill, and the rest of the group is dark for the life of the page.)*

**Status.** `HOLDS`. Pinned by `sem-reveal-nested-group.tsx` (the seven procedures through compiled
JSX), `packages/core/src/reveal.test.ts`, `control-flow-reveal.tsx` and `fixtures/l4/c7-reveal.tsx`.

### A7 — a compute returns a value, ANY thenable, or an async iterable

**Rule.** `createMemo(fn)`'s `fn` may hand back three things and they are one node at three arities.

| returned | the node |
|---|---|
| a plain value | settles synchronously; the ordinary case |
| any THENABLE — Promises/A+ shape, not `instanceof Promise` | pends, then commits the awaited value |
| an ASYNC ITERABLE | pends until the FIRST yield, then commits every yield in order |

**Thenable, not `Promise`.** `instanceof Promise` is a question about the CONSTRUCTOR. A thenable
from another realm, from a library, or out of a transpiled async function is awaitable all the same
— `await` itself asks only for the shape — so a core that asks the narrower question disagrees with
the language, and disagrees SILENTLY: the value is stored as-is, the node settles instantly, and
every read gets the thenable object where the awaited value belonged.

**A stream is pending until its FIRST yield and settled from then on.** A stream that re-marked
itself pending per step would flap every `Loading` above it once per element, and the fallback is
precisely what a stream exists to avoid. After the first answer the node is a value that keeps
changing, which is a signal being written, not a boundary's business. The same rule decides
`settle()`: only the first step is registered as in-flight, so a server render waits for the
stream's first answer rather than for a producer that may never finish.

**A stream that ends without yielding settles on `undefined`** rather than staying pending, because
"pending forever" holds every boundary above it for the life of the page.

**The iterator is CLOSED by disposal and by supersession**, through `iterator.return()` — which is
what runs a generator's own `finally` and what stops an endless producer. Supersession closes the
old stream when its replacement is INSTALLED, not when its next step happens to resolve, or an
interval-driven producer keeps running until it next yields. Cancellation is structural, and this is
it reaching a stream through the only handle it has.

**A bare `IteratorResult` from `next()` is assimilated, not awaited as a thenable.** `for await`
unwraps whatever `next()` returns, and a producer with a value already buffered is entitled to skip
the promise; calling `.then` on that is a `TypeError`.

**And the tracked read must be in the COMPUTE, not in the generator body.** An async generator's
body does not run until `next()`, which happens from a continuation the tracked region has already
left, so a source read inside the body registers no dependency and the node never re-runs. This is
the language's shape rather than a choice, and it is why a streaming compute is written as a
function that reads and then returns the stream.

**Falsified by.** Eight procedures. Every stream procedure must observe MORE THAN ONE yield: one
yield is indistinguishable from a promise — the same "pending, then a value" — so a single-yield
procedure is satisfied by an implementation that awaits the first step and abandons the iterator,
which is most of the ways to get this wrong.

1. Return a plain object with a `then` method. The node MUST pend and then read as the resolved
   value. *(Fails on `instanceof Promise`: the node settles holding the object.)*
2. The same, rejecting. The rejection MUST be the node's error. *(Fails the same way, with the
   thenable stored as a value and no error anywhere.)*
3. Return an async generator yielding 1, 2, 3 with a gap between each, under an effect that records
   what it reads. The record MUST be `PENDING, 1, 2, 3` — pending exactly ONCE. *(Fails if the
   iterator is abandoned after the first step, and separately if each step re-suspends.)*
4. Return an async generator that yields nothing. The node MUST settle. *(Fails if an empty
   completion leaves the node pending, which holds every boundary above it for good.)*
5. Return a generator that yields once and then throws. The first value MUST commit and the throw
   MUST become the node's error. *(Fails if the stream is abandoned after the first yield — the
   error then never arrives at all.)*
6. Dispose a scope containing a node over an endless generator with a `finally`. The `finally` MUST
   run and the pull count MUST stop rising. *(Fails if disposal drops the node without closing the
   iterator: the producer pumps into a disposed node forever and its cleanup never runs.)*
7. Re-run the compute over a new source value. The superseded generator's `finally` MUST run and the
   new stream's values MUST appear. *(Fails if a stream is only closed when its next step resolves.)*
8. Return an iterable whose `next()` gives a BARE `IteratorResult`. It MUST be consumed. *(Fails
   with a `TypeError` on `.then` of a non-thenable.)*

**Status.** `HOLDS`. Pinned by `packages/core/src/async-source.test.ts`, whose eight claims are the
eight procedures, and `sem-async-stream.tsx`, which drives a stream through compiled JSX and a
`Loading` boundary.

## 11. H — Hydration

### H1 — hydration is claim-based, not replace-based

**Rule.** The client **claims** server-rendered nodes by walking them. It MUST NOT clear the container
and re-render.

**Falsified by.** Node-reuse percentage on a matching render MUST be 100% for every fixture whose
root the template can express, and every fixture that falls short MUST be registered with its exact
reuse.

**Status.** `HOLDS-with-registry`. `test/hydration.test.ts` puts each fixture's string markup in a
container, hydrates the DOM module over it and compares node identities before and after, in both
settings of the detection axis (H4). The shortfalls are `test/hydration.ts`'s `HYDRATION_KNOWN`, each
with its kinds, its recovery, its exact reuse and a reason; a row that starts claiming everything
fails as stale, and an unregistered divergence fails outright.

### H2 — the wire decides what a range may claim, and it carries only what recovery needs

**Rule.** A range owner writes boundary comments — `<!--[-->` … `<!--]-->` — at **block boundaries
only**, and **only where the client cannot determine the range's extent for itself**. A position that
owns its parent element's entire child list writes none, and a row of an `each` writes none. **What a
client may CLAIM is decided by the wire, never by the client's condition.**

Under `dev` the open comment additionally carries the key the primitive CHOSE — `<!--[k-->` — and the
client compares its own key against it: on agreement the range's nodes are claimed and nothing is
rebuilt; on disagreement the client MUST report it and MUST NOT claim nodes the server built for a
different arm. A run that took the client's arm while silently keeping the server's nodes is the
failure that clause exists to make impossible **in a development build**.

What the wire keeps, and why each byte is needed: a hole or range whose parent holds anything else
needs its OPEN, so a dynamic text run does not fuse with the static one beside it, and its CLOSE as
the anchor later writes use; a `<!---->` skeleton marker is counted by the logical index on both
sides; `<!--[b:N-->` names a streamed continuation no walk can discover; and a `<pre>`, `<textarea>`
or rawtext parent keeps its hole's comments, because the tokenizer eats a leading newline there.

The rule does NOT say the server's arm wins. The client's condition is the one its reactive graph
maintains, so a branch kept on the server's arm against the client's own read would never be
repaired. What the key buys is detection and a bounded blast radius.

**Falsified by.** Three procedures.

1. Hydrate a **development** build of a branch whose condition resolves differently on the two sides.
   The run MUST report a `key` mismatch, release exactly that range, and end with a tree equal to a
   cold client render. In the other direction: a branch whose key AGREES must claim every one of its
   nodes with no rebuild.
2. Compile the same source for **production**. The key MUST NOT be on the wire, and the corruption
   above MUST therefore be inexpressible — a mutation aimed at `<!--[true-->` must leave the bytes
   unchanged. The same divergence expressed in bytes production DOES carry (the server's markup is the
   other arm's) MUST still be reported and MUST still rebuild that range and no more.
3. Render the 100-row page three ways — no `hydratable`, `hydratable`, `hydratable + dev`. The
   production wire MUST be byte-identical to the un-hydratable one, raw and gzipped, and the
   development wire MUST be larger. Then render a SECOND 100-row page of the same length whose holes
   have static siblings and whose rows carry a `<Show>`: production MUST be LARGER than the
   un-hydratable one there, raw and gzipped. Zero cost is a property of a shape (every hole the sole
   occupant of its element), not of the split.

**Status.** `HOLDS`. Pinned by the branch-key comparison and the "a branch index disagrees" row of
`test/hydration-mutations.test.ts`, run against both settings of the axis, and by "the three wires"
and the payload measurement in `test/hydration.test.ts`.

### H3 — elements are claimed by a hydration-only logical index

**Rule.** Elements are claimed by the same compiler walk that drives client rendering, carrying a
hydration-only logical index (`child(n, 3)`). That index MUST cost nothing on the client-render path.
A LOGICAL step counts a server range as nothing, so the index the compiler computed against the
template addresses the server's document unchanged. A hole that owns its parent's child list is
emitted with a `WHOLE` flag on the same terms, so the runtime is told the server wrote no comments
there rather than guessing from what it finds.

**Falsified by.** Compare emitted client-render code with and without `hydratable`; the non-hydratable
walk must carry no index argument. No fixture's ordinary emission mentions `child` or `sib`, some
fixture's `hydratable` emission does, and no fixture's ordinary SSR emission contains a range comment.

**Status.** `HOLDS`. Pinned by the emission diff, `hydratable` on against off, over the whole corpus
in `test/hydration.test.ts`.

### H4 — detection is a build axis; a detected mismatch has a local blast radius

**Rule.** On mismatch, **only that range** re-renders. In a **development** build detection is
mandatory and silent divergence is not acceptable. In a **production** build the checks that survive
are the ones the claim was making anyway, and the ones that are not — the O(subtree) comparison
between a claimed subtree and the template that would have been built — are NOT present.

**Falsified by.** Corrupt the wire one way at a time, against BOTH settings of the axis, and for each
corruption record whether it was detected and what the page degraded to. In development, every
corruption that changes a byte MUST be detected. In production, the corruptions that survive MUST be
exactly the ones listed, with the exact tree each produces — a new silent one, or a listed one that
starts being caught, fails.

**Status.** `HOLDS` for development; `HOLDS-with-registry` for production, where a wrong tag, a
missing element and an extra element in the middle of a claimed subtree survive, each registered with
the tree it produces. A region that catches `HydrationMismatch` from its claiming attempt reports it,
releases the server's nodes and rebuilds cold at that position. Pinned by
`test/hydration-mutations.test.ts`: twelve corruptions through two builds, plus the two build-level
ones (a non-hydratable compile hydrated anyway; a hydratable server with a non-hydratable client).

### H5 — the address is the shared artefact and it is process-independent

**Rule.** The shared artefact between the two backends is the compile-time address
`(module, unit, position)`. It MUST be identical for the same source on both backends and across
processes. A process-global counter MUST NOT participate in it.

**Falsified by.** Compile all fixtures both ways and diff the address sets: they must be equal.

**Status.** `HOLDS` for one build's flags: the address is `(module, unit index, patch position)`,
computed from the patch program. `-O0` addresses a superset of `-Ox`, because P3 fold turns a
constant `SetOnce` into template bytes, and that is sound because a server and its client are one
build. Pinned by the address-set diff over the whole corpus, at both levels, in
`test/addresses.test.ts`.

### H6 — interactive state survives hydration

**Rule.** Focus and the value of a user-mutated input MUST survive hydration.

**Falsified by.** Focus an input and type before hydration completes; after hydration, `document.activeElement`
and the input's value must be unchanged.

**Status.** `HOLDS`: a claimed node is never re-inserted, and the capture snippet records an event
target as a path of child indices, so a typed value and the caret replay onto the same node. Pinned
by the focus-and-typed-value pair and the keystroke replay in `test/hydration.test.ts`.

---

## 12. The acceptance case, answered

> **What must `<Provider><Child/></Provider>` do?**

Source:

```jsx
const Ctx = createContext<number>();         // no default → a miss THROWS
const Child = () => <span>{useContext(Ctx)}</span>;
export const App = () => <Ctx value={1}><Child /></Ctx>;
```

The specification answers, rule by rule, with no appeal to any implementation:

1. **`Child` is not evaluated at the provider's call site.** Its JSX lowers to a `Block` (C6). A Block
   is a deferred construction that only the receiving construct runs, and there is no expression in the emitted language meaning
   "children, already built" (C6, falsification clause).
2. **`provide` creates one scope** — `provide` is one of the six creators (O1) — as a child of the
   scope `App` is running under (O2.1).
3. **`provide` forks the context record and writes the value, before invoking anything** (X1). The
   fork is `Object.create`, so the cost is flat in the number of keys already in scope (X6).
4. **`provide` invokes the children Block with that scope current** (O2), **exactly once** (C7).
5. **`Child` runs under the provider's instance scope.** It creates no scope of its own (O1).
6. **`useContext(Ctx)` resolves at read time by walking the scope chain from
   `Child`'s owner** (X3, C4). It finds the provider's fork. It returns `1`.
7. **The rendered output is `<span>1</span>`.**
8. **If the provided value later changes, `<span>` is not rebuilt** — the value is a Cell, the read is
   live, and the text node is updated in place (X2, M5).
9. **If `Ctx` had a default and no provider were present, the default renders** — but with a provider
   present the default MUST NOT be what renders. That is the silent form of this bug and it is the one
   that produces a blank page.
10. **If `Child` throws during construction, the throw is caught by the nearest enclosing boundary**
    (E2 entry 1), the partially-built subtree is disposed (O4.4), and `CURRENT` is restored to the
    value it held before that boundary entered (O4.3).
11. **`Child`'s scope dies exactly when the provider's activation dies**, in reverse creation order,
    with its cleanups LIFO and its listeners and fetches gone (O3).

The emitted module:

```js
export const App = () => Ctx({ value: _k$1, children: _$block(() => Child({})) });
```

`Child` is inside a Block, so nothing evaluates it until the provider has entered its scope and
written its value. Had it been an argument, `Child({})` would run at the call site, under the
caller's owner, before the provider's scope exists, and violate **O2, O2.1, X1, C6**.

---

## 13. What this document cannot catch

A defect in itself. If a rule here says the wrong thing, `-O0` and `-Ox` will agree on it, the
ownership trace will match, and every conformance test will pass. That residual is irreducible and it
is why this document is reviewed as a design artefact rather than generated from the implementation.

It is also why every execution mode shares `analysis::bind`: a mis-classified `SourceKind` is wrong
everywhere simultaneously, which is **exactly the failure shape of the Provider bug**. The
hand-written absolute expectations in `fixtures/semantics/` are the only defence against that, and
they are the weakest layer, because they are human.

Alive2 is the precedent worth keeping in view: validating LLVM against a written semantics produced
patches to the LangRef, because the act of checking forces the specification to exist. Every rule
above that is marked `VIOLATED` is one of barq's.
