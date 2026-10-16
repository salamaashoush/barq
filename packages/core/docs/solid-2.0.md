# Coming from Solid

barq's reactivity is `@solidjs/signals`, the engine Solid 2.0 is built on, and
`@barqjs/core` exports it under the engine's own names. Its components and helpers
take the names and arguments of `solid-js` and `@solidjs/web` wherever barq has the
same thing, so code written for Solid 2.0 mostly reads the same here. This page is
for someone who knows Solid: it lists where barq differs, and why. A difference that
is not here is a bug.

## Deliberate differences

**Props are Cells.** Every prop arrives as a function you call: `props.title()`, not
`props.title`. The compiler wraps each attribute in a Cell at the call site and a spread is
an ordered list of sources read on demand, so there are no getters to flatten and
`{...props}`, `merge`, `omit` and a destructured parameter all copy the
functions rather than reading them (`src/props.ts`). The price is the call at every read,
which the compiler's diagnostics BARQ001, BARQ002, BARQ003 and BARQ005 catch when it is
forgotten.
`merge` and `omit` are barq's own views over that model, not the engine's functions of the
same name, and the engine's `isStatic` is not exported because it describes the engine's
sources and not barq's.

**`useContext` returns an accessor.** `useContext(Theme)()` reads the value. A provided
value is stored as a Cell for the same reason a prop is, so a provider whose `value`
changes updates its consumers without rebuilding its children. `getContext(ctx, owner?)`
is the owner-targeted read and answers with the value.

**`createContext(defaultValue, name)`** also takes a plain string as its second argument,
beside Solid's `{ name }`. Either names the context in the error a missing provider
throws.

**`createComponent` is a development aid, not the call path.** A production compile calls a
component directly, as `Card({ title, children })`, and children are deferred as Blocks the
callee runs in its own scope. A development compile emits
`createComponent(Card, props, "Card")` instead, which runs the component under an owner named
for it so a diagnostic, an error or a hydration report says `in <App> › <Card>`. Nothing
needs to call it by hand.

**`dynamic(source)`** takes no options and its source answers synchronously. Solid's
also takes `{ static, deferStream }` and a source that answers with a promise or an async
iterable; barq's reads the source in a memo per instance and keys a `branch` on it.
`@barqjs/server` has the string half under the same name, and the compiler's server backend
calls it where a `.jsx` or `.tsx` module calls `@barqjs/core`'s, so call `dynamic` in one of
those rather than in a plain `.ts` module that a server build loads. `dynamicComponent`, the
component-only variant, is not exported.

**`clientOnly`** takes Solid's `{ lazy, export }` and its third `moduleUrl`, which the
router's Vite plugin writes into a literal `clientOnly(() => import("./x"))` as it does for
`lazy`. Its server half is `@barqjs/server`'s, which the compiler's server backend calls the
way it calls `dynamic`'s, so call `clientOnly` in a `.jsx` or `.tsx` module too.

**`DEV` carries barq's diagnostics channel.** It is the engine's development tier (devtools
hooks and graph traversal, empty in a production build) with `DEV.diagnostics` added, the
channel where the engine's findings and the renderer's own arrive together: hydration
mismatches, a write to a read-only binding, a Block run twice. `DEV.diagnostics` exists in
every build. `OBSERVE` is the engine's, re-exported as it is.

**`<Portal mount>` also takes a selector string**, which barq looks up, as well as a node.

**`lazy`** takes either a function that picks the export, `lazy(load, (m) => m.Card)`, or
Solid's `{ export: "Card" }`, and Solid's third `moduleUrl`, which the router's Vite plugin
writes into a literal `lazy(() => import("./x"))`. A server render given a `manifest` puts
the module's chunks and stylesheets in the page when it renders. Beside `preload()` it has
`ready()`, a tracked read that throws `NotReadyError` until the module is here, and
`loaded()`, a synchronous answer to whether it already is; a router needs both.
`preload()` resolves to nothing rather than to the module.

**`lazyModule`** caches the import and `peek()` answers the module once it has landed. For
the same reason it does not read a hydration module registry, so `peek()` during
hydration answers what has loaded on the client and nothing more.

**Events.** `onClick` binds `click`, and an event name may also be written in lowercase,
`onclick`, which Solid 2.0 instead treats as the HTML inline-handler attribute. A name
ending in `Capture`, `onKeyDownCapture`, binds the capture phase, which Solid 2.0 has no
spelling for. `prop:` writes a property, as in Solid 2.0, and `bind:` is barq's two-way
binding.

**Delegated events** are owned by the render root, as in Solid 2.0: `render` and `hydrate`
listen on the container they mount into and stop when the root is disposed, a nested root
walks its own tree before the root around it resumes from its container, and a portal
mounted outside its root has its box registered for that root, so an event inside the portal
bubbles to the handlers around the `<Portal>`. The difference is the box: barq mounts a
portal's content into a `<div style="display: contents">` of its own and registers that,
where Solid registers the mount element. A handler on an element no root rendered never
runs, and there is no `clearDelegatedEvents`; dispose the root instead.

