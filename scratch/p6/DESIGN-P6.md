# P6 — parity design. What to build, what to diverge on, and why.

Reads with `FINDINGS.md` beside it: every claim here that is about this codebase has an F-number
there, and every claim about TanStack has a `file:line` into `router-core@1.171.26` /
`start-client-core@1.170.26` / `start-server-core@1.169.30`, vendored and read, not remembered.

The one-line summary: **most of §3.1 is already in `packages/core`, and the parity gap is
smaller than the handover thought — but there are five live bugs under it that have to be fixed
first, and one of them silently drops half the page.**

---

## 0. Prerequisites. Five bugs, in the P-A/P-B/P-C tradition.

Each was found by probe, each is on a shipped path, and each blocks a §3 item.

| # | what | blocks | evidence |
|---|---|---|---|
| **B1** | a search-dependent loader answers with the FIRST search forever | §3.1 | F1 |
| **B2** | `stream:false` with loaders at two depths drops the child's markup AND its seed | §3.4, §3.6 | F6 |
| **B3** | `throw redirect()` from a loader answers **200 with a torn body** on the DEFAULT path | §3.4 | F7 |
| **B4** | the generated `pending` is a `lazy`, activated outside `ssr.ts`'s try/catch | §3.4 | F8 |
| **B5** | the router state is disposed before a streamed page has rendered | §3.1 | F12 |

B1 is the one that decides how §3.1 is framed. `loaderDeps` is not a cache-policy nicety; it is
the fix for a route that renders page 1 when the URL says page 2.

---

## 1. §3.1 — the loader cell. Policy over primitives, not a ported state machine.

### 1.1 What the handover asked for, and what is already built

The handover says TanStack's reload rule "is a real state machine (`createLoaderTask`)" and asks
for one. Three probes say barq does not need to port it, because `packages/core` already has the
mechanism and what is missing is the policy:

| §3.1 bullet | already in core | evidence |
|---|---|---|
| `staleReloadMode: 'background' \| 'blocking'` | `latest(cell)` vs `cell()` | F3 |
| the reload trigger | `refresh(cell)` / `resource.refetch()` | F3, probe-reload Q3/Q4 |
| a shared `AbortController` across preload and navigation | `resource`'s A1 + A2 | F4 |
| a status channel | `resource.state()` → `pending \| ready \| refreshing \| errored` | probe-reload Q4 |

F3's table is the whole of `staleReloadMode`, measured inside a tracked derivation because
`latest()` answers differently outside one (trap 2):

| cell state | `cell()` | `latest(cell)` |
|---|---|---|
| cold | throws → boundary parks → fallback | throws → boundary parks → fallback |
| resolved | value | value |
| **refreshing** | throws → fallback | **previous value, no park** |

So `blocking` and `background` are a choice of READ, and both do the right thing cold. Nothing to
build but the switch.

### 1.2 The cell becomes a `resource` under a detached scope

`dataFor` today mints `computed(async …)` under `runWithOwner(null, …)` and hands the loader an
`AbortController` that **nothing ever aborts** (F4). Replace with `resource`, created inside a
per-entry **detached** `root()` scope the router owns.

Trap 1 says the cell must not be owned by the RENDER, because a boundary parking discards the
scope. It does not say owner-LESS, and owner-less is strictly worse: an owner-less pure computed
is in neither `owner.kids` nor `orphans`, `disposeNode` is not exported, so dropping it from the
Map leaks its dependency links, never runs `_closeAsync`, and leaves an unsettled promise in the
module-global `inFlight` that `settle()` waits on forever (F5). A detached scope is not in its
parent's `kids`, so the boundary cannot take it — and the router CAN dispose it, which aborts the
in-flight request (F4, Q5b). `gcTime` needs exactly that to be honest rather than decorative.

```ts
interface Entry {
  readonly key: string;            // r:<routeId>|<params>|<deps>  — DELIMITED
  readonly read: Resource<unknown>;
  readonly dispose: () => void;    // detached root -> aborts what is in flight
  updatedAt: number;               // stamped when the fetch settles
  cause: "preload" | "enter" | "stay";
  preload: boolean;                // which stale/gc budget applies
}
```

**Delimited, unlike TanStack.** Theirs is `route.id + interpolatedPath + JSON.stringify(deps)`
with no separator (`router.ts:1623-1629`) — collision-prone in principle, and their own source
carries no defence of it.

