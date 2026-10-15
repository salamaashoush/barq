# BARQ017: A `@barqjs/css` call cannot be compiled, so the browser evaluates it

**Level:** note · [all codes](README.md)

## Message

> This style object has a value, a key or a nested object the compiler cannot read in
> this file, such as an imported value or a function call. The call is left as written,
> and `@barqjs/css` works out its classes in the browser each time it runs. Write
> literals or a `const` declared in this module; for a value that changes, use
> `var(--name)` and set it through `style`.

## Failing example

```tsx
import { atoms } from "@barqjs/css";
import { theme } from "./theme.ts";

export const card = atoms({ color: theme.brand });
```

## Fixed example

```tsx
import { atoms } from "@barqjs/css";

const BRAND = "#3b82f6";

export const card = atoms({ color: BRAND });
```

## Why this rule exists

`atoms`, `create`, `defineVars`, `createTheme`, `dynamic` and their layered forms are
compiled when every value in the call can be read from the file being compiled: literals,
and `const`s declared in the same module. A value imported from another module, the result
of a function call, or a spread of arguments cannot be read that way, so the call stays
and runs in the browser.

Nothing is broken, and the classes are the same. The note marks a call that could be
compiled; the message says which part stopped it. To make every CSS note an error, so a
build proves that no call is left for the browser, set `strictCss: true` in the plugin
options.

## Silencing one line

```tsx
import { atoms } from "@barqjs/css";
import { theme } from "./theme.ts";

// barq-ignore-next-line BARQ017 (the brand colour is shared with another package)
export const card = atoms({ color: theme.brand });
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ017 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