## Server rendering

`renderToString`, `renderToStream`, `getRequestEvent`, `getTraceContext`, `httpStatus`,
`httpHeader`, `markSafeError`, `generateHydrationScript`, `<HydrationScript />`,
`createRequestEvent`, `createResponseStub`, `commitResponseStub`, `createSSRResponse`,
`commitEventResponse`, `getExpectedRedirectStatus` and `composeMiddleware` take Solid 2.0's
arguments and options, and a memo takes Solid's `ssrSource` and `deferStream`. The
differences:

- **Two packages, not one.** The server entry points are `@barqjs/server`'s and the
  isomorphic ones (`getRequestEvent`, `getTraceContext`, `httpStatus`, `httpHeader`,
  `useHead`, `markSafeError`, `isServer`) are `@barqjs/core`'s. `provideRequestEvent` is
  `@barqjs/server/storage`'s. `isServer` is a literal per side, by export condition, as in
  Solid; under `bun` it is the run-time check the test suites rely on.
- **`@barqjs/start` is the same lifecycle under its older names.** Its `withRequest`
  enters a `createRequestEvent` event with `provideRequestEvent`, `createResponseDraft` is
  `createResponseStub`, `markResponseSent` is `commitResponseStub`, and `applyResponseDraft`
  is the fold `commitEventResponse` makes, without the commit. `setCookie`,
  `setResponseHeader` and `setResponseStatus` write to `getRequestEvent().response`.
- **`@barqjs/router`'s page handler commits its head at its edge**, with
  `commitEventResponse` once the request middleware has unwound, rather than through
  `createSSRResponse` at the shell flush: a request middleware may still set a cookie after
  `next()`, as `@barqjs/start` has always allowed. `createSSRResponse` is for a handler
  written on `@barqjs/server` directly, and commits at the flush as Solid's does.
- **A completed render freezes what it declared** instead of committing the head: an awaited
  `renderToStream`, `renderToString` and `renderPage` keep every live `httpStatus` and
  `httpHeader` declaration past the render's disposal, and the head stays open for the
  handler that called them. A render that throws retracts them, as in Solid.
- **`composeMiddleware` is for fetch-style middleware** on a handler of your own.
  `@barqjs/start`'s request middleware (`createMiddleware({ type: "request" })`) is the
  framework's, with TanStack's `next({ context })`, and the two are not mixed in one chain.
- **A late header write is a diagnostic.** A write to a committed head, through
  `httpHeader`, `setCookie` or the head's own `headers`, changes nothing and is reported as
  `LATE_HEADER_WRITE` in a development build. Solid's development build throws.
