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
- `server/src/async-autokey.test.ts`, two `HYDRATION_SEED_DRIFT` cases: `event.data` is
  `{ keys: [...] }`, not the bare array. The engine's event types `data` as a record, and the
  leftover keys are the same.

## compiler: one fused effect per template

Every live attribute, property, class and style binding of a template shares one render effect, on
whichever element, and an opaque call in an attribute joins it through `readOpaque`. The
cost-model split of an expensive, dependency-disjoint call is gone, and with it `Cost` and
`DepSet::disjoint`, which only that split read.

- `passes::group::tests`: `every_live_prop_on_one_element_shares_a_single_effect` is now
  `every_live_prop_in_one_template_shares_a_single_effect` (headers `[2, 1]` became one header of
  3 over two elements). `an_expensive_prop_with_no_shared_dependency_keeps_its_own_effect` is
  removed with the rule it pinned. Added: an opaque call joins and an opaque value does not; a lone
  opaque call keeps `bindProp`.
- `ir::react::tests` `overflow_makes_a_dep_set_share_with_everything` is now
  `overflow_is_a_read_of_something`, and `joining_carries_overflow` loses its `disjoint` line:
  overflow matters now only because it keeps the set non-empty.
- `passes::shape::tests` `an_opaque_call_in_an_attribute_is_thunked_rather_than_spent` is now
  `..._is_read_in_the_effect_rather_than_spent`: `title={label()}` is `_$readOpaque(label(),
  "title")` inside the one effect instead of `bindProp(..., () => label())`; the template literal
  beside it is read bare, being a string. `a_call_to_a_derived_function_is_a_proven_read`: `id={fixed()}`
  is the record's third field instead of a `bindProp` thunk. Both still assert the call stays live.
- `optimality.test.ts` "no effect group spans two elements" is now "no template opens two effects
  and no effect spans two templates", and its detector "goes red on a deliberate over-merge" is now
  "goes red on a deliberate split". `optimisation.test.ts` "a fused effect applies to exactly one
  element" is now "a template's bindings share one fused effect". `mutants.ts` replaces
  `fuse-merges-across-elements`, now the design, with `fuse-stops-at-the-first-element`.
- `fixtures/sibling-live-props.tsx`: `optimality.effects` 2 to 1, and its comment states the fused
  pair. `fixtures/read-mode-binding.tsx`: comment only.
- `effect-counts.ts`, ten rows, every one `created` down by the bindings that fused:
  attribute-namespaces 2 to 1, boolean-and-nullish-props 2 to 1, class-empty-string 3 to 1,
  class-list-prop 2 to 1, dashboard-composite 5 to 4, live-call-hole 3 to 2, property-attrs 2 to 1,
  read-mode-binding 3 to 2, sibling-live-props 2 to 1, table-rows 13 to 10. `runs` falls with them
  and `busiest` rises where one effect now re-runs for what two did.
- `ownership-known-failures.ts` effects 276 to 263, `leak-known-failures.ts` effectsCreated 324
  to 310, the same bindings counted from the other two channels.
