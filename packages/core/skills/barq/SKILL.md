---
name: barq
description: barq authoring primer for coding agents. Load before writing, reviewing or migrating barq application code (@barqjs/core, @barqjs/web). barq differs from React and from Solid in props, effects and control flow, so read it before generating components.
---

# Writing barq

barq is a JSX framework with fine-grained updates: a component function runs
once, and afterwards only the DOM nodes that read a changed signal are touched.
There is no virtual DOM, no re-render and no dependency array. Its reactivity
is the `@solidjs/signals` engine (the one Solid 2.0 uses), and its own Rust
compiler turns JSX into DOM calls.

Imports have one home each:

- `@barqjs/core`: signals, stores, effects, context, control-flow components
  (`Show`, `For`, `Switch`, `Match`, `Loading`, `Errored`, `Reveal`, `Repeat`),
  `lazy`.
- `@barqjs/web`: `render`, `hydrate`, `Portal`, `dynamic`, `clientOnly`,
  `useHead`, `isServer`, the JSX types.
- `@barqjs/router`: `createFileRoute`, `Link`. `@barqjs/start`:
  `createServerFn`, response helpers.

Nothing is imported from `solid-js`, `@solidjs/web` or `react`.

Setup: `@barqjs/vite` in `vite.config.ts` (`plugins: [barq()]`), and in
`tsconfig.json` `"jsx": "react-jsx"` with `"jsxImportSource": "@barqjs/web"`.

## Four rules

1. **A component body runs once.** Put anything that must follow state in JSX,
   a memo, or an effect. An `if` in the body that reads a signal decides once.
2. **Read a signal by calling it**: `count()`. Props are the exception: they
   are plain values, `props.title`, never `props.title()`.
3. **`createEffect` takes two functions**: the first tracks and returns a
   value, the second does the side effect with it.
4. **Writes happen in event handlers, `onSettled`, actions, or an effect's
   second function.** Never in a component body, a memo, or an effect's first
   function.

## Components and props

```tsx
import { createSignal } from "@barqjs/core";
import { render } from "@barqjs/web";

interface CardProps {
  title: string;
  tone?: string;
}

function Card({ title, tone = "warm", ...rest }: CardProps) {
  return (
    <h2 class={tone} {...rest}>
      {title.toUpperCase()}
    </h2>
  );
}

function App() {
  const [name, setName] = createSignal("salama");
  return (
    <main>
      <Card title={name()} />
      <button type="button" onClick={() => setName("barq")}>
        rename
      </button>
    </main>
  );
}

render(() => <App />, document.getElementById("app")!);
```

- Props are written as values and stay reactive. `props.title` and a
  destructured `title` both follow the parent, wherever they are read in JSX, a
  memo or an effect.
- Destructuring is supported: names, renames, defaults, `...rest`, in the
  parameter or as `const { title } = props` in the body. A default applies
  whenever the prop is `undefined`.
- Pass values to a component: `<Card title={name()} />`.
- Props are read-only. To change a parent's value, call a function prop
  (`props.onChange(next)`).
- `omit(props, "title")` returns the props without those names, still live.
  `merge(defaults, props)` layers them.
- A hook in a `.ts` file receives `props` as a live view and reads
  `props.title` as a value inside its own memos and effects.
- `render` takes a function: `render(() => <App />, root)`. It returns a
  disposer.

## Signals, memos, effects

```tsx
import { createEffect, createMemo, createSignal, onCleanup, onSettled } from "@barqjs/core";

function Timer() {
  const [seconds, setSeconds] = createSignal(0);
  const minutes = createMemo(() => Math.floor(seconds() / 60));

  createEffect(
    () => minutes(),
    (value) => {
      document.title = `${value} min`;
    },
  );

  onSettled(() => {
    const id = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(id);
  });

  onCleanup(() => console.log("timer removed"));

  return (
    <p>
      {minutes()}:{seconds() % 60}
    </p>
  );
}
```

