# barq's front door — design brief (DRAFT, for review)

Written 2026-08-22 at `2f7844f`. Every number below was measured in this session;
every API claim is cited to the local Vite 8.2.2 install or to a probe under
`scratch/frontdoor/`. `NOTES-verified.md` beside this file carries the raw evidence.

---

## 0. State, verified — and three numbers in the brief are stale

| gate | brief | measured at `2f7844f` |
|---|---|---|
| `cargo test` (in `packages/compiler-rs`) | 335 | **337** |
| compiler-rs `bun test` | 3490 / 0 | 3490 pass, 16 todo, 0 fail, 1 error (the self-check) |
| core | 918 | 918 |
| server | 92 | **97** |
| start | 36 | 36 |
| router | 141 | **260** |
| extra | 26 | 26 |
| testing | 16 | 16 |
| compiler (plugin) | 22 | 22 |
| `bun run ci` | 0 | 0 |
| kitchen-sink build | builds | builds |

**And one gate is red that no listed gate runs.** `bun run ci` is oxlint + oxfmt and
never invokes `tsc`. Measured per package:

```
core 115   kitchen-sink 58   server 18   router 7   compiler 1   extra/testing/start 0
```

**199 total, not 7.** `packages/router`'s 7 are `RouterState` interface drift landed
by `2f7844f` itself (`ssrModes` and `hydrateContexts` returned but not declared;
`prime()` declared arity 0 and called with 1; `runBeforeLoad` returning
`BeforeLoadResult` against a declared `readonly Record<string, unknown>[]`) and those
are fixed first, because every front-door surface is typed against `RouterState`. The
**workspace-wide `typecheck` gate cannot land until the end** — kitchen-sink's 58 are
all in `src/demos/*`, which step 6 rewrites anyway.

**And one gate is green that the list hides.** `packages/start/test/dev-server.test.ts`
boots a real Vite dev server in `middlewareMode`, wraps it in a real `node:http`
server on a real socket, and calls a server function over HTTP:

```
$ cd packages/start && bun test ./test/dev-server.test.ts
6 pass  0 fail  18 expect() calls
```

`packages/start/bunfig.toml:6` is `root = "./src"`, so plain `bun test` never sees
them — which is why the gate reads "start 36". So this session's earlier claim that
*"nothing in the repo has ever booted a Vite dev server"* is **false**: the harness
step 2 needs already exists and is passing, and the gate list silently excludes it.

---

## 1. What the probes killed

Recorded before the design, on the DESIGN-START §1 model.

| Claim | Killed by |
|---|---|
| "`createPageHandler` is good, it is simply not wired in" | It is good and it is not wired in — but the thing it would be wired into does not work. A real browser against a real dev server reports `not-hydratable`, `claimed: 0`, `recovered: true` — `hydrate`'s **full cold re-render**. See §2.4. |
| A page handler wired into `barqStart()`'s existing `configureServer` middleware preserves RPC-before-page by being registered second | True but weaker than available. Vite runs `configureServer`-registered middleware **before** `transform`/`serveStatic`/`htmlFallback` (`chunks/node.js:26631`) and the functions those hooks RETURN **after** them (`:26654`). The page handler belongs in the returned post hook, so Vite serves `/@vite/client`, `/src/*` and public files first. RPC-before-page then holds by stack position, not by ordering two `use()` calls. |
| The `originalUrl` un-rewrite in `start/src/vite.ts:165-166` is needed | Only under `appType: 'spa'`, whose `htmlFallbackMiddleware` rewrites `req.url` to `/index.html` at `:26653`. `appType: 'custom'` removes that middleware, `indexHtmlMiddleware` and `notFoundMiddleware` outright. |
| `barqRouter()`'s `routeAssets` map, filled in the client `generateBundle` and read by the ssr `load()`, works | **Measured false.** Vite resolves the config **once per environment** when `sharedConfigBuild` is false (the default), so the two environments hold **different plugin closures**: probe prints `load in ssr: assets=null`. Silent `{}` in production. `sharedDuringBuild: true` fixes it (`load in ssr: assets={"/a":["index.js"]}`). |
| A virtual module cannot be a build input | **Measured false.** `{ index: "virtual:entry-client" }` and `{ server: "virtual:entry-server" }` both build. TanStack aliases to real files for a different reason — so the *user's* file goes through the *user's* transform pipeline. |
| `transformIndexHtml` needs an `index.html` on disk, and cannot run on a fragment | **Measured false** on all four shapes tried, including an unclosed `<head>` and a document with no `<head>`. Vite falls back to a `\0`-prefixed virtual proxy id when the file is absent (`chunks/node.js:25574-25581`). |
| SSG could reasonably prerender the streamed response | Killed by what streaming emits: `SEED_CHANNEL_SNIPPET`, `SWAP_SNIPPET`, per-round `<template>` and `__BARQ_SWAP__(id)` scripts. Baking those into a file means the static first paint is the `pending` fallback and a no-JS crawler never sees the content. |

