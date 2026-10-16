# BARQ016: `atoms` has several conditional arguments, so the browser evaluates it

**Level:** note · [all codes](README.md)

## Message

> `atoms` has 2 conditional arguments and the compiler handles one, so this call is left
> as written and `@barqjs/css` works out its classes in the browser each time it runs.
> Merge the conditions into one object, or apply the second with its own call:
> `atoms(atoms(base, a && x), b && y)`.

## Failing example

```tsx
import { atoms } from "@barqjs/css";

export const button = (active: boolean, wide: boolean) =>
  atoms({ color: "red" }, active && { color: "blue" }, wide && { padding: 8 });
```

## Fixed example

```tsx
import { atoms } from "@barqjs/css";

export const button = (active: boolean, wide: boolean) =>
  atoms(atoms({ color: "red" }, active && { color: "blue" }), wide && { padding: 8 });
```

## Why this rule exists

One conditional argument compiles to a choice between two class strings. Each further
condition doubles the number of outcomes, and writing all of them out would be larger
than the call it replaces, so the compiler leaves the call as it is.

Nothing is broken: `atoms` produces the same classes in the browser. The note marks a
call that could be compiled.

## Silencing one line

```tsx
import { atoms } from "@barqjs/css";

export const button = (active: boolean, wide: boolean) =>
  // barq-ignore-next-line BARQ016 (all four combinations are used)
  atoms({ color: "red" }, active && { color: "blue" }, wide && { padding: 8 });
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ016 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
