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

## What barq did about it

`assetMiddleware` (`packages/start/src/static.ts`) serves `dist/client` from a
manifest the build writes, so a miss is a `Set.has` and not two syscalls.
`barq-static.mjs` measures the REAL middleware against the real manifest and the
real output directory, not a model:

```
MISS (an SSR page request, the common case)
  preview.mjs (existsSync+stat)   0.7476 us  1,337,528/s
  assetMiddleware (manifest)      0.3290 us  3,039,208/s
  -> 0.419 us saved per request, 56% faster
```

There is no HIT row. A hit is delegated to `srvx/static`, which streams from an
open handle; looping it without consuming 100,000 response bodies leaks
descriptors and bun errors on collection, which says more about the benchmark
than about the middleware.

That 0.419 us is most of the 0.459 us nitro costs. It does not make nitro free —
h3's dispatch is separate and unchanged — but it does mean barq's own server is
now the faster of the two on the work they share.

## Method

`overhead.mjs` and `same-job.mjs` MODEL nitro's static handler rather than
importing it — importing means building a nitro app. The model is line-for-line
from `runtime/internal/static.ts`, and the map it reads is the shape
`build/virtual/public-assets.ts` emits: an object built at build time, so a
lookup is a property read.

These are a decision aid, not a gate. The gate, if nitro lands, is that
kitchen-sink builds under `nitro/vite` and the emitted output boots and serves.
