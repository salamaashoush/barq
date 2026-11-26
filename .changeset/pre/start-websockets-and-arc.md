---
"@barqjs/start": patch
"@barqjs/router": patch
"@barqjs/vite": patch
"@barqjs/primitives": patch
"@barqjs/ui": patch
"@barqjs/arc": patch
---

`@barqjs/start` takes WebSocket upgrades on routes (`upgradeWebSocket`, crossws's hooks) in dev, preview and the built server, relays to another server with `proxyRequest`, sets response headers by path (`server.headers`, static files included), and runs `server.setup` modules at start with a close hook. The built `serve.js` picks srvx's and crossws's adapters when the process starts, so one build runs on Bun, Node and Deno, and `server.target` is gone.

`@barqjs/router` adds `createServerEntry(handler, around)`, code around every request including server functions and upgrades, and the page handler's `nonce` takes a function for a fresh nonce per request.

`@barqjs/primitives` adds `eventSource` for server-sent events, and `websocket` now moves to a new URL when a reactive one changes.

`@barqjs/ui` is published as the base of `@barqjs/arc`, barq's design system: a theme with tones, surface, code, motion and stacking tokens and app brand tokens, and its first components, `PageHeader`, `Status` and `confirm()`.
