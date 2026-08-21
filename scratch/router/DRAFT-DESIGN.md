# @barqjs/router — draft design (for adversarial review)

Status: DRAFT. Every claim below either carries file:line evidence or is marked UNVERIFIED.

## Verified baselines (this session, at 1991691)
cargo 318 / compiler-rs bun 3483 (+1 known non-failure error) / core 914 / server 90 /
start 36 / extra 153 / testing 16 / compiler 22 / `bun run ci` EXIT=0.

## D1 — a loader IS a server function

`createServerFn().middleware([...]).validator(schema).handler(fn)`.

Forced consequence: BARQ012 refuses a module mixing server functions with anything else
(`compile.rs:358-377`), so a loader cannot live in the route file beside its component.
Route file exports the component; a sibling `.data.ts` exports only loaders. This is
SvelteKit's `+page.server.ts` split, obtained from content rather than filename.

Why: on the client the loader import resolves to `clientRpc(id)` — one line, no body, no
transitive imports (probed: a client compile of a route keeps `import { getUser } from "./users.ts"`
and that module is replaced wholesale). On the server it is the real function. Isomorphism
costs nothing new.

Fail-closed input applies unchanged: a loader taking `{params, search}` MUST declare
`.validator(schema)`. That is where search-param validation lands — the loader's validator IS
the schema. No second validation surface, no new interface (`StandardSchema` at
`packages/start/src/index.ts:43-54`).

Route-scoped middleware is array concatenation at author time:
`.middleware([...requireUser, ...ownFn])`. Needs no runtime change; `Middleware` is
`(next) => Promise<unknown>` (`index.ts:115`) and `built.middleware` is read per call
(`index.ts:190`).

REJECTED: loader as a plain function that calls server fns. It ships the loader body to the
client, gives N fetches with nowhere to attach a chain, and binds no auth to the data fetch.

OPEN: N nested loaders = N parallel fetches on client navigation. v1 does that
(`Promise.allSettled`, as `extra` already does at `router.ts:570-592`). A batch endpoint is a
measured follow-up; the measurement that decides it is server-side auth cost per navigation.

## D2 — code-based core, file-based generator emits code-based routes

`route({path, component, loader})` + `createRouter({routes})` works with no build step.
The Vite plugin discovers files and emits `virtual:barq-routes` containing code-based
definitions. Precedent in this repo: `@barqjs/start`'s contract (P3) shipped BEFORE the
compiler emitted into it (P2).

## D3 — `lazy()` goes in core; the router owns preload

Verified: no `lazy` identifier anywhere in `packages/core/src`. The ride already exists —
a `computed` returning a Promise is the async primitive (`signals.ts:2690-2696`); an effect
throwing `NotReadyError` registers with the nearest loading boundary
(`signals.ts:1599-1611`, `registerWithBoundary` at `:1471-1484`); a suspended body is retried
TRACKED (`flow.ts:512-528`); `Errored` re-throws `NotReadyError` (`flow.ts:1020`).
So `lazy()` is ~10 lines over `computed`, and it belongs in core because every mechanism it
rides is private to `signals.ts`.

NAMED GAP: hydration has no notion of a module not yet present — `MismatchKind` is
`"structure"|"range"|"key"|"text"|"portal"|"not-hydratable"` (`hydration.ts:57`), and there is
no asset manifest anywhere. Without a preload channel every code-split route flashes its
`Loading` fallback on first hydration. The router owns that: modulepreload links for the
matched chain's chunks, emitted into the SSR shell.

## D4 — the matcher: compiled, measured before committed

BASELINE MEASURED (Bun 1.4, 200 flat routes `/rN/:a/:b`, cache warm):
first route hits 45 ns; last route hits 3,966 ns. `compilePath` builds a RegExp per route into
a `Map` (`router.ts:220-264`); `matchRoutes` scans linearly (`:305-334`).

Design: segment-count switch, then per-position literal switch, params popped positionally.
No regex, no allocation on a miss.

DELIBERATE BEHAVIOUR CHANGE: `extra` has NO specificity ranking — first declaration wins, so
`/users/:id` declared before `/users/new` makes `/users/new` unreachable (verified). The new
matcher ranks static > param > splat. Corpus cases that depend on declaration order must be
adjusted, and the divergence recorded.

TWO BASELINE BUGS NOT TO PORT: `paramNames` is pushed in pass order not positional order, so
`/a/:id/b/:rest*` returns the two names swapped; and `compilePath("/c++")` throws
`SyntaxError` because `*`, `+`, `?` are excluded from the escape class (`:232`).

## D5 — route types generated, justified on CAPABILITY not on tsc cost