---

## 2. The five gaps, and the shape of each answer

### 2.1 Dev SSR — a post-hook page middleware, and no `index.html`

`barqStart()` grows a second middleware, registered as the **returned** function
from `configureServer` rather than a `use()` call, and declares
`appType: 'custom'`. The RPC middleware stays exactly where it is.

The page handler is obtained the way the RPC handler already is —
`environment.runner.import(SERVER_ENTRY_ID)` behind `isRunnableDevEnvironment`,
Node↔Web through `srvx/node`, `ssrFixStacktrace` on the error path. The server
entry's contract is TanStack's, because it is the only shape that is identical in
dev, in preview and in production:

```ts
export default { fetch(request: Request): Promise<Response> }
```

**No `index.html` and no template.** The router already owns the document
(`router/src/server.ts` rule 3), `Portal` writes nothing on the server, and
`appType: 'custom'` means Vite is not looking for one.

**`/@vite/client` gets in through `transformIndexHtml` on the head fragment.**
`wrapStream` already cuts the document at `<!--barq-body-->` and flushes the head
first; that fragment goes through `server.transformIndexHtml(url, head, originalUrl)`
before it is enqueued, and the body streams untouched. Measured to work.

> The cost, stated: a third-party plugin injecting with `injectTo: 'body'` lands at
> the end of the head fragment — just before the app markup — rather than at the end
> of the body. That is head-prepend-ish, not wrong, and it is the price of streaming.
> The alternative (emit `/@vite/client` ourselves and never call
> `transformIndexHtml`) is what TanStack does, and it silently disables every
> third-party HTML transform. Head-fragment transform is the better trade.

**`resolve.noExternal` for `@barqjs/**` in the ssr environment is not optional.**
Without it the dev server externalises the framework and Node's resolver serves a
stale `dist/`; the first run of this probe rendered a spinner with an empty seed and
impersonated a bug the repo had already fixed.

### 2.2 Production build — `builder`, declared from `config()`

`barqStart()`'s `config()` returns `builder: {}` plus a `buildApp` on the plugin.
Measured: declaring `builder` from a plugin's `config()` hook is enough to make a
plain `vite build` an app build — no `--app`, no user config change. With no
`builder` declared anywhere the plugin's `buildApp` still fires but
`builder.environments.ssr` is `undefined` and the build dies loudly.

```
client : input { index: <client entry> }   outDir dist/client
ssr    : input { server: <server entry> }  outDir dist/server, ssr: true, copyPublicDir: false
buildApp: client, then ssr, both guarded on !isBuilt
```

Client first because the ssr build has to know the client's hashed asset names. Two
ways to carry that across, and the choice matters:

- **In-memory, `sharedDuringBuild: true`** — capture the `OutputBundle` in the
  client's `generateBundle` and serve it from a virtual module the server imports.
  TanStack's. One flag, no disk, and it is what makes the existing `routeAssets`
  code correct instead of silently empty. Its known weakness is real: their
  #7912 is this handoff with no identity check, throwing when another framework in
  the same Vite app also has an environment named `client`. Keying on **our own
  named input `index`** closes that.
- **On disk** — `build.manifest: true` on the client, server reads
  `dist/client/.vite/manifest.json`. Robust and composable; costs a real artefact
  and a runtime file read.

**Proposed: in-memory with the identity check.** It reuses the `generateBundle`
already written and tested, and the disk route can be added later without moving the
consumer.

`emitAssets` has a trap worth naming: `chunks/node.js:36887` clobbers
`environments.ssr.build.emitAssets` back to `build.ssrEmitAssets || build.emitAssets`
in any plain `resolveConfig`. Set the **top-level `build.ssrEmitAssets`**, never the
per-environment field.

### 2.3 Entry convention — resolve, else generate

`src/entry-client.{tsx,ts,jsx,js}` and `src/entry-server.{…}`, both **optional**.

