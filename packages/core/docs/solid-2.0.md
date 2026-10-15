# barq and Solid 2.0

`@barqjs/core` exports the reactive engine, `@solidjs/signals`, under Solid 2.0's own
names, and its components and helpers follow `solid-js` and `@solidjs/web` where it can.
This page lists where it does not, and why. A difference that is not here is a bug.

## Deliberate differences

**Props are Cells.** Every prop arrives as a function you call: `props.title()`, not
`props.title`. The compiler wraps each attribute in a Cell at the call site and a spread is
an ordered list of sources read on demand, so there are no getters to flatten and
`{...props}`, `splitProps`, `mergeProps` and a destructured parameter all copy the
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

**`Context.Provider` still exists.** A context is its own provider, `<Theme value="dark">`,
as in Solid 2.0. `Theme.Provider` is the same function, kept because code in this
repository still spells it that way. Whether it goes is an open decision.

**`createContext(defaultValue, name)`** also takes a plain string as its second argument,
beside Solid's `{ name }`. Either names the context in the error a missing provider
throws.

**There is no `createComponent`.** The compiler calls a component directly, as
`Card({ title, children })`, and children are deferred as Blocks the callee runs in its own
scope. Nothing needs a runtime wrapper around that call.

**`dynamic` is the compiler's helper, not Solid's factory.** `@barqjs/core`'s `dynamic`
renders a resolved component or tag with a props list, and the compiler imports it under
that name. Solid's `dynamic(source)` factory, which returns a stable component, is
therefore not shipped yet; `<Dynamic component={…}>` works and is the way to choose a
component at run time.

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

**`classList`** is still accepted. Solid 2.0 removed it in favour of `class` with an object
or an array, which barq also accepts.

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
[BARQ005](../../compiler-rs/docs/BARQ005.md) reports a destructured parameter list, and
BARQ001 to BARQ003 report a prop's function used as a value.

## Not yet in barq

- `createDeferred`. It is in `@solidjs/signals` after rc.14, which is the version barq
  depends on, and arrives with the next engine update.
- `Hydration`, `isHydratable` and `clientOnly` belong to the server rendering and
  hydration work and are not exported yet.
- The `dynamic(source)` factory, for the reason above.
