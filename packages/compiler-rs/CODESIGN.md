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

**Read §0.7 before quoting any number in this document.** Every original measurement here is Tier 1 —
Node, Bun, a stub DOM, happy-dom — and M7c ran the ones a browser can rule on through the Tier-2
lane. Three did not survive, one survived inverted, and one turned out to have been quoted from a
file that no longer existed. Each is corrected in place, beside the reading it replaces, with the
suite, the trial count and the p-value that decided it.

---

## 0. What was measured before anything was decided

### 0.1 The bar, re-measured today

| | barq | Solid | ratio
| | barq | Solid | ratio |
| ----------------------------------------------------------- | ------------------- | ----------- |
 |
|---|---|---|---|
| reactivity head-to-head, 12 cases vs `@solidjs/signals` 2.0 | — | — | **11 wins / 1 tie**, up to 6.25x — Tier 1. **The twelfth case is `chain(500)`, added at M7c because the other eleven bottom out at depth 5 and that is why F1 hid for seven milestones. §0.8 has F1's fix; Chrome now reads cellx1000 0.639x and cellx2500 0.550x** |
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

**THE 8.7x IS REFUTED AS A MAGNITUDE — C5, M7c.** Read the paragraph above as the Tier-1 record it is:
the sentence "it is 8.7x more expensive" is withdrawn, and the sentence "the allocation number is
stronger and it is the one to quote" is withdrawn with it. Method for what replaces it:
`bun run bench:tier2:shapes`, real Chrome over CDP, 41 interleaved trials per shape, paired Wilcoxon,
minimum detectable effect printed beside every ratio; raw numbers in
`packages/benchmark/tier2-results.json`, shapes in `packages/benchmark/src/tier2/apps/shapes.ts`.
Four runs of the lane:

| instrument | GETTER against VALUE | p |
|---|---|---|
| V8, **stub arm** (the one that reports in 8.7x's own unit), 1,000 rows | **2.73x** — 205 vs 75 ns a row; 2.93x (220 vs 75) on the previous run | 2.5e-8, 2.5e-8 |
| Chrome, mount **`js`**, 1,000 rows, four runs | **1.153–1.161x**, i.e. **+15.3% to +16.1%** | 1.3e-4 … 1.4e-6 |
| Chrome, mount **`js`**, 200 rows, four runs | 1.073–1.198x — wider because the mde there is 3.6–11.5% | 3.7e-5 … 5.3e-7 |
| Chrome, mount **`total`**, 1,000 rows, four runs | 1.023–1.043x, i.e. **+2.3% to +4.3%**; two of the four are not significant against their own mde | 1.8e-2 … 1.7e-1 |

**Why the microbenchmark was right while the ratio was wrong.** The per-getter ABSOLUTE reproduces.
127.64 ns to construct and read one getter is ~255 ns for this row's two getters, and V8's stub arm
prices the whole GETTER row at 205–220 ns a row. What did not reproduce is the RATIO, because 8.7x
was taken in Bun over happy-dom's stubs, where the VALUE baseline is nearly free — 9.328 µs for 200
rows is 46.6 ns a row — so the ratio is mostly a statement about its denominator. Put the same shapes
in V8 and VALUE costs 75 ns a row and the ratio falls to 2.7x. Put them through a real DOM, where a
mounted row costs ~1,900 ns, and the same absolute is 15–16% of the js half and 2–4% of the frame.
One number, three denominators, three different-looking answers; only the first was ever a statement
about getters.

**The Block decision is NOT reopened, and it never rested on this number.** It rests on
copy-flattening, which is a correctness argument and which no benchmark decides: `{...p}` over a
counting getter reports `reads-at-copy: 1, still a getter: false` — the getter is READ by the copy and
the copy is dead, so every spread-forwarding component silently loses reactivity. That was the
argument all three submitted designs made on their own, before any allocation number existed, and it
is the argument that stands. A getter also still costs 2.7x to allocate in V8 and 15% of a real
mount's js half, which is a supporting number and not a load-bearing one. **Nobody may reopen Blocks
on the strength of 8.7x being dead, because 8.7x was never the reason.**

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

**WHERE THIS TABLE LIVES — F4, closed at M7c.** Until M7b it lived nowhere. The six shapes were
written in a scratch file that no longer exists, so the measurement the entire calling convention
rests on could not be re-run from anything checked in; the numbers above were a quotation from a
deleted file, which is a finding about this project's evidence independent of what a re-run says.
The permanent home is **`packages/benchmark/src/tier2/apps/shapes.ts`**, re-run with
`bun run bench:tier2:shapes` from `packages/benchmark`, raw output checked in at
`packages/benchmark/tier2-results.json`. It is a **RECONSTRUCTION from this section's own
descriptions of the six shapes** and its header says so — it was written from the document because
the original was gone, so a reader can disagree with the reconstruction rather than with a number.
It carries both instruments: browser arms (`js` = the mount loop, `total` = the mount loop plus a
forced layout) and a **stub arm** running the same six shapes over a plain object inside V8, which is
this section's own instrument moved into the engine that matters. Every shape asserts BYTE-IDENTICAL
DOM before anything is timed. From M7c on, a change to the convention re-runs that file; it does not
re-quote the table above.

**The reconstruction's own numbers**, so this section has a table someone can reproduce. 1,000 rows,
41 interleaved trials a shape, medians; `packages/benchmark/tier2-results.json` is the raw form:

| shape | V8 stub arm, ns/row | Chrome `js`, ns/row | Chrome `total`, ns/row |
|---|---|---|---|
| A current: eager children, value props | 75 | 1,895 | 10,420 |
| B thunk props + block children, return-DOM | — (a stub node has nothing to return) | 1,920 | 10,570 |
| C thunk props + block children, `(parent, anchor)` | 85 | 1,935 | 10,495 |
| D + explicit scope argument ← the chosen convention | 95 | 1,920 | 10,490 |
| D2 + explicit scope arg, one Scope PER ROW | 100 | 1,945 | 10,460 |
| E compiler-inlined, no component frame | 70 | 1,885 | 10,300 |
| VALUE props | 75 | 1,895 | 10,490 |
| GETTER props (Solid's emitted shape) | 205 | 2,200 | 10,790 |
| THUNK props | 80 | 1,905 | 10,495 |

Two things are visible in that table that no stub DOM can show. **A mounted row costs ~1,900 ns and
the whole JS-overhead spread the original table argues over is 70–100 ns** — 4–5% of the row, which
is why every browser `js` contrast below reads within a few percent and why `total`, at ~10,400 ns a
row, reads parity. And **the ordering the stub arm reports is stable while the browser's is not**:
E < A < C < D < D2 on the stub, shuffled inside noise in Chrome.

Four conclusions, two of which contradict submitted claims and one of which is against this document's
own chosen design:

1. **Return-DOM, append-to-anchor and scope-passing are within noise of each other.** Pick the
   convention on structural grounds. Nobody may claim a speed win for any of them.

   *C2, M7c: SURVIVES in the browser* — B/C 0.992x and C/D 1.008x at 1,000 rows, neither significant
   (p=8.8e-1 both, mde 1.6–2.4%). On the V8 stub arm C/D reads 0.895x, i.e. C is ~10% cheaper than D
   in the JS-only unit, which is C1's 20 ns a row seen from the other side and does not reach the
   browser.
2. **A Scope per position costs 7.3 ns.** (12.989 − 11.537, over 200.) Real but small; worth a
   `NO_SCOPE` flag, not worth a design.

   **C3, CORRECTED at M7c: there is NO wall-clock justification for this at Tier 2, and `NO_SCOPE`
   keeps its allocation-count justification only.** D2 against D, four runs of
   `bun run bench:tier2:shapes`, 41 interleaved trials, paired Wilcoxon. Browser, 1,000 rows: `js`
   1.020x (p=3.2e-1), 1.015x (p=1.4e-1), 1.008x (p=1.3e-1), 1.013x (p=2.0e-3) — **significance flips
   between runs**; `total` 1.009x, 1.008x, 0.997x, 0.997x (p from 4.2e-1 to 8.3e-1) — **the sign
   flips between runs too**, and no run of it is significant. The stub arm, which is the only
   instrument reporting in the unit "7.3 ns a row" is stated in, will not hold a magnitude either:
   1.053x, 1.158x, 1.158x at 1,000 rows — 5 to 15 ns a row against a 5 ns clock quantum. So the
   honest statement is that a Scope per position is somewhere between free and ~15 ns a row and the
   lane cannot separate it from noise. **`NO_SCOPE` keeps the allocation-count half of §9.2's
   criterion and loses the wall-clock half**, which that row demanded as an AND — see §9.2, where the
   row is restated rather than quietly satisfied. The flag's case is weaker than it was written, and
   this is the record of that.
3. **Component inlining is not worth 30–40% of mount.** It is 15% of *JS overhead* on a stub DOM and
   **0% on happy-dom** (526.92 vs 530.73 — noise). Anvil's headline optimisation does not survive
   contact with a DOM implementation. It goes to the backlog.

   *C4, M7c: SURVIVES, both halves, at 17.6% rather than 15%* — E/C 0.824x on the V8 stub arm at
   1,000 rows (p=1.8e-5) and 0.974x on the browser `js` half (p=5.9e-2, mde 2.4%). The backlog
   decision stands, now on a browser rather than on happy-dom.
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

   **C1, ADJUDICATED at M7c — BOTH HALVES SURVIVE, and the gap between them is the argument for the
   Tier-2 lane.** Four runs of `bun run bench:tier2:shapes`, 41 interleaved trials, paired Wilcoxon.
   *The "0% through a real DOM" half:* D/A `total` at 1,000 rows reads 0.994x, 1.007x, 1.010x, 0.999x
   — **1.000x ± 1%, never significant** (p from 1.6e-1 to 7.9e-1, mde 2.6–10.3%). That is the claim
   this convention is defended on and it holds on the instrument §9.1 demanded, not on happy-dom.
   *The 23.7% half:* it reproduces **in its own unit and nowhere else** — the V8 stub arm reads
   1.267x at 1,000 rows (95 against 75 ns a row, p=2.4e-7) and 1.250–1.357x across runs. In a browser
   that same ~20 ns a row lands on a 1,900 ns mounted row, so it PREDICTS about 1%, and the browser
   `js` column duly reads **1.008–1.050x across four runs and two row counts against an mde of
   1.8–12%** — a few percent, indistinguishable from the 1% prediction and indistinguishable from
   zero. Call the browser figure ~1–4% and do not claim precision the column does not have.
   **Nothing moved except the denominator**: 23.7% of JS-only overhead and ~1% of a real mounted row
   are the same absolute cost, and only one of the two is a number an application feels. **Record
   both**, because a stub-DOM percentage more than 5x its browser value is exactly the failure §0.7's
   standing rule exists to catch — and note that this claim is the only one in §0.3 that stated a
   stub number and a browser number TOGETHER, which is the only reason both could be checked.

### 0.4 `setProp` dispatch — the claim that did not reproduce at Tier 1, and inverted at Tier 2

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

**C6, CORRECTED at M7c: 0–8% IS WRONG, AND IT IS WRONG IN THE OPPOSITE DIRECTION.** The three designs
were closer to right than this section was. Method: `bun run bench:tier2:shapes`, real Chrome over
CDP, 20,000 writes a case, min of 41 interleaved trials, `channels` block of
`packages/benchmark/tier2-results.json`; the case bodies are in
`packages/benchmark/src/tier2/apps/shapes.ts`. The run of record, with the spread across four runs
beside it:

| pair | ns per write | ratio | across four runs |
|---|---|---|---|
| **id** — `setProp` vs `el.setAttribute` *(like-for-like: this is the dispatcher and nothing else)* | 294.00 vs 216.50 | **1.358x — +36%** | 1.358–1.537x |
| **value** — `setProp` vs bare `input.value =` | 813.75 vs 501.25 | **1.623x — +62%** | 1.623–1.664x |
| **value** — `setProp` vs `value =` + caret capture and restore *(equivalent work)* | 813.75 vs 720.25 | 1.130x — +13% | 1.130–1.136x |
| **class** — `setProp` vs bare `el.className =` | 180.25 vs 96.25 | **1.873x — +87%** | 1.873–1.880x |
| **class** — `setProp` vs `className =` + the ownership check *(equivalent work)* | 180.25 vs 115.50 | 1.561x — +56% | 1.290–1.561x |
| **class** — `setProp` vs a hand-written `classList` token diff *(the path it falls to when it does not own the attribute)* | 180.25 vs 271.00 | 0.665x — `setProp` is FASTER | 0.572–0.665x |

**Read the pairs, not the bare ratios.** `setProp value` coerces, reads the live value, captures the
caret and restores it — four DOM crossings and a user-visible feature that `input.value =` does not
buy; `setProp class` verifies it still owns the attribute before writing it. The bare comparands
therefore price *the dispatcher plus a feature*, and only the `id` row and the two equivalent-work
rows price the dispatcher alone: **+36% on `id`, +13% on `value`, +56% on `class`.** Against this
section's own 0–8%, and against the three designs' 10–25%.

**The class row is the least trustworthy of the three, for two reasons, and its number is not
settled.** First, it compares different semantics on the one-shot path: `setProp class` diffs the
tokens it owns while `el.className =` takes the whole attribute, so even the ownership-check comparand
is an approximation of the same work rather than the same work. Second — and this is the one that
also condemns the Tier-1 row above — the one-shot path is exactly where **F3** lives. As found at
M7c, `bindProp` passes `prev: undefined` on every write, so `setClass` cannot recognise its own
previous write,
took the token-diff path and ADDED without ever removing. Writing `c0, c1, c2, …` through it leaves
20,000 classes on the element after 20,000 writes, and `classList.add` walks all of them; the first
version of the Tier-2 case did precisely that and hung the run. **§0.4's own 153.21 ns for
`setProp(el,'class',v)` was taken the same way on happy-dom, so it is a measurement of that
accumulation and not of a class write — it is struck as a price for a class write.** The Tier-2 case
alternates between two tokens to bound the accumulation, which is why 180.25 ns is a usable number
and still not the number a compiled one-shot write costs. A +216% figure for the class row circulated
in M7c's finding list; no pair in any recorded run reproduces it — the widest recorded is +87%
against a bare `className =` — so it is not adopted, and this note exists so nobody has to wonder
which of the two was checked.

**F3 IS FIXED, AND THE MARKER THIS PARAGRAPH CARRIED IS DISCHARGED HERE.** `setClass` remembers its
own last write on the element (`$$class`, beside `$$s`), which is what "what this channel last
applied" means when the caller cannot thread `prev`. It still removes only the tokens it OWNS, so a
class another channel put there survives — both halves are pinned by `dom.test.ts`, "repeated
one-shot writes replace rather than accumulate" and "a one-shot write keeps tokens this channel never
wrote". The measurement the marker asked for, `bun run bench:tier2:shapes`, 20,000 writes a case,
min of 41 interleaved trials:

| pair | ns per write | ratio |
|---|---|---|
| `setProp class` vs bare `el.className =` — two alternating tokens | 170.75 vs 97.50 | 1.751x |
| `setProp class` vs `className =` + the ownership check *(equivalent work)* | 170.75 vs 120.25 | **1.420x** |
| **`setProp class` vs bare `el.className =` — a FRESH token every write** | 563.50 vs 367.25 | **1.534x** |

**The third row is the one F3's fix bought, and it could not be run at all before.** Every write is a
token the element has never carried, which is what a `class={…}` over a changing value actually does;
under the accumulation it left 20,000 classes standing and stopped the run. It now completes in
11.3 ms for 20,000 writes — linear, and it is checked in as `setProp class fresh` beside
`el.className = fresh` for exactly that reason: a return of the accumulation shows up as this row
going quadratic while the two-token row beside it does not move. Read the pair, not the ns: 367.25 of
the 563.50 is what CHROME charges for a class name it has not interned before, so the dispatcher's
share on a fresh token is **1.534x**, which agrees with the 1.420x equivalent-work reading and not
with the 1.751x bare one. The class channel is therefore +42% to +53% on equivalent work — inside the
+13% to +56% band the other two channels give, and no longer the outlier the accumulation made it.

**THE DECISION DOES NOT MOVE, and the reason it does not is the point.** Compile-time channel
resolution stays justified on *capability* — custom elements, `bind:`, class bitmasks, getting
`class`/`style` into the fused effect. §0.4 reached that decision from "the dispatcher is nearly
free, so do not sell it on speed"; the decision was right and the reasoning was backwards. Sell it on
capability precisely BECAUSE the speed number has now moved by a factor of five between two
instruments and will move again when F3's fix lands: a justification that survives its own number
changing is the only kind worth writing down.

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
- **M7c generalised the first bullet onto the second.** `markEpoch` now also decides when a WAVE
  opens, so N writes between two flushes cost one traversal rather than N. `write: no subscribers` and
  `wide(10)` moved 0.92x and 0.87x against the pre-fix build on that change alone. §0.8 and `SEMANTICS.md`
  R5/R8.

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

### 0.7 THE STANDING RULE — Tier 1 iterates, Tier 2 adjudicates

**Tier 1** is Node, Bun, a stub DOM and happy-dom. It is the iteration tool: fast, deterministic,
runnable from any test file, and it is where a change is developed. **Tier 2** is a real browser —
js-framework-benchmark and js-reactivity-benchmark driven through CDP, durations read from Chrome's
own trace rather than from a wall clock in the page. It is the source of truth. **A Tier-1 win is
PROVISIONAL until Tier 2 confirms it, and a Tier-1 number may not be quoted as a fact about an
application until it has been.** Adopted from Solid's `benchmarking-strategy.md` (§12), whose own
experiment log is full of Tier-1 wins reverted after Tier 2 disagreed.

The rule carries its own evidence. M7b built the lane; M7c ran this document through it, over the
nine claims in `packages/benchmark/src/tier2/claims.ts` — a list written BEFORE the run, so that
"which survive" is answered against a fixed table rather than assembled from whatever the run showed:

- **Three claims died.** §0.2's "a getter is 8.7x" (2.7x in V8, +15% of a real mount's js half).
  §0.4's "the dispatcher is 0–8%" — see the next bullet. §0.3 conclusion 2's "a Scope per position
  costs 7.3 ns, worth a `NO_SCOPE` flag" (sign and significance both flip between runs; the flag
  keeps an allocation-count justification and loses its wall-clock one).
