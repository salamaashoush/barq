# barq — next session

Paste this as the opening prompt. Everything below was verified, not remembered.

---

## How I want you to work

1. **Agree a public API shape with me BEFORE building it.** Put the shape up,
   wait, then build.
2. **Treat every comment, registry row and gate as a CLAIM to verify, not a law.**
   Check it against the reference implementation from SOURCE — clone it, quote
   `file:line`. Never from memory.

   **A gate written by an agent is not evidence.** When a gate objects to a
   correct fix, read what it is actually pinning before you believe it. Do not
   revert a fix because a gate complains.
3. **Measure, then fix.** A probe in `scratch/` is a vibe; a test in the suite is
   a proof. Every fix lands with the test that would have caught it, and falsify
   the test before you land it — break the fix and watch it go red. **If it does
   not go red, say so in the comment rather than letting the name imply a gate
   that is not there.** `server.test.ts`'s "a failure before the render" describe
   does exactly that, on purpose.
4. Do not write design documents. The reasoning goes in a comment beside the
   thing and in the commit message.
5. Every gate green before each commit.

## State — verified

```
core 921 · router 350 · server 104 · start 110 · extra 26 · testing 16 · compiler 22
compiler-rs: cargo 372 pass · bun 3644 pass / 17 todo / 1 fail
  (the 1 fail is `the self-check needs one failing and one holding claim; the
   corpus has both` — it fires BECAUSE nothing fails. Do not chase it. Confirmed
   by name this session.)
bun run ci clean · cargo clippy 0 · cargo fmt clean
tsc clean on packages/router, packages/start, packages/kitchen-sink
kitchen-sink: builds, prerenders `/` and `/about`, `bun run preview` serves both
  plus the SSR routes, `/api/health` and a real 404
```

The Rust workspace root is `packages/compiler-rs`, not the repo root.

10 commits since the last handover. `git log 907d915..HEAD`.

## What landed, and why

Four API decisions were put up and agreed before anything was built; all four
were "match TanStack".

**`routeTree.gen.ts` — the table is a real file and it carries the whole option
set.** The old emit was one `lazy()` per option, so it could only carry an option
a dynamic import can answer for. Measured through the real napi binding on a
route declaring everything: it emitted nine options and DROPPED `validateSearch`,
`loaderDeps`, `beforeLoad`, `context`, `errorComponent`, `notFoundComponent`,
`beforeEnter`, `search.middlewares`, `staleTime`, `gcTime`, `shouldReload`,
`preloadStaleTime`, `staleReloadMode`, `pendingMs`, `pendingMinMs` — every one of
which the router reads SYNCHRONOUSLY off `route.definition`. Static imports plus
`...Route.options` fix it. `createRouter`/`createPageHandler`/`startClient`/
`<Router>` take `routeTree`, not `routes`.

**The types are load-bearing now.** The old `.d.ts` emitted `RouteMap`,
`RoutePath`, `SearchFor` and `DataFor` and a grep found NO file referencing any
of them. `register.ts` declares the empty `Register` the generated file augments;
`LinkProps.to` reads it. `to` admits any string on purpose — one step short of
theirs, because BARQ013 sees tables the types cannot (kitchen-sink's second
router on a `memoryHistory`). Types offer, the compiler refuses.

**The compiler splits `component` and `pendingComponent` into their own chunk**
(`compiler-rs/src/route_split.rs`), which is what pays back the static table.
266 kB in one chunk → 174 kB across six, of 20. Not `errorComponent` /
`notFoundComponent`, which theirs splits: those are not in `preloadMatched`, and
a fallback behind a cold `lazy()` throws `NotReadyError` from inside the boundary
already handling a failure. A root route is never split. A module-level LOCAL
both halves reach REFUSES the split and names the binding; an import does not.
`Route` is pinned and its edges are cut — a component calling
`Route.useLoaderData()` otherwise moved `export const Route` itself into the
split chunk.

