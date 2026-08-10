# SEMANTICS — what barq means

**Layer L1 of the oracle** (`CODESIGN.md` §6). This document is the specification the compiler, the
runtime and the conformance suite are all checked *against*. It is not a description of what the code
currently does. Where the two differ, the code is wrong and §13 says so by name.

**Why it exists.** barq renders a blank page for `<Provider><Child/></Provider>`. The differential
harness was green throughout, because the un-compiled `createElement` path fails identically, so the
oracle certified the defect. The deepest finding of the design work was that **nobody had ever written
down what `<Provider><Child/></Provider>` must do, so neither implementation was wrong against
anything.** §12 answers that question, and answering it on this document's own terms is this
document's acceptance test.

**Status: normative, unimplemented.** M0 lands this document, the ownership trace and the regression
fixtures against the *current* compiler. M0 changes no semantics. A rule marked `VIOLATED` or
`PLANNED` below is *expected* to fail its fixture at M0, and a fixture for such a rule that **passes**
is itself a suite failure — it means the oracle cannot see the defect and the oracle is wrong (§15).

---

## 0. How to read this

### 0.1 Conformance keywords

**MUST**, **MUST NOT**, **MAY** are normative. Prose outside a numbered rule is rationale and binds
nothing. Every numbered rule has three parts:

1. **the rule** — a statement that can be false;
2. **falsified by** — the observation that would make it false, stated as a procedure a test can run;
3. **pinned by** — the fixture that runs that procedure.

A rule with no falsification procedure is not a rule and does not belong here. "Context resolves
correctly" is not a rule. O2 is.

### 0.2 Rule status

Every rule carries exactly one status against the implementation as it stands at M0.

| Status | Meaning | What the suite asserts at M0
| Status | Meaning | What the suite asserts at M0 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
 |
|---|---|---|
| `HOLDS` | the current implementation satisfies the rule | the fixture **passes**, and must keep passing forever |
| `VIOLATED` | the current implementation is **wrong**; this is a defect | the fixture **fails**, and the failure message names this rule ID |
| `PLANNED` | the current implementation deliberately differs; the design changes it at a named milestone | the fixture **fails**, and the failure names this rule ID and its milestone |
| `UNOBSERVABLE` | the rule is right but no channel can currently see it | no fixture yet; the channel is the named milestone's work |
| `IMPLEMENTED, UNEXERCISED` | the primitive the rule is about exists and its own unit test passes, but no production caller reaches it, so the rule's falsification procedure cannot be run | nothing; recording it as `HOLDS` would claim an observation nobody made |
| `PARTIAL` | one clause of a multi-clause rule holds and another does not, with both named | whatever the clauses' own fixtures assert |

`VIOLATED` and `PLANNED` are different in kind and must not be conflated. A `VIOLATED` rule is a bug
that shipped. A `PLANNED` rule is a semantic change this design chose, on the record, in `CODESIGN.md`
§11. Both fail at M0; only the first is an indictment.

### 0.3 Pinning discipline

Each rule names the fixture that pins it. A fixture declares which rules it pins, by ID, as a module
export:

```ts
export const rules = ["O2", "X1", "X3"]
```

This makes the pinning **bidirectionally machine-checkable**, which a naming convention would not:
every rule ID in this document must appear in at least one fixture's `rules` (otherwise it is
unpinned, and §14 lists it), and every ID in a fixture's `rules` must exist in this document
(otherwise it is a typo pinning nothing). Fixtures listed as *(new)* do not exist yet; writing them is
the next phase's work and §14 is its worklist.

Existing corpus fixtures pin DOM output, not ownership. Where an existing fixture is named below it is
because the L2b ownership trace (`CODESIGN.md` §6) runs over the **whole** corpus, so every one of the
117 fixtures is a subject of O1–O3 whether or not it was written to be. The fixture named for a rule
is the one that **discriminates** it — the one whose trace differs if the rule is broken.

### 0.4 Backends

`Out` is backend-parameterised. On the DOM backend `Out = Node | Node[] | Cell<Out> | null`; on the SSR
backend `Out = string`. Every rule below holds on both backends unless it is explicitly scoped to one
(the ordering rules M3 and M5 and the whole of §9 are DOM-only; §11 is SSR+hydrate). A rule that
cannot be stated for both backends is a design smell and is marked as such.

---

## 1. Vocabulary

These are the only nouns this document uses. `CODESIGN.md` §3.0 is the type-level statement of the
same thing; where they differ, §3.0 is being corrected by this section.

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
bug and so are five of the eight known defects in §13.

### O1 — the scope creation set is closed

**Rule.** A scope is created by exactly six constructs and by nothing else: `render`, a `branch`
instance, an `each` row, `provide`, `boundary`, `portal`. **A component call MUST NOT create a
scope.** An element MUST NOT create a scope. A Block invocation MUST NOT create a scope — the
*construct that invokes it* created the scope and handed it over (O2).

**Falsified by.** Mount a tree of 1,000 components, three deep, containing no branch, no list, no
provider, no boundary and no portal. Count `Scope` allocations. The count MUST be 1 (the `render`
root). Any other number falsifies O1, and the trace names the construct that allocated.

**The trace counts ENTERED scopes, which is not the same number, and the difference is Q6's.** A
computation materialises its scope lazily (`hostScope`), through no `enter`, so it appends no event,
and `disposeNode` tears it down through no `dispose` event either. The L2b banner's scope count is
therefore a count of scopes some construct *declared*, and a backend that allocated a `Scope` per
component *inside a computation* would satisfy the trace and falsify the rule. The count this
procedure asks for is `scopeAllocations()`, incremented in `makeScope`, and `scope.test.ts` pins
both halves: a computation that owns nothing allocates none, and one that registers a cleanup
allocates one the trace never sees.

**Status.** `PLANNED` (M2/M3). Today a `Provider`, an `ErrorBoundary` and each of the ten flow
components allocate one scope per instance via `createScope`, and a plain component allocates none —
so the count is right for plain components and wrong for the rest, for the wrong reason.

**Pinned by.** `sem-own-component-allocates-nothing.tsx` *(new)*.

**Why.** A component in a fine-grained system never re-runs, so its death is exactly its position's
death. A separate scope per component buys one allocation and one indirection and nothing else. Solid
ships this; Svelte allocates per component and pays for it.

### O2 — a Block runs under the scope it is given, never under an ambient one

**Rule.** Let `K` be a scope-creating construct at position `p`. For each activation of `p`, `K` MUST:

1. create exactly one fresh scope `c` whose parent is the scope `K` itself was invoked under;
2. install everything that activation owns onto `c` — its context bindings (X1), its catcher (E1), its
   abort signal — **before** step 3;
3. invoke the Block for that activation with `c` as its first argument.

A Block MUST run under the scope it was passed and MUST NOT consult an ambient owner to decide
ownership. `CURRENT` is an *observation* channel (O4.5), never a decision channel.

**The consequence that names the Provider bug, stated on its own so it can be quoted:**

> **O2.1.** A component's body executes while the current scope is the scope of the construct that
> received it as `children`, and after that scope's context bindings are installed. It MUST NOT
> execute at the call site of the construct, before that scope exists.

**Escape hatch.** `pin(s, block)` returns a Block that ignores its scope argument and uses `s`. It is
the only sanctioned way to break dynamic ownership and it is visible in the emitted text.

**Falsified by.** `<Ctx.Provider value={1}><Child/></Ctx.Provider>` where `Child` calls `Ctx.use()`
and `Ctx` has no default. If `Child` throws `ContextNotFoundError`, or renders the default when a
provider is present, or the ownership trace records `Child` running under a scope that is not the
provider's instance scope, O2 is false. **`Child` MUST NOT be a syntactic argument of the provider
call in the emitted module** — that shape is O2's negation written down.

**Status.** `HOLDS` (M3). Verified emission: `(0, Ctx.Provider)(_s$, { value: _k$1, children:
_$block((_s$) => Child(_s$, {})) })`. `children` is a Block, so `Child` is constructed by `provide`,
inside the instance scope, after the binding is written. Verified runtime:
`<div><span class="child">provided</span></div>`.

*Before M3* the emission was `(0, Ctx.Provider)({ value: 1, children: Child({}) })` — `Child({})` an
ARGUMENT, evaluated at the call site under the caller's owner, before the provider's scope existed —
and the runtime was `<span>THREW:ContextNotFoundError</span>`, or a blank page where the context had
a default.

**Every construct, not only the Provider.** The claim is about the scope a construct is GIVEN, and
until M3 thirteen of the fourteen read `getOwner()` instead, which made the argument decoration: a
construct handed scope A while B was ambient put its subtree under B, and the falsification procedure
below could not tell the two apart because no fixture ever made them differ. `packages/core`'s
`calling-convention.test.ts` is the channel that can: it hands `Fragment`, `Show`, `For`, `Errored`,
`Ctx.Provider` and `provide` a scope that is NOT the ambient one and asserts on the scope argument's
subtree. Reverting `Ctx.Provider` to `enter(getOwner())` fails it; before M3 that mutation left every
suite in the repository green.

**Pinned by.** `sem-ctx-provider-direct-child.tsx` *(new)* — the direct form, with **no** `{() => …}`
wrapper. The existing `context-provider.tsx` does not pin O2: it is written in explicit-thunk style
(`<Theme.Provider>{() => <Badge />}</Theme.Provider>`), which is the hand-written workaround for this
exact bug. `packages/extra/src/router.tsx:1766` carries the author's own comment — *"Must use function
children so inner JSX is evaluated AFTER context is set"* — which is a hand-written statement of O2
and an admission that the framework does not provide it.

### O3 — disposal is total and ordered

**Rule.** `dispose(s)` MUST perform exactly these steps, in this order, and MUST be idempotent:

- **O3.1** mark `s` dead and bump `s.gen`, **before** anything else runs, so a cleanup that schedules
  work observes a dead scope;
- **O3.2** dispose `s.kids` in **reverse creation order**, depth-first — a child is fully disposed
  before its earlier sibling begins;
- **O3.3** run `s.cleanups` **LIFO**, after all kids are disposed;

**O3.2 and O3.3 are separable here and are NOT separable in the runtime today**, and an implementer
who does not know that will read one as the other. `signals.ts:1744-1747` registers a child scope's
disposer with `(holder.cleanups ??= []).push(dispose)` — the same array O3.3 governs — while
`owner.children` is a different list, disposed first. So a scope that has both kinds holds its kids
in two places, and a FIFO-cleanup bug is reported by the L2b channel as an O3.2 kid-ordering
violation, which is the right complaint under the wrong number. A conforming runtime MUST keep the
two lists distinct: a child scope's disposer is a KID, not a cleanup, and the ordering above is
observable only if the two can be told apart. Until that holds, a pure cleanup-ordering bug in a
scope with no child scopes is invisible to every channel M0 has.

- **O3.4** abort `s`'s `AbortSignal`, killing native listeners and in-flight fetches;
- **O3.5** remove `s`'s DOM range.

**O3.6.** A cleanup that throws MUST route to `s.catcher` (E6) and MUST NOT abort the remaining
cleanups, the remaining kids, or the range removal.

**O3.7 — the leak invariant.** After `dispose(s)` returns, the subtree rooted at `s` MUST have: zero
scheduled effects, zero registered listeners, zero in-flight fetches, zero live scopes, zero retained
DOM nodes. This invariant is *formulable* only because ownership is total; today it is not checkable
at all.

**Falsified by.** (a) Ordering: register a cleanup at every scope in a three-level tree, each pushing
its address onto a log; dispose the root; the log MUST be the reverse of the creation order,
depth-first. (b) Leaks: render, dispose, then write a signal the tree depended on — no effect may run,
no DOM may be written. (c) Cleanup throw: make the second of three cleanups throw; all three must
still have run and the boundary must have caught one error.

**Status.** O3.1–O3.3 `HOLDS`. M2 made the two lists distinct as this rule requires: a child scope
goes into `kids` and a cleanup into `cleanups`, so `dispose` walks kids in reverse creation order and
*then* runs cleanups LIFO, and the two claims are separately observable for the first time. Disposal
also unlinks the scope from its parent's `kids` when it is disposed on its own, so repeatedly
creating and disposing children of a long-lived scope no longer retains every dead one — the
M2 gate measured 1,000 create+dispose pairs leaving 1,000 entries behind.

O3.4, O3.5 `IMPLEMENTED, UNEXERCISED`. M2 landed `abortSignal(s)` and `ownRange(s, remove)` and
`dispose` runs both, in that order, after the cleanups, and `scope.test.ts` pins both. Neither has a
production caller that would let the falsification procedure run: nothing in the runtime calls
`abortSignal`, `dom.ts` registers every listener with a bare `addEventListener` and no `{ signal }`,
and `render` is the only construct that installs a range. `HOLDS` is the wrong word for a primitive
whose only caller is its own test; the listener and fetch halves are B4 and M5, and the ranges for
`branch`/`each`/`portal` are M4.

