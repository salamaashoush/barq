<p align="center"><img src="./logo.svg" alt="barq" width="96" height="96"></p>

# barq

barq is a web framework with Solid 2.0's reactive API, a native JSX compiler
written in Rust, and a port of TanStack Router and Start for routing and server
code. A component runs once, and when a signal changes only the DOM nodes that
read it update.

## Why barq

- Fine-grained reactivity with Solid 2.0's API. The engine is `@solidjs/signals`,
  exported under Solid's own names: `createSignal`, `createMemo`, `createEffect`,
  `createStore`, `Show`, `For`, `Loading`, `Errored`.
- A native compiler. JSX becomes cloned templates and direct DOM writes, with no
  virtual DOM, and every warning it gives has a code and a page that explains it.
- Server rendering with streaming. `renderToStream` sends the shell first and
  each `Loading` boundary's content as it resolves, then hydrates in place.
- Server functions, middleware and server routes, with TanStack Start's API.
- CSS-in-JS that compiles to a stylesheet at build time.
- One Vite plugin, `barq()`, for the compiler, file routes and the server build.

## Quick start

```bash
bun create barq my-app
cd my-app
bun install
bun run dev
```

`npm create barq@latest my-app` and `pnpm create barq my-app` work the same way.
Pick a template with `--template`: `full-stack` (the default: server-rendered
pages, API routes, server functions, prerendering), `spa` (client routing with
server functions) or `minimal` (the compiler and signals, no router).

## A component

```tsx
import { createSignal, render } from "@barqjs/core";

function Counter() {
  const [count, setCount] = createSignal(0);

  return (
    <button type="button" onClick={() => setCount((n) => n + 1)}>
      clicked {count} times
    </button>
  );
}

render(() => <Counter />, document.getElementById("app")!);
```

`Counter` runs once. `{count}` is a tracked read rather than a snapshot, so a
click updates that one text node and nothing else. There are no rules of hooks
and no dependency arrays.

## Packages

The framework:

- [`@barqjs/core`](./packages/core#readme): signals, stores, control flow, JSX and the DOM renderer.
- [`@barqjs/vite`](./packages/vite#readme): the Vite plugin, `barq()`.
- [`@barqjs/compiler-rs`](./packages/compiler-rs#readme): the native JSX compiler the plugin runs.
- [`@barqjs/router`](./packages/router#readme): file routes, loaders, head management, SSR and prerendering.
- [`@barqjs/start`](./packages/start#readme): server functions, middleware, sessions, cookies and the server.
- [`@barqjs/server`](./packages/server#readme): `renderToString`, `renderToStream` and hydration.
- [`@barqjs/css`](./packages/css#readme): nested and atomic CSS, compiled to a stylesheet.
- [`@barqjs/testing`](./packages/testing#readme): render components, routes and server output in tests.
- [`create-barq`](./packages/create-barq#readme): the project scaffolder.

Components and libraries:

- [`@barqjs/ui`](./packages/ui#readme): shadcn/ui's components and themes.
- [`@barqjs/ui-cli`](./packages/ui-cli#readme): `barq-ui add`, which copies components into your project.
- [`@barqjs/aria`](./packages/aria#readme): accessible interactions and headless components.
- [`@barqjs/primitives`](./packages/primitives#readme): scheduling, events, observers, browser APIs and motion.
- [`@barqjs/lucide`](./packages/lucide#readme): every lucide icon as a component.
- [`@barqjs/query`](./packages/query#readme): TanStack Query.
- [`@barqjs/form`](./packages/form#readme): TanStack Form.
- [`@barqjs/table`](./packages/table#readme): TanStack Table.
- [`@barqjs/virtual`](./packages/virtual#readme): TanStack Virtual.

## Documentation

Each package README is the reference for that package. Beyond them:

- [Where barq differs from Solid 2.0](./packages/core/docs/solid-2.0.md).
- [Compiler diagnostics](./packages/compiler-rs/docs/README.md): every code the
  compiler reports, what it means and how to fix it.
- [`packages/site`](./packages/site): the docs site for `@barqjs/ui`, with every
  component's examples and the theme builder. Run it with
  `bun run --cwd packages/site dev` after a root `bun run build`.
- [`packages/kitchen-sink`](./packages/kitchen-sink): one application that uses
  every feature, built and prerendered by CI.

## Contributing

You need [Bun](https://bun.sh) and a Rust toolchain, since the root build
compiles the native compiler.

```bash
bun install
bun run build      # every package, then the apps
bun run test       # every package's suite; the compiler's browser checks need Chrome
bun run ci         # lint and format, as CI runs them
bash .github/scripts/typecheck.sh
bun run dev        # the kitchen-sink app
```

`bun test` resolves the workspace packages from `src`, but a Vite build such as
the docs site resolves them from `dist`, so rebuild a package after changing it
before checking the change there. Issues and pull requests are
welcome at [github.com/salamaashoush/barq](https://github.com/salamaashoush/barq).

## License

MIT
