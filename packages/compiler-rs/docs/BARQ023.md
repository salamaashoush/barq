# BARQ023: `classList` is written on an element, where it is an ordinary attribute

**Level:** error · [all codes](README.md)

## Message

> `classList` is an ordinary attribute name, so this object would be written as the text
> `[object Object]`. Pass it to `class`, which takes a map of names to whether each
> applies, or a list of names and maps: `class={["card", { active: on() }]}`.

## Failing example

```tsx
import { createSignal } from "@barqjs/core";

const [active, setActive] = createSignal(false);

export const Card = () => (
  <div class="card" classList={{ active: active() }} onClick={() => setActive(!active())} />
);
```

## Fixed example

```tsx
import { createSignal } from "@barqjs/core";

const [active, setActive] = createSignal(false);

export const Card = () => (
  <div class={["card", { active: active() }]} onClick={() => setActive(!active())} />
);
```

## Why this rule exists

Solid 2.0 folds `classList` into `class`. A `class` value is a string, a map of class
names to whether each applies, or a list of strings, maps and further lists, joined in
order. `classList` has no meaning of its own any more, so on an element it is an attribute
like `title`, and the object it holds would be written as the attribute's text.

The check reports `classList` on an intrinsic element or a custom element. A component
that declares a `classList` prop of its own is not reported.

## Silencing one line

```tsx
// barq-ignore-next-line BARQ023 (the element reads a classList attribute itself)
export const Widget = () => <legacy-widget classList="compact" />;
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ023 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
