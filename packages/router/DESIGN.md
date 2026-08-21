# `@barqjs/router` — design

Written across the sessions that built it. This file records what was decided, what was
MEASURED, and — as importantly — **which of its own claims were falsified and must not be
revived**. `DESIGN-START.md` §1 is the model for that last part.

Status: BUILT. Path, matcher, history, components, loaders, guards, the SSR page handler,
`lazy()` in core, the file-based generator, `BARQ013` and the route-action manifest all landed,
and `packages/extra/src/router.ts` is deleted.

---

## Three prerequisites, in `core`/`server`/`compiler-rs` — DONE, before any router code

Each was a defect the router would otherwise have been built on top of, and each was found by
probe rather than by review. All three are landed: `3c379a4`, `8a3f730`, `38eee03`.

### P-A — a default-exported or indirectly-exported server function leaks its body to the browser

`analysis/server_fn.rs:107-119` records `export default …` as `server_fn: false` unconditionally,
and `:98-110` records `export { x }` as "other" rather than resolving it. So for

```ts
export default createServerFn()
  .validator("unchecked")
  .handler(async () => store.concat(SECRET));
```

`scan.server_fns()` is empty, therefore `compile.rs:322-325` synthesizes **no client stub**;
`scan.mixed()` is false, therefore **BARQ012 does not fire**; and `namesOf` filters on
`e.serverFn` (`start/vite.ts:76`), therefore **nothing is mounted** and the endpoint 404s.
Verified through a live Vite dev server: the handler body and its `./db` import land in the
client graph, silently.

This is the exact leak DESIGN-START §3.1 claims barq is structurally immune to, reachable by
typing `export default`. Fix: resolve a default or indirect export back through `rooted_at` like
any other, so it either gets a stub and a mount or trips BARQ012. **Security. Blocked D1.** Fixed in `3c379a4`.

### P-B — non-streamed SSR returns the fallback and runs every loader twice

`renderPage` renders `fn()` a second time in string mode, and the comment at `server.ts:128-133`
says _"Keyed `computed` results are cached against the session, so nothing is fetched twice."_
That is false. Measured, on the string backend, with this design's own prescribed shape:

```
loader invocations: 2
html: <main><i>loading</i></main>
seed: {"r:/users/$id|{id:7}":"Ada"}
```

The second render builds a new `computed`; `getSeed` (`signals.ts:3059`) reads only
`globalThis.__BARQ_DATA__`, a CLIENT store, so it misses, refetches, throws `NotReadyError` and
the boundary emits its fallback. The DOM backend does not have this — the same probe returns
`<b>Ada</b>` after one invocation — so it is specific to the second string render.

Fix is small and the data already exists: `hydrationData` (`signals.ts:2934`) buckets resolved
values by session. The seed lookup consults the active session's bucket before the client store,
without consuming it. **Correctness. Blocked every non-streamed route.** Fixed in `8a3f730`: one invocation, `<main><b>Ada</b></main>`.

### P-C — the null seed bucket is a cross-render leak with no expiry

`getHydrationData` merges `hydrationData.get(null)` into every session's data
(`signals.ts:3030-3033`), and `clearHydrationData(session)` deletes only that session's bucket
(`:3049-3051`). A promise attributed to `null` — one whose FIRST READ happened outside a render,
which is exactly what prefetch does — is therefore emitted into every subsequent render's seed
for the process's lifetime. Demonstrated: render A's value appears in render B's seed, and
survives `clearHydrationData(B)` into a third render.

**Security.** Fixed in `38eee03`: a value that cannot be shown to belong to a render is no
longer seeded into it, and the unattributed bucket is collected. What was going to be a
convention the router had to honour is now a property of the seed channel.

---

## D1 — a loader is an ISOMORPHIC function that CALLS a server function

**Reversed.** The first draft made a loader a `createServerFn()`. It was overridden in favour of
TanStack's shape, and the prior art then justified the override on its own terms.

