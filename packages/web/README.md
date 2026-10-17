# @barqjs/web

barq's renderer for the document: `render` and `hydrate`, the runtime the
compiler's DOM output calls, `Portal`, `dynamic`, `clientOnly`, `useHead`, the
request API and the JSX types. Signals, components and control flow come from
`@barqjs/core`, which this package lists as a peer dependency so an application
holds one copy of it.

## Install

```bash
bun add @barqjs/core @barqjs/web
bun add -d @barqjs/vite vite
```

`tsconfig.json` needs `"jsx": "react-jsx"` and `"jsxImportSource": "@barqjs/web"`.

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

const dispose = render(() => <Counter />, document.getElementById("app")!);
```

## Entries

- `@barqjs/web`: the renderer and its public API.
- `@barqjs/web/host`: installs the document as the host `@barqjs/core`'s
  components render through when they are called rather than compiled. The
  compiler imports it into each module that needs it; code that calls `<Show>`
  or `<For>` without the compiler imports it once itself.
- `@barqjs/web/jsx-runtime`: the JSX types, for `jsxImportSource`.
- `@barqjs/web/interp`: the reference backend, for development and tests.
- `@barqjs/web/internal`: what `@barqjs/server` and `@barqjs/start` share with
  the renderer. Not application API.
