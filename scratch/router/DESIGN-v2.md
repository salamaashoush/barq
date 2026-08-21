# @barqjs/router — design, after adversarial review

Supersedes `DRAFT-DESIGN.md`. Every change from v1 is because a probe disagreed with it.
`FALSIFIED.md` holds what died; `MEASUREMENTS.md` holds the numbers and their instruments.

The old router is **deleted**, not kept: `packages/extra/src/router.ts` and `router.test.tsx` go.
`packages/extra` keeps `query.ts` and `hooks.ts`. The 2253-line test file is a behavioural
reference read out of git history, not a file that survives.

---

## Three prerequisites, in `core`/`server`/`compiler-rs`, before any router code

Each is a defect the router would otherwise be built on top of. Each was found by probe.

### P-A — a default-exported or indirectly-exported server function leaks its body to the browser

`analysis/server_fn.rs:107-119` records `export default …` as `server_fn: false` unconditionally,
and `:98-110` records `export { x }` as "other" rather than resolving it. So for

```ts
export default createServerFn().validator("unchecked").handler(async () => store.concat(SECRET));
```

`scan.server_fns()` is empty, therefore `compile.rs:322-325` synthesizes **no client stub**;
`scan.mixed()` is false, therefore **BARQ012 does not fire**; and `namesOf` filters on
`e.serverFn` (`start/vite.ts:76`), therefore **nothing is mounted** and the endpoint 404s.
Verified through a live Vite dev server: the handler body and its `./db` import land in the
client graph, silently.

This is the exact leak DESIGN-START §3.1 claims barq is structurally immune to, reachable by
typing `export default`. Fix: resolve a default or indirect export back through `rooted_at` like
any other, so it either gets a stub and a mount or trips BARQ012. **Security. Blocks D1.**

### P-B — non-streamed SSR returns the fallback and runs every loader twice

`renderPage` renders `fn()` a second time in string mode, and the comment at `server.ts:128-133`
says *"Keyed `computed` results are cached against the session, so nothing is fetched twice."*
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
without consuming it. **Correctness. Blocks every non-streamed route.**

### P-C — the null seed bucket is a cross-render leak with no expiry

`getHydrationData` merges `hydrationData.get(null)` into every session's data
(`signals.ts:3030-3033`), and `clearHydrationData(session)` deletes only that session's bucket
(`:3049-3051`). A promise attributed to `null` — one whose FIRST READ happened outside a render,
which is exactly what prefetch does — is therefore emitted into every subsequent render's seed
for the process's lifetime. Demonstrated: render A's value appears in render B's seed, and
survives `clearHydrationData(B)` into a third render.

The router's rule ("loaders are first-read inside the render") is necessary but is a convention
nothing enforces. **Security.** At minimum the null bucket must be clearable and the rule
covered by a test that interleaves two renders.

---

## D1 — a loader IS a server function *(kept, with K1 as a precondition)*

`createServerFn().middleware([...]).validator(schema).handler(fn)`.

BARQ012 refuses a module mixing server functions with anything else — verified, at `error`,
routed to `this.error()` by `compiler/src/vite.ts:489-490`. So the loader lives in a sibling
`.data.ts` and the route file holds the component. SvelteKit's split, from content rather than
filename.

Verified safe: `export const loader = importedServerFn` and `export { importedServerFn }` in a
route file are **not** mixed — the scan reports no exports at all unless the module imports
`createServerFn`. So a route module may re-export a loader freely.

Verified the payoff: the client graph reachable from a route module is
`{route.tsx, loaders.data.ts, start/index.ts}`. `db.ts` and the middleware module are absent —
the loader's transitive imports really are dropped, because nothing consults the module.

**Revised by K2:** the page handler runs the render inside `withRequest(request, …)`. Measured:
without it an in-process loader whose middleware calls `getRequest()` throws; with it the loader
returns normally and an unauthenticated request is refused with the middleware's own
`Response(401)`, which the page handler returns. One line, and it makes route-scoped auth work
identically on the SSR and the RPC path.

Fail-closed input is unchanged, so a loader taking `{params, search}` must declare
`.validator(schema)` — which is where search-param validation lands, on the existing
`StandardSchema` interface, with no second validation surface.

**Open, and deliberately unmeasured:** N nested loaders are N parallel fetches on a client
navigation. v1 ships that. The measurement that would justify a batch endpoint is server-side
auth cost per navigation, not round-trip count.

## D2 — code-based core, file-based generator emits into it *(unchanged)*

Same order this repo used for `@barqjs/start`: the contract shipped before anything emitted into
it.

## D3 — `lazy()` in core, preload in the router *(unchanged)*