- **One was INVERTED — not merely wrong in magnitude, wrong in direction.** §0.4 struck the three
  designs' "removing `setProp` dispatch is worth 10–25%" as unmeasured, on a happy-dom reading of
  0–8%. In Chrome it is +36% on the one like-for-like pair and +13% to +56% on equivalent work. The
  section had withdrawn a claim that was true.
- **One real algorithmic defect surfaced that no Tier-1 suite could see.** Propagation was superlinear
  in graph depth (F1): barq's per-layer cost ROSE 8.3x over a 16x depth increase while Solid's
  fell, so barq's total was roughly quadratic in depth where Solid's is linear — 27.6x a layer at
  depth 800, and 55.7x/186.6x on cellx1000/cellx2500. All eleven of §0.1's reactivity cases were blind
  to it because their deepest chain is five, and at UI depths (<20) barq wins, which is exactly why
  it survived seven milestones. **FIXED at M7c — §0.8 has the mechanism and the numbers, and §0.1
  now carries a twelfth case, `chain(500)`, that cannot be green while F1 is true.**
- **And one measurement turned out not to exist at all.** §0.3's A/B/C/D/D2/E table — the evidence
  the calling convention rests on — was quoted from a scratch file that had been deleted. F4 above.
- **Plus two quantities Tier 1 never measured at all.** The `js` half of every js-framework-benchmark
  row is 1.2–2.3x Solid's, hidden on seven of nine rows because paint dominates the total; and run
  memory at 1,000 rows is 2.73–2.75 MB against 1.76 MB, with nothing to hide behind (C9, §9.1).
- **What survived, survived properly.** §0.3's "0% through a DOM" reads 1.000x ± 1% on a real one and
  is never significant; §0.2's per-getter absolute reproduces; §0.5's epoch dedupe and `markWave`
  ablations are Tier-1-only by nature and are labelled as such.

Two obligations follow, and they are cheap:

1. **State the instrument beside every number**: which suite, how many trials, what p, what the
   comparand was. Most of the corrections above are corrections to a DENOMINATOR rather than to a
   measurement — one absolute cost, read against a stub row, against a V8 row and against a mounted
   row, gives 8.7x, 2.7x and +15%. A number without its method is what put those claims in this
   document in the first place.
2. **Say what the instrument CANNOT decide, in the same breath.** `claims.ts` carries a `cannot`
   field per claim for this reason: the browser `js` column is ~96% DOM, so it cannot resolve an
   allocation ratio no matter how many trials it gets, and reading its silence as a null result is
   how M7b's own first pass mis-called C1 and C3. A lane that only records what it can measure reads
   every silence as evidence.

**F2 — the obvious instrument was unusable, and anyone re-running this needs to know.** The full
record, including the eight-click table it was read off, is the header of
`packages/benchmark/src/tier2/trace.ts`. In short: js-framework-benchmark's own `afterframe` wall
clock — start a timer at the click, stop it in the frame callback — converges on the **16.5 ms vsync
interval for both frameworks** by the third click (barq 1.1, 6.0, 15.8, 16.4, 16.6, 16.4, 16.6, 16.5;
Solid 0.4, 7.9, 16.4, 16.5, 16.5, 16.5, 16.5, 16.5), because what it measures is when the compositor
next got round to the page. Worse under load: at 4x CPU throttling it
reported **barq 5.7 ms against Solid 84.1 ms**, a 15x "win" that was entirely vsync phase — both
script halves were 0.5 ms in the same trace. The lane therefore does not use it. Durations come from
Chrome's trace, `commit.end − click.ts`, which is js-framework-benchmark's own definition, with the
script and paint halves separated so a row can say WHICH half moved — which is the only reason C9's
"the js half is 1.2–2.3x Solid's on every row" is visible at all behind seven totals that read
parity. Every jfb row in this document publishes both halves for that reason.

### 0.8 F1 — the quadratic was a re-walk, and it was invisible because it did no work

The measurement first, because the mechanism was found by counting rather than by reading. `markNode`
calls for the `__jrbDepth` graph, 10 iterations, per depth:

| layers | `markNode` | `recompute` | `updateIfNecessary` | heap heights scanned |
|---|---|---|---|---|
| 50 | 214,958 | 3,941 | 6,313 | 500 |
| 100 | 854,917 | 7,900 | 12,666 | 1,000 |
| 200 | 3,409,808 | 15,791 | 25,363 | 2,000 |
| 400 | 13,619,617 | 31,600 | 50,766 | 4,000 |
| 800 | 54,439,208 | 63,191 | 101,563 | 8,000 |

**Every column is linear in depth except one, and that one is 253x over a 16x depth increase** — 16²
is 256. So the graph was not being recomputed too often, validated too often, or scanned too often.
It was being MARKED too often, and the extra marks changed nothing: they were re-placed on nodes that
already carried them. That is why no correctness test and no pull-count assertion could see it, and
why the defect is pure waste rather than a trade.

**The mechanism.** `recompute` ended with `propagate(node, CHECK)` whenever a pure computed's value
changed, and `propagate` walked the node's entire transitive subscriber closure. During a pull down a
chain of depth *d*, every one of the *d* nodes recomputes and each re-walks everything below it:
Σ(d−i) marks, quadratic. The marks were already there. A pure node only becomes CHECK or DIRTY
through `markNode`, and `markNode` never marks a pure node without also walking its subscribers — so
by the time a value changes inside a pull, the write that started the pull has already told the whole
closure to revalidate. **Solid's per-layer cost FALLING with depth was the clue**: a framework doing
Θ(1) marking per changed node gets cheaper per layer as the fixed costs amortise. Only a framework
re-deriving something already derived gets more expensive per layer.

**The fix, in `signals.ts`.** `repropagate` marks the DIRECT subscribers only. The direct level still
needs the CHECK→DIRTY upgrade (DIRTY is the only mark that survives an `equals` comparison against an
unchanged snapshot); one level below, CHECK is already correct, because any change must pass through
a direct subscriber to reach them. A subscriber found CLEAN is the one case the invariant says
nothing about, so it gets the old full walk. Second, `openWave` makes a propagation wave an id rather
than a call count: while `markEpoch` is unchanged nothing has consumed a mark anywhere, so the marks
this wave already placed are still standing and a second write in the same batch stops at them. Four
writes in a batch cost one traversal instead of four.

**How the invariant was checked rather than argued.** An audit build re-walked the closure `repropagate`
skips and asserted every node in it was already marked, over kairo + cellx + sBench: **1,514,926,568
edges checked, 0 violations**, with the benchmarks' own pull-count assertions passing. The clean-subscriber
fallback fired 3,018,616 times, so it is load-bearing and not a hedge. Separately, computed-run counts,
effect-run counts, final values and the interleaved execution ORDER of the first three bands are
byte-identical between the two builds at depths 5, 25 and 200 — the fix moves no evaluation.

**What it bought, at Tier 2 in Chrome** (`bun run bench:tier2:jrb`, numbers in §9.1): cellx1000 85.6x
faster, cellx2500 339x faster, `deepPropagation` 3.6x, per-layer cost at depth 800 down from 0.2960 to
0.0068 ms. **At Tier 1, on the shallow graphs that were already winning, nothing regressed** — 7
processes × 41 paired trials against the pre-fix build: 5 wins, 7 ties, 0 losses, the wins being
`chain(5)` 0.86x, `wide(10)` 0.87x, `write: no subscribers` 0.92x, `diamond` 0.96x and `chain(500)`
0.02x. The batch-wave change is why the shallow rows moved at all.

### 0.9 C9 — the three DOM rows barq lost, and what each of them turned out to be