Absent, they are generated. The virtual-module trick the server-fn manifest already
uses works as a build input (measured), so the generated default needs no file on
disk and no alias:

```
virtual:barq-entry-client   ->  the user's file if it exists, else the generated default
virtual:barq-entry-server   ->  same
```

The generated client entry hydrates `virtual:barq-routes` into `#app`; the generated
server entry is `createPageHandler` over the same table with a default document.
A project that wants a `<head>`, a title or a provider writes the real file.

> Divergence from TanStack, deliberate: they `resolve.alias` a virtual id to a real
> file shipped **as raw `.tsx` inside the published package**, so the consumer's own
> JSX pipeline compiles it. barq's default entries are generated strings, not shipped
> files, so there is nothing to mis-resolve in a pnpm/bun store — and no
> `isInsideRouterMonoRepo` heuristic like the one at
> `react-start/src/plugin/vite.ts`.

### 2.4 Client boot — and the defect underneath it

**This is not "wire up a client entry". The seam it would sit on is broken.**

Measured in Chrome against a real dev server: a router page reports
`not-hydratable`, `claimed: 0`, `recovered: true` — the full cold re-render
`packages/router/DESIGN.md:254-256` warns about, with the seed left unconsumed.
The message blames a build flag; the cause is three lines and neither half errored,
because **both halves are wrong in the same direction**:

- `core/src/flow.ts:166` — `if ((flags & HYDRATE) === 0)` builds cold and reports.
  `HYDRATE = 1 << 2` (`flow.ts:87`) is **not exported** from `@barqjs/core` or
  `@barqjs/core/internal`, so the router cannot pass it.
- `router/src/components.ts:115,138,154` — `renderDepth` passes `0` to both
  `boundary` calls and no flags to `branch`.
- `server/src/ssr.ts` — `ssrLoading` hardcodes `flags = 0`, `ssrErrored` omits it,
  and the string `boundary` writes a range only when `(flags & HYDRATE) !== 0`.

That is CODESIGN §6's stated blind spot — *"a defect in the specification itself…
`-O0` and `-Ox` will agree on it"* — landing on the two **backends** rather than the
two levels. And DESIGN-START §8 already named the correct instrument: *"the correct
invariant is relational… and that is a new oracle channel."*

Patching both halves to pass `HYDRATE` (probe) removes the cold re-render
(`recovered: false`) but leaves `claimed: 0`.

**~~Two residual causes: the `branch` asymmetry, and a parked boundary's `<!--[b:N-->`
which the stream swaps in afterwards.~~ FALSIFIED by the red team, and the real cause
is bigger.** The `branch` asymmetry is not a blocker — the string backend's own
`branch` (`server/src/ssr.ts:774-782`) claims correctly and the three-level shape
matches byte for byte. And it is not a streaming artefact at all. **A `loading`
boundary can never be claimed, unconditionally, and that is specified behaviour**
(`core/src/flow.ts:1010-1024`, comment verbatim):

> *"`loadingBoundary` does not go through `activate`: it PARKS its content in a
> detached fragment … a claimed node cannot be parked without leaving the document —
> which is a removal, and removals are what claiming exists to avoid. So a loading
> boundary rebuilds its range, and the server's nodes go rather than standing beside
> the rebuilt ones."*

The code then strands and releases the claim it just took, and builds the content
with `claim` hard-coded `null` (`flow.ts:1152`), which empties the hydration stack
for the whole subtree. Probed with no router and no streaming, a **fully settled**
loading boundary reports `claimed: 0, built: 1` and
`"1 server node(s) at a boundary that parks"` — the same string this design's own
patched probe produced and misattributed to the stream.

`renderDepth` installs one `loading` boundary **per route depth** by construction
(`router/src/components.ts:138-151`), for a reason `DESIGN.md` D9 gives and that is
not negotiable: without one, a streamed page does not merely fail to seed, the render
throws. **So every depth of every router page sits inside a construct that
structurally refuses to hydrate.**

The work is therefore not four small items. It is a `loadingBoundary` redesign in
`packages/core`: build the first instance at `site` under the claim when the wire
range is not a deferred `<!--[b:N-->` one, and park only when the content actually
throws `NotReadyError`. Plus the three small items (export the flag; flags through
`ssrLoading`/`ssrErrored`; `EVENT_CAPTURE_SNIPPET` on the streamed path), and a test
that renders through the string backend and hydrates the result asserting
`claimed > 0` and `recovered === false`. **Nothing in the repo does that today** —
`hydrate()` and `createRouter` have no common call site outside this probe.