- `compile.rs` `a_bare_tracked_read_in_an_attribute_becomes_a_live_binding` and
  `a_provably_static_value_gets_no_effect_and_a_tracked_read_does`: a lone attribute or property
  binding is `_$setAttr(el, "title", _v$, _p$)` instead of `if (_v$ !== _p$) _$setAttr(el,
  "title", _v$)`. Handed `prev`, the channel makes the same identity compare (including the first
  run's `undefined`), in fewer bytes; that is what keeps the fixture corpus from growing.
  `compiler/src/vite.test.ts` "optimize 0 turns every optimisation off" restates its two `-O0`
  expectations the same way; the effect counts it asserts (2 at `-O0`, 1 optimised) are unchanged.
- Snapshots, via `bun test -u`. `roundtrip.test.ts.snap`, 24 fixtures: attribute-namespaces,
  auto-thunked-read, boolean-and-nullish-props, class-empty-string, class-list-prop,
  component-forwarded-handler-tuple, custom-elements, dashboard-composite,
  diagnostic-accessor-coercion, live-call-hole, multi-signal-expression, numeric-and-boolean-attrs,
  projection-store, property-attrs, props-destructured-body, props-raw-forward, read-mode-binding,
  sibling-live-props, signal-methods-in-handler, signal-object, store-member, svg,
  table-root-shapes, table-rows; each is the fused record, the lone binding handing `prev` to its
  channel, or both. `modes.test.ts.snap`: 30 rows move in the dom-Ox, dom-O0, interp and
  dom-hydratable columns for the same two reasons; the ssr columns move only for
  `sibling-live-props` and `read-mode-binding`, whose sources changed.

## flaky timing tests

- `compiler-rs/test/roundtrip.test.ts` "generating the map costs less than the compile it maps"
  timed two compiles and asserted a ratio, which a loaded runner failed. It is now "the map holds
  each mapped position once, in under half the bytes it maps": a doubled map, the regression it was
  for, fails both halves, and neither reads a clock. Compile time is still printed by
  `throughput.test.ts`.
- `aria/src/drawer.test.ts` "letting go short of the threshold keeps it" read `Date.now`, so a
  millisecond tick between `start` and `move` made 80px a flick. It and the other velocity tests in
  `drawerDrag` ("the threshold is a FRACTION", "a flick closes it", "a slow pull", "a flick BACK")
  now drive the drawer's injected `now` instead of `Date.now` and `setTimeout`. Expectations are
  unchanged.
- `compiler-rs/test/throughput.test.ts` is gone from the suite: its four tests asserted compile times
  (every fixture under 1 ms, the typical component file under 1 ms, the guard-thread path over
  20 MB/s, templates-on under 1.9x templates-off), which a loaded runner failed with the compiler
  unchanged. The same four budgets run as `bun test/throughput.bench.ts`, which exits non-zero
  when one breaks; CI runs it as a report (`continue-on-error`). The suite's guard is the new
  `compiler-rs/tests/compile_work.rs`, which counts every allocation a compile makes and is
  deterministic: the typical file at 1, 2, 4, 8 and 16 copies grows by at most 2.1x the
  allocation calls per doubling and the series crosses the 8 KiB guard-thread limit; the corpus
  glued into one module costs no more than its fixtures compiled apart; templates-on stays under
  2.75x the calls and 2.35x the bytes of templates-off (measured 2.17x and 1.87x). A pass made
  quadratic on purpose fails the first two. `mutants.ts` loses its `TIMING` filter, which only
  existed to discount these names.
- `compiler-rs/test/optimality.test.ts` "the slowest fixture and a typical component file compile
  in under 1ms" is now "the corpus is really compiled, and the module grows only with the input".
  It keeps both real-compile checks and adds that eight copies of the typical file emit the same
  template table and at most eight times the bytes of one. The 1 ms budget is the bench's.
- `core/src/rendering.test.ts` "For should handle large list reordering efficiently" and "For
  should handle shuffle efficiently" asserted a reorder under 100 ms. An O(n^2) LIS over 1000
  rows is about a million comparisons and finishes well inside that, so the bound never held the
  property its comment claimed. Both now count `insertBefore` calls on the container: a reversal
  of 1000 moves between 999 and 1000 rows, and a seeded shuffle of 500 (replacing `Math.random`)
  moves exactly `n - LIS` rows and lands in the shuffled order.
- `table/src/state.test.tsx` "ten thousand rows sort and page within a generous bound" (2 s and
  4 s) is now "... sort in n log n comparisons and render one page". The two columns sort through
  counting wrappers around `sortFn_basic` and `sortFn_alphanumeric`, the functions `auto` picked,
  and each sort makes between `n - 1` and `n * ceil(log2 n)` comparisons. Page size and order
  expectations are unchanged.
- `virtual/src/index.test.tsx` "a million rows cost a window, not a list" asserted under 2 s. It
  now asserts the first window built at most 6 rows, the jump built 6 more and nothing between,
  and `estimateSize` ran once per row (1,000,000), so offsets are not rebuilt per scroll.
- `primitives/src/promise.test.ts` "sleep resolves after the delay" read `Date.now` across a real
  20 ms sleep. It runs on fake timers: unresolved at 19 ms, resolved at 20.
  `primitives/src/timer.test.ts` "elapsed counts from the call" asserted under 5 ms at the call
  and at least 20 later; on fake timers it is exactly 0, then exactly 20 after 25 ms (sampled at
  10 and 20).
- `server/src/boundary-resume.test.ts` "renderPage settles it rather than refetching until the
  boundary deadline" asserted under 1000 ms. It now records which deadline-length timers (1 s
  and over) fired while the render was pending, and requires none. `server/src/late-failure.test.ts`
  "finishes at the boundary deadline when a read never answers" asserted under 7000 ms; it now
  requires exactly one, the 5000 ms boundary deadline. Both still take the real time they took.
- `router/src/server.test.ts` "a static head streams its first byte before the loader settles"
  (first byte under 30 ms) and "a function head waits, and that is the trade" (first byte at
  50 ms or later) raced a 60 ms loader against a clock. The loader now waits on a gate the test
  opens: the static head's first byte arrives with the loader still held, and the function
  head's has not arrived after ten turns of the event loop and arrives after the gate opens,
  with the loader settled. The unused `headersAt` reading in the shared `render` helper is gone.
- `start/src/prerender.test.ts` "a page that throws or answers 5xx is asked again" asserted the
  run took at least 35 ms for a 40 ms `retryDelay`. It now logs each ask and each 40 ms timer as
  it fires, and requires the timer between every path's first ask and its retry.