Three rows, three unrelated causes, and only two of them were the list runtime's. Every number below
is real Chrome; the before/after ones are the two runtimes INTERLEAVED in one browser session
(`src/tier2/ab.ts`, a `git worktree` at the previous commit against the working tree), because a jfb
row moves several percent between whole runs and that is larger than any of these effects.

**`clear rows` — 1,000 `removeChild` calls against Solid's one `textContent = ""`.** Counted rather
than guessed: `Node.prototype` instrumented across one timed clear reports barq at 1,000 `removeChild`
and 0 `textContent` writes, Solid at 0 and 1. Solid's `cleanChildren` takes the bulk write whenever
the insert owns its parent; `syncRows` had no such case and walked the groups. The fix is in
`removeNodes` in both `dom.ts` and `flow.ts`: when the run being removed IS every child of its
parent, one `textContent = ""`. The guard is exact rather than a heuristic — the count must equal
`childNodes.length` AND every node must actually be under that parent, because a run whose nodes a
`portal` moved out could match the count while naming different nodes, and being wrong here deletes
markup the list does not own. Pinned by six cases in `flow.test.ts`, four of which are the guard
REFUSING: a static sibling before the list, one after it, a second list in the same parent, and the
same four again through disposal rather than through an empty update.

| instrument | before | after | |
|---|---|---|---|
| in-page wall clock, click + microtask, 31 paired reps, unthrottled | 2.645 ms | **2.195 ms** | **0.830x, p=5.1e-3** |
| in-page wall clock, click → frame, same reps | 3.375 ms | 3.165 ms | 0.938x, p=5.2e-1 |
| CPU sampler, 21 paired reps, self time in the timed window | 3.788 ms | 3.285 ms | 0.867x |
| the jfb row itself, 4x CPU, 41 paired iterations | — | — | 0.982x, p=7.3e-1 |

**Read the four rows together, because the last one is the honest part.** The JavaScript the framework
runs to empty the table is 17% cheaper and that reproduces on two independent instruments at
p=5.1e-3. The jfb row does not move, and the second line says why: once Blink's own detach and
layout for 1,000 `<tr>` are inside the window, the saving is 6% and indistinguishable from noise.
Against Solid the row went from 1.135x (js 10.80 vs 9.07 ms) to **0.991x (js 9.9 vs 8.9)** — but that
is two whole runs compared, which is exactly the comparison this section says not to trust; the
paired A/B is the evidence and it says 0.830x on the JS half and nothing on the frame.

**This corrects a reading in §3.4, and the correction is about SCALE.** `FAST_CLEAR` was deleted at
M4b for moving neither counter — measured **at 50 rows**. That reading stands at 50 rows and is wrong
at 1,000. It also did not need to be a compiler flag: the compiler would have had to PROVE sole
ownership of the parent, while the runtime can test it exactly, locally, in two comparisons.

**`select row` — barq has no `createSelector`, and this is the row's whole story.**
`apps/jfb-barq.tsx` said so before the row was ever measured: `class={() => selected() === row.id …}`
puts every row on the `selected` signal's subscriber list, so a selection change wakes 1,000 effects
where Solid's selector wakes 2. It is not the DOM path — instrumented, both frameworks issue exactly
ONE `className` write per selection. Measured as scaling, which is the form the claim is actually
in (selection change, click + microtask, median of 21, unthrottled, interleaved):

| rows | barq | Solid | barq − Solid |
|---|---|---|---|
| 1,000 | 0.790 ms | 0.295 ms | 0.495 ms |
| 10,000 | 2.810 ms | 0.810 ms | 2.000 ms |

barq's excess over Solid rises 4.0x for a 10x row count; Solid's own rise is the browser's, and both
sides pay it. **Nothing in `dom.ts`, `flow.ts` or `map.ts` can close this** — `setClass` early-returns
on an unchanged value in two comparisons, and the cost is 1,000 effect wakeups reaching it. Two things
would, and both are elsewhere: a `selector` primitive in `signals.ts` (one node per key, O(1) fan-out),
and the fused-props codegen's `() => ({ a: … })`, which allocates an object per row per notification
and is why the sampler shows a garbage-collection line on this row at all. Recorded as a
capability gap rather than a defect: the row is reported and, as `apps/jfb-barq.tsx` already says,
never used to adjudicate a barq-internal claim.

**Run memory at 1,000 rows — barq allocated 1,760 bytes a row against Solid's 1,030.** Heap-sampled
during one `run`, per allocation site, the top of each side. barq: `signal` 452 B, `createComputedNode`
291, the compiled row body 249, `createOwnerScope` + `hostScope` 226, `link` 105, `buildData` 70,
`insert` + `applyInsert` + `childToNodes` 138. Solid: the compiled row body 231, `buildData` 171,
`readSignal` 125, `Set` 102, `createComputation` 87, `root` 74.

Two of those lines were the list's and both are gone. **An index signal per row that no row read** —
`mapArray` decides `wantsIndex` from `map.length`, and `each` hands it a three-parameter mapper
whatever the row Block's own arity is, because `block()`'s brand is a one-parameter wrapper and erases
it. Every row therefore reported that it wanted an index and paid for a whole signal: a node, four
closures and the property backing store an accessor carrying `set`/`update`/`peek`/`_node` needs. It
is now created on the row's FIRST index read, so a row whose markup mentions no index costs one
accessor. **And a closure per row that existed only for the hydrating cursor to wrap** — nothing is
hydrating in the ordinary case, so the row builds without it.

| | before | after |
|---|---|---|
| allocated during one `run` of 1,000 rows | 1.76 MB | **1.47 MB** |
| `signal`, per 1,000 rows | 452 KB | **226 KB** — exactly halved, which is the index signal |
| run memory, paired A/B in one session | 2.71–2.77 MB | **2.48 MB, −10.5%** |
| run memory against Solid | 2.73–2.75 vs 1.76 MB (1.55x) | **2.55–2.59 vs 1.76–1.82 MB (1.40–1.47x)** |

**The rest is `signals.ts`'s and is stated so it is not re-derived.** What remains per row is 312 B of
`createComputedNode` against Solid's 73 for the same two effects, and 251 B of Scope against Solid's
46 for `root` — 4.3x and 5.5x on the two allocations a row makes most. `signal()` is the third:
one node object plus four closures plus a backing store, against Solid's object plus a bound read and
a setter. **This is the same M4b reading corrected the same way as `FAST_CLEAR` above.**
`INDEX_UNUSED` was deleted for moving no counter at 50 rows; at 1,000 it is 226 KB, and like
`FAST_CLEAR` it needed no flag, because a lazily created signal decides it per row with no proof from
the compiler at all.

**One thing this section found and did not fix, recorded rather than left in a profile.** Building
1,000 rows, barq issues 2 `textContent` writes and 6 `firstChild` reads per row where Solid issues 1
and 4 — `applyInsert`'s sole-occupant path tests `parent.firstChild` and then reads it again to
recover the node it just wrote. It is worth two DOM crossings a hole, `create rows` is at 0.992x
against Solid on total already, and it is named here so the next pass at the insert path starts from a
count instead of a guess.

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
| **All three designs' "setProp dispatch is worth 10–25%"** | ~~Measured 0–8%.~~ **They were right and this row was wrong** — Chrome says +36% like-for-like and +13% to +56% on equivalent work (§0.4, C6, M7c). The pass stays; the justification is capability anyway, and stays there for the reason §0.4 now gives. |
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
dynamic(s, parent, anchor, cell: Cell<Out>)
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
  into the caller's expression — `provide`, `boundary`, `dynamic`, any Block invocation whose result is
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

`Show`, `Switch`, `Match`, `Repeat`, `Dynamic`, `Portal` **cease to exist as components**.
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

**`dynamic(s, parent, anchor, cell)`** — a hole whose value is arbitrary. `Portal` is `dynamic` with the
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
Scope; ~~worth 7.3 ns/instance measured~~ — worth an allocation per instance and a wall-clock cost
Tier 2 cannot separate from noise, §0.3 conclusion 2 as corrected at M7c), `SINGLE_NODE`, `FAST_CLEAR` (`textContent = ""`),
`INDEX_UNUSED`. **Discipline, enforced in review: a flag that moves neither an allocation
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
tracked either way, so there was nothing to skip). `KEEPALIVE` is **deleted from the list at M7b**: it
was the parking flag, parking is not something this design does (§3.8, `SEMANTICS.md` A5), and a flag
kept against a feature nobody is going to build is the same rot the discipline above exists to
prevent. It was never emitted and never read, so the deletion is to this list only.

**BOTH DELETED FLAGS NAMED SOMETHING REAL, AND M7c FOUND IT AT A SCALE OF 1,000 (§0.9).** The M4b
reading is not withdrawn — at 50 rows neither moved a counter and that is what it says. At 1,000 rows
the bulk clear is 17.0% of the JS a `clear rows` costs (p=5.1e-3, paired) and a lazily created row
index is 226 KB of the memory row. **What is withdrawn is the assumption that either had to be a
flag.** `FAST_CLEAR` would have needed the compiler to PROVE a list owns its parent's child list;
`removeNodes` tests it exactly at the moment of removal, in two comparisons, and gets the cases a
proof would have had to give up on. `INDEX_UNUSED` would have needed the compiler to prove a row
Block never reads its index, which `block()`'s one-parameter brand makes unreadable anyway; creating
the signal on the first read decides it per row and needs nothing from the compiler. **The rule the
discipline should carry forward: a flag that moves no counter has not earned emission — but measure it
at the size the benchmark it is named for actually runs at, and ask first whether the runtime can
decide it without being told.**

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
- **Nothing is parked, and there is no transition API.** *(Corrected at M7b; `SEMANTICS.md` A5 is the
  specification.)* This bullet previously read "`Loading` is a boundary with `KEEPALIVE`: the content
  instance is **parked**, not disposed — its scope stays alive, its DOM moves to a detached fragment,
  its effects suspend", and "`transition(fn)` creates a pending scope beside the live one … holds it
  detached until every resource registered there settles, then commits."

  Both are **dropped**, not deferred. §12 records why: the reference implementation deleted
  `startTransition` and `useTransition` outright, keeps live DOM mounted showing stale content, and
  parks nothing. Parking was never a prerequisite for transitions — it is an alternative nobody took —
  so the three questions Q7 could not answer dissolved instead of being answered, and `KEEPALIVE` is
  deleted from the flag list rather than left unbuilt.

  What replaces them is smaller and lives entirely in `packages/core`: **two buffers on the opt-in
  node**, authoritative and override, with one patch per lane in the override and a lane per running
  `action`. A live write lands in the authoritative buffer underneath the override, so settling is
  just dropping the override onto a value that is already correct. `latest(fn)` reads through the
  override, a normal read sees it, `isPending(fn)` reports it. No second scope, no fork, no
  reconciliation step, and no `MutationObserver` claim to make because nothing is held back.

  Solid's union-find lanes are **not** adopted: they merge transactions inferred from graph
  reachability, and `action()` already delimits the transaction exactly. See A5, clause (g).
- **The compiler surface is `<form action={fn}>`** *(M10, `SEMANTICS.md` B8)*. It is the place an
  action meets JSX, and until M10 it was the place an action was silently destroyed: `action` went
  down the attribute channel, `bindProp` applied §3.0 rule 1 to it — an `action()` is
  `(...args) => Promise<R>`, so its arity is 0 — and the action was CALLED at mount with the promise
  it returned written into the form's target as `action="[object Promise]"`. Neither half reported
  anything.

  The rule is §3.5's own, already written for the case next door: a function arriving at a HANDLER
  slot is the handler, never a Cell. `action` on a `<form>` is that slot, which is where React 19
  and Solid 2.0 both landed. `Op::FormAction` rather than a channel, because the listener it
  installs is owned by the position (B4) and a channel call has no scope to give it. A literal URL
  still folds into the template; the string backend writes a URL and writes nothing for a handler.

  This is also what makes §3.8 gradable: before it, every one of A5's nine procedures ran from a
  hand-written call in `actions.test.ts` and no corpus fixture reached an action at all.
- **Optimistic state is derived, never restored:** `() => reduce(base(), pending())`. Today
  `registerRevert` captures `revertTo` once per (target, action), so a real write landing during the
  action is rolled back to a value that is now wrong, and `optimisticStore` `structuredClone`s
  the whole store to do it. With no snapshot there is nothing to clobber.
- Deleted: `Suspense` (two `queueMicrotask`s that subscribe to nothing and flip regardless), `Await`,
  `createResource`, `suspend`, `awaitAll`.

### 3.9 State

`signal`, `computed`, `effect`, `batch`, `untrack`, `store` (deep), `produce`, `reconcile` retained in
kind. A signal getter **is** a Cell, with `.set`/`.peek`/`.update` on the function object — so a
signal is passable as a prop with zero adaptation and η-reduction (`x={s()}` → `x: s`) is sound by
construction. `useState`'s degraded getter (`hooks.ts:11-22` returns a bare `() => s()`, dropping all
three) is deleted.