**Server functions are `fn({ data })` / `.handler(({ data, context, signal }))`,**
middleware hands context down with `next({ context })`, and `createServerFn({
method: "GET" })` is REFUSED naming CVE-2026-39371 rather than accepted and
ignored.

**An application writes no entry files.** kitchen-sink's `src/` is routes, data
and styles. The generated defaults now have three tests; they had none, which is
why they went stale unnoticed.

**`@barqjs/start/client`** exists because the compiler's stub imported `clientRpc`
from the package index, which re-exports `context.ts` — `node:async_hooks` — into
every client bundle that reached one server function. Pre-existing, verified by
building HEAD in a worktree, and it got worse the moment the table became static.

**The server surface landed too, in three commits.** Audited against
`start-server-core/src/request-response.ts` and `serverRoute.ts`.

- **A request has an ambient RESPONSE.** Measured first: a server function could
  not set a cookie at all on the JS path — `Response.json(encodeWire(result))`
  fed a returned `Response` to the value codec and answered
  `Seroval Error (step: 1)`, a 500 with nothing in it, while the no-JS form path
  returned it correctly. `setResponseHeader`/`setResponseStatus`/`setCookie` and
  the read half now work from a server function, a loader, a `beforeLoad` and a
  route handler alike. The draft rides every exit including the refusals, so a
  middleware that rotates a cookie and then 401s keeps the rotation, and a
  `beforeLoad` that seats a session and then redirects keeps the cookie.
- **Cookies are written here**, not taken from `cookie-es`: every trap is a rule
  a browser enforces silently, so each is a THROW (`SameSite=None` without
  `Secure`, the `__Host-`/`__Secure-` prefixes, a non-integer `Max-Age`, a `;`
  smuggled through `path`).
- **API routes are `server: { middleware, handlers }` on an ordinary route** —
  one tree, one file convention, and a route may be both a page and an endpoint.
  The compiler DELETES `server` from the client build, gated against a real
  two-environment build that greps the chunks for a marker.
- **Sessions are a sealed cookie on WebCrypto AES-GCM**, no dependency. The
  interface is theirs; the sealing is not, and the file says so.

## Still open, in the order I would take them

### 1. `loaderData` in `head` is still a stub

`packages/router/src/server.ts`'s `loaderDataFor()` returns `undefined`, with the
reasoning above it. TanStack's `projectLane` runs after a match's loader
resolves, which is what makes `head: ({ loaderData })` work. Reading a loader in
barq's pre-shell phase does not: it is outside the render's async session, and a
keyed value first read outside one is seeded into nobody — measured,
`__BARQ_DATA__=({})` with the client refetching everything. Two mechanisms are
named at the function; pick one before building.

**This is also what would make the hoisted dispose guard observable.** Right now
nothing between `setContexts` and the render can reject, so the guard is
defensive; a real `loaderData` projection can.

### 2. The production server and a deployable output

