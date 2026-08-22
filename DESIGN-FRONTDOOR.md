# barq's front door — dev SSR, the production build, SSG, and what it cost

Written 2026-08-22, across the session that built it, starting at `2f7844f`.
`DESIGN-START.md` is the program document and `packages/router/DESIGN.md` is the
router's own. This file records what was added on top, what was MEASURED, and —
as importantly — **which of its own claims were falsified**, which is
`DESIGN-START.md` §1's model.

The task: barq had every layer tested in isolation and nothing that booted an
app. `vite dev` gave an SPA with working RPC and no SSR; there was no production
build, no entry convention, no client boot, and `createPageHandler` had zero
non-test call sites. All of it exists now, and the reference application runs on
it.

---

## 0. State, verified

| gate | before | after |
|---|---|---|
| `cargo test` (in `packages/compiler-rs`) | 337 | **341** |
| compiler-rs `bun test` | 3490 / 0 | 3490 / 0 |
| core | 918 | 918 |
| server | 97 | **98** |
| start | 36 *(of a suite of 42)* | **55** |
| router | 260 | **264** |
| extra / testing / plugin | 26 / 16 / 22 | unchanged |
| `bun run ci` | 0 | 0 |
| kitchen-sink | builds (SPA) | builds, prerenders, previews |

Three of the numbers the brief carried were stale at `2f7844f` — cargo was 337
not 335, server 97 not 92, router 260 not 141 — and one gate was **red that no
listed gate ran**: `packages/router` did not typecheck. `2f7844f` landed
`ssrModes`, `hydrateContexts`, `prime(server)` and `runBeforeLoad`'s third
argument without their interface, and `bun run ci` is oxlint plus oxfmt and never
invokes `tsc`. That was step 0.

**And one gate was green that the list hid.** `packages/start/bunfig.toml` had
`root = "./src"`, so `test/dev-server.test.ts` — six passing tests through a real
Vite dev server on a real socket — was invisible to every `bun test`. The
package's headline number read 36 for a suite of 42. The harness this work
needed already existed.

---

## 1. What died, and why it stays dead

Recorded so it is not relitigated. Each row was killed by evidence.

| Claim | Killed by |
|---|---|
| "`createPageHandler` is good, it is simply not wired in" | It is good and it was not wired in — but the seam it sits on did not work. A real browser against a real dev server reported `not-hydratable`, `claimed: 0`, `recovered: true`: `hydrate`'s full cold re-render. On a prerendered file it was a PERMANENT `pending` fallback across four consecutive loads, with the loader refetched and the seed shipped and never read. |
| The residual hydration failure is the `branch` asymmetry plus a streaming artefact | Both wrong. The string backend's own `branch` claims correctly and the shape matches byte for byte. The cause was unconditional and specified: `loadingBoundary` released whatever claim it was handed and rebuilt into a detached fragment. §2.1. |
| Recovery-mode hydration is "a correct page with a slower first paint", so the front door can ship on it and fix the seam later | Measured false, four consecutive loads, deterministic: `shell:loading` at t = 200/500/1000/2000/4000 ms. Correct content painted, then discarded for a spinner that never resolved. |
| A prerendered page can be the streamed response, buffered | Buffering does not undo streaming: the protocol is emitted at FLUSH time. Reproduced on SvelteKit 2.70.3 — a prerendered file shipping `<p>loading...</p>` plus a resolve script after `</html>`, for data fully known at build time. |
| Deferred loader data would break the non-streamed arm, so a prerender should throw | False, and better than claimed. `renderPage` ends `await settleNested(getHydrationData(session))`. Measured with a **600 ms** inner promise: the prerendered seed is `{name:"Ada 7",late:"LATE"}`, resolved, deterministic. |
| `injectTo: "body"` on a head fragment is a cosmetic cost | It lands INSIDE the mount element, and the newline Vite writes in front of it becomes a text node the hydration walk trips over. §2.2. |
| `sharedDuringBuild: true` on the plugin that needs it | Sharing SOME is worse than sharing none. §2.3. |
| "Nothing in the repo has ever booted a Vite dev server" | `packages/start/test/dev-server.test.ts` has, since it was written. `bunfig.toml` hid it. |
| The case against a preview-server prerender is three arguments | Two. TanStack's #7481 and #6330 are "import a platform-targeted bundle into Node" bugs, and going in-process inherits them exactly. Only #7593 and #8118 are avoided. |

---

## 2. The seam, which had to be fixed before anything could sit on it

### 2.1 A `loading` boundary could never be claimed

