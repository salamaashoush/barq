<div align="center">

<img src="./logo.svg" alt="Barq" width="120" height="120">

# Barq

**Lightning-fast JSX framework with fine-grained reactivity**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.1+-f9f1e1.svg)](https://bun.sh/)

[Getting Started](#quick-start) | [Documentation](./packages/core/USAGE.md) | [Examples](#api-overview)

</div>

---

Barq (Arabic for "lightning") is a minimal JSX framework where components run once and only the DOM nodes that depend on changed signals update. No virtual DOM, no diffing, just surgical DOM updates.

## Features

- **Components run once** - Unlike React, component functions execute only during initial render
- **Fine-grained reactivity** - Only DOM nodes depending on changed signals update
- **No Virtual DOM** - Direct DOM mutations, zero diffing overhead
- **Tiny bundle** - Core is ~5KB gzipped
- **TypeScript first** - Full type safety with excellent inference
- **Familiar API** - React-like hooks: `useState`, `useEffect`, `useMemo`, `useContext`
- **SolidJS-style stores** - Nested reactive state with `useStore`
- **Async primitives** - `useResource` and `Await` for data fetching

## Installation

```bash
# Core framework
bun add @barqjs/core

# Optional: Extra utilities (router, CSS-in-JS, query hooks)
bun add @barqjs/extra

# Optional: Testing utilities
bun add @barqjs/testing
```

## Quick Start

### 1. Configure TypeScript

```json
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@barqjs/core"
  }
}
```

### 2. Create a Component

```tsx
import { useState } from "@barqjs/core";

function Counter() {
  console.log("This runs ONCE, not on every update");

  const [count, setCount] = useState(0);

  return (
    <div>
      <span>Count: {count}</span>
      <button onClick={() => setCount(c => c + 1)}>+</button>
    </div>
  );
}
```

### 3. Render

```tsx
import { render } from "@barqjs/core";

render(<Counter />, document.getElementById("app")!);
```

## Key Concept: Reactive Interpolation

Pass signals directly to JSX - do NOT call them:

```tsx
const [name, setName] = useState("World");

// CORRECT - signal passed directly, updates reactively
<span>Hello {name}</span>

// WRONG - evaluated immediately, never updates
<span>Hello {name()}</span>
```

## Packages

| Package | Description |
|---------|-------------|
| `@barqjs/core` | Core framework: signals, hooks, components, JSX runtime |
| `@barqjs/extra` | Router, CSS-in-JS (goober), TanStack Query integration, utility hooks |
| `@barqjs/testing` | Testing utilities built on @testing-library/dom |

## How It Works

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

## API Overview

### State

```tsx
// Primitive state
const [count, setCount] = useState(0);
count();           // Read: 0
setCount(5);       // Write
setCount(c => c + 1); // Update

// Nested state with fine-grained reactivity
const [state, setState] = useStore({
  user: { name: "John", age: 30 },
  todos: []
});
state.user.name;   // Only subscribes to user.name
setState("user", { name: "Jane" }); // Partial update
```

### Effects

```tsx
// Auto-tracks dependencies
useEffect(() => {
  console.log("Count:", count());
});

// Computed values
const double = useMemo(() => count() * 2);

// Lifecycle
onMount(() => console.log("Mounted"));
onCleanup(() => console.log("Cleanup"));
```

### Components

```tsx
// Conditional rendering
<Show when={() => isLoggedIn()} fallback={<Login />}>
  {() => <Dashboard />}
</Show>

// Lists
<For each={() => items()}>
  {(item, index) => <div>{index()}: {item.name}</div>}
</For>

// Pattern matching
<Switch fallback={<NotFound />}>
  <Match when={() => route() === "home"}>{() => <Home />}</Match>
  <Match when={() => route() === "about"}>{() => <About />}</Match>
</Switch>

// Async data
<Await resource={user} loading={<Spinner />}>
  {(data) => <Profile user={data} />}
</Await>
```

### Context

```tsx
const ThemeContext = createContext<"light" | "dark">("light");

// Provider (requires callback children)
<ThemeContext.Provider value="dark">
  {() => <App />}
</ThemeContext.Provider>

// Consumer
const theme = useContext(ThemeContext); // "dark"
```

## Documentation

See [USAGE.md](./packages/core/USAGE.md) for complete API documentation and patterns.

## Development

```bash
# Install dependencies
bun install

# Run dev server (kitchen-sink demo)
bun run dev

# Run tests
bun run test

# Type check
bun run typecheck

# Lint
bun run lint

# Build all packages
bun run build
```

## Acknowledgments

- [SolidJS](https://solidjs.com) - Inspiration for fine-grained reactivity model
- [alien-signals](https://github.com/nickmccurdy/alien-signals) - Fast signal implementation
- [goober](https://github.com/cristianbote/goober) - Tiny CSS-in-JS (used in @barqjs/extra)
- [TanStack Query](https://tanstack.com/query) - Query integration (used in @barqjs/extra)

## License

MIT
