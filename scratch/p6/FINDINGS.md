# P6 — what was probed before any design was written

Every row here was run, not reasoned. Probe files are beside this one and each names the
question it answers. `packages/router/DESIGN.md`'s discipline: the instrument beside the
number, and what the instrument cannot decide in the same breath.

Baselines re-verified at `c24049a`, and they match §0 of the handover exactly: cargo test
335/0, clippy clean, fmt clean; core 918, server 92, start 36, router 141, extra 26, testing
16, compiler 22, compiler-rs 3506 (+1 known self-check "error").

---

## F1 — a search-dependent loader is BROKEN today. §3.1 is a bug fix, not a feature.

`probe-search-key.ts`, against the real `createRouter`:

```
at /posts?page=1 -> page-1
location now  -> /posts?page=2
at /posts?page=2 -> page-1
loader invocations: 1   search values the loader saw: ["1"]
```

`dataFor` keys on `r:<routeId>|<sorted params>` (`router.ts:74-80`, `:130`) and hands the
loader `untrack(search)` (`router.ts:143`). Search is in the loader's ARGUMENTS and not in
its KEY, so `?page=2` reuses the cell built for `?page=1` and answers with page 1 forever.

This reframes §3.1. `loaderDeps` is not a cache-policy nicety; it is the mechanism that makes
a search-dependent route correct at all. The handover's "a cache policy that moves no number
should not exist" is satisfied before any timing is quoted: the number it moves is the number
of wrong answers.

**CANNOT DECIDE.** The probe uses `memoryHistory` and reads `dataFor` directly rather than
through a compiled `insert`. It shows the cell is shared; it does not show what a browser
paints.

## F2 — the read path costs 159 ns, and 156 of them are avoidable

`probe-readpath.ts`. Instrument: bun 1.4.0-canary.1, 41 trials x 20 000 iterations, warmup
50 000, one route with two params. Medians, ns/op:

|                                   |     min |  median |     p75 |
| --------------------------------- | ------: | ------: | ------: |
| `loaderKey(id, params)`           |    90.7 |   101.0 |   103.0 |
| `dataFor(route, params)`          |   136.3 |   154.3 |   165.8 |
| `state.params()`                  |     4.6 |     4.6 |     6.0 |
| **full `props.data()` read**      | **136.5** | **159.0** | **169.2** |
| `Map.get(memoised key)`           |     1.8 |     2.5 |     2.6 |

`props([{...}])` returns a single plain record UNCHANGED (`props.ts:168-174`), so nothing
memoises the accessor: every `props.data()` read rebuilds the key — `Object.keys().toSorted()`,
a `.map`, a `.join`, a template — before the Map lookup. Against M2's denominator (a compiled
20-row `renderToString` = 1199.6 ns) one read is **13.3% of an entire page render**, per depth,
per read.

This is the wall-clock number §3.1 has to move, and it moves the right way: a key memoised per
match turns 159 ns into a 2.5 ns lookup, so adding `loaderDeps` to the key can cost nothing and
still come out ahead. Compare D4, which rejected a generated matcher over 58 ns.

**CANNOT DECIDE.** Bun microbenchmark on one two-param route. It cannot see how many times a
real page reads `props.data()` per render, which is the multiplier that decides whether 159 ns
matters — that needs the Tier-2 lane, and this claim is PROVISIONAL until it has one.

## F3 — `staleReloadMode` needs no state machine. It is a choice of READ.

`probe-latest-tracked.ts`, inside a real tracked `effect` — trap 2's shape, because
`latest()` answers differently outside a derivation (`signals.ts:2153` short-circuits on
`currentObserver === null`, and an untracked cold read returns `undefined` instead of throwing).

| cell state           | `cell()`                | `latest(cell)`          |
| -------------------- | ----------------------- | ----------------------- |
| cold, never resolved | throws `NotReadyError`  | throws `NotReadyError`  |
| resolved             | value                   | value                   |
| **refreshing**       | throws `NotReadyError`  | **previous value**      |
| refresh settled      | new value               | new value               |