`core/src/flow.ts` released the claim `boundary` had just taken and rebuilt into
a detached fragment, on the argument that a claimed node cannot be parked. True
of a body that is not ready; **false of the first build of a hydration**, where
the server already ran the body to completion and its markup is at the site.

`renderDepth` installs one per route depth by construction, for a reason
`DESIGN.md` D9 gives and that is not negotiable. So every depth of every SSR'd
page sat inside a construct that structurally refused to hydrate — and it is
wider than the router: **the compiler emits `boundary(..., 4)` on both backends
for a `<Loading>`**, verified against a real `transform()`, so every compiled
`<Loading>` subtree in every app was rebuilding cold. `hydration.test.ts` had
zero `Loading` coverage to say so.

Three more defects were underneath it, and only the first was predicted:

- **A claimed site returned its synthesised anchor.** K7 mints an anchor in a
  detached fragment when a region has no `(parent, anchor)`; `claimSite` then
  redirects the site into the document. Returning the fragment inserted a stray
  node AND, because it is what `build` reports as produced, made the eviction
  pass treat the whole server range as unclaimed.
- **Eviction compared produced-node lists.** A nested region claims in place and
  hands its caller nothing, so the list is empty while the nodes are all
  correctly taken — and comparing lists removed the page. Both sites ask the
  CURSOR now, which is the question `each` has always asked its row cursor.
- **A boundary that showed its FALLBACK said nothing on the wire.** A
  non-streamed render whose body never settles emits the fallback with no
  marker, and the client claimed it as content. `<!--[f:-->` says so; `b:` could
  not, because it only exists on the streaming path. Found by L5, which caught
  `control-flow-await-suspense` regressing to 0% reuse — and then caught the
  first fix being wrong, because `f:` must follow the `HYDRATE` flag like every
  other range while `b:` must not.

L5 node-identity reuse, both baselines updated with the reason:
`control-flow-errored-loading` **33% → 67%** with its structure mismatch gone,
`control-flow-await-suspense` **43% → 60%**.

Measured in Chrome, on a prerendered static file:

```
BEFORE  { text: "shell:loading", calls: 1, claimed: 0, built: 6, recovered: true,  seedLeft: 1 }
AFTER   { text: "shell:Ada 7",   calls: 0, claimed: 2, built: 0, recovered: false, seedLeft: 0 }
```

### 2.2 A streamed page dropped every keystroke made before hydration

`EVENT_CAPTURE_SNIPPET` was written only by `hydrationScriptFor`, which only
`renderPage` uses. Counted in the emitted bytes: 1 occurrence on a non-streamed
page, 0 on a streamed one. Streaming is `createPageHandler`'s default, so
`SEMANTICS.md` H6's whole claim-based replay was unreachable on the path most
pages take. `renderToStream` emits it right after the shell now — the earliest a
stream can manage.

**Still open**, and stated rather than closed: `replayCapturedEvents` resolves a
child-index path from `document.body`, and `__BARQ_SWAP__` mutates the DOM
between capture and replay. A click on a `pending` fallback resolves to a
different node after the swap.

---

## 3. The front door

### 3.1 Entries

`src/entry-{client,server}.{tsx,ts,jsx,js}`, both optional, behind the fixed ids
`virtual:barq-entry-{client,server}`. A project's own entry resolves to the
FILE — the `export * from` shim was tried and is wrong, because it does not
forward a default and the server contract IS a default export. A generated
default takes over when the file is absent.

Measured on Vite 8.2.2: **a virtual id is a valid per-environment build input**,
and the ssr output filename comes from the input KEY, which is why both are
named. The emitted name is then RECORDED rather than reconstructed — TanStack's
#8118 is a prerender step rebuilding it from the input path.

The server entry's contract:

```ts
export const options = { routes, app, document, … }
export const createFetch = (extra) => createPageHandler({ ...options, ...extra })
export default { fetch: createFetch({}) }
```

`createFetch` is why one declaration serves three callers: the dev server adds
`transformShell`, the prerenderer sets `stream: false` and `refuseRequest`, and
production takes it as it stands. `stream` is fixed when the handler is built, so
an entry exporting only `fetch` gives a prerenderer nothing to build a
non-streaming twin from.

### 3.2 Dev

The page handler is the function `configureServer` RETURNS, not one it `use`s.
Vite runs the bodies before its own stack (`chunks/node.js:26631`) and the
returned functions after it (`:26654`), so `/@vite/client`, `/src/*`,
`node_modules` and `public/` are answered by Vite and only what nothing claimed
reaches SSR. **"Server functions match before the page" holds by stack position**
rather than by a comment. `appType` becomes `custom` unless the user set it —
returning it unconditionally would delete their `index.html` handling, because
`mergeConfig` lets a plugin's scalar win.