- `start/src/session.test.ts` "`createdAt` is the SEALED time" slept 20 ms and compared against
  `Date.now`. It sets the clock with `setSystemTime` instead, seals at a fixed instant, reads
  20 s later, and requires `createdAt` to equal the sealing instant exactly.

## SSR: no render data in a module global, errors redacted in production

- `server/src/server.test.ts` "records keyed async values for hydration", "the seed encoder carries
  Date, Map, Set, BigInt and cycles" and the two hydration tests that read the seed: they took the
  data from `getRenderData()` after `renderToStringAsync`, a module global that held whichever render
  finished last. They read `renderPage(...).data` now; the values asserted are unchanged.
- `server/src/server.test.ts` "generateHydrationScript escapes script-breaking content" is "the seed
  script escapes script-breaking content" and reads `renderPage(...).script`. `generateHydrationScript`
  is Solid's bootstrap and carries no data; the escaping asserted is the same.
- `server/src/server.test.ts` "redacts an Error to its name and message, with no server path": in a
  production build the seed carries `Internal Server Error` in place of the message. The development
  run still asserts the message; both still assert no `sourceURL` and no server path.
- Thrown errors made safe with `markSafeError`, assertions unchanged, because these tests are about
  where a failure's fallback lands and print the message to find it: `server/src/late-failure.test.ts`
  ("late boom", "now"), `server/src/server.test.ts` two seeded rejections, `router/src/server.test.ts`
  five route errors, `router/src/catch.test.ts` one, `compiler-rs/test/row-owner.test.ts`,
  `compiler-rs/test/stream-hydration.test.ts` "late boom", and the fixtures
  `control-flow-error-boundary`, `control-flow-errored-loading`, `l4/c7-error-boundary`,
  `l4/c7-error-boundary-fallback`, `l4/c7-loading-errored`.
- Snapshots, through `bun test --update-snapshots`: `modes.test.ts.snap` digests of those five
  fixtures and `roundtrip.test.ts.snap` emitted code of the two corpus fixtures (the import of
  `markSafeError` and the wrapped throw). No other snapshot changed.
- `clearRenderData()` in eight server test files' `afterEach` is `clearHydrationData()`.

## renderToStream returns Solid's result

