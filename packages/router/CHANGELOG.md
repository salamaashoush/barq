# @barqjs/router

## 0.2.0-next.4

### Patch Changes

- f265cd9: A function written as a component's prop is the prop's value, and reading it never calls it. `upload={() => send()}`, a named callback and a signal's accessor used to be taken for the prop's Cell, so the component's first read called them and every read called them again; they now cross inside a Cell of their own on every path, and `x={count()}` crosses as `count` itself, one closure fewer. An accessor handed through a component for an attribute, `data-active={() => …}` or `aria-current={() => …}`, still reaches the element as the value it answers and follows it: an element's attribute reads a prop through `readAttr`, and the DOM, server and universal spreads and `Link`'s attributes read through it too. A context's `value` given as an accessor is read through as before, and `Link` now runs an `onClick` it is handed instead of answering with it.
- e82bd6c: `@barqjs/start` takes WebSocket upgrades on routes (`upgradeWebSocket`, crossws's hooks) in dev, preview and the built server, relays to another server with `proxyRequest`, sets response headers by path (`server.headers`, static files included), and runs `server.setup` modules at start with a close hook. The built `serve.js` picks srvx's and crossws's adapters when the process starts, so one build runs on Bun, Node and Deno, and `server.target` is gone.

  `@barqjs/router` adds `createServerEntry(handler, around)`, code around every request including server functions and upgrades, and the page handler's `nonce` takes a function for a fresh nonce per request.

  `@barqjs/primitives` adds `eventSource` for server-sent events, and `websocket` now moves to a new URL when a reactive one changes.

  `@barqjs/ui` is published as the base of `@barqjs/arc`, barq's design system: a theme with tones, surface, code, motion and stacking tokens and app brand tokens, and its first components, `PageHeader`, `Status` and `confirm()`.

- Updated dependencies [59a9e79]
- Updated dependencies [0a43dbe]
- Updated dependencies [0968d16]
- Updated dependencies [ec06e14]
- Updated dependencies [7847b93]
- Updated dependencies [f265cd9]
- Updated dependencies [3f6aa6d]
- Updated dependencies [b6342be]
- Updated dependencies [1fbb6e4]
- Updated dependencies [e82bd6c]
  - @barqjs/web@0.2.0-next.4
  - @barqjs/server@0.2.0-next.4
  - @barqjs/core@0.2.0-next.4
  - @barqjs/start@0.2.0-next.4

## 0.2.0-next.3

### Patch Changes

- Updated dependencies [28c1c5a]
- Updated dependencies [66de74c]
  - @barqjs/core@0.2.0-next.3
  - @barqjs/server@0.2.0-next.3
  - @barqjs/start@0.2.0-next.3
  - @barqjs/web@0.2.0-next.3

## 0.2.0-next.2

### Patch Changes

- Updated dependencies [9685c39]
  - @barqjs/core@0.2.0-next.2
  - @barqjs/server@0.2.0-next.2
  - @barqjs/start@0.2.0-next.2
  - @barqjs/web@0.2.0-next.2

## 0.2.0-next.1

### Patch Changes

- Updated dependencies [1bba6c8]
  - @barqjs/core@0.2.0-next.1
  - @barqjs/server@0.2.0-next.1
  - @barqjs/start@0.2.0-next.1
  - @barqjs/web@0.2.0-next.1

## 0.2.0-next.0

### Patch Changes

- Updated dependencies [05c6d38]
  - @barqjs/core@0.2.0-next.0
  - @barqjs/server@0.2.0-next.0
  - @barqjs/start@0.2.0-next.0
  - @barqjs/web@0.2.0-next.0