DESIGN-ROUTER §3.1 claims generated interfaces make "tsc's cost O(routes) instead of
O(routes x path inference)". MEASURED, AND FALSE.

Instrument: `tsc --noEmit --extendedDiagnostics`, strict, skipLibCheck, one file, three trials,
zero type errors, two compilers. Comparand: a type-level path parser (`Split`/`ParamName`/
`ParamsOf` + a relative-`to` resolver over the path union) against one plain interface per route.

TypeScript 7.0.2 (check time, median of 3 / instantiations):
| routes | inferred | generated |
|---|---|---|
| 200  | 0.010s / 25,078  | 0.007s / 1,600 |
| 800  | 0.080s / 94,102  | 0.080s / 6,400 |
| 2000 | 0.423s / 227,588 | 0.488s / 16,000 |
| 5000 | 2.349s / 559,315 | 3.103s / 40,000 |

TypeScript 5.9.3, same cases: 0.08/0.05 at 200, 0.26/0.23 at 800, 0.98/1.10 at 2000. Same
shape, so this is not a TS 7 artefact.

Reading: instantiations are ~120 per route inferred and exactly 8 per route generated — both
LINEAR in route count. It is a 15x constant, not a complexity class, and the framing
"O(routes) instead of O(routes x path inference)" is wrong. On the clock, generated wins 1.4x
at 200 routes (0.007s vs 0.010s — not a reason to build anything), ties at 800, and LOSES
1.15x at 2000 and 1.32x at 5000.

CANNOT DECIDE: batch `tsc` is not the language service, which is what TanStack's users
complain about, and my parser is simpler than TanStack's shipped one.

