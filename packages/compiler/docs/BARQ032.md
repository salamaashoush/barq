# BARQ032: A shorthand that cannot be split is merged with one of its longhands

**Level:** warning · [all codes](README.md)

## Message

> `border` and `border-top-color` are merged here, and `border` is a shorthand whose
> values are told apart by type, so it is kept whole and does not give way to
> `border-top-color` or replace it. Both classes stay on the element and the order of the
> stylesheet decides between them, which is not the order they are passed in. Write
> `border` as its longhands instead, as `border` is `border-width`, `border-style` and
> `border-color`.

## Failing example

```tsx
import { atoms } from "@barqjs/css";

export const field = (invalid: boolean) =>
  atoms({ border: "1px solid gray" }, invalid && { borderColor: "red" });
```

## Fixed example

```tsx
import { atoms } from "@barqjs/css";

export const field = (invalid: boolean) =>
  atoms(
    { borderWidth: 1, borderStyle: "solid", borderColor: "gray" },
    invalid && { borderColor: "red" },
  );
```

## Why this rule exists

`atoms` promises that the order arguments are passed in decides which declaration wins.
It keeps that promise by giving each property one class and keeping the last class per
property.

A shorthand such as `margin` is split into its sides by counting values, so a later
`marginTop` replaces one side. `border`, `font`, `flex`, `background`, `transition` and
the other shorthands whose values are told apart by type cannot be split that way, so
each stays one class of its own. `border` and `border-color` are then two properties to
the merge: neither replaces the other, and both classes reach the element.

Which one wins is the cascade's answer. Both rules have the same specificity, so the
later rule in the stylesheet wins, and an atom is written where the first call to use it
stood. The result can match the order you passed today and stop matching when another
component uses either declaration first.

The same holds under a condition: `border` and `borderColor` both under `:hover` are
reported, and a base `border` beside a `:hover` `borderColor` is not, since the hover
rule has the higher specificity.

## Silencing one line

```tsx
import { atoms } from "@barqjs/css";

export const frame =
  // barq-ignore-next-line BARQ032 (the border colour is the same in both)
  atoms({ border: "1px solid gray" }, { borderColor: "gray" });
```

The reason in parentheses is required and has to be at least 10 characters. To change the
level for the whole project, see
[the index](README.md#changing-a-level-for-the-whole-project).