**New: `linked(source, compute, {equals})`** *(delivered at M7; `SEMANTICS.md` R7)* — writable derived
state that re-seeds when its source changes. It is `signal(fn)` with the source split out of the
closure and nothing else: the writable computed already had exactly these semantics, and what was
missing was a name for them. One primitive covering three problems the ergonomics work identified separately: the
read-copy trap (`useState(props.value)` freezing at the first value), controlled inputs, and two-way
component props. Angular's `linkedSignal` is the shipped precedent.

**Reactivity is entered** only inside `fx` / `effect` / `computed` / the internal compute of
`branch`/`each`. **Exited** by `untrack`, `peek`, and structurally by the apply phase of every element
effect and by component bodies running untracked.

### 3.10 Forms and binding

*(Delivered at M7 except where the paragraphs below say otherwise. `SEMANTICS.md` B6 and B7 are
`HOLDS`; `linked` is R7. Two clauses are NOT built and are named rather than left to be discovered:
`<select multiple>` has no option-loop coercion, and `ssr.ts`'s `DIRTY_VALUE` is keyed by TAG, so the
string backend drops the `value` attribute of a `checkbox`/`radio` where the HTML spec reflects it —
which is why `bind:group` is driven under `fixtures/semantics/` and not in the SSR corpus.)*

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

Two things building it added to the design, both found by driving it rather than by reading it:

- **The DOM-compare is not enough on its own, and the reason is not in this section.** When a setter
  REJECTS a keystroke the signal does not change, so the effect never re-runs and no comparison of
  any kind gets the chance to run. `bind:` therefore re-asserts the signal synchronously inside the
  reported edit — and again at the next flush, through a counter every two-way binding subscribes to,
  because the scheduler's (correct, glitch-free) dedupe cannot see that the DOM moved while the
  signal came back to where it started. That is B6's two-writer problem one level down.
- **The user-mutable set is keyed by the PAIR `(tag, property)`, not by the property.** `<option
  value>` is the negative that forced it: an option's `value` falls back to its TEXT, so a compare
  against the element reports "already holds it" and the reflected attribute never appears.

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

**Hydration is claim-based, and the wire carries what RECOVERY needs.** *(Delivered.
`SEMANTICS.md` H1–H4 and H6 are `HOLDS`.)* A range owner writes boundary comments at **block
boundaries only** — `<!--[-->` … `<!--]-->` — and **only where the client cannot determine the
range's extent for itself**. Elements are claimed by the same walk carrying a hydration-only logical
index (`child(n, 3)`), which costs nothing on the client-render path. On mismatch, only that range
re-renders. `container.textContent = ""` is gone from the hydration path — `mount(block, container,
claiming)` is the one line that decides — and `markerId` no longer participates in anything the
compiler emits.

**DETECTION is a separate axis, and it is `dev`.** §12 reversed §11 Q4 on the measurement §11 Q4
asked for. Under `dev + hydratable` the string backend spells the key the primitive CHOSE into the
open comment — `<!--[k-->` — and the DOM backend asks `template()` to compare the subtree it claimed
against the one it would have built. A production build emits neither. The two halves ride the same
flags integer both backends already take, as `HYDRATE` and `DETECT`.

Three things the design did not anticipate, all found by building it:

- **A HOLE needs the boundary comments as much as a branch does — unless it owns its parent.** The
  parser fuses a dynamic text run with the static one beside it before the client ever sees them, and
  the closing comment is the anchor that keeps `insert` off the sole-occupant `parent.textContent`
  write. Both arguments dissolve when the hole is the only thing in its element: nothing is beside it
  to fuse with, and its extent is every child of the parent. That predicate is where 4,800 of the
  100-row page's 6,416 hydration bytes were. It is refused inside `<pre>`, `<textarea>` and the
  rawtext family, where §3.13 item 8's newline-eating makes the OPEN comment load-bearing.
- **A ROW of an `each` needs nothing at all.** Rows are produced in order, so a row's extent is what
  its build consumed from one shared cursor — 1,600 more bytes, and no compile-time proof required.
- **Skeleton `<!---->` markers have to be on the wire.** The logical index counts them, so a marker
  the string backend omitted would shift every index after it by one — which is why the anchor pass
  runs for the string target under `hydratable`, and only under it.

**Measured, on the 100-row page: production `11513 → 11513` bytes raw and `997 → 997` gzipped.**
Zero, exactly, against M6b's +55.7% raw and +7.3% gzipped. Development pays +0.1% raw and +1.8%
gzipped, which is the key and one range. On this page a production hydratable render and a
non-hydratable one emit the same bytes, so the 2.10x SSR headline is like-for-like on it.

**And zero is a property of that page's SHAPE, not of the split — stated because one page was not
enough to say it.** Every dynamic value on it is the sole occupant of its `<td>`, which is precisely
the case that needs no comments. A second 100-row page of the same length whose holes have static
siblings and whose rows carry a `<Show>` costs **+51.0% raw and +5.5% gzipped** in production
(`13539 → 20439`, `1027 → 1083`) against M6b's +55.7% / +7.3%. The corpus line in the same test always
said so: `11422 → 12846` bytes, +12.5%. Both pages are measured in `test/hydration.test.ts`, and the
mixed one is asserted to be LARGER so no later reading can quote the zero alone. `SEMANTICS.md` H2
carries the table.

With the comment nodes off the wire and the subtree walk off the production path, claiming went from
1.4–1.6x more node work than replacing to **1.12–1.31x faster** than it.

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
| ~~`Show`/`Switch`/`Match`/`Repeat`/`Dynamic`/`Portal`/`Reveal` as **components**~~ **STRUCK at M10 — they are the `-O0` emission; see below** | ~450 | Ten copy-pasted `dispose → clearRange → scope → insertNodes` bodies, each with its own bugs: `Show` re-registers `onCleanup` **inside** its renderEffect (`components.ts:154`); `Dynamic` and `Portal` use detached scopes where `Show` uses attached; `Dynamic`'s string branch is a fifth element-creation path that JSON-stringifies objects into attributes and never removes its listeners. |
| ~~`Suspense`, `Await`, `ErrorBoundary`~~ **STRUCK at M10, same reason** | ~196 | Legacy duplicates of `Loading`/`resource`/`Errored`. `ErrorBoundary` reads its children **outside** its own boundary and lacks the `NotReady` guard. |
| `createResource`/`suspend`/`awaitAll` (`async.ts:154-234`) | 81 | Not exported from `index.ts`; referenced only by their own tests. |
| `setProp`/`applyProp`/`applyResolvedProp`/`diffClassList`/`diffStyleObjects` dispatch | ~180 | The compiler holds every fact these re-derive as a `NameFlags` bit. Tables move to Rust and to the generated `.d.ts` — one source of truth. |
| `mergeProps`/`merge`/`omit`/`splitProps` `for…in` bodies | ~90 | Become one-liners over `Object.assign` and destructuring. Law 4 does the work. |
| `useRef()` and the `{current}` shape | — | Refs get their own channel. |
| Snapshot capture, `markInMotion`, `affects`, `peekNextChildId`, `getNextChildId`, `resetChildIds` | ~120 | Zero consumers outside core's own tests, and the first three cost `_affected` and `_snapshot` slots on **every** signal node. |
| ~40 exports with no consumer anywhere | ~350 | `JSXFragment`, `SUPPORTS_PROXY`, `VERSION`, `asElement`, `asNode`, `getProperty`, `isFunction`, `onSettled`, … Of 132 value exports, 62 have no consumer outside `packages/core`. |

The API restarts from the ~70 exports that are actually used and re-earns the rest. Anything kept for
parity is import-flipped so it is tree-shakeable and off the node shape.

#### What M9 changed about this list, on measurement

Three rows above were written when the compiler could not emit what it emits now, and M9 reversed
them rather than forcing the runtime through a shape the compiler cannot produce. Each is a
reversal on evidence, and each is stated here so the table above is not read as the outcome.

- **`spread()` is KEPT, and is now the compiled channel.** The row says "never emitted by the DOM
  backend"; that was true because P1 refused any element carrying a spread. §5.2 said that refusal
  had to go, and it has: an element with a spread stays on the template path and the spread is an
  `Op::Spread` the DOM backend emits as `_$spread($s, el, sources)`. Its NAMES are §3.13 item 1 —
  the one attribute fact the compiler cannot have — so the runtime resolves them, which is also why
  `setProp` and `channelOf` survive with it. Everything else in the dispatch row still goes: no
  compiled element write asks a name question.
- **`createElement` is gone, and `element(scope, tag, props)` replaces the part of it that was not
  a second calling convention.** The objection was to a second implementation of COMPONENT
  invocation, and that is what left. Building one element by tag NAME is a different thing and is
  still needed twice — for `<Dynamic component={"div"}>` (§3.13 item 4) and for the intrinsic the
  browser's tree builder would not produce as written. It takes a scope, applies props through
  `spread` and children through `insert`, so it is not a fifth path: it is the same two entry
  points a compiled element uses, minus the clone.
- **The Block brand does NOT go behind `dev`, and the reason is a measurement.** The item asks for
  the brand to be DEV-only because "it allocates a closure per construction to serve two DEV
  facilities". Two things are wrong with that. First, the closure is not a DEV facility: it
  establishes the ambient owner (`currentOwner = scope`), which is C1/O4.5 — without it the argument
  decides only for the primitives that take a scope explicitly, and every `getContext`, `onCleanup`
  and `effect` in the same body follows `CURRENT`, which is the Provider bug split across two
  owners. Only the `[BLOCK] = true` property write is DEV, and a property write is not a closure.
  Second, the cost was ablated: `block()` reduced to the bare brand, 100-row page,
  `renderToString` envelope, 51 trials x 100 iters —

  | build | median µs |
  |---|---|
  | brand + guard (shipping) | 4.62, 4.88 |
  | brand only (ablation) | 4.53, 4.74 |

  The two shipping runs differ by more than shipping differs from ablated, so the effect is inside
  this harness's noise floor. That agrees with M5, which measured the same thing from the other
  direction and recorded it in as many words: "The SSR bar did NOT move with it, and the brand was
  not the cause." The item is closed on evidence, not done.
- **`Dynamic`, `Await` and `Reveal` lower**, so the components go with the other ten. `Await` is
  two nested boundaries — reading a resource throws `NotReady` before it settles and throws the
  error after it fails, which IS the three-state key the adapter computed — and `Reveal` keeps its
  provide scope as `reveal($s, order, collapsed, body)` in `flow.ts`, beside the four primitives
  rather than among them.

#### What M10 changed about it, also on measurement

- **The fourteen flow components and `ssr.ts`'s twelve string adapters are STRUCK from the list,
  not deferred.** M9 put them back and recorded the blocker as one compiler gap: `passes::flow`
  could not lower a construct whose props arrived through a SPREAD. M10 closed that gap for ten of
  the thirteen — `admits_spread` names the three that still refuse and why — and the last surviving
  flow import at `-Ox` went with it, 1 of 131 fixtures to 0.

  The adapters stayed anyway, and the reason was never the gap. **`Opt::flow` is one of the nine
  flippable knobs and `-O0` turns it off**, so at `-O0` the pass does not run, every construct is a
  component call, and the adapter is what it calls. Over the corpus:

  | level | fixtures keeping a flow import |
  |---|---|
  | `-Ox` | **0** of 131 |
  | `-O0` | **37** of 131, across all thirteen constructs |

  `-O0` is not a debug convenience. §6 L3 grades every optimisation by rendering the corpus at both
  levels and requiring the frames to agree, so the `-O0` emission is the flow pass's own reference —
  deleting the adapters would delete what the pass is graded against. This is a third independent
  reason after M9's two, and unlike those it is not a gap anybody can close: it is what a flippable
  optimisation MEANS.

  What the lowering buys instead is the `(parent, anchor)` pair §3.4 exists to deliver, at every
  spread site. `<For {...opts}>` emitted `_$insert($s, el, For($s, _$props([…])))` — an adapter
  frame inside an insert hole, at a position the compiler already knew — and now emits
  `_$each($s, el, null, …)`. On the one fixture that had this shape before, effects (3 created / 8
  runs) and clones (3) are unchanged and the emitted function grew 327 → 336 bytes: the work was
  always the same work, and what leaves is the frame and the import.

- **`Show`'s `keyed` was the one place M9's "the two answers are different programs" was true**, and
  it is emittable anyway. The two programs differ in exactly two expressions — the key, and what the
  content Block is handed — and `branch`'s ABI covers both, because a single Block used for every
  key is already what the keyed arm passes. The two-row table is an optimisation of the keyed shape
  rather than a second mechanism.

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
- `scope`/`getOwner`/`runWithOwner` → `enter`/`exit`/`dispose`/`pin`. `owner._context` spread →
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

**M9, in full.** The tree-construction gate is re-based from "what `createElement` would build" to
"what a browser's tree builder produces", and every refusal that existed only for parity with the
un-compiled path is gone with it:

| refused before M9 | now | why the refusal was parity, not a parse fact |
|---|---|---|
| a JSX fragment | an ARRAY of its parts | `template()` returns `content.firstChild`, so a fragment is one template per root plus an array. Nothing needed a component. |
| `<select multiple>` with options | one template | `multiple` is the one DOM_PROP whose ATTRIBUTE is the state, so the parser puts it in place before the options arrive — which is exactly what §3.13 item 8 requires and what writing it as a property after the clone failed to do. |
| `<math>` | one template | `<math>` switches the tokenizer into foreign content and the clone carries the MathML namespace. Only `createElement`, which reaches `createElementNS` for SVG alone, could not produce it. |
| `<template>` | one template, when nothing inside is dynamic | its children land on `.content`, which `cloneNode` copies. What a clone cannot carry is a WALK into them, so a hole inside one still leaves the template path. |
| a hole in `<style>`/`<textarea>` | one template, with the whole child list as ONE insert | a `<!---->` inside raw text is character data, so the hole may never be given an anchor — and it never needs one, because it owns the element. |
| `dangerouslySetInnerHTML` beside children | one template, children not baked | the write is an attribute patch and attribute patches run before inserts, which is the ordering `createElement` got by applying props before appending. |
| an element carrying a spread | one template, no attribute baked | see §4.1's M9 note: the ordering is source order on both backends, which is the one arrangement that agrees with itself. |

What is genuinely refused after that is markup no clone can carry — `<td>` outside a row, `<body>`
— and it is BUILT by `element(scope, tag, props)` rather than refused to a second runtime.

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

#### Executed at M9 — what each channel actually became

The retirement above was written as a design. This is what shipped, and it is recorded here because
two of the replacements are not the ones this section anticipated.

| channel | was | is |
|---|---|---|
| rendered DOM | differential against `createElement` | a per-fixture GOLDEN (`__snapshots__/oracle.test.ts.snap`, every frame plus every attribute line) beside the `-O0`/`-Ox`/`interp` differentials |
| effect counts | an upper BOUND against the oracle's count | `test/effect-counts.ts` — 131 hand-written rows, `created`/`runs`/`busiest`, each an **equality** |
| node identity | differential, under a per-frame guard | metamorphic (`metamorphic.ts`), unconditional; the differential survives only as a clean-vs-corrupted DETECTOR |
| marker layout, attribute partition | already self-checks | unchanged, in `harness.ts auditCompiled` |
| the corruption self-checks (L6) | corrupted-vs-oracle | corrupted-vs-CLEAN-COMPILED (`compareToClean`, `compareRuns`) |
| `ssr.test.ts`'s reference | the un-compiled path | the DOM backend (`renderSsrViaDom`) — L2's construction, one IR and two `Backend` impls |

**The bound became an equality, and that is the substantive change.** "Fewer effects than the oracle
is the entire point of the compiler" made the old channel one-sided, so a binding that silently went
missing — target #1 over-applied — was reported as a win. An absolute number catches both directions
and needs no `goesLive` to lift it: a hole O4 turns live simply makes the row one higher.

**`wins` and `goesLive` are deleted from the corpus**, 12 and 18 declarations respectively. Reason 2
above is the whole of it: both were exemptions from a comparison that no longer runs. The exemption
count across `graded.ts`'s whole table went 3 → 1, and the one that remains is
`leak-known-failures.ts`, which is a real defect rather than a reference artefact.

**Two live findings came out of the retirement, which is the argument for it.**

- `attribute_expression` handed a JSX attribute's string literal to the runtime **un-decoded**, so
  `title="a &quot; b"` reached `setAttribute` as the six characters `&quot;` and serialised as
  `&amp;quot;`. It hit `element(scope, tag, props)` and every component prop; the template path was
  correct because the parser resolves references out of baked bytes. Nothing could see it: the
  reference was un-compiled, so it never went down either channel, and the one comparison that would
  have caught it compared SSR against that same reference. Re-pointing that comparison at the DOM
  backend failed on the first run.
- The coarse marker bound counted `_$insert` call sites as the only anchor consumers. K5 lowered
  control flow onto the four primitives in M4b, so a `branch`/`each`/`boundary` anchor had been
  counted as unanchored ever since — masked because `flow-prop-eta-boundary` carried `marker-count`
  among the kinds of a registry row whose stated cause was C1. A stale bound had been sitting inside
  an exemption written for something else.

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

So the ungated front end needs an **absolute** grader, and two exist. The `createElement` oracle was
one — which is why L4 retiring five channels was not to be read as retiring `oracle.test.ts` while
nothing had replaced it for P2 and P4. The other is executable and lives in `test/optimisation.test.ts`
("the front end L3 cannot grade, graded absolutely"): the smallest claims that pin what the classifier
decides — a tracked read is live wherever it is written, a snapshot of one is not — asserted in every
live mode, and written in the DIRECT form the corpus steers away from.

**M9 discharged the condition rather than waiving it, and the mutation gate is the evidence.** Two
absolute graders replaced the one that went — `test/effect-counts.ts` (131 equalities, and an
equality reports a LOWER count as loudly as a higher one, where the old one-sided bound treated it
as a win) and the per-fixture rendered-DOM golden (a read that stopped being live changes a driven
frame, and every frame is recorded). Neither is a differential.