That table IS TanStack's `staleReloadMode`, with the correct cold-start on both arms: blocking
is `cell()`, background is `latest(cell)`, and neither shows stale content that never existed.
`refresh(cell)` (`signals.ts:3238-3247`) is the reload trigger and re-runs the loader for real —
`trySeed` is already false, so the re-run does not re-consult the seed.

So §3.1's "TanStack's reload rule is a real state machine" is answered by POLICY over existing
primitives, not by porting a state machine: what remains to build is *when* to call `refresh`
(staleTime / shouldReload), *when* to drop an entry (gcTime), and *which read* a route gets.

## F4 — `resource()` already has the shared AbortController §3.1 asks for

`probe-abort-scope.ts`:

```
Q5a invocations            2
Q5a signal[0].aborted      true "a newer request was issued"
Q5a signal[1].aborted      false
Q5b before dispose         false
Q5b after dispose          true "the scope that owns this request was disposed"
```

`async.ts:111-136` — an `AbortController` per run, aborted by the next run and by the creating
scope's disposal, with a generation guard (A2) so a late continuation cannot win. The router's
own controller (`router.ts:139`) is constructed per run and **never aborted by anything**;
`grep -rn '\.abort(' packages/router/src/*.ts packages/start/src/*.ts` finds nothing. It is dead
plumbing.

## F5 — the owner-less cell cannot be disposed, so `gcTime` by Map-delete LEAKS

`computed()` is `EFFECT_PURE`, and an owner-less pure node is registered in neither
`owner.kids` nor `orphans` (`signals.ts:2083-2087`). `disposeNode` is not exported. So dropping
a cell from `cells` is a reference drop and nothing else:

- dependency links stay in each source's `_subs` (`signals.ts:1155-1161`) — a loader that reads
  a signal directly keeps the dead node alive forever;
- `_closeAsync` never runs, so an async-iterable loader keeps pumping;
- a promise that never settles stays in the module-global `inFlight` map and `settle()` waits on
  it forever.

Trap 1 says the cell must not be owned BY THE RENDER. It does not say it must be owner-LESS. A
per-entry **detached** scope (`root()`, i.e. `scope(fn, true)`) is not registered in its parent's
`kids` (`signals.ts` `createOwnerScope`, `registerWithParent = false`), so the boundary cannot
take it — and the router can dispose it, which aborts the in-flight request (F4, Q5b). That is
strictly more than `runWithOwner(null, …)` gives and it is what `gcTime` needs to be honest.

## F6 — a NON-STREAMED page with loaders at TWO depths drops the child and its seed

`probe-nested-ssr.ts`, a layout loader plus a leaf loader, through the real `createPageHandler`:

```
stream=false
  markup : <body><header>LAYOUT</header></body>
  seeds  : {"r:layout|id=7":"LAYOUT"}
  loaders: ["layout","leaf"]

stream=true
  markup : ...<template data-barq="0"><header>LAYOUT</header>...<template data-barq="1"><main>LEAF-7</main></template>
  seeds  : {"r:layout|id=7":"LAYOUT"} | {"r:leaf|id=7":"LEAF-7"}
  loaders: ["layout","leaf"]
```

Streamed is correct. **Non-streamed loses the leaf entirely** — no `<main>`, no seed — while
both loaders ran.

The mechanism is `renderPage`'s two-pass model (`packages/server/src/server.ts:92-152`). Pass 1
the layout parks, so `props.children()` is never called and the leaf's cell is never created.
`settle(session)` resolves what exists. Pass 2 the layout answers from the session bucket, the
leaf's cell is created and read for the FIRST time, throws, its boundary emits its fallback —
and there is no pass 3. Depth N needs N passes; there are two.

`stream: false` is documented as the crawler and test path (`server.ts:134`), so this is what a
crawler gets for every nested route with a layout loader. P-B fixed the one-deep case and the
n-deep case was never probed.

