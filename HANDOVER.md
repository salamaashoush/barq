# barq — next session

Paste this as the opening prompt. Everything below was verified at `bb2a5cd`.

---

## How I want you to work — read this first, it is the part that went wrong

1. **Agree the API shape with me BEFORE implementing it.** Do not design and
   build a public surface in one pass and then present it. Put the shape up,
   wait, then build. The previous session built a whole head-management system
   with an invented vocabulary and I made it delete the lot.
2. **Read prior art from SOURCE, never from memory.** Clone it or read
   `node_modules`, and quote `file:line` when you claim what another framework
   does. The same session asserted TanStack's `head` API from memory, got two
   things wrong, and designed around a limit TanStack does not have.
3. **barq follows TanStack Router/Start's API.** `beforeLoad`, `loaderDeps`,
   `shouldReload`, search middlewares, `head`, `shellComponent`, `<HeadContent>`,
   `<Scripts>` are all theirs. A divergence needs a reason and a written record.
   Divergences so far are recorded in `packages/router/src/head.ts`'s header.
4. **The design documents are deleted, deliberately.** They were treated as
   binding. Do not write new ones. Put the reasoning in code comments beside the
   thing, and in commit messages.
5. Measure before claiming. Probes go in `scratch/`; there are working ones
   (`scratch/frontdoor/probe-boot` drives Chrome, `probe-title`, `scratch/redteam/*`).
6. Every gate green before each commit. Commit messages carry the why, including
   what was tried and rejected.

## State, verified at `bb2a5cd`

```
cargo 344 · compiler-rs 3490 pass/0 fail/16 todo (the "1 error" is a self-check
that fires because nothing fails — do not chase it) · core 921 · server 98 ·
start 59 · router 305 · extra 26 · testing 16 · plugin 22 · bun run ci EXIT=0 ·
clippy + fmt clean · kitchen-sink tsc clean, builds, prerenders 2 pages, and its
build fails on a route-action violation.
```

The Rust workspace root is `packages/compiler-rs`, not the repo root.

## What is done

- **Head management, TanStack's API.** `packages/router/src/head.ts`.
  `head: (ctx) => ({ meta, links, scripts, styles })` with `title` inside `meta`;
  `scripts` on a route is the BODY half. Merge is Solid 2's identity ladder with
  three documented divergences from TanStack, each with a test named after their
  bug (`#6719` canonical, the `name ?? property` collapse, the one-tag dedup
  bypass at their `manifest.ts:153-156`).
- **The document is JSX.** `shellComponent` on the root route renders `<html>`;
  `<HeadContent />` and `<Scripts />` place themselves. `document()` still exists
  for a table with no shell and is still tested. kitchen-sink has no template.
- **Crawlers get the whole page.** `bufferForCrawlers` defaults to `isbot` and
  takes the `stream: false` renderer. That is TanStack's entire answer
  (`renderRouterToStream`: `if (isbot(...)) await waitForReadyOrAbort(...)`).
- **The route-action manifest is ARMED.** `barqRouter({ onReachability })` +
  `barqStart({ verify })` + `chainVerifier(options.routes)` on the server entry.
  Delete `.middleware([requireSession])` from `packages/kitchen-sink/src/data/admin.ts`
  and `vite build` fails naming the route, the function and the count.
- The five defects from the previous brief: `PRERENDER_HEADER` is one fact in
  `@barqjs/start/protocol`; pre-hydration replay records the NODE so it survives
  a swap; kitchen-sink went 53 `tsc` errors to 0 (43 were barq's fault —
  `Incoming<P>`, `LibraryManagedAttributes` widening, `PropsWithChildren`,
  `<Match>`); all six parked oxlint rules are on.

## Open, in the order I would take them

### 1. Five red-team findings still live in shipped code

A red team measured these against the previous design; three are still true of
what is committed.

- **`ssr: false` ships a wrong head.** `packages/router/src/router.ts:934` skips a
  depth whose ssr mode is `false` and pushes the PARENT's context at that depth.
  `projectHead` (`packages/router/src/server.ts:512`) maps the whole chain and
  never consults `resolveSsr`, so that route's `head` RUNS on the server while
  its `beforeLoad` did not — reading a context missing its own contribution.
  Measured: `<title>Account undefined of ada</title>` in the shell bytes.
- **A `head` that throws leaks the router state.** `projectHead` sits outside
  both dispose-guarded regions in `createPageHandler`. It swallows per-route
  (correct, matches `projectLane`) but a rejection from the `Promise.all` itself
  escapes without `dispose()`.
- **`installHead` writes `document.title` into an unowned `<title>`**
  (`head.ts`, `applyTags`), and a retracted title creates a fresh unowned one.
  `captured` is a module-level singleton, so a second document restores the
  first's title.
- **The nonce is stripped on the client's first apply.** `sameTag` allows exactly
  `+1` attribute for `data-barq-head`, and a nonce makes the count off by one, so
  the node is never reused. Latent — only the prerenderer sets a nonce, to
  `undefined`.