- `createSignal(value)` returns `[read, write]`. `write(next)` or
  `write((previous) => next)`.
- `createMemo(fn)` is a read-only derived value. Prefer it to an effect that
  writes a signal.
- `createSignal(() => saved())` is a writable derived signal: a write holds
  until `saved` changes, then it re-seeds. Use it for local editable state
  seeded from a prop or another signal.
- `createEffect(compute, apply)`: `apply` may return a cleanup. For errors,
  pass `{ effect, error }` as the second argument.
- `onSettled(fn)` runs once after the component is built (the place for DOM
  measurement, timers, subscriptions). Return the cleanup from it.
- `onCleanup(fn)` registers a cleanup on the running component, memo or effect
  first function.
- **A write is applied at the next flush**, a microtask later. Right after
  `setCount(1)`, `count()` still returns the old value. Call `flush()` to apply
  now (in tests, before asserting).
- `untrack(() => value())` reads without subscribing. Use it only for a
  deliberate one-time snapshot, never to quiet a diagnostic.
- Module-level effects and memos need an owner: wrap them in
  `createRoot((dispose) => { ... })`.

## Stores

```tsx
import { createStore, reconcile } from "@barqjs/core";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

const [state, setState] = createStore({ user: { name: "salama" }, todos: [] as Todo[] });

setState((draft) => {
  draft.user.name = "barq";
  draft.todos.push({ id: 1, text: "write docs", done: false });
});

setState((draft) => {
  reconcile(fetchedTodos, "id")(draft.todos);
});
```

- Read with plain property access: `state.user.name`. Each read subscribes to
  that leaf only.
- Write only through the setter, by mutating the draft. `state.x = 1` outside
  the setter is ignored.
- Mutate in place (`draft.items.push(x)`), not `draft.items = [...draft.items, x]`.
- Read store fields where they are used. Destructuring a store in a component
  body takes snapshots.
- The setter callback is synchronous. Do async work first, then call it.

## JSX

```tsx
<div class={["card", { active: selected() }]} style={{ "--gap": `${gap()}px` }}>
  <input type="text" bind:value={[name, setName]} />
  <input type="checkbox" bind:value={agreed} />
  <button type="button" disabled={!agreed()} onClick={() => save(name())}>
    Save
  </button>
  <canvas ref={(element) => draw(element)} />
</div>
```

- `class` takes a string, a map of names to booleans, or a list of both. HTML
  attribute names are used as in HTML (`class`, `for`, `tabindex`).
- Events are `onClick`, `onInput`, `onKeyDown`. Add `Capture` for the capture
  phase. A handler is bound once: decide inside it,
  `onClick={() => (editing() ? save() : edit())}`.
- `bind:value` is two-way binding to a form control. Its target is a whole
  signal: the pair `createSignal` returns (`const agreed = createSignal(false)`)
  or `[read, write]` put back together. `bind:group` for radios, `bind:files`,
  `bind:open`, `bind:this` for a ref.
- `{count}` and `{count()}` both stay live in JSX. Inside a larger expression
  call it: ``{`total: ${count()}`}``, `{open() ? label() : "closed"}`.
- Conditional JSX inside the returned element is live:
  `{loggedIn() ? <Dashboard /> : <SignIn />}`.

## Control flow

```tsx
import { For, Match, Repeat, Show, Switch } from "@barqjs/core";

<Show when={user()} fallback={<SignIn />}>
  <p>Hello, {user()!.name}</p>
</Show>

<Switch fallback={<p>unknown</p>}>
  <Match when={status() === "loading"}>
    <Spinner />
  </Match>
  <Match when={status() === "ready"}>
    <Results />
  </Match>
</Switch>

<For each={todos()} keyed={(todo) => todo.id} fallback={<p>nothing to do</p>}>
  {(todo, index) => (
    <li>
      {index() + 1}. {todo().text}
    </li>
  )}
</For>

<Repeat count={5}>{(index) => <span>{index}</span>}</Repeat>
```

