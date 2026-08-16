# Barq

Minimal JSX framework with fine-grained reactivity. Components run once (like SolidJS), not on every state change (like React).

## Key Concepts

### Components Run Once

Unlike React, Barq components are called **only once** during initial render. Reactivity is handled through signals - only the specific DOM nodes that depend on changed signals are updated.

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
    "jsxImportSource": "@barqjs/core"
  }
}
```

## API

### useState - Primitive State

```tsx
import { useState } from "@barqjs/core";

const [count, setCount] = useState(0);

// Read
count();  // 0

// Set
setCount(5);
setCount(c => c + 1);
```

### useStore - Nested State with Fine-Grained Reactivity

```tsx
import { useStore } from "@barqjs/core";

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
import { useEffect, useState } from "@barqjs/core";

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
import { useMemo, useState } from "@barqjs/core";

const [items, setItems] = useState([1, 2, 3]);
const total = useMemo(() => items().reduce((a, b) => a + b, 0));

total();  // 6
```

### onMount - Run After Mount

```tsx
import { onMount, useRef } from "@barqjs/core";

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
import { onCleanup, useEffect, useState } from "@barqjs/core";

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
import { createContext, useContext, useState } from "@barqjs/core";

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

### resource - Async Data with Dependencies

`resource(source, fetcher)` is the one async primitive (`useResource` is the same
function under its hook-shaped name). It is a memo, so it is lazy: the first read
starts the fetch. Reading it before it settles throws `NotReadyError`, which a
`Loading` boundary catches and `latest()` steps over — that throw is the status
channel, so there is no second one to keep in sync.

The fetcher's third argument carries an `AbortSignal`. It is a cleanup on the
scope the resource was created under: disposing that scope aborts the request,
and issuing a new one aborts the request it supersedes.

```tsx
import { resource, useState, Await } from "@barqjs/core";

const [userId, setUserId] = useState("1");

const user = resource(
  () => userId(),  // Re-fetches when userId changes
  async (id, { signal }) => {
    const res = await fetch(`/api/users/${id}`, { signal });
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

### linked - Writable State That Re-Seeds

`linked(source, compute, options?)` is derived state you can also write to. The
write holds until `source` next changes; that change recomputes over it and the
write is gone.

It is the answer to the read-copy trap — `useState(props.value)` freezes at the
first value it ever saw — and to controlled inputs, which need both directions:
the user's edit is a write, and the server's answer is a re-seed.

```tsx
import { linked, resource } from "@barqjs/core";

const user = resource(() => userId(), fetchUser);

// Seeded from the server, edited by the user, re-seeded when the server answers
// again. No second signal, and nothing to reconcile.
const draft = linked(() => user.latest()?.name ?? "", (name) => name);

