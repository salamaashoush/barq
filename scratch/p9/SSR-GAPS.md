# Streaming SSR + hydration: measured gaps vs Solid, TanStack and React

> STATUS 2026-08-23. Closed since this was written: 1 (tail held), 3 (lifecycle +
> error policy), 9 (document hydration), plus two defects this file did not know
> about — `renderPage` shipping SKELETONS for in-component async, and two passes
> settling only one level of nesting. Both died with the second pass, which is
> gone: the buffered arm now parks and resumes like the stream, as Solid and
> TanStack do. Still open: 2, 4, 5, 7, 8. Gap 6 is WITHDRAWN — see its section.

Measured 2026-08-23. Probes: `scratch/p9/stream-tail.ts` (run from `packages/server`
as `bun --preload ./src/test-setup.ts ../../scratch/p9/stream-tail.ts`) and
`scratch/p8/p8-probe.tsx` (with `scratch/p8/p8-setup.ts` as the preload).

## What barq ALREADY has, and it is not little

- Out-of-order streaming: `<template data-barq="n">` + `window.__BARQ_SWAP__(n)`
  (`packages/server/src/server.ts:291`). The same mechanism as Solid's `$df`
  (`dom-expressions/src/server.js:212-218`).
- Incremental seroval seeding with DEFERRED values inside a payload
  (`server.ts:440-470`, `encodeDeferred`). Solid does this through
  `createSerializer` / `serializer.write` (`server.js:110-140`).
- A seed channel so a client read WAITS instead of refetching (`server.ts:352`).
  Solid has no equivalent; it is a genuine barq idea.
- Pre-hydration event capture and replay (`__BARQ_EVTS__`).
- Stream timeout, abort signal, consumer-cancel handling (`server.ts:404-425`).

## The gaps, each measured or cited

### 1. EVERY post-shell byte lands after `</html>` — measured — **CLOSED**

`scratch/p9/stream-tail.ts`, a full document with one late boundary:

```
[0] <html><head><title>t</title></head><body><main><!--[b:0--><i>skeleton</i><!--]--></main></body></html>
[1] <script>window.__BARQ_EVTS__=[] …          event replay
[2] <script>(function seedChannel() …          seed channel
[3] <script>window.__BARQ_SWAP__=function …    swap snippet
[4] <template data-barq="0"><b>LATE</b></template><script>window.__BARQ_SWAP__(0)</script>
[5] <script>window.__BARQ_SEED__&&window.__BARQ_SEED__.done()</script>

</html> at 95 | first <template> at 2799 | LATE CONTENT AFTER </html>? true
```

`shellStream` (`packages/router/src/server.ts:1001`) pipes chunks straight
through. Browsers reparent, so it renders — but TanStack explicitly guards it:
`router-core/src/ssr/transformStreamWithRouter.ts:583` "captured bytes from
`</body>` onward; must stay behind router scripts", `:634` "router HTML would put
scripts after `</body>` or drop them silently", `:825` "held until router scripts
are ready so injection remains before `</body>`".

### 2. The runtime scripts are emitted AFTER the shell, not in `<head>`

Chunks 1-3 above. Solid's `HydrationScript` is a component the document places in
`<head>` (`dom-expressions/src/server.js:305`, `:547 generateHydrationScript`), so
event capture is armed before the body is parsed. barq arms it only after the
whole shell has been parsed.

### 3. No shell/stream lifecycle at all — **CLOSED**

React Fizz has `onShellReady`, `onShellError`, `onAllReady`, `onError`
(`ReactFizzServer.js:418-434`). barq has none, and the consequence is structural:
`createPageHandler` decides the status before the shell and has no way to recover
from a throw INSIDE the shell — the document tears mid-stream.

### 4. No asset / resource hoisting

Solid: `useAssets` / `getAssets` + `injectAssets` (`server.js:536-545`, `:586`).
React: Float — `writeHoistables`, `writeHoistablesForBoundary`, `preamble`
segments (`ReactFizzServer.js:75-84`, `:273`, `:399`). barq has neither, so a
`<link>` or `<title>` discovered in a LATE boundary can never reach `<head>`.
Checked by name across `packages/server/src` and `packages/core/src`: no
`useAssets`, `getAssets`, `hoist`, `preinit`, `bootstrapScript`.

### 5. No `NoHydration` / server-only islands

Solid `server.js:569`. barq has no way to say "render this on the server and
never hydrate it".

### 6. No selective hydration — **WITHDRAWN, deliberately**

WITHDRAWN 2026-08-23 after reading the source. React's selective hydration is a
remedy for a cost a fine-grained framework does not pay: `ReactFiberBeginWork.js:1966-1972`
shows hydration happening INSIDE the render loop — `updateHostComponent` calls
`tryToClaimNextHydratableInstance` as a side effect of walking a fiber, so React
re-executes every component and builds a fiber tree to hydrate. Slicing, lanes and
interaction priorities exist to make that interruptible.

barq and Solid do not render to hydrate: components run ONCE as setup and
hydration is a DOM walk that claims nodes and wires bindings, so the work scales
with BINDINGS rather than tree size. Measured on barq's own L5 throughput channel:

```
  10 rows  claim   286 µs
 100 rows  claim  1923 µs
 400 rows  claim  6308 µs
1000 rows  claim 15650 µs      <- js-framework-benchmark table, the dense case
```

Solid, the closest reference, deliberately has none of it: `client.js:251-268`'s
`hydrate()` is one synchronous `render(code, element, [...element.childNodes],
options)`, and its hydration path contains no scheduler, priority or transition.

Building lanes for barq would mean growing a concurrent scheduler to solve a
problem barq mostly does not have. The fine-grained answer to the same goal is
gap 5 — do not hydrate what does not need it — where a static subtree costs ZERO
claim work rather than being claimed faster.

The one React idea worth taking was the DEHYDRATED BOUNDARY, and it is taken: a
pending boundary keeps its fallback hydrated and costs the page nothing. That is
a wire-format idea, not a scheduler idea.

### 7. No bounded buffers

TanStack errors at three explicit limits ("SSR stream pending output exceeded
maximum buffer", "SSR router HTML exceeded maximum buffer", "SSR stream tail
exceeded maximum buffer"). barq's stream has a timeout but no size bound.

### 8. `__BARQ_SEED__` is dead

Previously measured and recorded in `HANDOVER.md`: a module entry is deferred by
definition, so it always runs after `done()`. The channel never has a waiter.

### 9. Document hydration does not work — measured — **CLOSED**

`claimed: 0`, then "Failed to execute 'appendChild' on 'Node': Only one element on
document allowed." `packages/compiler-rs/src/codegen/fallback.rs:31-46` wraps every
`element()` in `cold_call` → `_$hole(null, null, …)` →
`packages/core/src/hydration.ts:541` `withoutClaim`. `<html>`, `<head>` and
`<body>` all take that path because the parser strips them out of a `<template>`,
so the entire document frame is unhydratable by construction. The core-side fix is
already in place and green (`claimElement`, `withinElement`, doctype skip,
`Document` container).
