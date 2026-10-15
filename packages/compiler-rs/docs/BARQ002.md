# BARQ002: An accessor is used as a condition, which is always true

**Level:** warning · [all codes](README.md)

## Message

> `loading` is an accessor, and a function is always truthy, so this condition is always
> true and its other branch never runs. Call it: `loading()`.

## Failing example

```tsx
import { createSignal } from "@barqjs/core";

const [loading] = createSignal(true);

export const Status = () => <p>{loading ? "Loading" : "Ready"}</p>;
```

## Fixed example

```tsx
import { createSignal } from "@barqjs/core";

const [loading] = createSignal(true);

export const Status = () => <p>{loading() ? "Loading" : "Ready"}</p>;
```

## Why this rule exists

A function is always truthy. `if (loading)`, `loading ? a : b`, `loading && x`, `!loading`
and a loop that tests an accessor therefore never change with the signal: one branch is
dead from the start, and a `while (loading)` never ends.

A prop is not reported here, because `props.label ? a : b` is how a component asks whether
an optional prop was passed at all.

## Silencing one line

```tsx
import { createSignal } from "@barqjs/core";

const [loading] = createSignal(true);

// barq-ignore-next-line BARQ002 (checking that the accessor exists)
export const present = loading ? "yes" : "no";
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ002 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