What generation actually buys, and type-level parsing cannot at any speed: `loaderData` typed
per route id (a loader's return type is not derivable from a path string), the materialised
route table the `<Link to>` check needs, and search-schema output types. Same shape as
CODESIGN §3.5's "justified on capability, not speed".

## D6 — `<Link to>` checked at compile time: BARQ013, at warning

Template exists: `bind.rs:821-850` (`cell_slot_evidence`) already resolves a component callee
to a `SymbolId` and walks named attributes with spans. `Diag` -> `analysis_diagnostics`
(`compile.rs:838`) -> `pos` -> Rollup's code frame (`packages/compiler/src/vite.ts:490-492`)
is a finished channel.

Costs, each verified: the route set must arrive as a new `TransformOptions` field, and every
field must be in `OPTION_KEYS` or `options_keys_cover_every_field` fails (`options.rs:401-452`).
`bind`'s rules are gated on `options.diagnostics`, which defaults to `dev` (`options.rs:381`) —
a check that must run in CI needs `diagnostics: true` or the ungated path BARQ012 took.
Obligations: `docs/BARQ013.md`, a row in `docs/README.md`, an entry in
`test/diagnostics.test.ts`'s `reachable` map; two Rust tests and two bun tests enforce them.
006/007 are burned tombstones, so the next code is 013.

FALSIFIED AND DROPPED: "static hrefs can be constant-folded". Probed —
`<Link to="/users/1">` emits `Link(_s$, { to: _k$1 })` with `_k$1 = () => "/users/1"`.
A component root is `Root::Verbatim` (`ir/module.rs:95-97`) with no skeleton, and `fold::run`
rewrites only `Op::SetOnce`/`Op::Insert` on units (`fold.rs:19-23`). Folding would need a
Link-inlining lowering rule — special-casing a non-core component in lowering, for which the
crate has no precedent.

## D7 — the route tree is generated in JS, not in Rust

DESIGN-ROUTER §3.1 says "generated in Rust". FALSIFIED as stated. The crate performs ZERO
filesystem reads outside `build.rs` and `#[cfg(test)]` (audited: `std::fs` appears only at
`build.rs:31-42`, `tables.rs:140` (test), `ownership.rs:1088` (test), `codegen/ssr.rs:1834`
(test), `passes/mod.rs:208` (test), `compile.rs:1207+` (test)). `walkdir` is not a dependency.
All three napi entries are synchronous. There is no `.d.ts` emitter — `index.d.ts` is a
`napi build` artefact.

A Rust `read_dir` would be a second source of truth about disk that Vite's watcher does not
invalidate. So: the Vite plugin discovers files (it owns `addWatchFile` and the graph
invalidation, template at `start/vite.ts:103-115`), computes the route table, emits the
generated module and the `.d.ts`, and passes the table to Rust as an option for D6 only.

The compiler's contribution to the router is therefore exactly ONE thing: the `<Link to>`
diagnostic. Everything else is the plugin and the runtime. That is smaller than §3 sold and
matches DESIGN-START §5's own conclusion: "the compiler is a gate and a manifest generator,
not a prover".

## D8 — the route-action manifest: verified at BUILD time, refused at runtime, never redispatched

The hole (DESIGN-START §6): "A page-level authentication check does not extend to the Server
Actions defined within it."

`@vitejs/plugin-rsc` redispatches a mis-routed action through the owning route's middleware.
Next.js is REMOVING action forwarding (PR #96951) because "the action executes under a
different route and request context".

THE DEEPER REASON REDISPATCH IS WRONG HERE, and it is this repo's own rule: `server.ts:180-193`
says "values derived from the request are fine to navigate to and never fine to authorize
with." A client-supplied route — Referer, header or URL — selecting which middleware chain
runs lets the caller pick the WEAKEST chain that reaches the action. Redispatch is not merely
fragile; as an authorization mechanism it is unsound.

barq's answer, two halves:

BUILD TIME (the real one). From the client module graph, compute `route -> {server-fn ids
reachable}`. Probed and confirmed workable: a client-compiled route module retains its
`import { getUser } from "./users.ts"` edge, and that module is the synthesized stub whose
`clientRpc("server/users.ts#getUser")` ids are literal strings. Then assert: every server
function reachable from route R carries R's middleware chain. A violation is a BUILD ERROR
naming the route, the action, and the missing middleware. Nothing is redispatched because the
chain is already on the function — per-function middleware, which barq already has, is the
right primitive and the survey's frameworks lack it.

Where a function is reachable from two routes, the rule forces the UNION of their chains. That
over-restricts by design; the fix is to split the function, and the build says which chain is
missing.

RUNTIME (cheap narrowing). `handleServerFn` refuses an id no route reaches, with the 404 it
already answers for an unknown id. Needs no client-supplied route, and closes id enumeration
of exported-but-unrouted functions.

HONEST LIMIT: client-graph reachability is not proof about the server; a server-side caller can
invoke any mounted function. That is inside the trust boundary. The check refuses a shape
(CODESIGN §7.1's method); it proves nothing.

## D9 — SSR and streaming

A loader's value is `computed(() => loader(input), { key })` with an EXPLICIT key
`r:<routeId>|<paramsHash>`, never the positional auto-key: "A position is not an identity: if
the client tree diverges from the server's, the ids after the divergence shift, and a read can
claim the value recorded for a DIFFERENT call" (`signals.ts:2202-2207`). A client-side
navigation before hydration is exactly that divergence. `options.key` skips slot reservation
(`signals.ts:2219-2224`) and is used verbatim as an object key, so `r:/users/$id|{id:7}` works.

HARD CONSTRAINT FOUND: `renderToStream` opens the seed channel only `if (parked.length > 0)`
(`packages/server/src/server.ts:425`), and `parked` is filled only by `StreamSink.defer`, called
only from `loadingBoundary` when a `Loading` boundary is unready (`ssr.ts:942-943`). So a
streamed page seeds NOTHING unless route content is inside a `Loading` boundary. The router
emits one per route depth by construction rather than leaving it to the author.

SECURITY-RELEVANT INVARIANT: a promise entering `inFlight` outside an async session lands in
the `null` bucket, and `getHydrationData(session)` merges `null` into EVERY session
(`signals.ts:3030-3033`). A router that starts loaders before entering the render leaks one
request's data into another request's seed. Rule: loaders start INSIDE the render. Needs a
test that interleaves two renders.

`renderPage` renders `fn()` a second time in string mode (`server.ts:128-147`), so the router's
page function must be idempotent.

## D10 — navigation, history, the request seam

`serveBarq({fetch})` runs the page handler AFTER `handleServerFn` (`serve.ts:44-45`). For D8's
runtime half the router must either wrap `createFetchHandler` or `@barqjs/start` must grow one
option. PROPOSED: `HandlerOptions.reachable?: (id: string) => boolean`. Small, keeps the
ordering invariant in one place, and is a change to `start` that needs sign-off.

History ported from `extra` with two fixes: `browserHistory.push` double-prefixes `base`
(`go` pushes the pre-strip path at `:728/:762`, `push` prepends `base` again at `:829`), and
`memoryHistory.push`/`watch` are no-ops (`:880-881`) so `MemoryRouter` has no history at all.

Navigation re-arm needs no transition API: `Loading` takes `on`, and when `on()` changes while
work is pending it puts the fallback back (`flow.ts:1163-1171`). `on={() => location().pathname}`
is the whole feature. Build-before-teardown (`flow.ts:1146-1150`) gives stale-while-navigating
for free.

OPEN: an action that redirects. `fetch` follows a 303 transparently, so the router never sees
the Location. Proposed: a `redirect(to)` helper throwing a branded value carried over the wire,
which the router's navigation layer acts on. The no-JS path already works via `seeOther`.

## D11 — what changes from `extra`, beyond the matcher

Ported: the `(scope, props)` shapes, `children`-as-Block layouts, guards, `resolvePath`,
scroll restoration, view transitions, prefetch, the history abstraction.
NOT ported: `defineRoute`/`defineRoutes` (deprecated identity functions).
Fixed: prefetch poisons a path permanently on a miss (`:789-790`), always prefetches with an
EMPTY search while the cache key includes the search (`:796` vs `:529`), and constructs an
`IntersectionObserver` for every link regardless of strategy (`:1065-1078`).
NOT PORTABLE — the corpus has ZERO tests for scroll restoration, view transitions, prefetch,
`Router`/`browserHistory`/popstate/document-click interception. Those must be written new.

## Measurement plan
Tier 1: `packages/benchmark/src/matcher-head-to-head.ts` over `stats.paired` + `wilcoxon`
(`stats.ts:53`, `:144`); comparand `extra`'s `matchRoutes`; cases 25/200/1000 routes x
{first-hit, last-hit, miss, nested-3-deep}. Tier 2: a `Claim` in `src/tier2/claims.ts` with its
`cannot` field; the matcher is CPU-only so it needs its own shape, not a jfb row.
D5 is already measured and falsified.

## Decisions needing sign-off
1. D1 forces the loader/component file split. Accept?
2. v1 ships N parallel loader fetches, no batch endpoint. Accept?
3. D10 adds one option to `@barqjs/start`'s `HandlerOptions`. Accept?
4. D3 puts `lazy()` in `@barqjs/core`. Accept?

---

## Found while designing, not part of the router: every package's `exports` map is wrong

`tsdown` 0.22.14 emits `.mjs` and `.d.mts`; every `@barqjs/*` `package.json` declares
`./dist/x.js` and `./dist/x.d.ts`. No `outExtension`, no `publishConfig` anywhere
(grepped). Verified by building:

```
packages/start   emits dist/index.mjs, index.d.mts   declares ./dist/index.js, ./dist/index.d.ts
packages/server  emits dist/{index,codec}.mjs        declares ./dist/{index,codec}.js
```

Invisible in-repo because every workspace resolution goes through the `bun` condition to
`src/`. A published package resolves to nothing.

Second, separate: **`packages/start` has no `tsdown.config.ts` at all**, so `tsdown` builds
only `src/index.ts` and the `./server`, `./vite` and `./serve` subpaths are never emitted.
That is exactly the trap DESIGN-ROUTER §5 names, already sprung.

Both are pre-existing and outside the router's scope. The router will declare subpaths and
would inherit both, so they need a decision before `@barqjs/router` ships.

## D8 fallback, if the build cannot read a middleware chain from source

`serverRpc` attaches `built` to the function object (`packages/start/src/index.ts:196`), so
`fn.built.middleware` is a live array of the actual closures on the SERVER half. So the check
need not read source at all:

- the build computes `route -> {reachable server-fn ids}` from the client module graph
  (a module-graph fact, no AST);
- the check compares by OBJECT IDENTITY — for each route R and each id reachable from R,
  `REGISTRY.get(id).built.middleware` must contain every element of R's declared chain;
- it runs in the ssr environment through `environment.runner.import`, which
  `start/vite.ts:176-180` already does, so it can fail the BUILD and not only the boot.

Identity beats AST inspection: no guessing about spreads, computed arguments or imported
identifiers, and nothing to refuse. The compiler stays out of it entirely.

## D4, reframed before it is measured — the denominator, not the number

§0.7 obligation 1 is "state the instrument beside every number", and most of the corrections
that section records are corrections to a DENOMINATOR. So state D4's before measuring it.

On a CLIENT navigation the matcher runs once and is followed by a loader fetch. At the
measured worst case (3,966 ns, last of 200) it is ~0.004% of a 100 ms navigation. There is no
client-side latency argument for a compiled matcher and the design should not make one.

On the SERVER it runs once per request with no network in the path, so it competes against
`renderToString` rather than against a fetch. That is the only place the number can matter,
and it makes the question: **what fraction of a small page's server render is matching?**
If it is under ~1%, the compiled matcher is not worth the generator and a runtime-built trie
is the right answer — which would be a Tier-1 measurement killing a Tier-1 proposal, the
outcome §0.7 exists to make possible.

So the benchmark is: matches/sec against `extra`'s `matchRoutes` (comparand, exported from
`@barqjs/extra`), AND the same match against the cost of `renderToString` on the corpus's
100-row page, so the ratio is reported rather than the raw number.
