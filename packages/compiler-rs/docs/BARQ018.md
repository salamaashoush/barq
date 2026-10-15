# BARQ018: A component decides what to return from a reactive value it reads once

**Level:** warning · [all codes](README.md)

## Message

> `Greeting` reads `user()` while its body runs and builds what it returns from that one
> value. A component body is not a tracked scope: it does not run again when `user()`
> changes, so the page keeps what it showed first. Make the choice in the returned JSX,
> where it stays live: `<Show when={…} fallback={…}>…</Show>`.

## Failing example

```tsx
import { createSignal } from "@barqjs/core";

const [user, setUser] = createSignal<string | null>(null);

export function Greeting() {
  if (!user()) return <button onClick={() => setUser("salama")}>Sign in</button>;
  return <p>Hello, {user()}</p>;
}
```

```tsx
import { createSignal } from "@barqjs/core";

const [online] = createSignal(true);

function Status(props) {
  return props.online() ? <b>online</b> : <i>offline</i>;
}

export const Bar = () => <Status online={online()} />;
```

## Fixed example

```tsx
import { Show, createSignal } from "@barqjs/core";

const [user, setUser] = createSignal<string | null>(null);

export function Greeting() {
  return (
    <Show when={user()} fallback={<button onClick={() => setUser("salama")}>Sign in</button>}>
      <p>Hello, {user()}</p>
    </Show>
  );
}
```

```tsx
import { createSignal } from "@barqjs/core";

const [online] = createSignal(true);

function Status(props) {
  return <>{props.online() ? <b>online</b> : <i>offline</i>}</>;
}

export const Bar = () => <Status online={online()} />;
```

A value the component should read once on purpose says so with `untrack`, which this rule
accepts:

```tsx
import { createSignal, untrack } from "@barqjs/core";

const [user] = createSignal<string | null>("salama");

export function Greeting() {
  if (!untrack(user)) return <p>Signed out when this mounted</p>;
  return <p>Hello, {user()}</p>;
}
```

## Why this rule exists

A component body is not a tracked scope: it runs when the component is created and does
not run again. An `if`, a `switch` or a `return` that reads a signal there reads it once,
so the component keeps returning what it chose first while the signal moves on. Nothing
throws, and the page simply stops following the state. Where the component happens to be
created inside a reactive expression, the expression rebuilds the whole component instead,
and whatever the user did inside it is lost.

JSX is where a read stays live, because the compiler turns each JSX expression into its
own tracked scope. `<Show>`, `<Switch>` and `<For>`, or a plain `{cond ? <A /> : <B />}`
inside the returned element, make the same choice there.

The rule reports reads of signals, memos, stores and functions that read them. A prop is
reported only when this file renders the component with a value that changes, such as
`<Status online={online()} />`: every prop is a function you call, whether or not its
caller passes anything that moves, and reading a configuration prop such as an element
type once is ordinary. So a component rendered only from other files is not checked for
its props.

## Silencing one line

```tsx
import { createSignal } from "@barqjs/core";

const [user, setUser] = createSignal<string | null>(null);

export function Greeting() {
  // barq-ignore-next-line BARQ018 (the parent remounts this when the user changes)
  if (!user()) return <button onClick={() => setUser("salama")}>Sign in</button>;
  return <p>Hello, {user()}</p>;
}
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ018 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
