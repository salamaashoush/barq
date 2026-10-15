# BARQ001: An accessor is used as a value without being called

**Level:** warning · [all codes](README.md)

## Message

> `count` is an accessor, and here the function itself is used as the value. In a string
> it prints its own source text and in arithmetic it gives `NaN`. Call it: `count()`.

## Failing example

```tsx
import { createSignal } from "@barqjs/core";

const [count] = createSignal(0);

export const Total = () => <p>{`total: ${count}`}</p>;
```

## Fixed example

```tsx
import { createSignal } from "@barqjs/core";

const [count] = createSignal(0);

export const Total = () => <p>{`total: ${count()}`}</p>;
```

## Why this rule exists

An accessor is a function, and JavaScript turns a function into a string or a number
without complaint: `` `${count}` `` puts the accessor's source text on the page and
`count * 2` is `NaN`. Neither throws, and TypeScript accepts the string forms. The same
applies to a prop, which is a Cell: write `props.count()`, not `props.count`, inside a
string or a calculation.

Passing the accessor itself to JSX is correct and is not reported: `<p>{count}</p>` and
`<div id={count}>` both stay up to date.

## Silencing one line

```tsx
import { createSignal } from "@barqjs/core";

const [count] = createSignal(0);

// barq-ignore-next-line BARQ001 (the debug panel shows the source text)
export const source = `${count}`;
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ001 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
