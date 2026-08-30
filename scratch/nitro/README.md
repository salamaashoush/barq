# What Nitro costs per request

Measured on this machine with `bun`, against `h3@2.0.1-rc.29` — the version
`nitro@3.0.260610-beta` depends on. `bun install && bun same-job.mjs`.

## The answer

Nitro is slower, by h3's dispatch, and by nothing else.

`same-job.mjs` runs both paths over identical work: the same build-time asset
map, the same terminal handler. Only h3 moves.

```
SSR page (asset miss)                  static asset (hit)
  serveBarq (no h3)  1.7209 us           serveBarq (no h3)  1.5320 us
  nitro (through h3) 2.1797 us           nitro (through h3) 1.9369 us
  +0.459 us (27%)                        +0.405 us (26%)
```

`dispatch.mjs` measures h3 in isolation and agrees: 0.446 us for `H3Event` plus
the URL parse plus the rou3 lookup.

Against the handover's baselines:

```
api route GET   2.10 us -> 2.53 us   +21%
404             6.50 us -> 6.93 us    +7%
page render    15.20 us -> 15.63 us   +3%
```

## Do not use preview.mjs as the baseline

`static.mjs` compares the two static lookups, and nitro wins that one:

```
MISS   preview.mjs (existsSync+statSync)  1.3295 us   vs  nitro  0.8080 us
HIT    preview.mjs (existsSync+statSync)  1.1544 us   vs  nitro  0.7986 us
```

That is not a point in nitro's favour. `preview.mjs` stats the filesystem per
request and barq should replace it with a build-time map whether or not nitro
lands. Comparing against it flatters nitro by counting a barq bug as a nitro
feature.

## Method

`overhead.mjs` and `same-job.mjs` MODEL nitro's static handler rather than
importing it — importing means building a nitro app. The model is line-for-line
from `runtime/internal/static.ts`, and the map it reads is the shape
`build/virtual/public-assets.ts` emits: an object built at build time, so a
lookup is a property read.

These are a decision aid, not a gate. The gate, if nitro lands, is that
kitchen-sink builds under `nitro/vite` and the emitted output boots and serves.
