<p align="center"><img src="./logo.svg" alt="barq" width="96" height="96"></p>

# barq

barq is a full-stack web framework with fine-grained reactivity, a compiler that
catches mistakes before they run, styling with no runtime, and typed routing and
server functions, all in one toolchain. A component runs once, and when a signal
changes only the DOM nodes that read it update.

## What you get

- **One toolchain.** `barq()` from `@barqjs/vite` runs the compiler, writes the
  file route table and builds the server. Routing, server functions, server
  rendering, components, accessible primitives, forms, queries, tables, virtual
  lists, icons and test utilities are barq packages that share its conventions.
- **A compiler that reports mistakes.** The Rust compiler turns JSX into cloned
  templates and direct DOM writes, with no virtual DOM, or into calls on a
  renderer of your own for a host that is not a document. It reports 33
  diagnostics, each with a stable `BARQ` code and a page that shows the fix: an
  accessor used without being called, a store destructured into snapshots, a
  `<Link to>` that no route matches, markup the HTML parser would build
  differently. Silencing one takes a written reason.
- **Findings a tool can act on.** `barq check` runs those diagnostics over a
  project with no build and no dev server, prints text or JSON, and `--fix`
  applies the edits the findings carry. A development build names the signal,
  the element and the `file:line:column` behind a runtime finding, and
  `@barqjs/diagnostics` collects them into one artifact a test or a coding
  agent can assert on.
- **Styles with no runtime.** `css` blocks beside the component compile to a
  stylesheet in the same compiler pass, and the call does not survive the
  build. Atomic styles come out in one order in development and in every build.
- **Typed routes and server functions.** Route params and loader data are typed
  from the file tree. Server functions are `GET` or `POST` endpoints with typed
  middleware and input validation, and the same build serves API routes, static
  functions and prerendered pages.
- **Server rendering that degrades.** `renderToStream` sends the shell first and
  each `Loading` boundary as it resolves, and a boundary still waiting at its
  timeout keeps its fallback. A failure after the shell swaps in the nearest
  `Errored` fallback from the stream itself, and a hydration mismatch falls
  back to a client render instead of leaving a broken page.
- **Safe defaults.** A production build replaces a thrown error's message with a
  generic one unless the error is marked with `markSafeError`. A `GET` server
  function needs barq's `x-barq-fn` header and passes an origin check, so a link
  or an image cannot call it. Refused input comes back as validation issues with
  their paths.

Reactivity is Solid's engine, `@solidjs/signals`, exported under its own names
(`createSignal`, `createMemo`, `createEffect`, `createStore`). The router and
server functions follow the API design of TanStack Router and TanStack Start,
and the components barq-ui copies are built from shadcn/ui's designs.

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
import { createSignal } from "@barqjs/core";
import { render } from "@barqjs/web";

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

Props are read as values, and they may be destructured:

```tsx
function Greeting({ name, tone = "warm", ...rest }: GreetingProps) {
  return (
    <p class={tone} {...rest}>
      hello {name.toUpperCase()}
    </p>
  );
}
```

Each name stays live: when the caller's `name` changes, that text updates and
`Greeting` does not run again. The compiler turns each use into a read of the
prop, so a default applies whenever the prop is `undefined` and the rest
carries whatever the pattern did not name.

Styles are written beside the component and leave nothing in the bundle:

```tsx
import type { ParentProps } from "@barqjs/core";
import { css } from "@barqjs/css";

const card = css`
  padding: 16px;
  border-radius: 12px;

  &:hover {
    background: #334155;
  }
`;

export function Card({ children }: ParentProps) {
  return <div class={card}>{children}</div>;
}
```

A server function is a typed call from the client and an endpoint on the server:

```tsx
import { createServerFn } from "@barqjs/start";

export const serverTime = createServerFn().handler(() => new Date());

const at = await serverTime(); // a Date, fetched from the server
```

## Checking a project

```bash
npx barq check          # every finding, as text
npx barq check --json   # the same, for a tool
npx barq check --fix    # apply the fixes the findings carry
```

Each finding has a code, a location and a page under
[`packages/compiler/docs`](./packages/compiler/docs/README.md).

## Packages

The framework:

- [`@barqjs/core`](./packages/core#readme): signals, stores, components and control flow, with no renderer.
- [`@barqjs/web`](./packages/web#readme): the document renderer, `render`, `hydrate`, `Portal`, the head, the request API and the JSX types.
- [`@barqjs/universal`](./packages/universal#readme): `createRenderer`, barq on a host other than the document.
- [`@barqjs/three`](./packages/three#readme): three.js scenes as JSX, with `<Canvas>`, `useFrame`, `useThree` and `useLoader`.
- [`@barqjs/vite`](./packages/vite#readme): the Vite plugin, `barq()`.
- [`@barqjs/compiler`](./packages/compiler#readme): the native JSX compiler the plugin runs.
- [`@barqjs/router`](./packages/router#readme): file routes, loaders, head management, SSR and prerendering.
- [`@barqjs/start`](./packages/start#readme): server functions, middleware, sessions, cookies and the server.
- [`@barqjs/server`](./packages/server#readme): `renderToString`, `renderToStream` and hydration.
- [`@barqjs/css`](./packages/css#readme): nested and atomic CSS, compiled to a stylesheet.
- [`@barqjs/testing`](./packages/testing#readme): render components, routes and server output in tests.
- [`@barqjs/diagnostics`](./packages/diagnostics#readme): findings and attribution as one artifact, with assertions, budgets and a dev-server endpoint for agents.
- [`@barqjs/cli`](./packages/cli#readme): `barq check`, the compiler's findings for a whole project as text or JSON, with `--fix`.
- [`create-barq`](./packages/create-barq#readme): the project scaffolder.

Components and libraries:

- [`@barqjs/ui-cli`](./packages/ui-cli#readme): `barq-ui add`, which copies styled, accessible
  components and 24 colour themes into your project, from the source in
  [`packages/ui`](./packages/ui#readme).
- [`@barqjs/aria`](./packages/aria#readme): accessible interactions and headless components.
- [`@barqjs/primitives`](./packages/primitives#readme): scheduling, events, observers, browser APIs and motion.
- [`@barqjs/lucide`](./packages/lucide#readme): every lucide icon as a component.
- [`@barqjs/query`](./packages/query#readme): queries, mutations and caching, on TanStack Query's core.
- [`@barqjs/db`](./packages/db#readme): live queries over TanStack DB collections, with server rendering.
- [`@barqjs/form`](./packages/form#readme): forms, fields and validation, on TanStack Form's core.
- [`@barqjs/table`](./packages/table#readme): headless tables, on TanStack Table's core.
- [`@barqjs/virtual`](./packages/virtual#readme): virtualized scrolling for long lists, on TanStack Virtual's core.
- [`@barqjs/lexical`](./packages/lexical#readme): rich-text editing on Lexical, with barq components in the document, menus, Yjs collaboration and server rendering.
- [`@barqjs/diagram`](./packages/diagram#readme): whiteboard diagrams on Excalidraw's element model, with its file format, canvas and SVG rendering, export, and a viewer that renders on the server.

## Documentation

Each package README is the reference for that package. Beyond them:

- [Compiler diagnostics](./packages/compiler/docs/README.md): every code the
  compiler reports, what it means and how to fix it.
- [Coming from Solid](./packages/core/docs/solid-2.0.md): where barq's API
  differs from Solid 2.0's, and why.
- [Benchmarks](./packages/benchmark/SOLID2-RESULTS.md): rendering, server
  rendering, hydration and bundle size, with the machine and the method behind
  each number.
- [`packages/site`](./packages/site): the docs site for the components, with every
  component's examples and the theme builder. Run it with
  `bun run --cwd packages/site dev` after a root `bun run build`.
- [`packages/kitchen-sink`](./packages/kitchen-sink): one application that uses
  every feature, built and prerendered by CI.

## Repository layout

```
packages/
  core, web, server, universal, three                        the runtime and its renderers
  compiler, vite, cli                                        the Rust compiler, the Vite plugin, `barq check`
  router, start                                              routing and the server
  css, aria, primitives, ui, ui-cli                          styling, accessibility and components
  query, db, form, table, virtual, lexical, diagram, lucide  libraries
  testing, diagnostics                                       test utilities and findings
  create-barq                                                the project scaffolder
  site, kitchen-sink, three-demo                             the docs site and two example apps
  benchmark                                                  the measurements behind the published numbers
.github/                                                     CI, the release workflow and their scripts
```

## Contributing

[CONTRIBUTING.md](./CONTRIBUTING.md) has the setup, the checks CI runs and how
a change is released. Issues and pull requests are welcome at
[github.com/salamaashoush/barq](https://github.com/salamaashoush/barq).

## License

MIT
