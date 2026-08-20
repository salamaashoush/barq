# `@barqjs/router` — design brief and handover

Written 2026-08-21, at commit `a89daad`, for a session that does not have the context that produced
`DESIGN-START.md`. **Read `DESIGN-START.md` §1 first** — it is the list of claims that were made, tested
against the codebase, and falsified. Several of them are the obvious ideas for a router too, and they are
already dead.

The task: a new `@barqjs/router` package. Not an extension of `packages/extra/src/router.ts` — that one stays
where it is (§6).

---

## 0. State, verified at `a89daad`

```
cargo test                    318 pass, 0 fail   (clippy clean, fmt clean)
compiler-rs bun test         3483 pass, 0 fail   (+1 "error", see below)
packages/core                 914 pass, 0 fail
packages/server                90 pass, 0 fail
packages/start                 36 pass, 0 fail   (6 through a live Vite dev server)
packages/extra                153 pass, 0 fail
packages/testing               16 pass, 0 fail
packages/compiler              22 pass, 0 fail
bun run ci                    EXIT=0
kitchen-sink                  builds on Vite 8
```

The `1 error` in the compiler harness is **not a failure and predates this work**. `test/semantics.test.ts`'s
"the gate closes" self-check throws when *no* claim in the corpus is failing, which is the state the registries
are in. It fires because everything passes. Do not chase it.

Dependencies are all at latest as of this date, no pins: TypeScript 7.0.2, Vite 8.2.2, oxc 0.146, napi 3.12.1,
oxlint 1.79, oxfmt 0.64. `TODO.md` carries 693 lint warnings that came with oxlint 1.79 and are turned off with
counts and a plan; they are not yours unless you touch those files.

---

## 1. What exists to build against

Eight commits landed the server half. The router is the last large piece, and one thing (§7) is blocked on it.

### `@barqjs/start` — server functions

Public surface in `packages/start/src/index.ts`:

| | |
|---|---|
| `createServerFn()` | `.middleware([…]).validator(schema \| "unchecked").handler(fn)` |
| `serverRpc(meta, built)` / `clientRpc(id)` | what the compiler emits; you will not write these |
| `getRequest()` | the ambient `Request`, via `AsyncLocalStorage` |
| `Middleware` | `(next) => Promise<unknown>`; rejects by `throw new Response(...)` |
| `RPC_PREFIX` = `/_barq/fn/`, `DATA_SUFFIX` = `.data` | the URL shape |
| `isServerFn(v)` | brand check, `Symbol.for("barq.server-fn")` |

`packages/start/src/server.ts` has `mount(id, fn)`, `mounted()`, `handleServerFn(request, options)`.
`packages/start/src/serve.ts` has `createFetchHandler` / `serveBarq`, runtime-agnostic through `srvx`.

**Rules already decided and enforced, do not re-open:**

- Input is fail-closed. No validator means *any* argument is a 400.
- Middleware runs **before** validation, so a refusal cannot be skipped by sending a malformed payload.
- POST only; `Origin` then `Sec-Fetch-Site`; `Origin: null` refused.
- The registry is a `Map`, never an object — a client-supplied id must not reach a prototype.
- **Export-ness decides the mounted surface.** A non-exported server function has no id and no endpoint.

### `@barqjs/server` — SSR