<input type="text" bind:value={draft} />;
```

`compute` receives the previous value, so a re-seed can keep a choice:

```tsx
const chosen = linked(options, (list, previous) =>
  previous !== undefined && list.includes(previous) ? previous : list[0],
);
```

### bind: - Two-Way Form Binding

`bind:value` resolves its property and its reporting event at COMPILE time from
the tag and the `type` attribute: a text input writes `value` and reports on
`input`, a checkbox writes `checked` and reports on `change`, a number input
writes `valueAsNumber`, a `contenteditable` writes its text.

```tsx
<input type="text" bind:value={name} />
<textarea bind:value={notes} />
<input type="checkbox" bind:value={agreed} />
<input type="number" bind:value={amount} />
<select bind:value={size}>…</select>
<input type="radio" name="size" value="s" bind:group={size} />
<div contenteditable="true" bind:value={rich} />
<dialog bind:open={showing} />
<input type="file" bind:files={picked} />
<input ref={el} bind:this={el} />
```

Two things it does that a plain `value={x}` cannot, and they are why it is
compiler syntax rather than a helper:

- **It compares against the ELEMENT before writing.** A setter that rejects or
  normalises a keystroke leaves the signal unchanged, so nothing re-runs — the
  binding re-asserts the signal inside the event instead, and the field never
  keeps text no signal held.
- **It preserves the caret.** Assigning `value` moves the text cursor to the end
  of the control, so a write arriving while you are typing would otherwise
  discard your selection. The selection range, its direction and the focus all
  survive.

A `bind:` target must be writable — a signal, a `linked` cell, or anything with
a `.set`. A read-only accessor gets a `BIND_TARGET_NOT_WRITABLE` diagnostic.

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

#### `keyed` — what identifies a row

`keyed` decides what a row IS, and it changes the signature of `children`. There are
three settings and the middle one is the one most people are looking for.

| `keyed`          | a row is identified by | `children` receives                    |
| ---------------- | ---------------------- | -------------------------------------- |
| omitted / `true` | the item itself        | `(item, index: () => number)`          |
| `(item) => key`  | `key`                  | `(item: () => T, index: () => number)` |
| `false`          | its position           | `(item: () => T, index: number)`       |

**Omitted or `true`** is keyed by identity. Replace an item with a new object and it
is a different row: the old DOM is thrown away and rebuilt. `item` is a plain value,
so `{item.name}` is read once — which is correct, because a changed item means a new
row anyway.

```tsx
// item is a VALUE. Reading item.name once is enough: a new object = a new row.
<For each={() => items()}>{(item) => <li>{item.name}</li>}</For>
```

**A key function** keys the row on whatever you return, so a row SURVIVES a change to
its item. The item then reaches `children` through a signal, so it arrives as an
accessor and you call it:

```tsx
// item is an ACCESSOR. The <li> — and the <input>'s focus, and its selection —
// survive every edit to the row, because the row is identified by id, not by object.
<For each={() => rows()} keyed={(row) => row.id}>
  {(row) => (
    <li>
      <input value={row().text} onInput={(e) => rename(row().id, e.currentTarget.value)} />
    </li>
  )}
</For>
```

This is the answer to "my input loses focus on every keystroke". Without a key
function, editing a row produces a new item object, the row is torn down, and the
`<input>` that had focus no longer exists. `keyed={fn}` is also what other signal
frameworks ship as a separate `<Key by={…}>` component; here it is a prop on `For`.

**`keyed={false}`** makes the row positional. Slot 0 stays slot 0 and only its
contents change, so the item is an accessor and the index is a plain number. Use it
for lists that are edited in place and never reordered — and note what that means for
DOM state: a caret, a selection, a scroll offset or an open `<details>` belongs to the
SLOT, so a reorder leaves it behind. The compiler emits `BARQ011` when it can see such
markup inline in the row. There is one list primitive and three modes; a separate
`Index` component used to spell this one and was deleted.

```tsx
<For each={() => values()} keyed={false}>
  {(value, index) => <li>{index}: {value()}</li>}
</For>
```

The compiler reads `keyed` the same way the runtime does, and when it cannot prove
what `keyed` holds — a variable, a call, anything but a literal — it assumes a key
function, which is the setting that is safe to be wrong about.

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
import { batch } from "@barqjs/core";

batch(() => {
  setA(1);
  setB(2);
  setC(3);
}); // Only triggers one update
```

### untrack - Read Without Subscribing

```tsx
import { untrack } from "@barqjs/core";

useEffect(() => {
  // This will NOT re-run when count changes
  const current = untrack(() => count());
});
```

## How It Works

### Architecture (SolidJS-style, not React-style)

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

In frameworks with compilers (SolidJS, Svelte), the compiler transforms JSX children into getter functions. Without a compiler, Barq needs explicit callbacks for lazy evaluation.

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

// For keyed={false} - render prop with a reactive item and a plain index
<For each={values} keyed={false}>
  {(value, index) => <input value={value()} />}
</For>

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

The compiler makes children a getter function automatically. Without a compiler, Barq needs explicit callbacks to achieve the same lazy evaluation.