**Server functions were unreachable under any non-`/` base.** The RPC middleware
is a pre hook, so it runs BEFORE `baseMiddleware`, and the `originalUrl` restore
handed back `/app/_barq/fn/…` which `RPC_PREFIX` never matched.

**`/@vite/client` arrives through `transformShell`**, a new `PageHandlerOptions`
seam. Reading one chunk off the response and hoping it is the whole head is an
undocumented invariant; this is the contract. Streaming is why it is not simply
`transformIndexHtml`: what the handler holds is the head, the opening `<body>`
and the mount element — no `</body>` to aim at — so every hook asking for
`injectTo: "body"` takes Vite's fallback and appends at the END, inside the mount
element. The shell is transformed with a sentinel standing in for the rest of the
document, and whatever lands past it is moved into the head.

**Two silent failures only a live server found, both about module identity.**
`resolve.noExternal` for `@barqjs/*` in the ssr environment is mandatory —
without it the runtime's own resolver takes the `import` condition to a built
`dist/`, and a stale one renders a spinner with an empty seed, impersonating a
bug the repo had already fixed. And **the two environments must resolve those
packages the same way**: with the client on `bun`→`src` and ssr on
`import`→`dist`, `@barqjs/core` existed twice, the render parked into one copy's
async session and the resume loop ran in the other's, and a streamed page parked
forever with no template, no swap and no seed. That is a workspace hazard rather
than an application one, and kitchen-sink is exactly the shape that hits it.

### 3.3 Build

`builder: {}` returned from `config()` is what makes a plain `vite build` an app
build — measured, `--app` is not needed, and with no `builder` declared at all
`buildApp` still fires but `environments.ssr` is undefined and the build dies
loudly. Client first, then ssr, because the server half places the client's
hashed chunk and that name only exists once the client has emitted it.

**The build shipped an app whose every server function 404s.** `load()` of the
manifest runs before rolldown has walked to any server-function module, so the
built server mounted NOTHING while the client half was a correct `clientRpc`
stub; dev survives it on module-graph invalidation and a build has none.

Every plugin `barqStart()` returns carries `sharedDuringBuild`, and **sharing
some is worse than sharing none**: `found` lives in one closure, only the
compiler plugin fills it, and with `sharedConfigBuild` false Vite re-resolves the
whole config per environment — so an unshared compiler plugin belongs to a
different `barqStart()` call than the shared manifest reads from, and the
manifest generates empty in every environment. What sharing cannot cover — a
module reachable only from the server entry — is refused at `buildEnd` naming the
module, which is BARQ012's method applied to a build-order hazard.

The client-manifest handoff keys on OUR named input (`chunk.name === "index"`)
rather than on "an entry chunk", which is the identity check TanStack's #7912 is
missing.

### 3.4 SSG

**A prerendered route is `createPageHandler` with `stream: false`, in-process,
against the bundle just written.** That is a different RENDERER, not a buffered
stream, and the distinction is the whole decision: SvelteKit and Nitro — so Solid
Start, Nuxt and TanStack Start — buffer with streaming on, and their static files
carry placeholders and swap scripts for data that was fully known at build time.
Astro is the exception and gets there in ten lines. barq gets it for free because
`stream: false` is `renderPage`, which emits no channel, no swap helper and no
`<template>` at all. A test asserts a prerendered file carries none of them.

Around it, each answering something the field has open:

- the crawl's dedup key is normalised and query-stripped (TanStack #7837 loops
  forever, #6978 double-writes);
- failures are collected and rethrown after the queue drains (#8120 — their
  `failOnError` cannot fail a build and `retryCount` is dead code);
