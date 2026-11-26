# @barqjs/vite

## 0.2.0-next.4

### Patch Changes

- 0a43dbe: `@barqjs/primitives` adds `colorScheme`, `useColorScheme` and `colorSchemeScript`: a light, dark or system theme kept in a cookie and written on `<html>` before the first paint, so a server-rendered or prerendered page never flashes the wrong theme.

  The Vite plugin finds packages that publish source at any depth and through peer dependencies, resolving each from where its dependent is installed. A design system built on `@barqjs/aria` no longer leaves `@barqjs/primitives` external in the server bundle.

  Inline scripts and styles declared through `useHead` carry the render's CSP nonce, in the shell and in streamed head patches, and an `id` names a script's or style's head identity.

- a29585c: Style groups and token objects fold through a barrel, and arc ships only the families an app uses.

  - compiler: `export { x } from`, `export * from`, `export const alias = group` and `import * as ns` fold across modules, and a token object (plain or `as const`, nested, numeric members kept as numbers) folds wherever it is read, even from a module that never imports `@barqjs/css`. A member that is not a static literal still raises `BARQ017`. A `create` key that is not an identifier, such as `"2xl"`, is quoted in the output.
  - vite: the stylesheet carried with a fold is the declaring module's, followed through a barrel, rather than every module compiled on the way.
  - ui: `@barqjs/ui/theme/tokens` exports the token object alone, with no side effect.
  - arc: `@barqjs/arc/style` is a barrel over one module per family (layout, gap, type, colour, surface, focus, interaction, motion, target, tokens), and colours and the radius read ui's tokens.
  - arc: `Stack`, `Inline`, `Grid` and `Container` set a custom property per step inline (`--arc-gap-base`, `--arc-gap-md`), read by one fixed rule per step, and refuse a value that is not one of the system's tokens. The layout components' CSS went from 14.9 KB to 8.2 KB.

- e82bd6c: `@barqjs/start` takes WebSocket upgrades on routes (`upgradeWebSocket`, crossws's hooks) in dev, preview and the built server, relays to another server with `proxyRequest`, sets response headers by path (`server.headers`, static files included), and runs `server.setup` modules at start with a close hook. The built `serve.js` picks srvx's and crossws's adapters when the process starts, so one build runs on Bun, Node and Deno, and `server.target` is gone.

  `@barqjs/router` adds `createServerEntry(handler, around)`, code around every request including server functions and upgrades, and the page handler's `nonce` takes a function for a fresh nonce per request.

  `@barqjs/primitives` adds `eventSource` for server-sent events, and `websocket` now moves to a new URL when a reactive one changes.

  `@barqjs/ui` is published as the base of `@barqjs/arc`, barq's design system: a theme with tones, surface, code, motion and stacking tokens and app brand tokens, and its first components, `PageHeader`, `Status` and `confirm()`.

- Updated dependencies [048ed75]
- Updated dependencies [bb3630d]
- Updated dependencies [a29585c]
- Updated dependencies [0968d16]
- Updated dependencies [7847b93]
- Updated dependencies [f265cd9]
- Updated dependencies [644ccc8]
- Updated dependencies [3f6aa6d]
- Updated dependencies [b6342be]
- Updated dependencies [1fbb6e4]
- Updated dependencies [e82bd6c]
  - @barqjs/compiler@0.2.0-next.4
  - @barqjs/router@0.2.0-next.4
  - @barqjs/start@0.2.0-next.4

## 0.2.0-next.3

### Patch Changes

- @barqjs/compiler@0.2.0-next.3
  - @barqjs/router@0.2.0-next.3
  - @barqjs/start@0.2.0-next.3

## 0.2.0-next.2

### Patch Changes

- @barqjs/compiler@0.2.0-next.2
  - @barqjs/router@0.2.0-next.2
  - @barqjs/start@0.2.0-next.2

## 0.2.0-next.1

### Patch Changes

- @barqjs/compiler@0.2.0-next.1
  - @barqjs/router@0.2.0-next.1
  - @barqjs/start@0.2.0-next.1

## 0.2.0-next.0

### Patch Changes

- @barqjs/compiler@0.2.0-next.0
  - @barqjs/router@0.2.0-next.0
  - @barqjs/start@0.2.0-next.0
