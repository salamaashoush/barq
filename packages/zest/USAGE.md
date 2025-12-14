# zest

Minimal JSX framework with fine-grained reactivity. Components run once (like SolidJS), not on every state change (like React).

## Key Concepts

### Components Run Once

Unlike React, zest components are called **only once** during initial render. Reactivity is handled through signals - only the specific DOM nodes that depend on changed signals are updated.

```tsx
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

### Reactive Interpolation

Pass signals directly to JSX - do NOT call them:

```tsx
const [name, setName] = useState("World");

// CORRECT - signal is passed directly, updates reactively
<span>Hello {name}</span>

// WRONG - evaluated immediately, never updates
<span>Hello {name()}</span>
```

### Reactive Props

For reactive props, pass signals or wrap in functions:

```tsx
// Option 1: Pass signal directly
<Input value={name} />

// Option 2: Pass getter function for derived values
<span class={() => isActive() ? "active" : "inactive"} />

// Option 3: For complex expressions, use a function
<span>{() => items().length > 0 ? "Has items" : "Empty"}</span>
```

### When to Call Signals

- **In JSX children/props**: Pass signal directly `{count}`
- **In event handlers**: Call it `onClick={() => setCount(count() + 1)}`
- **In effects/memos**: Call it `useEffect(() => console.log(count()))`
- **In component logic**: Call it `if (count() > 10) { ... }`

## Setup

```json
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "zest"
  }
}
```

## API

### useState - Primitive State

```tsx
import { useState } from "zest";

const [count, setCount] = useState(0);

// Read
count();  // 0

// Set
setCount(5);
setCount(c => c + 1);
```

### useStore - Nested State with Fine-Grained Reactivity

```tsx
import { useStore } from "zest";

const [state, setState] = useStore({
  user: { name: "John", age: 30 },
  todos: []
});

// Read (subscribes only to that path)
state.user.name;  // Only re-runs when user.name changes

// Update
setState("user", { name: "Jane" });           // Merge into user
setState("user", prev => ({ ...prev, age: 31 }));  // Function update
setState({ user: { name: "Bob", age: 25 } });      // Batch update
```

### useEffect - Side Effects

```tsx
import { useEffect, useState } from "zest";

const [count, setCount] = useState(0);

// Auto-tracks dependencies
useEffect(() => {
  console.log("Count:", count());
});

// With cleanup
useEffect(() => {
  const handler = () => console.log("resize");
  window.addEventListener("resize", handler);
  return () => window.removeEventListener("resize", handler);
});
```

### useMemo - Computed Values

```tsx
import { useMemo, useState } from "zest";

const [items, setItems] = useState([1, 2, 3]);
const total = useMemo(() => items().reduce((a, b) => a + b, 0));

total();  // 6
```

### onMount - Run After Mount

```tsx
import { onMount, useRef } from "zest";

function Chart() {
  const canvasRef = useRef<HTMLCanvasElement>();

  onMount(() => {
    // Runs once after component is in the DOM
    const ctx = canvasRef.current?.getContext("2d");
    // Initialize chart...
  });

  return <canvas ref={canvasRef} />;
}
```

### onCleanup - Cleanup on Dispose

```tsx
import { onCleanup, useEffect, useState } from "zest";

function Timer() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setCount((c) => c + 1), 1000);

    // Cleanup when effect re-runs or component unmounts
    onCleanup(() => clearInterval(id));
  });

  return <div>Count: {count}</div>;
}
```

### createContext / useContext - Dependency Injection

```tsx
import { createContext, useContext, useState } from "zest";

// Create context with optional default
const ThemeContext = createContext<"light" | "dark">("light");
const UserContext = createContext<{ name: string }>();

// Provider sets value for children (MUST use callback pattern)
function App() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  return (
    <ThemeContext.Provider value={theme()}>
      {() => <Dashboard />}
    </ThemeContext.Provider>
  );
}

// Consumer reads value
function Dashboard() {
  const theme = useContext(ThemeContext);  // "dark"

  return <div class={theme === "dark" ? "dark-theme" : "light-theme"}>...</div>;
}