- **`bun run preview` is 100% broken.** `packages/kitchen-sink/package.json:9` is
  `node ./preview.mjs` and the file uses `Bun.serve`/`Bun.file`. It also has no
  `Cache-Control`, no ETag, no 304, no HEAD handling, no trailing-slash 308, a
  five-entry MIME table, and answers a missing `/assets/*.js` with an SSR HTML
  shell.

### 2. `loaderData` in `head` — decide, then wire

`packages/router/src/server.ts:912` is a stub returning `undefined`, with the
reasoning above it. TanStack's `projectLane` runs after a match's loader resolves,
which is what makes `head: ({ loaderData })` work. Reading a loader in barq's
pre-shell phase does NOT: it is outside the render's async session, and a keyed
value first read outside one is seeded into nobody — measured,
`__BARQ_DATA__=({})` with the client refetching everything. Two mechanisms are
named at the function; pick one with me before building.

### 3. The production server and a deployable output

`serveBarq` (`packages/start/src/serve.ts:56`) has ZERO callers — the only three
mentions elsewhere are comments. There is no `dist/barq.json`, no adapter, and
`vite build` emits no `.vite/manifest.json`. `PrerenderedPage{path,file,status,headers}`
goes to `onPages` and is never persisted. Research already done and worth reusing:
SvelteKit's `Adapter`/`builder` contract, Nitro's presets and `.output/nitro.json`,
what `srvx` does and does not give (it is the listener plus a good Node bridge and
a good static middleware — it has no build-time story), and a 27-item Node
request/response gotcha list. `vite preview` will never do SSR; that was rejected
twice upstream (vitejs #14836, #14837).

### 4. `packages/testing` cannot test what barq now does

`grep -c hydrate packages/testing/src/index.ts` is `0`. No SSR helper, no
hydration helper, no seed installer. The router and server suites hand-roll their
own harnesses; `packages/router/src/server.test.ts`'s `hydration` describe is the
model.

### 5. Documentation

No `packages/start/README.md`, no getting-started, nothing on entries, the render
modes, prerendering, `shellComponent`/`head`, or the server-entry contract. The
contract is discoverable only by reading `defaultServerEntry()` in
`packages/start/src/vite.ts`.

### 6. The client story for a mutation

`<form action={serverFn}>` works with JS disabled. Nothing exists for pending
state, optimistic updates or error display on the JS path. Decide whether that is
barq's job or the application's and write the answer down either way.

### Smaller, already measured

- A boundary settling after the render walks past `</body>` puts its swap script
  after `</html>` (`shellStream`). TanStack holds the tail with a transform.
  There is a test pinning the current behaviour.
- The seed channel `__BARQ_SEED__` is dead: a module entry is deferred by
  definition, so it always runs after `done()`. `scratch/frontdoor/probe-boot`
  measured tail 718 ms / modulepreload 598 ms / async-in-head 121 ms, and the red
  team then measured time-to-HYDRATE-READY as 842 / 599 / 599 — the whole
  apparatus buys **zero ms** over one `<link rel="modulepreload">` on the entry
  chunk, and the async-in-head variant has two fatal bugs. So: add the
  modulepreload, delete the channel.
- `bun run --filter '*' typecheck` is red in `packages/core` (85) and
  `packages/server` (17), all in TEST files. See `TODO.md`.

## Traps that cost real time

- `grep -a` under `packages/compiler-rs/test/` — `ssr.test.ts` is classified
  binary and grep silently prints nothing for literals that are plainly there.
- **Stale `dist/` bites twice.** Type-aware lint and `tsc` resolve workspace types
  through `dist/*.d.ts`, and Vite loads a config with NODE conditions. After
  editing `packages/router` or `packages/core`, run `bun run build` in that
  package before typechecking anything downstream. After editing
  `packages/compiler-rs/src/routes.rs`, run `bun run build` there too — it is a
  napi binary and `cargo test` passing does not mean the `.node` was rebuilt.
- Both Vite environments must resolve `@barqjs/*` the SAME way. `kitchen-sink/vite.config.ts`
  sets both conditions and says why.
- **Anything a ROUTE MODULE imports ships to the browser.** `shellComponent` and
  `head` live in route modules, so they may only import `@barqjs/router`, never
  `@barqjs/router/server` — that reaches `node:async_hooks` and Vite externalises
  it, the root route throws inside its own boundary, and the page renders EMPTY
  with a correct head above it.
- `barqRouter` and every plugin `barqStart()` returns carry `sharedDuringBuild`.
  Without it Vite re-imports `vite.config.ts` per environment, so a module-scope
  variable written in the client build is read as `undefined` in `buildApp`.
- A component IS a Block. `readSlot` refuses one in a value slot.
- Any hydration change is measured by the L5 oracle
  (`packages/compiler-rs/test/hydration.test.ts`) and its node-identity REUSE
  percentages, not by a markup diff. Update a baseline only with the reason
  written into its `why`.
- A new diagnostic needs a `docs/BARQ0xx.md`, a `docs/README.md` row and a
  reachable entry in `test/diagnostics.test.ts`. Two tests enforce it. Next free
  code is BARQ014; 006 and 007 are tombstones.