TanStack's docs are explicit: _"Route `loader`s are isomorphic - they run on both server and
client, not just the server."_ No route-addressed data endpoint exists in `start-server-core`;
the loader is not addressable at all. What is addressable is the server function the loader
calls, at a flat `/_serverFn/{id}` namespace, and their SSR path resolves it in-process
(`createSsrRpc`) exactly as barq's `serverRpc` does.

Three consequences, and the first is why the reversal is an improvement:

- **No forced file split.** A loader is not a server function, so `BARQ012` does not fire on a
  route module that holds a component and a loader. The first draft accepted a `.data.ts` sibling
  per route as the price of the decision; there is no price.
- **The loader body ships to the client, by design.** It runs there on every navigation after
  the first. Anything that must not ship lives behind a `createServerFn()` the loader calls, in
  a module of its own — which `BARQ012` does enforce.
- **N loaders are N requests.** TanStack issues one per server-function call and does not batch;
  barq's `/_barq/fn/<id>.data` is already that shape, so no new endpoint is needed. Whether to
  batch is a measurement about server-side auth cost per navigation, not a guess.

**Not copied from TanStack, deliberately:**

1. **Transport.** Their default is `GET /_serverFn/{id}?payload=`. barq is POST-only, and that
   is a decided rule: RedwoodSDK shipped GET-invocable server functions (CVE-2026-39371,
   CVSS 8.1) and a plain link became a one-click mutation carrying `SameSite=Lax` cookies.
2. **The gap.** Their own docs decline to close it, in three places — _"A route guard is not a
   data authorization boundary. Server functions and server routes are API endpoints; they are
   reachable independently of the route that calls them."_ Mechanically, a server-fn request
   takes an early exit BEFORE route matching (`createStartHandler.ts:577`), so route middleware
   never runs for it, and a client-side navigation never touches it either. That is precisely
   §6/§7's hole, and D8 is barq closing it rather than documenting it.

`beforeLoad` takes TanStack's shape — serial top-down, all of them before any loader, `context`
threaded parent to child, `throw redirect(...)` — with authorization documented as belonging on
the server function's middleware and not here.

## D2 — code-based core, file-based generator emits into it _(unchanged)_

Same order this repo used for `@barqjs/start`: the contract shipped before anything emitted into
it.

## D3 — `lazy()` in core, preload in the router _(unchanged)_

No `lazy` primitive exists in `packages/core/src` — confirmed twice. The ride does: a `computed`
returning a Promise is the async primitive, an effect throwing `NotReadyError` registers with the
nearest loading boundary, a suspended body is retried tracked, and `Errored` re-throws
`NotReadyError`. `lazy()` is ~10 lines over `computed` and belongs where those mechanisms are.

Named gap, unchanged: hydration has no notion of a module not yet present, and there is no asset
manifest, so a code-split route flashes its fallback on first hydration until the router emits
modulepreload for the matched chain.

## D4 — DROPPED. The matcher is a runtime trie, not generated code. BUILT.

v1 proposed emitting a segment-count switch. Measured, 200 routes, ns/op:

|                                                      |             |
| ---------------------------------------------------- | ----------- |
| one `matchPath` exec (regex + params)                | 14.3        |
| linear scan, last-hit                                | 3524.6      |
| **bucket by first segment, ~20 lines, same regexes** | **125.0**   |
| generated switch                                     | 67.0        |
| bucket, miss / switch, miss                          | 29.2 / 28.6 |

The scan's cost is 200 iterations, not the regexes — V8 compiles those to native code. A trivial
bucket recovers 28x of the 28.2x available. The generated switch buys **58 ns more** on a
last-hit and **nothing** on a miss, for a generator, a benchmark tier, and 76 kB of emitted
JavaScript at 1000 routes. Against the denominator — a compiled 20-row `renderToString` is
1199.6 ns — that is 4.8% of one page render, and on a client navigation it is a rounding error
against the fetch.