- **`getTraceContext`** continues or originates the W3C trace, keeps one object per request,
  and tells the browser (a `Server-Timing` entry at the commit and a `<meta>` in the
  document's head) only for a sampled incoming trace. There is no `OBSERVE.server.trace`
  provider slot, and the `solid-shell`, `solid-boundary` and `solid-invocation` timings are
  not written.
- **`ssrSource` and `deferStream` are a memo's.** `createMemo` takes both; the function form
  of `createSignal`, `createStore`, `createProjection` and the effects do not. A `"client"`
  or `"hybrid"` memo takes over from the server's value a microtask after the claim pass,
  not when the last streamed boundary has arrived.
- **`renderToStream` renders its shell synchronously**, and a stream consumer claims the
  result in the tick it started in. A result no stream claimed by then is settled for its
  promise, boundaries resumed in place. barq keeps `session` and a per-boundary `timeout`
  beside Solid's options. `noScripts` keeps the swaps, without which a streamed boundary's
  content never reaches the page.
- **The settled document resumes boundaries in place** rather than buffering the stream,
  and `renderToStringAsync` and `renderPage` are still exported for it.
- **`useHead` takes Solid's tag descriptors** (`{ tag, props, children }`) and keys a tag
  by its identity, the last declaration winning. A tag declared after the shell streams as
  a patch with its boundary's swap. Stylesheets do not gate a reveal.
- **`onError`** hears `failed`, `fallback` and `client`; there is no `serialize`, because a
  value seroval cannot encode fails the render. There is no `configureServerErrors`.

A server function whose handler returns a component answers with a frame, as in Solid, and
`dynamic` renders it: one component per address, an answer for the same address morphed into
the region where it stands. `@barqjs/start` and `@barqjs/router` install both halves.
`applyFrameResponse`, `FRAME_APPLIED_EVENT` (`barq:frame-applied`), `Slot`, `BindingSlot` and
`live` keep Solid's names. A frame's markup is `<barq-frame>` with a JSON payload script, and
its head is applied through `useHead`. A slot the component places is a comment range the
page's content fills, claimed at hydration with the rest of the page, and a slot call's
`children` is a `<barq-region>`. A slot the component calls and reads is a binding slot: each
property marks one position of the server's markup, which the page's fill owns from the
claim on. A mutation that calls `invalidateFrames` answers with the regions it changed beside
its value, in one request, and a frame read through `live` is rendered again on the server
each time a source it reads moves, each rendering applied in place over one connection.

## Solid 1.x APIs barq does not have

These are gone from Solid 2.0, or deprecated by it, and barq does not export them. Each is
listed with its 2.0 replacement, from Solid's `documentation/solid-2.0/MIGRATION.md`.

- `Suspense`, `SuspenseList`, `ErrorBoundary`: `Loading`, `Reveal`, `Errored`.
- `Index`, `indexArray`: `<For keyed={false}>`, `mapArray` with `keyed: false`.
- `createResource`: an async `createMemo` (or `createStore(fn)`) under `Loading`;
  `refresh` for a refetch.
- `startTransition`, `useTransition`: transitions are built in; `isPending`, `Loading`
  and the optimistic primitives.
- `batch`: writes are batched; `flush()` applies them now.
- `createComputed`: `createMemo`, a split `createEffect`, or `createSignal(fn)`.
- `createSelector`: `createProjection` or `createStore(fn)`.
- `on`: the compute half of `createEffect`, with `{ defer: true }` for the deferred form.
- `onMount`: `onSettled`.
- `onError`, `catchError`, `resetErrorBoundaries`: `Errored` and an effect's `error`
  option; boundaries recover on their own.
- `createTrackedEffect`: `createEffect(compute, effect)`, or `onSettled` for one-time work
  after render. Solid 2.0 still exports it, marked deprecated and kept for migration only.
- `produce`, `createMutable`, `modifyMutable`, `storePath`: a store setter takes a draft
  (`setStore((s) => { s.user.name = "salama"; })`).
- `unwrap`: `snapshot`.
- `mergeProps`, `splitProps`: `merge` (a later `undefined` overrides) and `omit` (read the
  props you keep straight off `props`).
- `equalFn`, `getListener`: `isEqual`, `getObserver`.
- `from`, `observable`: an async iterable in a computation; `createEffect` pushes values
  outward.
- `Context.Provider`: the context is its own provider, `<Theme value="dark">`.
- `<Dynamic component={…}>`, `createDynamic`: the `dynamic(source)` factory, hoisted and
  rendered as a component: `const Field = dynamic(() => (rich() ? Editor : "input"))`, then
  `<Field value={value()} />`. Solid 2.0 still exports `<Dynamic>`, deprecated.
- `clearDelegatedEvents`: dispose the render root, which removes its listeners.
- `classList`: `class` takes a map of names to whether each applies, or a list of names,
  maps and further lists: `class={["card", { active: on() }]}`.
- `use:` directives: `ref={directive(options)}`, and `ref={[a, b]}` for several.
- `on:`, `oncapture:`, `attr:`, `bool:`, `style:` and `class:`: `onClick`, a ref that
  calls `addEventListener`, the attribute's own name, `style` and `class` values.

`Context.Provider`, `classList`, the namespaces and `<Dynamic>` still parse, so the compiler
reports them with the replacement: [BARQ022](../../compiler/docs/BARQ022.md),
[BARQ023](../../compiler/docs/BARQ023.md), [BARQ024](../../compiler/docs/BARQ024.md)
and [BARQ025](../../compiler/docs/BARQ025.md). The rest are missing exports, which
TypeScript and the bundler report.

## Checked at compile time

Several mistakes Solid 2.0 reports at run time in development are also reported by barq's
compiler, before anything runs, with a code, a span and a docs page
(`packages/compiler/docs`):

- A component choosing what to return from a signal it reads once, the case Solid's
  `STRICT_READ_UNTRACKED` warns about: [BARQ018](../../compiler/docs/BARQ018.md).
- A write, a `refresh` or an action while a component body or a computation runs, which
  the engine's development build throws on as `REACTIVE_WRITE_IN_OWNED_SCOPE` or
  `ACTION_CALLED_IN_OWNED_SCOPE`: [BARQ019](../../compiler/docs/BARQ019.md).
- A store destructured in a component body: [BARQ020](../../compiler/docs/BARQ020.md).
- A read after the first `await` of an async computation, Solid's
  `UNTRACKED_READ_AFTER_AWAIT`: [BARQ021](../../compiler/docs/BARQ021.md).

Destructured props are not on this list. A destructured name holds the prop's function,
which stays live, so it is a mistake only where the name is used as a value.
[BARQ005](../../compiler/docs/BARQ005.md) reports a destructured name used as a value,
and BARQ001 to BARQ003 report `props.name` used the same way.
