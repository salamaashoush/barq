# BARQ015: A `css` block interpolates a runtime value, so the browser builds it

**Level:** note · [all codes](README.md)

## Message

> This block interpolates a value that is only known when the program runs, so it cannot
> be compiled and `@barqjs/css` builds its CSS in the browser instead. To compile it,
> write `var(--name)` in the block and set the value on the element: `style={{ "--name":
> value }}`.

## Failing example

```tsx
import { css } from "@barqjs/css";

export const panel = (background: string) => css`
  padding: 12px;
  background: ${background};
`;
```

## Fixed example

```tsx
import { css } from "@barqjs/css";

const panel = css`
  padding: 12px;
  background: var(--panel-bg);
`;

export function Panel(props) {
  return <div class={panel} style={{ "--panel-bg": props.background() }} />;
}
```

## Why this rule exists

A block whose text is fixed is compiled away: its CSS goes into the stylesheet and the
call becomes a class name. An interpolation that is a literal, or a `const` in the same
file that holds one, still counts as fixed. Any other value is only known when the
program runs, so the block's CSS is put together in the browser every time it is
evaluated, and `@barqjs/css` has to ship the code that does it.

Nothing is broken, and the styles still apply. The note marks a block that could be
static.

## Silencing one line

```tsx
import { css } from "@barqjs/css";

// barq-ignore-next-line BARQ015 (the colour comes from user settings)
export const panel = (background: string) => css`
  padding: 12px;
  background: ${background};
`;
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ015 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
