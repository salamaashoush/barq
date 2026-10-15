# barq and Solid 2.0

`@barqjs/core` exports the reactive engine, `@solidjs/signals`, under Solid 2.0's own
names, and its components and helpers follow `solid-js` and `@solidjs/web` where it can.
This page lists where it does not, and why. A difference that is not here is a bug.

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

**There is no `createComponent`.** The compiler calls a component directly, as
`Card({ title, children })`, and children are deferred as Blocks the callee runs in its own
scope. Nothing needs a runtime wrapper around that call.

**`dynamic(source)`** takes no options and its source answers synchronously. Solid's
also takes `{ static, deferStream }` and a source that answers with a promise or an async
iterable; barq's reads the source in a memo per instance and keys a `branch` on it.
`@barqjs/server` has the string half under the same name, and the compiler's server backend
calls it where a `.jsx` or `.tsx` module calls `@barqjs/core`'s, so call `dynamic` in one of
those rather than in a plain `.ts` module that a server build loads. `dynamicComponent`, the
component-only variant, is not exported.

**`DEV` is barq's renderer channel.** `DEV.diagnostics` carries what the renderer can see
and the engine cannot (hydration mismatches, a write to a read-only binding, a Block run
twice). The engine's own `DEV` and `OBSERVE` are not re-exported under those names.

**`<Portal mount>` also takes a selector string**, which barq looks up, as well as a node.

**`lazy`** takes either a function that picks the export, `lazy(load, (m) => m.Card)`, or
Solid's `{ export: "Card" }`. Beside `preload()` it has `ready()`, a tracked read that
throws `NotReadyError` until the module is here, and `loaded()`, a synchronous answer to
whether it already is; a router needs both. `preload()` resolves to nothing rather than to
the module, and there is no third `moduleUrl` argument, because barq has no hydration
module registry for it to key.

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
reports them with the replacement: [BARQ022](../../compiler-rs/docs/BARQ022.md),
[BARQ023](../../compiler-rs/docs/BARQ023.md), [BARQ024](../../compiler-rs/docs/BARQ024.md)
and [BARQ025](../../compiler-rs/docs/BARQ025.md). The rest are missing exports, which
TypeScript and the bundler report.

## Checked at compile time

Several mistakes Solid 2.0 reports at run time in development are also reported by barq's
compiler, before anything runs, with a code, a span and a docs page
(`packages/compiler-rs/docs`):

- A component choosing what to return from a signal it reads once, the case Solid's
  `STRICT_READ_UNTRACKED` warns about: [BARQ018](../../compiler-rs/docs/BARQ018.md).
- A write, a `refresh` or an action while a component body or a computation runs, which
  the engine's development build throws on as `REACTIVE_WRITE_IN_OWNED_SCOPE` or
  `ACTION_CALLED_IN_OWNED_SCOPE`: [BARQ019](../../compiler-rs/docs/BARQ019.md).
- A store destructured in a component body: [BARQ020](../../compiler-rs/docs/BARQ020.md).
- A read after the first `await` of an async computation, Solid's
  `UNTRACKED_READ_AFTER_AWAIT`: [BARQ021](../../compiler-rs/docs/BARQ021.md).

Destructured props are not on this list. A destructured name holds the prop's function,
which stays live, so it is a mistake only where the name is used as a value.
[BARQ005](../../compiler-rs/docs/BARQ005.md) reports a destructured name used as a value,
and BARQ001 to BARQ003 report `props.name` used the same way.

## Not yet in barq

- `createDeferred`. Solid 2.0 keeps the name for an async memo that may lag but never
  leads. It is in `@solidjs/signals` after rc.15, which is the version barq depends on,
  and arrives with the next engine update.
- `Hydration`, `isHydratable` and `clientOnly` belong to the server rendering and
  hydration work and are not exported yet.
