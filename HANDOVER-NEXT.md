# barq — next session

Paste this as the opening prompt. Everything below was verified, not remembered.

---

## The task, in one line

**Audit the whole of `@barqjs/router` and `@barqjs/start`'s public surface against
TanStack Router/Start from SOURCE, fix what the audit finds, and ship a CLI that
scaffolds a working project — client-only and full-stack.**

Three parts, in this order. Do not start the CLI before the audit: the CLI's job
is to emit the surface, so a surface that is still moving makes it wrong twice.

---

## How I want you to work — read this first

1. **Agree a public API shape with me BEFORE building it.** Put the shape up,
   wait, then build. Use the question tool with real options and previews.
2. **Read prior art from SOURCE, never from memory.** Clone the canonical repo
   and quote `file:line` for every claim about what another framework does. Two
   sessions running, "from memory" has been wrong every time it was checked.
3. **Treat every comment, registry row and gate as a CLAIM to verify.** A gate
   written by an agent is not evidence. Four comments described a render
   architecture that had been replaced — one named a mechanism that does not
   exist, and I started designing against it before checking.
4. **Measure, then fix.** A probe in `scratch/` is a vibe; a test in the suite is
   a proof. Every fix lands with the test that would have caught it, and
   **falsify the test before you land it** — break the fix and watch it go red.
   If it does not go red, say so in the comment rather than letting the name
   imply a gate that is not there (`server.test.ts`'s "a failure before the
   render" describe does exactly that, on purpose).
   Falsification earns its keep: forcing every `head` to wait turned its gate red
   AND turned three unrelated `ssr` tests red, which is what found a real leak in
   the change being tested.
5. **Do not write design documents.** The reasoning goes in a comment beside the
   thing and in the commit message.
6. **Every gate green before each commit.** Never leave the tree red at a
   stopping point.

---

## State, verified at `50a16b9`

```
core 921 · router 369 · server 104 · start 135 · extra 26 · testing 16 · compiler 22
compiler-rs: cargo 375 pass · bun 3644 pass / 17 todo / 1 fail
  (the 1 fail is `the self-check needs one failing and one holding claim; the
   corpus has both` — it fires BECAUSE nothing fails. Do not chase it.)
bun run ci clean · cargo clippy 0 · cargo fmt clean
tsc clean on packages/router, packages/start, packages/kitchen-sink
kitchen-sink builds, prerenders `/` and `/about`, `bun run preview` serves those
  plus the SSR routes, `/api/health`, and a real 404
```

The Rust workspace root is `packages/compiler-rs`, not the repo root.
17 commits since the previous handover: `git log 907d915..HEAD`.

---

## PART 1 — Audit the surface

`packages/router/src/index.ts` exports **133** names, `router/server.ts` 71,
`start/index.ts` 52. Nobody has read that list against theirs in one pass. Do
that, and produce a table: **theirs / ours / same? / divergence recorded where?**

Rules for the audit, learned the hard way:

- A divergence is fine. An **unrecorded** divergence is not. Every one needs a
  reason in a comment beside the thing.
- Look for the opposite failure too: names exported that nothing uses, types
  generated that nothing reads. The generated `.d.ts` used to emit
  `RouteMap`/`RoutePath`/`SearchFor`/`DataFor` for every route with **zero**
  consumers repo-wide.
- Check the shapes ACCEPT what theirs accept. `createFileRoute` accepted the
  whole option set while the generator honoured nine of ~25 — silently, and for
  months.

Known-open, in the order I would take them:

### 1. The production server and a deployable output — the biggest gap

`serveBarq` (`packages/start/src/serve.ts:56`) has **zero callers**. There is no
`dist/barq.json`, no adapter, and `vite build` emits no `.vite/manifest.json`.
`PrerenderedPage{path,file,status,headers}` goes to `onPages` and is never
persisted. **barq builds but does not deploy.**

`packages/kitchen-sink/preview.mjs` is now the working shape of what a deployment
does — static file wins, the rest is rendered — and is the thing to generalise.
Research worth reusing: SvelteKit's `Adapter`/`builder` contract, Nitro's presets
and `.output/nitro.json`, what `srvx` does and does not give. `vite preview` will
never do SSR (vitejs #14836, #14837).

### 2. `packages/testing` cannot test what barq does

`grep -c hydrate packages/testing/src/index.ts` is `0`. No SSR helper, no
hydration helper, no seed installer, and nothing for cookies, sessions, route
handlers or the response draft. Every suite hand-rolls its own harness;
`packages/router/src/server.test.ts`'s `hydration` describe is the model.

### 3. Documentation

No `packages/start/README.md`, no getting-started, nothing on `routeTree.gen.ts`,
render modes, `shellComponent`/`head`, code splitting, API routes, sessions, rate
limiting or the server-entry contract. Everything shipped in the last two
sessions is discoverable only by reading source.

### 4. Server-surface gaps that are DESIGN choices — change deliberately or not at all

- **A sealed session cannot be revoked** without the `isRevoked(id)` hook, and
  there is no store behind it. That is the trade the design makes.
- **`server.middleware` is not covered by the route-action manifest.** Same
  `Middleware` type, so the chain comparison COULD reach it; `verifyRouteChains`
  walks server functions only. A route declaring one chain for its handlers and
  another for its actions is not checked against itself.
- **Nothing applies the rate limiter by default.** `/api/health` uses it; server
  functions do not. Whether `createServerFn` should take one is undecided.
- **A route handler sets no security headers** — no `nosniff`, no CSP. TanStack
  sets none either, but it is a default worth arguing about rather than
  inheriting.
- Against `request-response.ts`, still missing: `getValidatedQuery` (they mark it
  "not public API (yet)") and the typed-header maps from `fetchdts`.

### 5. The client story for a mutation

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
- The code split refuses on a shared module-level local instead of extracting it
  into a third module the way `?tsr-shared` does. No route in kitchen-sink hits
  it.

---

## PART 2 — Fix what the audit finds

Normal work. Agree each shape, build, falsify, gate, commit.

---

## PART 3 — The CLI

**There is no CLI. No package declares a `bin`.** A new application is created by
copying `packages/kitchen-sink` and deleting things.

What a project needs today — the real specification for the scaffold. VERIFY it
against `packages/kitchen-sink` rather than trusting this list:

```
package.json           scripts: dev / build / preview / typecheck
tsconfig.json          moduleResolution Bundler, jsx react-jsx,
                       jsxImportSource @barqjs/core, allowImportingTsExtensions
vite.config.ts         barqRouter() + barqStart()
src/routes/__root.tsx  shellComponent + <HeadContent/> + <Scripts/>
src/routes/index.tsx
src/barq.d.ts          Barq.Config COMPILER_MODE
src/virtual.d.ts       the build-generated modules
```

`src/routeTree.gen.ts` is GENERATED by the plugin — the scaffold must not write
it, and must not gitignore it either (TanStack commits theirs).
Entry files are OPTIONAL and the scaffold should emit none: `barqStart` generates
both, and `packages/start/src/vite.test.ts` pins what they contain.

Decide with me before building:

- **Name and shape.** `create-barq` (npm-init convention, `bun create barq`) or a
  `barq` binary with subcommands? TanStack ships `tsr` with `generate`/`watch`
  (`packages/router-cli`), which is a DIFFERENT job — theirs generates the route
  tree, ours is generated by the Vite plugin already.
- **Which templates.** "Client-side and server-side" needs pinning down. At
  least: SPA (no SSR, no server functions), and full-stack (SSR + prerender +
  server functions + API routes + session). Possibly a third with no router.
  Note `barqStart({ pages: false })` already exists for the SPA-that-calls-RPC
  deployment, so check what is genuinely missing before inventing a template.
- **Does it scaffold ROUTES too?** `barq add route /posts/$id`, `barq add api
  /webhook`, `barq add server-fn`. This is where a CLI earns its keep in a
  file-based router, and it is the part TanStack does not have.
- **Where it lives.** A new `packages/create-barq`, or a `bin` on an existing
  package.

Non-negotiable for whatever is chosen:

- **Every template must actually build, prerender and typecheck.** A gate that
  scaffolds into a temp dir, runs install + `bun run build` + `tsc --noEmit`, and
  asserts it works. A scaffold that emits a broken project is worse than none,
  and templates rot silently — the generated default ENTRIES went stale for
  exactly this reason, because only kitchen-sink exercised them.
- **The templates must not be a second copy of kitchen-sink** that drifts. Decide
  how they stay in step and write it down.

---

## Traps that cost real time

- **`git checkout <file>` to undo a falsification reverts EVERY uncommitted
  change in that file.** It silently took two unrelated fixes with it. Falsify
  with a targeted edit and reverse it with a targeted edit.
- **A `python3` replace that does not `assert` its match is a silent no-op**, and
  `oxfmt` rewraps lines between edits, so a pattern that matched ten minutes ago
  does not now. Every scripted edit asserts.
- **Stale `dist/` bites, repeatedly.** Type-aware lint and `tsc` resolve
  workspace types through `dist/*.d.ts`. After editing `packages/core`,
  `packages/server`, `packages/router` or `packages/start`, run `bun run build`
  there before linting or typechecking anything downstream. After editing
  `packages/compiler-rs/src`, run `bun run build` there too — it is a napi binary
  and `cargo test` passing does not mean the `.node` was rebuilt. ADDING AN
  EXPORT is the same rule.
- **`bun test src/x.test.ts` from the repo root glob-matches OTHER packages'**
  files of that name, and their failures look like yours. Run suites from the
  package directory.
- **Forbidden request headers.** `Cookie`, `Origin` and every `Sec-` name are
  dropped by the `Request` constructor — per the fetch spec, and happy-dom
  enforces it. A server receives them off the wire and never constructs them.
  Test them in `packages/start` (no DOM), or inject with
  `Object.defineProperty(request, "headers", …)` and say why.
- **`new Response(body, { headers })` DROPS every `set-cookie` under happy-dom.**
  Mutate the response's own headers; rebuild only when the guard is immutable.
- **`isbot` flags curl AND HeadlessChrome**, so both get the BUFFERED path. Two
  streaming measurements silently compared the buffered path against itself.
  Override the UA (`Network.setUserAgentOverride`) before measuring streaming.
- **Do not run the Chrome hydration probe while `packages/compiler-rs`'s suite is
  running.** Two headless Chromes compete and `browser.test.ts`'s `beforeEach`
  times out at 600 s, which reads exactly like a real failure.
- **`never` is the empty union AND assignable to everything.** A conditional over
  a naked type parameter distributes, so `never` answers `never`; a tuple wrapper
  stops that and is not enough, because the true branch is then taken and `infer`
  yields `never` anyway. Check `[T] extends [never]` FIRST. `bun test` does not
  typecheck — `tsc` on `packages/router` is the only compilation with an empty
  `Register`, and it is where this was caught.
- **Anything a ROUTE MODULE imports ships to the browser.** `shellComponent` and
  `head` live in route modules, so they may only import `@barqjs/router`, never
  `@barqjs/router/server`. The compiler deletes `server` from the client build;
  nothing deletes anything else.
- **`barqRouter`'s transform is `enforce: "pre"`** because it rewrites route
  SOURCE and `@barqjs/compiler` lowers whatever source it is handed.
- **`@barqjs/compiler` strips the query before matching `include`** — a route's
  split half is `<file>?barq-split`, which does not end in `.tsx`.
- A hand-written component cannot use `each` for a hydrating list — use
  `element()`, which claims the next node by TAG.
- `readSlot` refuses a Block; `props.children` crosses BY IDENTITY.
- `mount` hands your callback the root scope. Passing `null` skips every
  `provide` above the tree, and hydration still CLAIMS — so it looks fine until
  the first update reconciles everything away.
- `oxfmt <dir>` rewrites MARKDOWN and would rewrite `fixtures/`.
- `Helper` discriminants index `IMPORTED`; appending one files it under
  `/interp`. Adding a corpus fixture owes six registries a row.
- `grep -a` under `packages/compiler-rs/test/` — `ssr.test.ts` is classified
  binary.
- A new diagnostic needs a `docs/BARQ0xx.md`, a `docs/README.md` row and a
  reachable entry in `test/diagnostics.test.ts`. Next free code is BARQ014; 006
  and 007 are tombstones.
- `packages/router`'s `m8-convention.test.ts` requires a test file per source
  module, checked in by name. A new module goes red until it has one.

---

## Numbers to beat, all measured on this machine

```
api route GET   0.0021 ms  472,000/s      session seal    0.017 ms  59,600/s
page render     0.0152 ms   65,000/s      session unseal  0.013 ms  77,500/s
404             0.0065 ms  154,000/s

FCP, 300 ms loader + render-blocking stylesheet:
  streamed 172 ms   ·   buffered 468 ms
  because the shell puts the stylesheet in front of the browser at 5 ms, so the
  asset fetch overlaps the data fetch instead of queueing behind it.

head as an object   → first byte   5 ms
head as a function  → first byte 301 ms
  (theirs waits for the whole matched chain on EVERY page,
   `start-server-core/src/createStartHandler.ts:688`)
```

Hydration: `scratch/split/README.md`. The measure is node IDENTITY, not markup —
a component behind a cold `lazy()` parks its boundary and REBUILDS, so the page
looks right precisely because it threw the server's work away.

```
REUSE 98.7% (149/151 server nodes kept), errors []
navigating to /store fetched exactly 1 new chunk, and it was live
```

---

## Where the references are

Clone from the CANONICAL org and quote `file:line`: TanStack `router`,
`solidjs/solid`, `ryansolid/dom-expressions`, `solidjs/solid-start`,
`solidjs/solid-meta`.

**Solid and TanStack do the head OPPOSITELY, and the difference is settled.**
`@solidjs/meta` renders `null` for every tag and patches `document.head`
imperatively; TanStack hydrates the document and renders the tags as a tree.
**barq follows TanStack.** Do not reintroduce the patcher on the strength of
Solid's source.

**React and Solid Start are the same code where it matters.** `load-server.ts` is
`router-core`, `createStartHandler` is `start-server-core`, and the two
`default-entry/server.ts` files are byte-identical apart from the import
specifier. Do not audit them twice, and do not assume a difference without
finding one.
