# @barqjs/core

Signals, JSX and the DOM renderer. A component runs once; afterwards only the
nodes that read a changed signal are touched.

```bash
bun add @barqjs/core
bun add -d @barqjs/compiler
```

`@barqjs/compiler` is not optional in practice. It is the Vite plugin that
lowers JSX to the runtime's own calls, and without it a `.tsx` file goes through
whatever generic JSX transform is configured and gets different semantics: props
arrive as plain values instead of Cells, and children are built eagerly instead
of being deferred.

The API is Solid 2.0's. Where barq differs, and why, is in
[docs/solid-2.0.md](docs/solid-2.0.md).

## Signals, memos and effects

The reactive primitives are Solid 2.0's, from `@solidjs/signals`, exported under
their own names.

```tsx
import { createEffect, createMemo, createRoot, createSignal, flush, untrack } from "@barqjs/core";

const [count, setCount] = createSignal(0);

createRoot(() => {
  const doubled = createMemo(() => count() * 2);

  createEffect(
    () => doubled(), // compute: the tracked read
    (value) => console.log(value), // apply: the side effect
  );
});

setCount(1);
count(); // still 0
flush();
count(); // 1, and the effect has logged 2

setCount((n) => n + 1);
untrack(count); // read without subscribing
```

`createSignal(value)` returns a `[read, write]` pair. `createMemo(fn)` is
read-only: computed where it is declared, and again when something it read
changes.

**A write is applied at the next flush.** That is a microtask after the write,
or `flush()` to have it now. Until then a read returns the old value, so the
line after `setCount(1)` still sees `0`. The setter returns the value it wrote,
for code that needs it at once. `fireEvent` and `act` in `@barqjs/testing` flush
for you.

**An effect is two functions.** `createEffect(compute, apply)` tracks what
`compute` reads and hands its result to `apply`, which does the side effect and
may return a cleanup. A write belongs in `apply` or in an event handler. The
development build throws on one made while a memo, a `compute`, a component
body or a `createRoot` body is running.

A memo or an effect belongs to an owner: a component body, or a `createRoot` as
above. Created under none, a memo recomputes on every read and an effect is
never disposed.

## Rendering

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

const dispose = render(() => <Counter />, document.getElementById("app")!);
```

`{count}` is a tracked read, not a snapshot. The compiler wraps it, so that text
node updates and nothing else does.

`render` returns a disposer. Calling it runs every `onCleanup` in the tree.

## Control flow

```tsx
import { Errored, For, Loading, Match, Show, Switch } from "@barqjs/core";

<Show when={isOpen} fallback={<p>closed</p>}>
  <Panel />
</Show>

<For each={rows}>{(row) => <li>{row.name}</li>}</For>

<Switch>
  <Match when={state() === "a"}>…</Match>
  <Match when={state() === "b"}>…</Match>
</Switch>

<Loading fallback={<Spinner />}>
  <ProfileCard />
</Loading>

<Errored fallback={(error, reset) => <Retry error={error} onRetry={reset} />}>
  <Risky />
</Errored>
```

`Loading` is the boundary an unsettled async memo parks against. On the server
it is what streams a fallback and resumes when the value arrives.

### `keyed`, and why it changes the callback

`keyed` decides what a row IS, and with it the signature of `children`. The
middle row is the one most people are looking for.

| `keyed`          | a row is identified by | `children` receives                    |
| ---------------- | ---------------------- | -------------------------------------- |
| omitted / `true` | the item itself        | `(item, index: () => number)`          |
| `(item) => key`  | `key`                  | `(item: () => T, index: () => number)` |
| `false`          | its position           | `(item: () => T, index: number)`       |

Identity keying is the default: replace an item with a new object and it is a
different row, so the old DOM is thrown away. `item` arrives as a plain value,
because a changed item means a new row anyway.

A key function makes the row SURVIVE a change to its item, so the item arrives
as an accessor you call. That is what keeps a focused `<input>` alive across a
keystroke:

```tsx
<For each={rows} keyed={(row) => row.id}>
  {(row: () => Row) => <input value={row().text} />}
</For>
```

## Two-way binding

```tsx
import { createSignal } from "@barqjs/core";

const [name, setName] = createSignal("Ada");
const agreed = createSignal(false);

<input type="text" bind:value={[name, setName]} />
<input type="checkbox" bind:value={agreed} />
<input type="number" bind:value={amount} />
<input type="radio" name="size" value="s" bind:group={size} />
<div contenteditable="true" bind:value={rich} />
<dialog bind:open={showing} />
<input type="file" bind:files={picked} />
<input type="text" bind:this={element} />
```

`bind:value` resolves its property and its reporting event at COMPILE time from
the tag and the `type`: a text input writes `value` and reports on `input`, a
checkbox writes `checked` and reports on `change`, a number input writes
`valueAsNumber`, a date input `valueAsDate`, a `contenteditable` host its
`textContent`. `bind:this` is a ref, and any other name binds the property of
that name.

Two things it does that `value={x}` cannot, and they are why it is compiler
syntax rather than a helper:

- **It compares against the ELEMENT before writing.** A setter that rejects or
  normalises a keystroke leaves the signal unchanged, so nothing re-runs. The
  binding re-asserts the signal at the flush the edit scheduled, which is before
  paint, so the field never keeps text no signal held.
- **It preserves the caret.** Assigning `value` moves the cursor to the end of
  the control, so a write arriving while you type would otherwise discard your
  selection. The range, its direction and the focus all survive.

The target is a signal: the `[read, write]` pair `createSignal` returns, passed
whole or put back together as `[name, setName]`. A memo or a bare accessor has
no setter, which is a type error and a `BIND_TARGET_NOT_WRITABLE` diagnostic.

## `createSignal(fn)`: writable state that re-seeds

```tsx
import { createSignal } from "@barqjs/core";