// Throws if no provider and no default
function UserProfile() {
  const user = useContext(UserContext);  // Throws Error if no provider
  return <div>{user.name}</div>;
}
```

**Important:** Context Provider requires callback children. See "Callback Wrapper Pattern" section below.

### useResource - Async Data with Dependencies

```tsx
import { useResource, useState, Await } from "zest";

const [userId, setUserId] = useState("1");

const user = useResource(
  () => userId(),  // Re-fetches when userId changes
  async (id) => {
    const res = await fetch(`/api/users/${id}`);
    return res.json();
  }
);

// In JSX
<Await
  resource={user}
  loading={<div>Loading...</div>}
  error={(err) => <div>Error: {err.message}</div>}
>
  {(data) => <div>{data.name}</div>}
</Await>
```

## Components

### Show - Conditional

```tsx
// Basic usage (children evaluated eagerly)
<Show when={() => isLoggedIn()} fallback={<LoginForm />}>
  <Dashboard />
</Show>

// Recommended: callback for lazy evaluation
<Show when={() => isLoggedIn()} fallback={<LoginForm />}>
  {() => <Dashboard />}
</Show>

// With render prop (receives truthy value):
<Show when={() => user()}>
  {(u) => <UserProfile user={u} />}
</Show>
```

### For - Lists

```tsx
<For each={() => items()} fallback={<p>Empty</p>}>
  {(item, index) => <div>{index()}: {item.name}</div>}
</For>
```

### Switch/Match - Pattern Matching

Match children **must** be callback functions:

```tsx
<Switch fallback={<NotFound />}>
  <Match when={() => route() === "home"}>
    {() => <Home />}
  </Match>
  <Match when={() => route() === "about"}>
    {() => <About />}
  </Match>
</Switch>

// With render prop (receives truthy value):
<Match when={() => user()}>
  {(u) => <UserProfile user={u} />}
</Match>
```

### Portal - Render Outside

```tsx
<Portal target="#modal-root">
  <Modal />
</Portal>
```

### Suspense / ErrorBoundary

```tsx
<ErrorBoundary fallback={(err) => <div>Error: {err.message}</div>}>
  <Suspense fallback={<div>Loading...</div>}>
    <AsyncComponent />
  </Suspense>
</ErrorBoundary>
```

## Utilities

### batch - Batch Updates

```tsx
import { batch } from "zest";

batch(() => {
  setA(1);
  setB(2);
  setC(3);
}); // Only triggers one update
```

### untrack - Read Without Subscribing

```tsx
import { untrack } from "zest";

useEffect(() => {
  // This will NOT re-run when count changes
  const current = untrack(() => count());
});
```

## How It Works

### Architecture (SolidJS-style, not React-style)

```
React:                              zest:

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

### Why It's Fast

1. **Components run once** - No re-execution on state changes
2. **Fine-grained reactivity** - Only DOM nodes that depend on changed signals update
3. **No VDOM** - Direct DOM mutations, no diffing overhead
4. **Lazy subscriptions** - Signals only track effects that read them
5. **Surgical updates** - Changing `count` only updates the text node showing `count`, nothing else

### The Trade-offs

**Trade-off 1: Signal Syntax**

You must pass signals directly `{count}` instead of calling them `{count()}` in JSX. This is because without a compiler, JavaScript evaluates `count()` before the JSX runtime sees it.

**Trade-off 2: Callback Wrappers for Lazy Evaluation**

Without a compiler, JSX children are evaluated **before** the parent component runs. This affects certain components that need lazy/conditional evaluation.

## Callback Wrapper Pattern

### Why Callbacks Are Needed

In frameworks with compilers (SolidJS, Svelte), the compiler transforms JSX children into getter functions. Without a compiler, zest needs explicit callbacks for lazy evaluation.

**The Problem:**
```tsx
// This is how you might write it intuitively:
<Switch>
  <Match when={() => route() === "home"}>
    <Home />  // Evaluated IMMEDIATELY, even if route() !== "home"
  </Match>
</Switch>
```