`renderToString`, `renderToStringAsync`, `renderPage(fn, {nonce})`, `renderToStream(fn, options)`.
`StreamOptions` is `{ signal, nonce, timeout }`. Streaming is per-settle: a boundary flushes when *its*
promises settle, and a read that misses while the stream is open **waits** rather than refetching
(`seedChannel` in `server.ts`, `seedLater` in core's `signals.ts`).

`@barqjs/server/codec` is the one serializer: `encodeSeed` (JS mode, inline `<script>`), `encodeWire` /
`decodeWire` (JSON channel, no `eval` — an RPC response is bytes off the network). Same hardening on both.

### The compiler

`packages/compiler-rs`. Options you will care about: `env: "client" | "server"`, `root`, `startSource`,
`serverFns`, `moduleSource`, `serverSource`, `ssr`, `hydratable`, `dev`.

`analysis/server_fn.rs` resolves `createServerFn` **by `SymbolId`** and reports the module's export surface.
Under `env: "client"` a module whose exports are all server functions is replaced wholesale by `clientRpc`
stubs and never enters the IR. `BARQ012` refuses a module that mixes server functions with anything else.

`packages/compiler/src/vite.ts` is the Vite plugin; `packages/start/src/vite.ts` composes it into
`barqStart()` and owns the manifest and the dev handler, on the Environment API.

---

## 2. Read this before designing anything

`DESIGN-START.md` §1 is a table of claims killed by evidence. Three of them will occur to you again:

**Compile-time addresses are not identities.** `ir/address.rs` mints an address only for a *dynamic prop or
slot inside JSX*. A `.ts` module has none. A `.tsx` module whose JSX is static has none. Probed directly, both
return `positions: []`. Any design that keys a route, a loader or a link off an address is dead on arrival.

**Position-derived ids cause silent mis-dispatch.** SolidStart derives server-function ids as
`hash(path)-<index>` with the name stripped in production, so appending one function renumbers its siblings and
an in-flight client asking for `listUsers` **invokes `deleteUser`**. Anything a client can hold across a deploy
— a route id, a loader key, an action id — must be name-derived. It then degrades to a clean 404.

**The compiler cannot prove what reaches the browser.** Module-local reachability is not bundle-level
reachability: bare side-effect imports, barrel files, transitive chains, computed `import()` and
`/* @__PURE__ */` are all outside it. The compiler's contribution is *refusing a shape* and *generating a
manifest*, never *proving a bundle safe*.

---

## 3. What the compiler can genuinely do for a router

Four wins, and they are the reason this is a new package rather than a rewrite in place. Each needs measuring,
not assuming — `CODESIGN.md` §0.7 is the standing rule: a Tier-1 win is a proposal, a Tier-2 win is a decision.

1. **Route tree from the filesystem, generated in Rust.** Emit `routes.gen.ts` (values) and a `.d.ts` (plain
   interfaces: `RouteId -> {params, search, loaderData, context}`). The point is not convenience. TanStack's
   documented bottleneck is the TypeScript language service on accumulated route trees, because their type
   safety comes from *type-level path parsing*; generated interfaces make tsc's cost O(routes) instead of
   O(routes x path inference).

2. **The matcher emitted as code.** A segment-count switch, then literal-segment switches, params popped
   positionally. No regex, no per-route linear scan, no allocation on a hit. `packages/extra/src/router.ts`
   compiles a regex per route and scans linearly — that is the baseline to beat, and `packages/benchmark` is
   where the number has to come from.

3. **`<Link to>` checked at compile time.** An unknown path is a diagnostic with a code frame, through the
   engine that already exists (`diag.rs`, `docs/BARQ0xx.md`, and a test that enforces every code has a page
   *and* an input that produces it — see `test/diagnostics.test.ts`, which caught `BARQ012` having none).
   Static hrefs can be constant-folded.

4. **Search params through Standard Schema.** `@barqjs/start` already defines the `StandardSchema` interface
   and takes no validation dependency; reuse it rather than inventing a second shape.

---

## 4. What the router must integrate with

This is where the design is actually constrained.

**SSR and streaming.** A route's data is an async `computed` with a key; the seed channel already carries it,
including a value that settles *after* hydration begins. Loaders should ride that channel rather than invent
one. `signals.ts`'s `reserveChildSlot` keys per owner — read `DESIGN-START.md` §1's row on address-keyed seeds
before touching it.

**Server functions.** A loader is a server function in every meaningful sense. Decide whether a loader *is* a
`createServerFn()` or merely uses one, and note that export-ness already decides mounting — a loader that is
not exported is not an endpoint.

**Progressive enhancement.** `<form action={serverFn}>` already works with JS disabled: `formAttr` in
`packages/server/src/ssr.ts` writes `/_barq/fn/<id>` plus `method="post"`, and the handler answers 303 to a
same-origin `Referer`. The router should not reinvent this; it should decide what a redirect *after* an action
means for its own history.

**Environments.** `barqStart()` declares `client` and `ssr`. The router's generated modules must be
`applyToEnvironment`-scoped the way the manifest is, or a server-only route module lands in the browser graph.

---

## 5. Hard constraints from this repo

Non-negotiable, and easy to violate without noticing:

- **The calling convention is `(scope, props)`.** Every component and Block. `packages/core/CODESIGN.md`
  §3.2. `packages/extra/src/router.ts` already does this; copy its shape, not React's.
- **`children` is a Block**, so a layout constructs the next route *in its own scope*. This is better than an
  outlet and is the one thing from the existing router worth keeping wholesale.
- **Control flow is Solid 2.0's ten** (`Show`, `For`, `Switch`/`Match`, `Loading`, `Errored`, `Portal`,
  `Dynamic`, `Reveal`, `Repeat`, `Fragment`). Do not add an eleventh for routing.