## F7 — in stream mode a loader's `throw redirect(...)` tears the response

`probe-redirect-stream.ts`, one route whose loader calls `redirect("/login")`:

```
stream=false     status 302  location "/login"  body ""
stream=true      status 200  location null      body "<body read threw Redirect: redirect to /login>"
stream=undefined status 200  location null      body "<body read threw Redirect: redirect to /login>"
```

`stream: undefined` is the DEFAULT. So the shipped default answers **200 with a body that
errors mid-read**, and the browser gets a truncated document instead of a redirect. Run without
the `try` around `response.text()`, the same probe exits non-zero — the rejection escapes the
process.

Mechanism: `onLoaderError` records into `answer` (`packages/router/src/server.ts:188-190`) and
`answer` is read only on the non-streamed branch (`:210-213`). The throw then escapes the
stream's round loop, which swallows only `NotReadyError` (`packages/server/src/server.ts:467-472`),
and reaches `controller.error(error)`. D10 lists "an action that redirects" as open; the
loader-redirect case is not open, it is broken on the default path.

Related, and from the same reading: a loader that REJECTS after the shell has flushed escapes
the stream's round loop — `server.ts:467-472` swallows only `NotReadyError` — and reaches
`controller.error(error)`, which tears the response body mid-document. The router installs only
`"loading"` boundaries (`components.ts:106-119`), so there is nothing to catch it. §3.4's
per-route `errorComponent` is the fix, not a nicety.

## F8 — the generated `pending` is a `lazy`, and the fallback is built OUTSIDE the try/catch

`routes.rs:305-310` emits `pending: lazy(() => import(...), (m) => m.Pending ?? Empty)`. On the
string backend the fallback is activated at `ssr.ts:937`, which is outside the `try/catch` at
`:931-936`. A `pending` component whose chunk has not loaded therefore throws `NotReadyError`
from an unguarded position and unwinds out of the loading boundary.

## F9 — the build-side facts §3.5 and §3.9 need are REAL under Vite 8 / rolldown

`scratch/p6/app`, a real `vite build` with `manifest: true` and a probe plugin.

`buildEnd` + `this.getModuleIds()` + `getModuleInfo(id).importedIds` gives the static graph —
`src/routes/users.$id.tsx -> ["src/data/users.ts"]` — which is exactly `reachabilityFrom`'s
`importsOf`. §3.9's walk is buildable as written.

The client manifest gives route module -> chunk directly:

```json
"src/routes/users.$id.tsx": { "file": "assets/users._id-DGGgUZR1.js", "isDynamicEntry": true }
```

and `generateBundle`'s `chunk.imports` gives the transitive chunk set for the modulepreload
list. So §3.5's `<link rel=modulepreload>` needs one thing the runtime does not have: the map
from route id to route MODULE SPECIFIER. `lazy()` does not carry its URL — the specifier lives
only inside the closure and the returned function carries `preload` and nothing else
(`components.ts:429-450`) — but `routes.rs:305-310` already has the specifier in hand when it
emits the table. That is the compiler's to give.

## F10 — the loader seed round-trips today, and NO test asserts it

`probe-seed.ts` shows `{"r:/users/$id|id=7":"Ada-7"}` in both modes for a one-deep route. But
`grep -n "BARQ_DATA\|seed" packages/router/src/*.test.ts` matches only the `document` helper's
parameter name. D9 rests entirely on this key round-tripping and P-B was a bug in exactly this
path. A test goes in regardless of what else this work does.

---

# Corrections to documents this work inherited

- **`async.ts:51-56` is falsified by its own code.** It says a resource key is "opt-in rather
  than positional" so a resource does not consume an auto-key slot. But `async.ts:167-172`
  always passes an options object and `{ key: undefined }` satisfies
  `options?.key === undefined` (`signals.ts:2220`), so a keyless `resource` reserves a slot —
  two, in fact, one for `fetched` and one for `view`.