CODESIGN §3.4's own discipline decides it: _"a flag that moves neither an allocation count nor a
wall-clock number on a named benchmark is deleted, not kept."_ So the matcher is built at runtime
from the route table, bucketed, with specificity ranking. §3.2 of the brief is withdrawn on
measurement.

## D5 — RESTORED. Generated route types, and the brief was right.

v1 claimed §3.1's tsc argument was false. **My comparand was a strawman**: it gave the "inferred"
arm an O(1) interface index, which is the generated mechanism. With TanStack's real
`Extract`-over-a-union lookup (`router-core` `RouteById`/`RouteByPath`):

| routes | Extract-based               | generated       |
| ------ | --------------------------- | --------------- |
| 200    | 0.059s / 190 273 inst       | 0.007s / 1 600  |
| 800    | 0.956s / 2 674 897          | 0.079s / 6 400  |
| 2000   | 6.51s / 16 279 583          | 0.484s / 16 000 |
| 5000   | **44.9s + 22 949 × TS2859** | 3.01s / 40 000  |

At 5000 routes the type-level arm does not get slow, it **stops checking**. Instantiations are
quadratic against linear. Generated wins 8–15x. §3.1's wording ("O(routes) instead of O(routes ×
path inference)") is imprecise, and its substance is correct. Recorded as a withdrawal of a
withdrawal, which is §0.4's pattern.

## D6 — `<Link to>` as BARQ013, at warning _(unchanged, one cost added)_

`bind.rs:821` is the template; the `Diag` → `pos` → Rollup code-frame channel is finished.
`docs/README.md:30` requires a new code to ship at warning or below, so BARQ013 is a warning
raisable via `checks`. Obligations: the docs page, the index row, the `reachable` map entry.

Added cost (W6): `TransformOptions` is per-transform, so adding a route file does not
re-transform cached modules holding `<Link to>`. Diagnostics are stale until the plugin
invalidates those modules — the same `moduleGraph.invalidateModule` the server-fn manifest
already does (`start/vite.ts:112-114`).

## D7 — generation in JS _(unchanged, and now the compiler's only job is D6)_

With D4 dropped, the compiler's entire contribution to the router is the `<Link to>` diagnostic.
The route table, the matcher and the types are the Vite plugin's. That is smaller than the brief
sold and matches DESIGN-START §5's own conclusion.

## D8 — route→action binding: identity at boot, not source at build

**v1's build-time half is dead.** `grep -rn middleware packages/compiler-rs/src` → zero hits, and
the chains are runtime expressions (`.middleware([m])`, `.middleware([...chain])`,
`.middleware(chain.filter(Boolean))`). `Middleware` is an anonymous closure with no build-visible
identity. No pass can decide "carries R's chain" from source.

**What survives, and it is better.** `serverRpc` attaches `built` to the function object
(`index.ts:194`), so `fn.built.middleware` is the real array of closures. The check is reference
identity, which resolves all four shapes above correctly and needs no compiler work and no AST
guessing:

- the build computes `route → {reachable server-fn ids}` from the client module graph — a
  module-graph fact;
- for each route R and each id reachable from R, `REGISTRY.get(id).built.middleware` must contain
  every element of R's declared chain;
- run in the ssr environment through `environment.runner.import`, which `start/vite.ts:176-180`
  already does, so it can fail the build and not only the boot.

**Dev divergence, stated (K4b).** The dev client graph is one level deep until each module is
itself requested, so a whole-graph walk in dev finds nothing. The manifest is therefore a
`vite build` artefact, and dev performs the same assertion lazily per request instead of arming a
404 gate against a manifest dev never produced.

**Over-restriction is per-MODULE, not per-function (W2).** The synthesized stub declares every
export regardless of what the importer uses, and Rollup exposes `importedIds`, not imported
bindings. So a `.data.ts` holding several loaders makes every route touching it "reach" all of
them, and `export *` barrels are worse. Stated as a limit rather than papered over; the mitigation
is that the chain is per-function and authored, so the union is what the author already wrote.