**And recovery mode is not a place to stand while that is done.** The red team argued
step 1 is non-blocking because `hydrate`'s recovery path is *"a correct page — the
cost is first-paint latency"*. Measured on the prerendered static file, four
consecutive loads, deterministic: `shell:loading` at t = 200/500/1000/2000/4000 ms.
`appHtml` is `<div id="root">shell:<i>loading</i></div>`. The loader ran once and
resolved in 30 ms; the boundary never re-armed. The SSR'd content was correct, was
painted, and was thrown away for a **permanent spinner** — P6-5's exact signature —
with a duplicate fetch and an unconsumed seed beside it. Step 1 is blocking.

**And a second, separable defect:** a streamed page emits no `EVENT_CAPTURE_SNIPPET`
(measured: `typeof window.__BARQ_EVTS__ === "undefined"`). It is written only by
`hydrationScriptFor` (`server/src/server.ts:695-697`), which only `renderPage` uses.
Streaming is `createPageHandler`'s default, so the default page drops every click and
keystroke made before hydration and H6's whole claim-based replay is unreachable
there.

### 2.5 SSG — the same handler, with `stream: false`

**A prerendered route is a build-time invocation of `createPageHandler`.** The
evidence is what the two render paths emit:

- `renderPage` renders, `await settle(session)`, and returns fully-resolved markup
  plus one seed script — `window.__BARQ_DATA__=<seed>;<EVENT_CAPTURE>`. No seed
  channel, no `SWAP_SNIPPET`, no `<template>`.
- `renderToStream` emits the shell, then the channel, the swap helper, per-round
  templates and swap calls.

A static file wants the first. So **SSG and SSR share the seed channel because SSG
takes the non-streaming arm of the same handler**, not despite it — same
`encodeSeed`, same `__BARQ_DATA__`, same document function, no second path.

> **The field says this is the decision that matters, and everyone but Astro got it
> wrong.** SvelteKit and Nitro (so Solid Start, Nuxt and TanStack Start) both
> prerender by calling the same handler and doing
> `Buffer.from(await response.arrayBuffer())` — with streaming still ON. Buffering
> does not undo streaming: the protocol is emitted at FLUSH time, so by the time you
> hold the bytes the placeholders and swap scripts are already in them. A SvelteKit
> prerendered file, reproduced on 2.70.3, ships `<p>loading...</p>` as the static
> markup with `<script>__sveltekit_x.resolve(1, () => ["LATE_STREAMED_VALUE"])</script>`
> **after `</html>`** — for data that was fully known at build time. With
> `csr = false` the same build emits that script with the global never declared: a
> permanent spinner plus a `ReferenceError`, no warning, because the guard is
> `if (DEV)`-gated and prerendering is not DEV.
>
> Astro is the only one that avoids it, and its fix is ten lines: a `BuildApp`
> subclass whose `resolveStreaming()` returns undefined, with the comment *"we can
> skip streaming in SSG for performance, as writing strings is faster."* React's is
> the heavyweight version — a real `react-dom/static` entry with `trackedPostpones`
> on the request, consulted at ~20 sites.
>
> **barq is already in Astro's position for free**, because `stream: false` does not
> mean "buffer the stream", it means `renderPage`, which is a different renderer that
> never emits the protocol at all. That is worth stating as a property rather than an
> accident: **prerendering must never take the `renderToStream` arm**, and a test
> should assert that a prerendered file contains no `__BARQ_SWAP__`, no
> `<template data-barq=`, and no `__BARQ_SEED__`.

**Four things the prior art says to decide before writing the prerenderer, not after.**

1. **CSP nonces and prerendering are incompatible, and barq threads a nonce.**
   `renderPage(fn, {nonce})` and `contextScript(url, produced, nonce)` both take one.
   A nonce baked into a static file is not a nonce — it is a constant an attacker
   reads. SvelteKit bans `csp.mode: 'nonce'` under prerender outright
   (`page/render.js:67`) and switches to **hashes**; React ships the comment
   `// nonce is not compatible with prerendered bootstrap scripts`. SvelteKit's
   #9235 is still open after three years precisely because a streamed prerender
   emits scripts *after* the hashes were computed. barq must **refuse a nonce during
   prerender** — and taking the non-streaming arm is what makes hash-based CSP
   computable at all, since every inline script exists before the document is closed.
