# Front-door session — facts verified at HEAD (2f7844f), by me, before any agent report

## Baselines, MEASURED (the brief's numbers are stale in three places)

| gate | brief says | measured |
|---|---|---|
| `cargo test` (packages/compiler-rs) | 335 | **337** pass, 0 fail |
| compiler-rs `bun test` | 3490 / 0 | 3490 pass, 16 todo, 0 fail, 1 error (the self-check) |
| core | 918 | 918 |
| server | 92 | **97** |
| start | 36 | 36 |
| router | 141 | **260** |
| extra | 26 | 26 |
| testing | 16 | 16 |
| compiler (plugin) | 22 | 22 |
| `bun run ci` | 0 | EXIT=0 |
| kitchen-sink `bun run build` | builds | EXIT=0, 73 modules, 218.81 kB |

Rust workspace root is `packages/compiler-rs`, not the repo root — `cargo test` from
the repo root fails with "could not find Cargo.toml".

## The five gaps, re-verified

1. **Nothing renders a page in dev.** `packages/start/src/vite.ts:167` — the dev
   middleware `next()`s anything not under `RPC_PREFIX`. `createPageHandler`,
   `serveBarq` and `createFetchHandler` have **zero non-test call sites**
   (grep over `packages/**/*.ts{,x}` minus `dist/` and `*.test.ts`). CONFIRMED.
2. **No production build.** `barqStart()`'s `config()` (`start/src/vite.ts:136-143`)
   returns `environments.{client,ssr}` with `consumer` and `build.ssr` only. No
   `rollupOptions.input`, no `outDir`, no `builder`, no `buildApp`. CONFIRMED.
3. **No entry convention.** `grep -rn "entry-client|entry-server|entryClient|entryServer"`
   over `packages/` → zero hits. CONFIRMED.
4. **No client boot.** No caller pairs `hydrate()` with `createRouter`/`RouterProvider`
   outside tests. CONFIRMED (tests do — see P6-8).
5. **kitchen-sink is a client-only SPA.** `vite.config.ts:133` is
   `barqVitePlugin({ routes: ROUTES })` + a mock-API plugin. `index.html` +
   `src/main.tsx` calling `render(...)`. CONFIRMED.

`lazy()` is present: `packages/core/src/components.ts:429`, landed in `4e9660b`.
The brief's note is right — route-level code splitting is available.

## Vite 8.2.2 facts, read off the local install
(`packages/kitchen-sink/node_modules/vite/dist/node/`)

- `Plugin.buildApp?: ObjectHook<BuildAppHook>` — `index.d.ts:3069`.
  `BuildAppHook = (this, builder: ViteBuilder) => Promise<void>` — `index.d.ts:2419`.
- `BuilderOptions` — `index.d.ts:2393-2409`: `sharedConfigBuild` (default **false**),
  `sharedPlugins` (default **false**), `buildApp`.
- **DECISIVE: plugin closures are NOT shared across environments during
  `vite build`.** `chunks/node.js:34262-34285`: with `sharedConfigBuild: false`,
  `createBuilder` calls `resolveConfigToBuild(inlineConfig, ...)` once **per
  environment**, and only swaps back the root instance for plugins carrying
  `sharedDuringBuild: true` (or under a global `sharedPlugins: true`) — matched
  **by plugin name**, `resolvedPlugins[i] = config.plugins[k]`.
  => `barqRouter()`'s `routeAssets` map, populated in the CLIENT build's
  `generateBundle` (`router/src/vite.ts:246-266`) and read by the SSR build's
  `load()` of `virtual:barq-route-assets` (`:274-276`), reads a **different,
  empty closure**. Silent `{}`. This is a live defect in the existing plugin the
  moment a two-environment build exists.
  Fixes: `sharedDuringBuild: true` on the plugin, or `builder.sharedPlugins: true`,
  or write the map to disk between the two builds.
- `builder.buildApp` fallback: `chunks/node.js:34238` — if no plugin `buildApp`
  built anything, Vite builds every environment **sequentially in
  `Object.keys(config.environments)` order**. Relying on that order is relying on
  config-merge order; declare `buildApp` explicitly.