Redispatch stays rejected, and the reason is this repo's own (`server.ts:180-193`): a
client-supplied route selecting a middleware chain lets the caller pick the weakest chain that
reaches the action.

## D9 — SSR and streaming _(revised around P-B, P-C and W5)_

Loaders are keyed `computed`s with an explicit key `r:<routeId>|<paramsHash>`, never the
positional auto-key. Confirmed: an explicit key skips slot reservation, is used verbatim as an
object key, and round-trips through the seed on a streamed page.

Confirmed and stronger than v1 stated: with no `Loading` boundary, a streamed page does not merely
fail to seed — the render is broken. Probed output was `<div><threw NotReadyError></div>`, no
channel, no seed. So the router emits one `Loading` per route depth by construction.

Three things v1 did not say, all blocking-ish:

- **Status must be decided before the shell flushes.** No SSR entry point carries a status:
  `renderToString`, `renderToStringAsync`, `renderPage(fn,{nonce})` and
  `renderToStream(fn,{signal,nonce,timeout})` all return markup only. `renderToStream` emits the
  shell synchronously, so a `notFound()` from a loader lands after the headers and the only
  in-band failure is `controller.error`, which tears the body. The router must resolve status
  (match/404, and any middleware `Response`) **before** calling the render.
- **No `<head>`, no title, no document.** `renderPage` returns body markup; `Portal` writes
  nothing on the server (`ssr.ts:947-967`) so it is not an escape hatch; `start/src/vite.ts` has
  no `transformIndexHtml` and no page middleware, and `serveBarq`/`createFetchHandler`/
  `renderToStream` have zero non-test call sites in the repo. The router owns the document
  shell, and it is the first caller of the SSR page path at all.
- **The streaming backstop is not depth-aware.** `setTimeout(end, deadline + STREAM_GRACE)` is
  armed once at entry (`server.ts:348-351`) while each boundary's deadline runs from when it
  parked. A 6-deep chain at 250 ms/level with `timeout: 300` died at 1301 ms with level 5 stuck on
  its fallback. "One `Loading` per route depth" makes depth a cost against a constant budget, so
  either the budget scales with depth or the router flattens.

Also: `hydrate` reports a mismatch at `"warning"` and recovers by a full cold re-render, which
for server-matched-A/client-matched-B discards the document and misses every route-B seed. The
router must say what it does with `hydrate.report.recovered`.

## D10 — navigation and history _(corrected by W3)_

v1 named the wrong lines for the `base` bug. `go` → `push` is correct: `initial()` strips base,
`resolvePath` is base-relative, `push` prepends. The real double-prefix is the document-click
interceptor, which passes the raw `href` attribute, so `<a href="/app/users">` under `base:"/app"`
navigates to `/app/app/users`. Separately `memoryHistory` never strips base, so under SSR the
matcher sees `/app/users` and misses every route. Both are on the delete list anyway; they are
recorded so the new implementation does not reproduce them.

Navigation re-arm needs no transition API: `Loading` takes `on`, and `on={() => location().pathname}`
puts the fallback back on navigation while build-before-teardown keeps stale content until the
new instance is ready.

Open: an action that redirects. `fetch` follows a 303 transparently so the router never sees the
`Location`. Proposed: a branded `redirect(to)` carried over the wire. The no-JS path already works.

## D11 — the old router is DELETED, and what has no corpus to port

`packages/extra/src/router.ts` and its test file are removed once this package replaces them;
`packages/extra` keeps `query.ts` and `hooks.ts`. The old corpus is a behavioural reference read
out of git history, not a file that survives.

It has **zero** tests for `browserHistory`, popstate, prefetch, scroll
restoration and view transitions — `MemoryRouter` appears 69 times and those five appear 0 times
each. And since `memoryHistory.push`/`watch` are no-ops, the corpus validates navigation against
a history that records nothing. Those areas are new work, not ports.

