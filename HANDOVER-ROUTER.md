# `@barqjs/router` — P6 handover: parity with TanStack Router

Written at commit `38a5107`, for a session that did not build the package. **Read
`packages/router/DESIGN.md` first** — it is the design record and it carries the claims that were
falsified along the way, including two that were falsified WRONGLY and restored. Then
`DESIGN-START.md` §1, then `packages/compiler-rs/CODESIGN.md` §0.7, §3 and §6.

The task: close the gap between what is built and TanStack Router / TanStack Start's shipped
feature set. Not a rewrite. The runtime, the SSR path, the generator and the compiler hooks all
exist and are tested; what is missing is enumerated in §3.

---

## 0. State, verified at `38a5107`

```
cargo test                     335 pass, 0 fail   (clippy clean, fmt clean)
compiler-rs bun test          3506 pass, 0 fail   (+1 "error", see below)
packages/core                  918 pass, 0 fail
packages/server                 92 pass, 0 fail
packages/start                  36 pass, 0 fail
packages/router                141 pass, 0 fail
packages/extra                  26 pass, 0 fail
packages/testing                16 pass, 0 fail
packages/compiler               22 pass, 0 fail
bun run ci                    EXIT=0
kitchen-sink                  builds on Vite 8
```

The `1 error` in the compiler harness is **not a failure and predates all of this**.
`test/semantics.test.ts`'s "the gate closes" self-check throws when *no* claim in the corpus is
failing, which is the state the registries are in. Do not chase it.

`packages/kitchen-sink`'s `typecheck` fails with ~55 errors across eight demos. That predates
this work too — the gate that matters for it is `bun run build`, which passes.

---

## 1. What exists, and where

`packages/router/src`, 2,213 implementation lines and 2,291 test lines.

| file | what it owns |
|---|---|
| `path.ts` | segments, `$param`/`$` splat parsing, `resolvePath`, `interpolate`, `isUnder` |
| `matcher.ts` | the segment trie. Ranking is STRUCTURAL — static before param before splat, with backtracking |
| `route.ts` | `RouteDefinition`, `flattenRoutes`, `AnyRouteDefinition` |
| `history.ts` | `browserHistory` / `memoryHistory`, base stripped on the way in and added on the way out |
| `router.ts` | `createRouter`: location, match, params, search, loader cells, guards, navigate |
| `components.ts` | `Router`, `RouterProvider`, `Link`, `NavLink`, `Redirect`, `renderDepth` |
| `hooks.ts` | `useRouter`, `useLocation`, `useParams`, `useSearch`, `useSearchParams`, `useNavigate`, `useMatches`, `useInvalidate` |
| `server.ts` | `createPageHandler`, `renderRoutes` (string backend), `redirect()` |
| `manifest.ts` | the route→action verifier: `reachabilityFrom`, `verifyRouteChains`, `idsInStub` |
| `vite.ts` | `barqRouter()` — asks the compiler for the table, serves it, invalidates it |

In the compiler (`packages/compiler-rs`):

- `src/routes.rs` — the ENTIRE file-based generator: scan, naming rules, tree, module emit,
  `.d.ts` emit, behind one napi export `routeTree(root, dir)`. The plugin reads no directory.
- `src/analysis/link.rs` — `BARQ013`, `<Link to>` resolved by `SymbolId` against `routerSource`.

In `@barqjs/core`: `lazy(load, pick?)` with `.preload()`.
In `@barqjs/start`: `middlewareOf(fn)`, and `HandlerOptions.reachable`.

---

## 2. Decisions already taken. Do not re-open these.

- **A loader is an ISOMORPHIC function that CALLS a server function.** It is not itself one.
  TanStack's shape, chosen deliberately, and their docs are explicit: *"Route `loader`s are
  isomorphic - they run on both server and client."* The loader body ships to the client BY
  DESIGN; anything that must not lives behind a `createServerFn()`, and `BARQ012` enforces the
  module split.
