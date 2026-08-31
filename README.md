<div align="center">

<img src="./logo.svg" alt="Barq" width="120" height="120">

# Barq

**Lightning-fast JSX framework with fine-grained reactivity**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.1+-f9f1e1.svg)](https://bun.sh/)

[Quick start](#quick-start) | [Packages](#packages) | [How it works](#how-it-works)

</div>

---

Barq (Arabic for "lightning") is a JSX framework where components run once and
only the DOM nodes that read a changed signal update. No virtual DOM, no
diffing.

The compiler is not an optimisation on top of a runtime — it is how the
framework works. JSX lowers to cloned templates and a walk to each dynamic hole,
props cross a component boundary as callable cells rather than as values, and
control flow becomes four primitives the compiler hands a `(parent, anchor)`
pair it already computed.

## Quick start

```bash
bun create barq my-app
cd my-app
bun install
bun run dev
```

Three templates: `full-stack` (server-rendered pages, API routes, server
functions, prerendering), `spa` (client routing with server functions), and
`minimal` (the compiler and signals, no router). Every one of them builds,
typechecks and runs before it is published.

## A component

```tsx
import { render, signal } from "@barqjs/core";

function Counter() {
  // This runs ONCE. Nothing below re-runs it.
  const count = signal(0);

  return (
    <button type="button" onClick={() => count.update((n) => n + 1)}>
      clicked {count} times
    </button>
  );
}

render(() => <Counter />, document.getElementById("app")!);
```

`{count}` is a tracked read, not a snapshot: the compiler wraps it, and the
click updates that one text node.

## Packages

| Package | What it is |
| --- | --- |
| [`@barqjs/core`](./packages/core#readme) | signals, JSX, the DOM renderer |
| [`@barqjs/router`](./packages/router#readme) | file-based routing, SSR, prerendering, API routes |
| [`@barqjs/start`](./packages/start#readme) | server functions, sessions, cookies, rate limiting, the server |
| [`@barqjs/server`](./packages/server#readme) | the string backend and the streaming SSR runtime |
| [`@barqjs/testing`](./packages/testing#readme) | rendering, routes, hydration and the RPC wire, under test |
| [`@barqjs/compiler`](./packages/compiler) | the Vite plugin |
| [`@barqjs/primitives`](./packages/primitives#readme) | scheduling, events, observers, browser APIs, collections, motion |
| [`@barqjs/aria`](./packages/aria#readme) | accessible interactions, state and headless components |
| [`@barqjs/css`](./packages/css#readme) | nested CSS and atomic styles, compiled to a stylesheet |
| [`@barqjs/ui`](./packages/ui#readme) | shadcn/ui's components and every one of its themes |
| [`@barqjs/ui-cli`](./packages/ui-cli#readme) | `barq-ui add button`, and `sync` that keeps your edits |
| [`@barqjs/lucide`](./packages/lucide#readme) | every lucide icon, as a barq component |
| [`@barqjs/query`](./packages/query#readme) | the TanStack Query adapter |
| [`create-barq`](./packages/create-barq#readme) | `bun create barq my-app` |

`@barqjs/compiler` is a dev dependency of every application. Without it a `.tsx`
file goes through a generic JSX transform and gets different semantics.

## How it works

```
React:                              Barq:

State changes                       State changes
    |                                   |
    v                                   v
Re-run component function           Signal notifies subscribers
    |                                   |
    v                                   v
Generate new VDOM                   Update specific DOM nodes
    |                                   |
    v                                   v
Diff old vs new VDOM                Done!
    |
    v
Patch real DOM
```

One consequence worth stating early: because a component body runs once, a
"hook" here is not a call that has to happen in the same order every render.
There is no rules-of-hooks, and no dependency array.

## Documentation

Each package's README is its own reference. Beyond those:

- [compiler diagnostics](./packages/compiler-rs/docs/README.md) — every code the
  compiler can report, what it means, and how to silence one.
- [`packages/kitchen-sink`](./packages/kitchen-sink) — every feature in one
  application that builds, prerenders and serves.

## Development

```bash
bun install
bun run dev         # the kitchen-sink demo
bun run test        # every package's suite
bun run typecheck
bun run build
bun run ci          # lint and format, as CI runs them
```

The Rust compiler lives in `packages/compiler-rs` and is built by
`bun run build` there; `cargo test` runs its own suite.

## Acknowledgments

- [SolidJS](https://solidjs.com) — the fine-grained reactivity model
- [alien-signals](https://github.com/nickmccurdy/alien-signals) — fast signals
- [TanStack Router](https://tanstack.com/router) — the routing and server-function
  surface `@barqjs/router` and `@barqjs/start` follow
- [TanStack Query](https://tanstack.com/query) — the adapter in `@barqjs/query`

## License

MIT