**Deps stringified with SORTED keys, unlike TanStack.** Theirs is plain `JSON.stringify`
(`router.ts:1605`), so `{a:1,b:2}` and `{b:2,a:1}` are different generations of the same data.
`loaderKey` already sorts params for exactly this reason (`router.ts:74-80`); deps get the same
treatment.

### 1.3 The key is memoised per MATCH, not rebuilt per read

This is where §3.1 earns its wall-clock number. `props([{...}])` returns a single plain record
unchanged (`props.ts:168-174`), so nothing memoises `props.data`, and every read runs
`Object.keys().toSorted()` + `.map` + `.join` + a template before the Map lookup: **159 ns, or
13.3% of a whole compiled 20-row page render** (F2, against M2's 1199.6 ns denominator).

So the selection moves into a `computed` per depth whose inputs are the routeId, the params and
the deps — and the read becomes a settled-cell read over a 2.5 ns lookup. **Adding `loaderDeps`
to the key costs nothing and the read still comes out ahead.** D4 rejected a generated matcher
over 58 ns; this is 156.

A consequence worth stating: the selection memo must depend on the search STRING, not on
`location()`. `search` today is `computed(() => new URLSearchParams(location().search))` — a
fresh object every location change, so a HASH change currently invalidates everything downstream.

### 1.4 The policy, and where it deliberately differs

Defaults are TanStack's: `staleTime` 0, `preloadStaleTime` 30_000, `gcTime` / `preloadGcTime`
300_000.

`shouldReload: boolean | ((ctx) => unknown)`, three-way, and **documented as three-way** because
TanStack's is typed `any` (`route.ts:992`) and a function that forgets to return means "use
staleTime", not "don't reload":

- truthy → reload even if fresh, `staleTime` never consulted;
- `undefined` → fall through to `staleTime`;
- any other falsy → suppress the `staleTime` clause entirely.

**Divergence 1 — `staleTime` means what it says.** TanStack's staleness clause additionally
requires `forceStaleReload || cause === 'enter' || a same-route-different-id in the committed
lane` (`load-client.ts:794-806`), so a `'stay'` match navigating to a different href is never
revalidated on staleness alone. barq drops the extra conjunct: staleness decides.

**Divergence 2 — `staleReloadMode` is a route option.** TanStack declares it only on the
loader-OBJECT form (`route.ts:321-346`, read once at `load-client.ts:838-840`), so `loader: fn`
can never set it. barq puts it on the route.

**Divergence 3 — `cause: 'preload'` is real.** TanStack never stores it on a match; it is
synthesized into ephemeral context objects only (`load-client.ts:374`, `:588`), so `match.cause`
is only ever `'enter'` or `'stay'` despite the type. barq stores it, so `shouldReload` can see it.

**Divergence 4 — gc DISPOSES.** TanStack's `_cache` is an unbounded `Map` swept on commit
(`load-client.ts:1591-1666`); nothing is collected if the app never navigates again. barq keeps
the commit-time sweep (lazy is right — no timers) but the sweep calls `entry.dispose()`, which
aborts what is in flight, and `cacheSize` stays as a ceiling because a lazy sweep alone is not a
bound.

### 1.5 Priming the chain — one change, two wins

barq's loaders are PULL-based: a read starts the fetch. A child's boundary is built inside the
parent's content, so a parent that parks means the child's loader has not started. Measured on a
three-deep chain at 40 ms per loader (F11):

- `stream:true` unprimed: 121 ms — a waterfall, 3 x 40.
- `stream:false` unprimed: **one depth of three in the markup, one seed of three** — B2.
- primed: all three loaders start in the same millisecond, all three depths render, all three
  seed. 41 ms.

Priming = touch every entry in the matched chain before rendering depth 0. It must happen INSIDE
the render session on the server, because a value whose first read is outside one lands in the
`null` bucket and is seeded into nobody (core §A4). That single change makes loaders parallel
(TanStack's shape, by a different route) and fixes B2.

---

## 2. §3.2 — `beforeLoad` and route context

TanStack: serial top-down, ALL `beforeLoad`s before ANY loader, context merged parent→child by
spread with the child winning (`load-client.ts:391-395`, `:455-458`), plus a synchronous
`context()` memoised per match in `_ctx`. `beforeLoad` re-runs on every navigation and
`staleTime` never applies to it (`staleTime` has exactly three occurrences in their tree and none
is in `contextualize`).

barq adopts the shape, and gets the ordering guarantee for free: `beforeLoad` runs in
`navigate()` before the location commits; loaders run on read after it. So "all beforeLoads
before any loader" is structural here rather than enforced by a lane.

**`beforeEnter` stays.** It returns `false | string` — a verdict. `beforeLoad` returns an object —
a value. Two hooks because they answer different questions, and because `beforeEnter` is already
tested and already used by `kitchen-sink`. `beforeLoad` may `throw redirect()` or `throw new
Response(...)`.

`useRouteContext()` reads the merged context for the current depth.

---

## 3. §3.3 — search params

`validateSearch` accepting a Standard Schema (`~standard` probed FIRST, as TanStack does at
`router.ts:2712`), a `.parse` object, or a plain function. Async validation is refused, not
awaited — TanStack's rule and it is right. `@barqjs/start` already declares `StandardSchema`
(`packages/start/src/index.ts`); reuse it, take no dependency.

Inheritance copies TanStack: a child's validator receives `{...parentSearch}`, i.e. the raw URL
search with every ancestor's validated output layered over it, so unknown keys survive the chain
(`router.ts:1567-1574`).

A validation failure becomes a `SearchParamError` that lands on the route's error boundary
(§3.4). TanStack runs the route's `context()` but not its `beforeLoad` in that case
(`load-client.ts:403-410`); barq does the same and says so.

Search middlewares — `stripSearchParams`, `retainSearchParams` — run when a location is BUILT
(link href, navigate), never on inbound parse. That is TanStack's placement
(`router.ts:2006`, one call site) and it is the correct one.

**Divergence 5 — the codec is a fixpoint.** TanStack's is not: `?k=a&k=b` decodes to an array
(`qss.ts:64-80`) but re-encodes as a single JSON value (`searchParams.ts:67-73`), so
decode∘encode is not identity. barq's gets a round-trip property test.

**Breaking change, stated:** `useSearch()` returns the validated record, not
`Cell<URLSearchParams>`. The raw string stays on `location().search`, and `useSearchParams()`
keeps its current shape.

---

## 4. §3.4 — errors, not-found and pending, per route

`errorComponent`, `notFoundComponent`, `pendingComponent`, `pendingMs`, `pendingMinMs`, and
`notFound()` beside `redirect()`.

This is not decoration; it is how B3 stops tearing responses. Today the router installs only
`"loading"` boundaries (`components.ts:106-119`), so a loader that rejects after the shell has
flushed escapes the stream's round loop — which swallows only `NotReadyError`
(`packages/server/src/server.ts:467-472`) — and reaches `controller.error`, killing the body
mid-document. An `Errored` boundary per depth catches it. `Errored` re-throws `NotReadyError` on
both backends (`flow.ts:1044-1047`, `boundaries.ts:369`, `ssr.ts:901`), so it composes with the
`Loading` boundary rather than swallowing the park.

**The redirect answer, and it is a real constraint rather than a fix.** D9 established that
status must be decided before the shell flushes, and `renderToStream` emits the shell
synchronously. So:

- a redirect from `beforeLoad` becomes a **302**, because `beforeLoad` runs before the render;
- a redirect from a LOADER, discovered after the shell is on the wire, is emitted into the
  stream as a client-side redirect, with a `<noscript>` meta-refresh fallback;
- the docs say plainly that a redirect which must be a 302 belongs in `beforeLoad`.

That is the honest shape. The alternative — awaiting the whole chain before the shell — is
"streaming that does not stream", which is the defect DESIGN-START §2 exists to have fixed.

B4 is fixed by activating the fallback inside the try/catch, or by not making `pending` a `lazy`
in the generated table.

---

## 5. §3.5 — preloading, and the compiler earns its place here

### 5.1 `<link rel="modulepreload">` — the missing channel

`lazy()` cannot tell anyone its module URL: the specifier lives inside the closure and the
returned function carries `preload` and nothing else (`components.ts:429-450`). But
`routes.rs:305-310` HAS the specifier in hand when it emits the table.

Verified against a real `vite build` on Vite 8 / rolldown (F9): the client manifest maps a route
module to its chunk directly, and `generateBundle`'s `chunk.imports` gives the transitive static
set.

```json
"src/routes/users.$id.tsx": { "file": "assets/users._id-DGGgUZR1.js", "isDynamicEntry": true }
```

So: **`routes.rs` emits a `src` field per route node**, the Vite plugin joins it to the manifest
at build and serves `routeId -> [chunk, ...chunk.imports]`, and `createPageHandler` writes the
tags for the matched chain into the head before the shell flushes. TanStack reaches the same
place through a bigger machine — a flat `Record<routeId, {preloads, scripts, css}>` built from
Rollup chunks with a `?tsr-split` marker for the join (`start-plugin-core`), plus an ancestor-dedup
DFS. barq's join is a filename the generator already knows, so the marker is unnecessary.

### 5.2 `preload="intent" | "viewport" | "render" | false`

`packages/extra`'s deleted version had the three bugs the handover names and **five more** that
the archaeology confirmed with line numbers. Every one is a test in the new implementation:

| bug | old code | what the new one does |
|---|---|---|
| a path that failed to match was poisoned for the router's LIFETIME | `prefetched` Set filled BEFORE the match test, never evicted (`:500`, `:789-792`) | no Set; the entry cache IS the dedupe, and it expires |
| prefetch used an EMPTY search while the key included it | `new URLSearchParams()` at `:796` vs `cacheKey(..., search)` at `:553` | preload takes the same key path as navigation |
| an IntersectionObserver per link regardless of strategy | unconditional at `:1065`, strategy checked INSIDE the callback at `:1068`, so a non-viewport link never disconnects | constructed only for `viewport` |
| prefetch never resolved/parsed/stripped the href | raw href to `matchRoutes` at `:791` | resolve → parse → strip, the same path `navigate` takes |
| prefetch ran no guards | `runLoader` direct at `:796` | preload runs `beforeLoad` (the loader needs its context) and does not commit |
| the prefetch AbortController was unreachable | `new AbortController().signal` at `:793` | the entry's controller; a superseding preload aborts |
| the hover timer was not cleared on unmount | `clearTimeout` only on `mouseleave` (`:1063`) | cleared in `onCleanup` |
| keyboard and touch users never prefetched | `mouseenter` only | `focusin` counts as intent; `touchstart` fires immediately, bypassing the delay |

The last row is TanStack's shape too (`react-router/src/link.tsx:718-721`, `:737-740`), and their
`rootMargin: '100px'` and `defaultPreloadDelay: 50` are worth copying as defaults.

Also worth NOT copying from TanStack: they have no negative caching either, so a repeatedly
hovered broken link re-runs the whole preload every time (`load-client.ts:2090-2101`).

---

## 6. §3.6 selective SSR, §3.7 deferred data, §3.8 the smaller surface

**`ssr: boolean | 'data-only'`** with TanStack's inheritance, which is not symmetric and is worth
copying exactly (`load-server.ts:161-181`): a parent's `false` forces every child to `false`; a
parent's `'data-only'` clamps a child's `true` down to `'data-only'` but a child may still
declare `false`. Two independent signals reach the client — `status: 'pending'` means the loader
never ran, `ssr: 'data-only'` means data ran and the component did not.

**Deferred data.** barq already has the harder half and it is better than TanStack's: seroval
carries a pending promise as `($R[n] = FACTORY()).p` and resolves it in a later chunk, and
`seedLater` makes a client read WAIT rather than refetch (`signals.ts:3136-3141`). SvelteKit
drops the value and refetches; TanStack ships the same seroval mechanism. So this is wiring a
loader result into a path that exists.

**The smaller surface** — `useMatch`, `useRouterState`, `useBlocker`, `useCanGoBack`, route
masking, `activeProps`/`inactiveProps`, hash history, `resetScroll`, `viewTransition`, devtools.
Two of these have known-bad prior art on both sides:

- **Scroll restoration.** The old router restored AFTER `await transition.finished`
  (`:768-770`), i.e. at the END of the animation; keyed on `pathname+search` so every
  `useSearchParams` keystroke (which navigates with `replace: true`) jumped to the top; never
  set `history.scrollRestoration = 'manual'`; never handled a hash; never restored on a 404; and
  grew an unbounded Map. TanStack gets all of these right — `sessionStorage` under
  `'tsr-scroll-restoration-v1_3'`, `history.scrollRestoration = 'manual'`, an inline script
  emitted into the body so restoration happens on the streamed HTML before hydration, and
  per-element selectors for nested scroll containers. Copy TanStack's shape.
- **View transitions.** BOTH prior arts await the wrong promise — the old router awaited
  `transition.finished` (`:668`), which pins `isLoading` for the whole animation; TanStack awaits
  `updateCallbackDone` (`router.ts:2399`), which is correct. The old router's `flush()` inside
  the `startViewTransition` callback (`:641-644`) IS load-bearing and worth stealing verbatim:
  the browser snapshots the DOM when the callback returns, and barq's propagation is
  microtask-scheduled, so without it the transition animates old-to-old. Its
  `document.visibilityState === 'hidden'` skip and its `pointer-events: none` stylesheet for
  `::view-transition-*` are both real fixes.

---

## 7. §3.9 — the wiring that exists and is not connected

Both halves verified against a real Vite 8 build (F9). `buildEnd` + `this.getModuleIds()` +
`getModuleInfo(id).importedIds` returns the static graph — `src/routes/users.$id.tsx ->
["src/data/users.ts"]` — which is exactly `reachabilityFrom`'s `importsOf`. The ssr registry
comes through `environment.runner.import`, copying `packages/start/src/vite.ts:176-180`. Dev
divergence stays as D8 stated it: a `vite build` artefact, with dev asserting lazily per request.

BARQ013's route table needs one line in `kitchen-sink`'s Vite config — `barqRouter({ onRoutes })`
into `barqVitePlugin({ routes })`. No app passes it today.

---

## 8. What the compiler gets, and one thing it does not

The project's preference is to push work into Rust where it belongs. Three items qualify; a
fourth was considered and rejected.

1. **`src` per route node in the emitted table** (§5.1). One `format!` in
   `routes.rs:300-310`. Unlocks modulepreload, which is the difference between a code-split
   route flashing its fallback on first hydration and not.

2. **Typed `search` and `loaderData` in the generated `.d.ts`** — and this needs NO parsing.
   `routes.rs` never reads a route file's contents (only filenames), and it does not have to:
   TypeScript will do the inference if the emit names the module. **Verified compiling** under
   `tsc --strict`, both directions enforced:

   ```ts
   type SearchOf<M> = M extends { validateSearch: (raw: never) => infer S } ? S : Record<string, string>;
   type DataOf<M> = M extends { loader: (...args: never) => infer R } ? Awaited<R> : undefined;

   "/a/$id": {
     path: "/a/$id";
     params: { id: string };
     search: SearchOf<typeof import("./route-a.ts")>;
     data: DataOf<typeof import("./route-a.ts")>;
   };
   ```

   This also closes a contradiction the generator carries today: its own doc comment
   (`routes.rs:327-333`) justifies generated interfaces by "`loaderData` per route id, which is
   not derivable from a path string", and then emits `path` and `params` only.

   Worth noting against M3: this is TanStack's arrangement too, arrived at differently. Their
   typed search does NOT come from the generator — `fullSearchSchema` is computed structurally
   from the route's own `validateSearch` and the generator only supplies an id→route map
   (`routeInfo.ts:42-50`). barq gets the same result with one `typeof import` per row instead of
   a route-tree type walk.

3. **BARQ014 — a loader that reads `search` while its route declares no `loaderDeps`.**
   This is B1, the highest-severity bug in this session, and it is a SINGLE-MODULE fact: the
   route module's own AST says whether its `loader` touches `ctx.search`, and its own exports say
   whether `loaderDeps` is declared. No cross-module knowledge, so §3.13 item 1 is respected. It
   ships at warning, per `docs/README.md:31-33`. Obligations, and the handover's list of three is
   INCOMPLETE — it also must fire on zero existing fixtures, which `test/diagnostics.test.ts:283-293`
   pins by asserting the whole 117-fixture corpus yields exactly two codes.

4. **Rejected: generating the matcher for the server side.** M1's own text proposes it
   ("generate the switch for the SERVER, where it is never downloaded"), which sits awkwardly
   beside D4's flat "the matcher is not generated". D4 still wins on its own numbers: the bucket
   the runtime trie already implements recovers 28x of the 28.2x available, and the generated
   switch buys 58 ns more. Recorded because the tension is real and the next reader will find it.

**Also rejected: extending `routes.rs` to read route module contents.** It reads filenames only
(verified: one `std::fs::read_dir` in the whole crate outside `build.rs` and `#[cfg(test)]`), and
item 2 shows the emit does not need to. A second parser over the same files would be a second
source of truth.

**Stated cost, not hidden:** `route_tree` discharges none of CODESIGN §6's oracle layers today —
no fixture, no `SEMANTICS.md` rule, no mode-matrix row, no golden, no mutation operator. Its only
coverage is 11 Rust unit tests and 5 bun tests. Anything added there inherits that gap. Whether
to close it is a decision, not an oversight, and it should be taken deliberately.

---

## 9. Order

1. **B1–B5**, with a test each. B2 and B5 first — they are on the shipped SSR path.
2. **§3.1**: `loaderDeps`, the entry cache under detached scopes, the memoised key, priming,
   the stale/gc policy. Benchmarked before and after against F2's numbers and a navigation trace
   that counts loader invocations.
3. **§3.2** `beforeLoad` + context, then **§3.3** search validation — §3.1's deps read the
   validated search, so this order is forced.
4. **§3.4** error/notFound/pending per depth.
5. **§3.9** the two wirings — small, and they de-risk the build-side work in §3.5.
6. **§3.5** modulepreload (compiler `src` field first), then `preload` on links.
7. **§3.6**, **§3.7**, then **§3.8**'s surface.
8. Compiler: the `src` field with §3.5, the `.d.ts` types with §3.3, BARQ014 with §3.1.

---

# The red team's verdicts, and what they changed

A red-team pass was run against this document with one instruction: kill it, do not improve
it. Five claims died, three were wounded, six survived. Recorded in full rather than edited
away, because `packages/router/DESIGN.md`'s own discipline is that a falsified claim stays
visible so it is not revived. Its probes are `scratch/p6/rt-*.ts`.

| # | claim | verdict |
|---|---|---|
| R1 | `latest()` IS `staleReloadMode: background`, "nothing to build but the switch" | **DIED** |
| R2 | the loader cell becomes a `resource` (§1.2) | **DIED** |
| R3 | F3's three-row table is the whole of `staleReloadMode` | **DIED** |
| R4 | a detached `root()` beats `runWithOwner(null, …)` | **DIED** |
| R5 | gc DISPOSES (Divergence 4) | **DIED** |
| R6 | typed `search`/`data` via `typeof import` | **DIED** on two shapes, wounded on cost |
| R7 | priming makes loaders parallel, 2.9x | **WOUNDED** |
| R8 | BARQ014 is a clean single-module fact | **WOUNDED** |
| — | `resource` seeds through the router's SSR path | SURVIVED, and the client half was proved too |
| — | §1.3's memoised key | SURVIVED against a fairer contender: 4.3 ns vs 152 ns |
| — | the `Loading` `on` re-arm under `latest()` | SURVIVED |
| — | §5.2's archaeology, §6's `ssr` inheritance, §8 item 1 | SURVIVED |

## R2 — a SEEDED `resource` can never be reloaded. §1.2 is withdrawn.

The worst of them, because it has no workaround inside the chosen primitive. A seeded first
run never enters `compute` (`signals.ts`'s `trySeed` returns before calling `fn`), so
`resource`'s `bump` signal — read at the top of `compute` — never becomes a dependency, and
`refetch()`'s `bump.set(0)` invalidates nothing. `refresh()` cannot substitute: `resource`'s
read is a plain arrow (`async.ts:196`) carrying no `_node`, so `refresh` returns at
`signals.ts:3240` without doing anything.

```
hydrated: ["SEEDED"] fetches 0
after refresh(r) : [] fetches 0
after r.refetch(): [] fetches 0 state ready
control (unseeded) refetch: ["threw NotReadyError","Q2"] fetches 2
```

Every route the server rendered — i.e. every route on first load — would have had a frozen
cache, and `staleTime`, `shouldReload`, `invalidate()` and `useInvalidate()` would all be
silent no-ops. §1.2's own premise ("`resource` already has the shared AbortController") was
true and irrelevant: the primitive that has the abort cannot do the reload.

**Revised: the cell stays a keyed `computed` and the reload trigger stays `refresh()`, which
is confirmed to work after a seed.** The AbortController §1.2 wanted from `resource` is ~15
lines the router owns: one per run, aborted when a newer run supersedes it and when the entry
is disposed. That is `resource`'s A1/A2 rewritten rather than borrowed, and it is the price
of R2.

## R1 — on the server, `latest()` reads `undefined` and seeds NOTHING

F3 was measured inside a tracked `effect`, and the note that "the router reads inside
`insert`, which is tracked" is true of the DOM backend only. The string backend has no
`insert`: `activate` (`packages/server/src/ssr.ts:742-761`) invokes the Block with no
observer, so `signals.ts:2153` short-circuits on `currentObserver === null` and hands back
`node._value` — `undefined` for a cold cell.

```
mode=blocking   stream=true  <template data-barq="0"><b>Ada-7</b></template>  seedKeys ["r:u-blocking|id=7"]
mode=background stream=true  <b>undefined</b>                                 seedKeys []
```

`stream: true` is the default. So `background` as a plain read choice would have shipped
literal `undefined`, opened no seed channel (trap 3 — nothing parks, so `parked` stays empty)
and made the client refetch what the server already had.

**Revised, and the rule is principled rather than a patch: `staleReloadMode` governs a RELOAD
of an already-settled value, and on the server every value is cold — there are no reloads.
So the server always takes the blocking read.** `background` is a client-only policy.

## R3 — the error row was missing, and the two `latest`es disagree

The table had no row for "a reload REJECTS", which is the one case where `background` and
`blocking` should differ interestingly. Measured, they differ from each other and both from
TanStack:

- core `latest()` **throws** the error, destroying the stale content that `background` exists
  to preserve;
- `Resource.latest()` **swallows it forever** and reports `errored` only through `state()`,
  which nothing was going to read;
- `isPending()` **throws** rather than answering, so the status channel is not total;
- TanStack keeps the page: a background reload runs on a clone and `settleInto` writes
  `status:'success'; error:undefined; invalid:true` for a non-success
  (`load-client.ts:694-700`), with the comment *"Every other settled attempt remains a
  renderable, stale match in that lane."*

**Revised: the entry remembers its last settled value, and a `background` read that catches a
reload error returns it and records the error on the entry.** A cold error still throws, to
the error boundary §3.4 installs. So `staleReloadMode` is *mostly* a read choice and the
error row is an explicit rule — §1.1's "nothing to build but the switch" was wrong and is
withdrawn.

## R4 — a detached `root()` inherits the render's context and PINS the render scope

`createOwnerScope(registerWithParent = false)` still does `makeScope(getCurrentOwner())`
(`signals.ts:2594-2600`), which copies `ctx` and `catcher` and keeps `parent` as a field.
Measured:

```
entry.parent is null?   : false
entry.ctx === parent.ctx: true
after render dispose, entry still reads: acme
under tenant=globex the cached entry reads: acme
```

Three consequences the section did not account for: the entry pins the render scope that
happened to mint it — including its DOM range — for the entry's whole life; a loader's
ambient context becomes "whatever render created the entry first", which matters the moment
§3.2 lands `useRouteContext()`; and a throw inside the entry routes to the *creating*
render's error boundary. That is worse than `runWithOwner(null, …)`, not better.

**Revised: `runWithOwner(null, () => root(…))`.** Null owner at creation means `makeScope(null)`
— no parent, no inherited `ctx`, no inherited `catcher` — and `root` still returns a
`dispose` the router can call. Both properties, neither cost.

## R5 — disposing an entry strands a boundary parked on it, forever and silently

```
parked        : "FALLBACK"
after dispose : "FALLBACK"  aborted: the scope that owns this request was disposed
300ms later   : "FALLBACK"
unhandled rejection: none
```

Disposal aborts the fetch, the promise never settles into the graph, the boundary never
re-arms and nothing surfaces. A permanent spinner. And it is reachable without any sweep:
`cacheSize` evicts in insertion order, so a hundred preloads evict the entry the current page
is parked on — harmless today, because eviction is only a reference drop and the boundary
holds the cell directly, and turned into a hung page by adding `dispose()`.

**Revised: an entry is collectable only if it is NOT in the current chain AND has settled.**
An in-flight entry is skipped by the sweep and by the ceiling. Disposal is what makes
`gcTime` honest, and this is the rule that makes disposal safe.

## R7 — the priming number was cross-mode, and priming is server-only

The 2.9x compared `stream:true` unprimed against `stream:false` primed. Same-mode, measured
with the delays skewed:

| delays a/b/c | unprimed `stream:true` | primed `stream:true` |
|---|---:|---:|
| 40/40/40 | 121 ms | 41 ms |
| 10/100/10 | 121 ms | 100 ms |
| 100/10/10 | 121 ms | 101 ms |

**The honest statement is sum → max, bounded by chain depth, collapsing toward 1.0x as one
loader dominates.** The B2 correctness fix is untouched; the performance framing was
overstated and is corrected here.

Two more, both real: `prime()` has exactly one call site, `renderRoutes` — **the client still
waterfalls on every navigation**, which is where TanStack's parallel loaders actually pay, so
client priming is now its own item. And `prime()` loops the chain unconditionally, which
**contradicts §3.6's `ssr: false`**; that loop grows an `ssr` check when §3.6 lands.

## R6 — the typed emit FAILS OPEN on the two shapes §3.3 says it supports

`SearchOf` matched only `validateSearch: (raw: never) => infer S`. §3.3 says `validateSearch`
accepts a Standard Schema, a `.parse` object, or a function — and probing the resolved types:

```
/std      (Standard Schema object) -> Record<string, string>   SILENTLY WRONG
/parseobj (.parse object)          -> Record<string, string>   SILENTLY WRONG
/objloader({ handler } form)       -> undefined                SILENTLY WRONG
```

`const oops: RouteMap["/std"]["search"] = { literally: "anything" }` compiles clean. For the
form nearly everyone writes — a zod schema — the runtime validates to a precise record and
the type says "any string map", with no error and no signal. That is the "paper over it at
the consumer" pattern this repo's own rules forbid.

**Revised: the helpers handle all three shapes, and the fallback is an explicit unresolved
marker rather than a permissive one** — a wrong type must fail closed.

Two more from the same attack. `collect_rows` emits a row only when `node.children.is_empty()`
(`routes.rs:352-372`), so **layout routes get no row at all** and the typed `loaderData` is
missing for exactly the routes a nested chain exists to serve. And the cost, which §8 implied
was free because there is no parsing:

| routes | current emit (`path`+`params`) | `typeof import` emit, fields USED |
|---|---|---|
| 200 | 0.003 s / 24 inst | 0.036 s / 43 239 inst |
| 2000 | 0.131 s / 24 inst | 1.311 s / 432 039 inst |

**216 instantiations per route against M3's "exactly 8".** The fair control — the same call
sites reading only `params` — is identical to the current emit, so the EMIT is free and the
CAPABILITY costs 10x. Recorded, because §8 said "needs NO parsing" as if that settled it.

## R8 — BARQ014 lints a divergence that can simply be deleted

TanStack's `LoaderFnContext` has **no `search`** (`load-client.ts:580-596`) — a loader there
physically cannot read validated search except through `deps`. barq hands it over at
`route.ts:76`, which is *why* B1 existed: barq diverged from the shape §3.1 otherwise copies
closely. Spending the project's next diagnostic code — permanent, per `docs/README.md:29-33`
— on a hazard that can be made unrepresentable is the wrong trade. The rule is also imprecise
in both directions (a re-exported loader, a helper handed `ctx`, a `search` read only for
telemetry) and needs a fifth obligation the design missed: the route-FILE set as a new
`TransformOptions` field, with the `OPTION_KEYS` bidirectional test.

**Revised: BARQ014 is dropped. Instead, `search` is REMOVED from the loader context when the
route declares `loaderDeps`** — the author who opts into precision gets `deps` and nothing
else, so the narrow-deps/broad-read hazard cannot be written. Without `loaderDeps` the loader
still gets `search` and the whole search is the key, which is what `ac8c51d` established.

## The gap the B3 fix opened, named before it bites

`renderRoutes` now wraps each depth in `ssrErrored(… fallback: () => ssrHtml(""))`. A loader
rejection used to tear the response; it now yields **status 200 with a silently truncated
page**. Strictly better than a torn body, and still a silent failure — a crawler indexes a
page missing its content.

Two consequences for the order: **§3.4 moves ahead of §3.1**, because priming starts more
loaders and therefore makes more rejections reachable; and §3.4 must land on BOTH backends —
`components.ts` installs only `"loading"`, so every client-side rejection after hydration
still has nothing to catch it.

## A stale record found in passing

`packages/router/DESIGN.md`'s falsified table still asserts "The crate does ZERO filesystem
reads outside `build.rs` and `#[cfg(test)]`". `routes.rs:87` is a `std::fs::read_dir` in
`src/`, added when generation moved into the compiler at `e441950`. The row was true when
written and the commit that overturned it said so; the table needs the correction beside it.

---

# Order, revised

1. ~~B1–B5~~ — done: `84cfc09`, `27b598a`, `fa6d9a9`, `2bc4966`, `ac8c51d`.
2. **§3.4 error/notFound/pending per depth, both backends** — moved ahead of §3.1 because the
   B3 fix made truncation silent and priming makes it more reachable.
3. **§3.1** with R1–R5 applied: keyed `computed` + `refresh`, the router's own
   AbortController, `runWithOwner(null, () => root(…))`, the settled-and-unmatched sweep rule,
   the server-blocking rule, and the remembered last value for the error row.
4. Client priming (R7).
5. §3.2 `beforeLoad` + context, then §3.3 search validation.
6. §3.9 the two wirings.
7. §3.5 modulepreload (compiler `src` field), then `preload` on links.
8. §3.6, §3.7, §3.8.
9. Compiler: the `src` field with §3.5; the `.d.ts` types with §3.3, fixed to fail closed and
   to emit layout rows. BARQ014 dropped.