- **POST only.** TanStack's server-fn default is `GET`; barq's is not and will not be.
  RedwoodSDK shipped GET-invocable server functions (CVE-2026-39371, CVSS 8.1) and a plain link
  became a one-click mutation carrying `SameSite=Lax` cookies.
- **`children` is a Block, and there is no `<Outlet>`.** A layout constructs the next route in
  ITS OWN scope, so a provider or boundary the layout installs is visible to the route it wraps.
  An outlet cannot do that. `RouteProps.children` is TYPED `Child` because `{props.children}` has
  to compile; the runtime value is a Block and the comment says so.
- **Redispatch is rejected** for the route-action manifest. `server.ts`'s own rule: values derived
  from the request are fine to navigate to and never fine to authorize with.
- **The matcher is not generated.** Measured: a 20-line bucket recovers 28x of the 28.2x
  available and a generated switch buys 58 ns more, for a generator and 76 kB of emitted JS at
  1000 routes. `DESIGN.md` has the table.
- **`useIsLoading` has no equivalent and should not get one.** Loading is a `Loading` boundary
  per route depth, not a router-wide counter.

---

## 3. The gap to TanStack, which is the task

Grouped by how much design each needs. Everything here was read out of TanStack's own source at
`router-core@1.171.26` / `start-client-core@1.170.26`; the citations are in this repo's git
history on commit `e441950`'s research.

### 3.1 Caching and revalidation — the biggest functional gap

TanStack's match id is `route.id + interpolatedPath + JSON.stringify(loaderDeps)`, and its reload
rule is a real state machine (`createLoaderTask`, `load-client.ts:735-795`). barq has a loader
cell keyed by `r:<routeId>|<sorted params>` plus a generation counter, and nothing else.

Missing, each with TanStack's name for it:

- **`loaderDeps: (opts: { search }) => TDeps`** — projects validated search into the cache key.
  Search is deliberately NOT in the key otherwise. This is the one to build first; the rest hang
  off it.
- **`staleTime` / `preloadStaleTime`** (defaults 0 / 30_000), **`gcTime` / `preloadGcTime`**
  (300_000). barq's cache is a fixed-size Map with insertion-order eviction.
- **`shouldReload: boolean | (ctx) => any`**, which overrides `staleTime` in both directions.
- **`staleReloadMode: 'background' | 'blocking'`** — a stale-but-successful match reloads in the
  background by default, showing the old data.
- **`cause: 'preload' | 'enter' | 'stay'`** on the loader context.
- **A shared `AbortController`** across preload and navigation for one invocation. barq creates a
  fresh one per loader call and never aborts it — see §4.

### 3.2 `beforeLoad` and route context

barq has `beforeEnter` (guard only). TanStack has `beforeLoad` returning a CONTEXT object that is
merged parent→child by spread, plus a synchronous `context()` per route, threaded so a child sees
everything above it. Order is serial top-down, ALL `beforeLoad`s before ANY loader; loaders then
run in parallel.

barq runs guards serially and loaders lazily-on-read, which is not the same shape. Decide whether
to adopt the two-phase model or document the divergence.

### 3.3 Search params

`validateSearch` with Standard Schema, search middlewares (`stripSearchParams`,
`retainSearchParams`), and typed `search` per route in the generated `.d.ts`. barq has
`useSearch()` returning a raw `URLSearchParams` and no validation anywhere.

`@barqjs/start` already defines the `StandardSchema` interface (`packages/start/src/index.ts`).
Reuse it; do not invent a second shape and do not take a validation dependency.

### 3.4 Errors, not-found and pending — per route

TanStack has `errorComponent`, `notFoundComponent`, `pendingComponent`, `pendingMs`,
`pendingMinMs`, and `notFound()` alongside `redirect()`. barq has `pending` only, plus a
router-level `notFound`.