`keyed` on `<For>` decides what a row is and what the callback receives:

- Omitted: a row is the item object. Callback `(item, index)` with `item` a
  plain value and `index` an accessor. A new object for the same record is a
  new row.
- `keyed={(item) => item.id}`: a row survives changes to its item. Callback
  `(item, index)` with both accessors: `item().text`, `index()`. Use this for
  data that is refetched or edited.
- `keyed={false}`: a row is its position. Callback `(item, index)` with `item`
  an accessor and `index` a number.

In a row callback, read fields in the JSX it returns, not in statements above.

A component chosen at run time is `dynamic` from `@barqjs/web`:
`const Field = dynamic(() => (rich() ? Editor : "input"))`, then `<Field />`.

## Async and boundaries

```tsx
import { Errored, Loading, action, createMemo, isPending, refresh } from "@barqjs/core";

function Profile(props: { id: string }) {
  const user = createMemo(async () => {
    const id = props.id;
    const response = await fetch(`/api/users/${id}`);
    return response.json() as Promise<{ name: string }>;
  });

  const rename = action(function* (name: string) {
    yield fetch(`/api/users/${props.id}`, { method: "PUT", body: name });
    refresh(user);
  });

  return (
    <Errored fallback={(error, reset) => <button onClick={reset}>{error().message}</button>}>
      <Loading fallback={<p>loading</p>}>
        <h1 class={{ stale: isPending(() => user()) }}>{user().name}</h1>
        <button type="button" onClick={() => rename("salama")}>
          rename
        </button>
      </Loading>
    </Errored>
  );
}
```

- Async data is a `createMemo` whose function returns a promise. There is no
  `createResource`, `Suspense` or `useEffect` fetch.
- Read every signal and prop **before the first `await`**. Reads after it are
  not tracked.
- Reading the memo before it answers waits at the nearest `<Loading>`, which
  shows its fallback. When an input changes later, the old content stays and
  `isPending(() => user())` is true until the new answer lands. To show the
  fallback again on a change, key the boundary: `<Loading on={props.id}>`.
- Do not wrap an async read in `try/catch`. Errors go to `<Errored>`, whose
  fallback receives `(error, reset)` with `error` an accessor.
- `refresh(memo)` asks again. `latest(() => memo())` reads the value in flight.
- Mutations are `action(function* () { ... })`: `yield` each promise, write
  signals between yields, call the action from an event handler.
- `createOptimistic` and `createOptimisticStore` hold a guess that reverts when
  the action settles.
- `lazy(() => import("./Editor.tsx"))` loads a component on demand.

## Context

```tsx
import { createContext, useContext } from "@barqjs/core";

const Theme = createContext<"light" | "dark">("light");

function App() {
  return (
    <Theme value="dark">
      <Page />
    </Theme>
  );
}

function Page() {
  const theme = useContext(Theme);
  return <div class={theme()}>content</div>;
}
```

The context is its own provider (no `.Provider`), and `useContext` returns an
accessor: `theme()`.

## Coming from React

- No `useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`: use
  `createSignal`, `createEffect(compute, apply)` or `onSettled`, `createMemo`,
  a plain function, a plain variable or `ref`.
- No re-render, so no stale closures and no dependency arrays. A handler reads
  the current value by calling the signal.
- No early `return` on state in a component. Branch inside the JSX.
- `class`, not `className`. `for`, not `htmlFor`. `onInput` fires per
  keystroke; `onChange` fires on commit.
- Lists use `<For>`, not `array.map` with a `key` prop.
- Children are `props.children`, rendered as a child: `{props.children}`.

## Coming from Solid

Names and arguments are Solid 2.0's, with these differences:

- **Destructure props freely.** Solid's "never destructure props" rule does not
  apply.