- **`lazy()` does not exist.** Route-level code splitting needs it, and it is not written. This is a real
  prerequisite, not a footnote.
- **Any new diagnostic** needs a `docs/BARQ0xx.md` page, a row in `docs/README.md`, and an entry in
  `test/diagnostics.test.ts`'s `reachable` map. Two separate tests enforce this.
- **`grep -a` under `packages/compiler-rs/test/`.** `ssr.test.ts` is classified `data`, not text — its escaping
  corpus holds deliberate invalid UTF-8 — so `grep` silently prints nothing for a literal that is plainly
  there. This cost an hour once already; `DESIGN-START.md` §7.1 records it.
- **Stale `dist/` bites.** Type-aware lint resolves workspace types through `dist/*.d.ts`. A new subpath export
  needs a `tsdown.config.ts` entry and a build, or it silently resolves to `any`.

---

## 6. `packages/extra/src/router.ts`

1259 lines, 2253 lines of tests, all passing. **Leave it.** It is the no-build option and someone may be using
it.

Worth taking from it: the `(scope, props)` component shapes, the Block-as-`children` layout model, navigation
guards, prefetch, scroll restoration, view transitions, `resolvePath`, and the history abstraction
(`browserHistory` / `memoryHistory`). Its 2253-line test file is a behavioural corpus for the new package —
port the cases, not the implementation.

Worth replacing: `compilePath` (a regex per route, cached in a `Map`) and `matchRoutes` (a linear scan). Those
are what §3.2 exists to beat, and the benchmark has to show it.

---

## 7. The item that is blocked on you

**The route-action manifest** — `DESIGN-START.md` §6. Every framework surveyed documents the same hole instead
of closing it: *"A page-level authentication check does not extend to the Server Actions defined within it…
the Server Action is a separate entry point"* (Next.js; Qwik, SolidStart and RedwoodSDK say versions of the
same).

`@vitejs/plugin-rsc`'s `action-reachability` example is the only implementation closing it — a build-time
route→action-id manifest computed across both graphs, where an unreachable id 404s and a mis-routed action is
redispatched through the owning route's middleware. Nobody has shipped it in a mainstream framework.

It presupposes routes, which is why it is behind this work. It is also the single strongest thing barq could
have, and the reason a compiler-aware router is worth building rather than adapting one.

Note the opposite datum: Next.js is *removing* action forwarding (PR #96951, Aug 2026) because *"it has caused
correctness issues… the action executes under a different route and request context."* Validate-and-reject may
be the better half of that design than redispatch.

---

## 8. Decisions the next session should take early

1. **Is a loader a server function, or does it call one?** Everything downstream — mounting, middleware,
   auth-chain binding, the seed channel — follows from this.
2. **File-based routes, code-based, or file-based generating code-based?** TanStack does the third. It keeps
   the generator optional, which matters because the generator is Rust here.
3. **Does the router own `lazy()`, or does core?** Core, probably — it is a reactivity primitive, not a routing
   one — but it does not exist either way.
4. **How much of §3 is measured before it is committed to?** §3.2 is the only one with an obvious baseline.
   §3.1's tsc claim needs a large generated route tree to be worth anything.

## 9. How to work here

Read `packages/compiler-rs/CODESIGN.md` §0.7 (Tier 1 iterates, Tier 2 adjudicates), §3 (the contract), and §6
(the oracle) before touching the compiler. `HANDOVER.md` in the same directory is the compiler's own state.

Commits in this repo carry the *why*, including what was tried and rejected. Documents record falsified claims
rather than deleting them — `DESIGN-START.md` §1 is the model. When a test catches something, say so in the
commit; three of the eight commits behind you exist because a gate caught what review did not.
