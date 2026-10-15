# BARQ003: A property is read from an accessor instead of from its value

**Level:** warning · [all codes](README.md)

## Message

> `user` is an accessor, so `.email` is read from the function and not from the value it
> returns, and the result is `undefined`. Call it first: `user().email`.

## Failing example

```tsx
import { createSignal } from "@barqjs/core";

const [user] = createSignal({ email: "salama@example.com" });

export const Email = () => <p>{user.email}</p>;
```

## Fixed example

```tsx
import { createSignal } from "@barqjs/core";

const [user] = createSignal({ email: "salama@example.com" });

export const Email = () => <p>{user().email}</p>;
```

## Why this rule exists

The value is behind the call, so `user.email` asks the function for a property it does
not have and the page shows nothing. Habits from other libraries land here too: an
accessor has no `.value`, `.set` or `.peek`, and writing goes through the setter that
`createSignal` returns beside it. A prop works the same way: `props.user.email` has to be
`props.user().email`.

`items.length` is reported too, with its own message. Every function has a `length`, so it
never comes back `undefined`: it is the accessor's parameter count, `0`, and a list that
shows `0` items has nothing else wrong with it. Write `items().length`. `user.name` is not
reported, because a function's own `name` is sometimes read on purpose; write
`user().name` for the value's.

## Silencing one line

```tsx
import { createSignal } from "@barqjs/core";

const [user] = createSignal({ email: "salama@example.com" });

// barq-ignore-next-line BARQ003 (reading a label attached to the function)
export const label = user.label;
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ003 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
