# BARQ034: A tag names a prop whose default is a string, which is not a component

**Level:** error · [all codes](README.md)

## Message

> This tag names a prop whose default is a string, and a tag is called as a component, so the
> default can never render. An element chosen at run time is `dynamic`:
> `const Tag = dynamic(() => props.as ?? "div")`, then `<Tag />`.

## Failing example

```tsx
export function Box({ as: Tag = "div", ...rest }: { as?: string; children?: unknown }) {
  return <Tag {...rest} />;
}
```

## Fixed example

```tsx
import { omit } from "@barqjs/core";
import { dynamic } from "@barqjs/web";

export function Box(props: { as?: string; children?: unknown }) {
  const Tag = dynamic(() => props.as ?? "div");
  return <Tag {...omit(props, "as")} />;
}
```

## Why this rule exists

A capitalised tag is a component: `<Tag />` is compiled to a call of whatever `Tag` holds, and
a tag that names a prop calls the prop's value. A string is not a function, so the default
throws the first time the caller leaves the prop out, and a caller passing `"span"` throws the
same way.

`dynamic` is how an element or a component chosen at run time is written: it takes a source
that answers either, renders an element for a string, and replaces what it rendered when the
source changes.

A lowercase tag is never a binding: `<tag />` is an element named `tag`, whatever a pattern
bound under that name.

## Silencing one line

```tsx
export function Box({ as: Tag = "div" }) {
  // barq-ignore-next-line BARQ034 (every caller passes a component as `as`)
  return <Tag />;
}
```

The reason in parentheses is required and has to be at least 10 characters. To change the
level for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
