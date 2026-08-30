# BARQ014 — a `css` block is not CSS this compiler can compile

**Level:** error.

A `css`, `keyframes` or `globalCss` block imported from `@barqjs/css` could not
be compiled. The message carries the parser's own reason.

```ts
import { css } from "@barqjs/css";

const card = css`
  $brand: #3b82f6;      // BARQ014: a Sass variable is not CSS
  color: $brand;
`;
```

The grammar is `oxc-css-parser`'s, which is the parser Oxfmt formats CSS with
and whose tests come from Web Platform Tests, the SWC CSS suite, esbuild,
sass-spec and the Less suite. `@container`, `@layer`, `@scope`,
`@starting-style`, `@property`, native nesting and functional pseudo-classes all
parse; a preprocessor's syntax does not.

## Why a preprocessor's syntax reaches this check at all

The parser runs in SCSS mode, because that is the only dialect its template
placeholders are legal in — an interpolation is marked with a backtick, which is
Less's inline-JS delimiter and is not valid CSS at all. SCSS mode therefore
accepts `$variable`, `@mixin` and `@if`, none of which any browser runs. Each
one is named and refused here rather than compiled into a rule that silently
matches nothing.

## The rules that are about position rather than syntax

- **`@import`, `@charset` and `@namespace` must lead a stylesheet**, so they
  cannot be scoped to a generated class. Move them to `globalCss`.
- **A declaration needs a selector.** `globalCss` writes whole rules;
  `color: red` at its top level has no element to apply to.
- **`&` needs a parent.** At the top level of `globalCss` there is none.

## Fixing it

Write CSS. Where a preprocessor's variable was doing the work, a CSS custom
property does it at runtime and without a build step:

```ts
const card = css`
  --brand: #3b82f6;
  color: var(--brand);
`;
```