2. **Response headers need a home.** `createPageHandler` returns a `Response`;
   prerender writes only the body. SvelteKit drops everything but `cache-control`
   (rescued as a `<meta http-equiv>`) and carries a standing TODO; Nitro has this as
   an open issue (#2119) where a prerendered xml/json route loses its `content-type`.
   Astro solved it by handing `routeToHeaders` to the adapter. Decide the contract
   now: the prerender manifest records `{ path, file, headers }`.
3. **Guard the INPUTS, loudly.** SvelteKit guards exactly one thing — `url.search`
   and `url.searchParams` throw — and lets `cookies.get`, `request.headers` and
   `setHeaders` **silently return null**. Probed directly this session on 2.70.3;
   their own issue tracker (#11995, #10332) records the multi-day debugging that
   causes. Astro warns and strips. barq's exposure is `getRequest()` over
   `AsyncLocalStorage`: a prerender hands a loader a synthetic `Request` whose
   headers are empty and whose truth is a build machine. It must **throw**, naming
   the route, not return nothing.
4. **Enumeration policy is a fork, and the two ends are far apart.** SvelteKit:
   `entries: ['*']`, crawl on, and a **hard build error** listing every prerenderable
   route the crawl never reached. Nitro: `routes: []`, `crawlLinks: false`,
   `failOnError: false` — nothing happens unless you ask. **Take SvelteKit's.** A
   route marked prerenderable that quietly was not prerendered is the failure that
   costs a deploy; SvelteKit's `'*'` seeding also skips any route id containing a
   parameter, which is the right default and needs a per-route `entries()` escape
   hatch to enumerate them.

Two more, cheap:

- **`ssr: false` + prerender is an empty shell**, silently — SvelteKit #14471. barq
  can express exactly that pair (`RouteDefinition.ssr` × a prerender mark). It
  needs a diagnostic, not a shell.
- **Write each page as it finishes.** SvelteKit #5233: ~300 data-heavy pages blew a
  2 GB heap because output accumulated before flushing.

**One barq-specific edge, probed — and the answer is better than this design first
claimed.** A loader returning *deferred* data (a value with a promise still inside
it) does **not** break the non-streaming arm and does not need to throw.
`renderPage` ends with

```ts
const data = await settleNested(getHydrationData(session));
```

so the nested promise is awaited before `encodeSeed` ever sees it. Measured with a
**600 ms** inner promise — deterministic, not a race — the prerendered seed is
`{"r:/users/$id|id=7":{name:"Ada 7",late:"LATE"}}`, a plain resolved value. The
streamed arm of the same route emits the full seroval resolver apparatus
(`$R[3] = (() => { const resolver = { p: 0, s: 0, f: 0 }; … })()` plus a later
`resolver.s(data)` script), which is exactly the artefact SvelteKit bakes into its
static files.

So the streaming/non-streaming split is not merely "one is tidier": on this input the
two arms differ by an entire deferred-value protocol, and only one of them belongs in
a file. Recorded here as a **falsified claim** of this document's own first draft,
which asserted `crossSerialize` would refuse it.

One consequence for the entry contract: `stream` is fixed when the handler is built
(`router/src/server.ts:327`), so a server entry that exports only `fetch` gives the
prerenderer nothing to rebuild a non-streaming twin from. Proposed:

```ts
// entry-server.tsx
export default defineServer({ routes, document, app })
// -> { fetch, options }   — `fetch` for serving, `options` for the prerenderer
```

**Where it runs.** In-process, against the built handler, from the `buildApp` hook
after both environments are built. Not by spawning `vite.preview()`, which is
TanStack's approach and which has cost them four open bugs: the config is re-resolved
from disk and loses how the parent was launched (#7593), the server output filename
is reconstructed rather than recorded (#8118), and a platform-targeted bundle cannot
be imported into the local Node process at all (#7481, #6330).

**Which paths.** Three sources, and the third is the one to be careful with:
explicit config list; route-tree derivation for parameterless leaves; and an opt-in
link crawl. TanStack's crawl has two open bugs worth pre-empting — a trailing slash
inserted *inside* the last query value so every URL is unique and the crawl never
terminates (#7837), and `/x` vs `/x/` as distinct keys in the `seen` set (#6978). The
dedup key must be a normalised path, and failures must be collected and rethrown
after the queue drains rather than swallowed (#8120: their `failOnError` cannot fail
the build and `retryCount` is dead code).

**What a prerender must refuse.** A prerendered page has no real request. Reading a
header or a cookie during prerender has to throw with a message naming the route,
the way SvelteKit does — otherwise one build machine's state is baked into a static
file.

### 2.6 The gap nobody named: a file-based route cannot declare its render mode

`RouteDefinition.ssr?: boolean | "data-only"` exists (`route.ts:357`) and
`resolveSsr` uses it. The **generator never emits it**: `routes.rs:296-332`
(`emit_node`) emits `path, id, src, component, loader, pending, children` and
nothing else, and it cannot read one — `routes.rs` does `read_dir` and no
`read_to_string` anywhere. The route module is `lazy()`, so nothing can ask it at
runtime without loading it eagerly and defeating the split.

Gap 5 asks kitchen-sink to demonstrate per-route render mode, so this has to be
answered. Two options:

- **(a) The generator lifts statically-analysable config exports.** `routes.rs`
  parses each route file with oxc (which it already has) and lifts
  `export const ssr = <literal>` / `export const prerender = <literal>` into the
  emitted table. Costs a real compiler change; buys per-route mode and per-route
  prerendering for file-based routes, which is the demo that matters.

  Astro validates both the shape and the error: it requires **exactly**
  `export const prerender = true` and its `InvalidPrerenderExport` says *"Mutable
  values declared at runtime are not supported."* SvelteKit's is the same idea
  through a different door — a second `forked()` `analyse.js` pass that *imports*
  every node and reads its exports, which barq cannot copy because `routeTree` is a
  synchronous napi call with no module loader. Parsing is the cheaper half of that
  trade, and a non-literal initialiser is a diagnostic rather than a silent default.
- **(b) Code-based override only.** kitchen-sink keeps a code-based table and
  declares `ssr` there. Costs nothing; demonstrates nothing about the generator.

**Proposed: (a)**, with (b) available for anyone who wants it. CODESIGN §5.4 —
compile time is not a constraint — and the scan already walks every route file.

### 2.7 The blocker for §2.2 that neither the brief nor this design saw: the built server mounts nothing

**A production build ships an application whose every server function 404s.**
Measured, on a real two-environment `vite build` with `barqStart()`, one
`createServerFn()` module, and a server entry that imports
`virtual:barq-server-fns`:

```
$ grep -c 'mount("' dist-fn/server/server.js      -> 0
$ grep -c 'loadUser'  dist-fn/server/server.js    -> 2      (the handler IS in the bundle)
```

The handler is bundled; the registry is empty; `handleServerFn` answers
`Response("not found", 404)` (`start/src/server.ts:199-200`) for every call — on an
app that works in dev.

Cause is hook order. `start/src/vite.ts:126-128` `load()` reads `found`, which
`record()` (`:103-115`) fills only from the compiler's `onServerFns` callback
(`compiler/src/vite.ts:501`). The manifest is a **static import of the entry**, so
rolldown loads it before it has walked to any server-function module:

```
load(barq-server-fns) in env ssr      <-- found.size = 0
transform(data.ts)    in env ssr      <-- found.size = 1, too late
```

Dev is saved by the module-graph invalidation at `vite.ts:112-114`; a build has no
invalidation. **`sharedDuringBuild: true` does not fix it** — with sharing the client
build's transforms run first and the manifest picks up whatever the *client* graph
reached, so a server-fn module reachable only from the server entry is still missed.

So the manifest has to be produced from a **completed** graph — emitted at `buildEnd`
or injected at `renderChunk`, not `load`ed. This lands inside §4 step 3 and nothing
downstream is done until it does.

### 2.8 What else the red team broke, kept short

Each of these is real, cited, and has to be answered by the step that touches it.

- **Server functions are unreachable under any non-`/` `base`, today.** The RPC
  middleware is a pre-`use()` inside `configureServer` (`:26631`), which is *before*
  `baseMiddleware` (`:26638`). `start/src/vite.ts:165-166` then restores the
  base-prefixed `originalUrl`, so under `base: '/app/'` `req.url` is
  `/app/_barq/fn/…` and `RPC_PREFIX = "/_barq/fn/"` never matches. Deleting the
  un-rewrite does not fix it. Also kills §1's claim that `appType: 'custom'` makes
  the un-rewrite unnecessary: `baseMiddleware` and `serveStaticMiddleware`'s alias
  redirect both rewrite `req.url` and neither restores it.
- **`appType: 'custom'` from `config()` silently overwrites the user's.**
  `mergeConfig` lets the plugin's scalar win (`:37198`, `:2918-2921`). Someone using
  `barqStart()` for server functions in an SPA loses their `index.html`. It has to be
  `viteConfig.appType ?? 'custom'`, which is what TanStack does.
- **Nothing filters methods before the page handler**, and `createPageHandler` has
  zero `request.method` references. `POST /users/7` and `HEAD /users/7` run every
  `beforeLoad`, every loader and every server function a loader calls, and answer
  HTML.
- **`transformMiddleware` intercepts page URLs for non-document clients.** It bails
  only on `sec-fetch-dest ∈ {document,iframe,frame,fencedframe}` (`:25107-25110`), so
  curl, `node:http`, and any server-side `fetch` are not documents; `isJSRequest`
  then matches an extension-less `/users/7` (`:25193`). That hits the SSG link crawl
  and every HTTP test harness.
- **§2.1's head-fragment transform has no seam.** `wrapStream` is module-private
  (`router/src/server.ts:510`) and the `<!--barq-body-->` cut is internal; the
  middleware receives a finished `Response` whose body is already a stream. It needs
  a new `PageHandlerOptions` field, not a read-the-first-chunk trick. And under
  `stream: false` there is no marker at all, so the framing does not cover SSG.
- **Vite's CSP nonce hooks are static and barq's is per-request.**
  `injectCspNonceMetaTagHook` / `injectNonceAttributeTagHook` (`:24863`, `:24906`)
  key off `config.html.cspNonce`, a build-time value; `PageHandlerOptions.nonce` is
  per request. Set both and one page carries two nonces under one CSP header; set
  neither and `/@vite/client` has no nonce while a per-request CSP blocks it.
- **§2.5's "refuse request access during prerender" has no mechanism.**
  `createPageHandler` calls `withRequest(request, …)` unconditionally
  (`router/src/server.ts:285`), so `getRequest().headers.get("cookie")` silently
  returns `null` — SvelteKit's exact failure. It needs a `PageHandlerOptions` field.
- **My case against the preview server was half wrong.** Of the four TanStack bugs
  cited, only #7593 (config re-resolved from disk) and #8118 (filename
  reconstructed) are avoided by going in-process. #7481 and #6330 are *"import a
  platform-targeted bundle into Node"* bugs and in-process inherits them exactly.
  The decision survives on mechanics — the in-process import is measured working —
  but on two of three arguments, not three.
- **§2.6's oxc lift needs a `change` watcher.** `barqRouter` registers only `add` and
  `unlink` (`router/src/vite.ts:300-301`), so editing `export const ssr = false`
  inside an existing file could never change the table. And the reason to parse in
  `routes.rs` rather than route it through the existing `onServerFns` channel is
  §2.7: that channel is a race against the graph walk. A synchronous read inside
  `routeTree` is the only form complete at `load()` time. Cost is real —
  `routeTree` is a synchronous napi call on Vite's main thread, and under
  `sharedDuringBuild` `configResolved` fires N+1 times so `rescan()` runs 3× per
  build.
- **`sharedDuringBuild` costs more than §2.2 said.** `config()` runs on an instance
  that is then discarded (`patchPlugins` at `:36880` precedes `configResolved` at
  `:36883`), `configResolved` fires once per environment on the shared instance, and
  matching is by plugin *name*. The `routeAssets` fix survives; its cost is three
  `routeTree` calls and three `.d.ts` writes per build.
- **`__BARQ_SEED__` is dead code under the boot this design specifies.** Measured in
  Chrome against a streamed document: a `<script type="module" src>` entry executes
  at `readyState: "interactive"`, **after** `__BARQ_SEED__.done()` has set
  `open = 0`, so `seedLater` (`core/src/signals.ts:3138`) always returns `null`. The
  `async` and classic forms run *before* the channel snippet is even on the wire.
  barq's `wrapStream` puts the entry in the tail (`router/src/server.ts:539`), so no
  placement in the current document shape lands it inside the window. ~40 inline
  lines on every streamed page, buying nothing. Either the stream emits the entry
  after opening the channel, or the channel goes.
- **`EVENT_CAPTURE_SNIPPET` on the streamed path is necessary but not sufficient.**
  `replayCapturedEvents` resolves a child-index path from `document.body`
  (`dom.ts:2163-2170`), and `__BARQ_SWAP__` mutates the DOM between capture and
  replay. A click on the `pending` fallback resolves to a different node.
- **Killed from the notes:** the `__BARQ_DATA__` lost-update between `dom.ts:2301`
  and `:2340` is **unreachable** — the deferred entry runs after `controller.close()`,
  so every flush is already on the wire.

---

## 3. The decisions, stated

1. **A prerendered route is `createPageHandler` with `stream: false`, in-process.**
   SSG and SSR share the seed channel because of it. `stream: false` is a different
   RENDERER, not a buffered stream — which is the mistake SvelteKit and Nitro both
   ship. A test asserts a prerendered file carries no `__BARQ_SWAP__`, no
   `<template data-barq=`, and no `__BARQ_SEED__`.
1b. **A nonce is refused during prerender**, headers ride in the prerender manifest,
   `getRequest()` throws rather than answering with a synthetic request, and an
   unreachable prerenderable route fails the build.
2. **The server entry exports `{ fetch, options }` via `defineServer`**, so the
   prerenderer can build a non-streaming twin from one declaration.
3. **No `index.html`, `appType: 'custom'`, the router owns the document**, and
   `/@vite/client` arrives by transforming the head fragment.
4. **The page handler is a post-hook middleware; RPC stays a pre-hook.** Ordering
   is enforced by the middleware stack, not by a comment.
5. **`sharedDuringBuild: true`, with an identity check on the named `index` input.**
6. **Entries resolve to a user file, else to a generated virtual module.**
7. **The hydration seam is fixed before the client entry is written**, in core,
   server and router, with a relational test that SSRs and then hydrates.
8. **The route generator lifts `ssr` / `prerender` from route modules.**

---

## 4. Order

0. **`packages/router`'s 7 `tsc` errors.** Scoped to that package — the
   workspace-wide gate lands at the end (§0).
1. **The hydration seam**, correctly sized. The `loadingBoundary` redesign in
   `packages/core` is the large half; export `HYDRATE`; flags through
   `ssrLoading`/`ssrErrored`; make the two router walks agree;
   `EVENT_CAPTURE_SNIPPET` on the streamed path plus a replay path that survives
   `__BARQ_SWAP__`. Gate: a test that renders through the string backend, hydrates
   the markup, and asserts `claimed > 0`, `recovered === false`, and an empty
   `__BARQ_DATA__` afterwards.

   **Blocking, and the red team's argument that it is not was measured false.**
   Recovery mode is not "a correct page with a slower first paint" — on the
   prerendered file it is a permanent `pending` fallback, deterministic across four
   loads, with a duplicate fetch and an unconsumed seed. §2.4.
2. **Entries + dev SSR.** Virtual entry modules, `appType: viteConfig.appType ??
   'custom'`, the post-hook page middleware, `noExternal`, a method guard, the `base`
   fix for RPC, and a real `PageHandlerOptions` seam for the head transform. Gate:
   extend `packages/start/test/dev-server.test.ts`, which already boots a real
   server — and fix `bunfig.toml`'s `root` so the gate counts it.
3. **The production build.** `builder`, `buildApp`, per-environment inputs and
   outDirs, `sharedDuringBuild`, the client-manifest handoff with the named-input
   identity check — **and the server-fn manifest moved off `load()` onto a completed
   graph (§2.7)**, without which the build ships an app whose every RPC 404s. Gate:
   `grep -c 'mount("' dist/server/*.js` is the number of exported server functions,
   not zero.
4. **SSG.** Depends on step 3's recorded output filename. The prerender queue over
   the built handler, normalised dedup, collected failures rethrown after drain, the
   nonce refusal, headers in the manifest, and the request-access refusal.
5. **The generator's `ssr` / `prerender` lift**, with the `change` watcher it needs.
6. **kitchen-sink**, exercising SSR, SSG, CSR and a client-only route. Its 58 `tsc`
   errors go here, and the workspace `typecheck` gate lands after it.

---

## 5. Gates, every one green before each commit

`cargo test` 337 · compiler-rs 3490/0 · core 918 · server 97 · **start 42** (36 + the
6 `test/dev-server.test.ts` currently hidden by `bunfig.toml`) · router 260 ·
extra 26 · testing 16 · plugin 22 · `bun run ci` 0 · kitchen-sink builds.

`bun run typecheck` is **199 errors at HEAD** and joins the gate list at step 6, not
step 0. `packages/router`'s 7 are gated from step 0 onward.