- **Dev middleware order** — `chunks/node.js:26620-26660`:
  - `configureServer` hooks run at `:26631`; middlewares registered with
    `use()` inside them land **before** `transformMiddleware` (`:26648`),
    `serveStaticMiddleware` (`:26650`) and `htmlFallbackMiddleware` (`:26653`).
  - the functions those hooks **return** ("post hooks") run at `:26654` —
    **after** `htmlFallbackMiddleware`, **before** `indexHtmlMiddleware` (`:26656`).
  - `appType: 'custom'` removes `htmlFallbackMiddleware`, `indexHtmlMiddleware`
    and `notFoundMiddleware` entirely (`:26653`, `:26655-26657`).
  => RPC stays a **pre** `use()` (as today); the page handler belongs in a
  **post** hook, so Vite serves `/@vite/client`, `/src/*`, `node_modules` and
  public files first and only unclaimed URLs reach SSR. RPC-before-page is then
  guaranteed by the stack, not by a comment. And `appType: 'custom'` makes the
  existing `originalUrl` un-rewrite at `start/src/vite.ts:165-166` unnecessary —
  that fixup exists only because the SPA fallback rewrites `req.url` to
  `/index.html` at `:26653`, before the post hooks.
- **`transformIndexHtml` works on an arbitrary HTML string**, no file on disk.
  `createDevHtmlTransformFn` — `chunks/node.js:25504-25528`; `devHtmlHook`
  returns the `/@vite/client` tag with `injectTo: "head-prepend"` (`:25679-25685`),
  and `injectToHead(html, tags, true)` is regex+MagicString over the string
  (`:25022-25031`), falling back to `<html>`, then doctype, then bare prepend
  (`:25044-25048`). So the router's `wrapStream` head fragment
  (`router/src/server.ts:538`, everything up to `<!--barq-body-->`, which
  includes `<body>` and the mount div) can be transformed before it is flushed.

## Two defects in the layers below, found while reading — need probes

- **A streamed page emits no pre-hydration event capture.**
  `EVENT_CAPTURE_SNIPPET` is installed only by `hydrationScriptFor`
  (`server/src/server.ts:695-697`), which only `renderPage` uses. The stream's
  `seedScript` (`:470-477`) writes `__BARQ_DATA__` and `__BARQ_SEED__.tell` and
  nothing else. `hydrate` consumes `__BARQ_EVTS__` / `__BARQ_EVTS_STOP__` at
  `core/src/dom.ts:2192-2195`. Streaming is `createPageHandler`'s DEFAULT
  (`router/src/server.ts:327`), so **every default barq page drops input made
  before hydration**, and H6's whole claim-based replay apparatus is unreachable
  on the default path.
- **`hydrate`'s recovery snapshot races the stream.** `dom.ts:2301` snapshots
  `__BARQ_DATA__` and `:2340` writes it back on the mismatch path; a stream flush
  in between (`server.ts:471`, `Object.assign(window.__BARQ_DATA__||{}, …)`) is
  lost. Only reachable on the already-bad recovery path — lower priority, but it
  is the recovery that D9 says discards every route-B seed.

## The SSG decision, with the evidence

`renderPage` (`server/src/server.ts:~100-180`) renders twice, `await settle(session)`,
and returns `{html, data, script}` where `script` is
`window.__BARQ_DATA__=<seed>;<EVENT_CAPTURE>`. **Fully-resolved markup, one seed
script, no seed channel, no `SWAP_SNIPPET`, no `<template>` swaps.**

`renderToStream` (`:514-624`) emits shell, `SEED_CHANNEL_SNIPPET`, `SWAP_SNIPPET`,
per-round `<template>` + `window.__BARQ_SWAP__(id)`, then `__BARQ_SEED__.done()`.

=> Prerendering a **streamed** response bakes fallback markup into the first paint
and leaves swap scripts in a static file. Prerendering a **non-streamed** one is
exactly what a static file wants, and it goes through the same encoder into the
same `__BARQ_DATA__` the client already reads.

**So: a prerendered route IS a build-time invocation of `createPageHandler`, with
`stream: false`. SSG and SSR share the seed channel because of that, not despite it.**
One consequence: `stream` is fixed at handler-construction time
(`router/src/server.ts:327`), so the server entry has to expose its OPTIONS, not
only its `fetch`, or the prerenderer cannot rebuild a non-streaming twin.

## The per-route-render-mode gap nobody has named

`RouteDefinition.ssr?: boolean | "data-only"` exists (`router/src/route.ts:357`)
and `resolveSsr` uses it (`router/src/router.ts:81`). But the FILE-BASED generator
never emits it: `routes.rs:296-332` (`emit_node`) emits only
`path, id, src, component, loader, pending, children`. And it cannot read one —
`routes.rs` does `read_dir` and **no `read_to_string` at all** (grepped: the only
fs call in the file is `:87`).

So today a file-based route cannot declare `ssr: false` or "prerender me", and the
route module is `lazy()` so nothing can ask it at runtime without loading it
eagerly and defeating the split. This is a real decision, not a detail: gap 5 asks
for per-route render mode in kitchen-sink.

