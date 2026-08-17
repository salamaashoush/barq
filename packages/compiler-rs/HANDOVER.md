# Handover

Written 2026-08-16. Everything below was measured on this machine, on a forced native rebuild, not
carried over from a report.

## Where this is, in one paragraph

**M9 is done** — the old path is deleted, the `createElement` oracle is retired, and §13's naming is
finished. Three commits, `c84b8a7` → `b0af252` → `93a44c6`, each its own step. What M9 found on the
way is under `## M9, done` below, including three rows of `CODESIGN.md` that were REVERSED on
evidence; read those before re-attempting any of them.

**M10 is in progress.** Its first item — `passes::flow` lowering a spread source — is DONE, and it
answered the adapter-deletion question in the negative on evidence; see `## M10, so far` below
before re-reading §4.1. What remains is the async and transition half.

**M10 proper is async and transitions, on Solid 2.0's model.** `CODESIGN.md` §12 records the mechanism
in full, read out of their shipped `@solidjs/signals` rather than from documentation. M7b landed a
first cut; the user wants it finished properly. Read §12 before touching it — the design this project
originally guessed (a pending scope beside the live one, `KEEPALIVE` parking) is the one the
reference implementation **rejected on the record**, and both horns of the question this project
deferred were wrong. `## Open, not yet scoped` below carries the rest of M10's inbox, and the biggest
NEW item is the one M9 turned up: `passes::flow` cannot lower a construct whose props arrive through
a spread, and that single gap is what keeps twenty-six runtime adapters alive across both backends.

---

## State, verified

```
cargo test                    303 pass, 0 fail
compiler-rs bun test         3460 pass, 0 fail
packages/core                 955 pass, 0 fail
packages/extra                153 pass, 0 fail
packages/testing               16 pass, 0 fail   (now COMPILED — see below)
packages/compiler              22 pass, 0 fail
root bun run ci               EXIT=0
fixtures                      139
kitchen-sink                  builds; all 9 routes drive in real Chrome, reactive, routed
kitchen-sink typecheck        49 errors, all pre-existing and NOT ci-gated (see M10)
```

Registries: `known-failures.ts` 5 · `ownership-known-failures.ts` 2 · `leak-known-failures.ts` 3.
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

- **`packages/extra/src/css.ts`** — a goober wrapper whose pragma shim re-implements element creation
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
`packages/extra/src/css.ts`.

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

- kitchen-sink typecheck is **49**, none of them ci-gated: 22 implicit-any row
  callbacks and 16 not-callable reads. Generic inference does not survive
  `LibraryManagedAttributes`, so `<For each={xs}>{(item) => …}` loses `item`'s
  type. A different gap from the one that was fixed.
- The `Show`/`Match`/`Portal` divergences above.
- M10 items 2 and 3 of the original instruction — transitions beyond the form
  surface, and reveal ordering moving into the boundary contract.
- `computed`'s `AsyncIterable`, O4.5's remaining half, `extra/src/css.ts`.

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

## Starting M10 — read this first

M10 is **async and transitions on Solid 2.0's model** (`CODESIGN.md` §12), and M9 left it three
concrete openers. In the order they unblock each other:

1. **Transitions have no compiler surface.** `action()` and `commit()` exist in the runtime and the
   compiler emits nothing for them. Until it does, §3.8's transition story is exercised only from
   hand-written calls.
2. **Reveal ordering belongs in the boundary contract** (§12). `reveal` is a separate primitive
   standing in for it — it creates a *provide* scope rather than a range, which is why it never fit
   among the four. If the async model follows Solid's, this is where it goes.
3. ~~**`passes::flow` lowering a spread source**~~ — **DONE.** It did not keep the twenty-six
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

- **`Reveal` has no home in the four primitives.** It creates a *provide* scope, not a range, and
  `boundary()` has no ordering channel. Reveal ordering is first-class in Solid 2.0's boundary story,
  so if the async model follows theirs, this belongs in the boundary contract.
- **A `flow.ts` bug M7 found and correctly refused to fix in a file it did not own**: after a
  `Loading` boundary parks and reveals, a nested region at a detached site that swaps *later* writes
  into an orphaned fragment — the fallback is built and never reaches the document. Bisected; not
  async-specific.
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
