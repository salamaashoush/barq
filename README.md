<p align="center"><img src="./logo.svg" alt="barq" width="96" height="96"></p>

# barq

barq is a full-stack web framework with fine-grained reactivity, a compiler that
catches mistakes before they run, styling with no runtime, and typed routing and
server functions, all in one toolchain. A component runs once, and when a signal
changes only the DOM nodes that read it update.

## What you get

- One toolchain. `barq()` from `@barqjs/vite` runs the compiler, writes the file
  route table and builds the server. Routing, server functions, server
  rendering, components, accessible primitives, forms, queries, tables, virtual
  lists, icons and test utilities are barq packages that share its conventions.
- A compiler that reports mistakes. The Rust compiler turns JSX into cloned
  templates and direct DOM writes, with no virtual DOM. It reports 24
  diagnostics, each with a stable `BARQ` code and a page that shows the fix: an
  accessor used without being called, a store destructured into snapshots, a
  `<Link to>` that no route matches, markup the HTML parser would build
  differently. Silencing one takes a written reason.
- Styles with no runtime. `css` blocks beside the component compile to a
  stylesheet in the same compiler pass, and the call does not survive the build.
- Typed routes and server functions. Route params and loader data are typed from
  the file tree. Server functions are `GET` or `POST` endpoints with typed
  middleware and input validation, and the same build serves API routes, static
  functions and prerendered pages.
- Server rendering that degrades. `renderToStream` sends the shell first and each
  `Loading` boundary as it resolves, and a boundary still waiting at its timeout
  keeps its fallback. A failure after the shell swaps in the nearest `Errored`
  fallback from the stream itself, and a hydration mismatch falls back to a
  client render instead of leaving a broken page.
- Safe defaults. A production build replaces a thrown error's message with a
  generic one unless the error is marked with `markSafeError`. A `GET` server
  function needs barq's `x-barq-fn` header and passes an origin check, so a link
  or an image cannot call it. Refused input comes back as validation issues with
  their paths.
- Errors that say where. A development build names the owner chain
  (`in <App> › <Page>`), a hydration mismatch names the template's
  `file:line:column`, a failed server function carries its source-mapped stack,
  and a header written after the response was sent is reported with its caller.

Reactivity is Solid's engine, `@solidjs/signals`, exported under its own names
(`createSignal`, `createMemo`, `createEffect`, `createStore`). The router and
server functions follow the API design of TanStack Router and TanStack Start,
and `@barqjs/ui` is built from shadcn/ui's designs.

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

- [`@barqjs/ui`](./packages/ui#readme): styled, accessible components and 24 colour themes.
- [`@barqjs/ui-cli`](./packages/ui-cli#readme): `barq-ui add`, which copies components into your project.
- [`@barqjs/aria`](./packages/aria#readme): accessible interactions and headless components.
- [`@barqjs/primitives`](./packages/primitives#readme): scheduling, events, observers, browser APIs and motion.
- [`@barqjs/lucide`](./packages/lucide#readme): every lucide icon as a component.
- [`@barqjs/query`](./packages/query#readme): queries, mutations and caching, on TanStack Query's core.
- [`@barqjs/form`](./packages/form#readme): forms, fields and validation, on TanStack Form's core.
- [`@barqjs/table`](./packages/table#readme): headless tables, on TanStack Table's core.
- [`@barqjs/virtual`](./packages/virtual#readme): virtualized scrolling for long lists, on TanStack Virtual's core.

## Documentation

Each package README is the reference for that package. Beyond them:

- [Compiler diagnostics](./packages/compiler-rs/docs/README.md): every code the
  compiler reports, what it means and how to fix it.
- [Coming from Solid](./packages/core/docs/solid-2.0.md): where barq's API
  differs from Solid 2.0's, and why.
- [Benchmarks](./packages/benchmark/SOLID2-RESULTS.md): rendering, server
  rendering, hydration and bundle size, with the machine and the method behind
  each number.
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
