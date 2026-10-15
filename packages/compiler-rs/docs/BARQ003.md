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

Two reads on an accessor are not reported, because every function has them: `items.length`
and `user.name` give the function's own length and name. Write `items().length` and
`user().name`.

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