No `lazy` primitive exists in `packages/core/src` — confirmed twice. The ride does: a `computed`
returning a Promise is the async primitive, an effect throwing `NotReadyError` registers with the
nearest loading boundary, a suspended body is retried tracked, and `Errored` re-throws
`NotReadyError`. `lazy()` is ~10 lines over `computed` and belongs where those mechanisms are.

Named gap, unchanged: hydration has no notion of a module not yet present, and there is no asset
manifest, so a code-split route flashes its fallback on first hydration until the router emits
modulepreload for the matched chain.

## D4 — DROPPED. The matcher is a runtime bucketed trie, not generated code.

v1 proposed emitting a segment-count switch. Measured, 200 routes, ns/op:

| | |
|---|---|
| one `matchPath` exec (regex + params) | 14.3 |
| linear scan, last-hit | 3524.6 |
| **bucket by first segment, ~20 lines, same regexes** | **125.0** |
| generated switch | 67.0 |
| bucket, miss / switch, miss | 29.2 / 28.6 |

The scan's cost is 200 iterations, not the regexes — V8 compiles those to native code. A trivial
bucket recovers 28x of the 28.2x available. The generated switch buys **58 ns more** on a
last-hit and **nothing** on a miss, for a generator, a benchmark tier, and 76 kB of emitted
JavaScript at 1000 routes. Against the denominator — a compiled 20-row `renderToString` is
1199.6 ns — that is 4.8% of one page render, and on a client navigation it is a rounding error
against the fetch.

CODESIGN §3.4's own discipline decides it: *"a flag that moves neither an allocation count nor a
wall-clock number on a named benchmark is deleted, not kept."* So the matcher is built at runtime
from the route table, bucketed, with specificity ranking. §3.2 of the brief is withdrawn on
measurement.

## D5 — RESTORED. Generated route types, and the brief was right.

v1 claimed §3.1's tsc argument was false. **My comparand was a strawman**: it gave the "inferred"
arm an O(1) interface index, which is the generated mechanism. With TanStack's real
`Extract`-over-a-union lookup (`router-core` `RouteById`/`RouteByPath`):

| routes | Extract-based | generated |
|---|---|---|
| 200 | 0.059s / 190 273 inst | 0.007s / 1 600 |
| 800 | 0.956s / 2 674 897 | 0.079s / 6 400 |
| 2000 | 6.51s / 16 279 583 | 0.484s / 16 000 |
| 5000 | **44.9s + 22 949 × TS2859** | 3.01s / 40 000 |

At 5000 routes the type-level arm does not get slow, it **stops checking**. Instantiations are
quadratic against linear. Generated wins 8–15x. §3.1's wording ("O(routes) instead of O(routes ×
path inference)") is imprecise, and its substance is correct. Recorded as a withdrawal of a
withdrawal, which is §0.4's pattern.

## D6 — `<Link to>` as BARQ013, at warning *(unchanged, one cost added)*

`bind.rs:821` is the template; the `Diag` → `pos` → Rollup code-frame channel is finished.
`docs/README.md:30` requires a new code to ship at warning or below, so BARQ013 is a warning
raisable via `checks`. Obligations: the docs page, the index row, the `reachable` map entry.

Added cost (W6): `TransformOptions` is per-transform, so adding a route file does not
re-transform cached modules holding `<Link to>`. Diagnostics are stale until the plugin
invalidates those modules — the same `moduleGraph.invalidateModule` the server-fn manifest
already does (`start/vite.ts:112-114`).

## D7 — generation in JS *(unchanged, and now the compiler's only job is D6)*

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

## D9 — SSR and streaming *(revised around P-B, P-C and W5)*

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

## D10 — navigation and history *(corrected by W3)*

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

## D11 — what the new package must write from scratch

The deleted corpus has **zero** tests for `browserHistory`, popstate, prefetch, scroll
restoration and view transitions — `MemoryRouter` appears 69 times and those five appear 0 times
each. And since `memoryHistory.push`/`watch` are no-ops, the corpus validates navigation against
a history that records nothing. Those areas are new work, not ports.

---

## Order

1. P-A, P-B, P-C — three prerequisite commits in `compiler-rs` / `core` / `server`.
2. `@barqjs/router`: history, matcher (bucketed trie, ranked), route table, components, the
   `(scope, props)` shapes, guards.
3. SSR: the page handler inside `withRequest`, the document shell, status-before-shell, `Loading`
   per depth, seed keys.
4. `lazy()` in core, then route-chunk preload in the router.
5. The Vite plugin: file discovery, `virtual:barq-routes`, the `.d.ts`, `applyToEnvironment`.
6. D6 BARQ013.
7. D8 the route→action manifest.
8. Migrate kitchen-sink, delete `packages/extra/src/router.ts` + its test, prune `extra/index.ts`.