- each page is written as it finishes (kit #5233, 300 pages and a 2 GB heap);
- response headers ride out with each page, because a file cannot carry them
  (kit's standing TODO, nitro #2119);
- a nonce is REFUSED, because a nonce baked into a static file is a constant an
  attacker reads — SvelteKit bans `csp.mode: 'nonce'` under prerender outright
  and React ships the same note on its static entry;
- `getRequest()` throws rather than answering with a build machine's headers.
  SvelteKit guards `url.search` alone and lets `cookies.get` and
  `request.headers` answer null in silence, which its own tracker records as
  multi-day debugging;
- a crawled path is kept only if the route it matched declares `prerender`. A
  path the config names is always kept, because naming it is the declaration.

### 3.5 Per-route render mode

`RouteDefinition.ssr` existed and the generator never emitted it — and could not
ask for it, because the route module is `lazy()` and both `ssr` and `prerender`
are wanted before it loads. `routes.rs` reads each route file and lifts a
LITERAL. A non-literal is refused and reported: a `prerender` the scan cannot
read decides whether a page exists on a CDN, and "false, probably" is the silent
failure the channel exists to avoid.

`src/routes/route.tsx` is the ROOT layout, with id `__root__`. `<prefix>.route`
needs a prefix by construction, so there was no way to write a layout wrapping
the whole app, and a file named `route.tsx` became a route at `/route`.

---

## 4. Seven defects the application found, none of them in the front door

Reachable only by running one. Each was a silent empty region before a boundary
that catches an error nothing was written to display started saying so once.

1. **`renderRoutes` never provided `RouterContext`** — so any route component
   calling `useLocation` threw inside its own error boundary.
2. **Every construct the string walk built was DETACHED.** It passed `null` as
   the scope; `requireScope(null)` answers `null` and `enter(null)` makes a scope
   with no parent, so a context provided above could never be found below.
3. **`Link` and `NavLink` had no string implementation**, so no SSR'd page could
   contain a link. Installed through a context `renderRoutes` provides, not
   sniffed from `typeof document` — P6-5 already paid for that lesson.
4. **`Router`'s `notFound` prop could never be passed.** A component IS a Block
   and `readSlot` refuses one in a value slot.
5. **Navigating to a `lazy()` route showed its fallback forever.** `renderDepth`
   invokes a route component inside `untrack`, per CODESIGN §3.9, and a `lazy()`
   cell read there subscribes to nothing. `lazy()` grew `ready()`, a tracked
   probe called outside the untrack. Reproduced against `bc36100` in a worktree
   first, so the record says the front door found it rather than caused it.
6. **A chain of `lazy()` routes could not be server-rendered.** `renderPage`
   renders exactly twice, so a two-deep chain resolves its leaf on a third pass
   that never happens.
7. **A `HydrationMismatch` under an error boundary was swallowed**, defeating
   `hydrate`'s own recovery.

Plus one that only shows in a document: **`packages/compiler`'s dev overlay
script had never loaded**, in any barq app. It was injected with the RESOLVED
`\0`-prefixed id — a literal NUL in the attribute, and a 404 against the 200 the
unresolved form returns.

---

## 5. Known limits, stated rather than left to be discovered

- **`__BARQ_SEED__` is dead code under the boot this design specifies.** Measured
  in Chrome: a `<script type="module" src>` entry executes at
  `readyState: "interactive"`, after `__BARQ_SEED__.done()` has set `open = 0`,
  so `seedLater` always returns `null`. The `async` and classic forms run before
  the channel snippet is on the wire. barq's `wrapStream` puts the entry in the
  tail, so no placement in the current document shape lands it inside the window.
  ~40 inline lines on every streamed page, buying nothing. Either the stream
  emits the entry after opening the channel, or the channel goes.
- **Pre-hydration replay does not survive a swap.** §2.2.
- **`packages/kitchen-sink` has 53 `tsc` errors**, down from 58, all in
  `src/demos/*` and all predating this work — 22 unannotated `For` callback
  parameters, 21 "not callable" on accessor-typed props. The routes, the entries
  and the config are clean. The workspace-wide `typecheck` gate cannot land until
  they are fixed, and they are not front-door work.
- **In-process prerendering cannot render a platform-targeted bundle**, because
  it imports the server build into Node. That is a limit of importing a server
  build, not of the transport, and a preview server does not fix it.
- **`vite preview` is client-only** — it reads
  `environments.client.build.outDir` and nothing else — so previewing an app with
  a server half needs a script. kitchen-sink ships one; it is also the shape a
  deployment has (a static file wins, whatever is left is rendered).
- **The route-action manifest is still not armed in a build.** `verify` exists
  and is tested; nothing calls it from `kitchen-sink`.

---

## 6. Order, as it was actually taken

0. `packages/router`'s 7 `tsc` errors, and `bunfig.toml`'s hidden test root.
1. The hydration seam — `loadingBoundary`, `outFor`, cursor-based eviction, the
   `f:` marker, `HYDRATE` exported, flags through `ssrLoading`/`ssrErrored`,
   `EVENT_CAPTURE_SNIPPET` on the streamed path.
2. Entries and dev SSR.
3. The production build, with the server-fn manifest moved off the race.
4. SSG.
5. The generator's lift, the root layout, the `change` watcher.
6. kitchen-sink, which found seven more.

Step 1 was blocking, and the argument that it was not was measured false before
anything downstream was built. Everything after it was measured on a page that
actually hydrates.