`Errored` exists in core and re-throws `NotReadyError` correctly, so an error boundary per route
depth is the same shape `renderDepth` already emits for `Loading`.

### 3.5 Preloading — and this is the one with a real hole underneath it

`lazy()` exists and works. What does NOT exist is the channel that makes it not flash:

- **`<link rel="modulepreload">` for the matched chain**, emitted into the SSR shell. Without it
  every code-split route shows its `Loading` fallback on first hydration while the chunk
  downloads. This needs the Vite client manifest, which is bundler knowledge — see §4's note on
  where it has to come from.
- **`preload="intent"` on links** — hover/viewport prefetch. `packages/extra`'s deleted router
  had this and it had THREE bugs worth not reproducing: a path that failed to match was poisoned
  for the router's lifetime, prefetch always used an EMPTY search while the cache key included
  it, and an `IntersectionObserver` was constructed for every link regardless of strategy. Read
  `git show 1991691:packages/extra/src/router.ts` before writing it.

### 3.6 Selective SSR

`ssr: boolean | 'data-only'` per route. `false` moves `beforeLoad` and the loader to the CLIENT
during hydration; `'data-only'` runs them on the server but does not SSR the component. barq
renders everything.

### 3.7 Deferred data

TanStack serializes a pending promise in the loader payload and resolves it later through an
inline script, with `<Await>` suspending on it. **barq already has the harder half** — seroval
carries a pending promise and `seedLater` makes a client read WAIT rather than refetch — so this
is mostly wiring a route's loader result into that path, not new machinery. `DESIGN-START.md` §2.5
is the record.

### 3.8 The smaller surface

`useMatch`, `useRouterState`, `useBlocker` / navigation blocking, `useCanGoBack`, route masking,
`Link`'s `activeProps` / `inactiveProps`, hash history, `resetScroll` and `viewTransition` per
navigation, and devtools.

Scroll restoration and view transitions had **zero** tests in the deleted corpus, so there is
nothing to port — they are new work either way. `packages/extra`'s versions are in git history and
their warts are catalogued in `packages/router/DESIGN.md` §D10/§D11.

### 3.9 Wiring that is written but not connected

- **The route-action manifest.** `reachabilityFrom` and `verifyRouteChains` exist and are tested,
  and the premise they rest on is asserted against the real compiler. Nothing calls them from a
  build. They need a `buildEnd` hook in the client environment that walks
  `this.getModuleInfo(id).importedIds` from each route module, plus the ssr environment's registry
  through `environment.runner.import` — `packages/start/src/vite.ts:176-180` already does that
  import, copy its shape. **Dev divergence, stated:** the dev client graph is one level deep until
  each module is itself requested, so this is a `vite build` artefact and dev must do the
  assertion lazily per request rather than arming a 404 gate against a manifest dev never
  produced.
- **`BARQ013`'s route table** reaches the compiler through `barqRouter({ onRoutes })` →
  `barqVitePlugin({ routes })`. The wire exists; no app passes it yet.

---

## 4. Traps. Every one of these cost real time.

1. **A loader cell must have NO OWNER.** `computed` captures `currentOwner` at creation, a
   loader's first read happens inside the loading boundary's content, and on a string render that
   content is DISCARDED when the boundary parks (`ssr.ts`: `if (SINK === null) return html(shown)`)
   — taking the scope with it. `renderPage`'s second pass then read a dead node and got
   `undefined`, so every SSR'd route rendered its data as undefined and seeded NOTHING, silently.
   `runWithOwner(null, …)` in `dataFor` is why. `lazy()` does the same for the same reason.
2. **A component body runs UNTRACKED** (CODESIGN §3.9). A hand-written component that reads
   `props.data()` in its body reads the pending value, throws `NotReadyError` with nothing
   subscribed, and never re-runs when it settles. The compiled shape puts that read in `insert`,
   which is a tracked effect. Tests must be written the compiled way.