---

## Order

All done, in this order:

1. ~~P-A, P-B, P-C~~ — `3c379a4`, `8a3f730`, `38eee03`.
2. ~~Path, matcher, history~~ — `34a5f7d`.
3. ~~Components, loaders as keyed cells, guards, links~~ — `4699610`.
4. ~~The repo-wide `exports`/`tsdown` fix~~ — `12c04ff`. Not planned; `@barqjs/start` had no
   tsdown config at all, so its subpaths were never built and the router could not import them.
5. ~~SSR: status before the shell, the request ambient, the string-backend walk~~ — `4440abd`.
6. ~~`lazy()` in core~~ — `4e9660b`.
7. ~~The file-based generator and the Vite plugin~~ — `c64fcff`, then moved into the compiler at
   `e441950` along with BARQ013.
8. ~~The route-action manifest~~ — `83c81d4`.
9. ~~Delete the old router, migrate kitchen-sink~~ — `56ecd63`.

**What is NOT built**, stated rather than left to be discovered: route-chunk preloading (`lazy()`
exists, the `<link rel=modulepreload>` that shortens its first paint does not), the plugin wiring
that computes reachability from a real Rollup graph in `buildEnd` (the walk and the verifier exist
and are tested; nothing calls them from a build yet), prefetch, scroll restoration and view
transitions.

---

# Falsified, and why each stays dead

The DESIGN-START.md §1 model: recorded so they are not relitigated.

| Claim                                                                                                                         | Where it was made            | Killed by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The route tree is "generated in Rust" from the filesystem                                                                     | DESIGN-ROUTER §3.1           | The crate does ZERO filesystem reads outside `build.rs` and `#[cfg(test)]` — audited every `std::fs`/`read_dir` site; `walkdir` is not a dependency. All three napi entries are synchronous, and there is no `.d.ts` emitter (`index.d.ts` is a `napi build` artefact). A Rust `read_dir` would be a second source of truth about disk that Vite's watcher does not invalidate. Discovery belongs where `addWatchFile` and `moduleGraph.invalidateModule` are — the plugin, template at `packages/start/src/vite.ts:103-115`.                                              |
| Generated interfaces make tsc's cost "O(routes) instead of O(routes x path inference)"                                        | DESIGN-ROUTER §3.1           | MEASURED, both directions wrong. Instantiations are ~120/route inferred and exactly 8/route generated — both LINEAR, a 15x constant not a complexity class. On the clock, generated wins 1.4x at 200 routes (0.007s vs 0.010s), ties at 800, and LOSES 1.15x at 2000 and 1.32x at 5000. Same shape on TypeScript 5.9.3 and 7.0.2, so it is not a TS 7 artefact. Zero type errors, three trials, `--extendedDiagnostics`. The justification for generating types is CAPABILITY — `loaderData` per route id is not derivable from a path string at any speed — not tsc cost. |
| "Static hrefs can be constant-folded"                                                                                         | DESIGN-ROUTER §3.3           | Probed. `<Link to="/users/1">` emits `Link(_s$, { to: _k$1 })` with `_k$1 = () => "/users/1"`. A component root is `Root::Verbatim` (`ir/module.rs:95-97`) so it has no skeleton for a value to migrate into, and `fold::run` rewrites only `Op::SetOnce`/`Op::Insert` on units (`fold.rs:19-23`). Folding needs a Link-INLINING lowering rule — special-casing a non-`@barqjs/core` component in lowering, for which the crate has no precedent. Dropped.                                                                                                                 |
| "`reserveChildSlot` keys per owner — read DESIGN-START §1's row on address-keyed seeds before touching it" reads as a warning | DESIGN-ROUTER §4             | That row is a DEFENCE of the current scheme, not a warning against it: an address is per call-site and identical for all 100 rows of a `For`, while the owner-slot scheme gives 100 distinct seeds. A router touches none of it — it passes `{ key }`, which skips slot reservation entirely (`signals.ts:2219-2224`).                                                                                                                                                                                                                                                     |
| "the identity-gated re-render the router hand-rolls in ten lines at `router.tsx:1576`"                                        | compiler-rs/CODESIGN.md §3.4 | Stale. That code was deleted in `35be05c`. Its current equivalent is `renderDepth`'s `key = () => errorAt() ?? routeAt()` handed to core's `branch` (`packages/extra/src/router.ts:960`, `:999`) — the primitive already does the gate. The correction worth carrying is that `data` was in the old key and is deliberately out of the new one.                                                                                                                                                                                                                            |
| The ten control-flow constructs include `Fragment`, and `Switch`/`Match` count as one                                         | DESIGN-ROUTER §5             | The authoritative ten is the compiler's `Flow` enum (`packages/compiler-rs/src/ir/symbols.rs:230-243`): `For, Repeat, Show, Switch, Match, Loading, Errored, Reveal, Portal, Dynamic`. `Fragment` is not in it — it is JSX syntax and a three-line array wrapper (`components.ts:186-190`). "Do not add an eleventh" means an eleventh `Flow` variant.                                                                                                                                                                                                                     |
| "`packages/core/CODESIGN.md` §3.2"                                                                                            | DESIGN-ROUTER §5             | No such file. `CODESIGN.md` and `SEMANTICS.md` are both under `packages/compiler-rs/`. The `(scope, props)` rule is real; the path is not.                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Survived, and is stronger than the brief claimed