## A blocker the brief does not mention: `@barqjs/router` does not typecheck at HEAD

`cd packages/router && bunx tsc --noEmit` → **7 errors**, all `RouterState`
interface drift introduced by the HEAD commit `2f7844f`:

```
src/devtools.ts(118,28): TS2339: Property 'ssrModes' does not exist on type 'RouterState'.
src/router.ts(1094,40):  TS2740: 'BeforeLoadResult' is missing … from 'readonly Record<string, unknown>[]'
src/router.ts(1311,5):   TS2322: runBeforeLoad signature mismatch
src/server.ts(67,15):    TS2554: Expected 0 arguments, but got 1.     (state.prime(true))
src/server.ts(69,23):    TS2339: Property 'ssrModes' does not exist on type 'RouterState'.
src/server.ts(293,11):   TS2739: … missing contexts, produced
src/server.ts(302,13):   TS2554: Expected 2 arguments, but got 3.
```

`bun run ci` is `oxlint --type-aware --deny-warnings` + `oxfmt --check`. It does
**not** run `tsc`, and `bun run typecheck` is a separate per-package script that
nothing in the gate list calls. So the implementation of `runBeforeLoad`,
`prime` and `ssrModes` landed without their interface. Fix this first; every
front-door surface is typed against `RouterState`.

Gate list should grow a `typecheck` row.

## PROBE (Tier 1, measured) — plugin closures across environments, and what turns `vite build` into an app build

`scratch/frontdoor/probe-shared/` — a two-environment Vite 8.2.2 build with one
plugin that sets closure state in the CLIENT `generateBundle` and reads it from a
virtual module's `load()` in BOTH environments.

```
=== sharedDuringBuild ABSENT ===
[probe] buildApp order: client then ssr
[probe] load in client: assets=null
[probe] client generateBundle set assets
[probe] load in ssr: assets=null            <-- DIFFERENT CLOSURE
[probe] generateBundle in ssr, assets=null

=== sharedDuringBuild: true ===
[probe] load in ssr: assets={"/a":["index.js"]}   <-- SAME CLOSURE
```

So `barqRouter()`'s `routeAssets` is silently `{}` in the server build unless the
plugin opts in. Not a hypothetical: it is the shape the plugin is written in today.

Three more results from the same probe:

1. A plugin's `config()` hook may return **`builder: {}`**, and that alone makes a
   plain `vite build` (no `--app` flag, no user config change) run the app build.
   Measured identical output with and without `--app`.
2. With **no** `builder` declared anywhere, a plugin's `buildApp` hook still fires
   but `builder.environments.ssr` is `undefined` (legacy single-environment
   setup) and the build dies with
   `TypeError: Cannot destructure property 'logger' of 'environment' as it is undefined.`
   Fail-loud, not silent — but it means `builder` must be declared.
3. `builder.build(builder.environments.client)` then `.ssr` inside a plugin
   `buildApp` gives explicit, order-guaranteed sequencing, and suppresses Vite's
   "build everything if nothing was built" fallback (`chunks/node.js:34238`).

## PROBE (Tier 1, measured, in a real browser) — the client boot seam, and what it found

`scratch/frontdoor/probe-e2e/` — a real Vite 8.2.2 dev server on a real socket,
`barqStart()` in the config, `environment.runner.import("/src/entry-server.tsx")`,
`createPageHandler` answering, and a real Chrome driven at it. Two routes, a 30 ms
loader, `pending` fallback, `hydratable: true`.

### 0. It works at all — but only with `noExternal`

First run rendered `<i>loading</i>` with `__BARQ_DATA__=({})` — an empty seed and a
spinner. That is EXACTLY the symptom of P-B ("non-streamed SSR returns the fallback"),
which `packages/router/DESIGN.md:41-60` records as fixed in `8a3f730`.

It was not a regression. `@barqjs/*` lives in `node_modules`, so the **ssr
environment externalised it** and Node's resolver took the `import` condition to a
**stale `dist/`**. Adding
`environments.ssr.resolve.noExternal: [/@barqjs\//]` produced
`<b id="u">Ada 7</b>` and `{"r:/users/$id|id=7":{name:"Ada 7"}}`.

Recorded because the failure was silent and it impersonated a known-fixed bug.
Whatever `barqStart()` ends up declaring must set `resolve.noExternal` for the barq
packages in the ssr environment — TanStack does exactly this
(`resolve.noExternal: ['@tanstack/start**', …]`).

### 1. CONFIRMED: a streamed page has no pre-hydration event capture

