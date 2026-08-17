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
components allocate one scope per instance via `scope`, and a plain component allocates none —
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

O2.1 `HOLDS` since M3, and it is the clause the emission above is about: `children` is a Block, so a
component's body runs while the current scope is the receiving construct's instance scope and after
that scope's bindings are written. All three of its L1 claims hold. §13 carried it as **V** for two
milestones after it moved, which is the drift the registry-consistency check exists to report.

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
M2 gate measured 1,000 create+dispose pairs leaving 1,000 entries behind. The M4 gate found the
unlink guarded by a module-global unwind DEPTH, which made it skip for any disposal happening
anywhere while some UNRELATED tree was unwinding — five dead scopes retained on a live parent,
measured, whenever a cleanup disposed something outside its own subtree, which is what a portal
container, a pinned scope or a row coordinator does. The guard is now the identity of the array
being walked: `unwindKids` detaches `kids` from the scope before the walk, so a child disposed by
its own parent finds `null` and a child disposed during someone else's unwind still reclaims its
slot. `scope.test.ts` pins both directions, and the second test fails with the old spelling.

O3.5 `HOLDS` since M4. `branch`, `boundary` and `portal` install their instance's range with
`ownRange`, so disposal removes the DOM as its last act and no consumer removes nodes it does not
own. That is what took the range half out of "implemented, unexercised": there are four production
callers now and `flow.test.ts` drives every one of them through mount → key flip → dispose.

Since M7c a range whose nodes are EVERY child of their parent is removed with one
`parent.textContent = ""` rather than a `removeChild` per node (`CODESIGN.md` §0.9 — it is 17% of the
JavaScript a 1,000-row `clear` costs). "No consumer removes nodes it does not own" is unchanged and
is what makes the fast path admissible: the count must equal `childNodes.length` AND every node must
be under that parent, so a list beside a static sibling, a list beside another list, and a range whose
nodes a `portal` moved all take the per-node path. `flow.test.ts` pins the fast path once and the
refusal five times, through an emptying update and through disposal.

It also has an oracle channel of its own since M4, and the channel is a JOIN rather than a second
assertion of the same thing. `test/metamorphic.ts`'s MM4 reads which nodes survived a transition off
the DOM and which scopes came apart off the L2b ownership trace, in ONE render window, and asserts
both against the same declared class: a step declared `preserves` must dispose nothing, a step
declared `rebuilds` must dispose something. A runtime that disposed a branch instance and rebuilt a
byte-identical subtree satisfies the markup — which is what every other channel in the repository is
a function of — and fails here.

O3.4 `IMPLEMENTED, UNEXERCISED`. M2 landed `abortSignal(s)` and `dispose` aborts it before the range
comes out, and `scope.test.ts` pins it, but nothing in the runtime calls `abortSignal` yet. M5 gave
the listener a scope-owned cleanup rather than an `{ signal }` — `listen` registers the removal
through `onCleanup`, which is the same lifetime by a different mechanism — so the abort controller
still has no production caller and the fetch half is M7's. `HOLDS` is the wrong word for a primitive
whose only caller is its own test.

O3.6 `PARTIAL`, and it has no compiler-rs channel: nothing about a cleanup throw is observable from
emitted code, so `sem-err-cleanup-throw.tsx` was named here while it did not exist and is struck off.
The half that holds is pinned by `packages/core/src/scope.test.ts`. The half that says a throwing
cleanup MUST NOT abort the rest holds: `runUntracked`
wraps every cleanup in `try/catch`, so a throw in the second of three still leaves all three run.
The half that says it MUST route to `s.catcher` does not — the throw is swallowed with
`console.error` and no catcher is consulted. Sharper than "unimplemented", and measured in the M7
gate: `s.catcher` is written in exactly two places — `makeScope` inherits the parent's, and
`enterRoot` installs the ROOT's rethrowing one — while `errorBoundary` installs its handler as the
`ERROR_BOUNDARY` *context* value instead, which is what the effect-error path reads. So no user
boundary can ever BE `s.catcher`, and the rule is unreachable by construction rather than one wiring
change away: the two channels have to be unified first — either `errorBoundary` writes the instance
scope's `catcher` alongside the context binding, or O3.6 is restated to route through
`ERROR_BOUNDARY` like every other entry point and the field goes. (An earlier reading of this status said the throw
"propagates out of `disposeNode` and aborts the rest", which is not what happens and is exactly the
wrong-reason hazard §15 exists to catch.)

O3.7 `HOLDS` since M5. It was `PARTIAL` from M4, and the part that was left was B4's rather than this
rule's; M5 closed it.

What holds: **zero live scopes, zero scheduled effects, zero retained DOM nodes** under any of the
four control-flow primitives. The `<Await>` branch that registered its disposer with the effect node
that resolved the promise — so that disposing the render root never reached it — is gone with the
ten hand-written bodies: `region` in `flow.ts` opens every instance with `enter(given)` and with
nothing else, so an instance is a child of the scope the construct was HANDED and a re-run of the
driving effect cannot take it. `ownership-known-failures.ts` carried this as
`scope-never-disposed@branch` and the row is deleted; that table is now empty. `flow.test.ts` drives
the falsification procedure directly: dispose the root, then write a signal the subtree depended on —
no effect runs and no DOM is written.

What held at M4 and did not: **zero registered listeners**. `dom.ts` registered listeners with a bare
`addEventListener` and nothing removed them. M5's `listen($s, el, type, handler)` pairs the
registration with an `onCleanup` on the scope that owns the element, and the corpus-wide count is now
0 — see B4, which owns that clause and its evidence.

**The leak oracle.** Since M4 the invariant is checkable, which the paragraph above this one said it
was not. `test/leaks.ts` takes five probes from OUTSIDE the runtime, in the same window as the render
and after `dispose()` has returned, and runs all five over the whole corpus:

| probe      | clause                  | how it is observed                                        |
|------------|-------------------------|-----------------------------------------------------------|
| `scope`    | zero live scopes        | the ownership trace: entered inside the window, never disposed |
| `effect`   | zero scheduled effects  | every signal the fixture exports written a value it does not hold, then flushed twice; any traced effect whose run counter moves |
| `listener` | zero registered listeners | `addEventListener` matched against its removal, on every prototype a live target actually inherits from |
| `async`    | zero in-flight continuations | `queueMicrotask`/`setTimeout` scheduled before disposal, counted twice over: one whose callback RAN after it, and one still OUTSTANDING when the window closed. The second is the canonical shape — one timer or fetch in flight at teardown never runs, so a probe that only counts callbacks that fired cannot see it — and `clearTimeout` decrements, so a cancelled timer is not outstanding |
| `node`     | zero retained DOM nodes | a template clone still inside `document`, and a container that is not empty |

The effect probe is the strongest of the five and is worth stating separately: a COUNT of live
effects is not observable — the runtime exposes no registry and `scopeAllocations()` is monotonic —
but an effect that is still subscribed has one behaviour nothing else has, which is that it RUNS.
At M4 the corpus produced **three findings, all `listener`, all B4, all in one fixture**; the four
clauses this rule owns produced none. At M5 it produces **none at all, over 141 sessions**, and
`test/leak-known-failures.ts` is empty — which is what a milestone's completion looks like on a
registry. Its four assertions still run, and `leaks.test.ts` asserts separately that each probe CAN
fire, because a probe that cannot reports the same zero a correct runtime does.

**Pinned by.** `sem-own-render-disposer-disposes.tsx`, and the whole corpus through `test/leaks.ts`.
The ordering half (a) and the cleanup-throw half (c) of the falsification procedure have no
compiler-rs channel — neither is observable from emitted code — and are pinned in the runtime by
`packages/core/src/scope.test.ts`. The three names that stood here before — `sem-own-dispose-order`,
`sem-own-dispose-leaves-nothing`, `sem-err-cleanup-throw`, all marked *(new)* — were never written,
and a rule that `HOLDS` may not cite a fixture nobody wrote; B4's row was struck for the same reason
and this one was missed.

### O4 — ambient hygiene *(revised; the original was self-contradictory — see `CODESIGN.md` §11)*

The original O4 said "the only `try/finally` in the system is where a `catch` was already required",
and §7.1's own `provide` is `try { return block(c) } finally { exit(c) }`. The prototype **needed**
the `finally`: without it a throw inside a Block leaves `CURRENT` dangling until a catcher unwinds,
and nothing specified which scope the catcher restores to. O4 is weakened to what is actually true,
and the restoration target is specified.

**O4.1 — restoration is required on both paths.** `CURRENT` MUST be restored to its prior value on
the normal path *and* on the exceptional path. A construct that enters a scope and returns a value
into the caller's expression — `provide`, `boundary`, `dynamic`, and any Block invocation whose result is
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

*O4.5's own falsification procedure, added in M4b's gate round, because §13 recorded this rule as
pinned by "structural (§14)" and a SIGNATURE is not evidence.* `insert` and `setProp` both took a
`Scope`, validated it with `requireScope`, and then opened their render effect under whatever was
ambient — so `insert(A, …)` while B was current put the cleanup on B, `dispose(A)` left the effect
running, and it went on writing into a detached tree. The corpus could not see it: compiled code never
makes `_s$` and `CURRENT` differ, so the argument and the ambient owner are the same object in all 127
fixtures. `sem-own-given-scope-wins` makes them differ — enter A, leave it, enter B, hand A to the
primitive — which is the only arrangement under which the rule is observable at all. Both now run
their body under the scope they were handed, as `branch`, `each`, `boundary` and `portal` have since
M4. One reader is left, and it is registered rather than described: `childToNodes` invokes a children
Block with `getOwner()`, and handing it `s` instead is coupled to O5 — it turns
`sem-own-render-disposer-disposes`'s `control-the-argument-form-reports-that-it-cannot-dispose` red,
because the root then owns a kid and `RENDER_SUBTREE_NOT_OWNED` stops firing. A `null` scope is left
alone on purpose: it names no owner, and forcing `CURRENT` to null makes the effect an orphan that
`enterRoot` then CLAIMS, which relocates ownership rather than deciding it.

*The reader the first round of that work did not look at: the COMPILED path.* `insert` and `setProp`
are runtime entry points, and the compiled element-binding channel emits NEITHER — it emitted a bare
`renderEffect(compute, apply)` taking no scope at all, so attribute, class, style and DOM-property
bindings were owned by whatever was ambient at the call site in 34 of the corpus's fixtures, while the
registry read "closed for `setProp`". `setProp` is the un-compiled dispatcher. Three changes close it,
and each is separately observable:

- `bindEffect(s, compute, apply)` replaces the bare `renderEffect` at the emission, opening under
  `ownedBy(given, …)` the way `insert` and `setProp` already do;
- `block`'s wrapper establishes the handed scope as `CURRENT` for the duration of the call, so the
  argument decides for `useContext`, `onCleanup`, `effect` and every other ambient-reading API in the
  same body — without it a single component handed A while B was ambient put its HOLE under A and its
  CLEANUP under B, because a component call is a plain call and nothing in the calling convention
  made the argument ambient;
- the delegated dispatcher runs a handler under the scope the compiler stapled to the element, rather
  than with `CURRENT === null` — work created in a handler used to be an orphan the next flush
  released, owned by nobody, forever.

The channel that could not see any of this now can: the L2b trace records an `own` event for every
reactive node created, so `blockFindings` holds an effect to the same "at or below the scope this
block was given" test it already applied to a template clone and to a scope. It reported nothing
about effects before, because it recorded none.

**Falsified by.** Throw from a Block under a boundary. After the fallback has rendered: (a)
`getOwner()` at the boundary's call site MUST be the same object it was before the boundary was
called; (b) every cleanup registered by the failed subtree MUST have run; (c) no node built by the
failed subtree may remain in the document; (d) a second, sibling boundary must still catch its own
throw afterwards, which it cannot if `CURRENT` was left dangling.

**Status.** O4.1–O4.2 `VIOLATED`. There is no `CURRENT` restoration on the exceptional path anywhere;
`ErrorBoundary` catches inside a `computed` and never touches the ambient owner.

O4.3 `VIOLATED`. **And `s.catcher` is written but read by nothing**, which is worth saying because it makes O4.3
untestable rather than merely unimplemented. `makeScope` inherits it, `enterRoot` installs the root
catcher, and no site reads it. `scope.test.ts`'s "O4.3: exit restores to the captured prev, not to
the parent" exercises `exit`, not a catcher, so it separates `_prev` from `s.parent` — the half that
`pin` makes observable — and cannot separate either from `getOwner()` at catch time, because no
catching construct exists to do the restoring. The field stays because M4's `boundary` is what reads
it; until then O4.3 has no executable channel and §14 lists it.

O4.4 `PARTIAL`. Its one L1 claim holds — `sem-err-construction-throw`'s
`the-failed-subtree-is-disposed-not-abandoned`, which is clause (b) of the falsification procedure —
and the rest of the rule is not observed. It is now honoured by the one M2 primitive that enters a scope: `provide` disposes its instance
scope on the exceptional path rather than exiting and abandoning it. That is one construct, not the
rule — the rule is about every scope entered after `prev`, and it needs the catcher.

O4.5 `HOLDS` since M12. The `**Status.**` line above is O4.1's and O4.2's; O4.5 is a different
observation and was reading as theirs because it is the last sub-rule marker in the section. `insert`
and `setProp` both run their body under the scope they were HANDED since M4b's gate round, and the
COMPILED element-binding channel does since the M2 gate round; `sem-own-given-scope-wins`'s first
four claims pin that, and the fourth drives the EMISSION rather than a runtime helper the compiled
path never calls.

The last reader closed at M12, with O5, exactly as the coupling predicted — **and the registered
row's DIAGNOSIS was wrong**, which is the part worth keeping. It said `childToNodes` invokes the
Block with `getOwner()`. It does, and that is not the path the claim drives: an array holding a
function goes `insert` → the live-hole effect → `applyInsert` → `normalizeChildToNodes`, and never
reaches `childToNodes` at all. M9 restructured `insert` to make such an array ONE live hole and the
row's text went on describing the shape from before it — a registered row can rot in its reasoning
while its observation stays true, and only re-deriving the path finds it. `normalizeChildToNodes`
takes the scope now and `applyInsert` threads it.

**Pinned by.** `sem-err-current-restored-after-throw.tsx` *(new)*.

### O5 — `render` opens a root and returns a disposer that disposes

**Rule.** `render(block, container) → dispose` MUST: open a root scope; establish that root as a
catcher, so O4.3's "the nearest catching scope always exists" is true by construction; invoke `block`
with the root scope; insert the result; flush. The returned disposer MUST `dispose()` the root scope
(O3, with all of O3.7) **and** remove its range.

**Falsified by.** Render a tree containing an effect. Call the disposer. Write a signal the effect
depends on. If the effect runs, O5 is false.

**Status.** `HOLDS` since M12, for every spelling a compiled module can produce.

**What closed it.** The `block` form has held unconditionally since M2; the already-built ARGUMENT
form held only when no owner was current at the call site, and that gap survived M3 through M11
because the repair is not the runtime's to make: JavaScript evaluates an argument before the call,
so by the time `render` is entered the subtree is built and its ownership is already decided.
`dom.ts` could only warn (`RENDER_SUBTREE_NOT_OWNED`).

The compiler closes it instead. `scope` wraps a bare JSX argument in `render`/`hydrate`'s first
position into `(_s$) => …`, so `render(<Tree/>, host)` and `render((s) => <Tree/>, host)` are ONE
program and the eager form has no compiled spelling left. `bind` records the span — it already
recognised the arrow in that position — and the wrap is the `_ => {}` arm it used to fall through.

**The runtime still accepts a built subtree**, and still warns, because a hand-written or
un-compiled caller can still produce one. That is why `sem-own-render-disposer-disposes` was re-cut
in the same change to drive THREE positions rather than two: the compiled spelling, the hand-written
Block, and a subtree built through a LOCAL — which the wrap does not reach, and which is the only
way left to observe the runtime's argument form. Without the third the two controls about
relocation and the diagnostic would have gone on passing while silently measuring the Block form.

The precondition below is what the ARGUMENT form's behaviour was, and it is kept because that form
still exists at the runtime boundary. It is stated here because the M2 gate found it stated nowhere: `render` opens a root scope,
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
  effect, and a 14–30% slowdown on the DOM rows).
  The window bounds the claim in TIME and **not by provenance**: a module that initialises library
  state and mounts in the same synchronous turn puts that library's ownerless effects on the same
  list, and this root adopts them. That is the price of the bridge and it is only worth paying where
  there is no other owner at all, so **only the already-built form claims** — `render` passes
  `enterRoot(eager)` and `mount` passes `enterRoot(false)`. Pinned by
  `the-block-form-claims-nothing-it-did-not-build`.
- With an **owner current**, those effects are that owner's kids from the instant they exist. No code
  running after the call can separate them from anything else that owner holds: the watermark would
  have to have been taken before the argument was evaluated, and nothing runs there. Ownership is
  RELOCATED, not lost — disposing that owner disposes the subtree, which the fixture asserts as a
  control — but `render`'s own disposer removes only the range, and it emits
  `RENDER_SUBTREE_NOT_OWNED` rather than returning a disposer that quietly disposes nothing.
  Registered as a known failure against O5, green at M3.

`hydrate` was the one shipped caller in this shape and now passes its Block through, so its root owns
what it mounts.

With a Block, `render` does not claim at all: the subtree builds under the root, so there is nothing
for a claim to find and claiming anyway would only relocate somebody else's work. The list itself
survives until M8, because the un-compiled consumers still register ownerless cleanups through the
eager form — pinned in `extra/src/m8-convention.test.ts` — and it goes with the rest of the eager
path then.

