# BARQ019: State is written while a component body or a computation runs

**Level:** warning · [all codes](README.md)

## Message

> `setCount` writes reactive state while `Counter`'s body runs. Development builds throw
> `REACTIVE_WRITE_IN_OWNED_SCOPE` here, so this code stops working when it runs in
> development. Derive the value instead (an initial value, or `createMemo(() => …)`), or
> write it from an event handler, `onSettled`, or the second function of `createEffect`.

## Failing example

```tsx
import { createSignal } from "@barqjs/core";

export function Counter() {
  const [count, setCount] = createSignal(0);
  setCount(1);
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>;
}
```

```tsx
import { createMemo, createSignal } from "@barqjs/core";

const [price] = createSignal(10);
const [total, setTotal] = createSignal(0);

export const sync = createMemo(() => setTotal(price() * 2));
export const Total = () => <output>{total()}</output>;
```

## Fixed example

```tsx
import { createSignal } from "@barqjs/core";

export function Counter() {
  const [count, setCount] = createSignal(1);
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>;
}
```

```tsx
import { createMemo, createSignal } from "@barqjs/core";

const [price] = createSignal(10);
const total = createMemo(() => price() * 2);

export const Total = () => <output>{total()}</output>;
```

A write that has to follow a change goes in the second function of `createEffect`, which
runs after the update has settled:

```tsx
import { createEffect, createSignal } from "@barqjs/core";

const [price] = createSignal(10);
const [history, setHistory] = createSignal<number[]>([]);

createEffect(
  () => price(),
  (value) => {
    setHistory((list) => [...list, value]);
  },
);

export const History = () => <output>{history().join(", ")}</output>;
```

## Why this rule exists

The engine refuses a write under an owner. A component body, a JSX expression, and the
function `createMemo` or `createEffect` runs to compute a value all run under one, and
development builds throw `REACTIVE_WRITE_IN_OWNED_SCOPE` (or `ACTION_CALLED_IN_OWNED_SCOPE`
for an action) the moment the write happens. Production builds do not check, so the same
code renders there and then fails as soon as it runs in development. A write in the
middle of an update is also how a computation ends up feeding itself.

The fix is almost always to derive: an initial value instead of a write in the body, a
`createMemo` that returns the value instead of one that writes it. A write that answers a
change belongs in an event handler, in `onSettled`, or in the second function of
`createEffect`.

The rule knows a setter by the `createSignal`, `createStore`, `createOptimistic` or
`createOptimisticStore` call it came from, and an action by its `action` call, in the same
file. A signal created with `{ ownedWrite: true }` opts into these writes and is not
reported, and neither is one whose options the compiler cannot read. A write inside a
helper function that the body calls is not seen.

## Silencing one line

```tsx
import { createSignal } from "@barqjs/core";

export function Counter() {
  const [count, setCount] = createSignal(0);
  // barq-ignore-next-line BARQ019 (production only, the dev check is known)
  setCount(1);
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>;
}
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ019 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