Counted in the EMITTED HTML, not in a post-hydration global — `hydrate` sets
`__BARQ_EVTS__` back to `undefined` when it consumes it (`core/src/dom.ts:2192-2195`),
so reading the global after load cannot tell "never set" from "consumed":

```
occurrences of __BARQ_EVTS__ in the response body
  prerendered file (stream:false)   1
  dev SSR, stream=false             1
  dev SSR, stream=true              0
```

Streaming is `createPageHandler`'s default (`router/src/server.ts:327`), so **the
default page drops every click and keystroke made before hydration**, and H6's
claim-based replay is unreachable there. `EVENT_CAPTURE_SNIPPET` is emitted only by
`hydrationScriptFor` (`server/src/server.ts:695-697`), which only `renderPage` uses.

### 2. CONFIRMED, and it is the big one: a router page cannot hydrate

First browser run, unpatched:

```
report = { mismatches: [
    { kind: "not-hydratable", detail: "branch reached its primitive without the hydratable flag" },
    { kind: "not-hydratable", detail: "…the CLIENT module was not compiled with `hydratable`" } ],
  claimed: 0, ranges: 0, built: 2, recovered: true }
seedLeft = ["r:/users/$id|id=7"]     // the seed was never consumed
```

`recovered: true` is `hydrate`'s **full cold re-render** (`dom.ts:2334-2354`) — the
worst case `packages/router/DESIGN.md:254-256` names. The message is wrong about the
cause: nothing was compiled without the flag. The mechanism is three lines:

- `packages/core/src/flow.ts:166` — `if ((flags & HYDRATE) === 0)` reports
  `not-hydratable` and builds cold. `HYDRATE = 1 << 2` (`flow.ts:87`).
- `packages/router/src/components.ts:115`, `:138`, `:154` — `renderDepth` passes
  `0` to both `boundary` calls and **no flags at all** to `branch`. It cannot pass
  the flag: `HYDRATE` is **not exported** from `@barqjs/core` or `@barqjs/core/internal`.
- `packages/server/src/ssr.ts` — `ssrLoading` hardcodes `flags = 0` and `ssrErrored`
  omits the argument, and the string `boundary` writes a range only when
  `(flags & HYDRATE) !== 0`. So the server writes no range and the client expects none.

**Both halves are wrong in the same direction, which is why nothing ever errored.**
That is CODESIGN §6's stated blind spot ("a defect in the specification itself… `-O0`
and `-Ox` will agree on it") landing on the two BACKENDS instead of the two levels.

Patching both halves to pass `HYDRATE` (`scratch/frontdoor/router-copy/`, a copy —
the repo is untouched) moves it forward but does not close it:

```
report = { mismatches: [
    { kind: "structure", detail: "1 server node(s) at a boundary that parks" },
    { kind: "structure", detail: "3 server node(s) at a range the client rebuilt" } ],
  claimed: 0, ranges: 2, built: 2, recovered: false }
```

`recovered` is false — no cold re-render — but `claimed: 0`: the client still
rebuilds inside the ranges it now finds. Two residual causes, both structural:

