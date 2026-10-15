# BARQ005: A destructured prop is used as a value, or called where it may not be a function

**Level:** warning · [all codes](README.md)

## Message

> `text` comes from destructuring the props, so it is the prop's Cell, a function you call,
> and here the function itself is used as the value. In a string it prints its own source
> text and in arithmetic it gives `NaN`. Call it: `text()`.

The rule reports at the misuse, and the message names what goes wrong there:

- A destructured name used as a value: in a template literal, with an arithmetic,
  concatenating or relational operator, with unary `-`, `+` or `~`, or with a property read
  from it (`text.length`). These are the positions where `props.text` gets
  [BARQ001](BARQ001.md) or [BARQ003](BARQ003.md).
- A name with a default that is a literal and not a function, `{ tone = "warm" }`, used as
  a value: it is the default when the prop is missing and a function when it is passed, so
  the use is wrong whenever the prop is passed.
- The same name called, `tone()`: it throws when the prop is missing, because the default
  is not a function.
- A pattern under a prop's key, `{ user: { name } }` or `{ items: [first] }`: it takes the
  prop's function apart, which is wrong whether the prop is passed or not.

## Failing example

```tsx
export function Chip({ text }) {
  return <span>{`#${text}`}</span>;
}
```

## Fixed example

```tsx
export function Chip({ text }) {
  return <span>{`#${text()}`}</span>;
}
```

Writing a destructured name where a function is accepted is correct and is not reported:
`{text}` as a JSX child or attribute, `text` passed to another function, `text()` anywhere.
A truthiness test such as `text ? … : …` asks whether the prop was passed, as it does for
`props.text`, and is not reported either.

To pass the remaining props on, leave out the ones the component reads with `omit`:

```tsx
import { omit } from "@barqjs/core";

export function Chip(props) {
  const rest = omit(props, "tone");
  return <span data-tone={props.tone?.() ?? "warm"} {...rest} />;
}
```

## Why this rule exists

A component receives each prop as a Cell: a function it calls to read the current value.
Destructuring copies those functions into local names, so `text` is a function. That is
what JSX wants, and it gives the function's source text or `NaN` everywhere a value is
needed. The checks for `props.name` ([BARQ001](BARQ001.md), [BARQ003](BARQ003.md)) cannot
follow the copies, so this rule reports the same positions for a destructured name.

A default in the pattern, `{ tone = "warm" }`, gives the name two kinds: the string
`"warm"` when the prop is missing and a function when it is passed. Calling it fails in the
first case and using it as a value fails in the second. Read such a prop with its default
where it is used instead:

```tsx
export function Chip({ tone }) {
  return <span data-tone={tone?.() ?? "warm"} />;
}
```

A default that is itself a function, or a name the rule cannot see the value of, is not
reported, and neither is a name the component tests with `typeof` or reassigns.

## Silencing one line

```tsx
export function Chip({ text }) {
  // barq-ignore-next-line BARQ005 (the debug panel shows the source text)
  const label = `${text}`;
  return <span>{label}</span>;
}
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ005 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