const [saved, setSaved] = createSignal("Ada");
const [draft, setDraft] = createSignal(() => saved());

<input type="text" bind:value={[draft, setDraft]} />;
```

Given a function, `createSignal` returns a writable DERIVED signal. A write
holds until `saved` next changes; that change recomputes over it and the write
is gone. It is the answer to the read-copy trap (a signal seeded from a prop
freezes at the first value it ever saw) and to controlled inputs, which need
both directions at once.

The function receives the value the signal held, so a re-seed can keep a choice:

```tsx
const [chosen, setChosen] = createSignal<string>((held) => {
  const list = options();
  return held !== undefined && list.includes(held) ? held : list[0]!;
});
```

`held` is `undefined` on the first run.

## Async

```tsx
import { Loading, createMemo, isPending, refresh } from "@barqjs/core";

function Profile() {
  const user = createMemo(async () => {
    const response = await fetch(`/api/users/${userId()}`);
    return response.json();
  });

  return (
    <Loading fallback={<p>loading…</p>}>
      <h1 class={{ stale: isPending(user) }}>{() => user().name}</h1>
      <button type="button" onClick={() => void refresh(user)}>
        reload
      </button>
    </Loading>
  );
}
```

An async value is a memo whose function returns a promise. Reading it before
the promise settles throws `NotReadyError`, which the enclosing `Loading`
catches to show its fallback. When `userId` changes the memo runs again: the
heading keeps the name it had, and `isPending(user)` is true until the new one
arrives. `refresh(user)` runs the memo again with nothing changed.

Read every dependency before the first `await`. A signal read after it is not
tracked.

There is no separate resource primitive, and no `createResource`, `Await` or
`Suspense`.

## Stores

```tsx
import { createStore } from "@barqjs/core";

const [state, setState] = createStore({ user: { name: "Ada" }, todos: [] as Todo[] });

state.user.name; // read: subscribes to that leaf alone

setState((draft) => {
  draft.user.name = "Grace";
  draft.todos.push({ id: 1, done: false });
});

setState((draft) => {
  draft.todos[0]!.done = true;
});
```

`createStore` returns a `[state, setState]` pair. The state is deeply READ-ONLY:
assigning to it does nothing, and every write goes through the setter, which is
what keeps the subscription set exact. The setter hands its function a draft to
mutate, and the change is applied at the next flush, as a signal write is.

## flush, untrack and Portal

```tsx
import { Portal, flush, untrack } from "@barqjs/core";

setFirst("Ada");
setLast("Lovelace");
flush(); // both applied together: an effect reading the two runs once

const current = untrack(count); // read without subscribing

<Portal mount="#modal-root">
  <Dialog />
</Portal>;
```

Writes are always batched. However many are made before a flush, an effect that
depends on them runs once.

`Portal` places its children elsewhere in the document while keeping them in the
LEXICAL scope chain, so a portalled modal reads the providers it is written
inside rather than the ones at the mount point.

## Scopes and cleanup

```tsx
import { createRoot, onCleanup, onSettled } from "@barqjs/core";

function Clock() {
  onSettled(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  });

  onCleanup(() => console.log("the clock is gone"));

  return <time>…</time>;
}
```

A scope is the unit of ownership and the unit of death. Every effect, listener
and subscription created under one is released when it is disposed.
`createRoot(fn)` opens one by hand and passes `fn` its disposer; `render` opens
the root one.

`onSettled(fn)` runs `fn` once, at the flush after the component is built, and
the function `fn` returns is its cleanup. `onCleanup` registers a cleanup on the
scope that is running: a component body, a memo, an effect's `compute`. Inside
`onSettled`, return the cleanup instead.

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
  return <div class={theme()}>…</div>;
}
```

The context is its own provider component, as in Solid 2.0. `Theme.Provider`
is the same function and still works. `useContext` returns a Cell, so a
provider that changes value updates the consumers that read it.

## Subpaths

| import                     | what it is                                                         |
| -------------------------- | ------------------------------------------------------------------ |
| `@barqjs/core`             | the public surface                                                 |
| `@barqjs/core/jsx-runtime` | the JSX runtime; `jsxImportSource` points here                     |
| `@barqjs/core/internal`    | the runtime surface `@barqjs/server` needs and no application does |
| `@barqjs/core/interp`      | the reference backend, for the compiler's own oracle               |

All four share one copy of the runtime. Importing two of them does not give you
two schedulers.