When JSX is parsed, `<Home />` is evaluated right away - before Switch or Match even run. This means:
1. Component side effects happen regardless of conditions
2. Context values may not be set yet
3. Unnecessary component instantiation

**The Solution - Callback Wrappers:**
```tsx
<Switch>
  <Match when={() => route() === "home"}>
    {() => <Home />}  // Evaluated ONLY when route() === "home"
  </Match>
</Switch>
```

The `{() => ...}` wrapper defers evaluation until the parent component explicitly calls the function.

### Components Requiring Callbacks

#### Switch/Match (MANDATORY)

Match children **must** be functions. TypeScript enforces this.

```tsx
// CORRECT - callback wrapper
<Switch fallback={<NotFound />}>
  <Match when={() => status() === "loading"}>
    {() => <LoadingSpinner />}
  </Match>
  <Match when={() => status() === "error"}>
    {() => <ErrorDisplay />}
  </Match>
  <Match when={() => status() === "success"}>
    {() => <Dashboard />}
  </Match>
</Switch>

// With render prop (receives truthy value):
<Match when={() => user()}>
  {(u) => <UserProfile user={u} />}
</Match>

// WRONG - will not compile
<Match when={() => status() === "loading"}>
  <LoadingSpinner />  // TypeScript error: children must be function
</Match>
```

#### Context Provider (REQUIRED)

Context Provider children **must** be callbacks for `useContext` to work correctly.

```tsx
const ThemeContext = createContext<"light" | "dark">("light");

// CORRECT - callback wrapper
<ThemeContext.Provider value="dark">
  {() => <App />}  // useContext inside App will receive "dark"
</ThemeContext.Provider>

// WRONG - useContext returns default/undefined
<ThemeContext.Provider value="dark">
  <App />  // App is evaluated BEFORE Provider sets the value
</ThemeContext.Provider>

// Nested providers need nested callbacks:
<ThemeContext.Provider value={theme()}>
  {() => (
    <UserContext.Provider value={user()}>
      {() => <App />}
    </UserContext.Provider>
  )}
</ThemeContext.Provider>
```

**Why?** JSX evaluation order:
1. `<App />` is evaluated (calls `App()`, which calls `useContext()`)
2. Then Provider receives the result as `children` prop
3. Provider sets the context value
4. But it's too late - `useContext()` already ran in step 1

With callbacks, the Provider sets the value first, then calls the callback.

#### Show (RECOMMENDED)

Show doesn't require callbacks, but they're recommended for performance:

```tsx
// Works, but Dashboard is created even when hidden
<Show when={() => isLoggedIn()}>
  <Dashboard />
</Show>

// Better - Dashboard only created when needed
<Show when={() => isLoggedIn()}>
  {() => <Dashboard />}
</Show>

// With render prop (receives truthy value):
<Show when={() => user()}>
  {(u) => <UserProfile user={u} />}
</Show>
```

### Components Using Render Props (Already Correct)

These components already require callback/function children:

```tsx
// For - render prop for each item
<For each={items}>
  {(item, index) => <div>{index()}: {item.name}</div>}
</For>

// Index - render prop with reactive item
<Index each={values}>
  {(value, index) => <input value={value()} />}
</Index>

// Await - render prop for loaded data
<Await resource={userResource} loading={<Spinner />}>
  {(data) => <UserProfile user={data} />}
</Await>

// ErrorBoundary - render prop for error
<ErrorBoundary fallback={(err, reset) => <Error error={err} onRetry={reset} />}>
  <App />
</ErrorBoundary>
```

### How SolidJS Handles This

SolidJS uses a compiler that transforms JSX. Your code:
```tsx
<Show when={isLoggedIn()}>
  <Dashboard />
</Show>
```

Gets compiled to something like:
```js
Show({
  get when() { return isLoggedIn(); },
  get children() { return Dashboard(); }  // Getter, not direct call
})
```

The compiler makes children a getter function automatically. Without a compiler, zest needs explicit callbacks to achieve the same lazy evaluation.
