# Tests whose assertion changed (old model -> Solid 2.0 model)
- signals.test.ts "handles NaN correctly": NaN write now notifies (upstream isEqual is ===); added an `equals: Object.is` case.
- signals.test.ts "computes lazily on first read": computed is eager; added a `lazy: true` case.
- signals.test.ts "does not recompute unobserved computeds on write": owned memo recomputes once per flush.
- signals.test.ts "writes that revert within a batch do not re-trigger effects": property gone (no value-snapshot gating); replaced by "a batch publishes once".
- graph.test.ts two cases: creation order is declaration order (eager), not pull order.
- conformance.test.ts: 25 cases pinned test.failing with reasons.
- context.test.ts: local `root` helper is an owned scope (Solid createRoot), not detached; two no-owner tests left unrooted.
- index.ts `root()`: now owned by the creating scope (was detached). API behaviour change.
- store.test.ts "prevents direct mutation": upstream ignores the assignment instead of throwing TypeError.
- store.test.ts "reconciles array with key": reconcile no longer merges fields absent from new data.
- store.test.ts toStringTag 'Store' test removed: upstream proxies carry no tag.
- reconcile `{ merge }` option dropped; `commit()` removed from actions; `enter/exit/enterRoot/stack` removed, `childScope/rootScope` added.