- **`latest()`'s doc comment** says it "falls through (throws) for values that have never
  resolved". True inside a derivation; outside one it returns `undefined` (`signals.ts:2153`).
  The router reads inside `insert`, so the tracked answer is the one that governs — but a test
  written the untracked way measures the other function.
- **The handover's "a new diagnostic needs three things"** is incomplete. It also must fire on
  ZERO existing fixtures (`test/diagnostics.test.ts:283-293` pins the whole 117-fixture corpus
  to exactly two codes), and only ONE Rust test gates the docs, not two.
- **`routes.rs`'s own doc comment** justifies generated interfaces by "`loaderData` per route
  id", and then emits `path` and `params` only (`routes.rs:352-376`). Two of the four fields
  `DESIGN-ROUTER.md:115-118` asked for.

## F11 — PRIMING the chain fixes F6 and makes loaders parallel, measured

`probe-prime.ts`. Prime = touch every entry in the matched chain before rendering depth 0, so
every loader is in flight before the first boundary parks. Three-deep chain, 40 ms per loader:

| | wall | loader start spread | loader calls | seed keys | depths in markup |
|---|---:|---:|---|---:|---:|
| unprimed, `stream:false` | 43 ms | 40 ms | `["a","b"]` | 1 | **1** |
| unprimed, `stream:true` | 121 ms | 80 ms | `["a","b","c"]` | 3 | 3 |
| **primed, `stream:false`** | **41 ms** | **0 ms** | `["a","b","c"]` | **3** | **3** |
| primed, `stream:true` | 80 ms | 40 ms | `["a","b","c","b"]` | 3 | 3 |

Two results in one change. The unprimed non-streamed row is F6 — one depth of three. The
unprimed streamed row is CORRECT but is a **waterfall**: 121 ms is 3 x 40 ms, because a child's
boundary is built inside the parent's content, so a parent that parks means the child's loader
has not started. Priming makes the three loaders start in the same millisecond (spread 0) and
renders all three depths.

**CANNOT DECIDE.** Synthetic 40 ms loaders on one machine. The spread is the honest number; the
wall clock is dominated by the fixed delay I chose, so 2.9x is the shape of the win at equal
per-loader latency and not a claim about any application.

## F12 — the router state is DISPOSED before a streamed page has rendered

The `primed, stream:true` row above shows `["a","b","c","b"]` — `b` fetched twice — and 80 ms
instead of 41 ms. `probe-prime-why.ts` traces cell identity and isolates the cause:

```
dataFor a key={"id":"7"} -> cell#1
dataFor a key={"id":"7"} -> cell#1
dispose() called                      <- mid-render
dataFor a key={"id":"7"} -> cell#2    <- a NEW cell under the SAME key
```

`createPageHandler` runs `finally { state.dispose(); }` inside the `withRequest` callback
(`packages/router/src/server.ts:229-231`). For a streamed response that callback returns as soon
as `renderToStream` hands back the `ReadableStream` — before one byte of the body exists. So
`dispose()` clears `cells` and unsubscribes history WHILE the boundaries are still resuming.
Neutering `dispose` removes the second cell and the second fetch; with it live, every entry is
re-minted on resume, and whether that refetches depends on whether the session already recorded
the value. Timing-dependent, which is why it had not been noticed.

`getRequest()` DOES survive the resume — `probe-dispose-stream.ts` shows the leaf loader reading
the request correctly on a resumed boundary, so rule 2 of `server.ts`'s docstring holds. That
was a concern of mine that the probe killed.

**Correction to my own reading.** An earlier run of `probe-dispose-stream.ts` appeared to show
the leaf loader running twice even with `dispose` neutered. It was a probe artefact: the four
cases shared one `notes` array, and the `stream:false` case leaves an ORPHANED in-flight loader
which completed during the next case and pushed into the cleared array. The artefact is itself a
finding — F6's non-streamed path starts a loader whose result is dropped and which nothing
aborts (F5), so the request outlives the response.