- Every `renderToStream(...)` used as a `ReadableStream` in a test reads `.readable` now (server
  tests, `compiler-rs/test/stream.ts`, `query/src/ssr-server.ts`, the site's block harness). The
  bytes asserted are unchanged.
- `server/src/server.test.ts` "onShellReady fires before onAllReady, and both fire once" is
  "onCompleteShell fires before onCompleteAll, once each, and each writes where it stands": Solid's
  names, and it also asserts where each `write` lands.
- `server/src/late-failure.test.ts` "places the error boundary's fallback over everything it held":
  the swap call is followed in the same script by the round's seed, so the expected text ends at
  `__BARQ_SWAP__(1,false,true);` rather than at `</script>`. A round is one script so that a client
  hydrated at shell time cannot run between a swap and the values its content reads.

## A function head no longer holds a streamed shell

- `router/src/server.test.ts` "a function head reads the loader (stream=true)": a streamed page's
  title is no longer in the shell's `<title>`; it follows the shell as
  `window.__BARQ_HEAD__([{"k":"title",...,"c":"FROM THE LOADER"}])`. The buffered case still
  asserts the document's title, and both still assert the content and the seed.
- `router/src/server.test.ts` "a function head waits, and that is the trade" is "a function head does
  not hold the shell for its loader": the trade it pinned is the one the change removes. It asserts
  the first chunk has the head without the loader's title and a later chunk carries it, rather than
  a first-byte time.

## The router plugin's transform is async

- `router/src/vite.test.ts` "a route edit while serving": the harness awaits `transform`, which now
  resolves `lazy(() => import(...))` specifiers through `this.resolve`. Its fake context gained a
  `resolve`. "not in a build, and not for the server" was passing on `undefined?.code ?? ""` once the
  hook returned a promise; awaited, it checks the transformed code again. No expectation changed.

## A streamed page loads its entry from the head

- `router/src/server.test.ts` "`<Scripts />` places the client entry and the route's body scripts":
  renders with `stream: false`. `<Scripts />` places the entry on a buffered page; a streamed page
  carries it `async` in the head, and the boot waits for the shell's marker before it reads a seed.
  The assertions are unchanged.

## One Vite plugin package

The compiler, router and start plugins moved into `packages/vite`, with their suites. `barq:config`
now writes every environment's conditions, `barq` included, so the compiler plugin no longer has a
conditions hook of its own.

- `vite/test/options.test.ts` "under `vite dev`, both halves resolve the development builds": was
  `conditions[0] === "development"`, is `conditions.slice(0, 2)` equal to `["barq", "development"]`.
  The compiler used to prepend `barq` in a later hook, so the list an environment ended with was
  already this one; the test read the list half-built.
- `vite/test/options.test.ts` "`conditions` reaches the server environment": the same, `["barq", "bun"]`.
- `compiler/src/vite.test.ts` "the barq condition goes in front of Vite's defaults, which it keeps"
  is now in `vite/test/options.test.ts`, driven through `barq()`'s `barq:config` rather than the
  compiler plugin. Same assertions. Added "`compilePackages: false` names no barq condition".
- `vite/test/dev-server.test.ts` "the client entry resolves to the project's own file": the fixture
  path it matches is `fixtures/start/src/entry-client.ts` (was `fixture/src/entry-client.ts`).
- `core/src/diagnostic-docs.test.ts` "not-hydratable": the fix the message names is `ssr: true` in
  `barq()` from `@barqjs/vite`; it named the deleted `@barqjs/compiler`'s `hydratable` option.

## lucide-static 1.57.0

- `lucide/src/tree-shaking.test.ts` "one icon from the barrel brings no others": the aperture probe
  was `M2.5 21a.5.5`, a path no lucide icon has ever drawn, so its `not.toContain` could not fail. It
  is `m14.31 8 5.74 9.94`, aperture's first path.
- `lucide/src/lucide.test.tsx`: added "every name lucide-static exports is the same component here",
  which reads lucide-static's own entry and requires each name it exports, old names included, to be
  the barrel's component for the same module. No existing expectation changed.

## Every optimality declaration runs

`optimality.test.ts` no longer gates a declaration on its `milestone`; the sixteen above the old
`MILESTONE = 6` were `it.todo` and now run. Twelve passed as written. Four declared a shape the
renderer change had since moved, and the compiler's output was checked against the fixture's
prose and its `-O0` build before each was restated:

- `control-flow-show-keyed`: `templates` was 2, is 3. The fallback `<i>none</i>` is a template of
  its own at both levels, as `control-flow-show-keyed-false` already declares. The `", v) =>"`
  needle (a two-argument body) is gone: the body is now a one-argument Block called with the
  key's value. That claim names the `_v$` uid, so it moved to the test file as
  "control-flow-show-keyed: one body is handed each key's value, not an accessor".
- `control-flow-show-keyed-false`: `", v) =>"` is `"})(value)"`, the body called with the accessor
  itself, which is the η-reduction the fixture describes. `-O0` does not emit it.
- `control-flow-spread-repeat`: absent `"count: "` is `"children: "`. `"count: "` matched the
  fixture's own `opts` object, so it could not pass; `children: ` is the adapter's props object,
  emitted at `-O0` and gone at `-Ox`.
- `spread-static-mix`: `'"id", "fixed"'` is `'"id": "fixed"'`. The literal now enters the spread's
  props object ahead of `...extra()` instead of a separate write, which keeps source order.
- "dedup-identical-markup: zero patch calls across both components" was an `it.todo` that counted
  the whole module, including the grid's two inserts of Left and Right. It now measures each
  component's body, and requires it to be a bare template clone.

## Tests that timed a race against the wall clock

Tests that failed on a loaded CI runner, or in a loaded full run, and passed on an idle machine.
Each now orders what it waits on; no expectation's subject changed, and what moved is listed.

- `router/src/match.test.ts` "useAwaited > is a promise's value as a cell, pending until it
  settles": the promise settled on a 10 ms timer, which a slow mount outlived, so the pending read
  found it settled. It is now `Promise.withResolvers`, resolved after the pending read is asserted.
- `router/src/router.test.ts` "pendingMinMs keeps a fallback that HAS appeared from vanishing two
  frames later": runs on `jest.useFakeTimers()`, which fakes `Date.now` as well, and the loader
  waits on a gate rather than a 15 ms timer. Added: the page is empty before `pendingMs` and shows
  the skeleton once it elapses, so the hold starts from a fallback known to have appeared; and the
  skeleton is still there 1 ms before `pendingMinMs` ends. The two original expectations (skeleton
  after the loader settled, data once the hold expires) are unchanged.
- `query/src/router.test.ts` "the integration carries a request's queries to the page, read or not
  (handler-streamed)": `late` settled on a 15 ms timer against loaders on 2 + 3 ms timers, so a
  delayed event loop let it into the first snapshot. In the streamed mode it now waits until the
  integration has taken that snapshot; in the buffered mode it settles at once, which is before the
  render that waits on `slow` can end. Expectations unchanged.
- `vite/test/dev-body-limit.test.ts`: `beforeAll` now makes one server-function request to an id
  that does not exist and expects its 404, so the module runner's cold load of the start server is
  setup rather than part of the 413 test. The two tests' expectations are unchanged.
- `vite/test/hmr.test.ts`: each test has a dev server of its own, and `edit()` waits for Vite's
  `server.hotUpdateEnvironments` to return for the edit instead of polling 5 s and sleeping 300 ms.
  "Reloads nothing" therefore covers everything that edit's HMR sent, rather than whatever arrived
  within 300 ms of the first payload. Setup writes a probe file until the watcher reports it.
- `form/src/form.test.tsx` "an async validator is debounced, and reports while it is running" and
  "a newer change aborts the validation still in flight": both run on fake timers, and each
  validator waits on a gate rather than a 20 or 30 ms timer. Added to the first: no call 1 ms
  before the debounce ends. In the second the aborted call is answered after the newer one, so its
  stale error is what would remain if the abort were ignored; the expectation (no error) is
  unchanged.
- `vite/test/start-build.test.ts` "serves a page, an asset and a 404": `serve.js` is started on
  port 0 and the origin is read from its "Listening on" line, instead of a random port in
  3400-3499 (which `create-barq`'s scaffold suite also binds, at 3400-3412) and a capped poll.
  Expectations unchanged.

## The trace context writes `Server-Timing` in every build

- `vite/test/dev-only.test.ts` "a production build carries no Server-Timing and no development
  reporting" is "a production build carries no server-function timing and no development
  reporting", and its `not.toContain("server-timing")` is gone; `not.toContain(";dur=")`, the
  development timing's own metric, stays. `getTraceContext` hands a sampled incoming trace to the
  browser as a `Server-Timing` entry at the head's commit, which Solid 2.0 does in every build
  tier, and the commit folds a stub's `Server-Timing` onto a response entry by entry, so the
  header's name is in a production server bundle by design. The development build's test still
  requires both.
- `query/src/hooks.test.tsx` "refetchInterval polls": runs on fake timers. "At least 3 fetches by
  70 ms" is now exactly 1 at mount, still 1 a millisecond before the 15 ms interval, 2 at it and 3
  one interval later, with the DOM showing 3 once published. "No fetch after dispose" is unchanged.
  It first lets one real zero-delay turn pass: happy-dom folds every zero-delay timeout into one
  native timer, and one an earlier test left pending would collect the notify manager's timeouts
  out of the fake clock's reach. The form fake-timer tests take the same turn for the same reason.
- `create-barq/test/scaffold.test.ts` "serves what it built" and "answers its API route": `serve.js`
  starts on port 0 and the origin is read from its "Listening on" line, instead of fixed ports
  3400-3412 and a 10 s poll. Expectations unchanged.
- `aria/src/drawer.test.ts` "onDrag hears how much of the drawer is gone, and onRelease whether it
  stayed": the drag ran on `Date.now`, so a start and an end either side of a millisecond made a
  100 px move a flick at 100 px/ms, and the drawer closed. It now takes the `now` option the other
  drag tests use, with a second between start and release. Expectations unchanged.

## A settled stream step stays settled through barq's follow

- `core/src/async-source.test.ts` "a producer handing back a bare IteratorResult is assimilated,
  not crashed on": the first read was `"PENDING"` and is `2`. The engine takes a bare
  `IteratorResult` as a step that has already settled and reads it in the same turn, which the
  engine alone does here (measured: `2`). barq's `followStream` wrapped every step in a promise, so
  a followed memo read pending for a value that was there. It now hands a bare step on as one,
  which a live frame's render needs to read its shared sources where they stand. The test's claim,
  assimilated rather than crashed on, is unchanged.


## A handler or ref that reads a member is a hole on the wire

- `compiler-rs/test/__snapshots__/modes.test.ts.snap` "the matrix is locked": the row for
  `corpus/ref-on-component` has new digests for its three string-backend modes. The fixture's
  `<span ref={props.ref}>` now compiles to `${_$bindAttr("ref", () => props.ref)}`: a binding
  slot can fill a handler or ref position, so the server marks one whose value reads a member.
  Outside a server component the thunk is never called and the hole writes nothing, so the
  fixture renders the same bytes on both backends; only the emitted code's digest moved. The DOM
  modes' digests are unchanged.

- `query/src/{hooks,index,providers,router,ssr}.test.*`: every file runs on a fake clock installed
  in `beforeEach` and run out in `afterEach` (`src/test-helpers.ts`). `settled(ms)` and the
  test-side `tick(ms)` now step fake time a millisecond at a time with the microtasks of each step
  run, and a wait inside a query or mutation function is a plain timer that clock drives. Two tests
  awaited a refetch before letting time pass (`await refetch`, `await invalidateQueries`); they now
  let the fetch's time pass first. No expectation changed. A zero-delay timeout left on the fake
  clock strands happy-dom's shared zero-delay timer for the rest of the file, which is why the
  clock is run out rather than dropped.
- `router/src/router.test.ts` "pendingMs shows the fallback once the delay has elapsed": fake
  clock and a gated loader. Added: still empty 1 ms before `pendingMs`.
- `router/src/navigation.test.ts` "a loader's signal aborts when a newer run supersedes it" and
  `router/src/abort.test.ts` "a loader run the router aborts": the loaders are gated and the test
  waits for each run to start, instead of racing a 15 or 20 ms loader against 2 or 5 ms ticks. In
  the second, the aborted run is answered after the newer one. Expectations unchanged.
- `start/src/prerender.test.ts` "a slow page holds one slot": the slow page is answered once every
  quick page has been, instead of after 120 ms. A queue that runs a batch at a time now shows up as
  a timeout rather than a count. Expectations unchanged.
- `ui/src/ssr.test.ts`: each probe is named once before its build is awaited. The output name was
  read from the shared counter after the await, so a probe whose test had timed out wrote over the
  next probe's module, and that test asserted on another page's markup.

- `compiler/test/__snapshots__/modes.test.ts.snap`: the digests of
  `sem-own-render-disposer-disposes` and `sem-testing-wrapper-eager` moved because the package
  rename rewrote one comment in each fixture ("compiler-rs" to "compiler"). Emitted code keeps
  comments, so the digest of every mode that row covers changed with them; no other row moved.

## router: answers are not failures (2026-10-17)

- `router/src/server.test.ts` "a middleware that refuses becomes the page's own response": asserted
  that the buffered (`stream: false`) render printed one `[barq-router] The route "/" threw while
  rendering` report alongside the 401. It now asserts nothing is printed. The thrown `Response` is
  the page's answer and the markup it would have left empty is never sent, so the report described
  a failure nobody could see. `errorFallbackFor` takes a `superseded` check the page handler fills
  with "buffered, and a thrown answer was taken", and stays quiet when it holds. A streamed page
  that cannot honour the 401 after its shell still reports.
- Added, no assertion changed: `router/src/errors.test.ts` "a redirect is not a catch" and "a render
  a thrown answer superseded reports nothing", and `router/src/shell-head.test.ts` "does not tell
  the route's onCatch about a redirect that comes after the shell". No existing test pinned
  `onCatch` hearing a redirect; it did, because `errorFallbackFor` skipped only `notFound`. It now
  skips a redirect as well, matching TanStack Router, whose route boundary rethrows a not-found
  before `onCatch` and whose loaders settle a redirect before any boundary sees it.
- `router/src/errors.test.ts` "a render a thrown answer superseded reports nothing" (added in the
  entry above) is replaced by "the answer a loader threw is the page handler's to report". It
  asserted that a `superseded` render skipped the report and rendered nothing; the check is now
  `thrownAnswer(error)`, which matches only the stand-in for the `Response` the request was
  answered with, skips the generic report for that error alone and renders the region as before,
  so a streamed page and the browser hydrating it agree. The page handler reports a late refusal
  itself. Added, no assertion changed: two streamed refusal tests in `router/src/server.test.ts`
  (honoured before the shell, reported after it) and two in `server/src/codec.test.ts`.
- `router/src/m8-convention.test.ts` "redirects are bounded": asserted the router source matches
  `/hops\+\+/`; it now matches `/redirects >= MAX_REDIRECTS/`. A source-shape check, restated
  because the bound moved: the per-router `hops` counter, which every navigation reset before its
  `beforeLoad` ran (so a `beforeLoad` cycle hung the process) and which loader redirects never
  touched, is now a count carried along the redirect chain and checked in one `follow`. The
  behaviour is pinned by two new navigation tests (a loader cycle and a `beforeLoad` cycle stop
  with one error) and a server test (each request answers one hop, buffered or streamed).

## BARQ004 reports a row field read once, not every row callback

BARQ004 said "`<For>` reads a row's fields once" for every by-item `<For>` over rows the
compiler could not prove plain. A field read in a hole of an inline row callback has been
emitted live for a while (`_$insert(el, () => row.name)`, `_$bindProp(..., () => row.title)`),
so that claim was false for the commonest shape. Runtime evidence, a `createStore` row written in
place (`s.rows[0].name = "ada"`, then `flush()`): an inline `{(row) => <li>{row.name}</li>}`
shows "ada"; a destructured `({ name })`, a `const n = row.name` before the JSX, and a callback
passed by name all still show "salama". The analysis now also requires the callback to read a
field once (`analysis/rows.rs`), and these assertions were restated:

- `compiler/src/passes/shape.rs` `the_documented_divergence_is_reported_and_the_getter_one_is_gone`:
  `<For each={props.rows}>{(item) => <li>{item.n}</li>}</For>` expected 1 note, now 0 with
  `() => item.n` asserted in the output; the 1-note case is now `({ n }) => <li>{n}</li>`. The
  `store.items` and `() => store.items` loop: the same, 1 note for the destructured row and 0 for
  `{item.n}`.
- `compiler/src/passes/shape.rs` `rows_a_literal_created_are_not_reported`: the body was
  `{(item) => <li>{item}</li>}`, which reads no field and so no longer fires on any source. It is
  now `({ name }) => <li>{name}</li>`, so the test still decides on the rows alone; every 0 and 1
  it asserts is unchanged.
- `compiler/test/diagnostics.test.ts` "every advertised code is reachable from some input":
  BARQ004's source was the inline `{row.name}`, now the destructured `({ name })`.
- `compiler/docs/BARQ004.md`: the failing example was the inline `{row.name}`, which is now the
  first fixed example; the failing examples are a destructured row and a callback passed by name.
  The page title, the index entry and the message changed with the claim.
- Added: `shape.rs` `a_row_read_once_is_reported_and_a_live_read_is_not` (both raising sites, and
  the TanStack row model shape quiet), and a `store-rows.test.ts` block that compiles each
  callback shape for the note, mounts it over a store row written in place, and asserts the note
  is raised exactly when the text stays old.


## A flow callback passed by name is typed as the inline one

A `function row(item)` declaration was left `Opaque`, so `<For>{row}</For>` emitted
`_$block(() => [() => row])` and the row never reached it; and a `const row = (item) => …`
passed by name was slotted, counted as a component, and its parameter typed as a props object,
so `class={item.done}` compiled to `item.done()`. A declaration now takes the `Fn` kind a `const`
function takes, and a callback written by name as a flow construct's child or `children` takes
the parameter kinds the inline callback would. `test/row-callbacks.test.ts` mounts both over a
store at -O0 and -O2; without the change its `For` and `Show` cases fail at both levels.

- `compiler/src/passes/shape.rs` `a_row_callback_parameter_is_not_a_props_object`: asserted
  `_$insert(_el$1, item.n)` and no `() => item.n`, now `_$insert(_el$1, () => item.n)` and no
  `item.n()`. The named callback's row is read where it is shown, as the inline one's has been
  since member reads off a row were made live; a store row written in place updates through
  it. The test's intent, that the parameter is not a props object, is what the new `item.n()`
  assertion pins. Added: the `function` declaration and `children={row}` forms.
- `compiler/src/passes/shape.rs` `a_row_read_once_is_reported_and_a_live_read_is_not`: the named
  `const` and declared callbacks reading `{row.name}` moved from the once list (1 note) to 0,
  because their reads are now live; the once list keeps a named callback reading a field in a
  statement and a declared one destructuring its row.
- `compiler/docs/BARQ004.md`: the second failing example was a callback passed by name, which
  no longer fires; it is now a field read in a statement before the JSX.
- `compiler/test/__snapshots__/modes.test.ts.snap` "the matrix is locked": the row for
  `semantics/sem-calling-convention` moved in all seven modes. The fixture's
  `function counting(): string` is now `Fn { nullary: true }` as a `const` arrow would be, so
  `<Outer carrier={counting}>` forwards it by identity (`carrier: counting`) instead of wrapping
  it (`carrier: () => counting`). That is C5's rule for a zero-arity function the author wrote;
  the fixture's claims, including that forwarding does not read the Cell, all pass. No other
  row moved.


## Show and Match decide a child by Solid 2.0's rule

Decided by the user, asked directly: a construct child is decided as Solid 2.0 decides it
(`solid-next/packages/solid/src/client/flow.ts:232` for `Show`, `:323` for `Match`, `typeof
child === "function" && child.length > 0`). `callSlot` in `core/src/components.ts` now runs a
branded Block, calls a function that declares a parameter under `untrack` with the value, and
renders anything else as content. Before, it called every function with the value, so a signal
handed to `Show` as its child was read once, and the compiler could not pass an imported
callback through because the two cases were indistinguishable.

- `core/src/components.test.ts` "EDGE CASE: children function with default parameters": asserted
  that `(item = { name: "default" }) => …`, whose `.length` is 0, is called with the `when`
  value `{ name: "test" }`. Under Solid's rule a function declaring no parameter is content, so
  it now asserts the function was read and was not handed the `when` value. A hole reads content
  as a Cell, with the owner as the argument the Cell contract says it ignores, which is why the
  test no longer asserts the default value itself.


## Test isolation and shared helpers

- `compiler/test/leak-known-failures.ts` `LEAK_REACH.listeners`: 328 to 32. Every render root
  listens on its container for every event type the process has delegated, so the count took in
  types other test files had declared: 259 with `leaks.test.ts` run alone, 328 in the suite's
  file order. `openSession` now isolates delegation (`isolateDelegatedEvents` in `core/src/dom.ts`)
  for its window, so a session counts the container listeners its own module asks for. 32 alone,
  in the suite, and after three random sets of preceding files. The B4 assertions still run on
  every listener a session registers.
- `router/src/m8-convention.test.ts` "this package is compiled by the barq compiler": the preload
  now installs the shared `compilerLoader` from `@barqjs/vite/internal`, so the test looks for that
  import and the `plugin(compilerLoader(` call instead of `require_("@barqjs/compiler")` and
  `native.transform(source`. The `@barqjs/compiler` devDependency and no-JSX checks are unchanged.

- `vite/test/compiler.test.ts` "dev is derived from Vite rather than asked for": the fixture's row
  callback read `{row.name}` inline, which BARQ004 no longer reports because that read is emitted
  live. The fixture now destructures the row (`({ name }) => <li>{name}</li>`), a shape whose field
  is read once, so the three tests still pin what they are about: a dev-only note shows in a dev
  server run, not in a production build, and an explicit `dev` option wins.

## Compiler test harness trim

- `compiler/test/effect-counts.ts`'s hand-kept `ROWS` table (139 rows) is now
  `effect-counts.test.ts.snap`, one `toMatchSnapshot()` per fixture over the same
  `formatEffectRow` literal. Content identical: every one of the 139 rows was diffed against
  the old table before it was deleted. The floor and run-count sanity checks now read the
  measured rows instead of the table.
- `compiler/test/ownership-census.ts`'s `clones`/`unattributed`/`opaque` table (144 rows) is
  now one snapshot in `ownership.test.ts.snap`, "observes the recorded census, per fixture".
  Content identical: all 144 rows diffed against the old table.
- `compiler/test/semantics.test.ts`: every claim is now asserted with
  `if (outcome.failure) throw new Error(outcome.failure)`. The old `verdict()` reached the same
  result because the known-failure registry held no rows.
- `compiler/test/diagnostics.test.ts` "publishes one code table": the page-exists and
  index-lists-it checks are dropped there because `every_code_has_a_docs_page_and_the_index_lists_it`
  in `src/compile.rs` asserts both. The napi-surface checks (code format, level, https URL,
  uniqueness) stay.
- `compiler/test/leaks.test.ts` "no fixture leaks anything" is `expect(formatLeaks(findings)).toBe("")`;
  with an empty registry the old unregistered-only filter matched every finding.

## Core/web split (hard cut, user decision: one home per name)

- `compiler/src/options.rs`: the expected default `moduleSource` is `@barqjs/web`; a new assertion
  pins `coreSource` defaulting to `@barqjs/core`.
- `compiler/src/compile.rs` `helpers_extend_an_existing_import`: input and expected text use an
  `@barqjs/web` import, since DOM helpers now live there.
- `compiler/src/codegen/ssr.rs`: `core_import` became `import_from(code, CORE | WEB)`; SSR output
  imports shared helpers from core and renderer ones from web.
- `vite/test/compiler.test.ts`: the interp source is `@barqjs/web/interp`.
- `core/src/dist-entries.test.ts` lists four entries: `./interp`, `./jsx-runtime` and
  `./jsx-dev-runtime` moved to web.

## Universal target

- `compiler/src/options.rs` `unknown_option_names_the_nearest_key`: the name with no near key is
  `backend` where it was `target`, because `target` is now an option. Same assertion, same message
  shape.
- `compiler/test/diagnostics.test.ts`: `reachable` gains BARQ027 and BARQ028 inputs. The docs-page
  test gains `PAGE_OPTIONS` for both and a `FIXED_OPTIONS` table holding BARQ028's corrected
  options, since that code is about options and its fix is an option change. Every other page's
  fixed examples still compile under that page's own options.

## Components follow the shadcn model (user decision: @barqjs/ui is not published)

- `ui-cli/test/cli.test.ts` "init writes the config": `components.json` has no `registry` key
  (was `"node_modules"`); without one the CLI reads its own release's registry. The suite points
  that default at the repository's `packages/ui/registry` through `BARQ_UI_REGISTRY` instead of
  symlinking the package into `node_modules`.
- `ui-cli/test/cli.test.ts` info: `registry` is the default pattern (the variable's value), and a
  new check pins the unset default to the GitHub tag of the CLI's own version.
- `ui-cli/test/schema.test.ts`: an empty config has no `registry` (was `"node_modules"`); a new
  test requires `{name}` in a configured one.
- `site/src/docs/guides/guides.test.tsx`: the components.json sample has no `registry`; "every
  package the installation page names is in the workspace" became "every command the
  installation page runs is one the CLI has", because the page no longer lists packages to
  install.
