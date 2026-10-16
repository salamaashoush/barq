# barq against Solid 2.0 and Solid 1.9

Taken on 2026-10-16 with `bun run bench:solid2` (Solid 2.0 prepared with `SOLID2_DIR`
pointing outside the repository, `CDP_PORT` and `BENCH_PORT` pinned) on an Apple M5 Max (18 cores,
48 GB, macOS 27.0.1), Bun 1.4.2, headless Chrome 155.0.8059.41. barq is
`7c2d739` on `@solidjs/signals` 2.0.0-rc.15 from npm; Solid 2.0 is solid-next
`3643c5e7` (2.0.0-rc.15 plus later fixes, its own signals build) compiled by
its native `@solidjs/compiler`; Solid 1.9 is `solid-js` 1.9.17 with
`babel-preset-solid`. The raw numbers, with every percentile, are in
`solid2-results.json`.

How each lane is taken:

- jfb trace: js-framework-benchmark's nine CPU rows and its memory row, one
  page load per timed click, frameworks rotated per iteration, 15 iterations,
  duration from the Chrome trace as upstream computes it. Medians move in vsync
  steps, so the script lane below is the one that separates frameworks.
- jfb script: the same clicks timed in the page from the click to the end of
  the microtask queue (DOM written, no layout), 6 page loads x 10 samples per
  framework after 3 warmups, GC between samples, upstream's CPU throttling.
- barq and Solid 2.0 run one source (`src/solid2/apps/jfb.tsx`); Solid 1.9
  runs its official entry, which has `createSelector`.
- SSR: a 100-card storefront (`src/solid2/apps/page.jsx`, `src/solid2/apps/page-barq.tsx` in barq's
  prop convention), 15 interleaved rounds of 200 renders after 500 warmups, GC
  before each round, renders per second. Output text is checked equal first.
- Hydration: the same page served hydratable, 20 loads each; "at load" is the
  call made as the entry module runs, "after load" the same call on an idle
  page. A click must update the cart or the run fails.
- Size: `Bun.build` minified bundles, gzip -9 and brotli 11; per-fixture
  compiler output is each fixture in `packages/compiler/fixtures` compiled
  by barq and Solid 2.0, minified with imports external.

Medians (spread in the JSON; script-lane p25..p75 is typically +-5%):

```
jfb script (ms)          barq    Solid 2.0  Solid 1.9
create 1,000 rows        1.645   1.487      1.455
replace all rows         3.235   3.043      3.035
partial update (4x)      0.750   0.605      0.620
select row (4x)          0.995   0.940      0.322
swap rows (4x)           0.188   0.662      0.653
remove row (2x)          0.550   0.615      0.580
create 10,000 rows       14.81   13.19      13.86
append 1,000 rows        1.788   1.727      1.633
clear rows (4x)          6.463   5.775      5.760
run memory, 1,000 rows   1.88 MB 1.75 MB    1.76 MB

SSR (renders/s)          barq    Solid 2.0  Solid 1.9
renderToString           20798   12818      20816
renderToStream, drained  15158   10019      745

hydration, 100 cards     barq    Solid 2.0  Solid 1.9
at load (ms)             5.19    4.72       2.09
after load (ms)          1.99    1.96       1.08

bundle, gzip / brotli    barq          Solid 2.0     Solid 1.9
hello world              15446/13924   12458/11318   5391/4868
jfb app                  22690/20550   15689/14236   7247/6544

compiler output, 137 fixtures, sum of gzip: barq 52161, Solid 2.0 53960
```

Closed in this pass (before is the same lane, same machine, on the parent commit `4cc656d`):

- Effects per row: the compiler fuses every attribute, property, class and style binding of a
  template into one render effect, as Solid 2.0 does, where it fused per element and kept an
  expensive, dependency-disjoint call apart. A jfb row is one effect instead of two. create 1k
  1.833 to 1.645 ms, create 10k 15.85 to 14.81 ms, replace 3.395 to 3.235 ms, memory 2.09 to
  1.88 MB. select row, which now re-runs each row's whole record, stayed at 0.995 ms.
- Compiler output over the 137 fixtures: 52171 to 52161 gzip (80366 to 80206 raw).
- The jfb bundle grew 22628 to 22690 gzip: `readOpaque`, the read an opaque call makes inside
  the fused record, ships beside `bindProp`.

Open, and why:

- create rows (+11%), memory (+7%): the rest is `each`'s row machinery and the row's own
  scope; the effect count now matches Solid 2.0's.
- bundle size: what remains is the DOM layer (`dom.ts`, `flow.ts`) at about three times
  `@solidjs/web`'s size; the regions' claim code still ships.
- hydration at load: equal after load, so the 10% is first-run cost of the larger code path
  rather than claim work.