3. **`renderToStream` opens the seed channel only `if (parked.length > 0)`**, and a `Loading`
   boundary parking is the only thing that fills `parked`. A loader read outside one does not
   merely fail to seed — the render throws and produces nothing. `renderDepth` and `renderRoutes`
   both emit one per depth by construction.
4. **`renderPage` renders the page TWICE in string mode.** The page function must be idempotent.
5. **Status must be decided BEFORE the shell flushes.** No SSR entry point carries one and
   `renderToStream` emits the shell synchronously.
6. **A loader that throws does not unwind out of the render** — `settle` uses `allSettled` and the
   rejection lands on a boundary. `RouterConfig.onLoaderError` is how the answer reaches the page
   handler, and it is a per-request callback because a module-level "current answer" is
   GHSA-hgv7-v322-mmgr.
7. **`settle()` with no session waits on EVERY in-flight promise in the process.** Two tests
   passed alone and timed out at 5 s inside the full suite. Use a bounded wait.
8. **A new diagnostic needs three things** or two Rust tests and two bun tests fail: a
   `docs/BARQ0xx.md` page that names itself, a row in `docs/README.md`, and an entry in
   `test/diagnostics.test.ts`'s `reachable` map. `docs/README.md` says a new code ships at warning
   or below. Next free code is **BARQ014**; 006 and 007 are burned tombstones.
9. **A JSX visitor must run BEFORE `harvest::run`**, which moves every JSX root out of the program
   and leaves a placeholder. BARQ013 was placed after it and silently found nothing.
10. **Probe files must not live in `packages/{core,server,start,router,extra,testing}`.**
    `bun run ci` lints and format-checks those recursively, so a scratch file there fails the
    gate. Use `packages/compiler-rs/scratch/` or the repo-root `scratch/`.
11. **`grep -a` under any `test/` directory.** `packages/compiler-rs/test/ssr.test.ts` is
    classified `data`, so plain `grep` prints nothing for a literal that is plainly there.
12. **Stale `dist/` bites, and rebuilding is the fix.** Type-aware lint and `tsc` resolve
    workspace types through `dist/*.d.ts`. Change a package's public surface, rebuild it, or the
    consumer typechecks against yesterday. Every package now sets `outExtensions` and a test in
    `packages/router/src/exports.test.ts` asserts every declared export path exists.
13. **`cookie` is a forbidden header name** — `new Request(url, { headers: { cookie } })` drops
    it, which reads exactly like ambient context not working.

---

## 5. How to work here

Read `packages/compiler-rs/CODESIGN.md` §0.7 before quoting any number. **Tier 1 iterates, Tier 2
adjudicates**, and a Tier-1 win is a PROPOSAL until a browser confirms it. State the instrument
beside every number and say what the instrument cannot decide in the same breath.
`packages/benchmark/src/matcher-head-to-head.ts` and `matcher-bucket.ts` are worked examples, and
`legacy-matcher.ts` is the deleted router's matcher preserved verbatim as their comparand — bugs
included, because a comparand that has been quietly improved is not the thing that was measured.

**Measure before building §3.1 and §3.5.** Both are performance features. A cache policy that
moves no number is a cache policy that should not exist, and CODESIGN §3.4's discipline —
"a flag that moves neither an allocation count nor a wall-clock number on a named benchmark is
deleted, not kept" — applies to more than flags.

Every gate green before each commit: `cargo test`, `cargo clippy --all-targets -- -D warnings`,
`cargo fmt --check`, `bun test` per package, `bun run ci`, and `bun run build` in
`packages/kitchen-sink`. Baselines are §0.

Commit messages carry the WHY, including what was tried and rejected. Record falsified claims
rather than deleting them — `packages/router/DESIGN.md` and `DESIGN-START.md` §1 are the model,
and this package has two claims that were falsified WRONGLY and restored, which is exactly the
history a reader needs.

**When a test catches something, say so in the commit.** Six of the twelve commits behind you
exist because a gate caught what review did not.
