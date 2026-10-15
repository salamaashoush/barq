# BARQ012: A module exports server functions together with other things

**Level:** error · [all codes](README.md)

## Message

> This module exports a server function and also `TodoList`. The browser build replaces
> a module that exports server functions with request stubs, so it cannot keep anything
> else the module exports. Move the server functions into a file that exports nothing
> else, and import them from here.

## Failing example

```tsx
import { createServerFn } from "@barqjs/start";

export const saveTodo = createServerFn().handler(async () => {
  return { saved: true };
});

export function TodoList() {
  return <button onClick={() => saveTodo()}>Save</button>;
}
```

## Fixed example

`todos.server.ts`, where every export is a server function. The file name is yours to choose:

```tsx
import { createServerFn } from "@barqjs/start";

export const saveTodo = createServerFn().handler(async () => {
  return { saved: true };
});
```

`TodoList.tsx`:

```tsx
import { saveTodo } from "./todos.server.ts";

export function TodoList() {
  return <button onClick={() => saveTodo()}>Save</button>;
}
```

## Why this rule exists

In the browser build, a module whose exports are all server functions is replaced by one
that exports a request stub under each name. The handler code, its validators and what
they import (a database client, a secret) never reach the browser. That replacement only
works when every export can be a stub. A component cannot be one, and keeping the module
to keep the component would ship the handlers with it, so the build stops.

Types (`export type`, `export interface`) do not count as other exports, and neither does
a server function that is not exported.

## Silencing one line

```tsx
import { createServerFn } from "@barqjs/start";

export const saveTodo = createServerFn().handler(async () => {
  return { saved: true };
});

// barq-ignore-next-line BARQ012 (this module is only ever imported by server code)
export function TodoList() {
  return <button onClick={() => saveTodo()}>Save</button>;
}
```

The comment goes above the first export that is not a server function, which is where the
diagnostic points. Silencing it does not split the module: the browser build then keeps
the whole file, handlers included, so use it only for a module the browser never imports.

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ012 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