`test/mutants.ts` was then re-run on the build with the oracle gone: **23 rows, 22 killed and 1
equivalent**. `classify-makes-a-tracked-read-static` — the row this section names as the one only
the oracle and the optimality claims caught — dies on four channels now, and the report names them:
EMI over the corpus, the `-O0`/`-Ox` DOM differential, the flow bisect, and the front end's own
absolute claim that every emitted flag is one the compiler proved. That is a measurement rather
than the inference above it, and it is a broader answer than this section predicted: the corpus has
grown a fixture whose bare read the differential CAN see, so the mutation is no longer invisible to
L3 either.

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
const Ctx = context();                       // no default → a miss THROWS
const Child = () => <span>{Ctx.use()()}</span>;
export const App = () => <Ctx value={1}><Child /></Ctx>;
```

**Emitted today** (verified against `barq-compiler.linux-x64-gnu.node`, `warnings: []`)

```js
export const App = () => (0, Ctx.Provider)({ value: 1, children: Child({}) });
```

`Child({})` is an **argument**. It runs at the call site, under the caller's owner, before
`scope` inside the Provider has created the scope that `owner._context[id] = props.value` writes
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
`_K1[k]` under it, insert at the anchor. With `NO_SCOPE` proved, no Scope is allocated at all — one
allocation per instance saved, and a wall-clock saving Tier 2 cannot resolve (§0.3 conclusion 2, C3,
corrected at M7c; the 7.3 ns/instance figure was a stub-DOM reading and does not survive as a
magnitude).

What this deletes: ten copy-pasted `dispose → clearRange → scope → insertNodes` bodies with
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
  module-level SSR→DOM downgrade and `BARQ007` — the diagnostic that announced it. All thirteen
  constructs have a string component in `ssr.ts` (ten of them reached only when the flow pass
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

**M7b — the split M6b's two declared numbers forced.** §12 reversed §11 Q4 on the measurement above.
The wire carries what RECOVERY needs; DETECTION is an emission axis a dev build turns on.

- **The wire, minimised by asking per position what the client can re-derive.** A hole that is the
  only thing in its parent element writes no comments — its extent is every child of the parent, and
  no other index in that parent exists to be disturbed. A row of an `each` writes none — the rows are
  built in order, so a row's extent is what its build consumed from one shared cursor. A range that
  owns its parent element writes none in production. Refused inside `<pre>`, `<textarea>` and the
  rawtext family, where §3.13 item 8's newline-eating makes the OPEN comment load-bearing; refused for
  a loading boundary, which can flush `<!--[b:N-->` at run time and no predicate can see that coming.
- **Detection, as `dev + hydratable` on both backends.** The string backend spells the key its
  primitive CHOSE into the open comment; the DOM backend passes `template()` a third argument and it
  compares the subtree it claimed against the one it would have built, now by static TEXT as well as
  by node name. The bit reaches the string backend alone — the key is a byte on the wire and only the
  writer needs telling.
- **The number, re-measured — and the shape it depends on.** 100-row page, production:
  `11513 → 11513` raw and `997 → 997` gzipped. ZERO, exactly, against M6b's +55.7% and +7.3%.
  Development: +0.1% raw, +1.8% gzipped. But every hole on that page is the SOLE OCCUPANT of its
  `<td>`, which is the one case that needs no comments; it is jfb's table, not an ordinary page. A
  second 100-row page whose holes have static siblings and whose rows carry a `<Show>` costs +51.0%
  raw / +5.5% gzipped in production. The claim that survives is "zero where a hole owns its parent's
  child list", not "byte-identical"; both pages are now measured and the mixed one is asserted
  non-zero.
- **And the number nobody asked for.** Claiming went from 1.4–1.6x SLOWER than replacing to
  **1.12–1.31x faster**, at the same four page sizes in the same harness: the comment nodes left the
  wire and the O(subtree) comparison left the production path.
- **What production gives up, registered rather than averaged.** Three corruptions survive a
  production hydration — a wrong tag, a missing element, an extra element, each in the middle of a
  claimed subtree. Each carries the exact tree it produces, and each is DETECTED in the development
  column of the same table. `hydration-mutations.test.ts` runs its whole table through both builds.
- **What production gained.** `activate` catches `HydrationMismatch` from the claiming attempt and
  rebuilds that range. Until M7b only a disagreeing branch key reached a region's own catcher and
  every other kind cost the page; the divergence the key was the only evidence for is now caught
  structurally AND confined.

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
derived optimistic state; the `bind:` family with DOM-compare and selection preservation; `linked`.
*(This line originally also promised `KEEPALIVE` parking and transitions as scope forks. Neither is a
deliverable any more — see M7b.)*

The ASYNC half landed. `resource(source, fetcher)` is an async memo: the read is a Cell that throws
`NotReady` before settlement (A3), the `AbortController` is a cleanup on the creating scope and the
signal is handed to the fetcher (A1), and every run's continuation compares the generation it
captured at call time (A2). `createResource`, `suspend`, `awaitAll` and the `ResourceState` union
are gone. `optimistic` and `optimisticStore` are derivations over a settled value and a
list of pending layers, so rollback is the removal of a layer rather than the write-back of a
snapshot (A4). A1–A4 and E2.3 moved from `VIOLATED` to `HOLDS` with three new L1 fixtures.

`KEEPALIVE` parking and transitions did NOT land and were not attempted: §11 Q7 records that the
"scope forks only" answer was overruled and that the design does not exist yet. Nothing in the
resource depends on either: cancellation is disposal, not parking.

**M7b — transitions, and the reading that unblocked them.** §12's Q7 entry closed the question by
reading the reference implementation rather than by resolving the dichotomy: both horns were wrong,
nothing is parked, and there is no second scope. A5 is now a seven-clause specification with nine
falsification procedures and is no longer the one `NOT SPECIFIED` rule.

What landed is in `packages/core` only — the compiler emits nothing for transitions because there is
no transition API to call. `optimistic` moved from three reactive nodes (a settled signal, a
`layers` signal and a memo folding one over the other) to **one node with two buffers**, and
`optimisticStore`'s two stores were already those two buffers and gained the same mode-routed
read. The M7 pending-layer list was not replaced by a second mechanism: it *is* the override buffer,
and the resource's single `override` slot is the same thing at arity one. What forced the buffers onto
the node was the read surface — `latest` and `isPending` are read MODES, a mode is not a dependency,
and a memo would cache one mode's answer and serve it in another (A5, clause (f)).

Three things the first cut of A5 got wrong and this milestone fixed, each now a falsification
procedure of its own. A generator resumes IN-CONTEXT, so the server's answer written after the
`yield` — the canonical shape the whole API exists for — went to the override buffer and was thrown
away on retire, reverting to the pre-action value; `commit(fn)` runs its body with the lane suspended
and is the write-side counterpart of `latest`. A lane's second write to one value REPLACED its first,
so `update(n => n + 1)` twice collapsed to `+1` while the store form at the same arity accumulated;
lane patches now compose and the two arities agree. And clause (f) understated itself: a memo over an
overridden value answers in whichever mode first computed it, so the same program read in the other
order gives the other answer in BOTH modes — pinned now in both directions rather than one.

Deleted rather than carried: `KEEPALIVE` from the flag list, and both parking bullets from §3.8.
Solid's union-find lanes were considered and not adopted, on the record, because `action()` already
delimits the transaction that their union-find has to infer.

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
  from inside a `scope`, where `getOwner()` returns a Scope rather than `null` so the throw is
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

*Landed.* Three commits: the compiler's old emit path plus the oracle's retirement, the runtime
deletion, then §13's naming. What the milestone actually returned is recorded where it belongs
rather than here — §6's "Executed at M9" table for the oracle's replacement graders, §4.1's M9 note
for the three deletion rows that were REVERSED on evidence, §13's own note for `merge`. The one
number this entry owes is below.

Three of §4.1's rows did not go, and all three reversed on a measurement rather than on effort:
`spread` and `element` (already noted above), the fourteen flow components with `ssr.ts`'s twelve
string adapters (one deletion, blocked on `passes::flow` not lowering a spread source), and the
Block brand (ablated on SSR; the effect is inside the harness's noise floor). Deleting the adapters
is M10's, and it is a compiler feature rather than a deletion.


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

1. **Reactivity: hold or beat all twelve rows** of `eleven-cases.ts` vs `@solidjs/signals` 2.0
   (today 11 wins and 1 tie, `create: signal` being the tie). Rows 2, 3 and 11 should **improve** — components stop allocating owners
   and `ComputedNode` loses six slots. The epoch dedupe carries forward (ablated at 2.37x) and so does
   `markWave` (ablated at +7%/−2%). **Acceptance: no row regresses.**

   **INSUFFICIENT AS ELEVEN, and M7c proved it (C7, F1).** Eleven cases this project wrote, whose
   deepest chain was **five**, cannot see a defect that only appears with depth. `bun run
   bench:tier2:jrb` runs js-reactivity-benchmark — a suite this project did not write — against the
   same comparand in Chrome: at M7b barq took 7 of 9 kairo rows and 3 of 3 sBench rows, and lost
   **cellx1000 55.7x** and **cellx2500 186.6x**. The depth sweep beside it (`__jrbDepth`, checked into
   the same lane) said why: per-layer cost, barq against Solid, at depths 50 / 100 / 200 / 400 / 800 —
   **0.0358, 0.0441, 0.0736, 0.1354, 0.2960 ms against 0.0344, 0.0234, 0.0184, 0.0157, 0.0107**.
   barq's rose 8.3x over a 16x depth increase; Solid's fell. Roughly quadratic in depth against linear.
   **Added to this list: the depth sweep and the two cellx rows are acceptance criteria from M7c on**,
   and a TWELFTH case, `chain(500)`, joins the Tier-1 suite so a depth regression fails there first.

   **F1 IS FIXED — §0.8 has the mechanism; these are the acceptance numbers, same Chrome, same lane.**
   Per-layer cost now FALLS with depth, which is the shape linear propagation has: **0.0191, 0.0128,
   0.0101, 0.0080, 0.0068 ms against Solid's 0.0353, 0.0256, 0.0217, 0.0149, 0.0110** — barq ahead at
   every depth, 27.6x behind a layer at depth 800 before and 0.62x now. cellx1000 **453.77 → 5.30 ms**
   (0.639x Solid), cellx2500 **3488.85 → 10.29 ms** (0.550x). kairo goes from 7 of 9 to **9 of 9**:
   `deepPropagation` 135.67 → 37.92 ms (1.956x → 0.532x) and `mux` 1.084x → 1.016x. **The acceptance
   criterion from here is the SHAPE, not the ratio: ms-per-layer at 800 may not exceed ms-per-layer at
   100.** A ratio can be met by a faster machine; only the shape says the algorithm is linear.
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

   **Superseded as the DOM criterion at M7c (C9).** Component-level DOM rows cannot say whether an
   application is competitive, so the criterion is now js-framework-benchmark in Chrome,
   `bun run bench:tier2:jfb`, 10 iterations a row, trace-derived `commit.end − click.ts`. What it
   says: **seven of nine rows are within 5% on total**, because paint dominates them — and the **`js`
   half is 1.2–2.3x Solid's on every one of the nine**. The rows where that shows through are
   `clear rows` (barq 16.9 ms / js 15.6 against Solid 13.1 / 11.4, 1.292x, p=4.1e-2) and `select row`
   (barq 6.5 / js 3.9 against 4.3 / 1.3, 1.513x, p=2.6e-1 — and 0.452x on a later run, which is what
   that p means). **Run memory at 1,000 rows is a straight loss: 2.73–2.75 MB against 1.76 MB, 1.55x**,
   with no paint to hide behind. Acceptance from M7c: the nine rows and the memory figure are
   published on every milestone that touches the DOM path, whichever way they move.

   **The run of record after M7c's list-runtime work** (`bun run bench:tier2:jfb`, 10 iterations,
   `packages/benchmark/tier2-results.json`), with §0.9 for the mechanisms:

   | row | barq | Solid | ratio | p |
   |---|---|---|---|---|
   | create rows | 38.7 ms (js 3.4) | 39.0 (js 2.9) | 0.992 | 9.2e-1 |
   | replace all rows | 31.6 (js 5.9) | 31.0 (js 5.2) | 1.021 | 1.3e-1 |
   | partial update | 36.7 (js 0.9) | 34.5 (js 1.0) | 1.065 | 1.9e-1 |
   | select row | 6.6 (js 3.4) | 11.7 (js 1.2) | 0.560 | 6.1e-1 |
   | swap rows | 14.3 (js 1.2) | 14.4 (js 0.7) | 0.987 | 8.4e-1 |
   | remove row | 14.5 (js 0.5) | 14.5 (js 0.3) | 0.998 | 4.8e-1 |
   | create many rows | 329.6 (js 44.4) | 314.1 (js 34.4) | 1.049 | 2.2e-1 |
   | append rows to large table | 35.0 (js 4.0) | 39.4 (js 3.1) | 0.886 | 2.2e-1 |
   | clear rows | 12.4 (js 9.9) | 12.5 (js 8.9) | **0.991** | 9.2e-1 |
   | **run memory, 1,000 rows** | **2.59 MB** | 1.76 MB | 1.47x | — |

   **Not one of these ratios is significant, and that is the reading.** `clear rows` moved from
   1.135x to 0.991x and memory from 1.55x to 1.47x between two whole runs, which this document has
   already been burned by once — §0.9 carries the PAIRED measurements those two rows are actually
   evidenced by, and the paired numbers are smaller than the unpaired ones. The `js` half is still
   1.1–1.3x Solid's on every row; what is no longer true is the 1.2–2.3x band above.
4. **The calling convention's JS overhead is an accepted, bounded regression, not a neutral change.**
   §0.3: 11.537 vs 9.328 µs on a stub DOM — **1.24x**, independently reproduced at 1.16–1.24x. It is
   0% through happy-dom (D 516.21 vs A 535.64, D marginally ahead), which is the ground the convention
   is defended on. **Acceptance at M3: ≤1.25x on the stub-DOM mount benchmark, and parity within ±2%
   through a real DOM, measured in Chrome and not only in happy-dom** (§11 Q9: happy-dom has hidden
   four distinct bug classes on this project, so a fake-DOM parity result is not sufficient evidence
   on its own). If the real-browser number is a regression rather than parity, the convention is not
   reopened — §1 Correctness decides that — but the number is published beside the SSR and reactivity
   headlines rather than omitted, which is the failure mode §0.3 was corrected for.

   **MEASURED at M7b, on both instruments this criterion names** (§12's Tier-2 lane, 1,000 rows,
   `bench:tier2 shapes`). Real browser: D/A total **1.007x**, js 1.013x, neither significant against a
   minimum detectable effect of 1.8–2.6% — **parity within ±2%, met**. Stub DOM, now run inside V8
   rather than Bun: D/A **1.267x** (95 against 75 ns a row, p=2.4e-7), which is §0.3's 1.24x
   reproduced and **just over the ≤1.25x bar this item set**. Recorded rather than rounded: the
   overshoot is 1.7 points on a bar set from a measurement taken on a different engine, the
   convention is not reopened (§1 decides that), and the number is published here.

### 9.2 New numbers the design is claiming

| Claim | Method | Target
| Claim | Method | Target |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
 |
|---|---|---|
| SSR fallback cliff deleted | `ssr-head-to-head.ts` with a `Loading` in the module | 202.73 µs → the 4–5 µs class |
| Zero Scope allocations per component | heap-snapshot object count for `Scope` after a 1,000-component 3-deep mount | 0 attributable to components (today: 1 per boundary/flow component plus 1 per Provider) |
| `NO_SCOPE` earns its flag | 1,000-row list of static cells, flag forced off vs on | ~~must move an allocation count AND a wall-clock number, or the flag is deleted~~ → **RESTATED at M7c: the allocation count alone.** Tier 2 ran the wall-clock half four times (D2/D, §0.3 conclusion 2) and got a ratio whose sign and significance both flip between runs, so the AND was a criterion no instrument can satisfy for a per-instance object allocation. The flag keeps the allocation-count justification, the wall-clock justification is withdrawn rather than assumed, and the flag's case is weaker than it was written |
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

**The entries below are themselves Tier-1 readings, and M7c re-adjudicated the four a browser can
rule on. A withdrawal is a claim like any other: it can be wrong, and one of these was — the first.**
Each carries its correction inline; §0.7 is the rule that produced them.

- **"Removing `setProp` dispatch is worth 10–25% per write."** ~~Measured 0–8% (§0.4).~~ **THE
  WITHDRAWAL IS ITSELF WITHDRAWN (C6, M7c).** In real Chrome the dispatcher is **+36%** against the
  like-for-like comparand and **+13% to +56%** on equivalent work, so the claim this document struck
  was true and understated. The pass is still justified on capability — §0.4 says why that
  justification is the right one even now the number favours the speed argument.
- **"A getter is 8.7x more expensive to allocate" (§0.2).** **Withdrawn as a magnitude at M7c (C5).**
  2.73x in V8 on the same shapes (205 vs 75 ns a row, p=2.5e-8), +15.3% to +16.1% of a real mount's
  js half, +2.3% to +4.3% of the frame. The direction reproduces on every instrument; the per-getter
  absolute reproduces; the ratio was against a stub DOM's near-zero baseline. Blocks stand on
  copy-flattening, which is where they always stood.
- **"A Scope per position costs 7.3 ns" (§0.3 conclusion 2).** **Withdrawn as a wall-clock claim at
  M7c (C3).** Sign and significance both flip between runs in the browser; the stub arm spans
  5–15 ns a row against a 5 ns clock quantum. `NO_SCOPE` keeps the allocation-count justification
  only — §9.2's row is restated to match.
- **"The chosen convention costs 23.7% of JS overhead, and 0% through a DOM" (§0.3 conclusion 4).**
  **NOT withdrawn — both halves survive (C1, M7c),** and it is the one place a stub-DOM percentage
  and a browser percentage were both stated, so both could be checked. 1.267x on the V8 stub arm
  (p=2.4e-7); 1.000x ± 1% on `total` in Chrome, never significant; 1–4% of the browser's `js` column,
  which is what ~20 ns a row is against a 1,900 ns mounted row.
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

> **CLOSED at M7b — the question was malformed.** Neither horn. There is no second scope to fork
> against and nothing is parked, so "a write to a parked subtree" and "the live scope and the pending
> scope both write one signal" describe states that do not exist. Two buffers on an opt-in node
> answer it instead. §12's Q7 entry has the account; `SEMANTICS.md` A5 is the specification.

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

**Q3 — index-keyed by default, plus the compile-time diagnostic. ACCEPTED — and REVERSED at §12.**
Read §12 Q3 first: the diagnostic this answer rests on cannot cross a component boundary, so it never
could have covered the correctness half, and the default is IDENTITY. Kept here unedited because the
reversal is only legible against what it reversed.

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

> **SUPERSEDED at M7b.** The reference was read (§12) and reversed the premise rather than answering
> the questions: `@solidjs/signals@2.0.0-rc.0` deletes the transition API, parks nothing, and
> double-buffers only opt-in nodes. All three constraints above are lifted — `KEEPALIVE` is deleted
> rather than built on, and M7 did not in fact depend on any of it, which the third bullet had
> asserted and the milestone disproved. `SEMANTICS.md` A5 is the specification that replaces this.

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

---

## 12. DECISIONS REVISED (2026-08-11), after reading Solid 2.0 RC's oxc compiler

`@dom-expressions/compiler` — Rust, oxc 0.118, napi, 22,452 lines, shipped and the DEFAULT in
`@solidjs/vite-plugin@3.0.0-next.28`. Same author as the Babel plugin this project replaced, same
parser family. It is the closest prior art that exists and it was read as source, not as docs.

Read it as a REIMPLEMENTATION, not a redesign: its own `AST_REWRITE.md` rule #1 is "Mirror the Babel
plugin pass/model structure as closely as Oxc allows." Its calling-convention decisions are inherited
under a parity mandate, not re-derived — which is why several of them are NOT evidence against this
design's departures.

### Q3 — REVERSED by the user. Lists are IDENTITY-KEYED by default.

The index-keyed default rested on a compile-time diagnostic for stateful row DOM. That diagnostic
cannot cross a component boundary: `<For each={xs}>{x => <TodoRow todo={x}/>}</For>` where `TodoRow`
contains an `<input>` produces nothing, because a component compiles to an opaque call. Scroll
position on a plain div, a running animation, an open `<dialog>` and a third-party widget behind a
ref are all equally invisible. So the mitigation covered inline stateful tags only — the case a
reviewer already catches — and an index-keyed default would have shipped a THIRD silent-failure
class on purpose, in a project whose Q4 rationale is that silent failure is the dominant harm here.

Solid ran both `For` and `Index` for five years and deleted `Index` this cycle, keeping one `For`
keyed by identity, on the stated ground that having both "encourages bikeshedding and accidental
misuse". K1's reversal and K3's status both change; an immutable update replacing row objects
rebuilding rows is a visible performance cost, which is the right kind to trade for.

**Landed in M7b.** The emission was already identity by default — `keyed` absent lowers to
`each(src, null, row)` and `mapArray` reads `null` as by-item — so what changed is that the document
stopped promising a reversal away from it. `Index` is DELETED as a component, an SSR entry point, a
`Flow` variant and a `Helper`: one primitive, three modes, no fourth spelling. K3's diagnostic became
`BARQ011` at note level, gated on `keyed={false}` rather than on a keyless row, and its rule text says
plainly that it sees inline markup only. `sem-key-identity-default` is the pin, and every one of its
three claims observes an UPDATE — a reorder, a replacement, and the positional mirror image — because
the first frame is identical under all three modes, which is exactly how the `keyed={fn}` miscompile
hid from 110 fixtures.

**And the cost has a number now**, because "a visible performance cost" is a trade nobody can weigh
without one. §12's Tier-2 lane grew a K1 arm: at 1,000 rows an immutable replacement rebuilds
**1,000 of 1,000** rows under the default and **0** under either other mode, 4.3x on the mapping half
alone, and 31.6 ms per 1,000 rows once the row's DOM is attached (the lane's own
`replace all rows`). `SEMANTICS.md` K1 carries the table.

### Q4 — REVERSED by the user. Detection is a DEV-only axis; only recovery is on the wire.

The measurement arrived after the decision: branch-index comments cost 55.7% raw / 7.3% gzipped on a
100-row page, and claiming is 1.4–1.6x more node work than replacing. 7.3% gzip on every page
forever is material, and Q4 itself said to revisit if it was.

Solid separates the two concerns and pays nothing in production: under `dev + hydratable` it threads
the expected tag into the walk — `getFirstChild(_el$, "span")` where production emits
`_el$.firstChild` — so a mismatch is caught where it is debugged and the wire carries only what
recovery needs. barq already has nine separately-flippable optimisation knobs and a `hydratable` flag
that changes emission on both backends, so the axis exists. The original argument — silent failure is
the dominant harm — is an argument about DEVELOPMENT and is fully served by a dev-only check.

**DELIVERED at M7b.** The split is built and measured, and the shape it took is not quite the shape
the reversal described, because the reversal named the wrong culprit.

Solid's `getFirstChild(el, "span")` is a CLIENT-BUNDLE difference, not a wire one; Solid pays its
insert markers in production exactly as this design did. So "make detection dev-only" on its own
would have moved a handful of key bytes and left the 55.7% where it was. The 55.7% was never
detection — it was 300 hole delimiters (4,800 bytes) and 100 row delimiters (1,600) on a page with
one branch and no keys worth writing. What made the number go to zero was asking, per position,
**what the client can re-derive**:

- a hole that is the only thing in its parent element: its extent is every child of the parent;
- a row of an `each`: the rows are built in order, so a row's extent is what its build consumed;
- a range that is the only thing in its parent element: the same as the hole, in production. A `dev`
  build writes its comments anyway, because the open comment is the only place a key can live.

Both halves shipped. The wire minimisation is the byte number; the detection axis is the CPU number
and the dev guarantee. Production: `11513 → 11513` raw, `997 → 997` gzipped — zero. Development:
+0.1% raw, +1.8% gzipped. Claiming: 1.4–1.6x SLOWER than replacing before, **1.12–1.31x faster
after**, because the O(subtree) comparison left the production path with the comment nodes.

**The zero is measured on ONE shape, and that shape is jfb's table.** Every hole on the 100-row page
is the sole occupant of its `<td>` — the very case the three bullets above say needs nothing. Put one
static character beside a hole and the page is back in the paying case: a second 100-row page with
static siblings and a per-row `<Show>` costs +51.0% raw / +5.5% gzipped in production, against M6b's
+55.7% / +7.3%. The corpus number in the same test agrees and always did (+12.5%). So the delivered
claim is **"production costs zero where a hole owns its parent's child list"**, and the general win is
smaller than the headline: about a quarter off the gzipped column on a mixed page, plus the whole
O(subtree) walk off the production client. Both pages are measured and asserted in
`test/hydration.test.ts`; `SEMANTICS.md` H2 has the table.

**What production gives up, listed rather than averaged.** Three corruptions survive a production
hydration silently — a wrong tag, a missing element and an extra element, each in the middle of a
claimed subtree — because the only thing that could see them is the subtree comparison. Each is
registered in `test/hydration-mutations.test.ts` with the exact tree it produces, and each is
DETECTED in the development column. That is Solid's trade taken deliberately, and it is the trade
§12 argued for: silent failure is the dominant harm IN DEVELOPMENT.

**What production gained.** `flow.ts`'s `activate` now catches `HydrationMismatch` from the claiming
attempt, reports it, releases the server's nodes and rebuilds cold at that position. Until M7b
exactly one mismatch reached a region's own catcher — a branch key that disagreed — and every other
kind cost the page. So the divergence the key used to be the only evidence for is now caught
structurally in production AND confined to its own range.

### Q7 — ANSWERED by the reference implementation. Both horns of the question were wrong.

The question was whether a transition may fork the reactive graph or must be expressible with scope
forks alone. Solid does NEITHER, and there is no second scope.

`startTransition` and `useTransition` are DELETED; there is no transition API. Only opt-in
`optimistic` nodes are double-buffered — `_value` authoritative, `_overrideValue` pending — and
the mechanism is stated in their own comment: "No revert target is stashed: while the override is
active every reader sees it, so authoritative arrivals commit silently into `_value` and reverting is
just dropping the override — `_value` is already correct." A transition's write lands in the override,
a live write lands in `_value` underneath it, neither is lost, and settling drops the override onto a
value that is already right. Union-find lanes group a transaction's writes and an active override is
a lane barrier, which is what lets several transitions be in flight without blocking each other.
RFC 06 rejects forking on the record: optimism "should integrate with transitions rather than forking
the reactive graph".

THERE IS NO PARKING. `<Loading>` keeps live DOM mounted showing stale content. So the two questions
this project could not answer — what a write to a parked subtree does, and whether parked effects are
suspended or detached — DISSOLVE. Nothing is parked.

Consequences: §3.8's "transition(fn) creates a pending scope beside the live one" is the approach the
reference implementation rejected. `KEEPALIVE` parking is not a prerequisite for transitions, it is an
alternative nobody took. SEMANTICS.md A5 states a dichotomy that is refuted and must be rewritten.
M7's transition blocker is far smaller than assumed: two slots on opt-in nodes plus a union-find,
orthogonal to the Scope/Block work. `latest(fn)` and `isPending(fn)` are the read surface.

**Built at M7b. Three notes on what the estimate above got wrong**, recorded because each is a place
the reference implementation's shape did not transfer:

*The union-find is not needed and was not built.* Lanes exist to recover a transaction from a set of
writes. Solid must infer one — their writes are grouped by dependency-graph reachability, merged when
graphs overlap, with an active override acting as the barrier that stops the merge. barq has
`action()`, which delimits the transaction explicitly, so the lane is the `ActionContext` itself and
there is nothing to infer, merge or barrier. Two lanes on one node stack in claim order and retire
independently. This is the one place their design is answering a question this one does not have.

*"Two slots" is one slot holding M7's list.* The pending-layer list `optimistic` already had IS
the override buffer — the answer to "does the override subsume the layer list or sit beside it" is
that they were always one mechanism at two arities, and the resource's single `override` signal is the
degenerate case. M7b unified the storage; it did not add a second. Net effect on allocation:
`optimistic` went from three reactive nodes to one.

*What actually forced the move onto the node was the read surface, not the double buffering.* A
derivation over a settled signal and a pending-layer signal has exactly one mode, and `latest`,
`isPending` and a normal read are three. A read mode is not a dependency, so a memo caches the answer
it computed in one mode and serves it in another; keying a memo on the mode would mean a value slot
per mode on every computed. Hence the slot sits below memoization, which is where Solid put theirs —
but their comment explains the *revert*, and this is the reason the shape is forced.

*And the model has a hole their shape does not, because their transaction is implicit.* A generator
action resumes IN its lane, so `value.set(serverAnswer)` after the `yield` is a lane write and retires
with the lane — the value reverts to what it held before the action, which is the one thing "no revert
target is stashed" promises cannot happen. Solid never meets this because they have no explicit
action to be inside. `commit(fn)` closes it: it runs its body with the lane suspended, so a write
inside reaches the authoritative buffer exactly as one made outside the action would. It is the
write-side counterpart of `latest`, and A5 (e) now states both the constraint and the escape.

### Adopted from Solid without further argument

**The parity ratchet, generalised.** Their `parity.test.js`: "An ABSENT expectation file means the
compilers are at parity and must stay there. A PRESENT expectation file documents the current known
divergence. Any change — regression OR IMPROVEMENT — fails until the expectation is regenerated."
Failing on improvement is what this project's registries do not do, and it is why a row can rot.

**The cross-mode fixture union.** Their suite compiles the union of ALL fixture sources through EVERY
mode. barq has 2 backends x 2 optimisation levels plus the interpreter — five emission modes — and
fixtures written per feature. The `backend!` macro proves every backend HANDLES every `Op`; it cannot
prove SSR handles `Op::Region` CORRECTLY for a construct only the DOM fixtures exercise.

**A Tier-2 benchmark lane.** Their `benchmarking-strategy.md`: "Tier 1 is the iteration tool. Tier 2 is
the source of truth. Tier-1 wins must be validated against the relevant Tier-2 suite before they
stay." *(This is now this project's own standing rule, written out with its evidence at **§0.7**.)* Their 6,725-line experiment log is full of Tier-1 wins REVERTED after Tier-2 disagreed. Every
number in this document is Tier-1 — Node microbenchmarks, a stub DOM, happy-dom — including §0.3's
defence of the calling convention ("0% through a DOM"), which is a Tier-2 claim made without a Tier-2
run. Until that lane exists, the flag-deletion discipline is adjudicating against the wrong oracle.
`browser.test.ts` already drives real Chrome over CDP, so it is buildable.

**BUILT at M7b** — `packages/benchmark/src/tier2/`, `bun run bench:tier2`, raw numbers checked in at
`packages/benchmark/tier2-results.json`. What it says, and the correction M7b's own first reading
needed:

The lane's first cut timed `mount` in a real browser and read the `js` column as §0.3's quantity. It
is not. That column is mount INCLUDING the DOM mutation — 1,900 ns a row at 1,000 rows against the
75 ns a row a stub reports — so a 23.7% difference in the JS half is 1% of it, and the browser arms
can bound the TOTAL cost and cannot resolve the ratio. Reading "js +1.3% to +4.3%" as "23.7% is a
stub-DOM artefact" compared two different quantities. The lane now carries **both** instruments: the
browser arms, and a STUB arm running the same shapes over a plain object inside V8, which is §0.3's
own instrument moved into the engine that matters. `claims.ts` states per claim what its procedure
cannot decide, so a silence is not read as a null result again.

| # | Tier-1 claim | stub arm, in V8, 1,000 rows | browser, 1,000 rows | verdict |
|---|---|---|---|---|
| C1 | D costs 23.7% of JS against A; 0% through a DOM | D/A **1.267x** (95 vs 75 ns/row, p=2.4e-7) | js 1.013x (p=0.13, mde 1.8%), total 1.007x | **BOTH HALVES SURVIVE.** 23.7% reproduces as 26.7% in its own unit; "0% through a DOM" reproduces on a real one |
| C2 | B/C/D within noise | C/D 0.895x | B/C 0.992x, C/D 1.008x, neither significant | **SURVIVES** in the browser; on the stub, C is 10% cheaper than D, which is C1's number seen from the other side |
| C3 | a Scope per position costs 7.3 ns/row | D2/D **1.053x** — 5 ns/row (p=2.5e-5); 1.158x, 1.158x on the two runs before it | js 1.013x (p=2.0e-3, mde 1.35%); 1.020x / 1.015x / 1.008x at p=0.32 / 0.14 / 0.13 across the other three runs, and `total` 1.009x, 1.008x, 0.997x, 0.997x | **DOES NOT SURVIVE as a wall-clock number (M7c).** Read one run and it looks like a small significant cost; read four and the sign flips on `total` and significance flips on `js`, while the stub arm spans 5–15 ns/row against a 5 ns clock quantum. `NO_SCOPE` keeps the ALLOCATION-COUNT justification and loses the wall-clock one — §9.2's row is restated |
| C4 | inlining is 15% of stub JS, 0% through a DOM | E/C **0.824x** — 17.6% (p=1.8e-5) | js 0.974x (p=0.059) | **SURVIVES**, both halves, at 17.6% rather than 15% |
| C5 | a getter is 8.7x | GETTER/VALUE **2.733x** (205 vs 75 ns/row, p=2.5e-8); 2.933x (220 vs 75) the run before | js **1.153–1.161x** across four runs (p 1.3e-4 … 1.4e-6), total 1.023–1.043x | **MAGNITUDE DOES NOT SURVIVE, sign and absolute do.** 8.7x was Bun over happy-dom's stubs, where VALUE is 46.6 ns/row; V8 says 2.7x on the same shapes with VALUE at 75 ns/row, and a real mount says +15% of its js half. §0.2 carries the correction and the reason the Block decision is untouched by it |
| C6 | the dispatcher is 0–8% per write | — | id **1.358x** (+36%, like-for-like, 1.358–1.537x over four runs); value **1.130x** against a caret-preserving comparand (1.623x against a bare `value =`); class **1.561x** against an ownership-checking comparand (1.873x bare) | **DOES NOT SURVIVE**, in the opposite direction: the dispatcher is +13% to +56% on equivalent work and +36% on the one pair that is like-for-like. §0.4's DECISION — justify channel resolution on capability, not on speed — is understated rather than wrong, and §0.4 now says why capability is still the right ground. The class row is the least trustworthy: different semantics on the one-shot path. **F3 is fixed and the class row is SETTLED at M7c: 1.420x on equivalent work with two alternating tokens, 1.534x on a fresh token every write — the case the accumulation made unrunnable. It is now inside the band the other two channels give rather than the outlier the defect made it (§0.4)** |
| C7 | 10 wins / 1 tie vs `@solidjs/signals` 2.0, up to 6.25x | — | kairo 7 of 9 to barq (0.27x–1.96x); sBench 3 of 3 (0.25x–0.51x); **cellx1000 55.7x and cellx2500 186.6x AGAINST barq** | **SURVIVED on the suite's shallow graphs and FAILED on its deep ones.** The depth sweep said what the cellx ratio was a ratio of: barq's per-layer cost ROSE from 0.036 to 0.296 ms over depths 50→800 while Solid's FELL from 0.034 to 0.011 — quadratic against linear (**F1**). Invisible to §0.1's cases, whose deepest chain was five. **F1 is FIXED (§0.8): cellx1000 0.639x and cellx2500 0.550x, barq now takes 9 of 9 kairo rows and per-layer cost FALLS with depth. The twelfth case, `chain(500)`, is why the suite can see it now** |
| C9 | (no Tier-1 claim of this shape existed) | — | seven of nine jfb rows within 5% on total; **the `js` half is 1.2–2.3x Solid's on every row**; run memory at 1,000 rows **2.73–2.75 MB vs 1.76 MB** | **NEW GROUND.** Paint dominates seven rows, so the js gap only shows through where the js half is large: `clear rows` 1.29x (js 15.6 vs 11.4 ms, p=4.1e-2) and `select row` 1.51x (js 3.9 vs 1.3 ms, p=2.6e-1) on the first run — and `select row` inverted to 0.45x on a later one, which is what a p of 2.6e-1 means. Memory is a straight 1.55x loss with no paint to hide behind. **DIAGNOSED AND TWO THIRDS ADDRESSED at M7c — §0.9. `clear rows` was 1,000 `removeChild` against Solid's one `textContent = ""`; the bulk removal takes 17.0% off the JS half (p=5.1e-3, paired) and nothing off the frame, and the row now reads 0.991x. Memory is 1.55x → 1.40–1.47x on two list allocations per row that nothing read. `select row` is NOT a defect: barq has no `createSelector`, so 1,000 effects wake where Solid's 2 do — a capability gap, measured as scaling, and not the list runtime's to close** |

The two rows that moved most between M7b's first reading and this one moved for the same reason: the
first reading compared quantities the instrument could not separate. C1 and C3 were called
"magnitude does not survive" off a column that is 98% DOM; C6's `value` and `class` rows were called
dispatcher off comparands that do strictly less work.

**What the lane still cannot do.** C8 (the SSR envelope) needs a server, not a browser. And the
`total` column is ~80% forced layout by construction, so its minimum detectable effect — now printed
beside every ratio — is what says whether a 1.00x there means anything.

**M7c: the same lane run four times, and what a second run is for.** The table above is the run of
record (`packages/benchmark/tier2-results.json`); three further runs of `bench:tier2:shapes` and a
second `bench:tier2:jfb` are what turned two of these verdicts. C3 looked like a small significant
cost on one run and flipped sign on the next; jfb's `select row` read 1.51x against Solid on one run
and 0.45x on the next, at p=2.6e-1 both times. **A single Tier-2 run adjudicates nothing that its own
p-value does not support, and the p-value is in the table for exactly this reason.** The three
findings the repeat runs produced — F1 (superlinear propagation), F3 (`setClass` accumulating tokens
under repeated one-shot writes, which hung a run and which §0.4's Tier-1 `class` number was itself a
measurement of), F4 (§0.3's table not existing in the repository) — are the milestone's own output;
the rule that produced them is now written out as **§0.7**, at the front of the document where the
numbers it governs live.

### Vindicated, recorded so it is not relitigated

Their SSR/DOM hole-id desync (`documentation/hole-owner-id-matrix.md`) is the failure barq's shared
address pass structurally prevents — and their FIRST fix attempt failed the same way, keying off the
transformed expression shape so "every sibling id after such a hole shifted". Their remedy is a
hand-enforced shared predicate; H5's channel is the typed version. Note the warning attached: their
bug was caught by an end-to-end streaming example, NOT by fixture parity, because parity compares
COMPILERS rather than backends against each other.

Their 6,725-line performance log contains NO measurement of children-getter allocation. The getters
survive on the parity mandate, not because Blocks lost.

**The 8.7x number is REFUTED and the line that said it "stands unrefuted" is struck.** The Tier-2 lane
above measured the same shapes on the same instrument class inside V8 and got **2.7x** (205 against
75 ns a row at 1,000 rows, p=2.5e-8; 2.9x on the run before), and **+15.3% to +16.1%** on the `js`
half of a real mount across four runs (p 1.3e-4 … 1.4e-6), **+2.3% to +4.3%** of the frame. 8.7x was
Bun over happy-dom's stubs, where a value-props baseline is nearly free — 46.6 ns a row — so the
ratio is mostly a statement about its denominator; V8 puts that denominator at 75 ns a row and a
mounted row at ~1,900. The per-getter ABSOLUTE reproduces (127.64 ns a getter is ~255 ns for a
two-getter row; V8 prices the whole GETTER row at 205–220), and so does the DIRECTION, on every
instrument and at every scale.

**Blocks are not reopened by this, because Blocks never rested on it.** The decision rests on
copy-flattening — `{...p}` READS a getter and hands on a dead value, so every spread-forwarding
component silently loses reactivity — which is a correctness argument that no benchmark decides, and
which all three submitted designs made independently before any allocation number existed. §0.2 says
this in its own place too, so that the dead number cannot be used to reopen the live decision.

---

## 13. NAMING (2026-08-16, M9)

Decided by the user, after the export surface was audited and found to carry **three constructor
conventions at once**: bare (`signal`, `computed`, `effect`, `resource`), `create*`
(`scope`, `context`, `optimistic`, `reaction`, …) and `use*` (`useState`,
`useMemo`, `useEffect`, `useResource`, `useStore`, `useContext`, `useRef`).

The split was not a design; it was sediment. Half of Solid's constructors had been renamed
(`createSignal → signal`, `createMemo → computed`, `createEffect → effect`,
`createRenderEffect → renderEffect`) and the other half kept verbatim, so no rule told a reader
which form a given constructor takes. Four of the `use*` names were one-line aliases of the bare
form — two public names for one function.

**The rule: a constructor is the noun it makes.** No prefix.

| deleted | use instead | note |
|---|---|---|
| `useState` | `signal` | not a rename: the tuple form goes, `s()` reads and `s.set`/`s.update` write |
| `useMemo` / `useEffect` / `useResource` / `useStore` | `computed` / `effect` / `resource` / `store` | pure aliases; the wrappers held nothing |
| `useContext` | **kept** | see below — it is not an alias |
| `useRef` | the `ref` channel | §4.1; a writable binding IS the ref (B3) |
| `createAsync` | `computed(fn, { key })` | it was `computed` plus an SSR seed key, and the key still defaults to the owner-tree id at CREATION — which is what keeps server and client numbering identical |
| `scope` / `root` / `owner` / `context` | `scope` / `root` / `owner` / `context` | |
| `reaction` / `trackedEffect` | `reaction` / `trackedEffect` | |
| `optimistic` / `optimisticStore` / `projection` | `optimistic` / `optimisticStore` / `projection` | |
| `errorBoundary` / `loadingBoundary` / `revealOrder` | `errorBoundary` / `loadingBoundary` / `revealOrder` | |
| ~~`merge`~~ | **KEPT** | see below — the row is wrong twice over |
| `getProperty` / `setProperty` | — | zero consumers anywhere, and one character from `setProp`, which is a different thing |
| `dynamic` | `dynamic` | the name frees up when the component dies; it was the only abbreviation among `element`, `reveal`, `branch`, `each`, `boundary`, `portal` |

**`merge` STAYS, and the row above is wrong on both of its claims.** M9 tried to
delete it and reversed on evidence.

- They are not one operation. `merge` treats a later `undefined` as a VALUE and
  `mergeProps` skips it, which is a real difference in what a defaulted prop
  resolves to — `props.test.ts` pins it in a test named for it ("mergeProps
  skips a later undefined; merge treats it as a value"), and `props.ts` says so
  at the definition.
- The direction is backwards for the version it cites. `@solidjs/signals`
  2.0.0-beta.31 exports `merge` and has NO `mergeProps`; `mergeProps` is
  Solid 1.x's name. Renaming toward `mergeProps` moves AWAY from Solid 2.0,
  which is what the rest of this section is aligning with.

Both names stay until someone decides which undefined rule is the one barq
wants — that is a semantics question, and this section is about spelling.

**`useContext` is the one `use*` that stays**, and the reason is that it is not an alias of a
constructor. The four that went were one-line wrappers over `signal`, `computed`, `effect` and
`resource`; reading a value the OWNER TREE provides is its own operation. Solid draws the same line
in the same place: `@solidjs/signals` marks `getContext(ctx, owner?)` `@internal` — "the user-facing
read API is `useContext` (in `solid-js`), which wraps this primitive" — and `solid-js` exports
`useContext`. barq keeps both, and the difference between them is the return: `getContext` answers
with the VALUE and throws when there is none, `useContext` answers with the Cell (§3.0), which is
what a component wants and what compiled code emits.

### What M9 actually renamed

Every row above shipped except `merge`. Counted over the repo, word-boundary:
`createScope` 300 → `scope`, `createContext` 96 → `context`, `createRoot` 85 →
`root`, `dyn` 64 → `dynamic`, `createOptimistic` 60 → `optimistic`,
`createProjection` 34 → `projection`, `createOptimisticStore` 21 →
`optimisticStore`, `createOwner` 11 → `owner`, `createLoadingBoundary` 11 →
`loadingBoundary`, `createReaction` 11 → `reaction`, `createTrackedEffect` 10 →
`trackedEffect`, `createErrorBoundary` 10 → `errorBoundary`, `createRevealOrder`
9 → `revealOrder`. `getProperty`/`setProperty` left `index.ts` and stayed as
internal helpers of `type-utils.ts`.

Two things the rename needed that a search-and-replace does not give you:

- **`dyn` is a Rust keyword.** The compiler is Rust, and `&dyn Any` /
  `&'d dyn Fn(…)` are not the helper name. Renaming them produced
  `&dynamic Any`, which does not compile — caught by `cargo build`, which is
  why the rename runs through it.
- **Four of the new names shadow their own initialiser.** `const context =
  context(1)` is a TDZ error, not a shadowing warning, and it appeared in four
  files the moment `createContext` became `context`. The LOCAL is what moves —
  `const ctx = context(1)` — because the import is the name the section is
  about.

The compiler's own symbol table moved with it: `Prim::UseState`, `UseMemo`,
`UseStore` and `CreateAsync` are gone, `"useResource"` stops resolving, and the
remaining variants are named for the exports they classify (`Store`,
`Optimistic`, `OptimisticStore`, `Projection`). A compiler that still recognises
a name the runtime no longer exports is classifying a program that cannot load.

**Solid source compatibility is not a goal and was already gone.** §11's calling convention —
components take their scope first, props are Cells and are called — means no Solid component compiles
here unchanged. A vocabulary that is half theirs buys nothing and costs the rule above.

**What stays Solid's, and why.** The names that are the same BECAUSE the semantics are the same:
`isPending`, `latest`, `refresh`, `untrack`, `batch`, `flush`, `onCleanup`, `onMount`, `onSettled`,
`getOwner`, `runWithOwner`, `mapArray`, `repeat`, `NotReadyError`, `affects`, `resolve`. Renaming
those would cost a reader the one thing parity is good for, which is transferring a mental model.
