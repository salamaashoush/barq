# BARQ007 — this module falls back to the DOM backend on the server

**Level:** note · **SSR compiles only** · [all codes](README.md)

## What fires

An SSR compile of a module that reaches one of the eight control-flow components with no
string-mode implementation: `Loading`, `Errored`, `Reveal`, `Suspense`, `Await`, `Portal`,
`Dynamic`, `ErrorBoundary`.

The six that *are* string-inlinable — `For`, `Index`, `Repeat`, `Show`, `Switch`, `Match` —
never trigger this.

## What it means

The whole module compiles to the DOM backend instead of the string backend. It still works,
but it must be rendered through `renderToString` from `@barqjs/core/server` with a DOM
implementation registered (DESIGN §5). Rendering it on a server with no `document` is what
this note exists to prevent.

It is a note, not a warning: nothing is wrong with the code, and there is no rewrite that
would make those components string-inlinable today.

## The fix

There is none at the module level. Either keep the async/boundary components off the
server-rendered path, or render through `renderToString` with a DOM registered.

## Note on namespace imports

`import * as core from "@barqjs/core"` binds no symbol for `core.Portal`, so the ordinary
symbol scan cannot see it. This diagnostic follows the namespace spelling too — missing it
would compile the module to a string that calls the real DOM component, which dies on a
server with no `document`.