**`<Link to>` checked at compile time.** `bind.rs:821-850` (`cell_slot_evidence`) already
resolves a component callee to a `SymbolId` and walks named attributes with spans, and
`Diag` -> `analysis_diagnostics` -> `pos` -> Rollup's code frame is a finished channel. Three
real costs, each verified: the route set must arrive as a new `TransformOptions` field (and
every field must be in `OPTION_KEYS` or `options_keys_cover_every_field` fails); the check must
escape `options.diagnostics`'s `dev` default to run in CI; `docs/README.md` requires a new code
to ship at warning or below. Next code is BARQ013 — 006 and 007 are tombstones and are never
reused.

## Found, unrelated to the router, pre-existing — and it is armed, not theoretical

Every `@barqjs/*` `package.json` `exports` map points at `./dist/x.js` and `./dist/x.d.ts`;
`tsdown` 0.22.14 emits `.mjs` and `.d.mts`, and there is no `outExtension` or `publishConfig`
anywhere (grepped). Separately, `packages/start` has no `tsdown.config.ts` at all, so its
`./server`, `./vite` and `./serve` subpaths are never built — the trap DESIGN-ROUTER §5 warns
about, already sprung.

**`bun run build` in `packages/server` breaks `bun run ci`, and I set it off.** `packages/server/dist`
held `codec.d.ts` and `index.d.ts` from an older tsdown. `tsdown.config.ts` sets `clean: true`
on the first entry, so a rebuild deletes them and writes `codec.d.mts` / `index.d.mts` — names
the `exports` map does not name. Type-aware lint then resolves `@barqjs/server/codec` to
nothing, `decodeWire<Error>` comes back **error typed**, and `packages/start/src/server.test.ts:161`
raises `no-unsafe-argument`, which `--deny-warnings` turns into a failed gate.

So the green baseline depends on a stale build artefact that any `build` destroys. Recovery
here was to rebuild and copy each `x.mjs`/`x.d.mts` to `x.js`/`x.d.ts`; the real fix is
`outExtension` in each `tsdown.config.ts` (or `.mjs`/`.d.mts` in each `exports` map), plus a
`tsdown.config.ts` for `packages/start`. Needs a decision before `@barqjs/router` declares
subpaths of its own, because it would inherit both.

**Operational, and it cost a confusing gate run:** `bun run ci` lints and format-checks
`packages/{core,server,start,extra,testing}` RECURSIVELY. Any scratch or probe file left inside
one of those directories fails the gate on formatting or on a type-aware warning. Probes belong
in `packages/compiler-rs/scratch/` (not in the lint list) or in the repo-root `scratch/`.