**Pinned by.** `sem-own-render-disposer-disposes.tsx` *(new)*.

### O6 — owner and observer are separate ambients, and only the observer must be ambient

**Rule.** `untrack` MUST change the observer and MUST NOT change the owner. `enter`/`exit` MUST change
the owner and MUST NOT change the observer. A cleanup registered inside `untrack` MUST attach to the
same scope it would have attached to outside it.

**Falsified by.** Inside `untrack`, call `onCleanup(f)`; dispose the enclosing scope; `f` MUST run.
Inside `untrack`, read a signal; the enclosing effect MUST NOT re-run when it is written.

**Status.** `HOLDS`. `untrack` changes only the observer, and both directions are now asserted: a cleanup registered inside `untrack` runs when the lexically enclosing scope is disposed, and a signal read inside `untrack` does not re-run the enclosing effect.

**Pinned by.** `sem-react-untrack-keeps-owner.tsx`.

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

**The argument has to DECIDE, not merely be passed.** Scope-first buys "a mistiming is a missing
argument" only if the argument governs the body it is handed to, and until the M2 gate round it
governed only the primitives that take a scope explicitly. Everything else in the same body —
`useContext`, `onCleanup`, `effect`, and the compiled element-binding channel, which emitted a bare
`renderEffect` with no scope — read `CURRENT`, and a component call is a plain call that establishes
nothing. Handed A while B was ambient, ONE component put its hole under A and its context read and
its cleanup under B. `block`'s wrapper now sets `CURRENT` to the scope it was handed for the duration
of the call: one closure per definition site, none per activation, and the argument decides for every
ambient-reading API at once. `null` is left alone, for the reason O4.5 gives — it names no owner, so
there is nothing for the argument to win.

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

C3.1–C3.5 `VIOLATED`, which is the last observation taken and not a fresh one. The emission side
moved at M3 — the compiler emits no getter anywhere, which is C3.4's precondition — but the five laws
are stated about a props object CROSSING a component boundary, and the acceptance procedure below is
still unrunnable: it needs `packages/core` to hand a component a props object at all. §0.2 makes a
status a claim about an observation, so it stays where the pre-M3 run left it until the procedure can
be run. `sem-props-laziness-conformance` and `sem-props-cell-not-memoised` are the two fixtures that
would run it and neither is written.

C3.6 `HOLDS`: a Cell called with a scope yields what it yields with none.
C3.7 `HOLDS`: a Cell degrades in a Block slot, and the converse is C3.8.
C3.9 `HOLDS`: a forwarded Block is still a Block.
`sem-props-block-in-cell-slot` drives all three.

C3.8 `PARTIAL`. Ten of twelve (shape, slot) pairs take a Block and throw. The two that do not are
registered in `test/known-failures.ts` and are the same shape: a laundered `() => aBlock` carries no
brand, so only the slot's own read can catch it, and `each source` and `provide value` hand the Cell
on by identity rather than reading it at a site. §13 carried this as `H` while a registered
known-failure said otherwise.

**`s === undefined` is not the whole test, and taking it for the whole test left two slots open.**
The rule's own wording is about the ENTRY of a Block invoked with no scope, which makes the guard the
obvious place for it — and at two positions the guard is structurally unreachable, because the value
is invoked with something that is not `undefined`. A `ref` slot invokes it with the **Element** and an
event handler slot with the **Event**; `requireScope` accepts both, the body runs, and everything it
builds is parented to a DOM node that root disposal never reaches — a permanent, silent leak, measured
before the test existed. The brand is a property of the VALUE, so the refusal belongs at the READ, the
way `readSlot` already puts it: `applyRefs`, `listen`, `delegate` and the delegated dispatcher each
test the brand on the value they are about to invoke. The dispatcher is not redundant with the other
three — the compiled path writes `_el$1.$$click = h` itself and never calls `delegate`, so it is the
only place that expando can be seen at all.

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
(existing) for the shapes; `sem-props-block-in-cell-slot.tsx` for (d).

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

1. **Within a module and through NAMED attribute forwards**, the compiler knows the kind of the
   forwarded value and MUST emit a diagnostic at the forwarding site when a value it knows to be a
   scope-using Block is forwarded into a slot the callee declares as `Cell` — naming both positions.
   Two kinds of position are Cell slots and both are diagnosed: a named attribute on an INTRINSIC
   element, and a named Cell slot of a FLOW construct — `For`'s `each`, `Repeat`'s
   `count`/`from`, `Show`/`Match`'s `when`, `Portal`'s `target`, `Loading`'s `on`, `Await`'s
   `resource`, `Reveal`'s `order`/`collapsed`, `Dynamic`'s `component` (`Flow::cell_slot`).

   The bounds, stated in full because a bound nobody wrote down is a bound somebody discovers:
   - a SPREAD on either side ends the chain — `{...rest}` names no key, so the fixpoint has nothing
     to carry the verdict across;
   - only an ATTRIBUTE position contributes evidence: a text child (`{"x" + props.thing}`) does not,
     though a Block reaching one is legal there anyway (C3.7);
   - the read must be `props.thing` at the consuming site — aliasing through a local
     (`const v = props.thing`) is invisible to the pass;
   - a `Ctx.Provider`'s `value` is a Cell slot the runtime refuses, but its tag is a MEMBER
     expression and the callee is not resolved, so it is not diagnosed;
   - and the whole thing is DEV-only, so a production build gets item 2 and nothing else.

   None is a gap in the guarantee — item 2 is total, and the M7 gate measured it firing at the two
   silent positions it checked (`each source` and `provide value`, both `ScopeMissingError`) — but
   all of them bound what item 1 promises, and the promise is bounded here rather than discovered.
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

**Status.** `HOLDS` (M3). `<B x={props.x} />` emits `B(_s$, { x: props.x })`
— the same function object, with no closure minted at the hop — for a member read off a props
parameter, for a binding the analysis proved is an accessor, and for an author-written zero-arity
arrow. C5.2's η-reduction is now universal rather than a whitelist, and one consequence is recorded
here because it removes a channel: a reduced prop used to be evidence that the tag resolved to a flow
component, and it no longer is. The SymbolId discipline it stood for is re-pinned where it is still
observable — a locally-bound `Show` gets no string implementation.

C5.1 `HOLDS`. Both halves: item 1 is `BARQ010` below, item 2 is C3.8's throw, and
`sem-props-block-in-cell-slot`'s two C5.1 claims hold.

**C5.1 item 1 landed in M4b's gate round, as `BARQ010`.** It did not exist before: `diag.rs` listed
eight codes and none of them was about kinds, so both in-module cases — a Block written straight into
a Cell slot, and a Block forwarded one hop through another in-module component into one — compiled
with an empty diagnostic list and threw at run time instead. `analysis::bind` now collects, while the
JSX is still visible, every `(component, prop)` pair the module can PROVE is a Cell slot: `props.x`
read as an attribute on an INTRINSIC element, which is the one position in JSX that lowers to
`_$setProp`. A child position is not one, because C3.7 makes both kinds legal there; an attribute on
a COMPONENT is not one either, because it is a forward, and its verdict is the callee's — which is
computed by a fixpoint over those forwards, so the rule reaches any depth inside the module through
NAMED attributes. A `JSXAttributeItem::SpreadAttribute` contributes no pair, on either side: a
spreading wrapper and a spread at the forwarding site both compile clean, measured, and the runtime
backstop is what fires there. `shape.rs`
raises the code at the forwarding site, naming the slot, the callee and the byte range of the read.
The rule is one-sided by construction: it fires only where the compiler has proof, and its silence is
never a claim that a slot is safe. Item 2 is what answers everywhere else.
 **Pinned by.** `props-raw-forward.tsx` (existing, re-pinned),
`flow-prop-eta-boundary.tsx` (existing), `sem-props-forward-identity.tsx` *(new)*,
`sem-props-block-in-cell-slot.tsx` for item 2 and `docs/BARQ010.md` for item 1.

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

**The emission**, as it is rather than as it was planned. P4 `shape` lowers every JSX child and every
JSX-valued prop to `_$block((_s$) => …)`, and when the body is a compiled unit its `Site` is
retargeted to `ArrowBody` so codegen splices the walk and the patch program straight into the Block —
the shape `CODESIGN.md` §7.1 prints, costing neither an IIFE nor a call. A row callback needs no
wrapping at all: `scope.rs` already gave it the scope parameter, so it IS a Block with a slot
parameter and is forwarded by name.

Two things `CODESIGN.md` §3.0 prints are **not** what is emitted, and both are recorded here rather
than left for a reader to discover. First, §3.0 prints `header={<h1>t</h1>}` crossing as
`header: _tmpl$1` — an arity-0 template passed by name, zero allocation. The compiler emits
`header: _$block((_s$) => _tmpl$1())`, a closure per construction, because the BRAND is what makes
C3.8's guard and C7's counter possible and an arity-0 `template` carries none. The allocation is the
price of the brand and it is paid deliberately. Second, the rule's sentence "an arity-0 `template()`
**is** a legal Block" stays true of the type — C3.7 makes it safe — but nothing the compiler emits
takes that form.

**What the corpus audit actually checks.** `compile.rs`'s
`the_whole_corpus_emits_one_calling_convention_at_both_levels` re-parses every emitted module at both
levels and both backends. It fails on any `children` slot holding a call, a template clone, an array,
an IIFE **or a nullary thunk**, and on any slot of ANY name whose value builds DOM while the props
record is being built. Both widenings are M4b's gate round, and both were forced by the same defect:
`builds_dom` in `shape.rs` was the one kind predicate that did not see through a TypeScript
assertion, so `<Sink>{<b/> as never}</Sink>` emitted `children: () => _tmpl$3() as never` — C6's third
named falsifier, in the slot the audit was pointed at, passing it. The old audit could not see it
twice over: `deferred` accepted every `ArrowFunctionExpression`, and nothing outside `children` was
audited at all. `the_calling_convention_audit_sees_all_four_of_c6s_falsifiers` now asserts each of
the four spellings is SEEN, so the negative claim over the corpus cannot go green by blindness.
 **Pinned by.** `component-children-slot.tsx` (existing, re-pinned),
`sem-own-slot-arguments.tsx` for the slot-parameter half,
`sem-props-cast-keeps-the-brand.tsx` for the assertion wrappers.

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
`each`, `boundary`, `portal`, `provide`, `dynamic` — through mount, one no-op update, one key flip and
one dispose. The counter MUST equal the number of activations, exactly. In particular: a key flip
from A to B to A MUST show A's Block invoked twice (two activations) and a *no-op* write MUST show no
additional invocation (K2).

**Status.** `HOLDS` since M4 for the four consumers that exist — `branch`, `each`, `boundary`,
`portal` — and the counter exists in two places. In the runtime, `flow.ts`'s `invoke` is the ONE
syntactic site any of them invokes a Block from, and it emits `BLOCK_EVALUATED_TWICE` when a Block is
called twice for one activation (behind the diagnostics gate: one boolean load when nothing is
listening). It was `build`, and `build` was not enough: `errorBoundary` hands `region` two Blocks of
its own — the installed content and the recovered fallback — and invoked both DIRECTLY, so the one
bug §4.1 records the old `ErrorBoundary` as having shipped, building its fallback twice, reported
`0 BLOCK_EVALUATED_TWICE` under a mutant that did exactly that. Both arms now go through the counted
call and the mutant is killed by it. In the suite, `flow.test.ts` drives every consumer with an instrumented Block through
mount, a no-op write, a key flip and a dispose, and asserts the count equals the number of
activations — including the two halves the procedure names: a flip A → B → A shows A's Block invoked
twice, and a no-op write shows no additional invocation (K2).

The census caught the other end of the same fact: two fixtures dropped a clone —
`control-flow-error-boundary` 3 → 2 and `control-flow-await-suspense` 4 → 3 — because the old
`ErrorBoundary` built its fallback twice on a construction throw and the old `Suspense` rendered its
fallback twice from a microtask pair that subscribed to nothing. Identical DOM in every frame, one
fewer subtree built and discarded.

M4's oracle work drives the rule's own falsification procedure at the COMPILED level, which is where
the consumers actually are: `test/single-evaluation.test.ts` compiles eighteen fixtures under
`fixtures/l4/`, each carrying an instrumented Block that records its own invocations, and compares
the recorded sequence against the exact sequence the fixture declares. Both directions come free —
too few invocations and too many are both a different array — and the map from C7's consumer list to
the fixture that drives it is asserted TOTAL, so a consumer with no fixture fails rather than going
unmentioned. `provide` and `dynamic` are covered there (`c7-provider`, `c7-reveal`), which is what the
previous paragraph said they were not.

One thing the milestone found and worth writing down: **no sequence of writes against the shipped
primitives can arm the runtime's counter.** Every call site of `invoke` in `flow.ts` bumps `activation`
first — `activate` does, `each`'s mapper does per row, `each`'s fallback does, `portal`'s microtask
does — so `BLOCK_EVALUATED_TWICE` is unreachable from inside the corpus. That is C7 holding, and it
means the zero the corpus reports is not evidence the counter works. What arms it is a mutant:
`test/runtime-mutants.ts`'s `evaluate-a-block-twice` makes `build` invoke its Block twice and the
counter fires, alongside twenty failing conformance rows.

This rule is why Solid needs `children()` — two lazy memos, because `Show` reads `props.children` at
four syntactic sites — and why this design needs nothing.

**Pinned by.** `mm-branch-flip.tsx`, `mm-branch-key-stable.tsx`, `c7-portal.tsx`, `c7-provider.tsx`,
`c7-error-boundary.tsx`, `c7-error-boundary-fallback.tsx`, `c7-await-suspense.tsx`,
`c7-repeat.tsx`, `c7-each-fallback.tsx`, `c7-dynamic.tsx`, `c7-reveal.tsx`,
`c7-loading-errored.tsx` (all under `fixtures/l4/`).

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

### K1 — the default row identity is the item

**Rule.** One list primitive, three modes, and the default is **identity**:

| `keyed` | row identity | the row Block receives |
|---|---|---|
| absent, or `true` | the item itself | `(item, index: Cell)` |
| a function | `keyed(item)` | `(item: Cell, index: Cell)` |
| `false` | the position | `(item: Cell, index)` |

There is no fourth spelling. `Index` was a second component naming the third mode and it is **deleted**
(M7b) — Solid ran `For` and `Index` side by side for five years and removed the second this cycle on
the stated ground that having both "encourages bikeshedding and accidental misuse".

**Why this and not the reverse.** An index default's failure is that a row's DOM state — a caret, a
selection, a scroll offset, `<video>` position, a running animation, an open `<dialog>`, a widget
behind a `ref` — belongs to slot N rather than to the item in it, so a reorder leaves it behind
**silently**. That default was accepted at `CODESIGN.md` §11 Q3 on the strength of a compile-time
diagnostic for stateful row markup, and **the diagnostic cannot carry it**: a component compiles to an
opaque call, so `<For each={xs}>{x => <TodoRow todo={x}/>}</For>` with an `<input>` inside `TodoRow`
produces nothing, and neither do the five non-tag cases above. The mitigation covered inline stateful
tags only — the case a reviewer already catches — so an index default would have shipped a third
silent-failure class on purpose, in a project whose whole argument is that silent failure is the
dominant harm here. Reversed by the user; `CODESIGN.md` §12 Q3 is the record.

