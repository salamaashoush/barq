# BARQ020: A store is destructured in a component body, so each name is a snapshot

**Level:** warning · [all codes](README.md)

## Message

> `Badge` takes the store `cart` apart in its body, so each name holds the value its
> property had when the body ran. A component body is not a tracked scope, and a later
> write to the store does not reach these names. Read the property where it is used, for
> example `cart.count` inside the JSX.

## Failing example

```tsx
import { createStore } from "@barqjs/core";

const [cart, setCart] = createStore({ count: 0, owner: "salama" });

export function Badge() {
  const { count, owner } = cart;
  return (
    <button onClick={() => setCart((draft) => {
        draft.count += 1;
      })}>
      {owner}: {count}
    </button>
  );
}
```

## Fixed example

```tsx
import { createStore } from "@barqjs/core";

const [cart, setCart] = createStore({ count: 0, owner: "salama" });

export function Badge() {
  return (
    <button onClick={() => setCart((draft) => {
        draft.count += 1;
      })}>
      {cart.owner}: {cart.count}
    </button>
  );
}
```

## Why this rule exists

Reading a store property is a reactive read, and destructuring reads every property it
names, at that moment. In a component body nothing tracks that read, so `count` is the
number the store held when the component was created, and every later write to
`cart.count` passes it by. Read the property where it is used: `{cart.count}` in JSX is a
tracked read that follows the store.

Destructuring a store inside `createMemo`, an effect, or a JSX expression is a tracked
read and is not reported. Props are not stores: `const { title } = props` copies the
props' functions, which stay live, and is not reported either.

## Silencing one line

```tsx
import { createStore } from "@barqjs/core";

const [cart] = createStore({ count: 0, owner: "salama" });

export function Badge() {
  // barq-ignore-next-line BARQ020 (a printed receipt shows the totals at mount)
  const { count, owner } = cart;
  return <p>{owner}: {count}</p>;
}
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ020 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