O3.6 `PARTIAL`. The half that says a throwing cleanup MUST NOT abort the rest holds: `runUntracked`
wraps every cleanup in `try/catch`, so a throw in the second of three still leaves all three run.
The half that says it MUST route to `s.catcher` does not — the throw is swallowed with
`console.error` and no catcher is consulted. (An earlier reading of this status said the throw
"propagates out of `disposeNode` and aborts the rest", which is not what happens and is exactly the
wrong-reason hazard §15 exists to catch.)

O3.7 `VIOLATED` — the render-root half is fixed for the Block form and for an argument-form mount
with no owner current (see O5) and the `<Await>` branch that registers its disposer with the effect
node rather than the scope above it is not; `ownership-known-failures.ts` carries it, green at M4.

**Pinned by.** `sem-own-dispose-order.tsx` *(new)*, `sem-own-dispose-leaves-nothing.tsx` *(new)*,
`sem-err-cleanup-throw.tsx` *(new)*.

### O4 — ambient hygiene *(revised; the original was self-contradictory — see `CODESIGN.md` §11)*

The original O4 said "the only `try/finally` in the system is where a `catch` was already required",
and §7.1's own `provide` is `try { return block(c) } finally { exit(c) }`. The prototype **needed**
the `finally`: without it a throw inside a Block leaves `CURRENT` dangling until a catcher unwinds,
and nothing specified which scope the catcher restores to. O4 is weakened to what is actually true,
and the restoration target is specified.

**O4.1 — restoration is required on both paths.** `CURRENT` MUST be restored to its prior value on
the normal path *and* on the exceptional path. A construct that enters a scope and returns a value
into the caller's expression — `provide`, `boundary`, `dyn`, and any Block invocation whose result is
consumed — has no other opportunity, so `try { … } finally { exit(c) }` is the conforming
implementation for those. **§7.1's `provide` is correct as written.**

**O4.2 — the cost claim is what survives, not the syntactic claim.** There is at most one `try/finally`
per *scope-entering primitive invocation*. There is **none** per component call and **none** per
element, because neither creates a scope (O1). The measurement stands and is the reason ownership is
threaded explicitly rather than ambiently: explicit scope argument 2.05 ns vs ambient set/restore with
`try/finally` 10.20 ns at depth 8. Ambient state is how ownership is *observed*, never how it is
*passed*.

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
and `Ctx.use()` can find their owner without being handed a scope. A framework primitive that consults
`CURRENT` at a point where a `Scope` argument is in scope is a defect, and it is the defect shape this
whole redesign exists to remove.

**Falsified by.** Throw from a Block under a boundary. After the fallback has rendered: (a)
`getOwner()` at the boundary's call site MUST be the same object it was before the boundary was
called; (b) every cleanup registered by the failed subtree MUST have run; (c) no node built by the
failed subtree may remain in the document; (d) a second, sibling boundary must still catch its own
throw afterwards, which it cannot if `CURRENT` was left dangling.

**Status.** `VIOLATED`. There is no `CURRENT` restoration on the exceptional path anywhere;
`ErrorBoundary` catches inside a `computed` and never touches the ambient owner.

**And `s.catcher` is written but read by nothing**, which is worth saying because it makes O4.3
untestable rather than merely unimplemented. `makeScope` inherits it, `enterRoot` installs the root
catcher, and no site reads it. `scope.test.ts`'s "O4.3: exit restores to the captured prev, not to
the parent" exercises `exit`, not a catcher, so it separates `_prev` from `s.parent` — the half that
`pin` makes observable — and cannot separate either from `getOwner()` at catch time, because no
catching construct exists to do the restoring. The field stays because M4's `boundary` is what reads
it; until then O4.3 has no executable channel and §14 lists it.

O4.4 is now honoured by the one M2 primitive that enters a scope: `provide` disposes its instance
scope on the exceptional path rather than exiting and abandoning it. That is one construct, not the
rule — the rule is about every scope entered after `prev`, and it needs the catcher.

**Pinned by.** `sem-err-current-restored-after-throw.tsx` *(new)*.

### O5 — `render` opens a root and returns a disposer that disposes

**Rule.** `render(block, container) → dispose` MUST: open a root scope; establish that root as a
catcher, so O4.3's "the nearest catching scope always exists" is true by construction; invoke `block`
with the root scope; insert the result; flush. The returned disposer MUST `dispose()` the root scope
(O3, with all of O3.7) **and** remove its range.

**Falsified by.** Render a tree containing an effect. Call the disposer. Write a signal the effect
depends on. If the effect runs, O5 is false.

**Status.** `HOLDS` (M2) **for the `block` form, unconditionally**; `PLANNED` (M4) for the
already-built argument form, which holds **only when no owner is current at the call site**. That precondition is load-bearing
and it is stated here because the M2 gate found it stated nowhere: `render` opens a root scope,
establishes it as a catcher, invokes `block` with it when it is given one, inserts, records the
container as the root's range and flushes; the disposer disposes the root and removes the range.
Verified in both forms: the effect no longer re-runs after dispose (1 → 1), the cleanup runs once,
and the render effect stops writing into the node it built.

**The bridge, its precondition, and when both die.** O5's `block` form is implemented and is what M3
will emit. Until then callers write `render(<Tree/>, host)` — the subtree is an ARGUMENT, so it is
constructed before `render` is entered.

- With **no owner current**, its effects are created while `CURRENT` is null, and the root *claims*
  what the construction left unowned (`adoptOrphans` in `signals.ts`). The claim window is one
  synchronous turn: `flushSync` drops whatever is still unclaimed, because a list held for the
  lifetime of the process made every ownerless effect immortal (measured: 217 bytes retained per
  effect, and a 14–30% slowdown on the DOM rows) and let an unrelated later `render` adopt and
  destroy work it had nothing to do with.
- With an **owner current**, those effects are that owner's kids from the instant they exist. No code
  running after the call can separate them from anything else that owner holds: the watermark would
  have to have been taken before the argument was evaluated, and nothing runs there. Ownership is
  RELOCATED, not lost — disposing that owner disposes the subtree, which the fixture asserts as a
  control — but `render`'s own disposer removes only the range, and it emits
  `RENDER_SUBTREE_NOT_OWNED` rather than returning a disposer that quietly disposes nothing.
  Registered as a known failure against O5, green at M3.

`hydrate` was the one shipped caller in this shape and now passes its Block through, so its root owns
what it mounts.

When M3 hands `render` a Block the orphan list is never non-empty, the precondition has nothing to
range over, and both go with the rest of the eager path.

**Pinned by.** `sem-own-render-disposer-disposes.tsx` *(new)*.

### O6 — owner and observer are separate ambients, and only the observer must be ambient

**Rule.** `untrack` MUST change the observer and MUST NOT change the owner. `enter`/`exit` MUST change
the owner and MUST NOT change the observer. A cleanup registered inside `untrack` MUST attach to the
same scope it would have attached to outside it.

**Falsified by.** Inside `untrack`, call `onCleanup(f)`; dispose the enclosing scope; `f` MUST run.
Inside `untrack`, read a signal; the enclosing effect MUST NOT re-run when it is written.

**Status.** `HOLDS`, untested. `untrack` changes only the observer today; nothing asserts it.

**Pinned by.** `sem-react-untrack-keeps-owner.tsx` *(new)*.

---

## 3. C — Components, props and children

### C1 — one calling convention

**Rule.** Every component is `Comp(s: Scope, props: Props) → Out`. Scope first. There is exactly one
implementation of component invocation in the system. There is **no** un-compiled authoring path
(`CODESIGN.md` §11, Q2 accepted): a second, semantically-different implementation of component
invocation is the root cause of the Provider bug and is not permitted to exist.

**Falsified by.** Any emitted call to a user component that does not pass a scope as its first
argument; any runtime path that constructs an element from `(tag, props)` other than the compiled one.

**Status.** `HOLDS` (M3), for the compiled path, which §11 Q2 makes the only authoring path.

`createElement`/`jsx`/`jsxs` survive until M9, where §4.1 retires them; they are kept because 118
existing test call sites are written against them, and "never delete a test" is the stronger rule.
Their component branch was ported to `tag(getOwner(), props)`, so they are no longer a SECOND
convention — they are the same one with the scope resolved at the boundary that has none.
**Both halves have landed.** `src/scope.rs` (P-new `scope`) gives every function containing JSX in value position the scope
as its first parameter, and P4 `shape` emits `Comp(_s$, props)` at every call, on the DOM backend, the
string backend and `Interp`, at `-O0` and at `-Ox`. One identifier carries the channel at every
position, so lexical shadowing does the threading and a Block's parameter shadows its enclosing
component's. `compile.rs`'s `the_whole_corpus_emits_one_calling_convention_at_both_levels` re-parses
the emitted module for every fixture in all four (backend × level) combinations. What is still owed is
`packages/core`: no component there accepts a scope, so the fixtures cannot run and no claim about
this rule can be OBSERVED yet. Nothing is deregistered on the strength of an emission.


**Pinned by.** `component-boundary-props.tsx` (existing, re-pinned at M3), `arrow-body-component.tsx`.

### C2 — components are declared, not inferred

**Rule.** A function containing JSX in value position **is** a component and MUST NOT be called
directly as a plain function. Doing so is a diagnostic that names the fix. This is a real language
rule and it is the price of C1.

**Falsified by.** `const x = MyComponent({a: 1})` in a compiled module producing no diagnostic.

**Status.** `HOLDS` (M3), for the agreement between the two halves.

The defect this rule exists to prevent has two directions and only one was closed. Inferring a
component from "contains JSX" miscompiles `rows.map((row) => <li/>)`, and `scope.rs` refuses it. The
OTHER direction is a component whose body does not syntactically return JSX: the call site emits
`Comp(_s$, props)` for anything written as a tag, so `function Label(props) { return props.text() }`
bound `props` to the Scope, in-module, with both halves in view and zero diagnostics. Four ordinary
shapes were affected — a direct return, a `.map` over a prop, a delegating wrapper (silently wrong
DOM, no throw) and a ternary.

The two halves now read the SAME set: `analysis::bind` records every named function-valued
declaration, and `publish_components` gives the scope parameter to every one this module writes as a
tag, whatever the body returns. A tag site is proof, not evidence — this module writes the call, the
call passes a scope, so the declaration has to accept one.

The compile-time DIAGNOSTIC — naming a tag site whose callee is not in the component set, before
the call is emitted — is not implemented, and is owed at M4. It is a better error, not a different
outcome: the shapes above all render correctly now.

**Pinned by.** `sem-calling-convention.tsx`, whose two C2 claims are the two directions —
`function Label(props) { return props.text() }` written as a tag, and `rows.map((row) => <li/>)`
whose callback must keep the arity `map` calls it with. `sem-props-direct-call-diagnostic.tsx`
*(new)* is owed for the diagnostic.

### C3 — props are Cells and Blocks; the five laws

**Rule.** Every own property of a props object is a `Cell` or a `Block`. No exceptions — `children`,
`onClick`, `each`, `value`, `key`. A props member is **never** a getter and **never** a bare value.

- **C3.1 Totality.** Stated above. It is what makes the ABI total and therefore what makes
  cross-module correctness need no cross-module knowledge (`CODESIGN.md` §3.13 item 1).
- **C3.2 Purity-cheapness.** A compiler-emitted Cell is exactly `() => <the JSX expression>` and is
  **not** memoised. Calling it twice evaluates twice. A consumer that must not evaluate twice calls
  once.
- **C3.3 Neutrality.** A Cell neither enters nor exits tracking; it inherits the caller's tracking
  state. This is what makes "read at the point of use" mean something: the **consumer's** effect
  subscribes, at the consumer's position, not the producer's.
- **C3.4 Copy-transparency.** Any operation that copies own enumerable properties preserves C3.1 —
  a guarantee of the language, not of the runtime. Therefore `{...props}`, rest destructuring,
  `Object.assign`, `for…in`, `mergeProps`, `splitProps` and `omit` are all correct with their bodies
  untouched.
- **C3.5 Boundary scope.** C3.1–C3.4 govern values crossing a **component** boundary. Element
  attributes, template holes and static text are compiler-internal and lower to direct writes; no Cell
  is materialised for them.

