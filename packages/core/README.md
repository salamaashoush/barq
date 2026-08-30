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

## The three primitives

```tsx
import { computed, effect, signal } from "@barqjs/core";

const count = signal(0);
const doubled = computed(() => count() * 2);

effect(() => console.log(count(), doubled()));

count.set(1);
count.update((n) => n + 1);
count.peek(); // read without subscribing
```

`signal(value)` is writable. `signal(fn)` is a writable DERIVED signal:
recomputed from its dependencies, and writable until they next change.
`computed` is read-only.

Writes are batched on the microtask queue. A test that asserts on the DOM after
a `set()` needs `flush()` first — that is what `fireEvent` and `act` in
`@barqjs/testing` do for you.

## Rendering

```tsx
import { render, signal } from "@barqjs/core";

function Counter() {
  const count = signal(0);
  return (
    <button type="button" onClick={() => count.update((n) => n + 1)}>
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

`Loading` is the boundary an unsettled `resource` parks against — on the server
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

`bind:value` resolves its property and its reporting event at COMPILE time from
the tag and the `type`: a text input writes `value` and reports on `input`, a
checkbox writes `checked` and reports on `change`, a number input writes
`valueAsNumber`, a `contenteditable` writes its text. `bind:group`, `bind:open`,
`bind:files` and `bind:this` follow the same rule.

Two things it does that `value={x}` cannot, and they are why it is compiler
syntax rather than a helper:

- **It compares against the ELEMENT before writing.** A setter that rejects or
  normalises a keystroke leaves the signal unchanged, so nothing re-runs — the
  binding re-asserts the signal inside the event instead, and the field never
  keeps text no signal held.
- **It preserves the caret.** Assigning `value` moves the cursor to the end of
  the control, so a write arriving while you type would otherwise discard your
  selection. The range, its direction and the focus all survive.

The target must be writable: a signal, a `linked` cell, or anything with a
`.set`. A read-only accessor is a `BIND_TARGET_NOT_WRITABLE` diagnostic.

> **`bind:` has no JSX type yet.** The compiler and the runtime both handle it,
> but nothing declares the attribute, so `<input bind:value={name} />` is a
> `TS2322` in a project with `strict` on. Until the declaration lands, the
> working spellings are `writeLive` and an `onInput` handler.

## `linked` — writable state that re-seeds

```tsx
import { linked, resource } from "@barqjs/core";

const user = resource(() => userId(), fetchUser);

const draft = linked(
  () => user.latest()?.name ?? "",
  (name) => name,
);

<input value={draft()} onInput={(event) => draft.set(event.currentTarget.value)} />;
```

The write holds until `source` next changes; that change recomputes over it and
the write is gone. It is the answer to the read-copy trap — a signal seeded from
a prop freezes at the first value it ever saw — and to controlled inputs, which
need both directions at once.

`compute` receives the previous value, so a re-seed can keep a choice:

```tsx
const chosen = linked(options, (list, previous) =>
  previous !== undefined && list.includes(previous) ? previous : list[0],
);
```

## Compiler mode

Add this once, anywhere in your project's type graph:

```ts
declare global {
  namespace Barq {
    interface Config {
      COMPILER_MODE: true;
    }
  }
}

export {};
```

It widens the control-flow props so `when={visible}` typechecks alongside
`when={() => visible()}`, because the compiler wraps the first form for you.
Without it those props demand the thunk you no longer have to write.

## Async

```tsx
import { Loading, isPending, resource } from "@barqjs/core";

const user = resource(
  () => userId(),
  (id, { signal }) => fetch(`/api/users/${id}`, { signal }).then((r) => r.json()),
);

<Loading fallback={<p>loading…</p>}>
  <h1 class={{ stale: isPending(user) }}>{() => user().name}</h1>
</Loading>;
```

The `AbortController` is a cleanup on the scope that created the resource, and
the signal reaches the fetcher: disposing the scope aborts the request, and a
re-run aborts the one it supersedes.

There is one resource primitive. `createResource`, `useResource`, `Await` and
`Suspense` do not exist.

## Stores

```tsx
import { produce, store } from "@barqjs/core";

const [state, setState] = store({ user: { name: "Ada" }, todos: [] as Todo[] });

state.user.name; // read: subscribes to that leaf alone
setState("user", "name", "Grace"); // path write
setState("todos", (todos) => [...todos, { id: 1, done: false }]);

setState(
  "todos",
  produce((todos) => {
    todos[0]!.done = true; // mutable syntax, immutable update
  }),
);
```

`store` returns a `[state, setState]` pair. The state is deeply READ-ONLY:
assigning to it does nothing, and every write goes through the setter, which is
what keeps the subscription set exact. `produce` wraps a mutating function into
a setter argument.

## batch, untrack and Portal

```tsx
import { Portal, batch, untrack } from "@barqjs/core";

batch(() => {
  first.set("Ada");
  last.set("Lovelace"); // one flush, not two
});

const snapshot = untrack(() => count()); // read without subscribing

<Portal mount="#modal-root">
  <Dialog />
</Portal>;
```

`Portal` places its children elsewhere in the document while keeping them in the
LEXICAL scope chain, so a portalled modal reads the providers it is written
inside rather than the ones at the mount point.

## Scopes and cleanup

```tsx
import { onCleanup, onMount, scope } from "@barqjs/core";

onMount(() => {
  const id = setInterval(tick, 1000);
  onCleanup(() => clearInterval(id));
});
```

A scope is the unit of ownership and the unit of death. Every effect, listener
and subscription created under one is released when it is disposed. `scope(fn)`
opens one by hand and hands back its disposer; `render` opens the root one.

## Context

```tsx
import { context, useContext } from "@barqjs/core";

const Theme = context<"light" | "dark">("light");

function App() {
  return (
    <Theme.Provider value="dark">
      <Page />
    </Theme.Provider>
  );
}

function Page() {
  const theme = useContext(Theme);
  return <div class={theme()}>…</div>;
}
```

`useContext` returns a Cell, so a provider that changes value updates the
consumers that read it.

## Subpaths

| import                     | what it is                                                         |
| -------------------------- | ------------------------------------------------------------------ |
| `@barqjs/core`             | the public surface                                                 |
| `@barqjs/core/jsx-runtime` | the JSX runtime; `jsxImportSource` points here                     |
| `@barqjs/core/internal`    | the runtime surface `@barqjs/server` needs and no application does |
| `@barqjs/core/interp`      | the reference backend, for the compiler's own oracle               |

All four share one copy of the runtime. Importing two of them does not give you
two schedulers.