- `useContext(Theme)` returns an accessor.
- `merge` and `omit` replace `mergeProps` and `splitProps`.
- `<Portal mount="#modal-root">` also takes a selector string.
- Lowercase `onclick` binds the event too.
- `dynamic(source)` answers synchronously and takes no options.
- Solid 1.x names do not exist: `createResource`, `Suspense`, `ErrorBoundary`,
  `Index`, `batch`, `onMount`, `on`, `createComputed`, `produce`, `unwrap`,
  `classList`, `use:`, `on:`, `<Dynamic>`, `Context.Provider`. Use an async
  `createMemo`, `Loading`, `Errored`, `<For keyed={false}>`, `flush`,
  `onSettled`, the first function of `createEffect`, `createMemo`, draft
  setters, `snapshot`, `class`, `ref`, `onClick`, `dynamic`, `<Theme value>`.

## Common mistakes and the code each produces

Runtime codes print as `[CODE]` in the console. `BARQ0NN` codes come from the
compiler at build time.

- Branching on a signal in the component body (`if (!user()) return ...`):
  `BARQ018`. Branch in JSX with `<Show>`.
- Using an accessor without calling it in a string, a condition or a property
  read (`` `${count}` ``, `loading ? a : b`, `user.email`): `BARQ001`,
  `BARQ002`, `BARQ003`, and `FUNCTION_AS_ATTRIBUTE` at run time.
- Writing state in a component body, a memo or an effect's first function:
  `BARQ019` and `REACTIVE_WRITE_IN_OWNED_SCOPE`. Calling an action there:
  `ACTION_CALLED_IN_OWNED_SCOPE`.
- `createEffect(fn)` with one function: `MISSING_EFFECT_FN`.
- Reading another signal in an effect's second function:
  `STRICT_READ_UNTRACKED`. Read it in the first.
- Reading a signal after `await` in an async memo: `BARQ021` and
  `UNTRACKED_READ_AFTER_AWAIT`.
- `try/catch` around an async read: `CAUGHT_REACTIVE_READ`.
- Async data read with no `<Loading>` above it: `ASYNC_OUTSIDE_LOADING_BOUNDARY`.
- `state.x = 1` on a store: `STORE_WRITE_OUTSIDE_SETTER`. Destructuring a store
  in a component body: `BARQ020`. An `async` setter callback:
  `ASYNC_STORE_SETTER`. Spreading into the draft: `IMMUTABLE_UPDATE_IN_STORE`.
- Assigning to a prop: `BARQ030`. A nested default in a props pattern:
  `BARQ031`.
- An effect or memo at module scope with no `createRoot`: `NO_OWNER_EFFECT`.
  `onCleanup` in an event handler: `NO_OWNER_CLEANUP`.
- `render(<App />, root)` instead of `render(() => <App />, root)`:
  `RENDER_SUBTREE_NOT_OWNED`.
- `bind:value={memo}` or the read half alone: `BIND_TARGET_NOT_WRITABLE`.
- An effect that copies one signal into another: `EFFECT_RELAY_TEAR` or
  `EFFECT_WRITES_OWN_SOURCE`. Use `createMemo`.
- A refetched list with no key function: `UNSTABLE_LIST_IDENTITY`.
- `typeof window` branches in server-rendered markup, or a `<div>` inside a
  `<p>`: `HYDRATION_MISMATCH`, `BARQ026`.
- `<Theme.Provider>`, `classList`, `on:click`, `<Dynamic>`: `BARQ022` to
  `BARQ025`.

## When a diagnostic appears

Open the section for the code before changing code:

- Runtime `[CODE]`: `node_modules/@barqjs/core/skills/diagnostics/SKILL.md`,
  one `### CODE` section per code. The console entry's `in` line is the
  component path and its `at` line is `file:line:col`.
- Build-time `BARQ0NN`:
  `node_modules/@barqjs/compiler/skills/compiler-diagnostics/SKILL.md`.
- Evidence for cost and responsiveness findings:
  `node_modules/@barqjs/diagnostics/skills/agent-loops/SKILL.md`.

Fix the cause. Do not silence a code with `untrack`, a `try/catch` or a
suppression comment.