`serveBarq` (`packages/start/src/serve.ts:56`) still has ZERO callers. There is
no `dist/barq.json`, no adapter, and `vite build` emits no `.vite/manifest.json`.
`PrerenderedPage{path,file,status,headers}` goes to `onPages` and is never
persisted. `packages/kitchen-sink/preview.mjs` is now the working shape of what a
deployment does — static file wins, the rest is rendered — and is the thing to
generalise. Research worth reusing: SvelteKit's `Adapter`/`builder` contract,
Nitro's presets and `.output/nitro.json`, what `srvx` does and does not give.
`vite preview` will never do SSR (vitejs #14836, #14837).

### 3. `packages/testing` cannot test what barq now does

`grep -c hydrate packages/testing/src/index.ts` is `0`. No SSR helper, no
hydration helper, no seed installer. `packages/router/src/server.test.ts`'s
`hydration` describe is the model.

### 4. Documentation

No `packages/start/README.md`, no getting-started, nothing on `routeTree.gen.ts`,
the render modes, prerendering, `shellComponent`/`head`, code splitting, or the
server-entry contract.

### 5. The server surface, what is NOT there

Against `request-response.ts`, still missing: `getValidatedQuery` (they mark it
"not public API (yet)"), and the typed-header maps they get from `fetchdts`.
Neither is load-bearing. What IS worth deciding:

- **A session cannot be revoked**, by construction — nothing on the server is
  consulted to open a sealed cookie. `maxAge` bounds it. An application that
  needs revocation needs a store, and barq offers no seam for one.
- **`server.middleware` is not covered by the route-action manifest.** It uses
  the same `Middleware` type, so the chain comparison COULD reach it, but
  `verifyRouteChains` only walks server functions today. A route that declares
  `middleware` for its own handlers and a different one for its actions is not
  checked against itself.
- **Route handlers are not prerendered and cannot be.** `/api/*` under a
  prerender crawl renders as a page; nothing marks a handler-only route as
  uncrawlable.

### 6. The client story for a mutation

`<form action={serverFn}>` works with JS disabled. Nothing exists for pending
state, optimistic updates or error display on the JS path. Decide whether that is
barq's job or the application's and write the answer down either way.

### Smaller, already measured

- A boundary settling after the render walks past `</body>` puts its swap script
  after `</html>` (`shellStream`). TanStack holds the tail with a transform.
  There is a test pinning the current behaviour.
- Runtime scripts are emitted after the shell instead of in `<head>`; no asset
  hoisting, so a late boundary's `<link>`/`<title>` can never reach `<head>`; no
  bounded stream buffers (TanStack errors at three explicit limits).
  `scratch/p9/SSR-GAPS.md`.
- `<textarea>`, `<select>` and `<output>` still SSR without their value —
  serialising them correctly means emitting CHILDREN, which an attribute function
  cannot do.
- `bun run --filter '*' typecheck` is red in `packages/core` (85) and
  `packages/server` (17), all in TEST files. See `TODO.md`.
- The split refuses on a shared module-level local instead of extracting it into
  a third module the way `?tsr-shared` does. No route in kitchen-sink hits it.

## Traps that cost real time

- **THE ONE THAT COST THE MOST THIS SESSION: `git checkout <file>` to undo a
  falsification reverts every uncommitted change in that file.** I falsified a
  fix by editing `server.ts`, then `git checkout`ed it — and silently lost two
  unrelated fixes in the same file. Falsify with a targeted edit and reverse it
  with a targeted edit.
- **A `python3` replace that does not `assert` its match is a silent no-op**, and
  `oxfmt` rewraps lines between edits, so a pattern that matched ten minutes ago
  does not now. Every scripted edit asserts.
- **Stale `dist/` bites, and it bit three times.** Type-aware lint and `tsc`
  resolve workspace types through `dist/*.d.ts`. After editing `packages/core`,
  `packages/router` or `packages/start`, run `bun run build` there before
  linting or typechecking anything downstream. After editing
  `packages/compiler-rs/src`, run `bun run build` there too — it is a napi
  binary and `cargo test` passing does not mean the `.node` was rebuilt.
  ADDING AN EXPORT is the same rule, and `@barqjs/start/client` sprung it: a new
  `exports` subpath whose `dist` file has not been built resolves under the `bun`
  condition (which points at `src/`) and fails under `import`.
- **A Vite string alias is a PREFIX replacement.** `"@barqjs/start"` listed
  before `"@barqjs/start/client"` turns the latter into `…/src/index.ts/client`.
  The more specific one goes first.
- **`never` is the empty union AND is assignable to everything.** A conditional
  over a naked type parameter distributes, so `never` answers `never`; wrapping
  in a tuple stops that and is not enough, because the true branch is then taken
  and `infer` produces `never` anyway. Check `[T] extends [never]` FIRST.
  `bun test` does not typecheck — `tsc` on `packages/router` is the only gate
  with an empty `Register`, and it is where this was caught.
- **`new Response(body, { headers })` DROPS every `set-cookie` under happy-dom.**
  A merge that rebuilds the response passes in `packages/start`, which registers
  no DOM, and silently produces a cookie-less response in the router's suite.
  Mutate the response's own headers; rebuild only when the guard is immutable.
- **`Cookie` is a FORBIDDEN request header name**, so `new Request(url, {
  headers: { cookie } })` drops it — in happy-dom and per the fetch spec. A
  server never constructs a request. Cookie-read tests live in `packages/start`.
- **`bun test src/x.test.ts` from the repo root glob-matches OTHER packages'**
  files of that name, and their failures look like yours. Run suites from the
  package directory.
- **Do not run the Chrome hydration probe while `packages/compiler-rs`'s suite is
  running.** Two headless Chromes compete and `browser.test.ts`'s `beforeEach`
  times out at 600 s, which reads exactly like a real failure.
- `grep -a` under `packages/compiler-rs/test/` — `ssr.test.ts` is classified
  binary.
- **Anything a ROUTE MODULE imports ships to the browser.** `shellComponent` and
  `head` live in route modules, so they may only import `@barqjs/router`, never
  `@barqjs/router/server`.
- **`barqRouter`'s transform is `enforce: "pre"`** because it rewrites route
  SOURCE and `@barqjs/compiler` lowers whatever source it is handed. Reversed,
  the split would be moving code that no longer looks like what the author wrote.
- **`@barqjs/compiler` strips the query before matching `include`.** A route's
  split half is `<file>?barq-split`, which does not end in `.tsx`.
- **A hand-written component cannot use `each` for a hydrating list.** Use
  `element()`, which claims the next node by TAG.
- **`readSlot` refuses a Block.** `props.children` crosses BY IDENTITY.
- **`mount` hands your callback the root scope.** Passing `null` skips every
  `provide` above the tree, and hydration still CLAIMS — so it looks fine until
  the first update reconciles everything away.
- **`oxfmt <dir>` rewrites MARKDOWN and would rewrite `fixtures/`.** The root
  `format` scope names `packages/compiler-rs/src` and `test` explicitly.
- **`Helper` discriminants index `IMPORTED`**, and `FIRST_SERVER_HELPER` /
  `FIRST_INTERP_HELPER` slice that array.
- **Adding a corpus fixture owes six registries** a row.
- A new diagnostic needs a `docs/BARQ0xx.md`, a `docs/README.md` row and a
  reachable entry in `test/diagnostics.test.ts`. Next free code is BARQ014; 006
  and 007 are tombstones.
- **`packages/router`'s `m8-convention.test.ts` requires a test file per source
  module**, checked in by name. A new module goes red until it has one.

## How to verify hydration

`scratch/split/README.md`. The measure is node IDENTITY, not markup: a component
behind a cold `lazy()` parks its boundary and REBUILDS, so the page looks right
precisely because it threw the server's work away. Last measured:

```
REUSE 98.7% (149/151 server nodes kept), errors []
navigating to /store fetched exactly 1 new chunk
the freshly-loaded chunk was live: Count: 0 -> Count: 1 on click
```

The two nodes not kept are the head's, which `<HeadContent />` reconciles as a
keyed list.

## Where the references are

Clone from the CANONICAL org and quote `file:line` for every claim about what
another framework does: TanStack `router`, `solidjs/solid`,
`ryansolid/dom-expressions`, `solidjs/solid-start`, `solidjs/solid-meta`.

**Solid and TanStack do the head OPPOSITELY, and the difference is settled.**
`@solidjs/meta` renders `null` for every tag and patches `document.head`
imperatively; TanStack hydrates the document and renders the tags as a tree.
**barq follows TanStack.** Do not reintroduce the patcher on the strength of
Solid's source.
