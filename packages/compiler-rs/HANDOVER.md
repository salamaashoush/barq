# Handover

Written 2026-08-16. Everything below was measured on this machine, on a forced native rebuild, not
carried over from a report.

## The two things the user asked for next, in order

**1. M9 FIRST — delete the old path.** The user's words: "do M9 first delete all old shitty things."
This is not cleanup at the end, it is the next milestone. `CODESIGN.md` §4.1 is the deletion list and
§8's M9 entry adds the mutation kill rate per optimisation pass. Several items were deliberately
deferred *to* M9 by earlier milestones and are named in `## What is waiting for M9` below.

**2. Then async and transitions, on Solid 2.0's model.** `CODESIGN.md` §12 records the mechanism in
full, read out of their shipped `@solidjs/signals@2.0.0-rc.0` rather than from documentation. M7b
landed a first cut; the user wants it finished properly. Read §12 before touching it — the design
this project originally guessed (a pending scope beside the live one, `KEEPALIVE` parking) is the one
the reference implementation **rejected on the record**, and both horns of the question this project
deferred were wrong.

---

## State, verified

```
cargo test                    301 pass, 0 fail
compiler-rs bun test         3112 tests, 0 fail, 1 todo, 263 snapshots
packages/core                 962 pass, 0 fail
packages/extra                153 pass, 0 fail     (was 54 FAILING before M8)
root bun run ci               EXIT=0
fixtures                      131
kitchen-sink                  builds, renders 9 routes, navigates, reactive
```

Registries: `known-failures.ts` 5 · `ownership-known-failures.ts` 2 · `leak-known-failures.ts` 3 ·
`oracle-known-failures.ts` 34. Each row names the rule it violates and the milestone that fixes it.
The registry **fails the suite if a registered fixture starts passing** — that is the signal a
milestone worked, not a problem to route around.

`git status` is clean at `35be05c`.

### One history defect, no work lost

Commit `9777375` ("propagation was quadratic in graph depth") is **orphaned** — not an ancestor of
HEAD, on no branch. Its content is intact in HEAD's tree (`repropagate`/`openWave` in `signals.ts`,
the depth regression test, `CODESIGN.md` §0.8) because M8's `git add -A` swept it into `35be05c`. So
the code is safe and the attribution is wrong. Do not "restore" it; just know the M8 commit message
does not describe half of what that commit contains.

---

## The documents, in reading order

| file | what it is |
|---|---|
| `CODESIGN.md` | the accepted redesign. §0 measurements, §3 the contract, §4.1 **the deletion list**, §8 milestones, §11 and §12 **the settled decisions** |
| `SEMANTICS.md` | 91 numbered rules, each with a falsification procedure and a pinning fixture |
| `ERGONOMICS.md` | the ergonomics research; its finding is that every silent failure here is a *copy* out of a live container |
| `ROADMAP.md` | diagnostics, HMR, hydration — evidence-backed, two proposals already killed on measurement |
| `MILESTONES.md` | the completion report for the original six milestones |
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

## What is waiting for M9

Named by earlier milestones as explicitly deferred:

- The fourteen flow-component adapters in `components.ts`. They hold no machinery — the four
  primitives do the work — and survived only because `packages/extra` was on the old convention and
  CI type-checked it. **`extra` is now redesigned, so the reason is gone.**
- `Suspense`, `Await`, `ErrorBoundary` — kept in M4 because deleting them would have deleted two
  fixtures, which the hard rules forbid. Their replacements exist now.
- `markers.ts` — anchor identity is a compile-time address. Its process-global counter makes two
  renders of one tree differ byte-for-byte, which is what makes hydration impossible.
- `createElement` / `jsx` / `jsxs` / `jsxDEV` / `spread` — `CODESIGN.md` §4.1 counts roughly 1,950
  implementation lines of 9,319 for deletion, plus ~350 already dead. Of 132 value exports, **62 have
  no consumer outside `packages/core`**.
- `packages/extra/src/css.ts` — a goober wrapper whose pragma shim re-implements element creation a
  fifth time. §4.1 marks it; the CSS decision (ecosystem, not framework) settles it.
- The Block brand allocates a closure per construction to serve two DEV facilities. §12 flags this as
  the wrong trade — put the brand behind `dev` and measure SSR, where Solid measured this class at
  8–11%.
- `oracle-known-failures.ts` has 34 rows. Several are M9's by their own `greenAt`.

M9 also owes the **mutation kill rate per optimisation pass**. §8: "no optimisation pass ships until
a mutation operator exists for it and no mutant survives."

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
- **ferridriver needs an explicit session key** (`ks:main`, `m8:verify`). The default session goes
  stale and reports a CDP error that looks like the tool is broken. It is not.
- **When driving the app, let the microtask flush.** Reading the DOM synchronously after a click shows
  stale values and looks exactly like broken reactivity. Use an in-page
  `await new Promise(r => setTimeout(r, 120))`.
- **`bun test --update-snapshots` corrupted `roundtrip.test.ts.snap` once**, appending a duplicated
  header-less block that failed every snapshot in the file — but only in multi-file runs.
- **The app is the acceptance test, not the suite.** kitchen-sink rendered a blank page with **no
  console error** while 1,274 assertions were green.
