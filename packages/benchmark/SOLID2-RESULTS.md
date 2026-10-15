# barq against Solid 2.0 and Solid 1.9

Taken on 2026-10-16 with `bun run bench:solid2` on an Apple M5 Max (18 cores,
48 GB, macOS 27.0.1), Bun 1.4.2, headless Chrome 155.0.8059.41. barq is this
commit on `@solidjs/signals` 2.0.0-rc.15 from npm; Solid 2.0 is solid-next
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
- SSR: a 100-card storefront (`apps/page.jsx`, `apps/page-barq.tsx` in barq's
  prop convention), 15 interleaved rounds of 200 renders after 500 warmups, GC
  before each round, renders per second. Output text is checked equal first.
- Hydration: the same page served hydratable, 20 loads each; "at load" is the
  call made as the entry module runs, "after load" the same call on an idle
  page. A click must update the cart or the run fails.
- Size: `Bun.build` minified bundles, gzip -9 and brotli 11; per-fixture
  compiler output is each fixture in `packages/compiler-rs/fixtures` compiled
  by barq and Solid 2.0, minified with imports external.

Medians (spread in the JSON; script-lane p25..p75 is typically +-5%):

```
jfb script (ms)          barq    Solid 2.0  Solid 1.9
create 1,000 rows        1.845   1.490      1.480
replace all rows         3.412   3.128      3.045
partial update (4x)      0.670   0.765      0.645
select row (4x)          1.043   1.027      0.312
swap rows (4x)           0.230   0.535      0.595
remove row (2x)          0.572   0.630      0.555
create 10,000 rows       16.03   13.46      13.95
append 1,000 rows        1.885   1.723      1.672
clear rows (4x)          6.505   6.240      5.927
run memory, 1,000 rows   2.09 MB 1.75 MB    1.77 MB

SSR (renders/s)          barq    Solid 2.0  Solid 1.9
renderToString           20824   12896      21455
renderToStream, drained  15234   10023      745

hydration, 100 cards     barq    Solid 2.0  Solid 1.9
at load (ms)             5.27    4.76       2.11
after load (ms)          2.08    2.03       1.12

bundle, gzip / brotli    barq          Solid 2.0     Solid 1.9
hello world              14715/13287   12458/11318   5391/4868
jfb app                  21907/19795   15689/14236   7247/6544

compiler output, 137 fixtures, sum of gzip: barq 52178, Solid 2.0 53960
```

Closed in this pass (before is the same lane on the parent commit):

- Bundle: a render-only page no longer ships the hydration claim walk. hello
  17865 to 14715 gz, jfb 24852 to 21907 gz.
- swap rows: the two swapped rows are moved directly instead of indexing the
  whole list; 0.064 to 0.016 ms per swap at 1x, 0.875 to 0.230 ms in the lane.
- partial update: a live `textContent` writes its text node's data; 0.187 to
  0.171 ms per update at 1x.

Open, and why:

- create rows (+24%), memory (+19%): barq creates two effects per row where
  Solid 2.0 fuses the row's class and label into one. The compiler fuses only
  per element and keeps an expensive, dependency-disjoint call in its own
  effect by design; a hand-fused barq row measured create 10k 16.6 to 15.5 ms
  and memory 2.18 to 1.96 MB. The rest is `each`'s row machinery.
- bundle size: what remains is the DOM layer (`dom.ts`, `flow.ts`) at about
  three times `@solidjs/web`'s size; the regions' claim code still ships.
- hydration at load: equal after load, so the 10% is first-run cost of the
  larger code path rather than claim work.
