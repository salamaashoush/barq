# Handover

Written 2026-08-16, extended 2026-08-17 for M11. Everything below was measured on this machine, on a
forced native rebuild, not carried over from a report.

## Where this is, in one paragraph

**M9, M10 and M11 are all done.** M9 deleted the old path and retired the `createElement` oracle;
M10 landed the spread lowering, `<form action>` as §3.8's compiler surface, and the Solid 2.0
control-flow alignment; M11 closed M10's two remaining openers — reveal ordering into the boundary
contract (A6) and the transition surface (§12's M11 table) — plus `computed`'s async arities (A7)
and A5 (f)'s read surface. Read `## M11` before re-attempting anything in it, and read
`## M9, done`'s three REVERSED rows and `## M10, so far`'s struck §4.1 rows before re-attempting
those: each is a documented reversal on evidence, not an oversight.

**What is left is a short list, and it is at `## Open, not yet scoped`.** The largest single item is
the other half of `sem-own-given-scope-wins`'s O4.5 row, which is coupled to O5 by measurement.

---

## State, verified

Numbers below are M11's. The M9/M10 sections keep their own numbers where they were measured, and
each says so.

```
cargo test                    303 pass, 0 fail   (clippy clean, fmt clean)
compiler-rs bun test         3483 pass, 0 fail   (fewer than M11: the registries emptied, so
                                                 their per-row tests are gone)
packages/core                 985 pass, 0 fail
packages/extra                153 pass, 0 fail
packages/testing               16 pass, 0 fail   (COMPILED — see M9 below)
packages/compiler              22 pass, 0 fail
root bun run ci               EXIT=0
fixtures                      141  (32 semantics, 128 L1 claims; 54 of 97 rules pinned)
kitchen-sink                  builds; all 9 routes drive in real Chrome, reactive, routed
kitchen-sink typecheck        56 errors, NOT ci-gated, two known classes (see below)
```

**The full `bun test` run is timing-sensitive.** `L3 — EMI mutation over generated programs` has a
5,000 ms per-test budget and it is the first thing to blow when the machine is busy: three runs
during M11 reported four to sixteen "failures" that were all `this test timed out after 5000ms`,
with the same suite green in isolation and green again once a `vite dev` server and a Chrome session
were killed. Read the message before believing a failure there, and do not drive the app and run the
suite at the same time.

Registries: **all three are EMPTY at M12** — `known-failures.ts`, `ownership-known-failures.ts` and
`leak-known-failures.ts` carry no rows, and the L1 banner reads `0 registered-and-still-failing, 128
holding as controls`. (The counts below are M9's, kept where they were measured.)
`hydration.ts`'s `control-flow-for-keyed-spread` row is DELETED at M10 — it was registered for
`not-hydratable` because an adapter has no flags to forward, and the construct is a region with the
flag on it now.
`oracle-known-failures.ts` is DELETED — all 34 rows were `cause: "C1"` or `"C6"`, both of which are
facts about an un-compiled path that no longer runs. Each surviving row names the rule it violates
and the milestone that fixes it, and the registry **fails the suite if a registered fixture starts
passing** — that is the signal a milestone worked, not a problem to route around.

`git status` is clean at `be44492` + the docs commit that follows it.

---

## M9, done

Three commits, each its own step, per the instruction not to mix a rename with a deletion:

| commit | what |
|---|---|
| `c84b8a7` | the compiler emits no old path; the `createElement` oracle is retired |
| `b0af252` | the old runtime path is deleted, and four defects it hid are fixed |
| `93a44c6` | §13's `create*` half |

### The oracle is gone, and every channel it carried has a grader

`CODESIGN.md` §6 has the table. The one that matters: the effect channel was an upper BOUND against
the oracle's count and is now an EQUALITY against 131 hand-written rows in `test/effect-counts.ts`.
A bound is one-sided, so a binding that silently went missing used to read as a win.

`wins` (12) and `goesLive` (18) are deleted from the corpus. Both were exemptions from a comparison
that no longer runs, and `graded.ts`'s exemption count went 3 → 1.

### Four defects the retirement exposed

Each was invisible because the thing that would have caught it was the reference:

1. `attribute_expression` handed a JSX attribute's string literal to the runtime **un-decoded**, so
   `title="a &quot; b"` reached `setAttribute` as six characters and serialised as `&amp;quot;`. It
   hit `element()` and every component prop. Re-pointing `ssr.test.ts` at the DOM backend failed on
   the first run.
2. `element()`'s children were emitted EAGERLY: `<table>{a()}-{b()}</table>` rendered `A-B` and never
   updated.
3. `insert` handed an ARRAY straight to `childToNodes`, which calls each function element once — the
   same values frozen at run time, and mis-owned. Fixed as Solid does it: ONE effect for the whole
   array, not one per element, because N anchorless holes in one parent interleave on update.
4. `semantics.test.ts` validated `greenAt` against `^M[0-9]$`, single digit, which would have
   rejected every M10 row.

(3) closed half of `sem-own-given-scope-wins`'s O4.5 row — the ratchet caught the improvement and
failed, which is what it is for.

### Three §4.1/§13 rows REVERSED on evidence

Do not re-attempt these without doing the measurement again.

- **The fourteen flow components stay** (`components.ts`), and so do **`ssr.ts`'s twelve string
  adapters**. M9 recorded this as ONE deletion blocked on ONE compiler gap — `admits_element`
  refused any `SpreadAttribute`. **M10 closed that gap and they still stay**, for a reason that is
  not a gap at all: `-O0` turns the flow pass off, so the adapters are the `-O0` emission and §6 L3
  grades the pass against it. The verdict is unchanged and the REASON is replaced; read
  `## M10, so far` and `components.ts`'s header, not this row's original argument.
- **The Block brand does NOT go behind `dev`.** Its closure is not a DEV facility; it establishes the
  ambient owner (C1/O4.5). Ablated: 100-row `renderToString`, 51x100 iters, medians 4.62/4.88
  shipping vs 4.53/4.74 with the brand alone — the two shipping runs differ by more than shipping
  differs from ablated. §4.1 carries the table.
- **`merge` is kept.** §13's row says "two names for one operation"; they differ on `undefined` and
  `props.test.ts` pins it, and `@solidjs/signals` 2.0.0-beta.31 exports `merge` with no `mergeProps`
  at all, so the rename moved away from Solid 2.0 rather than toward it.

### `packages/testing` compiles its own suite now

It ran on bun's `react-jsx` transform, which lowers onto `jsx`/`jsxs` — deleted at M9. A `Bun.plugin`
`onLoad` in its preload hands every `.tsx` to the native transform, so it stops measuring a path
§11 Q2 says does not exist. This is also why `jsx`/`jsxs`/`jsxDEV` could go: the only other consumers
were declaration reads, which now compile first.

### What M9 did NOT close, and why

- ~~**`packages/extra/src/css.ts`**~~ **— DONE at M8 and this row was stale until M10 read it.**
  The file was deleted in `35be05c` and what an application wants lives in
  `packages/kitchen-sink/src/styles.ts`, over goober, which is the CSS decision (ecosystem, not
  framework) carried out. The original indictment, kept because it is why the row existed: a goober
  wrapper whose pragma shim re-implements element creation
  a fifth time. §4.1 marks it and the CSS decision (ecosystem, not framework) settles it, but it was
  not in M9's instruction list and kitchen-sink's CSS demo still consumes it.
- **The fourteen flow adapters and the twelve SSR adapters** — reversed above; deleting them needs
  `passes::flow` to lower a spread source, which is a compiler feature.
- **The other half of `sem-own-given-scope-wins`'s O4.5 row.** `childToNodes` still invokes a Block
  with `getOwner()` rather than the `s` it was given. The row is rewritten with what remains and
  moved to M10; it is coupled to O5 by measurement, not preference.

### One history defect, no work lost

Commit `9777375` ("propagation was quadratic in graph depth") is **orphaned** — not an ancestor of
HEAD, on no branch. Its content is intact in HEAD's tree (`repropagate`/`openWave` in `signals.ts`,
the depth regression test, `CODESIGN.md` §0.8) because M8's `git add -A` swept it into `35be05c`. So
the code is safe and the attribution is wrong. Do not "restore" it; just know the M8 commit message
does not describe half of what that commit contains.

---

## M10, so far

Four commits. The first is M9's loose end; the other three are M10's first item.

| commit | what |
|---|---|
| `1496787` | M9's mutation table — 23 rows, 23 killed, no equivalent |
| `7b32fd6` | `cargo fmt`, which HEAD was not clean under (18 files; six untouched by anything else) |
| `7f65c5c` | `passes::flow` lowers a spread source |
| `57a21bd` | `Show` lowers one too, by emitting both programs |
| `3af14f0` | `Show`'s body parameter is typed, so `keyed={false}` stays live |

### The stated blocker was two things, and the smaller one was false

M9 wrote that a flow construct's props "each decide a different part of the LOWERING — `keyed`
selects one of three key expressions and the body Block's own PARAMETER LIST changes with it".

For `For` that is false, and three facts say so. `each` invokes every row as
`build(scope, body, [item, index])` in all three list modes (`flow.ts`), and `mapArray` decides what
`item` and `index` ARE. The three keying fixtures compile to emissions that differ at the `keyOf`
argument — `null` / `false` / `(row) => row.id` — and nowhere else. And `analysis::bind` already
resolved a spread to `Keyed::ByFn`, so the body's INTERIOR was already on the safe arm. The keying
mode was already a runtime argument; the pass was refusing to pass it.

For `Show` it was true, and it is emittable anyway. The two programs differ in exactly two
expressions — the key, and what the content Block is handed — and `branch`'s ABI covers both,
because a single Block used for every key is what the keyed arm already passes.

**Ten of thirteen constructs admit a spread now.** `admits_spread` is a match with one arm per
construct so each exclusion is stated where it is enforced.

### The prize does not exist, and the reason is structural

`-Ox` surviving flow imports across 131 fixtures: **1 → 0**. That is the whole measured win, plus
the `(parent, anchor)` pair every spread site now gets instead of an `insert` hole around an adapter
frame.

The twenty-six adapters do NOT go, and it is not a gap anybody can close:

| level | fixtures keeping a flow import |
|---|---|
| `-Ox` | **0** of 131 |
| `-O0` | **37** of 131, across all thirteen constructs |

`Opt::flow` is one of the nine flippable knobs and `-O0` turns it off, so at `-O0` every construct
is a component call and the adapters are what it calls. §6 L3 grades every optimisation by rendering
the corpus at both levels and requiring the frames to agree — so `components.ts` and `ssr.ts`'s
string half ARE the flow pass's reference. Deleting them deletes the oracle. §4.1's two rows are
struck rather than deferred, and `components.ts`'s header carries the table.

Three constructs also still refuse at `-Ox`, so their adapters are reachable from an optimised build
too: `Switch` needs literal `<Match>` arms (`admits_arms`, never about spreads), `Match` goes with
it, and `Dynamic`'s unrecognised props are the resolved component's.

### Two defects found by reading the emission, one of them old

- **`Uids::temp` is one undecorated name** whose invariant is that the flow pass declares it at the
  head of a body arrow and reads it in the same arrow. A spread source binding is declared AROUND a
  body that declares one too and read INSIDE it, so `Repeat`'s index shift shadowed the props object
  and `_v$.from` read a property off a number — silently, because `?? 0` swallowed it. Source
  bindings have their own numbered base now, `_o$N`, and `UID_BASES` is twelve.
- **`analysis::bind::row_params` typed `For` and `Repeat` and returned early for everything else**,
  so `<Show keyed={false}>`'s body parameter was not known to be an accessor and `{v()}` was applied
  once — the text froze at activation. Pre-existing, and the arm had no fixture, which is how it
  survived. `control-flow-show-keyed-false` pins it; step 0 is the only frame that can see it.

### What the app says

Driven in real Chrome with an explicit session key. All nine kitchen-sink routes render, the counter
is reactive, no console errors. The spread fixtures were driven separately, compiled and bundled:
`For` keyed by `row.id` updates in place, `control-flow-spread-precedence` takes its source from the
static prop rather than the spread's stale one, `Repeat`'s `from: 10` shift lands, and `Show` was run
against four carriers — absent, `keyed: true`, `keyed: false`, and one with a fallback — beside the
static path compiled from the same body. The frames are identical, which is the claim.

### Gates

```
cargo test                    303 pass, 0 fail
compiler-rs bun test         3420 pass, 0 fail
packages/core                 951 pass, 0 fail
packages/extra                153 pass, 0 fail
packages/testing               16 pass, 0 fail
packages/compiler              22 pass, 0 fail
root bun run ci               EXIT=0
fixtures                      135  (+4: three spread forms, and Show's keyed={false} arm)
```

`effect-counts.ts` gained four rows and changed none. The mode matrix, the leak probes and the
ownership channel each moved their reach pin, and each says what moved and why.

### What M10 still owes

Items 2 and 3 of the instruction — transitions getting a compiler surface, and reveal ordering
moving into the boundary contract — are untouched. So are the `flow.ts` `Loading` bug M7 bisected,
`computed`'s `AsyncIterable`, the other half of `sem-own-given-scope-wins`'s O4.5 row, and
`packages/extra/src/css.ts` — which was already done, see the M9 row above.

---

## M10, continued — the Solid 2.0 alignment and three defects

Commits `03184f6` · `8e152c4` · `aa4c607` · `af228c6` · `6da2ef3` · `aef0427`.

### `<form action={fn}>` — §3.8's compiler surface (`03184f6`, `8e152c4`)

`action` on a `<form>` went down the attribute channel, so `bindProp` applied
§3.0 rule 1 to it — an `action()` is `(...args) => Promise<R>`, arity 0 — CALLED
it at mount, and wrote the promise into the form's target as
`action="[object Promise]"`. Both halves silent. It is `Op::FormAction` now,
which is an op rather than a channel because the listener it installs is owned
by the position (B4) and a channel call has no scope to give it. `SEMANTICS.md`
B8 is the rule; `sem-form-action-slot` and `form-action` pin it.

That is also the first time §3.8 is exercised through the compiler at all.
Driven in Chrome and sampled per microtask across one submit, it observes A5
clauses (d) and (e) and procedure 7 as a sequence: the guess live in the
override, `commit` writing the answer underneath it, the lane retiring onto a
value that is already right.

### The control-flow surface is Solid 2.0's ten (`6da2ef3`)

`Suspense`, `Await` and `ErrorBoundary` are deleted. **Read out of
`solid-js@2.0.0-rc.0` and `@solidjs/web@2.0.0-rc.0`, unpacked, not out of the
docs** — the shipped surface is `For`, `Repeat`, `Show`, `Switch`, `Match`,
`Errored`, `Loading`, `Reveal`, plus `Portal` and `Dynamic`.

Not a rename. `Loading` already existed with Solid's exact signature, so there
was nothing for `Await` to be renamed into; it was a fourth construct whose
meaning is `<Loading><Errored>…</Errored></Loading>`, which is what the compiler
already lowered it to.

**All three remaining divergences are CLOSED** (`03a6231`, `be44492`), so barq's
control-flow surface now matches `solid-js@2.0.0-rc.0` prop for prop.

- **`Show` and `Match` are non-keyed by default.** `SEMANTICS.md` K1.1 is the
  rule, and the asymmetry with `For` is stated there rather than left to look
  like an oversight: a list row is identified BY ITS DATA so rebuilding it is
  the lesser failure (K1), while a `Show`'s `when` is a CONDITION — over this
  corpus it is `on()`, `visible()`, `isPending`, `loading()`, `length > 0` — and
  for a boolean the two modes are indistinguishable anyway.

  What the old default cost, measured on one immutable update to a still-truthy
  value: the `<input>` was replaced and the text the user had typed into it was
  destroyed. Across the corpus the flip took 407 scopes to 404, 313 clones to
  312 and 492 scope entries to 486 with nothing edited, and 268 effects to 270 —
  fewer activations, more live bindings.

  `sem-show-nonkeyed-default` pins both arms, `control-flow-show-keyed` is the
  opt-in arm's fixture, and `control-flow-show-keyed-false` now pins that the
  explicit spelling agrees with the absent one.
- **`Portal`'s slot is `mount`.** barq's still takes a selector string as well
  as an element, which is wider than the reference rather than different from
  it, and that is written where the prop is declared.

One wire fact moved with the `Show` flip: a branch's dev-only key is the
truthiness INDEX now, so `<!--[true-->` is `<!--[1-->` and detection costs one
byte on that page instead of four. The L6 mutation that edits the key had gone
to "not expressible on this wire" — the no-op that file's own comment warns
about — and was pointed at the new key.

### Three defects fixed, each found by driving rather than by a suite

1. **A suspending read behind a region wedged the boundary forever.** `region`
   builds a body inside `untrack`, which is right for a body that builds and
   wrong for one that SUSPENDS: nothing was built and the untracked read
   registered no dependency, so the position could never wake.
   `Loading > Errored > read` and `Loading > Show > read` sat on the fallback
   for good. A suspended attempt is retried TRACKED, and the key effect's "the
   key did not move" test learns that a suspended attempt left nothing
   standing — neither half is sufficient alone.
   `packages/core/src/suspend-behind-a-region.test.ts` is the pin, with
   `Loading > read` as the control. **`Await` had hidden this**, which is why
   removing it is what exposed it.
2. **`loadingBoundary`'s `move` relocated a SNAPSHOT.** Leaving the park takes
   every child of the fragment now, because a nested region that swapped while
   parked is not in the list the last build returned. This is the orphan half
   of M7's report.
3. **JSX read a component's props from the wrong parameter.** §3.2 puts the
   scope first and TypeScript reads parameter 0 as the props, so every construct
   in an app checked its attributes against `Scope`.
   `JSX.LibraryManagedAttributes` takes the second parameter instead, with
   `unknown extends Q ? P : Q` for the components that declare none — without
   that fallback it goes to 248, worse than the 106 it started at. kitchen-sink
   106 → 49.

### The one number that did not move

`-Ox` keeps **0 of 131** flow imports; `-O0` keeps **37**, across all ten
constructs. §4.1's rows stay struck for the reason in `## M10, so far`.

### Still open, and now measured

- kitchen-sink typecheck is **56** at M11, none of them ci-gated. It was 49; the seven added are the
  same two known classes — one implicit-any row callback from `<For>` and six not-callable prop
  reads in JS positions — in the three demos M11 added. Generic inference does not survive
  `LibraryManagedAttributes`, so `<For each={xs}>{(item) => …}` loses `item`'s type, and a prop
  declared `name: string` makes `props.name()` uncallable to TS while being correct at run time.
- ~~The `Show`/`Match`/`Portal` divergences~~ — CLOSED at M10.
- ~~M10 items 2 and 3~~ — CLOSED at M11; see `## M11` above.
- ~~`computed`'s `instanceof Promise`~~ — CLOSED at M11 as A7.
- The other half of `sem-own-given-scope-wins`'s O4.5 row, whose reason is written out in
  `known-failures.ts` — `childToNodes` still invokes the Block with `getOwner()` rather than the `s`
  it was given, and the row says why it lands with O5 or not at all. **Still open at M11.**
- `extra/src/css.ts` is NOT open: it went at M8 (`35be05c`).

---

## M11 — reveal ordering, the transition surface, and what a compute may return

Five commits, each its own step.

| commit | what |
|---|---|
| `c346ade` | A6 — reveal ordering is a slot contract; a nested group is ONE composite slot |
| `d93bf73` | the transition surface is complete; its static knowledge was not |
| `2ffcb0a` | A7 — a compute returns a value, ANY thenable, or an async iterable |
| `91c557f` | A5 (f)'s read surface is a compiler surface, and A5 leaves `unpinned-rules.ts` |
| *(this one)* | A8 — commit #0, on `computed` and through `resource` |

### A6 — the two questions, answered rather than implied

**Does a boundary gain an ordering channel, or does the coordinator stay a provide?** BOTH, and they
are not alternatives — the reference does both too (`RevealControllerContext` beside a
`CollectionQueue` carrying `_revealController`/`_disabled`/`_collapsed`). The provide is how a slot
FINDS its group and has to be a context read through the scope chain, because a `<Loading>` three
components deep is still in the group (X3, X4). The channel is what a slot must EXPOSE to BE one,
and it is on the boundary because after the second answer the thing registering is not always a
boundary.

**What does a nested group register as?** ONE composite slot. That is what forces the channel to
carry TWO predicates up rather than one: `ready` is every boundary in the slot, `minimallyReady` is
the slot's own first visible content under its own order. `sequential` advances on the first,
`together` releases on the second, and for a LEAF they are the same accessor. Both are facts about
DATA and neither is about what the slot is showing — that is what stops a held group deadlocking
against its own hold.

Measured before: a nested `<Reveal>` shadowed the outer's provide, so the outer never learned the
inner existed. `[fa]B:2[fc]` where the rule requires `[fa][fb][fc]`.

Also fixed with it: the default order was `natural` in three of the four spellings while the
`revealOrder` primitive said `sequential` — and `natural` is the one order that does nothing at the
top level, so `<Reveal>` with no props was a no-op. And a registration outlived its boundary, so a
`<Loading>` dying inside a `<Show>` held its group's frontier for the rest of the page.

### The transition surface — enumerated, and the emission really is complete

`CODESIGN.md` §12 carries the table. `action()`, `commit()` and `affects()` emit nothing and should:
no template, no scope, no ownership, and the lane is created per invocation. `<form action>` is the
only JSX slot an action can reach — `formaction` on a submit button is typed `string` in the
reference, so a function surface there would be barq's invention.

**But every piece of static knowledge the compiler had about that surface was wrong or missing.**

- `optimistic()` returns a `Signal<T>` and `analysis::bind` gave it the plain-accessor shape, so
  `optimistic.set` was a tracked read where `signal.set` is static — and a handler passed by
  reference LEFT THE DELEGATED SET for an `addEventListener` of its own.
- `<form action={fn}>` had no TYPE. It was a `TS2322` in any typed app since M10; fixtures are
  compiled and never typechecked, which is why two of them drove it green.
- `isPending(fn)` and `latest(fn)` INVOKE their argument, so the tracked read happens inside the
  callee. Nothing in the classifier could see it, and
  `class={{ stale: isPending(user) }}` — the reference's own documented example — bound BY VALUE and
  was applied once at construction. `Prim::ReadMode` is the mirror of `Prim::Untrack`.

A5 (e) was also stated for "an action" and is true of one shape in three: a post-`yield` write in a
sync generator retires and needs `commit()`, and the same write after an `await` in either async
shape commits authoritatively. There is no hook inside an async function's own await continuations.
`commit()` is a no-op where the lane already ended, so writing it always is correct everywhere.

**One candidate declined with the measurement, not by omission.** A binding from an unrecognised
call is not provably callable, so `onClick={someAction}` takes `bindEvent`. Special-casing `action`
would need a new `SourceKind` whose only inhabitant is `action`, to save one `addEventListener` at a
position whose idiomatic spelling is a closure anyway. §12 says why that trade differs from the
`optimistic` one, which needed no new machinery at all.

### A7 — three arities, one node

`instanceof Promise` is a question about the CONSTRUCTOR. A thenable and an async generator both
failed it and were stored AS VALUES. A stream is pending until its FIRST yield and settled from then
on, its iterator is closed by disposal AND by supersession, an empty stream settles rather than
hanging, and a bare `IteratorResult` is assimilated. Every stream procedure observes MORE THAN ONE
yield, because one yield is indistinguishable from a promise.

### A8 — commit #0

`loadingValue` declares a value a node is BORN with, served until its first
answer. During that window the node is SETTLED in every observable: no throw,
`isPending` false, no boundary fallback. The mechanism is ONE omission and not a
second state — the node never sets `STATUS_PENDING`, and that flag is what makes
a read throw, what a boundary registers on and what `isPending` reports, so
withholding it gives all three at once. The flight still runs and `settle()`
still waits for it.

The window closes on the first ANSWER of any kind — value, sync value,
rejection, sync throw — and never reopens. After that the node is ordinary. The
two states are **disjoint**, and that is the whole reason the option exists:
`value.skeleton || isPending(value)` is the guard that covers both, one term
each.

It is threaded through `resource` too, which is where an application actually
declares a skeleton; `computed` alone would have left it unreachable from the
surface apps use.

**A fixture claim about A8 cannot be made on the VALUE alone.** `Loading`
revalidation keeps stale content whether the window closed or not, so the page
reads identically either way — the first mutant run proved it, surviving a
fixture that only read text. `sem-loading-value` reads `isPending` off a live
class instead, which makes it depend on A5 (f) being true.

### The overdue gate had been dead since M6

`test/milestone.ts`'s `CURRENT_MILESTONE` sat at **6** through M7, M7b, M7c, M8, M9, M10 and M11.
Its own doc comment says it "moves in the commit that closes a milestone and nowhere else", and the
paragraph above that says why it exists: *"three rows promised green at M5 and were still VIOLATED
two milestones later with no assertion able to see it."* That is precisely what then happened to the
gate itself, for five milestones, reading green throughout.

Bumped to 11, it named all three surviving `known-failures.ts` rows at once — two promised M9, one
M10. All three now say **M12** and each says why it moved. Two of them are one piece of work (lower
a JSX argument at an arbitrary call site to a Block; O4.5 is coupled to O5 by measurement). The
third, C3.8's laundered/provide pair, is **not** waiting on engineering: the measurement that
decides it was made at M9 and the row ends "THE USER'S CALL". It had been parked on a question
nobody was asked, which is the second thing the dead gate cost.

Two properties of the gate, both measured rather than assumed:

- `overdue` is `n < CURRENT_MILESTONE`, so a row promising M_n fires only once M_(n+1) is current —
  ONE milestone of grace. A row marked M11 does not fire at `CURRENT_MILESTONE = 11`; one marked
  M10 does. That is looser than the constant's own "has SHIPPED" wording implies, and tightening it
  to `<=` is a change to what the gate promises rather than a bug fix. Left alone, and written down.
- The other two registries (`ownership-known-failures.ts`, `leak-known-failures.ts`) have **no
  rows**, so the bump could only ever fire on the L1 one.

**`CODESIGN.md` §8 was written to M6 and stopped**, so this counter had run five milestones past the
document that defines what it counts — and `known-failures.ts`'s C3.8 row records navigating around
that ("this row had no owning milestone left in §8"). §8 carries the M7–M11 history and M12's
contents now.

### M12 — O5 and O4.5 closed, and one row's diagnosis was wrong

Both were the SAME piece of work, as the coupling said, and it was smaller than
its own row implied. `bind` already recognised an arrow in `render`/`hydrate`'s
first position and recorded it as a root Block; a bare JSX argument fell through
that same match's `_ => {}` arm. Recording it, and having `scope` wrap it into
`(_s$) => …`, makes the two spellings of a mount ONE program — so the eager form
has no compiled spelling left and the root owns what it mounts.

**The runtime still accepts a built subtree and still warns.** A hand-written or
un-compiled caller can produce one, so `sem-own-render-disposer-disposes` was
re-cut to drive THREE positions where it drove two: `jsx` (the compiled
spelling, which is what O5's own claim measures), `block` (hand-written), and
`built` (through a LOCAL, which the wrap does not reach). Without the third, the
two controls about relocation and the diagnostic would have gone on passing
while silently measuring the Block form — passing for the wrong reason.

**O4.5's row named the wrong function, and that is the transferable lesson.** It
said `childToNodes` invokes the Block with `getOwner()`. It does — and the
claim's path never reaches that function: an array holding a function goes
`insert` → the live-hole effect → `applyInsert` → `normalizeChildToNodes`. M9
restructured `insert` to make such an array one live hole and the row's text
went on describing the shape from before it. Passing `s` in `childToNodes`
changed nothing measurable; the fix was threading the scope through
`applyInsert` into `normalizeChildToNodes`. **A registered row can rot in its
REASONING while its observation stays true**, and the only thing that finds it
is re-deriving the path rather than trusting the row.

Two fixtures' emissions moved and both are explained: the one that was re-cut,
and `sem-ctx-provider-direct-child`, which writes `render(<Direct/>, host)` and
now wraps. No DOM golden and no marker golden moved — the lowering changes
ownership, not output.

kitchen-sink's `main.tsx` spelled the Block form out by hand as an explicit
workaround, with a comment saying why. It is a plain JSX argument again, and all
nine routes drive clean and reactive on it.

### M12, continued — C3.8 closed, and all three registries are EMPTY

The last row took all three answers it had been holding open, and each site
needed a different one because "the carrier is stored at the drive and read
later" is a different problem at each:

- **`provide` PROBES its value at install.** This is the semantic change the row
  called "nobody's decision yet" and it is the one that mattered: a provided Cell
  yielding a Block reached every consumer of that context, and the first thing to
  stringify it wrote a Block's source text where a value belonged — the outcome
  that made this rule worth a row. X2 already says a provided value is a Cell so
  updates stay live; what moved is only when its FIRST read happens, and
  `untrack` keeps that read out of whatever is installing.
- **`each`'s source is tested inside `mapArray`**, where the read has already
  happened. The row costed this as "a closure per construction on the benchmarked
  list path" — that is the cost of wrapping at the DRIVE. At the read it is one
  property probe on a value in hand. Untested it failed as
  `items.slice is not a function`, naming neither the rule nor the slot.
- **The two HANDLER slots are tested on the RETURN**, which is what `applyRefs`
  already did for `ref`. A handler is the one Cell slot whose value the callee
  must NOT invoke at the drive — that would fire it — so a laundered `() => aBlock`
  is indistinguishable from a legal 0-arity handler until it has been called. The
  claim was re-cut to DISPATCH, and the refusal ROUTES rather than escaping:
  **an exception thrown in a listener does not leave `dispatchEvent`**, measured.
  An error boundary observes it, which is what an application would have.

`known-failures.ts`, `ownership-known-failures.ts` and `leak-known-failures.ts`
now carry NO rows, and the L1 banner reads `0 registered-and-still-failing, 128
holding as controls`.

### The type channel is a declared channel now

`src/jsx-types/` was built at M11 for B8 and the coverage counter could not see
it: `PINNED` was L1 fixtures plus the L2b, address, hydration and L4 reaches.
`test/type-channel.ts` is its declared reach, on the same terms as the others —
adding a rule to it without a `.types.tsx` that observes it is the same offence
as adding one to the document with no fixture.

C4 is pinned through it (`props-typed-slot.types.tsx`), which §14.1 had wanted
since M3 as `sem-props-typed-slot.d.test.ts` and which was never written because
the channel did not exist. Both of C4's falsification procedures are "MUST be a
type error", so no other oracle here can see it — they all compile a fixture and
RUN it. Coverage 53 → **54 of 97**.

### Two things worth knowing about the reference

- **`§12` was read against `beta.31`; `rc.0` is what M10 and M11 read.** `rc.0` still exports NO
  transition API — no `startTransition`, no `useTransition` — so Q7's finding holds. But its
  internals grew a transaction machinery (`resolveTransition`, `initTransition`, a loading rail
  "invisible to transactions"), and a re-read pass is worth doing.
- **`rc.0` has `loadingValue` — "commit #0"**, a value a memo is born with that serves during first
  load WITHOUT suspending and with `isPending` false, leaving the lineage once the first answer
  lands. barq has no equivalent. Not on M11's list; found while reading `signals.d.ts`.

### `src/jsx-types/` — the type-level channel §14.1 has named since M3

A JSX attribute type is the first thing in this project no oracle could see: every other channel
compiles a fixture and RUNS it. It shells out to `tsc` over its own tsconfig and asserts both
directions — the positives compile and every `@ts-expect-error` still FIRES. It is excluded from
core's own `tsconfig` because `jsxImportSource` is a module specifier resolved from the FILE.

### Where the emission channel and the conformance channel part

A claim asserting `bindEffect` appears in the emission was written into `sem-async-read-mode` first,
and L3 rejected it: the reference backend expresses the same live binding as an interpreter op. A
conformance claim is about BEHAVIOUR; the shape of one backend's output is the corpus channel's
question. Hence two fixtures — `read-mode-binding` for the emission, `sem-async-read-mode` for the
behaviour.

---

## The documents, in reading order

| file | what it is |
|---|---|
| `CODESIGN.md` | the accepted redesign. §0 measurements, §3 the contract, §4.1 **the deletion list**, §8 milestones, §11 and §12 **the settled decisions** |
| `SEMANTICS.md` | 91 numbered rules, each with a falsification procedure and a pinning fixture |
| `ERGONOMICS.md` | the ergonomics research; its finding is that every silent failure here is a *copy* out of a live container. **Predates M9** — where it cites `goesLive`/`wins` it is citing fixture exports that no longer exist |
| `ROADMAP.md` | diagnostics, HMR, hydration — evidence-backed, two proposals already killed on measurement |
| `MILESTONES.md` | the completion report for the original six milestones |
| `M9.md` | the completion report for M9 — the gates, the three reversals, the mutation table |
| `DESIGN.md` | the original compiler spec; still accurate for the IR and passes |

---

## Settled decisions — do not re-litigate

From §11 and §12. Each was decided by the user, several after being reversed once on evidence.

- Components take their scope first: `Comp($scope, props)`. The compiler is a **hard dependency**;
  there is no un-compiled authoring path.
- Props are Cells and are **called**: `props.x()`. One rule across props, context, rows, refs and
  slot arguments.
- Children are Blocks taking a scope. **Not getters** — but note the 8.7x figure that justified this
  was refuted at Tier 2 (it is ~5% at mount scale). The decision stands on copy-flattening, which was
  always the stronger argument. Do not re-open it on the strength of the dead number.
- Spread is a compiler construct — an ordered source list, never a JS spread.
- Control flow lowers to four primitives: `branch` / `each` / `boundary` / `portal`.
- Lists key by **identity** by default (reversed from index-keyed on evidence). `keyed={false}` opts
  into index; `keyed={fn}` for a custom key. `Index` is deleted.
- Hydration detection is a **dev-only axis**; production carries only what recovery needs, and is
  byte-identical to a non-hydratable render.
- CSS scoping is ecosystem, not framework.
- Hydration is claim-based. O8-style resumability is out of scope.

---

## Standing rule: Tier 1 iterates, Tier 2 adjudicates

`packages/benchmark/src/tier2/` — real Chrome, trace-derived durations, paired Wilcoxon. Built in
M7b, and running the project's own claims through it killed three of them:

| claim | Tier-1 said | real Chrome said |
|---|---|---|
| getter props | 8.7x | +5% at mount scale — **dead** |
| channel dispatch | 0–8% | +36% to +216% — **dead, opposite direction** |
| scope per position | 7.3 ns/row | no significant effect — **dead** |
| convention "0% through a real DOM" | asserted | 1.000–1.011x — **survives** |

A Tier-1 win is provisional until Tier 2 confirms it. Do not accept a stub-DOM or happy-dom number as
evidence for a performance decision.

It also found the quadratic depth bug, now fixed: per-layer cost at 800 layers went 0.2960 → 0.0068 ms
and the curve now *falls* with depth. `cellx1000` 453.77 → 5.30 ms; `cellx2500` 3488.85 → 10.29 ms.

---

## Invariants that must not regress

Each was a blocker found by mutation testing or by driving real Chrome, and each is pinned by a named
test. A failure here is a regression, never an expectation to update.

- An element the HTML parser reshapes never reaches a template; the reshaping child splits into its
  own unit joined with `insert`, which is correct because DOM insertion never foster-parents.
- NUL and CR are never baked; `>` is escaped as `&gt;` in template text; lone surrogates refused.
- `<pre>`/`<listing>`/`<textarea>` leading-newline doubling looks **past** leading slots.
- `dangerouslySetInnerHTML`/`innerHTML`/`innerText`/`textContent` alongside children is refused, as
  is a multiple-select with options.
- The four SSR security fixes: `attr`/`spreadAttrs` reject an invalid attribute name; the `SsrHtml`
  brand is `Symbol.for("barq.ssr.html")`, a **registered** symbol — a plain property tested with an
  in-check opened a client-side XSS, so do not "simplify" it to a WeakSet or private field; `rawText`
  neutralises close-tag sequences; the compile-time escapers are pinned by four named tests.
- The escapers are indexOf-probe scans **fuzzed byte-exact** against the old regex implementation
  over 412,780 inputs, and escaping differs by context. Do not touch them without re-running that fuzz.
- A fused effect must never return a function — the effect machinery registers it as the cleanup.
- Delegated events: `$$type` expandos plus one `delegateEvents` per module, never `addEventListener`
  for the delegated set. `arguments`, `eval` and `this` are captures, so such a handler is never
  hoisted to module scope.
- A Block invoked without a scope **throws** and never falls back to the ambient one. That fallback
  would work almost always and reintroduce the original blank-page bug where nobody would look.
- Dedup byte-compares html + ns + wrapped after the hash probe; a collision degrades to a duplicate
  row, never a silent merge.
- The preamble splices after the **leading import run**, not the last import — an import below
  JSX-bearing code is legal ESM and emitted a template call above its own declaration.
- `mappings.rs` searches bytes; never slice a `&str` at a fixed byte budget.
- Propagation must be **linear in depth** (`SEMANTICS.md` R8). The regression test asserts per-layer
  cost at 800 layers may not exceed 4x per-layer at 100, and it **fails on the pre-fix build**.

---

## M10's three openers — all closed

1. ~~**Transitions have no compiler surface.**~~ CLOSED across M10 and M11. `<form action={fn}>` is
   the surface (B8, M10) and A5 (f)'s read surface is the other half (M11). §12's M11 table
   enumerates what is left, which is nothing to EMIT.
2. ~~**Reveal ordering belongs in the boundary contract.**~~ CLOSED at M11 as A6.
3. ~~**`passes::flow` lowering a spread source**~~ — DONE at M10. It did not keep the twenty-six
   adapters alive; `-O0` does. `## M10, so far` has the numbers.

The `flow.ts` bug M7 found is still open and still not async-specific; it will bite anything built on
`Loading`.

**The one number M9 owed is now in `M9.md` §5: 23 rows, 23 killed, none survived** — no equivalent
row, against 23 / 22 / 1 on the run before the runtime deletion. `bun run test/mutants.ts` rebuilds a
scratch crate per row. It COPIES `src/`, so editing `src/` while it runs turns every row after the
edit into `did not build`; run it from a `git worktree` at the commit you mean to measure if you
intend to keep working.

---

## Open, not yet scoped

- ~~**`Reveal` has no home in the four primitives.**~~ CLOSED at M11 as A6. The answer to "does the
  boundary gain an ordering channel or does the coordinator stay a provide" is BOTH, and the reason
  is that a nested group registers as one composite slot, so the thing registering is not always a
  boundary.
- ~~**`loadingValue` — "commit #0" — has no equivalent here.**~~ CLOSED at M11 as A8, on `computed`
  and threaded through `resource`.
- **§12 was read against `beta.31`; M10, M11 and M12 read `rc.0`.** What that re-read has produced
  so far, all of it landed rather than pending: the ten-construct control-flow surface and `Show`'s
  non-keyed default (M10), `Reveal`'s three orders and the nesting matrix (A6), `computed`'s
  `PromiseLike | AsyncIterable` (A7), `loadingValue` (A8), and the confirmation that `rc.0` exports
  **no** transition API — no `startTransition`, no `useTransition` — so §12 Q7's finding holds at
  the rc.
  What is NOT yet read: `rc.0`'s internals grew `resolveTransition`, `initTransition`, transaction
  stashing and a loading rail described as "invisible to transactions", all behind that same empty
  public surface. That is an implementation this project has no counterpart for and no need to copy
  — barq's `action()` delimits its transaction explicitly where theirs must infer one — but it is
  the last part of §12 written from the older package, and the method that produced everything
  above is the one that would settle it: `npm pack`, unpack, read `types/` and `dist/prod/`.
- ~~**A `flow.ts` bug M7 found**~~ — CLOSED at M12 by MEASUREMENT, not by a fix, and it had no test
  anywhere from M7 to M12. M10 fixed one half (leaving the park takes every child of the fragment).
  The other half **does not reproduce in the shape the compiler emits**:
  `<Loading><Show/>…</Loading>` compiles to `branch(s, null, null, …)`, so `siteFor` gives the region
  a MARKER, the marker is one of the boundary's own nodes and travels with the content on both
  moves, and a later swap lands wherever the marker now is. The reproducer is a region handed a
  `DocumentFragment` AS ITS PARENT — a fragment drains when inserted, so its child list is empty
  from that moment — and the compiler never emits that. `loading-nested-region.test.ts` pins both:
  the compiled shape as a regression test, and the fragment shape asserted as it IS, because "does
  not reproduce" is worth nothing without the shape that does.
- **`Dynamic`, `Await` and `Reveal` do not lower** to primitives, each for a stated reason in M4b's
  report. Those reasons are facts about the constructs, not gaps, but they are worth revisiting once
  the async model is settled.
- **`§0.3`'s A/B/C/D/D2/E table** — the measurement the entire calling convention rests on — lived in
  a scratch file that no longer exists. `tier2/apps/shapes.ts` is a *reconstruction from §0.3's own
  descriptions*, labelled as one.

---

## Operational notes — these cost hours to learn

- **Workflow scripts are template literals.** An unescaped backtick inside a prompt closes the string
  and turns the rest into a tagged-template call, which fails instantly with `X is not an Object`.
  This bit three times. Check with:
  `awk '{n=gsub(/\`/,"\`"); t+=n} END {print t%2}'` and a `bun build --target=node` parse.
- **Python heredocs that edit files must write LAST.** A script that raises before its `open(...,'w')`
  is safe; one that opens for writing first truncates the file. This truncated `src/passes/shape.rs`
  to zero bytes once — it was recovered from a scratchpad copy.
- **Editor diagnostics go stale during a workflow.** Reported compile errors have three times been
  from an intermediate state. Always run `cargo build` before believing them.
- **Force the native rebuild.** `touch src/lib.rs && bun run build`; a cache hit reports success in
  0.02s and leaves `bun test` measuring a stale `.node`.
- **Run `bun test` from inside the package.** The root picks up every package and the numbers are not
  comparable.
- **A blanket identifier rename will hit string literals and other languages.** M9's `dyn` →
  `dynamic` renamed `class="dyn"` in two fixtures and, worse, Rust's `dyn` KEYWORD — `&dyn Any`
  became `&dynamic Any`, which does not compile. Rename, then `cargo build`, then read the diff for
  `"` and `class=`.
- **Four of §13's new names shadow their own initialiser.** `const context = context(1)` is a TDZ
  error, not a warning. The LOCAL is what moves.
- **A full `bun test` in `compiler-rs` is timing-sensitive and its failures lie.** `L3 — EMI mutation
  over generated programs` has a 5,000 ms per-test budget and blows it first when the machine is
  busy. Three M11 runs reported 4, 10 and 16 "failures" that were all `this test timed out after
  5000ms`, with `differential.test.ts` green at 338/0 in isolation and the whole suite green once a
  `vite dev` server and a Chrome session were killed. READ THE MESSAGE before believing a failure
  there, and do not drive the app and run the suite at the same time.
- **A new corpus fixture moves FIVE checked-in pins, not one**: `effect-counts.ts`,
  `ownership-known-failures.ts`'s `OWNERSHIP_REACH`, `ownership-census.ts` (a per-fixture row),
  `leak-known-failures.ts`'s `LEAK_REACH`, and `mode-matrix.ts` — plus three snapshot files. Each
  fails separately and each wants its own sentence about what moved. The three effect counts agreed
  across `effect-counts`, `LEAK_REACH` and `OWNERSHIP_REACH` for `read-mode-binding`, which is how
  you know the number is the fixture's and not an artefact.
- **An emission assertion is not a conformance claim.** A claim searching `kit.emitted` inside a
  `fixtures/semantics/` fixture fails L3, because the same fixture runs through the REFERENCE
  backend, which expresses the same binding as an interpreter op. Behaviour goes in the semantics
  fixture; emission shape goes in a corpus fixture's `optimality.emits`.
- **An unknown key in `transform`'s options used to be DROPPED, and that is fixed.** `#[napi(object)]`
  binds the fields it knows by name and ignores the rest, so `transform(src, { target: "ssr" })`
  compiled the DOM backend and returned a plausible module — it cost a wrong backend comparison in
  the M11 session, and the only tell was that the emission still imported from `@barqjs/core`
  instead of `@barqjs/core/server`. The flag is `ssr: true`; there is no `target`. `transform` now
  enumerates the raw object and rejects any key not in `options::OPTION_KEYS`, naming the nearest
  match. TypeScript callers fail earlier still — the Rust parameter is a raw `Object` so the keys
  can be read, and `#[napi(ts_args_type = …)]` puts `TransformOptions` back in the generated
  `.d.ts`, so both layers hold. `options_keys_cover_every_field` parses the struct's own source and
  fails if a field is added without a key.
- **Do not rewrite a large Markdown file with `s.index(...)` splices in a heredoc.** It ate most of
  `HANDOVER.md` twice; the second time the broken version had already been committed by a
  `git add -A`. Splice on LINE indices with asserted anchors, and check `grep -c "^## "` after.
- **ferridriver needs an explicit session key** (`ks:main`, `m8:verify`). The default session goes
  stale and reports a CDP error that looks like the tool is broken. It is not.
- **Drive kitchen-sink with `bun run dev`, never `vite preview`.** The mock API
  is a `configureServer` plugin, so it exists ONLY under the dev server. Under
  `preview` every `/api/*` call falls through to the SPA fallback, gets
  `index.html`, and `res.json()` throws `Unexpected token '<'`. Three route
  sweeps this session reported "no console errors" while every async demo on the
  page was failing, because a caught fetch error is not a `pageerror` and the
  sweep only measured text length.
- **`packages/core/dist` is what a browser bundle resolves, and it is stale by default.** The bun
  suites reach `src/index.ts` through the workspace's `bun` export condition, but
  `bun build --target browser` takes the `import` condition and gets `dist/`. Three M10 browser runs
  were against a pre-change core before this was noticed; they happened to agree, which is worse
  than failing. Run `bun run --cwd packages/core build` before bundling anything for Chrome.
- **When driving the app, let the microtask flush.** Reading the DOM synchronously after a click shows
  stale values and looks exactly like broken reactivity. Use an in-page
  `await new Promise(r => setTimeout(r, 120))`.
- **`bun test --update-snapshots` corrupted `roundtrip.test.ts.snap` once**, appending a duplicated
  header-less block that failed every snapshot in the file — but only in multi-file runs.
- **The app is the acceptance test, not the suite.** kitchen-sink rendered a blank page with **no
  console error** while 1,274 assertions were green.
