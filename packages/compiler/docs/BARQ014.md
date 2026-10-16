# BARQ014: A `css`, `keyframes` or `globalCss` block is not valid CSS

**Level:** error · [all codes](README.md)

## Message

> This CSS could not be compiled. A Sass variable (`$name: value`) is preprocessor
> syntax, and `@barqjs/css` compiles plain CSS only. Rewrite it as CSS; for a variable,
> use a custom property: `--brand: red` and `var(--brand)`.

## Failing example

```tsx
import { css } from "@barqjs/css";

export const card = css`
  $brand: #3b82f6;
  color: $brand;
`;
```

## Fixed example

```tsx
import { css } from "@barqjs/css";

export const card = css`
  --brand: #3b82f6;
  color: var(--brand);
`;
```

## Why this rule exists

`css`, `keyframes` and `globalCss` blocks are compiled into a stylesheet at build time,
so a block has to be CSS a browser understands. Sass and Less syntax would be written out
as rules no browser applies, and the element would lose its styles without any error.

Three placement rules are reported under this code as well: `@import`, `@charset` and
`@namespace` belong in a `globalCss` block; a declaration at the top level of `globalCss`
needs a selector around it; and `&` needs a parent selector to stand for.

## Silencing one line

```tsx
import { css } from "@barqjs/css";

// barq-ignore-next-line BARQ014 (kept as written until the Sass migration lands)
export const card = css`
  $brand: #3b82f6;
  color: $brand;
`;
```

Silencing it does not make the block valid. The call is left as written, and
`@barqjs/css` meets the same text in the browser.

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ014 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