---

# Measured for the router design, before any of it was committed to

§0.7's two obligations are honoured per section: the instrument beside every number, and what
the instrument cannot decide said in the same breath.

---

## M1 — the matcher. Tier 1, PROVISIONAL.

**Instrument.** `packages/benchmark/src/matcher-head-to-head.ts`. Bun 1.4.0-canary.1,
`stats.paired`, 41 trials x 2000 iterations, warmup 20 000, order alternated per trial,
Wilcoxon signed-rank on the paired differences. Comparand is `@barqjs/extra`'s shipped
`matchRoutes` — a `RegExp` per route in a `Map`, scanned linearly. Contender is a hand-written
prototype of the generated shape: switch on segment count, then a switch per literal position,
params popped positionally. **Before either is timed the two must agree on every path in the
table and on the params extracted** — a faster matcher that answers differently is not one.
Table is flat, four segments, two of them params, first segments deliberately colliding 37-way.

ns/op, median of 41:

| table | case      | scan    | switch    | ratio     | p      |
| ----- | --------- | ------- | --------- | --------- | ------ |
| 25    | first-hit | 43.3    | 34.3      | 1.26x     | 5.1e-6 |
| 25    | last-hit  | 290.7   | 47.8      | 6.09x     | 2.5e-8 |
| 25    | miss      | 268.5   | 27.2      | 9.87x     | 2.5e-8 |
| 200   | first-hit | 42.6    | 35.8      | 1.19x     | 5.0e-2 |
| 200   | last-hit  | 3331.5  | 67.0      | 49.7x     | 2.5e-8 |
| 200   | miss      | 3652.8  | 28.6      | 128x      | 2.5e-8 |
| 1000  | first-hit | 45.8    | **136.3** | **0.34x** | 5.3e-5 |
| 1000  | last-hit  | 33413.2 | 56.0      | 597x      | 2.5e-8 |
| 1000  | miss      | 33981.5 | 35.5      | 956x      | 2.5e-8 |

The scan's first-hit is ~42 ns at every table size and its cost is linear in the matched
route's POSITION. This independently reproduces the 45 ns / 3 966 ns baseline measured
separately on a different table shape.

**The one row the contender loses, and it is not warmup.** At 1000 routes the switch's
first-hit median is 136 ns against the scan's 46. Raising warmup from 500 to 20 000 — a 40x
increase — did not move it (136.3 both times, p 1.2e-4 then 5.3e-5), so the first explanation
was wrong. Measured ALONE, in `src/matcher-probe.ts` with 20 000 warmup and 200 000 iterations,
the same function answers the same path in **83.5 ns**. The perturbation is the pairing itself:
`stats.paired` interleaves the two sides to make thermal and GC drift land on both equally, and
that is not the same as protecting one side's JIT state from the other's when the two differ in
code size by three orders of magnitude. Recorded because the next person to pair a 64 kB
generated function against a 60-line one will otherwise re-derive it.

**The cost that actually decides the design, and it is not the clock.** The generated source is
**16 413 bytes at 200 routes and 76 413 bytes at 1000** — 76-82 bytes of JavaScript per route,
unminified and before gzip (a compacter emitter measured 64 249 at 1000, so formatting moves it
about 15%). Tens of kB of matcher shipped to a browser is not payable. So the shape is
per-side: generate the switch for the SERVER, where it is never downloaded and where the win is
largest, and ship the client a compact table plus a small interpreting loop. That is a decision
the measurement made, not one the design brought to it.

**CANNOT DECIDE.** A Bun microbenchmark bounds per-call CPU on a synthetic flat table. It says
nothing about a table with splats, optional segments, nesting or specificity ranking — the
prototype implements none of those and a real generated matcher handling them will be larger and
slower. It cannot see icache behaviour under a real server's working set. Per §0.7 this is
Tier 1 and PROVISIONAL: it needs an entry in `src/tier2/claims.ts` with its own `cannot`, and
the matcher is CPU-only so it needs its own Tier-2 shape rather than a js-framework-benchmark
row, where the `js` column is ~96% DOM.

