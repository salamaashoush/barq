# BARQ022: A context is rendered through `.Provider`, which a context does not have

**Level:** error · [all codes](README.md)

## Message

> `Theme` is a context, and a context is its own provider: write `<Theme value={…}>`
> instead of `<Theme.Provider value={…}>`. A context has no `Provider` member.

## Failing example

```tsx
import { createContext } from "@barqjs/core";

const Theme = createContext("light");

export const App = (props) => <Theme.Provider value="dark">{props.children}</Theme.Provider>;
```

## Fixed example

```tsx
import { createContext } from "@barqjs/core";

const Theme = createContext("light");

export const App = (props) => <Theme value="dark">{props.children}</Theme>;
```

## Why this rule exists

In Solid 2.0, and in barq, `createContext` returns the provider component itself, so
`<Theme value>` provides the value to everything under it. There is no `Theme.Provider`:
the member is `undefined`, and rendering it throws when the page runs rather than when it
builds.

The check reports a tag whose object is bound to `createContext()` in the same file. A
context imported from another module is not known to be one, so `<Theme.Provider>` there
is left to TypeScript, which reports that `Provider` does not exist on `Context`. A
`Provider` member on anything that is not a context, such as a component namespace, is
not reported.

## Silencing one line

```tsx
import { createContext } from "@barqjs/core";

const Theme = createContext("light");

// barq-ignore-next-line BARQ022 (Theme.Provider is assigned a component at startup)
export const App = (props) => <Theme.Provider value="dark">{props.children}</Theme.Provider>;
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ022 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