- **`renderDepth` calls `branch` per depth; `renderRoutes` has no `branch`** and
  says so (`router/src/server.ts:55-58`: *"There is no `branch` on this side and none
  is needed"*). Three claims per depth on the DOM side, two on the string side.
- **A parked boundary writes `<!--[b:0-->`**, whose content the stream swaps in
  after the fact; the client cannot claim nodes that were not there when it walked.

So gap 4 is not "wire up a client entry". The seam it would sit on does not agree
with itself, nothing in the repo has ever compared the two, and closing it is work in
`packages/core` (export the flag), `packages/server` (`ssrLoading`/`ssrErrored` must
take and forward flags) and `packages/router` (make the two walks emit the same shape).

## PROBE (Tier 1, measured) — a virtual module IS a valid per-environment build input

Vite 8.2.2 / rolldown 1.2.5. `scratch/frontdoor/probe-shared/`, second config.

```
environments.client.build.rollupOptions.input = { index:  "virtual:entry-client" }
environments.ssr.build.rollupOptions.input    = { server: "virtual:entry-server" }
```

```
building client environment ... dist2/client/assets/index-D2tdD0H4.js
building ssr    environment ... dist2/server/server.js
```

Both resolved through the plugin's `resolveId`/`load` and bundled. No `index.html`
is required or emitted. The ssr output filename comes from the **input KEY**, not
from the id — which is worth knowing, because TanStack's open bug #8118 is exactly
"the prerender step reconstructs the server output filename from the input path" and
breaks on any `entryFileNames` override. Naming the key fixes half of it; recording
what was actually emitted fixes the rest.

The Vite d.ts documents nothing about `\0`-prefixed ids as inputs, so this is
measured rather than cited.

## PROBE (Tier 1, measured) — deferred loader data, both render arms

`scratch/frontdoor/probe-e2e/run-deferred.mjs`. A loader returning
`{ name, late: <promise resolving after 600 ms> }`.

`stream: false` seed:
```
window.__BARQ_DATA__=({"r:/users/$id|id=7":{name:"Ada 7",late:"LATE"}});<EVENT_CAPTURE>
```
Fully resolved, deterministic at 600 ms. Mechanism, not luck:
`packages/server/src/server.ts` — `renderPage` ends with
`const data = await settleNested(getHydrationData(session));`, so nested promises are
awaited before `encodeSeed` runs.

`stream: true` seed, same route:
```
$R[2]=($R[3]=($R[4]=() => { const resolver = { p: 0, s: 0, f: 0 };
  resolver.p = new Promise((resolve, reject) => { resolver.s = resolve; resolver.f = reject });
  return resolver })()).p
…later…  ($R[5]=(resolver, data) => { resolver.s(data); … })($R[3],"LATE")
```

This falsifies a claim in the first draft of `DESIGN-FRONTDOOR-draft.md` (that
`crossSerialize` would refuse a pending promise and prerender should throw). It also
strengthens the SSG decision: on this input the two arms differ by an entire deferred
-value protocol, and only one of them belongs in a static file.

## PROBE (Tier 1, measured) — the whole front door, end to end, built and prerendered

`scratch/frontdoor/probe-e2e/vite.build.config.mjs` + `prerender.mjs` + `static.mjs`.
A hand-written plugin doing exactly what `barqStart()` does not do today.

**The production build works, in the shape §2.2 proposes.**

```
dist/client/assets/index-DLemPWvg.js
dist/server/server.js
```

and the server bundle really carries the client's hashed name:

```
$ grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/server/server.js
assets/index-DLemPWvg.js
```

That crossed the environment boundary through `sharedDuringBuild: true` + a virtual
module, with the identity check TanStack's #7912 is missing — the `generateBundle`
hook accepts a chunk only when `chunk.isEntry && chunk.name === "index"`, our own
named input, rather than "some entry chunk".

**SSG works, in-process, from the built bundle. No preview server, no HTTP.**

```
[prerender] server entry exports: [ "default", "options", "prerenderHandler" ]
[prerender] /users/7 -> 200 1470B  streaming-artefacts:none
[prerender] /users/8 -> 200 1470B  streaming-artefacts:none
```

`streaming-artefacts:none` is a check for `__BARQ_SWAP__`, `<template data-barq=`
and `__BARQ_SEED__` in the written file. Each file carries its own correct seed
(`{"r:/users/$id|id=7":{name:"Ada 7"}}` / `id=8` / `"Ada 8"`).

**And the hydration defect is universal, not a dev artefact.** Serving
`dist/client` as plain static files and loading `/users/7` in Chrome gives the same
report as the dev server:

```
{ mismatches: [{kind:"not-hydratable", …}], claimed: 0, ranges: 0, built: 2, recovered: true }
seedLeft = ["r:/users/$id|id=7"]
```

So dev SSR, production SSR and SSG all land on the same broken seam. It is the
first thing to fix, and nothing downstream is worth measuring until it is.

## PROBE (Tier 1, measured in Chrome) — recovery-mode hydration is NOT "a correct page"

The red team's single biggest scheduling claim was that `hydrate`'s recovery path is
*"a correct page — the cost is first-paint latency"*, so the front door could ship on
it and the seam could be fixed later. **Measured false.**

Same prerendered static file as above, loader instrumented with a call counter.
Four consecutive loads, deterministic:

```
{ text: "shell:loading", calls: 1, recovered: true, built: 6, seedLeft: 1 }   x4
```

Sampled over time on one load: `t=200 / 500 / 1000 / 2000 / 4000 ms` — **`shell:loading`
at every one.** `appHtml` is `<div id="root">shell:<i>loading</i></div>`.

So on this input the recovered page is:

1. **A permanent `pending` fallback.** The SSR'd `<b id="u">Ada 7</b>` was correct and
   painted; recovery threw it away and the content never came back. The loader ran
   (`calls: 1`) and resolved (30 ms); the boundary never re-armed. Same signature as
   `packages/router/DESIGN.md` P6-5's *"the boundary never re-arms, and NOTHING
   surfaces: a permanent spinner."*
2. **A duplicate fetch.** `calls: 1` on the client for a value the server already had.
3. **A seed shipped and never consumed** — `seedLeft: 1`.

An earlier run of the same page with an *uninstrumented* loader did reach `Ada 7`
(`built: 2` rather than `built: 6`), so the outcome is input-dependent. That does not
soften the conclusion: a page that sometimes permanently spins is not a page you ship
the front door on. **Step 1 is blocking.**

---

# STEP 1 — DONE. The hydration seam, and what it actually took

Four changes, and only ONE of them was in the design or the red team's report.

1. **`loadingBoundary` claims a settled range** (`core/src/flow.ts`). Predicted by
   the red team, and its diagnosis was exactly right.
2. **A claimed site returns nothing to insert** — `outFor` in `flow.ts`. Neither
   document saw this. K7 synthesises an anchor in a detached fragment when a region
   has no `(parent, anchor)`; on the claim path `claimSite` redirects the site into
   the document, so that fragment holds one empty text node. Returning it inserted
   a stray node AND — because it is what `build` reports as produced —
   made the eviction pass treat the whole server range as unclaimed.
3. **Eviction asks the CURSOR, not the produced-node list** — `evictUnclaimed` in
   `flow.ts` and the claiming run of `insert` in `dom.ts` (`withRangeTaken`).
   A nested region claims in place and hands its caller nothing, so comparing
   produced-lists removes the page. `each` has always asked its row cursor this
   way; this is the same question in two more places.
4. **The string backend marks a boundary that showed its FALLBACK** — `<!--[f:-->`,
   `server/src/ssr.ts`. Found by the L5 oracle: `control-flow-await-suspense`
   regressed to 0% reuse and a full recovery, because a non-streamed render whose
   body never settles emits the fallback with no marker and the client claimed it
   as content. `b:` could not cover it — that one only exists on the streaming path.
   Gated on `HYDRATE`, which the `-O0`/`-Ox` byte-identical channel then caught me
   getting wrong: `b:` is functional (the stream needs it), `f:` is a hydration
   marker and must follow the flag like every other range.

Plus the two the design did name: export `HYDRATE` from `@barqjs/core`, give
`ssrLoading`/`ssrErrored` a `flags` parameter, pass it from both router walks, and
emit `EVENT_CAPTURE_SNIPPET` on the streamed path.

## What the oracle said

`packages/compiler-rs/test/hydration.test.ts`, L5, node-identity reuse:

| fixture | before | after |
|---|---|---|
| `control-flow-errored-loading` | 33%, `kinds: ["structure"]` | **67%, `kinds: []`** |
| `control-flow-await-suspense` | 43%, `kinds: ["structure"]` | **60%**, same kinds |

Both baselines updated with the reason. And the scope is wider than the router:
**the compiler emits `boundary(..., 4)` on BOTH backends for a `<Loading>`**
(verified against a real `transform()`), so every compiled `<Loading>` subtree in
every barq app was rebuilding cold on hydration. `hydration.test.ts` had zero
`Loading` coverage, which is why nothing said so.

## Measured in a real browser, on a prerendered static file

```
BEFORE  { text: "shell:loading", calls: 1, claimed: 0, built: 6, recovered: true,  seedLeft: 1 }
AFTER   { text: "shell:Ada 7",   calls: 0, claimed: 2, built: 0, recovered: false, seedLeft: 0 }
```

`calls` is the loader's own counter, `seedLeft` the unconsumed seed keys. The
post-hydration markup is byte-identical to the prerendered file.

## One thing the probe taught that is NOT a bug

The first runs of this measurement loaded `/users/7?nocache=<random>` to defeat
the browser cache, and the seed never hit. That is correct behaviour:
`keyOf` (`router/src/router.ts`) puts `searchKey(forSearch)` in the loader key, so
`?nocache=…` is a different key from the one the server rendered. Recorded because
it looked exactly like a seeding bug for three rounds.

---

# STEP 2 — DONE. Entries and dev SSR

`vite dev` now renders pages. `barqStart()` grew the entry convention, the
environments, `builder`, and a page middleware; `createPageHandler` grew the two
seams it had no way to offer.

## Two silent failures only a live server found, both about MODULE IDENTITY

1. **`resolve.noExternal` for `@barqjs/*` in the ssr environment is mandatory.**
   Without it the runtime's own resolver takes the `import` condition to a built
   `dist/`, and a stale one renders a spinner with an empty seed — which
   impersonates P-B, a bug the repo had already fixed.

2. **The two environments must resolve those packages the SAME way, and when
   they do not, a streamed page parks forever.** Measured on the dev server: the
   stream emitted the event capture, the seed channel and the swap helper, then
   `done()` — no `<template>`, no swap call, no seed at all, and `[b:0` still in
   the markup at hydration time. Cause: the client environment took the `bun`
   condition to `src/` and the ssr environment took `import` to `dist/`, so
   `@barqjs/core` existed twice — the render parked into one copy's async
   session and the resume loop ran in the other's. Aligning
   `environments.ssr.resolve.conditions` with the client's fixed it in one line.
   This is a workspace-development hazard rather than an application one — a
   published app resolves `import` on both sides — but kitchen-sink is exactly
   the shape that hits it.

## A pre-existing bug the dev page surfaced

`packages/compiler/src/vite.ts` injected its diagnostics overlay as
`src="/@id/\0virtual:barq-diagnostics"` — the RESOLVED id, whose `\0` is a
literal NUL in the attribute. Measured against a live server:

```
/@id/<NUL>virtual:barq-diagnostics   404
/@id/virtual:barq-diagnostics        200
/@id/__x00__virtual:barq-diagnostics 200
```

So the dev overlay has never loaded, in any barq app. Fixed to the unresolved id.
It surfaced here only because a SSR'd document is the first one whose script tags
anybody read.

## `injectTo: "body"` on a head fragment is not a cosmetic cost

The design said a body-injected tag would "land at the end of the head fragment,
which is approximately body-prepend". Measured, it lands INSIDE the mount
element — the fragment ends at `<div id="app">` — and the newline Vite puts in
front of it becomes a text node the hydration walk trips over:
`expected <!--[--> at a root region, found the text "\n"`, and the whole page
re-renders cold.

The fix is in `barqStart`'s dev `transformShell`: transform `shell + sentinel`,
and move whatever lands past the sentinel into the head. A tag that asked for the
end of the body gets the end of the head — earlier than it asked for, which is
the direction that cannot break anything — and the mount element keeps the app's
markup as its first child.

## Measured, dev server, streamed, in Chrome

```
{ text: "shell:Ada 7", calls: 0, seedLeft: 0,
  report: { mismatches: [], claimed: 2, built: 0, recovered: false } }
```

and the container at hydration time already shows the swap applied — `<!--[-->`
where `<!--[b:0-->` was, which is what `swapDeferredRange` writing the plain `[`
buys: a swapped range reads as settled and is claimed rather than parked.

---

# STEP 3 (part) — F2 closed, and it was worse than the red team measured

The red team's finding stands, verified independently: a two-environment
`vite build` produced a server bundle with **zero mounts** while the client half
was a correct `clientRpc` stub, so every RPC 404s in production on an app that
works in dev. `load(virtual:barq-server-fns)` runs before rolldown has walked to
any server-function module, and dev only survives it on the module-graph
invalidation `record` does.

**`sharedDuringBuild: true` fixes it — but only if EVERY plugin has it.** Sharing
some is worse than sharing none. `found` lives in `barqStart()`'s closure and only
the compiler plugin's `onServerFns` fills it; with `sharedConfigBuild` false Vite
re-resolves the whole config per environment, so an unshared compiler plugin
belongs to a *different* `barqStart()` call than the shared manifest reads from,
and the manifest generates empty in every environment. Measured: with the manifest
shared and the compiler plugin not, the bundle still mounted nothing.

Shared, the built server carries

```js
//#region \0virtual:barq-server-fns
mount$1("src/data.ts#loadUser", createServerFn().validator("unchecked").handler(...));
```

with the secret present in the server bundle and absent from the client's.

**What sharing cannot cover is refused rather than shipped.** A server-function
module reachable only from the server entry is still discovered after the
manifest is generated. `buildEnd` compares what the manifest shipped against what
was discovered and fails the build naming the modules — BARQ012's method, applied
to a build-order hazard: refuse the shape rather than analyse around it.

Gate: `packages/start/test/build.test.ts`, a real `createBuilder().buildApp()`
over a fixture, asserting the mount id, the secret's absence from the client, and
that the server carries the client's ACTUAL emitted chunk name rather than a
reconstruction of the input name (TanStack's #8118).

---

# STEPS 5 & 6 — the generator's lift, and the port that found six more defects

kitchen-sink is an SSR app on file-based routes, with SSG, per-route render mode
and a client-only route. Getting there found six defects, none of them in the
front door and all of them reachable only by running an application.

## The generator

`routes.rs` reads each route file — the first `read_to_string` in the crate — and
lifts a LITERAL `export const ssr` / `export const prerender` into the table.
Both are wanted before the module loads and the module is `lazy()`, so a runtime
read is not available at the moment either is asked for. A non-literal is
REFUSED and reported rather than guessed at, which is Astro's rule and its
reason: *"Mutable values declared at runtime are not supported."*

Two conventions had to change with it:

- **`src/routes/route.tsx` is the ROOT layout.** `<prefix>.route` needs a prefix
  by construction, so there was no way to write a layout wrapping the whole app
  — and a file named `route.tsx` became a route at `/route`, which nobody naming
  it that means. Its id is `__root__`, because `/` belongs to the root index.
- **`barqRouter`'s watcher gained `change`.** It registered `add` and `unlink`
  only, so editing `export const ssr = false` inside an existing file could never
  move the table. That was harmless while the generator read only directory
  entries; it stopped being harmless the moment it read contents.

And `routes.gen.d.ts` typed `routes` as `unknown[]`, so handing the table to
`createRouter` was a type error in every app. It is
`import("@barqjs/router").AnyRouteDefinition[]` now.

## Six defects the port found

1. **`renderRoutes` never provided `RouterContext`.** The DOM path provides it in
   `RouterProvider`; the string path did not, so any route component calling
   `useLocation`, `useParams` or `useRouter` threw `NoOwnerError` inside its own
   error boundary. The first layout with a nav in it found this.
2. **Every construct the string walk built was DETACHED.** `renderRoutes` passed
   `null` as the scope, `requireScope(null)` answers `null`, and `enter(null)`
   makes a scope with no parent — so a context provided above could never be
   found below. It hands `getOwner()` down now.
3. **`Link` and `NavLink` had no string implementation**, so no SSR'd page could
   contain a link. They build DOM: `template()` and `bindProp`. A string backend
   is installed through a CONTEXT that `renderRoutes` provides, not sniffed from
   `typeof document` — P6-5 already paid for learning that happy-dom defines
   `document` in exactly the process that renders the string backend.
4. **`Router`'s `notFound` prop could never be passed.** A component IS a Block
   and `readSlot` refuses a Block in a value slot — correctly, in general, and
   wrongly here. Every caller that used the prop got
   `ScopeMissingError: Router.notFound (a Cell yielded a Block)`.
5. **Navigating to a `lazy()` route showed its fallback forever.** `renderDepth`
   invokes a route component inside `untrack` — deliberately, per CODESIGN §3.9
   — and a `lazy()` cell read there subscribes to nothing, so the module landing
   could never wake the boundary that parked on it. `lazy()` grew `ready()`, a
   tracked probe the router calls outside the untrack. **Reproduced against
   `bc36100` in a worktree first**, so the record says the front door found this
   rather than caused it. Every route a file-based table generates is `lazy()`.
6. **A chain of `lazy()` routes could not be server-rendered.** `renderPage`
   renders exactly twice, so a two-deep chain resolves its layout on the second
   pass and its leaf on a third that never happens — a prerendered page with a
   nav and no content. `createPageHandler` awaits `preloadMatched(chain)` before
   the render, which is the server twin of what the client entry does.

Plus one in core, found on the last route standing:

7. **A `HydrationMismatch` under an error boundary was swallowed**, which defeats
   `hydrate`'s own recovery — the boundary showed nothing and the page stayed
   broken. `errorBoundary` re-throws it now, exactly as it already re-throws
   `NotReadyError`, because neither is the application's error to handle.

And one that only shows in a document: **`packages/compiler`'s dev overlay script
had never loaded**, in any barq app — it was injected with the RESOLVED `\0`-
prefixed id, which is a literal NUL in the attribute and a 404.

## kitchen-sink, measured in a browser against the production build

```
/            5452   (prerendered, full content)
/about        356   (prerendered, found by CRAWL)
/signals     5452   /components 3999   /store 3757   /async 5096
/css         3778   /hooks      4828   /query 3194   /jsx-types 5715
/routing     1741   (ssr: false — server sent a fallback, the browser built it)
```

`<main>` byte counts. Modes exercised: SSR (most), SSG (`/`, `/about`),
`ssr: "data-only"` (`/query`), `ssr: false` (`/routing`, `/hooks`), and a
prerender CRAWL that renders every page it reaches and keeps only the ones that
declare `prerender`.

## Left undone, stated

`packages/kitchen-sink` has **53 `tsc` errors**, down from 58 at HEAD. All of them
are in `src/demos/*` and all predate this session — 22 `TS7006` (an unannotated
`For` callback parameter) and 21 `TS2349` ("not callable" on an accessor-typed
prop). None are in the routes, the entries or the config, which are clean. The
workspace-wide `typecheck` gate therefore still cannot land, and fixing 53
demo-authoring errors is not front-door work.