## M2 — the denominator, without which M1 decides nothing

**Instrument.** `packages/benchmark/src/matcher-denominator.ts`. Same machine and process
shape; the page is compiled by the real compiler with `ssr: true`, with `serverSource` and
`moduleSource` pointed at this repo's sources.

|                                        | min   | median     |
| -------------------------------------- | ----- | ---------- |
| `renderToString`, compiled 20-row page | 650.6 | **1199.6** |
| `renderToString` envelope only         | 215.7 | 250.2      |
| `new URL(request.url)`                 | 43.8  | 56.1       |

So on a server request, at 200 routes, the shipped linear scan's last-hit costs **2.8x an
entire 20-row page render** and 59x the `new URL` every request already pays. At 1000 routes it
is 28x a page render. Averaged over a uniform route distribution it is about half that and still
larger than the render.

This is the answer to the question D4 was reframed to ask, and it goes the other way from the
worry that prompted it: the matcher is not a rounding error on the server. On a CLIENT
navigation it still is — 3.3 µs against a network fetch — and the design must not claim
otherwise.

**CANNOT DECIDE.** A 20-row page is small; a 100-row page render is several times this and
would shrink every ratio above proportionally. The envelope row shows how much of the 1 199 ns
is fixed cost rather than page size, which is what stops the ratio being quoted as if it scaled.

**Found while measuring, pre-existing:** `src/ssr-head-to-head.ts` does not run. It fails with
`Cannot find module '@barqjs/server'` — the P0.5 split moved the string backend out of core and
`packages/benchmark` was never given the dependency. `TODO.md` already says the benchmark
harness needs a run before it is trusted; this is one of the things that run would find.

## M3 — route types: generated interfaces vs type-level path parsing

**Instrument.** `tsc --noEmit --extendedDiagnostics`, `strict`, `skipLibCheck`, one file per
case, three trials, **zero type errors in every case** (an earlier round reported 1 800 and was
discarded). Two compilers. Comparand is a type-level parser — `Split` / `ParamName` /
`ParamsOf` over the path plus a relative-`to` resolver forced across the whole path union —
against one plain interface per route. Both sides typecheck the same N `link({to, params,
search})` call sites.

TypeScript 7.0.2, check time (median of 3) / instantiations:

| routes | inferred         | generated       |
| ------ | ---------------- | --------------- |
| 200    | 0.010s / 25 078  | 0.007s / 1 600  |
| 800    | 0.080s / 94 102  | 0.080s / 6 400  |
| 2000   | 0.423s / 227 588 | 0.488s / 16 000 |
| 5000   | 2.349s / 559 315 | 3.103s / 40 000 |

TypeScript 5.9.3, same cases: 0.08 / 0.05 at 200, 0.26 / 0.23 at 800, 0.98 / 1.10 at 2000.
Same crossover, so this is not an artefact of the Go port.

**Reading.** Instantiations are ~120 per route inferred and exactly 8 per route generated —
both LINEAR. DESIGN-ROUTER §3.1's "O(routes) instead of O(routes x path inference)" describes a
15x constant as a complexity class, and it is wrong in that framing. On the clock the generated
shape wins 1.4x at 200 routes (0.007s against 0.010s, which is not a reason to build anything),
ties at 800, and LOSES 1.15x at 2000 and 1.32x at 5000.

**CANNOT DECIDE.** Batch `tsc` is not the language service, and the language service is what
TanStack's users actually complain about; instantiation count plausibly matters more there,
where the budget is per-keystroke. My parser is also simpler than TanStack's shipped one. So
this measurement kills the stated justification without settling the editor question, and the
design says so rather than borrowing authority from a column that never had any.