# Tests removed when core began exporting @solidjs/signals directly
Their subject is the engine, which upstream's own suite covers; barq no longer has code of its own there.
- packages/core/solid-parity/ (109 ported Solid test files and the harness that mapped Solid names onto barq's)
- core/src: actions, boundaries, map, store, store-parity, store-parity-primitives, advanced-primitives, graph, signals, primitives, reactivity-fixes, scope (.test.ts)
conformance.test.ts stays as the check on the engine version barq pins.

# Second pass: core exports Solid 2.0's API directly (no skin)
- Removed from core: `signal`, `computed`, `effect`, `renderEffect`, `scope`, `root`, `batch`, `onMount`, `linked`, `store`, `produce`, `unwrap`, `projection`, `optimistic`, `optimisticStore`, `resource`, `trackedEffect`, `reaction`, `owner`, `isTracking`. Use `createSignal`, `createMemo`, `createEffect`, `createRenderEffect`, `createRoot`, `flush`, `onSettled`, `createStore`, `snapshot`, `createProjection`, `createOptimistic`, `createOptimisticStore`, async `createMemo`, `createTrackedEffect`, `createReaction`, `createOwner`, `getObserver`.
- `context()` is `createContext()`. `bind:value` takes the `[read, write]` pair.
- Removed tests: core/src async.test.ts and loading-value.test.ts (they tested `resource` and the old pending model), three engine-semantics cases in async-graph.test.ts, the old-engine diagnostics cases.
- flow.test.ts B4: the test's cleanup closed over a shared variable; a new instance is now built before the old one is retired.
- loading-nested-region.test.ts: the fragment-as-parent shape orphans the first arm too (regions place nodes at commit).
- reveal.test.ts helper binds text through a render effect, as a compiled hole does; a plain body read is not reactive.
- conformance.test.ts: #40 and #178 pinned (cleanup of a single-function effect runs while observing).

## core, after the direct-API pass

- `conformance.test.ts`: cases #88, #89, #90, #106, #121, #177 are no longer pinned as differing by
  model. They pass on their own assertions. They had only read as failing because the engine's
  `reportError` call surfaced as an unhandled error in the runner; `test-setup.ts` now mutes it.
- `dom.test.ts` "C3.8: the style key is a Cell slot": the refusal of a Block is raised inside the
  style binding's computation, so the caller receives the engine's `StatusError` whose `cause` is the
  `ScopeMissingError`. The assertion now checks `cause`. The refusal itself is unchanged.
- `dist-entries.test.ts`, `dist-types.test.ts`: rewritten on `createRoot`/`createMemo`/`createSignal`;
  what each asserts (one shared runtime across entries; an accessor accepted where a value is) is
  unchanged.

## compiler-rs, after the direct-API pass

- `effect-counts.ts`: 13 rows re-recorded, every one lower or equal in every column. Boundaries and
  reveal groups are engine nodes and no longer count as effects (`control-flow-await-suspense` 8/11
  to 4/6, `control-flow-errored-loading` 4/5 to 2/3); the list fixtures lose one run each because a
  list no longer re-runs a binding it did not change; `signal-methods-in-handler` loses one run
  because a read after a write in the same handler sees the published value (see below).
- `oracle.test.ts` snapshots, three fixtures:
  - `class-empty-string`: the merged span reads `class="on hit"` where it read `"hit on"`. The
    `class` and `classList` bindings now apply in source order.
  - `diagnostic-accessor-coercion`: the stringified accessor is the engine's function text.
  - `signal-methods-in-handler`: `data-seen` lags the count by one. `setSeen(untrack(count))` after
    `setCount(n => n + 1)` reads the published value, because a write is staged until the flush.
- `roundtrip.test.ts` and the mode matrix lock: regenerated, the fixtures' source changed.
- `ownership-known-failures.ts`, `leak-known-failures.ts`, `mode-matrix.ts`: reach pins moved, each
  with the reason in its own text.
- `hydration-mutations.test.ts`: one test added (a mismatch raised inside a list under an `Errored`
  recovers and shows no fallback).
- `test/runtime-mutants.ts` (manual runner, in no gate) has NOT been re-pointed: its `find` strings
  target the previous `flow.ts`/`dom.ts`/`async.ts` text.

## server

- `async-autokey.test.ts`:
  - "an explicit key does not consume a child id" is now "keying a read does not renumber the reads
    after it". A memo is an engine node and holds a position whether or not it is keyed, so the old
    claim is false by construction; what it protected (a sibling's key not moving) holds more
    strongly and is what is asserted.
  - "keys are stable across a server render and the matching client render" observes each read's id
    where it is formed. A client with no session records no payload, so there is nothing to compare
    through `getHydrationData()`.
  - `latest(read)` on a read that never resolved throws `NotReadyError` (it returned `undefined`).
  - the `start()` helper is gone: a memo is computed where it is declared.
- `server.test.ts`: every async memo a test declared before its render is now declared by the page
  (`scratch/engine-migration/memo-into-render.mjs`). A memo is computed where it is declared, so one
  declared before the render ran outside the render's session and the render never waited for it.
  - "a value resolved outside any render is not seeded into one": the self-check reads the memo's
    value instead of the unattributed bucket of `getHydrationData()`. Nothing is recorded outside a
    session any more, so that bucket is always empty; the assertion that matters is unchanged.
  - "a seeded key that is still in flight" (two tests): the memo is created under a root instead of
    being forced by a read. An ownerless memo recomputes on every unobserved read.
  - "a Loading fallback that is itself not ready": the cells are declared by the page, outside the
    boundary, instead of with no owner.
  - widened by the move, the "no `<` in any shipped snippet" assertion caught two shipped snippets
    that contained one (`ADAPTER_BOOTSTRAP`, `SEED_SETTLE_GUARD`); both loops are now `forEach`.

## compiler-rs, Rust unit tests

48 unit tests asserted the scope-first convention `b2a4a96` removed. 45 were restated in the current
convention (five renamed, since their names said "takes a scope"). Three were failing for real
defects, fixed in the compiler rather than in the test:

- a nullary thunk with a STATEMENT body that returns DOM crossed as a Cell (`thunk_builds_dom` read
  expression bodies only, the verifier read both). Now branded. Moves the `control-flow-show-cleanup-body`
  snapshot and the l4 fixtures with statement-body content in the mode matrix.
- a flow construct's data props (`each`, `when`, a `Dynamic` component) were lowered as construction
  slots, so `each={(x) => f()}` was branded a Block and refused by the runtime. Only named
  construction channels and `construction_slot` brand now.
- a row callback bound to a name (`<For each={rows}>{row}</For>`) was wrapped `() => row`, so the
  runtime's call returned the function and the item never arrived. It is `_$block(row)` now.
  `a_row_callback_parameter_is_not_a_props_object` asserts the use-site brand; the definition-site
  brand it used to assert is no longer emitted.

## router

- No test assertion weakened. `m8-convention.test.ts` reads source text and now looks for
  `createSignal<Location>(history.current())`. One test-level memo in `server.test.ts` moved into
  its render function.
- Code changes the tests drove:
  - a loader memo is eager, so the cache entry is built before the memo that fills it in;
  - the commit and `primeChain` `flush()` before reading derived state (a write is staged until then;
    without it a navigation revalidated the page being left and a loader ran twice);
  - a `blocking` reload: the engine serves the stale value through a re-ask, so the reader throws
    until the reload settles, and the depth boundary is keyed on `blockingReloads` as well as the
    pathname so the fallback comes back. `RouterState.blockingReloads` is new public surface;
  - the server's error boundary hands its fallback the application's error rather than the engine's
    wrapper (`thrownBy`, exported from `@barqjs/core/internal`).

## the strict (development) engine build

`vite dev` and vitest resolve `@solidjs/signals`' development build, which throws on authoring-rule
violations the production build tolerates. `bun test` resolves the production build, so nothing
had been run against it. Core now runs both (`package.json` `test`).

Runtime changes this forced, each a real defect and not a test accommodation:

- Event handlers (delegated and `listen`) ran under the element's owner. The strict build refuses a
  signal write under any ambient owner, so every state-writing handler threw. Handlers now run under
  no owner; a throw is still routed to the element's boundary. `delegate-events.test.ts` "work
  created in a handler is owned by that scope and dies with it" is restated as "it writes state, and
  what it creates is owned by the scope it names": the old property and a writable handler cannot
  both hold. THIS IS A BEHAVIOUR CHANGE: `getOwner()`/`useContext()` inside a handler now find
  nothing and must be captured during setup.
- `style`/`classList` objects with getter-valued keys that reached a binding's write half created a
  per-key effect there, owned by nothing (never disposed). The keys are now read in the binding's
  read half (`readKeys`, emitted by the compiler for dynamic values, used by `spread`, `bindProp`
  and the interpreter backend). One test added in `dom.test.ts`.

Test-only restructuring for the strict build, no assertion changed: signal writes and `refresh`
moved out of root bodies (`async-graph`, `dom`, `context` tests); cleanups registered with
`onCleanup` inside `createTrackedEffect` now sit in an owning effect's compute or are returned from
the callback (`context`, `rendering`); two bare `Errored` calls are made under a root.

`conformance.test.ts`: the adapter runs each case under no owner and gives each node its own root.
Under the strict build ten nested-effect cases and #57 are labelled as differing by model (the build
refuses them), and #182/#183 are not (the refused write makes their assertion hold).

## primitives

- Public: `history(source)` takes a `[get, set]` pair; `persisted`/`persistedSession` return one;
  `bounds()` fields are plain accessors. `machine.send` no longer flushes (state shows at the next
  flush); `geolocation` `watching`, `raf` `running`, `websocket` state, `ref` are `ownedWrite`.
- Tests: 13 got one `flush()` after creating a tracked effect (it first runs at the next flush);
  three `machine` tests got a `flush()` between `send` and the read; `event.test.ts` "runs the
  handler under the owner that bound it" is inverted to assert `getOwner() === null` in a handler
  and the binding owner under `owned()`; the boundary-routing test uses core's `boundary`. Four
  tests added (`scheduled`, three for `machine.send`). Everything else is restructuring so writes
  happen after a root body returns.

## aria

- Public: `handleLinkClick(event, href, active: Router)` takes the router captured at setup;
  `dateFormatter(options?, locale?)` gained an optional locale. `messageScroller` `atEnd`/
  `scrollable` are `ownedWrite` (its `attach` is a ref callback); one test added for that.
- No assertion changed. Five `controllable` tests restructured (write after the root body).

## ui

- No public signature and no assertion changed. `ownedWrite` on signals a child registers into from
  its body (`resizable`, `navigation-menu`, `sidebar`, `carousel`); `MessageScrollerViewport`
  attaches in `onSettled`. One test added (`carousel`). `registry/*.json` regenerated.

## query

- Subscriptions stay render effects (a user effect under a pending `Loading` never runs, so a
  suspense query would never be told its data arrived); every delivery, the first included, goes
  through the notify manager so no store is written while a component is being built. Stores are
  written with draft setters. No assertion changed.

## testing (docs)

- `docs.test.tsx` mirrors the READMEs, both rewritten for the current API. Tests renamed with their
  section ("a resource…" is "an async memo…", "batch flushes once…" is "two writes land in one
  flush…", "linked…" is "createSignal(fn)…", "onMount…" is "onSettled…"); one added. The core
  README's paragraph about aborting a superseded fetch is removed: no `AbortSignal` reaches an
  async memo.

## kitchen-sink

- `/async` is `ssr: false` (its demos fetch a relative URL, which an async memo surfaces as a
  failure on the server where `resource` swallowed it). `commit` demo is `createOptimistic` over an
  action. One pre-existing bug fixed in `shared.tsx` (`disabled={isDisabled()}` read once).

## create-barq, CI

- `test/scaffold.test.ts` listed the deleted `extra` package among those it builds; removed.
  `.github/workflows/ci.yml` verified `packages/extra/dist`; it now verifies `query`.

## found by driving the built docs site (all present at HEAD, fixed here)

- Hydration: `<Badge>Label <i/></Badge>`. The element was claimed while the cursor stood on the
  string's text, which read as a structure mismatch and threw the page away (12 site routes). A
  template claim now sets text aside and the string child adopts it (`claimText`). Four shapes added
  to `hydration-mutations.test.ts`.
- Hydration: a `Show` inside a fragment inside a static hole claimed its empty range in place and
  returned `[null]`; the hole reconciled that against the range and removed its comments, so the
  branch later inserted beside a detached node (the site's mobile menu never opened). `hole` now
  tells `insert` what was taken in place. One test added.
- A throwing `ref` under an `Errored` was routed by writing the boundary's own signal while its
  content was computing, and nothing re-ran: the error vanished. `ref` now lets it throw, which the
  engine takes to the boundary. `core/src/ref-throw.test.ts` added.
- Compiler: `{label().text}` was applied once where `{label()}` was a live hole (the thunk verdict
  stopped at the member read). Fixed in `classify.rs`; one Rust test added.
  `control-flow-errored-loading` gains one effect for `{error().message}`; its effect row, the leak
  and ownership reach pins and two snapshots moved. `component-through-cast.test.ts` separated a
  detected component from an undetected one by that same spent read, so it now uses a bare prop
  read (`props.label` handed over against `() => props.label()` wrapped).
- `@barqjs/compiler` vite plugin set `resolve.conditions` to `["barq"]`, which REPLACES Vite's
  defaults: `module`, `browser`/`node` and `development|production` were gone from every
  environment, so `vite dev` loaded production builds of dependencies. It now prepends to the
  defaults. Consequence: `vite dev` runs the engine's strict development build. One test added.
- Lint: 61 of the 63 findings that pre-date this work fixed (unused `getOwner`/`Scope` imports and
  `scope` test parameters, the router's import cycle via `ROOT_ROUTE_ID` moving to `route.ts`).
- `.github/typecheck-baseline.txt` re-recorded: 128 errors, every one present at HEAD (HEAD has
  134); none is new.

## Rendering, SSR and start pass (2026-10-13)

Assertions restated, each because the behaviour it pinned was the defect:

- `compiler-rs/src/passes/shape.rs` `a_moving_child_is_a_hole_beside_a_sibling_that_builds`:
  `[Icon({}), Other({})]` is now `[Icon({}), _$block(() => Other({}))]`. A construction after
  anything that may build later (a component, a fragment, a thunk) is deferred, so an array's
  parts are built in the order they are written. Bare, the second was built first and claimed
  the first one's node on a hydrating page.
- `compiler-rs/test/__snapshots__/oracle.test.ts.snap` `bind-family`, `property-attrs`: a checkbox
  first written `false` and later `true` no longer gains a `checked` attribute. The attribute is
  the DEFAULT and only the first write decides it, which `forms.ts` already documented and the
  text input in the same golden already obeyed.
- `compiler-rs/test/__snapshots__/{roundtrip,modes}.test.ts.snap`: emitted code for
  `spread-static-mix` (a spread is told the names written after it), `nested-fragments`,
  `sem-err-construction-throw` (an author thunk returning an array of JSX is a Block) and
  `sem-form-selection-preserved` (a `<select>`'s value is written after its options).
- `compiler-rs/test/effect-counts.ts` `component-children-slot` 3 -> 2 created; leak reach
  284 -> 283 effects; ownership reach 252 -> 250. A children Block is built once and placed,
  not wrapped in an effect.
- `compiler-rs/test/hydration.ts`: the `control-flow-await-suspense` known-failure row is gone;
  it hydrates at 100% reuse.
- `compiler-rs/test/{hydration,stream-hydration}.test.ts`: the hydrated page is disposed and
  removed BEFORE the cold one is rendered. Both carry `#portal-target`, and a portal mounts
  synchronously now, so the cold page's portal was mounting into the hydrated page.
- `core/src/unit-root-cell.test.ts` (reviewer's repro): drives the lowering the compiler now
  emits, `block(() => [() => count()])`, rather than a bare `() => count()` body.
- `core/src/loading-nested-region.test.ts`: helper parameter type widened to
  `Node | Node[] | null` (a claimed region hands back its nodes). No assertion changed.
- `start/src/vite.test.ts:296`: generated `serve.js` passes `new URL("../client", import.meta.url)`
  and no `.pathname`, which lost every asset under a project path holding a space.
- `site/src/gallery.tsx`: `PreviewPortal` read `props.target()()` against a prop the compiler
  forwards as the Cell itself, so opening a select inside the preview threw. Source fix, not a
  test.

## Liveness, async waterfall and id pass (2026-10-13, second)

- `compiler-rs/src/compile.rs` `an_unresolvable_origin_is_opaque_and_costs_the_runtime_nothing_extra`
  is now `an_unresolvable_origin_is_opaque_and_its_call_crosses_as_a_cell`: the expected emission
  for `title={c()}` over a barrel-imported `createSignal` changes from
  `_$bindProp(el, _$setAttr, "title", c())` to `_$bindProp(el, _$setAttr, "title", () => c())`.
  The old form ran the call at the call site, so the attribute was written once and never moved
  while the same call at a text hole stayed live. The runtime still makes the decision; it is
  handed the call rather than the call's result. Still no `_$bindEffect`.
- `server/src/async-autokey.test.ts` "keys are stable across a server render and the matching
  client render": observed the client key as `getOwner().id`, which assumed a key IS the engine
  id. Keys are barq's own numbering now, so the test seeds the client with the server payload and
  requires each of the three nested memos to read its own label with no fetch. Same property,
  observed by its effect.
- `compiler-rs/test/{portal-hydration,unique-id-hydration,async-key-hydration}.test.ts`: module
  exports reached through a typed cast (`compiled.dom as unknown as {…}`). No assertion changed.
- `start/src/server.test.ts:725,766-769,788`: the three exact `Set-Cookie` lines gain `; Path=/`
  (patch `scratch/engine-migration/cookie-default-path.patch`, applied). Their subject is append
  semantics; the path is the new default, without which a cookie set from a server function is
  scoped to `/_barq/fn` and no page receives it.
- `start/src/rate-limit.test.ts:141` (leftmost `X-Forwarded-For` for `true`) is unchanged; the
  safe form is the added `xForwardedFor: { trustedProxies: n }`.

## Compiler pass (2026-10-13, third)

- `compiler-rs/test/optimality.test.ts` "spread: the element keeps its template and the attribute
  list is applied in source order": the needles change from `_$setAttr(_el$1, "id"`,
  `_$spread(`, `_$setClass(` to `_$spread(`, `"id": "fixed"`, `...extra()`, `_$setClass(`. An
  attribute written before a spread is now a key of the object the spread reads, so the spread
  is the one writer of that name: it wins while it has the key and the earlier value is what is
  left when it drops it. Source order and the kept template are still what is asserted.
- `compiler-rs/src/passes/shape.rs` `an_opaque_call_at_a_hole_is_thunked_rather_than_spent` and
  `an_opaque_call_in_an_attribute_is_thunked_rather_than_spent`: the fixture's callee is an
  import instead of a local `() => "n" + n()`. A local function that reads a signal is PROVED
  now and no longer an example of an unknown call; assertions unchanged.
- `compiler-rs/test/__snapshots__/{roundtrip,modes}.test.ts.snap`: `props-rest-spread` and
  `spread-static-mix` emit the folded spread object.
- `compiler-rs/fixtures/control-flow-for-keyed-by-item.tsx` and `for-each-local-function.tsx`
  (`optimality` declarations, DESIGN O3): the row hole was required to be `row.text` bare and
  `() => item.name` was required to be ABSENT. Both now require the thunk. O3 held that a row is
  rebuilt whenever its item changes, so a field read once is enough; a store writes a field in
  place and the row is the same object, so `<For each={state.rows}>{(row) => <li>{row.label}</li>}`
  never updated (`test/store-rows.test.ts`). A member read off a row, a hook's result or an import
  crosses as a read; a literal table of constants (`const labels = { open: "open" }`) is still
  read once.
- `compiler-rs/test/effect-counts.ts`: `control-flow-for` created 4 -> 7, `control-flow-for-keyed-by-item`
  1 -> 5, `control-flow-show-keyed` 1 -> 4, `for-each-local-function` 1 -> 4, `table-rows` 4 -> 10.
  Leak reach 283 -> 324 effects, ownership reach 250 -> 275 (`control-flow-for` ends at 10, `table-rows` at 13, once `String(row.id)` is live too). One effect per row binding that reads
  a field, which is what Solid pays. A proxy test at the row could win it back for plain data.
- `compiler-rs/test/__snapshots__/{roundtrip,modes}.test.ts.snap`: the five fixtures above.
- Delegated-event expando renamed `$$<type>` -> `__bq_<type>` and `$$s` -> `__bqs`, in
  `core/src/dom.ts`, `core/src/interp.ts`, both compiler backends, and every test, fixture
  `optimality.emits` needle and snapshot that spells the emitted name. Solid 1 stores its
  delegated handlers under `$$<type>` and its document listener calls whatever it finds there,
  so one Solid 1 widget on a page (any TanStack devtools panel) ran every barq handler twice.
  Mechanical: no assertion's meaning changed.
- `compiler-rs/src/analysis/mod.rs` `d1_keys_on_the_binding_and_stays_silent_where_it_cannot_see`:
  the silent case `<p>{props.total * 2}</p>` became `<p>{props.total() * 2}</p>`. Its premise,
  "props lower to getters", stopped being true when props became Cells: the uncalled form
  renders `NaN` (checked by rendering it). BARQ001 and BARQ003 now fire on `props.x` used as a
  value; `props.x ? … : …` and `=== undefined` stay silent because that is how a prop's presence
  is asked about.

## Diagnostics and server-effects pass (2026-10-14)

- `server/src/server.test.ts` "settle waits through async waterfalls (session-scoped)": the
  observer inside the session was a `createTrackedEffect`; it is a `createRenderEffect` now.
  `createEffect`, `createTrackedEffect` and `onSettled` do nothing during a server render
  (Solid's rule; an `onSettled` that touched `document` was taking the server process down),
  so an effect can no longer be the thing that watches a value there. The assertion,
  `seen === [2]` after `settle(session)`, is unchanged.
- `compiler/src/vite.test.ts` "the panel client is a virtual module": two assertions on the
  client's SOURCE TEXT (`not.toContain("open = open ||")`, `toContain("digest !== seen")`) are
  gone. The property they stood for, a repeated payload does not re-open a closed overlay, is
  asserted by driving the overlay in `compiler/src/overlay.test.ts`.
- `compiler` plugin option `overlay` defaults to `"error"` (was `"warning"`): a warning raises
  the count in the corner and no longer opens the panel over the page.

## Test inputs restated after the server-effects gate and ref forwarding

- `packages/virtual/src/index.test.tsx` "renderToString emits the first window and leaves nothing observed": the List now passes `initialRect: { width: 300, height: 200 }`. Its rows used to come from `onSettled` measuring the happy-dom scroller during `renderToString`; effects no longer run during server render, so the first server window comes from `initialRect`, as in the real SSR fixture. Assertions unchanged.
- `packages/ui-cli/test/cli.test.ts` "nothing is installed when the project already has it all": the project's dependencies gain `@barqjs/primitives`, which `slot.ts` now imports for ref forwarding. Assertions unchanged.

## Hydration grammar sweep (2026-10-15)

- `compiler-rs/test/__snapshots__/modes.test.ts.snap` "the matrix is locked": the
  `dom-hydratable` digest of `corpus/portal` and `l4/c7-portal` moved, and only that column. A
  portal that fills a hole is now built inside `hole(...)` and, where the position owns its
  parent's child list, inserted with `WHOLE`: the string backend writes nothing there, and the
  client claimed a range the server never wrote (a recovered page), or, built outside the hole,
  the portal took the next region's range for its own. Every other column is byte-identical.

## Server rendering: late failures and error-boundary fallbacks (2026-10-15)

- `compiler-rs/test/hydration.ts` `HYDRATION_KNOWN`: the rows for `control-flow-error-boundary`
  (reuse 33), `control-flow-errored-loading` (reuse 67) and `flow-prop-eta-boundary` (reuse 94)
  are removed. An error boundary that caught on the server now writes its fallback under
  `<!--[f:-->`, which the client already reads as "these nodes are the fallback", so the client
  builds the failing content aside and its fallback claims the server's nodes: all three now
  claim 100% with no mismatch. Without a row a fixture is held to the strict standard (no
  recovery, no mismatch, 100% reuse, hydrated shape equals the cold one), and the "every
  registered row is still failing" guard requires the rows to go once they pass.
- `compiler-rs/src/ir/region.rs` `a_streaming_boundary_never_takes_the_undelimited_form` is now
  `a_boundary_never_takes_the_undelimited_form`: `RegionKind::Error` moved from the list that
  ships `WHOLE` to the list that never does, beside `Loading`. Whether a body throws is a
  run-time fact like whether a promise is ready, and a caught boundary writes `<!--[f:-->`
  comments the client must not read as "no comments here". Branch, Each and Portal still ship
  it, asserted as before.

## start: server functions answer GET

- `packages/start/src/server.test.ts` "`method: 'GET'` is refused, and says why" is now "a
  method other than GET or POST is refused, and says why". `createServerFn({ method: "GET" })`
  is implemented (TanStack Start parity: a read the browser or a CDN may cache), so asserting it
  throws would assert the feature away. The behaviour the old test protected, that a link, an
  `<img>`, a prefetch or a navigation can never invoke a server function, is kept and covered in
  `packages/start/src/get.test.ts`: a GET without the `x-barq-fn` header that only script can
  set answers 403, a cross-site GET answers 403, a GET to a POST function still answers 405
  (`server.test.ts` "GET is refused" and `global-middleware.test.ts` are unchanged), and a GET
  on the form channel answers 404. An unsupported method (`PUT`) is still refused with the reason.
- `compiler-rs/test/__snapshots__/modes.test.ts.snap` "the matrix is locked": the
  `dom-hydratable` and `ssr-hydratable` digests of `l4/c7-error-boundary`,
  `l4/c7-error-boundary-fallback`, `semantics/sem-err-notready-passthrough` and
  `corpus/control-flow-error-boundary` moved, and only
  those two columns: their error boundary is the only child of its element and no longer ships
  `WHOLE`, so both backends write and claim the boundary's own comments. Every other column of
  those rows is byte-identical.

## DOM output: a lone `class` binding is a scalar effect

- `compiler-rs/test/__snapshots__/roundtrip.test.ts.snap` "emitted code snapshots" for
  `class-empty-string`, `class-list-array-object`, `dashboard-composite`, `read-mode-binding`
  and `table-rows`: an element whose only live binding is `class` now emits
  `_$bindEffect(() => _$classToString(read), (_v$, _p$) => { _$setClass(el, "class", _v$, _p$); })`
  (the `classToString` call is left out when the expression can only be a string) instead of
  the one-slot record `({ a: read })`. The compute returns the applied class string, so an
  unchanged class stops at the effect's equality check and the write half does not run; the
  record allocated an object per run and always ran the write. Only the emitted text moved.
  What the old shape protected (the class follows its reads, a foreign token survives, a
  multi-prop element still fuses into one record) is covered by the unchanged runtime suites,
  `effect-counts`, the hydration grammar, and `compiler-rs/test/class-binding.test.ts`, which also
  pins a new fix: a class map held in a store now follows a key written inside it.
- `compiler-rs/test/__snapshots__/modes.test.ts.snap` "the matrix is locked": the `dom-O0` digest, and
  the `dom-Ox` and `dom-hydratable` digests where the optimiser leaves a lone class binding, of `corpus/class-empty-string`,
  `corpus/class-list-array-object`, `corpus/class-owns-only-its-tokens`,
  `corpus/class-with-live-siblings`, `corpus/dashboard-composite`, `corpus/equal-liveness`,
  `corpus/reactive-attribute`, `corpus/read-mode-binding`, `corpus/svg-dynamic-class`,
  `corpus/table-rows` and `semantics/sem-own-given-scope-wins`, for the same emission change.
  Checked by digesting the matrix with a compiler built from the tree minus this change: those
  eleven rows matched the lock, and only `corpus/control-flow-error-boundary` (not this change)
  differed.
- `compiler-rs/src/passes/shape.rs` `a_tracked_read_beside_an_unknown_member_is_still_tracked`:
  the attribute half now expects `_$bindEffect(() => _$classToString(on() ? styles.on : styles.off)`
  where it expected `_$bindEffect(() => ({ a: on() ? styles.on : styles.off })`. The test is about
  the read staying inside a tracked compute next to an unclassifiable member, which the new
  string still asserts; only the record around it is gone.

## @barqjs/css, dynamic groups

- `packages/css/src/ergonomics.test.ts` "a condition is skipped rather than named as if it were a
  property" is now "a condition is its own variable rather than named as if it were a property".
  `dynamic` now takes values under conditions (`{ ":hover": { color: c } }`, `{ color: { default:
  c, "@media …": d } }`), which it used to drop without a word at run time while the compiler
  declined the call. The `:hover` value now has a variable named for `color` under `:hover`, so the
  expected `$vars` gained that entry and `$class` two atoms instead of one. What the old assertion
  protected, that a condition key is never taken for a property name, is still asserted: no
  variable name contains the condition's text.
- `compiler-rs/test/__snapshots__/modes.test.ts.snap`, again for `corpus/control-flow-error-boundary`
  (`dom-hydratable`, `ssr-hydratable`): the row had gone back to its old digests in the
  working tree, so the update above was re-applied.

## SSR attribute emission (2026-10-15)

- `compiler-rs/test/__snapshots__/modes.test.ts.snap` "the matrix is locked": the `ssr-Ox`,
  `ssr-O0` and `ssr-hydratable` digests moved for `auto-thunked-read`,
  `component-forwarded-handler-tuple`, `component-function-props`, `control-flow-for`,
  `escaped-text-and-attribute`, `escaping-adversarial`, `for-unkeyed-rows`, `live-call-hole`,
  `signal-alias`, `static-attribute-expression` and `table-rows`, and only those columns. Each
  has an attribute whose value is provably a string (a template, `String(…)`, a `+` with a
  string side, or a literal the -O0 build does not fold), which now writes its name and quotes
  into the template and calls `escAttr` for the value instead of `attrLit`. The markup is
  unchanged: the dual-render, oracle and hydration suites compare it byte for byte and pass.
  Columns other agents moved were left alone.

## DOM output: a component called where a compute may run is untracked (R1)

- `compiler-rs/src/passes/shape.rs` `a_choice_of_components_at_a_hole_is_a_choice_rather_than_a_result`
  and `a_moving_child_is_a_hole_beside_a_sibling_that_builds`: a component reached through a
  choice now emits `_$untrack(() => A({}))` inside the thunk, so the expected strings
  `() => on() ? A({}) : B({})` and `[() => on() ? A({}) : B({})]` gained the wrapper. Without it
  a signal read in the component's setup became a dependency of the hole and rebuilt the
  component (SEMANTICS R1). What the tests protect, the thunk on the choice, is asserted
  unchanged. The negative check `!code.contains("() => A({}))")`, which meant "a directly
  written child is placed once with no closure", would now match the wrapper of the other two
  holes, so it is restated as the positive `_$insert(_el$3, A({}))`.
- `compiler-rs/test/__snapshots__/modes.test.ts.snap` "the matrix is locked": the DOM-side
  digests of `semantics/sem-err-construction-throw` for the same wrapper.

## `dynamic` helper renamed `resolveDynamic`

- `compiler-rs/test/optimality.test.ts` and `compiler-rs/test/optimisation.test.ts` list the
  primitives by emitted name; `_$dynamic(` / `"dynamic"` became `_$resolveDynamic(` /
  `"resolveDynamic"`. `core/src/control-flow-parity.test.ts` and
  `server/src/dynamic-tag.test.ts` call the renamed function. Nothing they assert changed.
- `compiler-rs/test/__snapshots__/roundtrip.test.ts.snap` "emitted code snapshots dynamic" and
  the matrix rows `corpus/dynamic` and `l4/c7-dynamic` (all seven columns, since both backends
  import the helper): the import and call spell the new name. The name is freed so core can
  export Solid 2.0's `dynamic(source)` factory.

## reactive-framework-test-suite 0.1.0

- `core/src/conformance.test.ts`: the upgrade adds cases, and three of them assert a
  model the engine does not run, so they join the `differs` table and are expected to fail.
  #233 reads a memo right after a cleanup writes its source, and #235 reads a signal right
  after writing it inside a batch. Both see the published value, which is the reason #67 and
  its peers already carry. #242 expects a memo's previous child effect to clean up before the
  memo re-runs. The engine retires a re-run's old children when the flush commits
  (`disposeChildren` in `core/owner.js`, "a re-pass leaves the frame reacting until the
  commit"), so the cleanup comes after the new run. A case in the table that starts passing
  fails the suite, so the table cannot go stale silently.
- The same file, development build only: #226, #227, #228, #237, #238, #241, #243 and #244
  create an effect inside an effect, which that build refuses with
  `PRIMITIVE_IN_FORBIDDEN_SCOPE`. They join the strict list beside #43 and its peers. The
  production build passes all eight.

## BARQ005 reports a destructured prop at its misuse

Every prop arrives as a Cell, so a name destructured from the parameter list is a live
function and `{text}` in JSX is correct. The rule used to fire on the pattern itself; it now
fires on a name used as a value, a non-function literal default that is called or used as a
value, and a pattern nested under a prop's key.

- `compiler-rs/src/analysis/mod.rs` `d3_fires_on_a_destructured_parameter_list_and_only_there`:
  the three `fires` sources wrote the names only in JSX, which is now silent. Each keeps its
  shape (a tagged function, an exported arrow, a default export) and gains a misuse: a
  template literal, a `.length` read and a `+`. The `silent` sources gained a misuse too, so
  they still prove the row-callback, no-evidence, arity and no-JSX bounds rather than
  passing for lack of one.
- `compiler-rs/test/diagnostics.test.ts` "every advertised code is reachable": the BARQ005
  source `({ text }) => <p>{text}</p>` is correct code, so it became `` <p>{`#${text}`}</p> ``.
- The same file, "fires on exactly two fixtures in the corpus": `props-destructured-param:BARQ005`
  is gone, because the fixture uses its destructured names only in JSX. The title and the
  comment above it now say one fixture.

## A stream places an error boundary's fallback for a failure after the shell

- `server/src/late-failure.test.ts` "a stream keeps the loading fallback it sent and reports
  the failure": asserted the shell `<main><!--[--><!--[b:0-->…` and no `<template>`, which was
  the stream leaving the skeleton on the page until client script rebuilt the boundary. The
  stream now writes the error boundary's content as `<!--[e:1-->` and swaps its fallback in
  over the whole range, so the case is restated as "places the error boundary's fallback
  over everything it held": the shell is `<main><!--[e:1--><!--[b:0-->…`, the fallback
  arrives in `<template data-barq="1">` with `__BARQ_SWAP__(1,false,true)`, and the failure
  is still reported. The old no-template assertion survives where it still holds, in "keeps
  the loading fallback when no error boundary stands around it".
- `compiler-rs/test/stream-hydration.test.ts` "a failure the stream cannot place is left to
  the client, and a buffered page places it": asserted `swaps: 0`, `templates: 0` and a
  streamed page still showing `skel`. `stream-errored-around-boundary` now streams one swap
  and converges on the buffered page, so it joins the generic "defers, swaps, converges and
  hydrates" rows (and the one-template-one-swap row) instead of being skipped by them, and
  the case is restated as "a failure after the shell streams the error fallback, and the
  client claims and resets it".

## Negative type assertions without directives

- `router/src/register.test.ts`: each row that wrote a call under a directive expecting a type
  error is restated as a `Refused<Value, Type>` predicate the type checker must prove `true`.
  The navigate, redirect and linkOptions rows assert against the options type each one takes
  (`NavigateOptionsFor`, and the instantiated parameter of `redirect` and `linkOptions`) rather
  than against a call. What each row refuses is unchanged.
- `start/src/types.test.ts`: the same, through `Refused` and `Uncallable` (a call's arguments
  against `Parameters` of the function). The handler and validator rows assert against
  `ResultCheck` and `InputCheck`, the intersection `.handler` and `.validator` hold their
  argument to. Each carries a positive control that the predicate is `false` for a value the
  builder accepts.
- `start/src/server.test.ts` and `start/src/get.test.ts`: the runtime refusal of a plain
  function by `mount`, of `PUT` by `createServerFn`, and of a form by a GET stub is reached
  through `Reflect.apply`, which is what an untyped caller is; the type refusal is asserted
  beside it as a predicate.
- `router/src/matcher.test.ts` "`Outlet` ... takes no props": asserted that a closure calling
  `Outlet({ id })` was a function. It now asserts `Parameters<typeof Outlet>` is empty.
- `start/src/server.test.ts` "a middleware that rotates a cookie and THEN refuses": the
  unreachable `return next()` after the `throw` is gone. The test asserts what it did.

## Server functions default to GET, and a thrown Response is rethrown

- `compiler-rs/src/analysis/server_fn.rs` "a function is GET unless it says POST" (was "a GET
  function says so and a POST one does not"): `plain` (no options) and `dynamic` (a method the
  scan cannot read) now expect `Some("GET")`, the default, where they expected `None`.
- `compiler-rs/src/compile.rs`: four fixtures named `save` declare `{ method: "POST" }`, so
  their stubs are the POST stubs the assertions already named. Nothing they assert changed.
- `start/src/{streaming,validators,global-middleware,get,server,start-options,fn-meta}.test.ts`:
  fixtures a test calls over POST declare `{ method: "POST" }`. The assertions are unchanged.
- `start/src/types.test.ts` "a schema's input is what the caller passes": the parameter of a
  function that names no method is `{ data } & ServerFnCallOptions` with no `| FormData`, since
  a GET has no body to carry a form.
- `start/test/dev-server.test.ts` and `start/test/dev-base.test.ts`: `listTodos` is a read and
  now a GET, so they call it with the payload in the query and the caller header.
- `start/src/call-options.test.ts` "a refusal the server wrote": the call rejects with the
  thrown `Response` itself, as TanStack's does, where it rejected with a `ServerFnError`
  holding it. Status, header and body are asserted as before.
- `testing/src/server.test.ts`: three fixtures declare `POST` (the test that POSTs, the one
  that proves the POST gate, and the form one). `callServerFn` sends the method the mounted
  function answers.
- `start/src/vite.test.ts` "mounts exactly the ids the client stubs call" and "the compiler
  spells an id the same way the plugin does": a stub for a function that names no method is
  `clientRpc(id, [], { method: "GET" })`, so the id is read up to the first `,` or `)` and the
  expected stub text carries the method. The ids compared are unchanged.

## Solid 2.0's removed and deprecated APIs dropped

Tests whose subject was an API Solid 2.0 removed or deprecates (`Context.Provider`,
`mergeProps`, `splitProps`, `classList`, `createTrackedEffect`, `storePath`, the `on:`,
`capture:`, `attr:`, `bool:` and `style:` namespaces) were migrated to the replacement or
deleted with it.

- `core/src/context-provider.test.ts` "is a function, and `.Provider` is the same function"
  now asserts the context has no `Provider` member.
- `core/src/context-miss.test.ts` "useContext names the context it could not find": the
  message tells the reader to wrap the component in the context, `<Theme value={…}>`,
  instead of in its `Provider`.
- `core/src/dom-classlist.test.ts` deleted with `classList`; `dom-class-values.test.ts`
  covers `class` given maps and nested lists through `setProp`, `element` and `spread`, and
  that `classList` is an ordinary attribute. `dom-svg.test.ts` "SVG classList" became "SVG
  class values" with the same four shapes on `class`.
- `core/src/channel-clear.test.ts` "one css declaration given undefined is taken off"
  deleted with `setStyleProp`.
- `core/src/dom.test.ts` "the capture: namespace is the verbatim form" now asserts that
  `capture:keydown` and `on:keydown` are attributes and bind no listener.
- `core/src/props.test.ts`: the `mergeProps` laziness case runs on `merge`; the
  `splitProps` case is deleted (`omit` has its own); "mergeProps skips a later undefined;
  merge treats it as a value" keeps only the `merge` half; the sequence case drops its
  `splitProps` step.
- `core/src/rendering.test.ts`: the `splitProps` block asserts `omit`'s result (the picked
  half has no 2.0 counterpart); the `mergeProps` block runs on `merge` unchanged.
- `core/src/jsx-types/*.types.tsx`: the namespace and `classList` positives became
  negatives, a class list may hold maps and lists, and the `mergeProps` type cases moved
  onto `merge`.
- `core/src/conformance.test.ts` imports `createTrackedEffect` from `@solidjs/signals`,
  since the suite's single-function `effect` needs it and barq does not export it.
- `server/src/ssr.test.ts`: the `classList` and `clsList` expectations are gone with the
  attribute; the class oracle drops the `classList` name and gains nested-list values.
- `server/src/effects-on-server.test.ts` "outside a render they run as they always have":
  expected `["effect", "settled"]` instead of also logging a tracked effect.
- `testing/src/docs.test.tsx` "context, read through a Provider" renders `<Theme value>`.
- `compiler-rs/src/tables.rs`, `lower/names.rs`, `ir/intern.rs`: `classList` left the
  intercepted-name lists and is asserted as an ordinary name; the generator-sensitivity
  edit moved from the `classList` branch to the `dangerouslySetInnerHTML` one.
- `compiler-rs/src/compile.rs`: the capture test uses `onClickCapture` instead of
  `capture:click`; the threaded-record test uses `class` in place of `classList`; the
  intercepted-constant test drops its `classList` attribute.
- `compiler-rs/src/ownership.rs`, `passes/shape.rs`: provider cases are written
  `<Ctx value>` and the node is labelled `Ctx`.
- `site/src/blocks/sidebar-10.test.tsx`: five cases now dismiss the self-opening page
  actions popover first (`closePageActions`), as the team-button case already did. The
  popover's outside-press listener sits in `interactOutside`, which ran as a
  `createTrackedEffect` that never saw `isOpen` turn true in the same flush, so a press
  outside an open popover went through. As `createEffect` it arms, and the first outside
  press only dismisses the popover, which is what the file's own comment states. No
  expectation changed.
- `compiler-rs/fixtures`: `class-list-prop`, `attribute-namespaces`, `class-empty-string`,
  `class-owns-only-its-tokens`, `class-with-live-siblings` and `context-provider` were
  rewritten onto `class` lists and maps, plain attributes, a ref-added listener and
  `<Theme value>`, with their `emits`/`absent` restated to match. The member-tag claim
  `(0, Theme.Provider)(` left `context-provider`; `src/compile.rs` still pins it.
  `sem-err-handler-throw` dispatches `mouseenter` through `onMouseEnter` instead of a
  custom `on:my-signal`. The `sem-ctx-*` regexes find the provider call by the context's
  name (`Outer(`, `Ctx(`, `Locale(`).
- `compiler-rs/test/ownership-census.ts` `own-cross-module`: `opaque` is `["Theme",
  "Card"]`. `Theme` is imported, so `<Theme value>` is an ordinary component the tree
  cannot follow, where `.Provider` used to be recognised by name. Clone and unattributed
  counts are unchanged.
- `compiler-rs/test/optimisation.test.ts` "normalising channel still removes": the probe
  uses `style`, since `setClass` recovers its previous value from the element and a class
  map no longer separates the mutant.
- `compiler-rs/test/generator.ts`, `differential.test.ts`: the "classList object" feature
  is "class map". `tracer.ts` lists `onSettled` where it listed `createTrackedEffect`.
- Snapshots: `roundtrip.test.ts.snap` (emitted code of the six rewritten fixtures),
  `oracle.test.ts.snap` rendered DOM of `class-empty-string`, `class-list-prop` and
  `class-with-live-siblings` (same tokens, list order), `modes.test.ts.snap` digests of the
  23 edited fixtures.

## Delegated events owned by the render root

`render` and `hydrate` listen on their container and stop when the root is disposed, as
Solid 2.0's do; `clearDelegatedEvents` is gone. A handler on an element no root rendered no
longer runs, so tests that dispatched on loose elements under `document.body` now render
into a root first. No expectation about what a handler does changed.

- `core/src/delegate-events.test.ts`: the container is a render root in `beforeEach`.
  "installs a document listener…" counts the container's listener instead of the
  document's. The two `clearDelegatedEvents` cases are restated as "a handler is dead once
  its root is disposed, and lives again under a new root" and "a disposed root's container
  is listened to again by the next root". The non-bubbling warning case delegates `blur`
  instead of `focus`, because the warning is once per type per process and the
  `DELEGATED_EVENT_DOES_NOT_BUBBLE` docs example already warns for `focus` in the same run;
  the call that reset that set was `clearDelegatedEvents`. The trailing
  `clearDelegatedEvents(["click"])` calls are dropped.
- `core/src/dom.test.ts`, `rendering.test.ts`, `dom-optimizations.test.ts`,
  `spread-order.test.ts`: the shared container or host is a render root
  (`render(() => null, container)` in `beforeEach`, disposed in `afterEach`).
  `dom-optimizations` "event handlers swap" appends to that container instead of
  `document.body`.
- `core/src/diagnostic-docs.test.ts`: examples import a runtime whose `render` records the
  roots an example mounts itself, and the runner disposes them. A docs example rendered into
  `document.body` and was never disposed, which left the body a live root for every later
  test file.
- `compiler-rs/fixtures/semantics/sem-props-block-in-cell-slot.tsx`: `dispatched` renders a
  root into its host before binding, so the "delegated handler value" slot is dispatched.
- `compiler-rs/test/harness.ts`, `ownership.ts`, `session.ts`, `semantics.ts`,
  `browser-differential.ts`: `clearDelegatedEvents` calls removed; each render's disposer is
  called instead. What the clear protected (a module that dropped its own
  `delegateEvents([...])` could free-ride on another's) is now asserted on the emitted code:
  `assertDeclaresItsDelegatedTypes` refuses to load a module that writes a `__bq_<type>`
  expando without declaring the type.
- `compiler-rs/test/leaks.ts`, `leaks.test.ts`: delegated listeners are no longer exempt from
  B4. "delegation is not counted as a leak, and is not counted as nothing either" is restated
  as "a root's delegated listeners are seen, and leave with the root": the probe still sees
  them and none is outstanding after disposal. `session.ts` marks a listener delegated when
  it is on the render container rather than on `document`.
- `compiler-rs/test/leak-known-failures.ts` reach pin: listeners 32 to 328, each session's
  root registering one listener per declared type and removing it.

## `<Dynamic>` replaced by the `dynamic` factory

- `compiler-rs/test/hydration-grammar.test.ts`: the `Dynamic` and `Dynamic component` leaves
  render `dynamic(() => tag())` and `dynamic(() => (on() ? Wrap : Pass))` components declared
  with the helpers; `READS` maps them to the signals their sources read, so every case is
  still toggled through each value.
- `compiler-rs/fixtures/dynamic.tsx`, `l4/c7-dynamic.tsx`: rewritten onto the factory.
  `dynamic`'s `emits` are `dynamic(() => tag())` and `Tagged({` instead of `branch(` and the
  helper name, because the call site is now an ordinary component call and the branch is
  built at run time.
- `compiler-rs/test/async-key-hydration.test.ts` "Dynamic, then a sibling",
  `component-spread.test.ts` `Tag`, `core/src/control-flow-parity.test.ts`,
  `server/src/dynamic-tag.test.ts`, `core/src/jsx-types/flow.types.tsx`: the same cases
  through the factory. The parity test gains a component, null and teardown case; the server
  test compares the factory's output, range included, where it compared `ssrDynamic`'s.
- `compiler-rs/src/codegen/ssr.rs`: the refused-construct and import-removal tests use a
  `Switch` with unreadable arms where they used `<Dynamic {...p}>`; `Dynamic` leaves the
  no-deopt name list. `compile.rs` and `passes/shape.rs` O7 tests use a `dynamic` component
  with a live prop. `ir/symbols.rs` asserts nine constructs.
- `compiler-rs/test/optimality.test.ts`, `optimisation.test.ts`: `Dynamic` and
  `resolveDynamic` leave the lowered-construct and primitive lists; `ssr.test.ts` holds the
  corpus to exercising `dynamic` where it held it to `Dynamic`.
- `compiler-rs/test/ownership-census.ts`: `dynamic` lists `Tagged` as opaque.
  `ownership-known-failures.ts` effects 275 to 276, the factory's instance memo.
- Snapshots: `roundtrip.test.ts.snap` "emitted code snapshots dynamic" (the fixture's new
  emission); `modes.test.ts.snap` digests of `corpus/dynamic`, `l4/c7-dynamic`,
  `semantics/sem-props-block-in-cell-slot` and `semantics/sem-err-handler-throw`, whose
  sources changed (the last only in a comment).

## diagnostics: one channel, owner paths, server reports

- `core/src/diagnostics.test.ts` "capture collects what was emitted": `severity` is `"warn"`,
  not `"warning"`. barq's findings now travel on the engine's channel and take its event shape
  (`severity: "info" | "warn" | "error"`, plus `kind`). The finding itself is unchanged.
- `core/src/dev-console.test.ts` "an error goes to console.error": the console line now ends with
  `\n  docs: <page>`. Every console finding names the page for its code; the message is unchanged.
- `core/src/diagnostic-docs.test.ts` "the failing example raises it": the failing
  `RENDER_SUBTREE_NOT_OWNED` example also raises the engine's `NO_OWNER_EFFECT` under the
  development engine, because the engine's findings now share the stream. The assertion filters
  the engine's codes and still requires barq's to be exactly `[code]`; the fixed example must
  still raise nothing at all. `emittedCodes` reads the object form `emitDiagnostic({ code: "X" })`.
- `compiler/src/overlay.test.ts`: runtime events are emitted with the channel's `"warn"`
  severity. Inputs only; no expectation changed.
- `compiler/src/vite.test.ts` "the panel is fed over a custom HMR event": the stub dev server
  gained the `watcher` the plugin now listens on. No expectation changed.
