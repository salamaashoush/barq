# BARQ005: Props are destructured in the parameter list, so each name is a function

**Level:** warning · [all codes](README.md)

## Message

> This component takes its props apart in the parameter list, so each name is the prop's
> Cell (a function you call), not its value. Using one as a value prints the function's
> source text or gives `NaN`, and a default such as `{ text = "x" }` is a plain value
> only when the prop is missing. Take one `props` parameter and call each prop where it
> is used, for example `props.text()`, or separate some with `splitProps(props,
> ["text"])`.

## Failing example

```tsx
export function Chip({ text, tone }) {
  return <span data-tone={tone}>{text}</span>;
}
```

## Fixed example

```tsx
export function Chip(props) {
  return <span data-tone={props.tone()}>{props.text()}</span>;
}
```

To pass the remaining props on, separate the ones the component reads with `splitProps`. For a default, read an optional prop with `?.()`:

```tsx
import { splitProps } from "@barqjs/core";

export function Chip(props) {
  const [own, rest] = splitProps(props, ["tone"]);
  return <span data-tone={own.tone?.() ?? "warm"} {...rest} />;
}
```

## Why this rule exists

A component receives each prop as a Cell: a function it calls to read the current value.
Destructuring copies those functions into local names, so `text` is a function wherever
the code expects a string. It works where a function is accepted, such as `{text}` in
JSX, and gives the function's source text or `NaN` everywhere a value is needed. The
checks for `props.name` ([BARQ001](BARQ001.md), [BARQ003](BARQ003.md)) cannot follow the
copies, so nothing else reports those mistakes.

A default in the pattern, `{ tone = "warm" }`, makes it worse: the name is the string
`"warm"` when the prop is missing and a function when it is passed.

## Silencing one line

```tsx
// barq-ignore-next-line BARQ005 (every name here is called before it is used)
export function Chip({ text, tone }) {
  return <span data-tone={tone()}>{text()}</span>;
}
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ005 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