**The Cell/Block reconciliation** *(contradiction 2 of `CODESIGN.md` §11; §3.0 and C4 disagreed)*:

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
  degradation is harmless for C3.8's purpose.

  It is **not** harmless for C7's, and the two rules have to be read together. C7 counts invocations
  per activation and forbids a second one; C3.2 says a Cell is not memoised and calling it twice is
  ordinary. An unbranded arity-0 `template()` is both, so nothing at runtime can tell a permitted
  second Cell read from a forbidden second Block invocation. **C7's counter is therefore scoped to
  BRANDED Blocks**, and an arity-0 slot is outside it. The alternative — branding every emitted Block
  at its definition site, whether or not it uses its scope — buys C7 full coverage for one property
  write per module and is the direction to take if C7's assertion is ever wanted for slots as well.
- **C3.9 — kind travels with the value, not with the name.** Forwarding is identity (C5), so a
  forwarded Block is still a Block and a forwarded Cell is still a Cell. The only way a Block reaches
  a Cell slot is a *consumer* reading a Block-carrying name with `()`, which is caught statically by
  `Props<P>` when the prop is typed and dynamically by C3.8 when it is not.

**Falsified by.** (a) A counting Cell handed as a prop and then spread, rest-destructured,
`Object.assign`ed, `for…in`ed and forwarded through three wrappers MUST report **0 reads**. (b) A Cell
called twice MUST evaluate twice. (c) A Cell read inside a consumer's effect MUST make that effect
re-run when the underlying signal is written. (d) Invoking a scope-using Block with no scope MUST
throw `ScopeMissingError`, not render under an ambient owner.

**Status.** `HOLDS` (M3). Verified: a counting Cell forwarded through three COMPILED wrappers with
spread, rest-destructure, `Object.assign`, `for…in`, `mergeProps`, `splitProps` and `omit` is read
ZERO times during construction and once on the first call. *Before M3*, `{...p}` over a counting
getter reported `reads-at-copy: 1, still a getter: false`, and all six props helpers flattened
getters.

**What carries the laziness, stated because the acceptance test does not distinguish it.** The eight
named operations read zero because the CARRIER is a thunk, not because the source list is lazy: an
eager plain-object copy of a props record passes all eight. What the source list buys is liveness and
flatness, and `props.test.ts` pins those separately — a view reads the list rather than snapshotting
it, and a merge over a merge stays flat.

**The compiler emits no getter anywhere**, which is C3.4's precondition and not C3.4. P4
`shape` resolves every prop to one of six Cell forms, in this order: JSX lowers to a Block (C6); a
value already carrying either convention is forwarded BY NAME (C5); η-reduction collapses `x={s()}` to
`x: s`, now UNIVERSAL rather than a per-prop whitelist, because every slot is a Cell slot and a signal
getter is a Cell (R6, C5.2); a literal crosses through a module-hoisted deduped `_k$N` thunk, so a
constant prop costs zero per-instance allocation; a value whose identity is observable — a
parameterised function, an array, an object — is evaluated once into `_$cell(v)`, so
`props.onClick()` is the same object every time; everything else is `() => expr`, not memoised
(C3.2) and not tracking (C3.3). Asserted over the whole corpus by re-parsing the emitted module, at
both levels and on both backends. The laziness-conformance procedure this rule is falsified by is
still unrunnable: it needs `packages/core` to hand a component a props object at all.


**Pinned by.** `sem-props-laziness-conformance.tsx` *(new)* for (a); `sem-props-cell-not-memoised.tsx`
*(new)* for (b); `component-getter-props.tsx`, `props-rest-spread.tsx`, `component-spread.tsx`,
`props-destructured-param.tsx`, `props-destructured-body.tsx`, `props-renamed-and-defaulted.tsx`
(existing) for the shapes; `sem-props-block-in-cell-slot.tsx` *(new)* for (d).

### C4 — props are read by calling, and the type says so

**Rule.** `props.x()`. One rule — *a Cell is called* — holds uniformly across props, context, rows,
refs, resources and slot arguments. There is **no** compiler rewrite of `props.x` to `props.x()`: a
transform is legitimate only if the untransformed code has the same semantics, and this one does not.
Vue's two-year production experiment with implicit reads ended in removal.