**What it costs, with the number.** An immutable update that replaces the row objects rebuilds
**every** row, structurally-equal or not. Measured in Chrome by the Tier-2 lane
(`bench:tier2 shapes`, the K1 arm — `mapArray` with a stub mapper, so this is the diffing half alone
and none of the row's DOM):

| `keyed` | rows rebuilt on an immutable replacement | on a reorder |
|---|---|---|
| absent (the default) | **1000 of 1000** — 0.065 ms | 0 — 0.050 ms |
| `r => r.id` | 0 — 0.015 ms | 0 — 0.045 ms |
| `false` | 0 — 0.015 ms | 0 — 0.015 ms |

4.3x on the mapping half at 1,000 rows, and that is the cheap half: with each row's DOM attached, the
default turns "replace all rows" into a full re-mount, which the same lane's js-framework-benchmark
row prices at **31.6 ms per 1,000 rows** against ~0 for the other two modes. The reorder column is
where the default earns it: all three modes rebuild nothing, and only the default moves the row's DOM
state with its item.

That cost is **visible** — the rows flicker, the profile shows the work — and `keyed={r => r.id}` is
the opt-out that keeps the row across a replacement. A visible cost traded for a silent one is the
whole of this decision, and the trade is only legible with both numbers written down.

**Falsified by.** Three procedures, each of which must observe an UPDATE, because the first frame is
identical under all three modes — which is exactly how 110 fixtures missed the `keyed={fn}` miscompile:

 1. `<For each={rows}>` with no `keyed`; type into an `<input>` in each row, then reorder the SAME row
    objects. Every row's nodes MUST be the same objects, in their items' new positions, and the typed
    text MUST have travelled with the item.
 2. The same list, with `rows` replaced by a structurally-equal array of FRESH objects. No row's nodes
    may survive. A survivor means the runtime is comparing something other than the item, and
    `{row.text}` — applied once, with no thunk (O3) — would be stale.
 3. The same list under `keyed={false}`, reordered. The nodes MUST stay put and the values MUST move
    through them; the typed text stays at its slot. (This is K3's half.)

**Status.** `HOLDS` since M7b. The default was already identity in the emission — `keyed` absent lowers
to `each(src, null, row)` and `mapArray` reads `null` as by-item — so what M7b changed is that the
document no longer promises a reversal away from it, `Index` is gone, and the behaviour is pinned by a
procedure that writes to the DOM and then reorders instead of by an initial render.

**Pinned by.** `sem-key-identity-default.tsx` for all three procedures; `control-flow-for.tsx` and
`control-flow-for-keyed-by-item.tsx` for the default's emission (`keyOf` is `null`);
`control-flow-for-keyed-false.tsx`, `control-flow-index.tsx` and `for-unkeyed-rows.tsx` for the
positional mode's; `control-flow-for-keyed-fn.tsx` for the key-function mode's.

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
is the lesser failure — the alternative leaves stateful DOM sitting under the wrong value, which is
silent (K1). A `Show`'s `when` is usually a CONDITION and not an identity: over this corpus it is
`on()`, `visible()`, `open()`, `isPending`, `loading()`, `length > 0`, `!== null`. For a boolean the
two modes are indistinguishable, so the default costs nothing where it is not needed and saves the
subtree where it is.

**What the keyed default cost, measured before it was flipped.** One immutable update to a
still-truthy value:

| default | rebuild | `<input>` node | text the user had typed |
|---|---|---|---|
| keyed | yes | replaced | **destroyed** |
| non-keyed | no | same | survives |

Focus, a caret, a running animation, an open `<dialog>` and a `<video>`'s position go the same way,
and nothing reports any of it. Across the corpus the flip took 407 scopes to 404, 313 clones to 312
and 492 scope entries to 486 with no fixture edited — fewer activations because content that used to
be torn down is not — while effects went 268 to 270, which is the narrowed accessor making the reads
live.

**Falsified by.** Two procedures, both of which must observe an UPDATE, because the first frame is
identical under either mode — the same reason the `keyed={fn}` miscompile hid from 110 fixtures.

 1. `<Show when={user}>` with no `keyed`, containing an `<input>`. Type into it, then set `user` to a
    structurally-different object that is still truthy. The `<input>` MUST be the same node and the
    typed text MUST survive; a read of the accessor MUST show the new value.
 2. The same shape written `keyed`. The node MUST be replaced and the typed text MUST be gone —
    without which "the default preserves" and "nothing ever rebuilds" are the same observation.

**Status.** `HOLDS` since M10. The default was keyed until then, which was inverted from the
reference: `solid-js@2.0.0-rc.0` declares `keyed?: false` as `Show`'s and `Match`'s default overload
and `keyed?: true` as `For`'s, read out of `types/client/flow.d.ts`.

**Pinned by.** `control-flow-show-keyed-false.tsx` — the explicit spelling, which must agree with the
absent one — and `control-flow-show-keyed.tsx`, the arm that opts in, whose five clones are the cost
of asking for it.

### K2 — an unchanged key is a no-op

**Rule.** A row whose key is unchanged MUST NOT be torn down: its scope, its nodes, their identity,
their focus and their listeners all survive a move. A `branch` whose key expression evaluates to an
unchanged value MUST do **nothing** — no teardown, no rebuild, no Block invocation (C7).

**Falsified by.** Metamorphic: write a signal that changes nothing the key depends on; assert every
node in the branch is the same object and the Block's invocation counter did not move. Then reorder a
keyed list; assert the moved row's nodes are the same objects.

**Status.** `HOLDS` since M4. `region` in `flow.ts` compares the key it just read against the
previous one and returns before anything else happens: no teardown, no rebuild, no Block invocation.
`flow.test.ts` writes a signal the key reads five times without moving the key and asserts the
Block's counter did not move. The row half is `mapArray`'s and is unchanged — a row whose key is
unchanged keeps its scope, its nodes and their identity across a move.

The identity-gated re-render is still hand-rolled in ten lines at `router.tsx:1576`; that deletion is
M8's, and it is now a deletion rather than a port.

The falsification procedure this rule names is metamorphic, and since M4 it is run as one:
`test/metamorphic.ts` writes a signal that changes nothing the key depends on and asserts every node
in the branch is the same OBJECT and the Block's counter did not move, then reorders a keyed list and
asserts the moved row's nodes are the same objects. `mm-branch-nonkeyed-truthy` is the fixture the
rule really needs and the one that did not exist before: everywhere else the equality gate on the
`computed` upstream stops the driving effect before the region is reached, so K2's own comparison is
never consulted. With `keyed={false}` the region's `renderEffect` genuinely re-runs on every write
and computes the same key, which makes `region`'s `if (previous !== UNSET && k === previous) return`
the only thing standing between the write and a full rebuild. Deleting that line produces
byte-identical markup — the oracle, the SSR backend and the L3 differential all stay green — and it
is caught, by this channel and by C7's, which is `runtime-mutants.ts`'s
`rebuild-on-an-unchanged-key` row.

**Pinned by.** `mm-branch-key-stable.tsx`, `mm-branch-nonkeyed-truthy.tsx`, `mm-keyed-move.tsx`,
`mm-index-row-stable.tsx` (all under `fixtures/l4/`), `control-flow-for-keyed-by-item.tsx` (existing).

### K3 — a positional row containing stateful DOM is a compile-time hint

**Rule.** Under `keyed={false}` a row's identity is its POSITION, so DOM state inside the row belongs
to slot N rather than to the item in it and a reorder leaves it behind. When the row Block's **inline**
markup contains `input`, `textarea`, `select`, `video`, `audio`, `details`, `canvas`, `dialog` or a
custom element, the compiler SHOULD say so: `BARQ011`, at note level, under `dev`.

**How weak this claim is, and why it is written that way.** This rule used to be the safety net that
made an index-keyed DEFAULT acceptable. It could never carry that, and K1 is reversed because it could
not. It sees **inline markup only**: a component boundary is opaque, and a scroll offset on a plain
`<div>`, a running animation, an open `<dialog>` reached through a `ref` and a third-party widget are
all invisible to it whatever the tag says. So it is a HINT about a spelling the author asked for by
hand — not a proof, not a gate, and nothing else in this document may rest on it. The rule it is
attached to is K1's third falsification procedure, which observes the state loss itself.

**Falsified by.** Two halves, and they are checked in two places because they are two different
claims. The BEHAVIOUR: a `keyed={false}` list, typed into and then reordered, whose typed text moved
with the item rather than staying at the slot. The HINT: a `<For keyed={false}>` whose row contains an
`<input>` and produces no `BARQ011`, or any `<For>` in the corpus that produces one without asking for
the positional mode.

**Status.** `HOLDS` since M7b. **Pinned by.** `sem-key-identity-default.tsx` for the behaviour;
`diagnostics.test.ts` for the code — its reachability table, and its corpus-wide precision assertion,
which names every fixture in `fixtures/` that emits any diagnostic at all.

### K4 — duplicate keys are a DEV error and degrade to index

**Rule.** Duplicate keys are a DEV error naming both positions. The second and later occurrences are
treated as index-keyed. Rendering MUST NOT be abandoned and rows MUST NOT be silently dropped.

**Falsified by.** A list with two rows sharing a key must render two rows and log one error.

**Status.** `PLANNED` (M4). **Pinned by.** `sem-key-duplicate.tsx` *(new)*.

### K5 — a key expression is plain emitted JavaScript

**Rule.** The runtime never evaluates a condition. `branch` receives a `Cell<K>` computing an integer
key; `Show`, `Switch`/`Match`, ternaries, `&&`, `Dynamic` and a router `Outlet` all lower onto it.
`Show`, `Switch`, `Match`, `Repeat`, `Dynamic` and `Portal` **cease to exist as components**
and are recognised by `SymbolId` resolved to the framework module — never by name, which is unsound
under shadowing.

**Falsified by.** A locally-shadowed `Show` MUST be treated as a user component, not lowered. An
imported-and-renamed `Show` MUST be lowered.

**Status.** `HOLDS` since M4b, for the resolution discipline (`SymbolId`, not name) and for the
lowering.

`Op::Region { slot, anchor, region }` is the opcode and `passes/flow.rs` is the pass. The
constructs cease to exist as components and become one of the four primitives: `Show` and
`Switch`/`Match` are `branch`, `For`/`Repeat` are `each`, `Loading` and `Errored` are `boundary`,
`Portal` is `portal`. The key is plain emitted JavaScript
in every case — `() => visible() ? 1 : 0` for a `Show` (non-keyed, the default),
`() => visible() || false` for one written `keyed`, `() => a() ? 1 : b() ? 2 : 0` for a
`Switch` over two arms, with a hoisted body table indexed by that integer — and the
`(parent, anchor)` pair is the one the template walk already computed, so the runtime no longer
re-derives an insertion point the compiler knew statically. `optimality.test.ts`'s
`K5 — the thirteen constructs, and the four they lower onto` asserts over the whole corpus that no
lowered construct survives as a call.

**What is NOT lowered, and each refusal is a fact rather than a gap.** `Switch` needs its arms to be
literal `<Match>` elements resolved by `SymbolId`; a mapped list of them is a runtime scan, and
`Match` goes with it because only a `Switch` reads one. `Dynamic` behind a SPREAD is refused because
its unrecognised props are the RESOLVED component's rather than the construct's, so the source list
is not its to read off. `Reveal` is not a region at all — it creates a PROVIDE scope rather than a
range (O1 lists `provide` separately from `branch`) — and lowers to a `reveal` call beside the four.
Every refusal keeps the component call, which reaches the same primitive one adapter frame later;
that direction is always safe and the other never is.

`Await`, `Suspense` and `ErrorBoundary` were refusals here once and are now not constructs at all
(M10): Solid 2.0 ships ten and none of the three is among them.

**One evaluation moved, and it is stated rather than hidden.** A `Show`'s body reads the
`when` Cell a SECOND time, at activation, to tell a truthy value from a falsy one — `branch`
deliberately has no slot argument, and the key ran first in the same synchronous step. It costs one
read per REBUILD, never per key evaluation, and C3.2 licenses it: a Cell is explicitly not
memoised. The adapter wrapped `when` in a `computed`, so a `when` with a side effect or an unstable
value is the one input on which the two paths can disagree.

**The flags are proofs about the key, and both are now emitted.** `STATIC_KEY` is set when the key
EXPRESSION reads nothing reactive — the read, never the prop, because `when={on}` is a `Static`
expression whose read `on()` is not. `NO_SCOPE` is set when every body is a lowered root with an
empty patch program. A property the compiler cannot prove is a zero it never writes, and the runtime
does the work; that direction is always safe and the other never is.

**Pinned by.** `renamed-core-import.tsx`, `signal-alias.tsx` (existing) for the resolution half;
`sem-key-shadowed-flow.tsx` *(new)* for the shadowing half; `control-flow-show.tsx`,
`control-flow-switch-match.tsx`, `control-flow-for*.tsx`, `control-flow-index.tsx`,
`control-flow-repeat.tsx`, `control-flow-errored-loading.tsx`, `portal.tsx` for the lowering,
through their `optimality` declarations; `control-flow-show-static-key.tsx` *(new)* and
`control-flow-switch-static-key.tsx` *(new)* for the flags, which until M4b no fixture in the corpus
could emit at all — every key there reads a signal, so `STATIC_KEY` was provable, never proved, and
measured on a hand-written call. Both new fixtures declare the exact integer (`1`, `3` and `1`), the
corpus-wide flag census in `optimality.test.ts` names every region that ships one, and `bench:flags`
compiles these two fixtures and clears ONE BIT in the emitted integer to get its pair.

**How a declaration is kept from being decoration.** Every fixture whose construct lowers must name
one thing `-Ox` emits that `-O0` does not, and one thing `-O0` emits that `-Ox` does not — asserted
per fixture by `every lowered region names its primitive and the frame it replaced`. The second half
is the one that rots quietly: the whole corpus carried `absent: ["(Show, {"]`, a call shape no build
has emitted since M3, so every one of them was asserting the absence of something that could not
have been present.

### K6 — each activation of a branch gets a fresh scope and a fresh build

**Rule.** On a key change: dispose the old instance scope (O3, in full), clear its range, `enter` a
fresh child scope, invoke `bodies[k]` under it, insert at the anchor. A hide/show cycle MUST produce
**fresh nodes**, never the same node handed back.

**Falsified by.** Toggle a `Show` off and on; the re-shown nodes MUST NOT be the same objects as
before. Today's emission `Show({ when: on, children: _tmpl$1() })` hands the *same built node* back on
re-mount, which is K6's negation and a leak of DOM identity across activations.

**Status.** `HOLDS` at runtime since M4, for every construct that reaches
`branch`/`each`/`boundary`/`portal`. `region` disposes the old instance scope in full (O3, including
the range removal that takes its nodes out), `enter`s a fresh child of the scope the construct was
given, invokes `bodies[k]` under it exactly once and inserts at the anchor. `flow.test.ts` asserts a
flip A → B → A builds A twice, with the second build a different subtree.

The remaining half is the compiler's and is K5's: while the emission is still
`Show({ when, children: _$block(…) })` the BLOCK is what defers the build, so the "hands the same
node back" failure is gone, but a body written as `<div/>` rather than as a thunk is still a Block
only because M3 made it one.

Since M4 the identity half is asserted directly rather than inferred: `fixtures/l4/mm-branch-flip.tsx`
and `mm-switch-arm.tsx` declare each of their steps `rebuilds`, and the metamorphic channel checks
that in both directions and on two independent observations — no element of the previous frame may
survive into the next one (off the DOM), and at least one scope must have come apart (off the L2b
ownership trace). A hide/show cycle that handed the same node back would satisfy the markup, which is
what every other channel here is a function of.

**Pinned by.** `control-flow-show.tsx` (existing, re-pinned for identity), `mm-branch-flip.tsx`,
`mm-switch-arm.tsx`, `c7-dynamic.tsx` (all under `fixtures/l4/`).

### K7 — no marker comments in client rendering

**Rule.** A range owner receives `(parent, anchor)` from the compiler's template walk. `anchor = null`
means append. Two adjacent dynamic siblings share one empty text node baked into the template. A
client-rendered page MUST contain **zero** framework comment nodes.

**Falsified by.** `createTreeWalker(root, SHOW_COMMENT)` over a rendered page must count 0.

**Status.** `PARTIAL` since M4, and the residue is a claim in this document that cannot be met as
written.

What holds: **zero framework marker PAIRS**. Every control-flow instance used to splice
`<!--Name:n-->` and `<!--/Name:n-->` into its live parent so its `renderEffect` could find its own
range again; the four primitives take `(parent, anchor)` and track the range they own, so the pair is
gone everywhere. Twenty-nine marker-channel snapshots moved, all in that direction, and the SSR
parity test now asserts the two backends agree BYTE FOR BYTE where it used to strip the markers
first. A region the compiler could not hand a parent to carries ONE empty text node as its own
anchor, which is one byte and not a comment.

M4b removed the last of the region-owned anchors on the compiled path. A construct that occupies a
child slot of a template is now an `Op::Region`, so it is handed the `(parent, anchor)` pair the
walk computed and owns no node of its own; the one empty text node `siteFor` mints survives only
where the compiler cannot name a parent — a construct that is a whole component body, a prop value,
or nested inside a larger hole expression — and on the un-compiled path, which is what the two
`marker-count`/`effect-runs` rows in `oracle-known-failures.ts` now record.

What does not hold: a `<!---->` still separates two adjacent dynamic siblings, because
`passes/anchor.rs` materialises one. §3.4 says these should be "one empty text node baked into the
template", and an empty text node cannot be baked into template HTML — `innerHTML` does not
materialise one. Either the anchor becomes a non-empty text node (a byte of content, visible in the
DOM) or it stays a comment. That is a design question this milestone did not have the standing to
answer, and until it is answered `createTreeWalker(root, SHOW_COMMENT)` counts more than 0 on a page
with adjacent dynamic siblings.

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
| 1 | **Block invocation** (construction) | the boundary the Block is invoked *inside* | `HOLDS` *(M3)* |
| 2 | **component body** | the boundary enclosing its position | `VIOLATED` *(new)* |
| 3 | **computed evaluation** | the boundary of the scope that created the computed | `HOLDS` *(new)* |
| 4 | **effect body** | the boundary of the scope that created the effect | `HOLDS` *(new)* |
| 5 | **cleanup** | the disposing scope's catcher; does not abort the rest (O3.6) | `VIOLATED` *(new)* |
| 6 | **event handler** | the boundary owning the *element*, via the scope stored beside the handler | `HOLDS` *(M5)* |
| 7 | **ref callback** | the boundary owning the element | `VIOLATED` *(new)* |
| 8 | **async continuation** | the boundary of the scope that created the resource, if `gen` still matches | `VIOLATED` *(new)* |

**E2.1 — construction throws land inside the boundary.** A boundary enters its scope, installs the
catcher, and **then** invokes the content Block inside a `try`. The child therefore throws *inside*
the boundary, not at its call site.

**Falsified by.** `<Errored fallback={…}><Boom/></Errored>` where `Boom` throws during construction:
the fallback MUST render. *Before M3*: `Errored({ fallback: (e) => _tmpl$2(), children: Boom({}) })`
— `Boom({})` was an argument and threw *before the boundary existed*, so the throw escaped to the
caller and the page died. Since M3 the emission is `_$boundary(_s$, …, _$block((_s$) => Boom(_s$, {})))`
and the fallback renders.

**E2.2 — a handler throw is the framework's problem.** A handler is code the framework invoked, so the
framework owns its failure. The delegated dispatcher stores the owning scope alongside the handler —
one `$$s` expando per ELEMENT, beside the `$$<type>` the protocol already had — and routes a throw to
the nearest `ERROR_BOUNDARY` on that scope's chain. A listener the element owns routes the same way,
inside `listen`, so neither registration can be given one behaviour and the other another.

Entry 6 reads `HOLDS` from M5. Before it, `dom.ts`'s dispatcher had no `try` at all and a
non-delegated handler was a bare `addEventListener`, so an exception escaped to `window.onerror` with
no framework involvement and a boundary standing directly over the button caught nothing. Entry 7,
the ref callback, is routed by the same `routeError` inside `ref` — and stays `VIOLATED` in the table
above, because no channel observes it and being unobserved is not the same state as being right.

**E2.3 — `NotReadyError` is re-thrown, never captured as an error.** An error boundary MUST pass it
through to the nearest `Loading` boundary. `ErrorBoundary` lacks this check today, so a suspended
subtree under an error boundary renders the error fallback instead of the loading fallback.

**Status.** `PARTIAL`, for the table above rather than for a summary of it: four of the eight entries
are routed — 1 since M3, 3 and 4 since M2, 6 since M5 — and four are not. The three sub-rules carry
their own status, because they moved independently and a single word for the section cannot say which.

E2.1 `HOLDS` since M3. `children` is a Block, so a boundary enters its scope and installs its catcher
before it invokes the content — the throw lands INSIDE the `try`. All five of
`sem-err-construction-throw`'s E2.1 claims hold, across `ErrorBoundary`, `Errored`, `Loading` and the
`Reveal > Loading > Errored` stack, in the DIRECT form with no `{() => …}` wrapper. §13 carried this
as **V** for two milestones after it moved.

E2.2 `HOLDS` since M5. Entry 6 is the one this milestone moved. The delegated dispatcher stores the
owning scope in `$$s` — one expando per ELEMENT — and routes through it; `listen` wraps its handler
in the same `try` and calls `routeError`. M5's repair round found the third registration on this
channel: `spread` bound its non-delegated handlers RAW, so a throw out of one escaped `dispatchEvent`
to `window.onerror` with a boundary standing directly over the element. It now goes through the same
wrapper, and `packages/core/src/dom.test.ts` pins it — the compiler emits no `_$spread(`, so there is
no compiler-rs channel that could.

E2.3 `HOLDS` since M7. `errorBoundary` re-throws `NotReadyError`, and `sem-err-notready-passthrough`
is what now OBSERVES the pass-through: with an `Errored` standing between a pending read and the
`Loading` above it, the loading fallback is what answers and the error fallback never renders, while
the control claim shows the same stack still routes a genuine failure. It read `VIOLATED` for two
milestones on the strength of being unobserved, which is not the same state as being wrong.

**Pinned by.** `sem-err-construction-throw.tsx`, `sem-err-effect-throw.tsx`,
`sem-err-handler-throw.tsx`, `sem-err-ref-throw.tsx`, `sem-err-async-throw.tsx`,
`sem-err-cleanup-throw.tsx` *(all new)*, `sem-err-notready-passthrough.tsx`;
`control-flow-error-boundary.tsx`, `control-flow-errored-loading.tsx` (existing) for entries 3–4;
`packages/core/src/dom.test.ts` for E2.2's `spread` channel.

### E3 — a boundary is a branch plus a try

**Rule.** A boundary is a `branch` keyed on `{content | fallback}` plus a `try`. `reset()` bumps the
key, so recovery is a branch flip and is uniform with all other control flow (K6: fresh scope, fresh
build). A boundary MUST NOT have a bespoke teardown path.

**Falsified by.** After `reset()`, the retried content MUST be freshly built (K6) and its scope MUST
be a new object.

**Status.** `HOLDS` since M4. `boundary(s, parent, anchor, "error", fallback, body)` is the same
`region` driver `branch` uses, keyed on `collector.failed()`, with the content Block invoked inside a
`try` that hands the key of the arm to build instead. There is no teardown path of its own: the
instance scope is disposed by the same code that disposes a `Show`'s. `reset()` clears the collector,
which moves the key back to 0 — a fresh scope and a fresh build, by K6.

One thing the milestone found and the rule did not say: a catcher that only WRITES a signal is at the
mercy of the flush it was called from. A user effect runs synchronously at creation, so an error
raised during the very flush that built the region marks a render effect that has already run, and
nothing consumes the mark. The catcher installed on the instance scope therefore both records and
ACTS — it re-reads the same key expression the effect reads, so there is one decision procedure with
two entry points. Without it the boundary recovered on the second flush and not the first, which is
not a boundary.

**Pinned by.** `control-flow-error-boundary.tsx` (existing, re-pinned).

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
`Show` hands the *same* node back across a remount, which is a different bug, and the default-keyed
`For` replaces rows on an immutable update, which is this one).

`Show` itself left this row at M10. Its default was keyed, so an immutable update to a still-truthy
`when` rebuilt the content — measured: a new object replaced the `<input>` and destroyed what the
user had typed into it. The default is non-keyed now, which is Solid 2.0's, and the content survives
a value change. `For` keeps the identity default and keeps the row: a list row is identified by its
data, so rebuilding it is the lesser of the two failures (K1).

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

**Status.** `HOLDS` (component bodies run untracked); asserted in both halves — the body does not re-run on a write to a signal it read, and the markup that read produced does not move. **Pinned by.**
`sem-react-component-body-untracked.tsx`.

### R2 — reactivity is exited in exactly three places

**Rule.** Tracking is left by `untrack`, by `peek`, and **structurally** by the apply phase of every
element effect. The apply phase runs untracked, so a DOM read there can never become a dependency.

**Falsified by.** Read `el.offsetWidth` in an apply phase; the effect MUST NOT acquire a dependency,
and no layout-read feedback loop may form.

**Status.** `HOLDS` since M5. `untrack`/`peek` were already exits; the structural one is the fused
compute/apply split (B2). `recompute` runs the apply with `tracking = false` and `currentObserver =
null`, and the compiler emits the two halves as two separate functions, so there is no discipline to
keep: the second argument is not a tracking scope and cannot be made into one at a call site.

The falsification the rule states — read `el.offsetWidth` in an apply and check for a dependency —
cannot discriminate, because no DOM property is reactive and a tracked apply looks exactly like an
untracked one through one. The fixture reaches a SIGNAL from inside the apply instead, the only way a
channel can: `setAttr` coerces with `String(value)`, and the value is an object whose `toString` reads
it. Writing that signal must not re-run the effect, and a third claim asserts the COMPUTE still
subscribes, so "no dependency" cannot be satisfied by a dead effect.

`bindProp` — the un-compiled path's element effect — was split the same way in the same change. Two
element effects that disagreed about what an element effect depends on would be a divergence no DOM
comparison could show until something inside a channel started reading.

**Pinned by.** `sem-react-apply-is-untracked.tsx`.

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

**Status.** `HOLDS`. R4 is O6 restated and takes O6's observation: both directions are asserted by
`sem-react-untrack-keeps-owner`.

**Pinned by.** `sem-react-untrack-keeps-owner.tsx`.

### R5 — the epoch write-dedupe and `markWave` are load-bearing

**Rule.** N writes between two flushes cost O(1) marking. This is not an optimisation to be
re-litigated: ablated at **2.37x** on "100 writes + 1 flush", the case barq currently wins 3.21x —
without it that win becomes ~1.35x. `markWave` is ablated at +7% on two of four cases, −2% on one:
**keep**, contrary to all three submitted designs, and re-measure after the Scope split.

**Extended at M7c.** The same epoch decides when a wave OPENS, not only when a write skips: while
`markEpoch` is unchanged no mark has been consumed anywhere, so every node the current wave visited
still carries what it was given and a later write in the same batch stops at it. Four writes in one
batch cost one traversal, not four. See R8 for the marking invariant this rests on.

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

**Pinned by.** `signal-object.tsx`, `signal-methods-in-handler.tsx` (existing, re-pinned).

### R7 — `linked` is writable derived state that re-seeds

**Rule.** `linked(source, compute, options?)` returns a `Cell` that is WRITABLE. A write holds until
`source` next changes; that change recomputes `compute(source(), previous)` and the write is gone.
`compute` receives the previous value, so "keep the user's choice if the new list still contains it"
is expressible without a second signal to reconcile.

**Falsified by.** The read-copy trap: `useState(props.value)` freezes at the first value it ever saw.
Write, change the source, read — the recomputation MUST win. Write, do NOT change the source, read —
the write MUST win. A framework that only ever does one of the two passes one half and fails the
other, which is why both are claims.

**Status.** `HOLDS` since M7, and it is a NAMING rather than a new mechanism, which is the honest
description: `signal(fn)` was already a writable computed with exactly these semantics, and `linked`
is it with the source split out of the closure. The split is the point — as
`signal(() => compute(source()))` the re-seed is an emergent property of whatever the closure happened
to read and nothing names it, so nobody reached for it and the three problems §3.9 lists (the
read-copy trap, controlled inputs, two-way component props) each got their own workaround.

**Pinned by.** `sem-state-linked-reseeds.tsx` *(new)*.

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

**Falsified by.** A recompute that re-walks its transitive closure. That is what `signals.ts` did
until M7c and it made propagation quadratic in depth (F1): 54,439,208 `markNode` calls at 800 layers
against 214,958 at 50 — 253x for a 16x depth increase — while recomputes, validations and heap scans
all stayed linear. **None of it changed a flag.** The marks were already standing, so no correctness
test, no pull-count assertion and no ownership check could see the defect; only counting could. It
cost 55.7x on `cellx1000` and 186.6x on `cellx2500` and was invisible to eleven Tier-1 cases whose
deepest chain was five.

**Status.** `HOLDS` since M7c. Audited by re-walking the skipped closure and asserting every node in
it was already marked: 1,514,926,568 edges over kairo + cellx + sBench, 0 violations. The
clean-subscriber fallback fired 3,018,616 times in the same run, so it is reachable and load-bearing.

**Pinned by.** `signals.test.ts` "propagation cost in graph depth" — which fails on the pre-fix build
— the twelfth case of `eleven-cases.ts` (`chain(500)`), and the `__jrbDepth` sweep in
`packages/benchmark/src/tier2/jrb.ts`. Benchmark, not fixture (§14).

---

## 9. B — Bindings, events and refs (DOM backend)

Derived rules. `CODESIGN.md` §6 does not name this section, but `class={s()}` being a one-shot write
on the same element where `id={s()}` is live is a shipped defect with five hand-written workarounds in
`extra` and `kitchen-sink`, and a specification that cannot name it is not doing its job.

### B1 — every binding on an element is equally live

**Rule.** Two bindings written the same way on the same element MUST have the same liveness. There is
no attribute name for which a reactive expression silently becomes a one-shot write.

**Falsified by.** `<b class={s()} id={s()} title={s()} />`; write `s`; **all three** must change.

**Status.** `HOLDS` since M5. `NameFlags::STATEFUL_DIFF` — the flag whose early return in `classify`
refused to make an intercepted name live at all — **is deleted**, and the four names it covered now
resolve to a channel that threads its APPLIED value through the fused record (`Diff::Thread`, B2). A
name no longer decides liveness; the analysis does, for every name alike.

Two mutation rows stand behind it rather than a green run. `fuse-merges-class-without-threading-its-
applied-value` downgrades those channels to the plain `!==` guard, which is the M4 defect exactly: it
**survives L3**, because P2 `classify` is shared by both levels and all three backends, and is killed
by the absolute front-end probe in `optimisation.test.ts`. `channel-drops-its-resolution` collapses
every channel onto `setAttr` and is killed by the generator.

**Pinned by.** `equal-liveness.tsx` (the rule's own spelling, three BARE reads — the shape where the
compiler's auto-thunking, not the author's closure, has to treat the names alike),
`class-with-live-siblings.tsx` (the explicit-thunk shape, re-cut: it asserted the exclusion and now
asserts its absence), `class-owns-only-its-tokens.tsx`.

### B2 — one fused effect per element, with a compiler-allocated prev record

**Rule.** All of an element's reactive bindings compute into one flat record and apply by field
comparison. The previous-value store is the compute's own return value: no runtime-allocated object,
no per-element expando. `class`, `style` and `classList` are members of that record like any other.

**Falsified by.** Count effects per element with N reactive bindings: it MUST be 1, not N.

**Status.** `HOLDS` since M5. The emitted shape is

```js
_$renderEffect(() => ({ a: tone(), b: label(), c: label() }), (_v$, _p$ = {}) => {
  _v$.a = _$setClass(_el$1, "class", _v$.a, _p$.a);
  if (_v$.b !== _p$.b) _$setAttr(_el$1, "title", _v$.b);
  if (_v$.c !== _p$.c) _$setAttr(_el$1, "id", _v$.c);
});
```

and four things follow from it, each of which is why the shape is that one.

- **The apply cannot subscribe.** It is the second argument, and `recompute` runs it with `tracking`
  off. R2, and the property that removes a bug class rather than a bug.
- **The prev store is the compute's own return.** Nothing is allocated by the runtime and no expando
  is stamped on the element. A channel whose applied form differs from its input writes that form back
  into the same slot, which is how `class`, `style`, `classList` and `dangerouslySetInnerHTML` keep
  the REMOVAL half of their diff inside a shared effect — the thing `STATEFUL_DIFF` existed to protect
  and the reason B1 was violated.
- **The fields are POSITIONAL.** `__proto__` as a record key would write through `Object.prototype`'s
  setter instead of creating an own slot, and every other guard in the group would then compare
  against a value that was never stored. That was a special case in `classify`; it is now not a case.
- **A fused effect never returns a function.** A one-argument effect registers its return as the
  cleanup. The compute returns an object literal, which cannot be one, and the apply's block body
  returns nothing. `fuse-returns-a-function-instead-of-the-record` is the mutation, killed by the
  generator and by the corpus differential.

One live prop needs no record at all: its previous value is a scalar and the compute returns it
directly (`_$renderEffect(() => count(), (_v$, _p$) => { if (_v$ !== _p$) … })`).

**Measured.** Over the 123 fixtures shared with M4b the emitted module total went **204,469 → 203,387
bytes (−0.53%)** — the positional keys and the deleted accumulator plumbing more than pay for the
second arrow. Compile stayed at **0.0342–0.0350 ms/typical file** against a 1 ms budget.

**Pinned by.** `multi-prop-one-element.tsx`, `reactive-attribute.tsx`, `class-with-live-siblings.tsx`,
`equal-liveness.tsx` (all re-cut), `sem-react-apply-is-untracked.tsx`.

### B3 — `ref` is not a prop

**Rule.** `<div ref={el}>` with a writable binding MUST emit an assignment `el = _n1`. `ref={fn}` MUST
emit a ref registration drained per M3. `useRef()` and the `{current}` shape are deleted.

**Falsified by.** After render, the `let` binding MUST hold the element. Before M5:
`_$setProp(_el$1, "ref", el)` **reads** the variable and never writes it.

**Status.** `PARTIAL`, and the clauses are named rather than averaged.

- **The channel holds.** `ref` is `Op::Ref`, not a prop: a writable binding lowers to `box = _el$1`
  and every other shape to `_$ref($s, _el$1, value)`, which owns the cleanup a callback returns and
  routes a callback throw to the boundary. The name never reaches the runtime as a question.
- **The draining does not.** M3 wants refs drained after insertion, children before parents; they
  still run inline, at the position, during construction. That is M3's row and it is untouched here.
- **`useRef()` and `{current}` are not deleted.** `CODESIGN.md` §4.1 schedules that with
  `createElement` at M9, and `_$ref` accepts the object and the array forms so nothing that works
  today stops working. Deleting them now would delete a fixture, which this project does not do.

**Pinned by.** `ref-writable-binding.tsx` (the assignment half, declared as a compiler win because a
props object has nothing to assign to), `ref-binding.tsx`, `ref-on-component.tsx` (existing,
re-pinned).

### B4 — a listener dies with its position

**Rule.** Every listener registers a cleanup on the owning scope. Removal costs zero bookkeeping and
cannot be forgotten. Handler identity is bound once by default; `on:click={cell}` is the explicit live
form.

**Falsified by.** The leak oracle: registered-listener count after `dispose()` MUST be 0. Today only
`spread` removes listeners.

**Status.** `HOLDS` since M5, and the word was premature until M5's repair round: the paragraph below
used to say "there is no call site that could" forget removal, and there was one.

`listen($s, el, type, handler)` is the only way the COMPILED path binds a non-delegated handler, and
it pairs `addEventListener` with an `onCleanup` on the scope that owns the element. `test/leaks.ts`
takes the count the rule asks for across the whole corpus: **0 outstanding listeners over 141
sessions**, against 3 at M4. `test/leak-known-failures.ts` is now empty, and its four assertions still
run — an unregistered leak is still a suite failure, which is the half that matters when a table has
no rows.

**The corpus is not the whole runtime, and this rule is unqualified.** `spread` in `dom.ts` bound its
non-delegated listeners with a bare `addEventListener` and recorded them in a local map consulted only
when a prop CHANGED or VANISHED — never at disposal — so a listener registered through a spread was
still registered after `dispose()` returned and its handler still fired. The corpus could not see it:
`codegen/dom.rs` refuses to lower an element carrying a spread onto the template path, so the compiler
emits no `_$spread(` and the leak oracle's listener probe had no subject on the one path that leaked.
Fixed by owning the removal — one `onCleanup` per (element, event name) on the scope `spread` was
given, registered the first time that name binds so a prop that changes ten times does not accumulate
ten cleanups — and pinned in `packages/core/src/dom.test.ts`, which is the honest place for it while
the compiler refuses spreads. `test/runtime-mutants.ts` now carries `listen-registers-no-cleanup`, so
the shape has a mutation as well as an observation.

The rule was NOT deregistered on the strength of a green probe. `leaks.test.ts` asserts, in the same
row, that every non-delegated listener the corpus registers was matched to its removal *and* that the
corpus registers listeners at all — a probe that stopped discriminating would report the same zero.

Delegated handlers are deliberately not counted and are not a leak: one `document` listener per event
type is module state for the whole process, installed by `delegateEvents` and removed by
`clearDelegatedEvents`, and B4 is about the listener a POSITION owns.

What is NOT claimed: the second sentence of the rule. Handler identity is bound once by default, which
holds; `on:click={cell}` as the explicit live form is not implemented, and `on:` today takes a
verbatim event name and a handler like any other.

**Pinned by.** `delegated-event.tsx`, `non-delegated-event.tsx` (existing, re-pinned),
`ref-cleanup.tsx` *(new — a ref callback returning an undo that removes a listener, the shape no
fixture had and the one `ref-drops-its-cleanup` walked through)*, `packages/core/src/dom.test.ts` for
the `spread` channel, and the whole corpus through `test/leaks.ts` — which is the pin that matters, because the rule is a count over every
fixture rather than a claim about one. `sem-own-dispose-leaves-nothing.tsx` was named here while the
rule was violated and is struck off: it was never written, and a rule that HOLDS may not cite a
fixture nobody wrote.

### B5 — property-vs-attribute is a stated rule with an explicit override

**Rule.** Known HTML attribute → attribute; else if the property exists on the prototype chain →
property; else attribute. `prop:` / `attr:` / `bool:` force it. `on:` takes verbatim names with no
lowercasing.

**Falsified by.** `<my-grid rows={arr}>` MUST NOT become `setAttribute("rows", "[object Object]")`.

**Status.** `PARTIAL` since M5, and the two halves are different kinds of claim.

- **The override holds.** `prop:` / `attr:` / `bool:` / `style:` force the channel, `on:` takes a
  verbatim event name with no lowercasing, and `bind:` resolves its property and its reporting event
  from the tag and the `type` attribute. Every one of them is decided at P1 and emitted as a distinct
  runtime entry point, so `<my-grid prop:rows={n}>` writes the property and nothing classifies a name
  at run time. `attribute-namespaces.tsx` reads the property back into an attribute, because a
  property write is otherwise invisible to a DOM comparison — which is exactly why nothing could see
  this before.
- **The DEFAULT is still the eleven-name table.** "Known HTML attribute → attribute; else if the
  property exists on the prototype chain → property; else attribute" is a prototype probe, and the
  compiler still answers it from `DOM_PROPS`. So `<my-grid rows={arr}>` without a prefix is still an
  attribute write. What M5 delivers is the thing that makes the hole CLOSEABLE by the author; making
  the default right needs the per-element attribute tables §3.12 asks for, and those are not here.

**Pinned by.** `attribute-namespaces.tsx`, `bind-value-channel.tsx`, `custom-elements.tsx`,
`property-attrs.tsx`, `dom-prop-static-value.tsx`.

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

**Status.** `HOLDS` since M7, and the two halves are separate mechanisms because they fail
separately.

- **The compare.** `Chan::Live` is a channel of its own, resolved at P1 from the tag and the name out
  of `USER_MUTABLE_PROPS` — a table `build.rs` reads out of `dom.ts` like every other, so the compiled
  and un-compiled paths cannot drift about which names it covers. It is always `Diff::Always`: the
  record's cached guard is exactly the compare this channel replaces, so leaving it in front would
  suppress the repair. The emitted shape loses the `if`:

  ```js
  _$bindEffect(_s$, () => text(), (_v$) => { _$setLive(_el$2, "value", _v$); });
  ```

- **The re-assertion.** A DOM-compare alone cannot repair a rejected keystroke and it is worth being
  exact about why: when the setter rejects, the signal does not change, so the effect never re-runs
  and no comparison of any kind gets the chance to run. `bindValue`'s listener therefore writes the
  signal's value back after `set` returns — inside the same event, before paint, so there is no flash
  of the rejected character — and that write is a no-op whenever the DOM already agrees. It repeats
  once at the next flush through a counter every two-way binding reads, because the scheduler's
  (correct) dedupe cannot see that the DOM moved while the signal came back to the value it already
  held. The counter is keyed by the BOUND SIGNAL, not module-wide: every element that can be in the
  unseen `(signal, element)` pair is bound to that signal — a radio group is N elements behind one —
  so a module-wide counter would re-run every two-way binding in the application on every keystroke
  for no reachable case.

`coerceLive` is part of the compare rather than a nicety: `input.value` is
`[LegacyNullToEmptyString] DOMString`, so `value={null}` must compare against `""`, and an empty
`<input type="number">` reads `valueAsNumber === NaN`, where `!==` would write on every run and clear
the field the user is typing into.

What is NOT claimed, found by writing `bind-family.tsx` and left rather than papered over: the
STRING backend drops the `value` attribute of every `<input>`. `ssr.ts`'s `DIRTY_VALUE` is keyed by
TAG, while the HTML spec puts the `value` IDL attribute in "default/on" mode for `checkbox` and
`radio`, where it reflects — so a server-rendered radio group ships with no values and the client
builds one that has them. It is pre-existing, it needs the input TYPE threaded through the `attr`
ABI, and `bind:group` is therefore driven under `fixtures/semantics/` rather than in the SSR corpus.

**Pinned by.** `sem-form-dom-compare.tsx` *(new)*, `bind-family.tsx` *(new)*, `property-attrs.tsx`,
`dom-prop-static-value.tsx` (re-cut onto the channel), and `tables.test.ts`'s per-pair row.

### B7 — a write preserves the selection and the focus

**Rule.** A write that LANDS on a focused text control MUST restore `selectionStart`, `selectionEnd`
and `selectionDirection`, clamped to the text that is now there, and the element MUST still be the
document's `activeElement` when the write returns. A contenteditable's caret is preserved by TEXT
OFFSET, so it survives the replacement of the text node it was in.

**Falsified by.** Focus an input, type, select a range inside it, then set the bound signal **from
elsewhere**. `selectionStart` and `selectionEnd` MUST both survive. Without it `element.value = x`
moves the text entry cursor to the end of the control (HTML §4.10.5.5) and the range is gone.

**Status.** `HOLDS` since M7.

This project has shipped this exact failure once already — replace-based hydration lost focus and
discarded typed input at every page size — and it was found by MEASURING rather than by testing,
which is why the acceptance evidence here is a real browser typing real keystrokes through CDP
(`test/browser-caret-check.ts`) and not only a `dispatchEvent` in happy-dom. The two channels ask
different questions and both are kept: happy-dom pins the arithmetic (which offsets, clamped how),
Chrome pins that the arithmetic is about the right thing.

What is NOT claimed: `<select multiple>` has no option-loop coercion, so `bind:value` on one binds
the single-selection `value` property. §3.10.3's fourth clause is unbuilt and is named here rather
than left to be discovered.

**Pinned by.** `sem-form-selection-preserved.tsx` *(new)*, `test/browser-caret-check.ts` *(new, the
real-browser channel)*.

### B8 — `action` on a `<form>` is decided by the SLOT, not by the value's shape

**Rule.** `action` on a `<form>` is the form's URL when it holds a string and its SUBMIT HANDLER when
it holds a function. The handler MUST NOT be called to obtain an attribute, MUST NOT be serialised
into the target, and MUST run on submit with the form's `FormData` — including the submitter's own
name and value — with the browser's default navigation prevented. The listener is owned by the
position (B4). A literal URL MUST still fold into the template bytes, and `action` on any other
element MUST stay the attribute it always was.

This is §3.5's handler-channel rule, which the runtime cannot apply for itself: an `action()` is
`(...args) => Promise<R>`, so its arity is 0 and §3.0 rule 1 reads it as a Cell. Nothing about the
expression separates a Cell yielding a URL from a handler. The SLOT is the only thing that can.

**Falsified by.** Render `<form action={fn}>` and observe TWO things before any interaction: `fn`
MUST NOT have been called, and `getAttribute("action")` MUST be null. Then submit: `fn` MUST receive
a `FormData` carrying the form's fields, and `location` MUST NOT change.

**Status.** `HOLDS` since M10, and it did not before — this is a defect that shipped, not a gap that
was left. `action` went down the attribute channel, so `bindProp` applied §3.0 rule 1 to the
function, CALLED it at mount, and wrote the promise it returned into the form's target:

```
action ran at mount:  ["RAN"]
action attribute:     "[object Promise]"
```

Both halves silent — no console error, and a form whose target is a relative URL named after a
promise. It is `ERGONOMICS`'s dominant harm exactly: the value crossed a boundary and lost its kind.

The string backend writes a URL and writes nothing for a handler, which is stated rather than
averaged: there is no byte on the wire that means client behaviour, so a form submitted before
hydration performs the browser's own default submit. Progressive enhancement would need a
server-generated endpoint per action, which is a routing feature.

**Pinned by.** `sem-form-action-slot.tsx`, whose four claims are the falsification procedure above
plus the CONTROL, and `form-action.tsx`, which is the corpus channel — the emission, the goldens and
the seven modes. `test/leaks.test.ts`'s listener census is where B4 is asserted for the listener this
installs.

---

## 10. A — Async

`CODESIGN.md` §11 Q7 left transitions deliberately underspecified, on the ground that nothing could be
built until three questions about parked subtrees were answered. §12 closed it the other way: the
reference implementation parks nothing, so the questions dissolved rather than being answered, and A5
below is a specification instead of a named gap. This section has no unspecified rules.

### A1 — cancellation is structural

**Rule.** The `AbortController` is a cleanup on the scope that created the resource. Dispose aborts.
A re-run aborts the previous. The signal is **passed to the fetcher**.

**Falsified by.** Dispose during an in-flight fetch; the request must abort.

**Status.** `HOLDS` since M7. The controller is created per RUN and registered as a cleanup on the
scope `resource()` was called under, so disposal aborts it; a re-run aborts the controller it
supersedes before issuing the next request; and `info.signal` is the third argument the fetcher
receives. All four of `sem-async-abort-on-dispose`'s claims hold, including the CONTROL — a request
that had already answered is *not* aborted by a later disposal, without which `aborted` would carry
no information at all. Before M7 the controller was created inside `load()` and handed nowhere, so
"abort" meant "ignore the answer": the request itself ran to completion.

**Pinned by.** `sem-async-abort-on-dispose.tsx`, `async-value.tsx` (existing),
`packages/core/src/async.test.ts` (`A1: cancellation is structural`).

### A2 — staleness is decided by `s.gen` captured at call time

**Rule.** A continuation compares the `gen` it captured at call time against the scope's current `gen`
and drops if they differ. It MUST NOT read a mutable outer variable that by then points at the newest
controller.

**Falsified by.** Start a slow request, start a fast one, let the fast one settle first, then the slow
one; the slow response MUST NOT overwrite the fresh one.

**Status.** `HOLDS` since M7. Two guards, both captured at call time and neither of them a variable a
later request can move: the run's own generation, and the creating scope's `gen`. The old guard read
`abortController.signal.aborted` — by then the NEWEST controller, which is live — so a slow first
answer passed the check and overwrote a fresh second one. `sem-async-stale-response` drives the
out-of-order case deliberately, in both directions (a stale RESOLUTION and a stale REJECTION), and
its third claim is the control that settles the same two requests IN ORDER; without it the rule would
also be satisfied by a framework that believes whatever it was told last, which is the bug.

Those three claims hold through the MEMO, though, not through the guards: a superseded promise is
discarded whatever its continuation writes, so deleting the guard outright left every one of them —
and all 36 rows of `async.test.ts` — green. Measured, in the M7 gate, as
`let-a-stale-response-win | survived everything`. Two more claims OBSERVE the guard itself and are
what make this status a statement about the mechanism: a stale continuation may not retire a
`mutate()` overlay written after it was already superseded, and it may not clear the in-flight
controller, which by then names the LIVE request — clearing it leaves that request outliving the
scope that owns it, which is A1's leak reached through A2's guard. The mutant is now KILLED by
exactly those two.

**Pinned by.** `sem-async-stale-response.tsx`,
`packages/core/src/async.test.ts` (`A2: a response arriving after a newer request was issued never
wins`).

### A3 — `NotReady` is a control signal, not an error

**Rule.** A memo that has not settled throws `NotReady`. A `Loading` boundary catches it; an error
boundary re-throws it (E2.3). It never reaches user error handling.

**Status.** `HOLDS` since M7. The resource's read IS the memo's read, so an unsettled resource throws
the same `NotReadyError` a `createAsync` does and the boundary machinery needs no second status
channel to see it. `sem-err-notready-passthrough` drives a resource under `Errored` under `Loading`:
the loading fallback answers while the read is pending, the content follows when it settles, and the
CONTROL — a genuine failure through the same two boundaries — still reaches the error fallback.

**Pinned by.** `sem-err-notready-passthrough.tsx`, `control-flow-await-suspense.tsx` (existing),
`packages/core/src/async.test.ts` (`A3: NotReady is a control signal`).

### A4 — optimistic state is derived, never restored

**Rule.** `() => reduce(base(), pending())`. There is no snapshot, therefore there is nothing to
clobber. A real write landing during an action is not rolled back.

**Falsified by.** Start an optimistic action; land a real write to the same target mid-flight; settle;
the real write MUST survive.

**Status.** `HOLDS` since M7. `optimistic` is a settled signal, a list of pending layers and a
memo that folds one over the other; an action's writes claim one layer, and completing the action
removes it. Rollback on failure is not a second code path — it is the same removal, which is what
"follows from the derivation" means. `optimisticStore` derives the same way, replaying the
running action's setter calls over the settled store, so the whole-store `structuredClone` that
existed only to be written back is gone.

**Pinned by.** `sem-async-optimistic-derived.tsx`, `optimistic-signal.tsx` (existing,
re-pinned), `packages/core/src/actions.test.ts`.

### A5 — a transition is a lane on an opt-in value, not a fork of the graph

**Rule.** Seven clauses.

**(a) There is no transition API and no second scope.** `startTransition` and `useTransition` do
not exist and are not planned. Nothing forks the reactive graph.

**(b) Nothing is parked.** A `Loading` boundary keeps live DOM mounted showing stale content.
There is no detached-fragment state and no suspended-effect state. The three questions the previous
entry could not answer — what a write to a parked subtree does, whether parked effects are suspended
or merely detached, and what happens when the live scope and a pending transition scope both write
one signal — do not arise, because neither a parked subtree nor a pending scope exists.

**(c) Double buffering is opt-in, per value.** `optimistic` and `optimisticStore`
allocate a second buffer. `signal` does not. A plain signal written inside an action writes straight
through: it does not revert when the action settles and it never reports pending. The restraint is
the design, not an omission from it — making every signal transition-aware would put a second slot
and a mode switch on the hottest object in the runtime to serve the few values that need one.

**(d) Two buffers on one node.** The authoritative buffer is the node's value. The override buffer
holds at most one patch per lane, and a read folds those patches over the authoritative value in
claim order. The buffers live on the NODE rather than in a derivation over two signals; clause (f) says why
they must.

A lane's second write to the same value **composes** over its first rather than replacing it, so
`update(n => n + 1)` twice inside one action is `+2`. The store form has always accumulated this way
— its lane layer is a list of setter calls replayed over the authoritative store — and the value
form agrees with it. A `set` still wins outright: a constant patch ignores the value handed to it.
The two arities disagreeing here is what this clause is written against; before M7b the value form
kept only the last write and the obvious optimistic-increment pattern silently lost one.

**(e) No revert target is stashed, and a lane write is not an authoritative one.** A write from
outside the action lands in the authoritative buffer *underneath* a live override, so nothing is lost
and nothing is overwritten. Retiring the lane drops the override onto a value that is already
correct. Rollback on failure is that same drop rather than a second code path — which is A4's
"derived, never restored" restated at the level of the slot.

The constraint this puts on the action itself is stated rather than hidden: a SYNC generator
**resumes in-context**, so a write made after a `yield` is still a LANE write and retires with the
lane. Writing the server's answer as `value.set(answer)` after the yield therefore reverts to the
pre-action value. `commit(fn)` is the way an action writes authoritatively: it runs `fn` with the
lane suspended, so writes inside it go to the authoritative buffer exactly as they would outside the
action. It is the write-side counterpart of `latest`, which reads that same buffer. A plain `signal`
needs none of this — by clause (c) it was never double-buffered and its post-yield write was always
authoritative.

**And the three shapes `action()` accepts do not agree about this, which is a fact about where a
runtime can put a hook rather than a policy.** The lane is entered around each synchronous segment;
an `await` inside an async function or an async generator resumes on a microtask the lane no longer
spans, because there is no hook inside an async function's own await continuations. So:

| shape | a write after the async gap |
|---|---|
| `function*`, after `yield` | a LANE write — retires, `commit()` required |
| `async function*`, after `await` | AUTHORITATIVE — commits, `commit()` unnecessary |
| `async function`, after `await` | AUTHORITATIVE — commits, `commit()` unnecessary |

`commit()` is a no-op where the lane has already ended, so writing it always is correct in all three
and is what keeps an action's shape a private choice. The reference implementation has the same
asymmetry and documents it as the opposite hazard — for Solid the escape is the surprise, and the
remedy is a bare `yield` before the write to re-enter the transaction, because their default is that
a write *should* be transactional. Neither default is better; what is not acceptable is leaving the
rule stated for "an action" when it is true of one shape in three.

**(f) The read surface is a mode, and a mode is not a dependency.** A normal read sees the
override; `latest(fn)` reads through it to the authoritative value; `isPending(fn)` reports that an
answer is coming.

**Both of them INVOKE their argument, and that is a compiler fact as well as a runtime one.** The
tracked read happens at the call, inside the callee, so a classifier that does not know the callee
sees nothing reactive at the site: `isPending(user)` only REFERENCES the accessor, and
`isPending(() => user())` puts the read in a nested arrow, which is deferred everywhere else —
that deferral is exactly what lets a handler hoist to module scope. Without the rule
`class={{ stale: isPending(user) }}` — the reference's own documented shape — binds BY VALUE and is
applied once at construction, for the life of the page, which violates B1. `Prim::ReadMode` is the
entry that names them, and it is the mirror of `Prim::Untrack`: one says the reads inside do not
happen here, the other says they do. The reference gets the same case right by being CONSERVATIVE —
`@dom-expressions/compiler` treats ANY call in an attribute as dynamic — where barq is precise, so
what is free there has to be declared here. The switch applies **at the node the override lives on** and does not reach through
a derivation: a memo would cache the answer it computed in one mode and serve it in another, and
keying a memo on the read mode would mean a value slot per mode on every computed. This is also why
the buffers cannot be a derivation over a settled signal and a pending-layer signal — that shape has
exactly one mode. `affects()` remains the primitive that deliberately *does* propagate pendingness
through a derivation, and it is unchanged.

The consequence, which is stronger than "the switch does not reach through a derivation" and is
stated because it is observable: **a memo answers in whichever mode first computed it.** Two identical
programs read in opposite orders give opposite answers in both modes — `normal=18, latest=18` against
`latest=2, normal=2` for the same `computed(() => v() * 2)` over an overridden `v`. Neither answer is
a bug in the memo; the memo has one value slot and a read mode is not an input to it. Code that needs
the authoritative value of a derivation reads the node it derives from under `latest`, not the
derivation. `isPending(() => memo())` is correct either way — it reports on the nodes the probe
actually reaches — but the probe itself computes the memo, so it fixes the mode for every later read.

**(g) A lane is an action's lifetime, and lanes never merge.** Two lanes overriding one value stack
in claim order; retiring one leaves the other folding over the current authoritative value; neither
blocks the other. Solid's union-find — which merges lanes when their dependency graphs overlap and
makes an active override a merge barrier so that the merge stops there — answers a question this
design answers by construction. Their transactions are implicit and must be recovered from
reachability; `action()` is explicit and delimits itself, so the lane is known exactly and there is
nothing to infer, merge, or barrier.

**Falsified by.** Nine procedures, one per failure mode.

1. Write an optimistic value inside an action. Before it settles, a normal read MUST give the
   optimistic value and `latest()` MUST give the pre-action value. *(Fails if the override is not a
   distinct buffer.)*
2. While that override is live, land a write from **outside** the action. `latest()` MUST show it
   immediately, and the value remaining after the lane retires MUST be it — not the pre-action value.
   *(Fails if any revert target is stashed; this is the procedure that distinguishes clause (e) from a
   snapshot, and it is the bug A4 was written against, reached one layer lower.)*
3. Run two actions writing two different optimistic values that one memo derives from, and settle
   them out of order. Retiring the first MUST leave `isPending` false on its value and true on the
   other's, and the memo MUST show the first's authoritative value folded with the second's override.
   *(Fails if lanes merge on graph overlap: the first could not then retire alone.)*
4. Write a plain `signal` inside an action. It MUST NOT revert and MUST NOT report pending.
   *(Fails if every signal is transition-aware.)*
5. Read a memo derived from an overridden value. It MUST NOT throw `NotReady`, and a `Loading`
   boundary above it MUST NOT show a fallback. *(Fails if a lane is propagated as a status. A lane
   that set `STATUS_PENDING` downstream would suspend exactly the content the override exists to
   show, which is clause (b) reaching down into the status channel.)*
6. After the action settles, the override slot MUST be released, not merely emptied. *(Fails if the
   rare-read-mode counter is left incremented, which silently moves every signal in the program onto
   the slow read path for the rest of its life.)*
7. Inside a SYNC-generator action, after a `yield`, write the server's answer through `commit()`. It
   MUST survive the lane's retirement. Written WITHOUT `commit()`, the same write MUST NOT survive —
   it is a lane write and the value returns to its pre-action state. Then write the same action as an
   `async function*` and as an `async function`, with a plain `await` in place of the `yield` and no
   `commit()`: in BOTH of those the write MUST survive, because the lane does not span an await
   continuation. *(Fails if there is no way to write authoritatively from inside an action, which is
   the canonical pattern the API exists for: the value reverts and the server's answer is written
   nowhere. Procedure 2 lands its write from OUTSIDE the action and cannot see this. The second half
   fails as a DOCUMENTATION claim: with only the generator arm pinned, the clause reads as a rule
   about actions, and an author applying it to the other two shapes concludes their answer reverts
   when it does not.)*
8. Call `update()` twice on one optimistic value inside one action. The second MUST compose over the
   first, and the store form at the same arity MUST agree. *(Fails if a lane's second write replaces
   its first: the obvious optimistic-increment pattern then silently loses one, and the two arities
   disagree.)*
9. Read a memo over an overridden value under `latest()` FIRST, then normally. Both reads MUST give
   the authoritative answer; run the same program reading normally first and both MUST give the
   override. *(Fails as a documentation claim, not as an implementation one: clause (f) would be
   understated if only one order were pinned, and one order alone reads like the mode reaching
   through the memo.)*

**Status.** `HOLDS` since M7b. What changed, and what did not:

M7 already had the mechanism at two arities without naming it as one. `optimistic` was a
settled signal, a `layers` signal and a memo folding one over the other; `resource` was a memo with a
single `override` signal beside it. The pending-layer list **is** the override buffer, and the
resource's one slot is the degenerate case — so the answer to "does the override slot subsume the
layer list or sit beside it" is neither: they are one mechanism, and M7b unified the storage rather
than adding a second. What M7 could not express is the read mode, and that is what moved the buffer
onto the node (clause (f)).

The resource keeps its slot as a signal beside the memo, and that is correct rather than a leftover:
`mutate()` writes **both** buffers, so all three read modes agree there and no switch is needed. An
authoritative arrival then commits into `settled` and drops the override — the same "already correct"
invariant as clause (e), which is why the resource never needed a revert target either.

Cost, both halves of it. `optimistic` went from three reactive nodes to one. A program with **no
lane in flight** pays the same two branches it paid at M7 — the override sits behind the
`slowSignalRead` global that already gated snapshot capture and `affects()`, and `_override` is `null`
on every node `signal()` creates. While **any lane is in flight**, that global is non-zero, so every
signal read in the program takes the out-of-line slow path, including signals no lane has ever
touched: measured at **1.70x** (2,000,000 reads over 128 unrelated plain signals, 0.74 → 1.25 ns a
read, best of 9 in Bun; it returns to 0.74 ns once the lane retires). The gate is global rather than
per-node because the ordinary read must stay small enough to inline, which is the same trade snapshot
capture already made. An action whose promise never settles pins the program on that path for good:
`completeAction` is the only caller of `retireLane`.

**Pinned by.** `packages/core/src/actions.test.ts` (`A5: overrides, lanes and the read surface`,
sixteen claims, plus the three store-form claims in `optimisticStore`). The compiler side is
`form-action` and `sem-form-action-slot` for B8's slot, and `sem-async-read-mode` and
`read-mode-binding` for clause (f)'s read surface. The forward reference to a
`sem-async-optimistic-lane` fixture is dropped, and the claim it rested on — that A5 is "entirely
runtime behaviour, since there is no transition API to emit" — was half wrong. There is still no
transition API to emit (§12's M11 table enumerates why), and clause (f) is a compiler surface all
the same: `isPending` and `latest` invoke their arguments, and a classifier that does not know it
binds the reference's own documented example by value.

### A6 — reveal ordering is a slot contract, and a nested group is ONE composite slot

**Rule.** Six clauses. Two questions were open before this rule and each is answered by a clause
rather than left implied.

**(a) The coordinator stays a PROVIDE, and the boundary gains an ordering channel. They are not
alternatives.** A `Reveal` creates a provide scope (O1 lists `provide` separately from `branch`;
it owns no range) and publishes one coordinator on it. That provide is how a slot FINDS its group,
and it has to be a context read through the scope chain rather than anything lexical, because a
`<Loading>` three components deep is still in the group (X3, X4). The channel is what a slot must
EXPOSE in order to BE one, and it is on the boundary because the thing registering is no longer
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
under this one — which is how the flat design survived four passing tests.

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

**Status.** `HOLDS` since M11. Before it, `reveal` was a coordinator over a flat list of
`{ settled }` entries and a nested `<Reveal>` simply shadowed the outer's provide, so the outer
never learned the inner existed: procedure 1 measured `[fa]B:2[fc]` where the rule requires
`[fa][fb][fc]`. Three of the four spellings — `flow.ts`'s `reveal`, `components.ts`'s `Reveal` and
both of `ssr.ts`'s — also defaulted the order to `natural` while the `revealOrder` primitive beside
them defaulted to `sequential`, so the same `<Reveal>` meant two things depending on which one the
compiler reached.

**Pinned by.** `sem-reveal-nested-group.tsx` — the seven procedures through compiled JSX —
`packages/core/src/reveal.test.ts` (`Reveal nesting`, six claims, plus the default-order claim), and
`packages/core/src/boundaries.test.ts` for the primitive form. `control-flow-reveal.tsx` and
`l4/c7-reveal.tsx` keep the emission and the activation count.

### A7 — a compute returns a value, ANY thenable, or an async iterable

**Rule.** `computed(fn)`'s `fn` may hand back three things and they are one node at three arities.

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
interval-driven producer keeps running until it next yields. This is A1 (cancellation is structural)
reaching a stream through the only handle it has.

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

**Status.** `HOLDS` since M11. Before it the branch was `newValue instanceof Promise`, so procedures
1–8 all failed: the reference admits `PromiseLike` and `AsyncIterable`
(`core/async.d.ts`'s `handleAsync`, `core/core.d.ts`'s `computed`), and barq admitted neither.

**Pinned by.** `packages/core/src/async-source.test.ts`, whose eight claims are the eight procedures;
restricting the branch to `instanceof Promise` kills all eight, and abandoning the iterator after the
first yield kills the three that observe more than one. `sem-async-stream.tsx` drives a stream
through compiled JSX and a `Loading` boundary, which is the claim procedure 3 makes about the
boundary rather than about the node.

### A8 — commit #0: a node may be born holding a value, and that window closes once

**Rule.** `loadingValue` on a derived node declares a value the node is BORN with, served until the
compute's first real answer lands.

**During the window the node is SETTLED in every observable.** A read does not throw, `isPending` is
false, `latest()` gives the same value a normal read gives, and no `Loading` boundary above it shows
a fallback. Commit #0 answers the question by declaration, so there is nothing to wait on. First-load
affordances come from the value itself — a `null` placeholder, a `skeleton: true` field — rather than
from a boundary.

The mechanism is one omission and not a second state: during the window the node never sets
`STATUS_PENDING`. That flag is what makes a read throw (R1/A3), what a boundary registers on, and
what `isPending` reports, so withholding it gives all three at once. The flight still runs and is
still registered with `settle()`, so a server render still waits for it.

**The window closes on the first ANSWER, whatever the answer is, and never reopens.** A resolved
value, a synchronous value, a rejection and a synchronous throw all end it. After that the node is
ordinary: a refetch shows the stale value, `isPending` is true, and a read throws unless it is under
`latest()`.

**The two states are disjoint**, which is the whole reason the option is worth having and the reason
every procedure below observes the SECOND flight as well as the first. A guard that covers both is
`value.skeleton || isPending(value)`.

| | first flight | every later flight |
|---|---|---|
| a read | commit #0 | THROWS |
| `latest()` | commit #0 | the stale value |
| `isPending` | `false` | `true` |
| a `Loading` above it | content | keeps stale content |

**Commit #0 is also the compute's first `prev`**, so a `prev`-folding compute folds from it rather
than from `undefined`.

**An unready SOURCE during the window is not this node's pendingness.** A synchronous `NotReady`
throw from a dependency leaves commit #0 serving and marks nothing downstream. The read that threw
has already linked the source, so its settle re-runs this node; nothing else is needed.

**The option's PRESENCE opens the window, not its value.** `undefined` is a legal placeholder, so the
test is `"loadingValue" in options`.

**Typed strictly as `T`.** To use `null`, declare it in the node's type —
`computed<User | null>(…, { loadingValue: null })` — so every consumer sees the nullable window
honestly. A placeholder standing in for real data should carry its own provenance rather than
impersonate it.

**Falsified by.** Ten procedures.

1. A node with a `loadingValue` over an unsettled promise. The read MUST give commit #0, `isPending`
   MUST be false and `latest()` MUST agree. *(Fails if the window is a readable kind of pending
   rather than settled.)*
2. Settle it, then invalidate it and start a second flight. The read MUST now THROW, `latest()` MUST
   give the stale value and `isPending` MUST be true. *(Fails if the window never closes — and a node
   that simply never reports pending passes procedure 1 and fails only here, which is why the
   disjoint state has to be observed.)*
3. The same under a `Loading` boundary whose body reads directly. The first frame MUST be content and
   never the fallback; the second flight MUST keep stale content. *(Fails if the window is invisible
   to reads but not to the boundary channel.)*
4. A `prev`-taking compute. The first `prev` MUST be the loading value. *(Fails if the node is born
   `UNINITIALIZED`, which is also what would make `latest()` throw.)*
5. A compute reading an unsettled DEPENDENCY. Commit #0 MUST keep serving and `isPending` MUST be
   false, and the node MUST re-run when the dependency settles. *(Fails if a source's pendingness is
   reported as this node's; the second half fails if the fix is to swallow the throw without keeping
   the link.)*
6. Reject the first flight. The error MUST become the node's. *(Fails if commit #0 covers for a
   failure forever, which turns a broken first load into a permanent skeleton.)*
7. `loadingValue: undefined`, against the same compute with no option at all. The first MUST read
   `undefined` and the second MUST throw. *(Fails on a `!== undefined` test, which would make the
   documented `null`/`undefined` placeholder unreachable.)*
8. A SYNCHRONOUS compute with a `loadingValue`. It MUST close the window on its first run and behave
   ordinarily after. *(Fails if the window survives a compute that was never async, which would make
   the option a permanent pending-suppressor.)*
9. Through `resource`: during the first fetch `loading()` MUST be false and `state()` MUST be
   `"ready"`. *(Fails if the option is reachable only from `computed`, which is not where an
   application declares a skeleton.)*
10. The same resource, refetched after it settled. `state()` MUST be `"refreshing"` and `latest()`
    MUST give the previous value. *(Fails if closing the window is not threaded through the
    resource's own status channel.)*

**Status.** `HOLDS` since M11. Read out of `solid-js@2.0.0-rc.0`'s `signals.d.ts` (`MemoOptions`)
and `@solidjs/signals`' `handleAsync`/`parkLoadingWindow`, not from documentation.

**Pinned by.** `packages/core/src/loading-value.test.ts`, whose ten claims are the ten procedures.
Three mutants were run against it: never closing the window kills procedure 2; publishing
pendingness during the window kills five; and propagating an unready source kills procedure 5.

---

## 11. H — Hydration

### H1 — hydration is claim-based, not replace-based

**Rule.** The client **claims** server-rendered nodes by walking them. It MUST NOT clear the container
and re-render. `container.textContent = ""` throws the entire server render away and is deleted.

**Falsified by.** Node-reuse percentage on a matching render MUST be 100% for every fixture whose
root the template can express, and every fixture that falls short MUST be registered with its exact
reuse. Measured before M6: 0%, everywhere.

**Status.** `HOLDS-with-registry` (M6, re-measured at M7b) — the same status the O family carries,
and for the same reason: the falsification procedure is run over the whole corpus and the shortfalls
are enumerated rather than averaged away. **Pinned by.** the node-identity census over the whole
corpus, run against BOTH settings of §12's detection axis — `test/hydration.test.ts`, with
`test/hydration.ts`'s `HYDRATION_KNOWN` as the registry.

The procedure above is now run for every fixture: the string module's markup is put in a container,
the DOM module is hydrated over it, and the OBJECT IDENTITIES of the container's nodes are compared
before and after. **116 of 131 fixtures reuse 100% of them.** `container.textContent = ""` is gone
from the hydration path — `render` still opens with it, and `mount(block, container, claiming)` is
the one line that decides, so the claim path cannot drift from the path everything else is measured
on. A second pass compiles every fixture `dev` as well and requires the same tree and the same report:
turning detection on may make the client SEE a divergence, never make one.

The 15 that do not are registered in `test/hydration.ts`'s `HYDRATION_KNOWN`, each with its `kinds`,
its `recovered` flag, its EXACT reuse and a reason; a row that starts claiming everything fails the
suite as stale, and an unregistered fixture that diverges fails it outright. They fall into four
groups, all of them structural rather than accidental: the `createElement` path (7 — a subtree the
template cannot express has no walk to claim it with), a construct the flow pass refused reaching its
primitive through an adapter with no flags (3), a boundary that parks its content in a detached
fragment before revealing it (3, and parking a claimed node is a removal), and two channels that
write past the claim (`innerHTML` with a child, and a custom element's property whose server spelling
is an attribute).

**Every `reuse` in that registry MOVED at M7b, and not one fixture changed what it claims.** §12 took
the boundary comments off the wire wherever the client can read a position's extent off its parent,
and the census counts NODES — so a comment that used to sit in the markup and trivially survive was
in the denominator and is not any more. The same subtree lost over a smaller total is a smaller
percentage. One row moved the other way: `control-flow-for-keyed-spread` reaches `each` through an
adapter with no flags, and the recovery that path takes — release what the server wrote here, build
cold — has nothing to release when the position was written with no comments, so the enclosing
`insert` reconciles onto the server's own nodes instead and it now reuses 100%. It stays registered
because it still REPORTS `not-hydratable`; what it stopped doing is throwing nodes away.

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

**Falsified by.** Three procedures, because the rule now has three claims.

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
   un-hydratable one there, raw and gzipped. *(Fails as a claim about the split rather than about the
   page if only the first is measured. Zero is a property of a shape — every hole the sole occupant
   of its element — and a page consisting only of that shape is js-framework-benchmark's table, not
   an ordinary page.)*

**Status.** `HOLDS` (M7b). **Pinned by.** the branch-key comparison and L6's *"a branch index
disagrees"* row, both run against BOTH settings of the axis — `test/hydration-mutations.test.ts`,
whose table is now two tables — plus *"the three wires"* and the payload measurement in
`test/hydration.test.ts`.

`ssr.ts`'s `range` writes `<!--[-->` when the module was compiled `hydratable` and `<!--[k-->` when it
was compiled `dev` as well, from the `HYDRATE` and `DETECT` bits of the same flags integer both
backends take; `flow.ts`'s `reconcileKey` reads whatever is there, and `null` — the production answer
— means claim positionally, which is exactly what a hole has always had. A key with no safe spelling
in a comment (anything outside `[\w.:+-]{0,32}`) is written as `?` and takes the same path.

**Why the key is the ONLY thing that moved onto the detection axis, and what pays for the rest.**
§12 reversed §11 Q4 on a measurement: 55.7% raw and 7.3% gzipped on the 100-row page. The bytes that
went are the ones a client can re-derive, and each of them had an argument that dissolved:

| what | why it needed comments | why it does not |
|---|---|---|
| a hole that owns its parent element | its extent is data | its extent is every child of the parent, and no other index in that parent exists to be disturbed |
| a row of an `each` | the client must hand row `i` its own nodes | the rows are built in ORDER, so a row's extent is what its build consumed from one shared cursor |
| a range that owns its parent element | as the hole above | as the hole above — in production; a `dev` build writes them anyway, because the open comment is the only place a key can live |
| the key `k` | H2's own argument: re-evaluating the condition is unsound | it still is, and the key still buys DETECTION and a bounded blast radius — but that is an argument about development, so it is emitted there |

What survives is load-bearing and each byte is: a hole whose parent holds anything else needs its
OPEN so a dynamic text run does not fuse with the static one beside it and its CLOSE as the anchor
every later write uses; a range whose parent holds anything else needs both for the same two reasons;
a `<!---->` skeleton marker is counted by the logical index on both sides; and `<!--[b:N-->` names a
streamed continuation no walk of the document can discover. A `<pre>`, `<textarea>` or rawtext parent
keeps its hole's comments whatever else is true, because the tokenizer eats a leading newline there
and the OPEN is what stands between it and the server's text.

**Measured, on two 100-row pages, because one of them was not enough.**

| page | build | raw | gzipped |
|---|---|---|---|
| every hole the SOLE OCCUPANT of its element | M6b | `11513 → 17929` (+55.7%) | `997 → 1070` (+7.3%) |
| | production | `11513 → 11513` (+0.0%) | `997 → 997` (+0.0%) |
| | development | `11513 → 11529` (+0.1%) | `997 → 1015` (+1.8%) |
| holes with STATIC SIBLINGS, a `<Show>` per row | production | `13539 → 20439` (**+51.0%**) | `1027 → 1083` (**+5.5%**) |
| | development | `13539 → 20913` (+54.5%) | `1027 → 1119` (+9.0%) |

The zero is **not** a property of the split. It is a property of the first page's shape: every
dynamic value is the only thing in its `<td>`, which is exactly the case the table above says needs
no comments. That page is js-framework-benchmark's table. On an ordinary page — one static character
beside a hole is enough — production pays, and it pays most of what M6b paid: +51.0% raw against
+55.7%, +5.5% gzipped against +7.3%. The corpus says the same thing and always did, in the same test:
`11422 → 12846` bytes, +12.5%.

So the claim that survives the evidence is **"production costs zero where a hole owns its parent's
child list, and carries only the delimiters a parent with other children genuinely needs elsewhere"**
— not "production is byte-identical". What the split bought on a mixed page is the gzipped column
falling by about a quarter and, more to the point, the O(subtree) verification walk leaving the
production client entirely; what it bought on a jfb-shaped page is everything.

**One thing this rule does NOT say: that the server's arm wins.** An earlier draft required exactly
that — "it MUST NOT re-evaluate the condition; the claimed branch MUST be the server's" — and the
implementation has never done it, because it cannot be made sound here. The client's condition is the
one its reactive graph will go on maintaining; a branch kept on the server's arm against the client's
own read has no dependency that will ever repair it, so a condition that never changes again leaves
the wrong arm standing forever. What the key buys is DETECTION and a bounded blast radius, which is
what §11 Q4 paid the bytes for and what §12 moved to the build where they are worth paying. Keeping
the server's arm until the client is seeded is a real design — it needs a seeding barrier that says
when the client's data is complete — and it is not specified, so it is not claimed.

### H3 — elements are claimed by a hydration-only logical index

**Rule.** Elements are claimed by the same compiler walk that drives client rendering, carrying a
hydration-only logical index (`child(n, 3)`). That index MUST cost nothing on the client-render path.

**Falsified by.** Compare emitted client-render code with and without `hydratable`; the non-hydratable
walk must carry no index argument.

**Status.** `HOLDS` (M6). **Pinned by.** the emission diff, `hydratable` on against off, over the
whole corpus — `test/hydration.test.ts`.

Since M7b the index has a companion on the same terms. A hole that owns its parent element's child
list is emitted as `insert(s, el, v, null, WHOLE)`, and the trailing argument is what tells the
runtime the server wrote no comments there rather than letting it guess from what it finds — a
"no `<!--]-->` at the end, so it must be the whole list" reading would turn a corrupted wire into a
silently accepted one, which is the failure the whole file refuses. It costs nothing off the
hydration path for the same reason `child` does: with the flag off, it is not emitted.

The procedure is the test, in both directions: no fixture's ordinary emission mentions `child` or
`sib`, some fixture's `hydratable` emission does, and no fixture's ordinary SSR emission contains a
range comment. A build that emitted the index unconditionally and a build that emitted it never are
both red, and the second is the one a green suite hides.

**What the index IS, and why it is not `.nextSibling` repeated.** The server's child list is the
template's skeleton with a `<!--[-->` … `<!--]-->` range spliced in at every hole. A native sibling
step counts every node in that range; a LOGICAL step counts the whole range as nothing, so the index
the compiler computed against the template addresses the server's document unchanged. It is
`O(children)` rather than `O(hops)` — correctness here is a property of the whole child list, and a
local step cannot see where the ranges are — and it costs nothing off the hydration path, because
with no session live `child` and `sib` ARE the native property they replace.

### H4 — detection is a build axis; a detected mismatch has a local blast radius

**Rule.** On mismatch, **only that range** re-renders. In a **development** build detection is
mandatory and silent divergence is not acceptable. In a **production** build the checks that survive
are the ones the claim was making anyway, and the ones that are not — the O(subtree) comparison
between a claimed subtree and the template that would have been built — are NOT present.
`CODESIGN.md` §12: the wire carries what recovery needs, detection is an emission axis, and silent
failure is an argument about development.

**Falsified by.** Corrupt the wire one way at a time, against BOTH settings of the axis, and for each
corruption record whether it was detected and what the page degraded to. In development, every
corruption that changes a byte MUST be detected. In production, the corruptions that survive MUST be
exactly the ones listed, with the exact tree each produces — a new silent one, or a listed one that
starts being caught, fails.

**Status.** `HOLDS` (M7b) for development, `HOLDS-with-registry` for production. **Pinned by.**
`test/hydration-mutations.test.ts` — twelve corruptions of the wire run through two builds, each with
its detection and its blast radius recorded, plus the two build-level ones (compile without
`hydratable` and hydrate anyway; pair a hydratable server with a non-hydratable client).

**Development: nothing is silent.** All twelve are DETECTED and all twelve degrade to a tree the
client would have built. The radius is `local` where the corruption is local to a range — a branch key
that disagrees, or a server arm that is not the client's: 89% of the page's nodes survive — and `cold`
where it is not (a dropped boundary comment, the container empty, the scaffolding stripped).

**Production: three survive, and they are the same three.** A wrong tag, a missing element and an
extra element, each in the middle of a claimed subtree, are invisible to a production claim, because
the only thing that could see them is the subtree comparison and that is what moved onto the axis.
Each is registered with the exact tree it produces. Everything else on the table is still detected,
including the divergence the branch key used to be the only evidence for: a server arm that is not
the client's fails on the tag the claim lands on, and the region rebuilds its own range.

**Local recovery, generalised — the mechanism that makes the production column tolerable.** Until
M7b exactly one mismatch reached a region's own catcher (a branch key that disagreed) and every other
kind travelled to `hydrate` and cost the page. `flow.ts`'s `activate` now catches `HydrationMismatch`
from the claiming attempt, reports it, releases the server's nodes and rebuilds cold at that
position. It is what turns "production detects the arm structurally" into H4's radius rather than
into a full re-render.

**The check that moved, and what it gained on the way.** An EXTRA element in the middle of a claimed
subtree once survived into the hydrated page silently, because the walk indexes from both ends and a
node inserted between them is invisible to it. `verifySubtree` closes it — a claimed subtree must have
the skeleton its template has — and it now compares static TEXT as well as node names, which is the
compensation §12 owes: an undelimited hole leaves no `<!--]-->` for `claimRange` to assert against,
and two branch arms that differ only in the words they print are structurally identical. An empty
template element is still skipped, because there are three reasons it can be empty (a hole, an
`innerHTML` write, rawtext) and none of them is a skeleton. The whole corpus hydrates identically
with the check on and off, which is the test that a stronger checker did not start inventing
divergences.

**What it bought.** Claiming was 1.4–1.6x more node work than replacing at M6b. With the comment
nodes off the wire and the subtree walk off the production path it is now **1.12–1.31x FASTER** than
replacing at the same four page sizes — measured in the same harness, `test/hydration.test.ts`.

### H5 — the address is the shared artefact and it is process-independent

**Rule.** The shared artefact between the two backends is the compile-time address
`(module, unit, position)`. It MUST be identical for the same source on both backends and across
processes. A process-global counter MUST NOT participate in it.

**Falsified by.** `markerId` today is a process-global that makes the same tree serialise as
`<!--Show:0-->` on the server and `<!--Show:1-->` on the client **in one process**. Compile all
fixtures both ways and diff the address sets: they must be equal.

**Status.** `HOLDS` (M6). **Pinned by.** the address-set diff over the whole corpus —
`test/addresses.test.ts`, the channel §14.2 asked for.

M6 built the table §3.11 specifies and ran the procedure above over all 130 fixtures at both
optimisation levels: the two backends address the same positions, every time. The address carries no
`NodeId` and no counter of any kind — it is `(module, unit index, patch position)`, computed from the
patch program, which is the artefact the two targets share. `markerId` still exists in `markers.ts`
and no longer participates in anything the compiler emits: the string backend writes no marker
comments at all, and `packages/extra`'s router is its last reader (M8).

**What this rule does NOT yet claim.** The address is stable for one build's flags, not across them:
`-O0` addresses a superset of `-Ox`, because P3 fold turns a constant `SetOnce` into template bytes
and bytes have no position to claim. That is measured rather than assumed — the same test pins the
direction — and it is sound for every consumer §5.2 lists, because a server and its client are one
build.

### H6 — interactive state survives hydration

**Rule.** Focus and the value of a user-mutated input MUST survive hydration.

**Falsified by.** Focus an input and type before hydration completes; after hydration, `document.activeElement`
and the input's value must be unchanged.

**Status.** `HOLDS` (M6). **Pinned by.** the focus-and-typed-value pair in `test/hydration.test.ts`,
plus the keystroke replay beside it.

H1's consequence, in the other direction: with the node kept, the state ON it is kept. Three lines do
the work and each closes a measured failure — `insertRendered` does not `appendChild` a root that is
already in the container (the DOM defines that as a removal, and a removal blurs), `insertAt` does not
`insertBefore` a node that is already in position, and `setHtml` skips a write whose bytes are already
there.

The capture snippet is claim-based now: it records the target as a PATH of child indices rather than
as coordinates, so `keydown` and the typed value and the caret position are in the queue at all —
`server.ts` said why they could not be before, and it was H1. A record with no path still replays by
`elementFromPoint`, which is what a RECOVERED page has left.

---

## 12. The acceptance case, answered

> **What must `<Provider><Child/></Provider>` do?**

Source:

```jsx
const Ctx = context();                       // no default → a miss THROWS
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
verified — before `scope` inside `Provider` has created the scope that `owner._context[id]`
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
| O2 | a Block runs under the scope it is given | H | `sem-ctx-provider-direct-child`, `sem-ctx-provider-wrapper-component`, `sem-props-block-in-cell-slot`, `own-provider-direct`, `own-provider-wrapper` |
| O2.1 | a component body runs under the receiving scope, after its bindings | H (M3) | `sem-ctx-provider-direct-child`, `sem-ctx-provider-wrapper-component`, `sem-testing-wrapper-eager`, `own-provider-wrapper` |
| O3.1–3 | disposal order: dead, kids reverse DFS, cleanups LIFO | H | `sem-own-dispose-order` *(new)* |
| O3.4–5 | abort signal, range removal | I/U — O3.5 H | `sem-own-dispose-leaves-nothing` *(new)*, `mm-branch-flip`, `mm-switch-arm` |
| O3.6 | a throwing cleanup does not abort the rest | P — H / **V** | no compiler-rs channel; the half that holds is pinned in packages/core/src/scope.test.ts (§14) |
| O3.7 | the leak invariant | H (M5) | `sem-own-render-disposer-disposes`, the whole corpus through `test/leaks.ts` |
| O4.1–2 | restoration on both paths; the cost claim | **V** | `sem-err-current-restored-after-throw` *(new)* |
| O4.3 | a catcher restores to `prev`, captured before its own `enter` | **V** | `sem-err-current-restored-after-throw` *(new)* |
| O4.4 | no partially-constructed subtree survives a throw | P — one construct | `sem-err-construction-throw` |
| O4.5 | `CURRENT` never decides ownership | **H** (M12) | `sem-own-given-scope-wins`, structural (§14) |
| O5 | `render` opens a root; the disposer disposes | **H** (M12) | `sem-own-render-disposer-disposes` |
| O6 | owner and observer are separate | H | `sem-react-untrack-keeps-owner` |
| C1 | `Comp(s, props)`, one convention | H | `component-boundary-props`, `arrow-body-component` |
| C2 | components are declared, not inferred | H | `sem-calling-convention`, `sem-props-direct-call-diagnostic` *(new)* |
| C3.1–5 | the five props laws | **V** | `sem-props-laziness-conformance` *(new)*, `sem-props-cell-not-memoised` *(new)*, `component-getter-props` |
| C3.6 | Cells are arity-tolerant | H | `sem-props-block-in-cell-slot` |
| C3.7 | Cell-in-Block-slot is safe; the converse is not | H | `sem-props-block-in-cell-slot` |
| C3.8 | a Block with no scope throws, never falls back | P — 14 of 18 | `sem-props-block-in-cell-slot` |
| C3.9 | kind travels with the value | H | `sem-props-block-in-cell-slot` |
| C4 | props are called; `Slot<T>` / `Props<P>` | P (M3) | `sem-props-typed-slot.d.test.ts` *(new, type channel)* |
| C5 | forwarding is identity and depth-independent | H | `props-raw-forward`, `sem-props-forward-identity` *(new)* |
| C5.1 | a Block in a Cell slot: diagnostic or throw | H | `sem-props-block-in-cell-slot`, `docs/BARQ010.md` |
| C5.2 | η-reduction is Cell-only | H | `flow-prop-eta-boundary` |
| C6 | children are Blocks; slots are Block-valued props | H | `component-children-slot`, `sem-ctx-provider-direct-child`, `sem-ctx-provider-nested`, `sem-testing-wrapper-eager`, `sem-own-slot-arguments`, `sem-props-cast-keeps-the-brand` |
| C7 | one Block invocation per activation | H (M4) | `mm-branch-flip`, `mm-branch-key-stable`, `c7-portal`, `c7-provider`, `c7-error-boundary`, `c7-error-boundary-fallback`, `c7-await-suspense`, `c7-repeat`, `c7-each-fallback`, `c7-dynamic`, `c7-reveal`, `c7-loading-errored` |
| C8 | fragments drop nothing | **V** | `sem-own-fragment-drops-nothing` *(new)* |
| C9 | props source list, written order, last wins | H | `component-spread`, `sem-props-source-list-order` *(new)* |
| X1 | provide: enter, fork, write, then invoke | H | `sem-ctx-provider-direct-child`, `sem-ctx-provider-wrapper-component` |
| X2 | a provided value is a Cell; updates are live | H / **V** | `context-provider`, `sem-ctx-value-is-live` |
| X3 | context resolves at read time up the scope chain | H / **V** | `sem-ctx-provider-nested`, `sem-ctx-provider-default-silent`, `sem-err-fallback-reads-context`, `sem-ctx-read-after-install` *(new)* |
| X4 | cross-boundary reads follow the scope chain | U | `sem-ctx-portal-lexical` *(new)* |
| X5 | a miss throws, carrying the component stack | H / P (M2) | `sem-ctx-miss-throws-with-stack` *(new)* |
| X6 | the context record forks lazily, flat cost | H | `sem-ctx-fork-is-flat.bench.ts` *(new, bench)* |
| K1 | the item is the default row identity | H (M7b) | `sem-key-identity-default`, `control-flow-for`, `control-flow-for-keyed-by-item`, `control-flow-for-keyed-false`, `control-flow-for-keyed-fn`, `control-flow-index`, `for-unkeyed-rows` |
| K1.1 | a `Show` is non-keyed by default, and the asymmetry with `For` is the point | H (M10) | `control-flow-show-keyed-false`, `control-flow-show-keyed` |
| K2 | an unchanged key is a no-op | H (M4) | `mm-branch-key-stable`, `mm-branch-nonkeyed-truthy`, `mm-keyed-move`, `mm-index-row-stable` |
| K3 | positional + stateful row = a hint | H (M7b) | `sem-key-identity-default`, `diagnostics.test.ts` |
| K4 | duplicate keys: DEV error, degrade to index | P (M4) | `sem-key-duplicate` *(new)* |
| K5 | key expressions are emitted JS; `SymbolId` resolution | H | `renamed-core-import`, `sem-key-shadowed-flow` *(new)*, the control-flow corpus |
| K6 | each activation is a fresh scope and a fresh build | H (M4) | `control-flow-show`, `mm-branch-flip`, `mm-switch-arm`, `c7-dynamic` |
| K7 | no marker comments in client rendering | P (M4) | anchor snapshot channel (corpus-wide) |
| K8 | no ambient insertion state | H | structural (§14) |
| E1 | O(1) catcher; a catcher always exists | P (M2) | `sem-err-root-catcher` *(new)* |
| E2 | the eight routed entry points | P — 4 of 8 | `sem-err-construction-throw`, `sem-err-effect-throw` *(new)*, `sem-err-handler-throw`, `sem-err-ref-throw` *(new)*, `sem-err-async-throw` *(new)*, `sem-err-cleanup-throw` *(new)*, `sem-err-notready-passthrough` |
| E2.1 | construction throws land inside the boundary | H (M3) | `sem-err-construction-throw` |
| E2.2 | a handler throw routes to the boundary | H (M5) | `sem-err-handler-throw` |
| E2.3 | `NotReadyError` is re-thrown, never captured | H (M7) | `sem-err-notready-passthrough` |
| E3 | a boundary is a branch plus a try | H | `control-flow-error-boundary` |
| E4 | an error carries the scope chain | P (M2) | `sem-err-component-stack` *(new)* |
| M1 | construction is depth-first in document order | H | `sem-mount-order` *(new)*, `dashboard-composite` |
| M2 | first write during construction; no flash | H | `sem-mount-no-flash` *(new)*, `reactive-attribute` |
| M3 | refs drain after insertion, children before parents | **V** | `sem-mount-ref-order` *(new)*, `ref-binding` |
| M4 | microtask flush; render effects before user effects | H | `multi-signal-expression` |
| M5 | a stable re-render preserves every node | H / **V** | `sem-mount-stable-rerender` *(new)*, corpus-wide |
| M6 | insertion is idempotent under interruption | U | `sem-mount-dispose-during-construction` *(new)* |
| R1 | reactivity entered in exactly four places | H | `sem-react-component-body-untracked` |
| R2 | reactivity exited in exactly three places | H | `sem-react-apply-is-untracked` |
| R3 | a Cell is neutral | P (M3) | `sem-react-cell-neutrality` *(new)* |
| R4 | `untrack` changes only the observer | H | `sem-react-untrack-keeps-owner` |
| R5 | epoch dedupe and `markWave` are load-bearing | H | ablation bench (§14) |
| R6 | a signal getter is a Cell | H / **V** | `signal-object`, `signal-methods-in-handler` |
| R7 | `linked` re-seeds on its source | H (M7) | `sem-state-linked-reseeds` |
| R8 | a mark implies its closure; propagation is linear in depth | H (M7c) | depth test + bench (§14) |
| B1 | every binding on an element is equally live | H | `equal-liveness`, `class-with-live-siblings` |
| B2 | one fused effect per element | H | `multi-prop-one-element`, `class-owns-only-its-tokens` |
| B3 | `ref` is not a prop | P (M5) | `ref-writable-binding`, `ref-binding`, `ref-on-component` |
| B4 | a listener dies with its position | H (M5) | `delegated-event`, `non-delegated-event`, the corpus through `test/leaks.ts` |
| B5 | property-vs-attribute is a stated rule | P (M5) | `attribute-namespaces`, `bind-value-channel`, `custom-elements`, `property-attrs` |
| B6 | a user-mutable property is compared against the element | H (M7) | `sem-form-dom-compare`, `bind-family`, `property-attrs`, `dom-prop-static-value` |
| B7 | a write preserves the selection and the focus | H (M7) | `sem-form-selection-preserved`, `browser-caret-check.ts` |
| A1 | cancellation is structural | H (M7) | `sem-async-abort-on-dispose`, `async-value` |
| A2 | staleness by `gen` captured at call time | H (M7) | `sem-async-stale-response` |
| A3 | `NotReady` is a control signal | H (M7) | `sem-err-notready-passthrough`, `control-flow-await-suspense` |
| A4 | optimistic state is derived, never restored | H (M7) | `sem-async-optimistic-derived`, `optimistic-signal` |
| A5 | a transition is a lane on an opt-in value, not a fork of the graph | H (M7b) | `form-action`, `sem-form-action-slot` (B8's slot, M10), `sem-async-read-mode` and `read-mode-binding` (clause (f)'s read surface, M11); all nine falsification procedures run in packages/core/src/actions.test.ts (§14) |
| A6 | reveal ordering is a slot contract, and a nested group is one composite slot | H (M11) | `sem-reveal-nested-group`, `control-flow-reveal`, `l4/c7-reveal` |
| A7 | a compute returns a value, any thenable, or an async iterable | H (M11) | `sem-async-stream`, and the eight procedures in packages/core/src/async-source.test.ts |
| A8 | commit #0: a node may be born holding a value, and that window closes once | H (M11) | `sem-loading-value`, and the ten procedures in packages/core/src/loading-value.test.ts |
| B8 | `action` on a `<form>` is decided by the slot, not by the value's shape | H (M10) | `sem-form-action-slot`, `form-action` |
| H1 | hydration is claim-based | **H** (with registry) | node-identity census (corpus-wide), with a registry of the shortfalls |
| H2 | the wire carries what recovery needs; the key is a dev-only axis | **H** (M7b) | the branch-key comparison in both builds + L6's two tables + the three-wire byte measurement |
| H3 | logical index is free on the client path | **H** | emission diff, flag on against off (corpus-wide) |
| H4 | detection is a build axis; a detected mismatch is local | **H** dev / **H** with registry prod (M7b) | L6's twelve corruptions × two builds + the two build-level ones |
| H5 | the address is process-independent | **H** | address-set diff (corpus-wide) |
| H6 | interactive state survives hydration | **H** | focus + typed value + keystroke replay |

**Counts.** M7 added three rows — B6, B7 and R7 — so the table is 91 rules and the tally below is
the pre-M7 one; it is prose, not a checked number, and the checked number is the coverage line the L1
banner prints on every run. 77 rules: 9 `HOLDS`, 28 `VIOLATED`, 27 `PLANNED`, 3 `UNOBSERVABLE`, 9 holding only in
part (6 `H / V`, 3 `H / P`), 1 `IMPLEMENTED, UNEXERCISED` (`I/U`), 1 `NOT SPECIFIED`.
**M3's compiler half moved NO row of this table, deliberately.** C1, C3, C5, C6 and C9 now record what
the compiler emits, and every one of them still fails its own falsification procedure, because every
one of those procedures runs a fixture and no fixture can run until `packages/core` accepts a scope.
A status is a claim about an OBSERVATION; an emission is not one. M2's agent refused to mark O3.7
`HOLDS` on the same reasoning and was right to.

**M6b's hydration half moves five: H1, H2, H3, H4 and H6, `VIOLATED`/`PLANNED` → `HOLDS`.** Each moved
on a CHANNEL rather than on a fixture, and §14.1's five planned hydration fixtures were struck rather
than written: a percentage over a corpus, a diff between two compiles of everything, and a corrupted
WIRE are none of them a source file, so §14.2 is the category they belong in. The reach is declared in
`test/hydration.ts` and read by `semantics.test.ts`, which is what keeps "the oracle covers H" from
being a sentence in this document. Corpus coverage moves 32 → 37 of 88.


**29 violated rules is the finding.** They are not 29 independent bugs; they cluster. O2 and its
consequences (O2.1, X1, C6, C8, E2.1) are one defect with six faces — children evaluated at the call
site. O5 and its consequences (O3.7, B4, A1) are one defect with four — nothing owns anything, so
nothing can be disposed. B1, B3 and R6 are the classify-pass exclusions. That three defects can
present as twenty-nine violated rules is the argument for writing the rules down: each face was
individually plausible and none of them was individually wrong *against anything*.

---

## 14. Rules with no fixture — the next phase's worklist

This is the deliverable §13 is really for. Three classes.

### 14.1 Rules pinned by a fixture that must be written (46 fixtures, 1 bench, 1 type-level test)

M7 removed the five hydration rows: they moved to §14.2, which is where a rule whose input is not a
source file belongs.

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

**Keying (4).** `sem-key-noop-preserves-nodes`, `sem-key-duplicate`, `sem-key-shadowed-flow`,
`sem-key-remount-is-fresh`. M7b struck two off this list by reversing the rule they were for:
`sem-key-index-default` named a default that no longer exists, and `sem-key-stateful-row-diagnostic`
named a safety net that turned out not to be one. `sem-key-identity-default` replaces both, and it
covers K3 as well — the state loss `keyed={false}` costs is observable in the DOM, where the hint's
absence is not.

**Mount (5).** `sem-mount-order`, `sem-mount-no-flash`, `sem-mount-ref-order`,
`sem-mount-stable-rerender`, `sem-mount-dispose-during-construction`.

**Reactivity (4).** `sem-react-untrack-keeps-owner`, `sem-react-component-body-untracked`,
`sem-react-apply-is-untracked`, `sem-react-cell-neutrality`.

**Async (3).** `sem-async-abort-on-dispose`, `sem-async-stale-response`, `sem-async-optimistic-lane`
(A5, added at M7b: an action overriding a value a template reads, driving A5's nine procedures through
compiled JSX rather than through `optimistic` called by hand).

**Hydration (0).** The five planned fixtures were not written, and the rules were struck off anyway —
by CHANNELS, which is §14.2's category and the honest one for this family. A single fixture cannot
observe "node reuse is 100%" (it is a percentage over a corpus), "the index is free" (it is a diff
between two compiles of everything) or "a mismatch has a local blast radius" (the input is a corrupted
WIRE, which is not a source file). `test/hydration.ts`'s `HYDRATION_CHANNEL_RULES` is the declared
reach, on the same terms as `ownership.ts`'s `CHANNEL_RULES`.

### 14.2 Rules that need a new *channel*, not a new fixture (10)

These cannot be pinned by a fixture at all until the harness grows a way to observe them. Each is a
piece of M0/M1 harness work.

| Rule | Channel needed | Milestone
| Rule | Channel needed | Milestone |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
 |
|---|---|---|
| O1, O2, O2.1, O3 | **the L2b ownership trace** — `enter`/`exit`/`dispose`/Block-invoke appended to a log, asserted isomorphic to the compiler's static ownership tree | M0 |
| O3.7, B4 | **the leak oracle** — DELIVERED at M4, B4 GREEN at M5, `test/leaks.ts`: five probes over the whole corpus, taken outside the runtime and after `dispose()` has returned — live scopes (off the ownership trace), scheduled effects (every signal poked, any run counted), registered listeners (`addEventListener` matched to its removal), async continuations (scheduled before disposal, counted both when they ran after it and when they were still outstanding at teardown), retained nodes. Three findings across 137 sessions at M4, all B4; **zero across 141 at M5**, and `test/leak-known-failures.ts` is empty. The in-flight-fetch clause has no subject until M7 gives `abortSignal` a caller. | M4 (delivered) / M7 (fetches) |
| C7 | **Block invocation counter**, keyed by position — DELIVERED at M4 in two places: `flow.ts`'s `build` emits `BLOCK_EVALUATED_TWICE` behind the diagnostics gate, and `test/single-evaluation.test.ts` drives every consumer in the rule with an instrumented Block against a declared invocation sequence. `test/ownership-census.ts`'s clone count stays as the second, independent observation. | M4 (delivered) |
| M5 | **corpus-wide node-identity metamorphic channel** (replaces today's skip-on-shape-mismatch identity channel) | M1 |
| H1 | **the node-identity census** — hydrate the corpus over its own server render and compare the container's node OBJECTS before and after. A percentage over a corpus is not a fixture. DELIVERED at M6b, `test/hydration.test.ts`. | M6 |
| H2, H4 | **wire mutation** — corrupt the served markup one way at a time and record, per corruption, whether it was detected and what it degraded to. The input is a corrupted WIRE, which is not a source file. DELIVERED at M6b, `test/hydration-mutations.test.ts`. | M6 |
| H3 | **the emission diff** — compile the corpus with the hydration flag on and off and compare. The rule is a statement about two compiles, not about one. DELIVERED at M6b, `test/hydration.test.ts`. | M6 |
| H6 | **pre-hydration interaction** — focus, type and press a key against the served markup, then hydrate and read `document.activeElement`, the value and the caret back. DELIVERED at M6b, `test/hydration.test.ts`. | M6 |
| H5 | **address-set diff** — compile all fixtures both ways, diff the `(module, unit, position)` sets. DELIVERED at M6, `test/addresses.test.ts`: 130 fixtures × 2 backends × 2 optimisation levels, plus the uniqueness of an address inside its module and the byte-identity of the emitted code with the table on and off. | M6 (delivered) |

### 14.3 Rules that are structural and are checked by inspection, not by a fixture (6)

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
| R8 | `packages/core/src/signals.test.ts` "propagation cost in graph depth" — ms per layer at 800 layers against ms per layer at 100, which FAILS on the pre-fix build — with `eleven-cases.ts`'s twelfth case (`chain(500)`) and the `__jrbDepth` sweep in `packages/benchmark/src/tier2/jrb.ts` as the Tier-1 and Tier-2 channels. The rule's observable form is a COST, so a compiler fixture cannot reach it: emission is byte-identical either side of the fix, which is exactly why the defect survived 110 fixtures and eleven reactivity cases. |
| A5 | `packages/core/src/actions.test.ts`, which runs all nine of A5's falsification procedures, and remains the discriminating channel for eight of them. **The claim that there is no transition API for the compiler to emit was withdrawn at M10**: `<form action={fn}>` is one (B8), and `form-action.tsx` is the corpus fixture that reaches an action through compiled JSX. Driven in a real browser and sampled per microtask across one submit, it observes clauses (d) and (e) and procedure 7 as a sequence — the guess live in the override, `commit` writing the answer underneath it, the lane retiring onto a value that is already right. The forward reference to a `sem-async-optimistic-lane` fixture was never built and is dropped. **M11 withdraws the other half of the same claim.** Clause (f)'s READ SURFACE is a compiler surface too: `isPending(fn)` and `latest(fn)` invoke their argument, so the tracked read happens inside the callee and a classifier that does not know them sees nothing reactive at the site. `class={{ stale: isPending(user) }}` — the reference's own documented example — bound BY VALUE and was applied once at construction. `read-mode-binding` pins the emission and `sem-async-read-mode` pins the behaviour, and A5 is struck off `unpinned-rules.ts`. |

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
  { fixture: "sem-own-render-disposer-disposes", rule: "O5", status: "PLANNED",  green_at: "M5",
    reason: "the disposer is a stub; the scope survives the call" },
  // …
] as const
```

### 15.2 The four assertions the suite makes about it (§15.7 adds a fifth)

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

### 15.7 The fifth assertion: an overdue `greenAt`

Every registry row carries a `greenAt`, and until M6 nothing compared it to anything. The four
assertions of §15.2 — and their counterparts in `leaks.test.ts`, `ownership.test.ts` and
`oracle.test.ts` — all point the same way: they fail a row that **stopped failing**. Nothing failed a
row that **never started passing**, so `greenAt` was checked for its FORMAT (`/^M[0-9]$/`) and never
for its content, and three rows sat at `M5` while M5 and M6 both shipped with them still `VIOLATED`.

`test/milestone.ts` exports `CURRENT_MILESTONE`, one checked-in constant, and each of the four
registry suites now fails any row whose `greenAt` is behind it. The gate is the reason the three
M5 rows moved in M6, and moving one is a diff that has to say why in `reason`:

- **O5** and **O4.5** → `M9`, together. §8's M9 is "the old path goes", and the eager `createElement`
  path is the one `render`'s JSX-argument form rides on. The two markers are one marker because the
  O4.5 one-line change is paid for by a control claim in O5's fixture — measured, not assumed.
- **C3.8** → `M9`, and this one is **the user's call, taken on a measurement rather than deferred
  silently**. Driving `provide(root, Theme, () => aBlock, () => null)` with a counter on the carrier
  reports it called ZERO times: a provider's value Cell is stored, never invoked by `provide`, so the
  read-side `readSlot` this row's earlier text proposed cannot make that drive throw at all. Closing
  the laundered/provide pair needs the value probed EAGERLY at install — a semantic change about when
  a provider's Cell first runs, which nobody has decided. `each`'s source, by the same probe, IS read
  synchronously and is one wrap, but a wrap costs a closure per construction on the benchmarked list
  path and moves no row alone, because the claim is about all 12 (shape, slot) pairs. The choice is
  between probing eagerly and re-cutting the claim to observe the provide slot at its READ.

The gate is live in all four suites and vacuous in two of them today: `leak-known-failures.ts` and
`ownership-known-failures.ts` carry no data rows, so it observes nothing there until one is added,
which is when it is needed.

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
