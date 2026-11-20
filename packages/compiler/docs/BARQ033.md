# BARQ033: Two conditions on one property are written in the order the stylesheet reverses

**Level:** note · [all codes](README.md)

## Message

> `color` is set under `.&:hover` and then under `.&[data-active]`, and both can match one
> element. One stylesheet serves every call, so it cannot keep this call's order: it puts
> `.&[data-active]` first, and where both match `.&:hover` wins although it is written
> earlier. Write them in that order, so the code reads the way the page behaves, or make
> one rule the other out.

## Failing example

```tsx
import { atoms } from "@barqjs/css";

export const tab = atoms({
  color: { ":hover": "blue", "[data-active]": "red" },
});
```

## Fixed example

```tsx
import { atoms } from "@barqjs/css";

export const tab = atoms({
  color: { "[data-active]": "red", ":hover": "blue" },
});
```

Or, when the active tab should keep its colour under the pointer, rule the hover out:

```tsx
import { atoms } from "@barqjs/css";

export const tab = atoms({
  color: { "[data-active]": "red", ":not([data-active]):hover": "blue" },
});
```

## Why this rule exists

Passing order decides for one property under one condition: a later argument replaces an
earlier one. Two different conditions are two classes, and both stay on the element. When
both match and their selectors weigh the same, the stylesheet's order decides, and one
stylesheet serves every call on the page, so it cannot follow each call's own order.

The order is fixed instead, within one tier: a condition with no interaction
pseudo-class first, then `:link`, `:visited`, `:focus-within`, `:hover`, `:focus`,
`:focus-visible`, `:active`, and `:disabled` last; two conditions of one place go by
their hash. This note fires when one object writes such a pair the other way round,
which is the one case where the order you wrote visibly loses.

It does not fire when the pair cannot both apply as written: one attribute equal to two
values or starting with two prefixes that do not start each other, two different child
positions, or a selector against its `:not()`. Nor when specificity decides, when both set
the same value, or when the two are different pseudo-elements.

## Silencing one line

```tsx
import { atoms } from "@barqjs/css";

export const tab =
  // barq-ignore-next-line BARQ033 (the hover colour is meant to win)
  atoms({ color: { ":hover": "blue", "[data-active]": "red" } });
```

The reason in parentheses is required and has to be at least 10 characters. To change the
level for the whole project, see
[the index](README.md#changing-a-level-for-the-whole-project).