**The corrected type** *(this replaces `Props<P> = { [K in keyof P]-?: Cell<P[K]> }`, which
contradicted §3.0's `Props = { [k: string]: Cell<unknown> | Block }`)*:

```ts
type Cell<T>   = (...ignored: never[]) => T                    // arity-tolerant (C3.6)
type Block     = (s: Scope, ...args: Cell<unknown>[]) => Out    // scope is NOT optional (C3.8)
type Slot<T>   = [T] extends [never] ? never
               : T extends Out ? Cell<T> | Block               // an Out-typed slot accepts either
               : Cell<T>                                       // anything else is a Cell slot only
type Props<P>  = { [K in keyof P]-?: Slot<P[K]> } & { $?: Source[] }
type Props     = { [k: string]: Cell<unknown> | Block } & { $?: Source[] }   // the erased view
```

The unparameterised `Props` of §3.0 is the **erasure** of `Props<P>`, not a second claim about it.
`Slot<T>` is the reconciliation: a slot whose declared type is renderable accepts a Block *or* a Cell
(C3.7 makes the Cell case safe); every other slot accepts a Cell only, and a Block landing there is a
type error in value position — which is the point of stating the type at all.

**Falsified by.** `props.x` in value position where `x: string` MUST be a type error, not a silent
`() => string`. `props.children()` where `children: JSX.Element` MUST be a type error (a `Block`
requires a `Scope`).

**Status.** `PLANNED` (M3). **Pinned by.** `sem-props-typed-slot.d.test.ts` *(new; a type-level test,
not a DOM fixture — this rule is checkable only in the type channel)*.

### C5 — forwarding is free, depth-independent, and kind-preserving

**Rule.** `<B x={props.x} />` MUST emit `B($s, { x: props.x })` — the **same** function object, not a
new closure. Forwarding depth MUST NOT become closure depth.

**C5.1 — a Block landing in a Cell slot.** Because forwarding is identity, forwarding cannot change a
value's kind (C3.9). Therefore this situation arises only two ways, and each has a defined outcome:

1. **Within a module**, the compiler knows the kind of the forwarded value and MUST emit a diagnostic
   at the forwarding site when a value it knows to be a scope-using Block is forwarded into a slot the
   callee declares as `Cell` — naming both positions.
2. **Across a module boundary**, the compiler cannot know (`CODESIGN.md` §3.13 item 1). The consumer's
   `props.x()` then hits C3.8 and throws `ScopeMissingError` with the Block's `origin` and the
   consuming scope's origin chain. It MUST NOT silently render under `CURRENT` and it MUST NOT
   silently produce `undefined`.

**C5.2 — η-reduction is sound and is restricted to Cells.** `x={s()}` → `x: s` is sound because a
signal getter *is* a Cell (R6) and Cells are arity-tolerant. It MUST NOT be applied when the reduced
expression is JSX, which lowers to a Block, nor when the callee's slot is a Block slot the compiler
cannot see.

**Falsified by.** Assert `childProps.x === parentProps.x` by reference after three hops. Measured
cost: thunk spread-forward 6.73 ns vs getter 455.14 ns — a getter cannot satisfy this rule at all,
because `get x() { return props.x }` allocates a new descriptor at every hop.

**Status.** `PLANNED` (M3).
**Status.** `HOLDS` (M3). `<B x={props.x} />` emits `B(_s$, { x: props.x })`
— the same function object, with no closure minted at the hop — for a member read off a props
parameter, for a binding the analysis proved is an accessor, and for an author-written zero-arity
arrow. C5.2's η-reduction is now universal rather than a whitelist, and one consequence is recorded
here because it removes a channel: a reduced prop used to be evidence that the tag resolved to a flow
component, and it no longer is. The SymbolId discipline it stood for is re-pinned where it is still
observable — a locally-bound `Show` gets no string implementation.
 **Pinned by.** `props-raw-forward.tsx` (existing, re-pinned),
`flow-prop-eta-boundary.tsx` (existing), `sem-props-forward-identity.tsx` *(new)*.

### C6 — children are Blocks; slots are Block-valued props

**Rule.** JSX children lower to a `Block`. A JSX-valued prop lowers to a `Block`. An arity-0
`template()` **is** a legal Block and is passed by name with zero allocation. Slot parameters are
extra `Cell` arguments to the Block.

**Falsified by.** An emitted `children:` whose value is a built node, an already-invoked expression, a
nullary thunk, or an array of nodes. All four are O2's negation in different clothes; today's compiler
emits the first (`children: Child({})`) and the third (`children: (() => {…})()` for element
children).

**Status.** `HOLDS` (M3). Both halves have landed: the emission is a Block at every children and
slot position, and the runtime reads every renderable slot by calling it with the scope the construct
was given. §3.0 rule 3's brand (`_$b`, `Helper::Block`) is what makes the kind travel with the value,
so a consumer tests a property instead of guessing from arity — the guess that handed a row callback
the Scope where its item belongs, and that invoked an arbitrary zero-argument prop once as a probe.

**The emission.** P4 `shape` lowers every JSX child and every
JSX-valued prop to `(_s$) => …`, and when the body is a compiled unit its `Site` is retargeted to
`ArrowBody` so codegen splices the walk and the patch program straight into the Block — the shape
`CODESIGN.md` §7.1 prints, costing neither an IIFE nor a call. A row callback needs no wrapping at
all: `scope.rs` already gave it the scope parameter, so it IS a Block with a slot parameter and is
forwarded by name. The corpus-wide audit in `compile.rs` re-parses every emitted module and fails on
any `children` slot holding a call, a template clone, an array or an IIFE — the four spellings this
rule's falsification clause enumerates. The rule stays `VIOLATED` because no consumer in
`packages/core` invokes a `children` Block with a scope yet.
 **Pinned by.** `component-children-slot.tsx` (existing, re-pinned),
`sem-own-slot-arguments.tsx` *(new)* for the slot-parameter half.

### C7 — a Block is called exactly once per activation

**Rule.** For each activation of a position, its Block is invoked **exactly once**. Not zero times,
not twice. Every consumer of a Block is a primitive owning exactly one compile-addressed slot; a
second invocation at that slot is a DEV assertion failure naming the position.

**Scope of the counter.** BRANDED Blocks only (C3.8). An unbranded arity-0 `template()` is
simultaneously a legal Cell, and C3.2 permits calling a Cell twice, so counting it would make C7 and
C3.2 contradict each other on one value. Until the counter exists, a Block invoked twice per
activation is invisible to every test in this repository — two DOM subtrees are built and one is
dropped, and the only trace of it is the per-fixture clone count, which is why
`test/ownership-census.ts` declares that number rather than deriving it.

Calling a Block twice is *not* an error of the Block — building twice is correct behaviour, because
DOM has identity and two invocations mean two subtrees. It is an error of the **consumer**.

**Falsified by.** Instrument a Block with a counter and drive every built-in consumer — `branch`,
`each`, `boundary`, `portal`, `provide`, `dyn` — through mount, one no-op update, one key flip and
one dispose. The counter MUST equal the number of activations, exactly. In particular: a key flip
from A to B to A MUST show A's Block invoked twice (two activations) and a *no-op* write MUST show no
additional invocation (K2).

**Status.** `UNOBSERVABLE` at M0 — there is no channel that counts Block invocations, because there
are no Blocks. `PLANNED` (M4) for the assertion.

This rule is why Solid needs `children()` — two lazy memos, because `Show` reads `props.children` at
four syntactic sites — and why this design needs nothing.

**Pinned by.** `sem-own-single-evaluation.tsx` *(new)*.

### C8 — fragments are a compile-time multi-root unit, never a runtime component

**Rule.** `Out` admits `Node[]`. A fragment is a compile-time multi-root unit. It MUST NOT drop
children of any kind: not function children, not nested arrays, not live holes, not `null`s that
occupy a position.

**Falsified by.** A fragment with five children — a static element, a nested array, a function child,
a live hole and a text node — MUST produce all five in the output, in order.

**Status.** `VIOLATED`. Verified: `<><b/>{s()}</>` compiles to
`_$createElement(_$Fragment, null, _tmpl$1(), s())` and the live hole is dropped;
`FRAGMENT: "<b></b>txt5" childNodes: 3` — **five children in, three nodes out**, and the accessor and
the array vanish.

**Pinned by.** `sem-own-fragment-drops-nothing.tsx` *(new)*. `fragment-root.tsx` and
`nested-fragments.tsx` (existing) do not pin C8: both are written in explicit-thunk style and neither
puts an array beside a function child.

### C9 — the props source list

**Rule.** `<Foo {...a} b={x()} {...c} />` MUST emit `Foo($s, _$props([a, { b: () => x() }, c]))`, with
the sources in **written order** and read **last-wins**. `_$props` returns its single argument
unchanged when the list is one plain record. A Proxy over an existing `$` concatenates rather than
nesting, so merged merges stay linear.

**Falsified by.** Later sources MUST shadow earlier ones on read; `ownKeys` and `has` MUST union all
sources; a spread of a spread MUST NOT deepen the read path.

**Status.** `PLANNED` (M3).
**Status.** `HOLDS` (M3). P4 `shape` splits a component's attributes at
every spread boundary and emits `_$props([…])` with the records and the spread sources in written
order, dropping empty records so `<Foo {...a} />` is one source rather than three. A component with no
spread emits the object itself and never calls `_$props`, which is the "overwhelming case pays
nothing" clause. **`_$props` itself does not exist in `packages/core`**, so the last-wins,
`ownKeys`-union and no-deepening claims are unimplemented and this rule is not observable.
 **Pinned by.** `component-spread.tsx`, `spread-static-mix.tsx` (existing,
re-pinned), `sem-props-source-list-order.tsx` *(new)*.

---

## 4. X — Context and DI

### X1 — provision creates a scope, forks the record, and installs before invoking

**Rule.** `provide(s, Ctx, value, block)` MUST, in this order: `enter(s)` to create instance scope
`c`; fork `c.ctx` as `Object.create(c.ctx)`; write `c.ctx[Ctx.id] = value`; **then** invoke
`block(c)`. Every step before the invocation is mandatory and ordered. `provide` MUST restore
`CURRENT` on both paths (O4.1).

The fork is `Object.create`, not a spread copy. Measured against the current
`owner._context = {...owner._context, [k]: v}` at seven call sites: 6.9 ns vs 4219.9 ns at 50 keys,
6.8 vs 19117.0 ns at 200 keys — **2811x** at 200.

**Falsified by.** The ownership trace for `<Provider><Child/></Provider>` must show, in order:
`enter(provider)`, `ctx-write(provider)`, `block-invoke(child, provider)`. Any other order falsifies
X1. Reading the context in `Child` must return the provided value.

**Status.** `HOLDS` (M3). The ordering inside `Provider` was always right; what changed is that
it is now load-bearing, because `children` is a Block and the only party that can invoke it is the
function holding the instance scope. Verified: `sem-ctx-provider-direct-child` and
`sem-ctx-provider-wrapper-component` both read the provided value, and mutating the
enter → fork → write → invoke order costs 23 L1/L2b claims.

**Pinned by.** `sem-ctx-provider-direct-child.tsx` *(new)*.

### X2 — a provided value is a Cell, so provider updates are live

**Rule.** The value stored is a `Cell<T>`. A provider whose value changes MUST NOT re-render its
children; consumers see the new value through their own reads, at their own positions. Node identity
across a provider-value change MUST be total: every node in the subtree survives.

**Falsified by.** Change the provided value; assert every node in the consuming subtree is the same
object it was, and the consumed text changed.

**Status.** `HOLDS` in the thunked form (`context-provider.tsx` passes `value={() => theme()}` and
step 0 changes it), `VIOLATED` in the direct form for the O2 reason.

**One encoding, at every write site.** What a scope stores for a context key is a `Cell`, and every
public write that can take a plain value wraps it (`cellOf`). Before that, `provide`/`install` stored
a Cell while `setContext` stored the raw value, and `getContext` handed back whatever was there while
`read`/`useContext` treated any stored function as the Cell: the same key read through two accessors
gave a function and its result, and a function stored as a *value* was invoked instead of returned.

**Pinned by.** `context-provider.tsx` (existing), `sem-ctx-value-is-live.tsx` *(new)* for the node
identity half.

### X3 — context resolves at READ time, through the scope chain

**Rule.** A context read resolves **when the read happens**, by walking the scope chain from the
reading scope. It MUST NOT resolve at scope-creation time and it MUST NOT be captured at construction.

**The consequence.** A scope created *before* a provider installed its value still sees that value,
provided the provider is an ancestor at read time. This is what makes the install-then-read ordering
stop being something five components each have to remember — and one of them, `ErrorBoundary`,
currently gets it wrong.

**X3 does not make X1 optional, and this is the sentence that stops it being read that way.** X3
governs RESOLUTION: a read is a walk, performed whenever the read happens. X1 governs the ordering
that puts something on the chain for the walk to find. Moving `provide`'s write to *after* it invokes
its block satisfies X3's letter and breaks all five thunked control claims in `fixtures/semantics/`
— verified by mutation. Read together: *resolution is a read-time walk; X1 fixes the ordering that
makes the walk find anything.* Note also that X1 has no ownership-trace channel of its own — the
trace records no context write — so it is observable at M0 only through a DOM-visible consequence.

**Falsified by.** Build a consumer's scope, then install a provider above it, then read. The read must
see the provided value. Concretely: `ErrorBoundary` builds its children in a `computed` at
`components.ts:942` and installs `ERROR_BOUNDARY` at `components.ts:985` — 43 lines *later*. Under X3
that ordering is harmless. Under the current construction-time capture it is a bug.

**Status.** `HOLDS` (M3) for both halves. The read mechanism was already a walk of the scope
chain; what was false was where the reader stood, and O2 holding is what fixes it. Verified at depth,
under shadowing, and through a `pin` whose ambient differs from its lexical parent.

**One thing this rule does NOT say.** A read from a fully disposed scope still resolves: `ctx` is a
plain record and disposal does not clear it, so a use-after-dispose read returns the dead provider's
value rather than surfacing anything. That is a consequence of resolving at read time over a record
that outlives its scope, it is what `enter`/`runWithOwner` already emit `RUN_WITH_DISPOSED_OWNER` for
at the WRITE side, and there is no diagnostic on the read side. Pinned as an observation by
`scope.test.ts` rather than left to be rediscovered.

The read mechanism is a walk of the SCOPE chain over each scope's own record — `lookupContext` in
`signals.ts`, behind `read`, `useContext`, `getContext`, `hasContext` and the two internal boundary
keys. M2's first attempt resolved through `ctx`'s prototype chain instead, and that fails this rule's
own falsification: a scope captures its parent's record *by reference at creation*, so a provider
that forks above an existing consumer is invisible to it and the `ErrorBoundary` ordering named above
stays a bug. The prototype fork survives for X6's cost claim; it is no longer what resolution reads.

**Pinned by.** `sem-ctx-read-after-install.tsx` *(new)*, `control-flow-error-boundary.tsx` (existing).

### X4 — cross-boundary reads follow the scope chain, not the DOM chain

**Rule.** A portalled subtree reads the provider it is **written** under, not the provider that
happens to be an ancestor of its DOM insertion target. `portal` creates a scope whose parent is the
**lexical** parent and whose insertion target is elsewhere.

**Falsified by.** Two providers with different values; a portal written under provider A and inserted
inside provider B's DOM. The portalled content MUST read A.

**Status.** `UNOBSERVABLE` at M0 — `Portal` uses a detached scope, so there is no defined answer to
observe.

**Pinned by.** `sem-ctx-portal-lexical.tsx` *(new)*. `portal.tsx` (existing) has no context in it.

### X5 — a miss with no default throws, carrying the component stack

**Rule.** `Ctx.use()` with no provider and no default MUST throw, and the error MUST carry the
consuming scope's `origin` chain as a component stack. This is free, because the scope chain **is**
the logical tree.

**Falsified by.** The thrown error's stack must name the consuming component and each enclosing
construct, in order, in DEV.

**Status.** `HOLDS` for the throw, `PLANNED` (M2) for the stack — there is no `origin`.

**Pinned by.** `sem-ctx-miss-throws-with-stack.tsx` *(new)*.

### X6 — the context record is shared by reference until a provide forks it

**Rule.** A scope shares its parent's `ctx` object **by reference**. Only `provide` forks. Therefore
the cost of a scope that provides nothing is zero, and the cost of a provider is one `Object.create`
regardless of how many keys are in scope.

**Falsified by.** Allocate 200 scopes under 200 keys of context; the per-scope cost must not scale
with the key count. Measured target: 6.8 ns at 200 keys, flat.

**Status.** `HOLDS` (M2). `makeScope` copies the parent's `ctx` by reference and `provideOn` does
`s.ctx = Object.create(s.ctx)` once, on the first provide; the seven spread call sites are gone.
Unpinned: the benchmark that would falsify the flat-cost half is still owed.
**Pinned by.** benchmark, not fixture — `sem-ctx-fork-is-flat.bench.ts` *(new)*.

---

## 5. K — Control flow and the keying contract

### K1 — the default row identity is the index

**Rule.** An `each` with no `key` is **index-keyed**. Opt in to item identity with `key={r => r.id}`.

**Why this and not the reverse.** Item-identity-by-default means any immutable update recreates every
row, silently destroying focus, `<video>` position, scroll offset and animation state. That failure is
invisible and catastrophic. The index default's failure — a reorder re-renders more than needed — is
visible and cheap. `CODESIGN.md` §11 Q3, accepted.

**Falsified by.** `<For each={rows}>` with no `key`; replace `rows` with a structurally-equal array of
fresh objects; every row's nodes MUST be the same objects and focus MUST survive.

**Status.** `PLANNED` (M4), and it is a **deliberate reversal**: today `For` with `keyed` absent keys
by the item itself, which `control-flow-for-keyed-by-item.tsx` documents as the same arm. Those
fixtures encode today's default and MUST keep passing at M0.

**Pinned by.** `for-unkeyed-rows.tsx`, `control-flow-for.tsx` (existing, today's default);
`sem-key-index-default.tsx` *(new)*, which fails until M4.

### K2 — an unchanged key is a no-op

**Rule.** A row whose key is unchanged MUST NOT be torn down: its scope, its nodes, their identity,
their focus and their listeners all survive a move. A `branch` whose key expression evaluates to an
unchanged value MUST do **nothing** — no teardown, no rebuild, no Block invocation (C7).

**Falsified by.** Metamorphic: write a signal that changes nothing the key depends on; assert every
node in the branch is the same object and the Block's invocation counter did not move. Then reorder a
keyed list; assert the moved row's nodes are the same objects.

**Status.** `PLANNED` (M4). The identity-gated re-render is hand-rolled in ten lines at
`router.tsx:1576` today, which is the evidence that the primitive does not provide it.

**Pinned by.** `sem-key-noop-preserves-nodes.tsx` *(new)*,
`control-flow-for-keyed-by-item.tsx` (existing).

### K3 — a keyless row containing stateful DOM is a compile-time diagnostic

**Rule.** The compiler MUST emit a diagnostic when a keyless `each`'s row Block contains stateful DOM:
`input`, `textarea`, `select`, `video`, `audio`, `details`, `canvas`, or a custom element. Only a
compiler can see the row's markup. This covers the **correctness** half of the index-keying trade; the
performance half (O(n) writes on a reorder) is documented, not covered.

**Falsified by.** A keyless `<For>` whose row contains an `<input>` and produces no diagnostic.

**Status.** `PLANNED` (M4). **Pinned by.** `sem-key-stateful-row-diagnostic.tsx` *(new)*, asserted
through `diagnostics.test.ts`.

### K4 — duplicate keys are a DEV error and degrade to index

**Rule.** Duplicate keys are a DEV error naming both positions. The second and later occurrences are
treated as index-keyed. Rendering MUST NOT be abandoned and rows MUST NOT be silently dropped.

**Falsified by.** A list with two rows sharing a key must render two rows and log one error.

**Status.** `PLANNED` (M4). **Pinned by.** `sem-key-duplicate.tsx` *(new)*.

### K5 — a key expression is plain emitted JavaScript

**Rule.** The runtime never evaluates a condition. `branch` receives a `Cell<K>` computing an integer
key; `Show`, `Switch`/`Match`, ternaries, `&&`, `Dynamic` and a router `Outlet` all lower onto it.
`Show`, `Switch`, `Match`, `Index`, `Repeat`, `Dynamic` and `Portal` **cease to exist as components**
and are recognised by `SymbolId` resolved to the framework module — never by name, which is unsound
under shadowing.

**Falsified by.** A locally-shadowed `Show` MUST be treated as a user component, not lowered. An
imported-and-renamed `Show` MUST be lowered.

**Status.** `HOLDS` for the resolution discipline (`SymbolId`, not name), `PLANNED` (M4) for the
lowering.

**Pinned by.** `renamed-core-import.tsx`, `signal-alias.tsx` (existing) for the resolution half;
`sem-key-shadowed-flow.tsx` *(new)* for the shadowing half.

### K6 — each activation of a branch gets a fresh scope and a fresh build

**Rule.** On a key change: dispose the old instance scope (O3, in full), clear its range, `enter` a
fresh child scope, invoke `bodies[k]` under it, insert at the anchor. A hide/show cycle MUST produce
**fresh nodes**, never the same node handed back.

**Falsified by.** Toggle a `Show` off and on; the re-shown nodes MUST NOT be the same objects as
before. Today's emission `Show({ when: on, children: _tmpl$1() })` hands the *same built node* back on
re-mount, which is K6's negation and a leak of DOM identity across activations.

**Status.** `VIOLATED`. **Pinned by.** `control-flow-show.tsx` (existing, re-pinned for identity),
`sem-key-remount-is-fresh.tsx` *(new)*.

### K7 — no marker comments in client rendering

**Rule.** A range owner receives `(parent, anchor)` from the compiler's template walk. `anchor = null`
means append. Two adjacent dynamic siblings share one empty text node baked into the template. A
client-rendered page MUST contain **zero** framework comment nodes.

**Falsified by.** `createTreeWalker(root, SHOW_COMMENT)` over a rendered page must count 0.

**Status.** `PLANNED` (M4). The anchor channel already exists in `oracle.test.ts` and is snapshotted
per fixture; K7 is the eventual expected value of that channel.

**Pinned by.** the existing anchor snapshot channel over the whole corpus; `marker-literal-text.tsx`
(existing) guards content being mistaken for structure.

### K8 — ambient insertion state is rejected

**Rule.** There MUST NOT be a module-global "current insertion point" that block constructors read and
must consume exactly once. Insertion targets are arguments.

**Why it is a rule and not a preference.** Vapor shipped ambient insertion state, hit a
`v-if`+component double-insertion (vuejs/core#13203), partly reverted, and still carries defensive
snapshot-and-reset in every block constructor. A module global that must be consumed exactly once by a
consumer nobody enumerated is the same bug class as the Provider bug.

**Falsified by.** Any module-level mutable insertion state in the runtime. Checked by inspection and
by a lint rule, not by a fixture.

**Status.** `HOLDS`. **Pinned by.** n/a — this is a structural rule (§14).

---

## 6. E — Errors

### E1 — every scope knows its catcher in O(1)

**Rule.** `s.catcher` is copied from the parent at `enter`. Lookup MUST NOT walk the chain. `render`
establishes a root catcher, so **a catcher always exists** — which is what makes O4.3 total.

**Falsified by.** A throw at depth 20 must reach the boundary at depth 2 with no chain walk
observable in the trace; a throw with no user boundary must reach the root, not `window.onerror`.

**Status.** `PLANNED` (M2). **Pinned by.** `sem-err-root-catcher.tsx` *(new)*.

### E2 — the routed entry points, enumerated

**Rule.** Exactly these entries into user code are routed to `s.catcher`, and there are no others:

| # | Entry point | Which boundary catches it | Status at M0
| # | Entry point | Which boundary catches it | Status at M0 |
| --- | ----------------------------------- | --------------------------------------------------------------------------- |
 |
|---|---|---|---|
| 1 | **Block invocation** (construction) | the boundary the Block is invoked *inside* | `VIOLATED` *(new)* |
| 2 | **component body** | the boundary enclosing its position | `VIOLATED` *(new)* |
| 3 | **computed evaluation** | the boundary of the scope that created the computed | `HOLDS` *(new)* |
| 4 | **effect body** | the boundary of the scope that created the effect | `HOLDS` *(new)* |
| 5 | **cleanup** | the disposing scope's catcher; does not abort the rest (O3.6) | `VIOLATED` *(new)* |
| 6 | **event handler** | the boundary owning the *element*, via the scope stored beside the handler | `VIOLATED` *(new)* |
| 7 | **ref callback** | the boundary owning the element | `VIOLATED` *(new)* |
| 8 | **async continuation** | the boundary of the scope that created the resource, if `gen` still matches | `VIOLATED` *(new)* |

**E2.1 — construction throws land inside the boundary.** A boundary enters its scope, installs the
catcher, and **then** invokes the content Block inside a `try`. The child therefore throws *inside*
the boundary, not at its call site.

**Falsified by.** `<Errored fallback={…}><Boom/></Errored>` where `Boom` throws during construction:
the fallback MUST render. Verified today: `Errored({ fallback: (e) => _tmpl$2(), children: Boom({}) })`
— `Boom({})` is an argument and throws *before the boundary exists*, so the throw escapes to the
caller and the page dies.

**E2.2 — a handler throw is the framework's problem.** A handler is code the framework invoked, so the
framework owns its failure. The delegated dispatcher stores the owning scope alongside the handler and
routes a throw to `scope.catcher`. Verified today: `dom.ts:169-200` has no `try` and a handler
exception escapes to `window.onerror` with no framework involvement.

**E2.3 — `NotReadyError` is re-thrown, never captured as an error.** An error boundary MUST pass it
through to the nearest `Loading` boundary. `ErrorBoundary` lacks this check today, so a suspended
subtree under an error boundary renders the error fallback instead of the loading fallback.

**Pinned by.** `sem-err-construction-throw.tsx`, `sem-err-effect-throw.tsx`,
`sem-err-handler-throw.tsx`, `sem-err-ref-throw.tsx`, `sem-err-async-throw.tsx`,
`sem-err-cleanup-throw.tsx`, `sem-err-notready-passthrough.tsx` *(all new)*;
`control-flow-error-boundary.tsx`, `control-flow-errored-loading.tsx` (existing) for entries 3–4.

### E3 — a boundary is a branch plus a try

**Rule.** A boundary is a `branch` keyed on `{content | fallback}` plus a `try`. `reset()` bumps the
key, so recovery is a branch flip and is uniform with all other control flow (K6: fresh scope, fresh
build). A boundary MUST NOT have a bespoke teardown path.

**Falsified by.** After `reset()`, the retried content MUST be freshly built (K6) and its scope MUST
be a new object.

**Status.** `PLANNED` (M4). **Pinned by.** `control-flow-error-boundary.tsx` (existing, re-pinned).

### E4 — an error carries the scope chain as a component stack

**Rule.** In DEV, `enter` stamps `s.origin` with `(module, unit, position, name)` and a routed error
carries the scope chain. This is free, because the scope chain **is** the logical tree — there is no
second structure to maintain and nothing to keep in sync.

**Falsified by.** A throw at depth 5 must produce a stack naming all five enclosing constructs, in
order, with their source positions.

**Status.** `PLANNED` (M2). **Pinned by.** `sem-err-component-stack.tsx` *(new)*.

---

## 7. M — Mount and update ordering

These rules are DOM-backend-scoped. The SSR backend has no ordering to observe beyond byte order.

### M1 — construction is depth-first in document order

**Rule.** A subtree is fully constructed before its next sibling begins. A Block returns only after its
own subtree exists.

**Falsified by.** Log at every component entry and exit; the log MUST be a well-formed balanced
sequence in document order.

**Status.** `HOLDS`. **Pinned by.** `dashboard-composite.tsx` (existing), `sem-mount-order.tsx`
*(new)* for the log.

### M2 — a binding's first write happens during construction, not after

**Rule.** Every reactive binding runs its compute-and-apply **once, synchronously, at creation**. The
first frame is complete before `render` returns. There MUST NOT be an intermediate frame in which a
hole is empty and a subsequent flush fills it.

**Falsified by.** A `MutationObserver` installed on the container before `render` must see the
element's attributes and text in their **final** state at the moment of insertion, never a
placeholder followed by a correction.

**Status.** `HOLDS`. `createEffectNode` runs `recompute(node)` synchronously at creation; subsequent
runs are scheduled.

**Pinned by.** `reactive-attribute.tsx`, `text-hole-fused.tsx` (existing); `sem-mount-no-flash.tsx`
*(new)* for the `MutationObserver` half.

### M3 — refs drain after insertion, children before parents

**Rule.** A `ref` callback runs **after** its element is inserted into the tree its render is building,
and refs drain **children before parents**, so a parent's ref sees a fully-populated subtree. A ref
callback that returns a function has that function registered as a cleanup on the owning scope.

**Falsified by.** A parent ref that reads `el.childElementCount` must see the final count. A child ref
must run before its parent's. A returned disposer must run at dispose.

**Status.** `VIOLATED`. `ref` is applied through `setProp` at the point the prop is applied, which is
before the element joins its parent, and no returned function is registered.

**Pinned by.** `ref-binding.tsx`, `ref-on-component.tsx` (existing, re-pinned);
`sem-mount-ref-order.tsx` *(new)*.

### M4 — updates flush on a microtask; render effects before user effects

**Rule.** A write schedules a flush on the microtask queue. Within a flush, **render** effects drain
completely before **user** effects, and the loop repeats until both heaps are empty. `batch` flushes
synchronously at its end. `flush(fn)` runs `fn` and then drains.

**Falsified by.** Write two signals in one turn; assert exactly one flush, all DOM writes before any
user effect, and every user effect observing final DOM.

**Status.** `HOLDS` (`signals.ts:1089` `flushSync`). **Pinned by.** every fixture with `steps`;
discriminated by `multi-signal-expression.tsx` (existing).

### M5 — a stable re-render preserves every node

**Rule.** Re-rendering with unchanged inputs preserves every node object. A write that does not change
a branch key preserves every node inside that branch. A keyed move preserves the moved row's nodes.

This is Glimmer's `assertStableRerender`, and it is a **metamorphic** property: it needs no reference
implementation, and unlike the current node-identity channel it is never skipped when two shapes
disagree.

**Falsified by.** Snapshot node identities; drive a no-op step; compare. Any replaced node falsifies
M5 and the diff names the position.

**Status.** `HOLDS` for element bindings; `VIOLATED` inside control flow (K6's converse — today's
`Show` hands the *same* node back across a remount, which is a different bug, and today's default-keyed
`For` replaces rows on an immutable update, which is this one).

**Pinned by.** `sem-mount-stable-rerender.tsx` *(new)*, applied as a channel over the whole corpus.

### M6 — insertion is idempotent under interruption

**Rule.** A construct that is disposed while constructing MUST leave no nodes in the document (O4.4)
and MUST NOT insert after disposal. A Block whose scope died mid-construction MUST NOT complete its
insertion.

**Falsified by.** Dispose from inside a ref callback halfway down a subtree; the container MUST end
empty.

**Status.** `UNOBSERVABLE` at M0. **Pinned by.** `sem-mount-dispose-during-construction.tsx` *(new)*.

---

## 8. R — Where reactivity is entered and exited

### R1 — reactivity is entered in exactly four places

**Rule.** A dependency is recorded only inside: `fx` (an element's fused compute), `effect`,
`computed`, and the internal compute of `branch` / `each`. Nowhere else. In particular a **component
body is not a tracking scope**: reads in a component body MUST NOT subscribe anything.

**Falsified by.** Read a signal in a component body; write it; the component MUST NOT re-run and
nothing may re-render on account of that read.

**Status.** `HOLDS` (component bodies run untracked). **Pinned by.**
`sem-react-component-body-untracked.tsx` *(new)*.

### R2 — reactivity is exited in exactly three places

**Rule.** Tracking is left by `untrack`, by `peek`, and **structurally** by the apply phase of every
element effect. The apply phase runs untracked, so a DOM read there can never become a dependency.

**Falsified by.** Read `el.offsetWidth` in an apply phase; the effect MUST NOT acquire a dependency,
and no layout-read feedback loop may form.

**Status.** `HOLDS` for `untrack`/`peek`; `PLANNED` (M5) for the structural guarantee, because the
fused compute/apply split does not exist yet.

**Pinned by.** `sem-react-apply-is-untracked.tsx` *(new)*.

### R3 — a Cell is neutral

**Rule.** Calling a Cell neither enters nor exits tracking (C3.3). The **consumer's** tracking state
decides whether the read subscribes. This is the rule that makes props fine-grained: a prop read
inside a child's effect subscribes that child's effect, at the child's position, with no involvement
from the parent.

**Falsified by.** Pass `x={sig()}` (η-reduced to `x: sig`); read `props.x()` inside the child's effect;
write `sig`. Only that child's effect may re-run. Read the same prop in the child's body; write `sig`;
nothing may re-run.

**Status.** `PLANNED` (M3). **Pinned by.** `sem-react-cell-neutrality.tsx` *(new)*,
`component-boundary-props.tsx` (existing, re-pinned).

### R4 — `untrack` changes only the observer

**Rule.** See O6. Stated twice deliberately: it is an ownership rule and a reactivity rule, and
conflating owner with observer is the bug source both sections exist to prevent.

**Pinned by.** `sem-react-untrack-keeps-owner.tsx` *(new)*.

### R5 — the epoch write-dedupe and `markWave` are load-bearing

**Rule.** N writes between two flushes cost O(1) marking. This is not an optimisation to be
re-litigated: ablated at **2.37x** on "100 writes + 1 flush", the case barq currently wins 3.21x —
without it that win becomes ~1.35x. `markWave` is ablated at +7% on two of four cases, −2% on one:
**keep**, contrary to all three submitted designs, and re-measure after the Scope split.

**Falsified by.** The ablation harness in `packages/core`, with correctness assertions on every
variant.

**Status.** `HOLDS`. **Pinned by.** benchmark, not fixture (§14).

### R6 — a signal getter is a Cell

**Rule.** A signal getter **is** a `Cell`, carrying `.set` / `.peek` / `.update` on the function
object. Therefore a signal is passable as a prop with zero adaptation and η-reduction (`x={s()}` →
`x: s`) is sound by construction (C5.2).

**Falsified by.** `useState`'s getter returning a bare `() => s()` and dropping `.set`/`.peek`/
`.update` — `hooks.ts:11-22` does exactly this today, which makes the tuple's getter a degraded Cell
that C5.2 may not η-reduce.

**Status.** `VIOLATED` for `useState`, `HOLDS` for `signal`.

**Pinned by.** `use-state-tuple.tsx`, `signal-methods-in-handler.tsx` (existing, re-pinned).

---

## 9. B — Bindings, events and refs (DOM backend)

Derived rules. `CODESIGN.md` §6 does not name this section, but `class={s()}` being a one-shot write
on the same element where `id={s()}` is live is a shipped defect with five hand-written workarounds in
`extra` and `kitchen-sink`, and a specification that cannot name it is not doing its job.

### B1 — every binding on an element is equally live

**Rule.** Two bindings written the same way on the same element MUST have the same liveness. There is
no attribute name for which a reactive expression silently becomes a one-shot write.

**Falsified by.** `<b class={s()} id={s()} title={s()} />`; write `s`; **all three** must change.
Verified today: `class` is emitted as a dead one-shot `_$setProp(_el$1, "class", s())` while `id` and
`title` land in a live `_$renderEffect`. The cause is the `STATEFUL_DIFF` early return at
`classify.rs:118`.

**Status.** `VIOLATED`. **Pinned by.** `class-with-live-siblings.tsx` (existing — this fixture already
carries the shape; it passes today only because the oracle shares the defect, which is finding #1 of
`CODESIGN.md` §6).

### B2 — one fused effect per element, with a compiler-allocated prev record

**Rule.** All of an element's reactive bindings compute into one flat record and apply by field
comparison. The previous-value store is the compute's own return value: no runtime-allocated object,
no per-element expando. `class`, `style` and `classList` are members of that record like any other.

**Falsified by.** Count effects per element with N reactive bindings: it MUST be 1, not N.

**Status.** `PLANNED` (M5). **Pinned by.** `multi-prop-one-element.tsx` (existing, whose `optimality`
already carries the claim).

### B3 — `ref` is not a prop

**Rule.** `<div ref={el}>` with a writable binding MUST emit an assignment `el = _n1`. `ref={fn}` MUST
emit a ref registration drained per M3. `useRef()` and the `{current}` shape are deleted.

**Falsified by.** After render, the `let` binding MUST hold the element. Verified today:
`_$setProp(_el$1, "ref", el)` **reads** the variable and never writes it.

**Status.** `VIOLATED`. **Pinned by.** `ref-binding.tsx` (existing, re-pinned).

### B4 — a listener dies with its position

**Rule.** Every listener registers a cleanup on the owning scope. Removal costs zero bookkeeping and
cannot be forgotten. Handler identity is bound once by default; `on:click={cell}` is the explicit live
form.

**Falsified by.** The leak oracle: registered-listener count after `dispose()` MUST be 0. Today only
`spread` removes listeners.

**Status.** `VIOLATED`. **Pinned by.** `delegated-event.tsx`, `non-delegated-event.tsx` (existing,
re-pinned); `sem-own-dispose-leaves-nothing.tsx` *(new)*.

### B5 — property-vs-attribute is a stated rule with an explicit override

**Rule.** Known HTML attribute → attribute; else if the property exists on the prototype chain →
property; else attribute. `prop:` / `attr:` / `bool:` force it. `on:` takes verbatim names with no
lowercasing.

**Falsified by.** `<my-grid rows={arr}>` MUST NOT become `setAttribute("rows", "[object Object]")`.

**Status.** `PLANNED` (M5). **Pinned by.** `custom-elements.tsx`, `property-attrs.tsx`,
`dom-prop-static-value.tsx` (existing).

---

## 10. A — Async

`CODESIGN.md` §11 Q7 leaves transitions deliberately underspecified: *"nothing may be built on
`KEEPALIVE` parking until the three unspecified cases are answered."* This section therefore specifies
only what is settled, and **names the gap** rather than papering over it.

### A1 — cancellation is structural

**Rule.** The `AbortController` is a cleanup on the scope that created the resource. Dispose aborts.
A re-run aborts the previous. The signal is **passed to the fetcher**.

**Falsified by.** Dispose during an in-flight fetch; the request must abort. Verified today: the
controller is created and never handed over.

**Status.** `VIOLATED`. **Pinned by.** `sem-async-abort-on-dispose.tsx` *(new)*,
`create-async-value.tsx` (existing).

### A2 — staleness is decided by `s.gen` captured at call time

**Rule.** A continuation compares the `gen` it captured at call time against the scope's current `gen`
and drops if they differ. It MUST NOT read a mutable outer variable that by then points at the newest
controller.

**Falsified by.** Start a slow request, start a fast one, let the fast one settle first, then the slow
one; the slow response MUST NOT overwrite the fresh one. Today's abort guard reads a mutable outer
variable, so it does.

**Status.** `VIOLATED`. **Pinned by.** `sem-async-stale-response.tsx` *(new)*.

### A3 — `NotReady` is a control signal, not an error

**Rule.** A memo that has not settled throws `NotReady`. A `Loading` boundary catches it; an error
boundary re-throws it (E2.3). It never reaches user error handling.

**Status.** `VIOLATED`. **Pinned by.** `sem-err-notready-passthrough.tsx` *(new)*,
`control-flow-await-suspense.tsx` (existing).

### A4 — optimistic state is derived, never restored

**Rule.** `() => reduce(base(), pending())`. There is no snapshot, therefore there is nothing to
clobber. A real write landing during an action is not rolled back.

**Falsified by.** Start an optimistic action; land a real write to the same target mid-flight; settle;
the real write MUST survive. Today `registerRevert` captures `revertTo` once per (target, action) and
rolls back to a value that is by then wrong.

**Status.** `VIOLATED`. **Pinned by.** `create-optimistic-signal.tsx` (existing, re-pinned).

### A5 — transitions: NOT SPECIFIED

**Rule.** *(deliberately absent)*. Three questions are unanswered and nothing may be built on them:
what a write to a parked subtree does; whether parked effects are suspended or merely detached; what
happens when the live scope and the pending transition scope both write the same signal. Q7 constrains
the answer — a transition must be expressible with scope forks alone; a copy-on-write reactive graph
is a separate design — but the answer does not exist yet.

**Status.** `UNOBSERVABLE`, by design. This entry exists so that the gap is visible in the
specification rather than discovered in the implementation.

---

## 11. H — Hydration

### H1 — hydration is claim-based, not replace-based

**Rule.** The client **claims** server-rendered nodes by walking them. It MUST NOT clear the container
and re-render. `container.textContent = ""` throws the entire server render away and is deleted.

**Falsified by.** Node-reuse percentage on a matching render MUST be 100%. Measured today: 0%.

**Status.** `VIOLATED`. **Pinned by.** `sem-hydrate-node-reuse.tsx` *(new)*.

### H2 — a branch is claimed by its written key, not by re-evaluating its condition

**Rule.** A range owner writes a branch instruction at **block boundaries only** — `<!--[k-->` … `<!--]-->`
— and the client reads `k`. It MUST NOT re-evaluate the condition, which is unsound: the condition may
read data the client has not yet been seeded with.

**Falsified by.** Hydrate a branch whose condition depends on data seeded *after* hydration begins;
the claimed branch MUST be the server's.

**Status.** `PLANNED` (M6). **Pinned by.** `sem-hydrate-branch-claim.tsx` *(new)*.

### H3 — elements are claimed by a hydration-only logical index

**Rule.** Elements are claimed by the same compiler walk that drives client rendering, carrying a
hydration-only logical index (`child(n, 3)`). That index MUST cost nothing on the client-render path.

**Falsified by.** Compare emitted client-render code with and without `hydratable`; the non-hydratable
walk must carry no index argument.

**Status.** `PLANNED` (M6). **Pinned by.** `sem-hydrate-index-is-free.tsx` *(new)*.

### H4 — a mismatch has a local blast radius

**Rule.** On mismatch, **only that branch** re-renders. Detection is mandatory; silent divergence is
not acceptable. `CODESIGN.md` §11 Q4: take the bytes, get the recovery.

**Falsified by.** A deliberate mismatch fixture, measuring blast radius in nodes replaced. The count
MUST equal that branch's node count, not the page's.

**Status.** `PLANNED` (M6). **Pinned by.** `sem-hydrate-mismatch-radius.tsx` *(new)*.

### H5 — the address is the shared artefact and it is process-independent

**Rule.** The shared artefact between the two backends is the compile-time address
`(module, unit, position)`. It MUST be identical for the same source on both backends and across
processes. A process-global counter MUST NOT participate in it.

**Falsified by.** `markerId` today is a process-global that makes the same tree serialise as
`<!--Show:0-->` on the server and `<!--Show:1-->` on the client **in one process**. Compile all
fixtures both ways and diff the address sets: they must be equal.

**Status.** `VIOLATED`. **Pinned by.** the address-set diff over the whole corpus *(new channel,
M6)*.

### H6 — interactive state survives hydration

**Rule.** Focus and the value of a user-mutated input MUST survive hydration.

**Falsified by.** Focus an input and type before hydration completes; after hydration, `document.activeElement`
and the input's value must be unchanged.

**Status.** `VIOLATED` (H1's consequence). **Pinned by.** `sem-hydrate-preserves-focus.tsx` *(new)*.

---

## 12. The acceptance case, answered

> **What must `<Provider><Child/></Provider>` do?**

Source:

```jsx
const Ctx = createContext();                       // no default → a miss THROWS
const Child = () => <span>{Ctx.use()()}</span>;
export const App = () => <Ctx.Provider value={1}><Child /></Ctx.Provider>;
```

The specification answers, rule by rule, with no appeal to any implementation:

1. **`Child` is not evaluated at the provider's call site.** Its JSX lowers to a `Block` (C6). A Block
   takes a scope as its first argument and there is no expression in the emitted language meaning
   "children, already built" (C6, falsification clause).
2. **`provide` creates one scope** — `provide` is one of the six creators (O1) — as a child of the
   scope `App` is running under (O2.1).
3. **`provide` forks the context record and writes the value, before invoking anything** (X1). The
   fork is `Object.create`, so the cost is flat in the number of keys already in scope (X6).
4. **`provide` invokes the children Block with that scope** (O2), **exactly once** (C7).
5. **`Child` runs under the provider's instance scope.** It creates no scope of its own (O1).
6. **`Ctx.use()` returns a Cell; calling it resolves at read time by walking the scope chain from
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

**What the implementation does today**, for contrast, and this is the entire reason for M0:

```js
export const App = () => (0, Ctx.Provider)({ value: 1, children: Child({}) });
```

`Child({})` is an argument. It runs at the call site, under the caller's owner — which is `null`,
verified — before `createScope` inside `Provider` has created the scope that `owner._context[id]`
writes into. Result: `<span>THREW:ContextNotFoundError</span>`. Rules violated: **O2, O2.1, X1, C6**.
The un-compiled `createElement` path fails identically, which is why the differential harness was
green, which is why L1 exists.

---

## 13. Rule index

`H` = HOLDS, `V` = VIOLATED, `P` = PLANNED (with the milestone that turns it green), `U` = UNOBSERVABLE.

| Rule | Subject | Status | Fixture |
|---|---|---|---|
|
| ---- | ------- | ------ | ------- |

|
| ------ | ------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|
 O1 | scope creation set is closed | P (M2/M3) | `sem-own-component-allocates-nothing` *(new)* |
| O2 | a Block runs under the scope it is given | **V** | `sem-ctx-provider-direct-child`, `sem-ctx-provider-wrapper-component`, `own-provider-direct`, `own-provider-wrapper` |
| O2.1 | a component body runs under the receiving scope, after its bindings | **V** | `sem-ctx-provider-direct-child`, `sem-ctx-provider-wrapper-component`, `sem-testing-wrapper-eager`, `own-provider-wrapper` |
| O3.1–3 | disposal order: dead, kids reverse DFS, cleanups LIFO | H | `sem-own-dispose-order` *(new)* |
| O3.4–5 | abort signal, range removal | I/U | `sem-own-dispose-leaves-nothing` *(new)* |
| O3.6 | a throwing cleanup does not abort the rest | H / **V** | `sem-err-cleanup-throw` *(new)* |
| O3.7 | the leak invariant | **V** | `sem-own-render-disposer-disposes`, `sem-own-dispose-leaves-nothing` *(new)* |
| O4.1–2 | restoration on both paths; the cost claim | **V** | `sem-err-current-restored-after-throw` *(new)* |
| O4.3 | a catcher restores to `prev`, captured before its own `enter` | **V** | `sem-err-current-restored-after-throw` *(new)* |
| O4.4 | no partially-constructed subtree survives a throw | **V** | `sem-err-construction-throw` |
| O4.5 | `CURRENT` never decides ownership | **V** | structural (§14) |
| O5 | `render` opens a root; the disposer disposes | H / **V** | `sem-own-render-disposer-disposes` |
| O6 | owner and observer are separate | H | `sem-react-untrack-keeps-owner` *(new)* |
| C1 | `Comp(s, props)`, one convention | P (M3) | `component-boundary-props`, `arrow-body-component` |
| C2 | components are declared, not inferred | P (M3) | `sem-props-direct-call-diagnostic` *(new)* |
| C3.1–5 | the five props laws | **V** | `sem-props-laziness-conformance` *(new)*, `sem-props-cell-not-memoised` *(new)*, `component-getter-props` |
| C3.6 | Cells are arity-tolerant | P (M3) | `sem-props-block-in-cell-slot` *(new)* |
| C3.7 | Cell-in-Block-slot is safe; the converse is not | P (M3) | `sem-props-block-in-cell-slot` *(new)* |
| C3.8 | a Block with no scope throws, never falls back | P (M3) | `sem-props-block-in-cell-slot` *(new)* |
| C3.9 | kind travels with the value | P (M3) | `sem-props-forward-identity` *(new)* |
| C4 | props are called; `Slot<T>` / `Props<P>` | P (M3) | `sem-props-typed-slot.d.test.ts` *(new, type channel)* |
| C5 | forwarding is identity and depth-independent | P (M3) | `props-raw-forward`, `sem-props-forward-identity` *(new)* |
| C5.1 | a Block in a Cell slot: diagnostic or throw | P (M3) | `sem-props-block-in-cell-slot` *(new)* |
| C5.2 | η-reduction is Cell-only | H | `flow-prop-eta-boundary` |
| C6 | children are Blocks; slots are Block-valued props | **V** | `component-children-slot`, `sem-ctx-provider-direct-child`, `sem-ctx-provider-nested`, `sem-testing-wrapper-eager`, `sem-own-slot-arguments` *(new)* |
| C7 | one Block invocation per activation | U → P (M4) | `sem-own-single-evaluation` *(new)* |
| C8 | fragments drop nothing | **V** | `sem-own-fragment-drops-nothing` *(new)* |
| C9 | props source list, written order, last wins | P (M3) | `component-spread`, `sem-props-source-list-order` *(new)* |
| X1 | provide: enter, fork, write, then invoke | **V** | `sem-ctx-provider-direct-child`, `sem-ctx-provider-wrapper-component` |
| X2 | a provided value is a Cell; updates are live | H / **V** | `context-provider`, `sem-ctx-value-is-live` |
| X3 | context resolves at read time up the scope chain | H / **V** | `sem-ctx-provider-nested`, `sem-ctx-provider-default-silent`, `sem-err-fallback-reads-context`, `sem-ctx-read-after-install` *(new)* |
| X4 | cross-boundary reads follow the scope chain | U | `sem-ctx-portal-lexical` *(new)* |
| X5 | a miss throws, carrying the component stack | H / P (M2) | `sem-ctx-miss-throws-with-stack` *(new)* |
| X6 | the context record forks lazily, flat cost | H | `sem-ctx-fork-is-flat.bench.ts` *(new, bench)* |
| K1 | index is the default row identity | P (M4) | `sem-key-index-default` *(new)*, `for-unkeyed-rows` |
| K2 | an unchanged key is a no-op | P (M4) | `sem-key-noop-preserves-nodes` *(new)* |
| K3 | keyless + stateful row = diagnostic | P (M4) | `sem-key-stateful-row-diagnostic` *(new)* |
| K4 | duplicate keys: DEV error, degrade to index | P (M4) | `sem-key-duplicate` *(new)* |
| K5 | key expressions are emitted JS; `SymbolId` resolution | H / P (M4) | `renamed-core-import`, `sem-key-shadowed-flow` *(new)* |
| K6 | each activation is a fresh scope and a fresh build | **V** | `control-flow-show`, `sem-key-remount-is-fresh` *(new)* |
| K7 | no marker comments in client rendering | P (M4) | anchor snapshot channel (corpus-wide) |
| K8 | no ambient insertion state | H | structural (§14) |
| E1 | O(1) catcher; a catcher always exists | P (M2) | `sem-err-root-catcher` *(new)* |
| E2 | the eight routed entry points | **V** (5 of 8) | `sem-err-construction-throw`, `sem-err-effect-throw` *(new)*, `sem-err-handler-throw` *(new)*, `sem-err-ref-throw` *(new)*, `sem-err-async-throw` *(new)*, `sem-err-cleanup-throw` *(new)*, `sem-err-notready-passthrough` *(new)* |
| E2.1 | construction throws land inside the boundary | **V** | `sem-err-construction-throw` |
| E2.2 | a handler throw routes to the boundary | **V** | `sem-err-handler-throw` *(new)* |
| E2.3 | `NotReadyError` is re-thrown, never captured | **V** | `sem-err-notready-passthrough` *(new)* |
| E3 | a boundary is a branch plus a try | P (M4) | `control-flow-error-boundary` |
| E4 | an error carries the scope chain | P (M2) | `sem-err-component-stack` *(new)* |
| M1 | construction is depth-first in document order | H | `sem-mount-order` *(new)*, `dashboard-composite` |
| M2 | first write during construction; no flash | H | `sem-mount-no-flash` *(new)*, `reactive-attribute` |
| M3 | refs drain after insertion, children before parents | **V** | `sem-mount-ref-order` *(new)*, `ref-binding` |
| M4 | microtask flush; render effects before user effects | H | `multi-signal-expression` |
| M5 | a stable re-render preserves every node | H / **V** | `sem-mount-stable-rerender` *(new)*, corpus-wide |
| M6 | insertion is idempotent under interruption | U | `sem-mount-dispose-during-construction` *(new)* |
| R1 | reactivity entered in exactly four places | H | `sem-react-component-body-untracked` *(new)* |
| R2 | reactivity exited in exactly three places | H / P (M5) | `sem-react-apply-is-untracked` *(new)* |
| R3 | a Cell is neutral | P (M3) | `sem-react-cell-neutrality` *(new)* |
| R4 | `untrack` changes only the observer | H | `sem-react-untrack-keeps-owner` *(new)* |
| R5 | epoch dedupe and `markWave` are load-bearing | H | ablation bench (§14) |
| R6 | a signal getter is a Cell | H / **V** | `use-state-tuple`, `signal-methods-in-handler` |
| B1 | every binding on an element is equally live | **V** | `class-with-live-siblings` |
| B2 | one fused effect per element | P (M5) | `multi-prop-one-element` |
| B3 | `ref` is not a prop | **V** | `ref-binding` |
| B4 | a listener dies with its position | **V** | `delegated-event`, `sem-own-dispose-leaves-nothing` *(new)* |
| B5 | property-vs-attribute is a stated rule | P (M5) | `custom-elements`, `property-attrs` |
| A1 | cancellation is structural | **V** | `sem-async-abort-on-dispose` *(new)* |
| A2 | staleness by `gen` captured at call time | **V** | `sem-async-stale-response` *(new)* |
| A3 | `NotReady` is a control signal | **V** | `sem-err-notready-passthrough` *(new)* |
| A4 | optimistic state is derived, never restored | **V** | `create-optimistic-signal` |
| A5 | transitions | **NOT SPECIFIED** | — |
| H1 | hydration is claim-based | **V** | `sem-hydrate-node-reuse` *(new)* |
| H2 | branches claimed by written key | P (M6) | `sem-hydrate-branch-claim` *(new)* |
| H3 | logical index is free on the client path | P (M6) | `sem-hydrate-index-is-free` *(new)* |
| H4 | a mismatch has a local blast radius | P (M6) | `sem-hydrate-mismatch-radius` *(new)* |
| H5 | the address is process-independent | **V** | address-set diff (corpus-wide) |
| H6 | interactive state survives hydration | **V** | `sem-hydrate-preserves-focus` *(new)* |

**Counts.** 77 rules: 9 `HOLDS`, 28 `VIOLATED`, 27 `PLANNED`, 3 `UNOBSERVABLE`, 9 holding only in
part (6 `H / V`, 3 `H / P`), 1 `IMPLEMENTED, UNEXERCISED` (`I/U`), 1 `NOT SPECIFIED`.
**M3's compiler half moved NO row of this table, deliberately.** C1, C3, C5, C6 and C9 now record what
the compiler emits, and every one of them still fails its own falsification procedure, because every
one of those procedures runs a fixture and no fixture can run until `packages/core` accepts a scope.
A status is a claim about an OBSERVATION; an emission is not one. M2's agent refused to mark O3.7
`HOLDS` on the same reasoning and was right to.


**29 violated rules is the finding.** They are not 29 independent bugs; they cluster. O2 and its
consequences (O2.1, X1, C6, C8, E2.1) are one defect with six faces — children evaluated at the call
site. O5 and its consequences (O3.7, B4, A1) are one defect with four — nothing owns anything, so
nothing can be disposed. B1, B3 and R6 are the classify-pass exclusions. That three defects can
present as twenty-nine violated rules is the argument for writing the rules down: each face was
individually plausible and none of them was individually wrong *against anything*.

---

## 14. Rules with no fixture — the next phase's worklist

This is the deliverable §13 is really for. Three classes.

### 14.1 Rules pinned by a fixture that must be written (50 fixtures, 1 bench, 1 type-level test)

The Provider and boundary fixtures are first and they are the M0 gate: **they must FAIL, and the
failure must name the rule.**

**Ownership (7).** `sem-own-component-allocates-nothing`, `sem-own-dispose-order`,
`sem-own-dispose-leaves-nothing`, `sem-own-render-disposer-disposes`, `sem-own-single-evaluation`,
`sem-own-fragment-drops-nothing`, `sem-own-slot-arguments`.

**Context (5) — the M0 gate.** `sem-ctx-provider-direct-child` **(first; must fail on O2/O2.1/X1/C6)**,
`sem-ctx-read-after-install`, `sem-ctx-value-is-live`, `sem-ctx-portal-lexical`,
`sem-ctx-miss-throws-with-stack`. Plus one bench: `sem-ctx-fork-is-flat.bench.ts`.

**Errors (10) — the other M0 gate.** `sem-err-construction-throw` **(must fail on E2.1/O4.4)**,
`sem-err-current-restored-after-throw` **(must fail on O4.3)**, `sem-err-effect-throw`,
`sem-err-handler-throw`, `sem-err-ref-throw`, `sem-err-async-throw`, `sem-err-cleanup-throw`,
`sem-err-notready-passthrough`, `sem-err-root-catcher`, `sem-err-component-stack`.

**Props (6).** `sem-props-laziness-conformance`, `sem-props-cell-not-memoised`,
`sem-props-forward-identity`, `sem-props-block-in-cell-slot`, `sem-props-source-list-order`,
`sem-props-direct-call-diagnostic`. Plus one type-channel test: `sem-props-typed-slot.d.test.ts`.

**Keying (6).** `sem-key-index-default`, `sem-key-noop-preserves-nodes`,
`sem-key-stateful-row-diagnostic`, `sem-key-duplicate`, `sem-key-shadowed-flow`,
`sem-key-remount-is-fresh`.

**Mount (5).** `sem-mount-order`, `sem-mount-no-flash`, `sem-mount-ref-order`,
`sem-mount-stable-rerender`, `sem-mount-dispose-during-construction`.

**Reactivity (4).** `sem-react-untrack-keeps-owner`, `sem-react-component-body-untracked`,
`sem-react-apply-is-untracked`, `sem-react-cell-neutrality`.

**Async (2).** `sem-async-abort-on-dispose`, `sem-async-stale-response`.

**Hydration (5).** `sem-hydrate-node-reuse`, `sem-hydrate-branch-claim`, `sem-hydrate-index-is-free`,
`sem-hydrate-mismatch-radius`, `sem-hydrate-preserves-focus`.

### 14.2 Rules that need a new *channel*, not a new fixture (5)

These cannot be pinned by a fixture at all until the harness grows a way to observe them. Each is a
piece of M0/M1 harness work.

| Rule | Channel needed | Milestone
| Rule | Channel needed | Milestone |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
 |
|---|---|---|
| O1, O2, O2.1, O3 | **the L2b ownership trace** — `enter`/`exit`/`dispose`/Block-invoke appended to a log, asserted isomorphic to the compiler's static ownership tree | M0 |
| O3.7, B4 | **the leak oracle** — live scopes, registered listeners, pending fetches, retained nodes after `dispose()`. The live-scopes half is DELIVERED at M0: `checkTrace` reports any scope entered inside the trace window and not disposed before it closes, and the window closes on the render root's own disposal. Listener and fetch counts are M2, because the sink does not record them at all. | M0 (scopes) / M2 (the rest) |
| C7 | **Block invocation counter**, keyed by position. Until it exists, `test/ownership-census.ts` declares the per-fixture clone count, so a Block invoked twice per activation is a diff rather than nothing at all — that mutation passes every other test in the repository. | M4 |
| M5 | **corpus-wide node-identity metamorphic channel** (replaces today's skip-on-shape-mismatch identity channel) | M1 |
| H5 | **address-set diff** — compile all fixtures both ways, diff the `(module, unit, position)` sets | M6 |

### 14.3 Rules that are structural and are checked by inspection, not by a fixture (4)

Recorded so that "unpinned" does not silently mean "unenforced".

| Rule | How it is enforced |
|---|---|
|
| ---- | ------------------ |

|
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|
 O4.5 | a lint rule: no runtime primitive may read `CURRENT` where a `Scope` parameter is in scope |
| O3.1 | the L2b channel reports a scope whose disposer runs its body twice — that is, it observes the ABSENCE OF THE IDEMPOTENCE GUARD, not repeated calls to `dispose()`. Calling an idempotent disposer three times records one event and is correctly silent. |
| K8 | a lint rule: no module-level mutable insertion state in `packages/core` |
| R5 | the ablation benchmark in `packages/core`, with correctness assertions per variant |
| A5 | none — the rule does not exist yet, and §10 says so |

---

### 14.4 What the L2b trace does not reach, measured rather than assumed

The M2 gate ran the full 125-fixture corpus against eleven mutated runtimes. The trace catches
kid-order reversal (O3.2), a deleted idempotence guard (O3.1), missing enter events, unregistered
scopes and skipped disposal. Four mutants produced byte-identical output: exit made a no-op (O4.1),
FIFO cleanups (O3.3), the context fork stripped of its prototype link (X6), and every scope storing
a null parent (O2 parentage).

The last of those was structural — the sink recorded the parent *passed as an argument*, so both
sides of the check came from one expression — and is now fixed: the sink reads the parentage the
scope itself stores. **The other three are unit-pinned and oracle-blind.** O3.3, O4.1 and X6 are
asserted only by `packages/core/src/scope.test.ts`, which does discriminate all three; no channel
over compiled fixtures observes them, and this section is the record of that rather than a claim
that the oracle covers them.

---

## 15. The known-failure registry

"Green except the known failures" must be a state the suite can **assert**, not something a human
eyeballs. A list that can silently absorb a new failure is worthless.

### 15.1 The contract

The registry is a data file, `test/known-failures.ts`, exporting a frozen table:

```ts
export const KNOWN_FAILURES = [
  { fixture: "sem-ctx-provider-direct-child", rule: "O2",   status: "VIOLATED", green_at: "M3",
    reason: "children evaluated at the call site; verified <span>THREW:ContextNotFoundError</span>" },
  { fixture: "sem-key-index-default",         rule: "K1",   status: "PLANNED",  green_at: "M4",
    reason: "today's For keys by item; CODESIGN §11 Q3 reverses this deliberately" },
  // …
] as const
```

### 15.2 The four assertions the suite makes about it

1. **A fixture in the registry that PASSES is a suite failure**, reported as **stale** — the same
   discipline the corpus already applies to `wins` and `goesLive`. A passing known-failure means either
   the bug was fixed without the registry being updated, or the fixture never discriminated the rule
   in the first place. Both must be seen.
2. **A fixture not in the registry that FAILS is a suite failure.** This is the ordinary case and it
   is why the registry cannot absorb anything by accident.
3. **A registry failure that fails for the wrong reason is a suite failure.** Each row names a `rule`,
   and the fixture's failure message must contain that rule ID. A fixture that fails because it does
   not compile, or because a signal was misspelled, is not evidence that the oracle can see the bug.
   This is the assertion that makes M0 mean anything.
4. **Every `rule` in the registry must exist in this document, and every `fixture` must declare that
   rule in its `rules` export** (§0.3). The registry, the fixtures and this document are checked
   against each other in both directions.

**What assertion 3 does and does not prove.** `kit.fail` stamps the claim's own `rule` into the
message, deliberately, so that a rule ID never has to be copied into a fixture's prose where a
copy-paste could put the wrong one in. The consequence is that the token match is true by
construction for any non-crashing claim, and the load-bearing content of assertion 3 is therefore
`crashed === false` plus the claim's own runtime check — not the presence of the token. Read it as
*"the claim reported a violation rather than falling over"*, never as *"the message proves the
rule"*.

That leaves one hole, and `kit.precondition` is what closes it: a claim that observes an ABSENCE is
satisfied by an absence for any reason at all, so gutting a gate fixture to
`function Direct() { return <div /> }` left three of its four claims still "failing as registered".
Every claim MUST first establish, as a positive observation, that the construct under test ran. A
failed precondition crashes, and assertion 3 catches a crash as a wrong reason.

### 15.3 Adding a row is a deliberate act

The registry is a source file under review. A row can only be added in a diff, with a `reason` and a
`green_at`. There is no wildcard, no glob, no "expected to fail" annotation inside a fixture, and no
environment variable that widens it. Removing a row is what a milestone's completion looks like.

### 15.4 What M0 asserts, exactly

- The cargo tests, the bun tests in `compiler-rs`, the 809 tests in `packages/core`, and the root
  `test` and `ci` scripts all still pass, and **no emission snapshot moves**. **M0 changes no
  semantics.** The counts grow — M0 adds tests — but every test that passed before still passes and
  every snapshot keeps its bytes.
- Every one of the 117 existing fixtures (plus the one under `browser-only/`) still passes,
  unchanged, in every mode it currently runs in.
- Every new fixture in §14.1 whose rules are all `HOLDS` passes.
- Every new fixture in §14.1 with a `VIOLATED` or `PLANNED` rule **fails**, is in the registry, and
  fails naming that rule.
- `sem-ctx-provider-direct-child`, `sem-ctx-provider-wrapper-component` and
  `sem-err-construction-throw` are the three the gate is really about. If any of them passes at M0,
  the oracle cannot see the bug that prompted this work, and M0 has not been achieved.
  `sem-ctx-provider-wrapper-component` is a gate in its own right rather than a variation on the
  first: it is the shape every `AuthProvider` and `QueryClientProvider` in existence has, and it is
  the shape the L2b channel was blind to for as long as its static tree attributed a call site's
  children to the call site. A channel that agrees with the runtime's mistake reports nothing, which
  is the same-belief failure the channel exists to escape.
- On the L2b side the gate fixtures are `own-provider-direct` and `own-provider-wrapper`, and the
  channel must report O2.1 for both while `own-provider-thunked` stays clean.
### 15.5 The M3 split, and why the registry could not absorb it

M3 was one breaking change delivered by two hands: the compiler emitting `Comp($s, props)` with Cell
props, Block children and `_$props` source lists, and `packages/core`/`packages/testing` implementing
the other side of that ABI. Between the two the suite was red, with exactly three causes — a runtime
component reading its FIRST parameter as props, and two missing exports (`cell`, `props`).

**None of it was registered, and §15.2 assertion 3 is the reason.** Every one was a CRASH. The
registry's whole content is that a registered claim must fail by *reporting a violation of its rule*,
and a crash is never evidence about a rule; §15.3 forbids widening it with a wildcard. A registry that
can absorb a crash is the registry this document was written to replace. Both halves have since
landed, the three causes are gone, and this section is kept as the record of how a mid-milestone split
is accounted for rather than absorbed.

**What the second half actually cost.** The runtime side was not a port of signatures. Thirteen of the
fourteen constructs declared the scope parameter and never read it, resolving ownership from
`getOwner()` instead — which made O2 and O4.5 true of one construct and false of the rest, and made
the gate vacuous: reverting `Ctx.Provider` to `enter(getOwner())` left every suite in the repository
green. The rules that moved to `HOLDS` at M3 did so on the strength of a channel that can see the
difference, `packages/core/src/calling-convention.test.ts`, which hands a construct a scope that is
not the ambient one. §14.1's worklist is what tracks the rules that still have no such channel.

**Consumer breakage.** `CODESIGN.md` §8 schedules `packages/extra` and `packages/kitchen-sink` for M8
with no compat shim, and that is where they stay. The codemod was not run on them: §8's `barq migrate`
rewrites `props.x` to `props.x()` inside component bodies, which is sound and is not the binding
constraint — `packages/extra` is compiled by Bun's `react-jsx` transform into
`@barqjs/core/jsx-runtime`, the un-compiled authoring path §11 Q2 deletes, so no body rewrite reaches
the defect. `packages/extra/src/m8-convention.test.ts` is the machine-checked row: it pins that the
package is still on the pre-M3 convention AND that the runtime ABI has moved, so it cannot rot into a
comment. **`packages/kitchen-sink` renders a blank page from M3 until M8** — the Provider defect is
fixed and the reference application is still blank, for a different and registered reason
(`routes is not iterable`, from `Router` reading `props.config` as a value). That is stated in
`CODESIGN.md` §8 and pinned by the same registry, so "blank page" cannot quietly come to mean
something new.

### 15.6 The third registry, and the baseline it removes

`test/oracle-known-failures.ts` is a THIRD table, created at M3, and it is named here because a
registry created in the same change that made its rows diverge is exactly what §15.3 exists to keep
visible.

**33 rows over a 120-fixture corpus — 27%, and it is precisely the part M3 changed.** 30 rows carry
`cause: "C1"`, 3 carry `"C6"`, 29 also apply to the string backend. The divergence kinds they cover
are `THREW`, `initial-dom`, `step-dom`, `event-dom`, `node-identity`, `effect-count` and
`effect-runs` — which is every channel `oracle.test.ts` has.

**What it removes, stated as a loss.** `oracle.test.ts`'s reference is the fixture's own source
lowered by bun's `react-jsx` transform into `createElement`. Under C1 a component is
`Comp(scope, props)`; nothing rewrites the raw source's DECLARATIONS and bun's transform cannot, so
for every fixture with a component tag or a slot callback the reference binds the SCOPE to the first
parameter the author declared. Those fixtures no longer have an un-compiled differential at all —
`oracle.test.ts` builds `REFERENCE_IS_DEAD` from the 30 `C1` rows and skips them in the path-integrity
sweeps. §11 Q2 accepted that there is no un-compiled authoring path; these rows are the interval
between that decision and §4.1's retirement of `createElement` at M9.

**What does NOT replace it, and why.** `Interp` (L2) runs green over the whole corpus and consumes the
same analysed IR — which is exactly why it cannot stand in: it creates the same effects, in the same
groups, at the same time, so the `boundEffects` delta that targets #1 and #4 are measured against is
identically zero and every `wins`/`goesLive` declaration in the corpus goes stale at once. Repointing
the oracle needs a NEW baseline for "fewer effects than the un-compiled path", and building it is M9's
work, scheduled with the retirement rather than done as a redirect.

**What holds it honest meanwhile.** Four assertions in `oracle.test.ts`, and the fourth is the one
that matters: `cause` is EVIDENCED, not asserted — a `C1` row must be a fixture whose compiled module
actually contains a scope-passing call site, so a fixture with no such call site can never be
registered under this cause. The `kinds` are pinned per row by exact set equality, so a NEW defect
inside a registered fixture cannot hide behind an old one, and a row that stops diverging fails the
suite as stale.

---

## 16. What this document cannot catch

A defect in itself. If a rule here says the wrong thing, `-O0` and `-Ox` will agree on it, the
ownership trace will match, and every conformance test will pass. That residual is irreducible and it
is why this document is reviewed as a design artefact rather than generated from the implementation.

It is also why every execution mode shares `analysis::bind`: a mis-classified `SourceKind` is wrong
everywhere simultaneously, which is **exactly the failure shape of the Provider bug**. L1's
hand-written absolute expectations are the only defence against that, and they are the weakest layer,
because they are human.

Alive2 is the precedent worth keeping in view: validating LLVM against a written semantics produced
eight patches to the LangRef, because the act of checking forces the specification to exist. Every
rule above that is marked `VIOLATED` is one of barq's eight.
