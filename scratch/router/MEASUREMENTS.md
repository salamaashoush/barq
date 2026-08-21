# Measured for the router design, before any of it was committed to

§0.7's two obligations are honoured per section: the instrument beside every number, and what
the instrument cannot decide said in the same breath.

---

## M1 — the matcher. Tier 1, PROVISIONAL.

**Instrument.** `packages/benchmark/src/matcher-head-to-head.ts`. Bun 1.4.0-canary.1,
`stats.paired`, 41 trials x 2000 iterations, warmup 20 000, order alternated per trial,
Wilcoxon signed-rank on the paired differences. Comparand is `@barqjs/extra`'s shipped
`matchRoutes` — a `RegExp` per route in a `Map`, scanned linearly. Contender is a hand-written
prototype of the generated shape: switch on segment count, then a switch per literal position,
params popped positionally. **Before either is timed the two must agree on every path in the
table and on the params extracted** — a faster matcher that answers differently is not one.
Table is flat, four segments, two of them params, first segments deliberately colliding 37-way.

ns/op, median of 41:

| table | case | scan | switch | ratio | p |
|---|---|---|---|---|---|
| 25 | first-hit | 43.3 | 34.3 | 1.26x | 5.1e-6 |
| 25 | last-hit | 290.7 | 47.8 | 6.09x | 2.5e-8 |
| 25 | miss | 268.5 | 27.2 | 9.87x | 2.5e-8 |
| 200 | first-hit | 42.6 | 35.8 | 1.19x | 5.0e-2 |
| 200 | last-hit | 3331.5 | 67.0 | 49.7x | 2.5e-8 |
| 200 | miss | 3652.8 | 28.6 | 128x | 2.5e-8 |
| 1000 | first-hit | 45.8 | **136.3** | **0.34x** | 5.3e-5 |
| 1000 | last-hit | 33413.2 | 56.0 | 597x | 2.5e-8 |
| 1000 | miss | 33981.5 | 35.5 | 956x | 2.5e-8 |

The scan's first-hit is ~42 ns at every table size and its cost is linear in the matched
route's POSITION. This independently reproduces the 45 ns / 3 966 ns baseline measured
separately on a different table shape.

**The one row the contender loses, and it is not warmup.** At 1000 routes the switch's
first-hit median is 136 ns against the scan's 46. Raising warmup from 500 to 20 000 — a 40x
increase — did not move it (136.3 both times, p 1.2e-4 then 5.3e-5), so the first explanation
was wrong. Measured ALONE, in `src/matcher-probe.ts` with 20 000 warmup and 200 000 iterations,
the same function answers the same path in **83.5 ns**. The perturbation is the pairing itself:
`stats.paired` interleaves the two sides to make thermal and GC drift land on both equally, and
that is not the same as protecting one side's JIT state from the other's when the two differ in
code size by three orders of magnitude. Recorded because the next person to pair a 64 kB
generated function against a 60-line one will otherwise re-derive it.

**The cost that actually decides the design, and it is not the clock.** The generated source is
**16 413 bytes at 200 routes and 76 413 bytes at 1000** — 76-82 bytes of JavaScript per route,
unminified and before gzip (a compacter emitter measured 64 249 at 1000, so formatting moves it
about 15%). Tens of kB of matcher shipped to a browser is not payable. So the shape is
per-side: generate the switch for the SERVER, where it is never downloaded and where the win is
largest, and ship the client a compact table plus a small interpreting loop. That is a decision
the measurement made, not one the design brought to it.

**CANNOT DECIDE.** A Bun microbenchmark bounds per-call CPU on a synthetic flat table. It says
nothing about a table with splats, optional segments, nesting or specificity ranking — the
prototype implements none of those and a real generated matcher handling them will be larger and
slower. It cannot see icache behaviour under a real server's working set. Per §0.7 this is
Tier 1 and PROVISIONAL: it needs an entry in `src/tier2/claims.ts` with its own `cannot`, and
the matcher is CPU-only so it needs its own Tier-2 shape rather than a js-framework-benchmark
row, where the `js` column is ~96% DOM.

## M2 — the denominator, without which M1 decides nothing

**Instrument.** `packages/benchmark/src/matcher-denominator.ts`. Same machine and process
shape; the page is compiled by the real compiler with `ssr: true`, with `serverSource` and
`moduleSource` pointed at this repo's sources.

| | min | median |
|---|---|---|
| `renderToString`, compiled 20-row page | 650.6 | **1199.6** |
| `renderToString` envelope only | 215.7 | 250.2 |
| `new URL(request.url)` | 43.8 | 56.1 |

So on a server request, at 200 routes, the shipped linear scan's last-hit costs **2.8x an
entire 20-row page render** and 59x the `new URL` every request already pays. At 1000 routes it
is 28x a page render. Averaged over a uniform route distribution it is about half that and still
larger than the render.

This is the answer to the question D4 was reframed to ask, and it goes the other way from the
worry that prompted it: the matcher is not a rounding error on the server. On a CLIENT
navigation it still is — 3.3 µs against a network fetch — and the design must not claim
otherwise.

**CANNOT DECIDE.** A 20-row page is small; a 100-row page render is several times this and
would shrink every ratio above proportionally. The envelope row shows how much of the 1 199 ns
is fixed cost rather than page size, which is what stops the ratio being quoted as if it scaled.

**Found while measuring, pre-existing:** `src/ssr-head-to-head.ts` does not run. It fails with
`Cannot find module '@barqjs/server'` — the P0.5 split moved the string backend out of core and
`packages/benchmark` was never given the dependency. `TODO.md` already says the benchmark
harness needs a run before it is trusted; this is one of the things that run would find.

## M3 — route types: generated interfaces vs type-level path parsing

**Instrument.** `tsc --noEmit --extendedDiagnostics`, `strict`, `skipLibCheck`, one file per
case, three trials, **zero type errors in every case** (an earlier round reported 1 800 and was
discarded). Two compilers. Comparand is a type-level parser — `Split` / `ParamName` /
`ParamsOf` over the path plus a relative-`to` resolver forced across the whole path union —
against one plain interface per route. Both sides typecheck the same N `link({to, params,
search})` call sites.

TypeScript 7.0.2, check time (median of 3) / instantiations:

| routes | inferred | generated |
|---|---|---|
| 200 | 0.010s / 25 078 | 0.007s / 1 600 |
| 800 | 0.080s / 94 102 | 0.080s / 6 400 |
| 2000 | 0.423s / 227 588 | 0.488s / 16 000 |
| 5000 | 2.349s / 559 315 | 3.103s / 40 000 |

TypeScript 5.9.3, same cases: 0.08 / 0.05 at 200, 0.26 / 0.23 at 800, 0.98 / 1.10 at 2000.
Same crossover, so this is not an artefact of the Go port.

**Reading.** Instantiations are ~120 per route inferred and exactly 8 per route generated —
both LINEAR. DESIGN-ROUTER §3.1's "O(routes) instead of O(routes x path inference)" describes a
15x constant as a complexity class, and it is wrong in that framing. On the clock the generated
shape wins 1.4x at 200 routes (0.007s against 0.010s, which is not a reason to build anything),
ties at 800, and LOSES 1.15x at 2000 and 1.32x at 5000.

**CANNOT DECIDE.** Batch `tsc` is not the language service, and the language service is what
TanStack's users actually complain about; instantiation count plausibly matters more there,
where the budget is per-keystroke. My parser is also simpler than TanStack's shipped one. So
this measurement kills the stated justification without settling the editor question, and the
design says so rather than borrowing authority from a column that never had any.
