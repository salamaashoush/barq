# BARQ009: A `barq-ignore-next-line` comment is malformed and silences nothing

**Level:** warning · [all codes](README.md)

## Message

> This `barq-ignore-next-line` has no reason of at least 10 characters, so it silences
> nothing. Add one in parentheses: `// barq-ignore-next-line BARQ001 (why this is
> correct here)`.

## Failing example

```tsx
// barq-ignore-next-line BARQ001
export const Label = () => <p>ok</p>;
```

## Fixed example

```tsx
import { createSignal } from "@barqjs/core";

const [count] = createSignal(0);

// barq-ignore-next-line BARQ001 (the debug panel shows the source text)
export const source = `${count}`;
```

## Why this rule exists

A suppression comment has to say which diagnostic it silences and why:
`// barq-ignore-next-line CODE (reason of at least 10 characters)`. Several codes can be
listed, separated by commas or spaces. Naming the code keeps the comment from hiding an
unrelated diagnostic that later lands on the same line, and the reason tells the next
reader why the code is right.

A comment that does not fit that form silences nothing, so the diagnostic it was aimed at
is still reported beside this one. The message says which part is missing: the code, a
known code, the reason, or the closing parenthesis.

## Turning it off

This code has no per-line form. It stays a warning even with `defaultCategory: "error"`,
so a comment cannot fail a build. To stop reporting it for the whole project:

```ts
barq({ compiler: { checks: { BARQ009: "suppress" } } });
```
