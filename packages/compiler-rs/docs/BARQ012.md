# BARQ012 — a module mixes server functions with other exports

**Level:** error · [all codes](README.md)

## What fires

A module that exports at least one server function **and** at least one other thing.

```ts
import { createServerFn } from "@barqjs/start";

export const saveTodo = createServerFn().validator(TodoInput).handler(async (todo) => {
  await db.todos.insert(todo);
});

export function TodoList() {   // BARQ012
  return <ul>…</ul>;
}
```

## What it means

The client build does not *prune* a server-function module. It **synthesizes** one: a new
module with the same export names, each of them an RPC stub, and nothing else. No handler
body, no validator, and none of the imports the body needed.

That is what makes the separation structural rather than analytical. The alternative —
keeping the module and deleting what the client should not see — is dead-code elimination,
and every implementation surveyed that relies on it leaks. The specific hole is a bare
side-effect import:

```ts
import "./db";                 // no binding, so nothing is "unreferenced"
```

`babel-dead-code-elimination` removes an import declaration only once it has removed a
specifier from it. A bare import has none, so the guard never fires and the declaration
survives into the client bundle, pulling `./db` and everything it imports with it. React
Router's own documentation concedes the general point — *"tree-shaking alone is
insufficient"* — and adds `.server.ts` naming as a second, opt-in net.

Synthesis has no equivalent hole, because the module is never consulted. But it only works
when every export is replaceable by a stub. A component is not: replacing it with an RPC
stub deletes your page, and keeping it means keeping the module, which is the strategy this
refuses.

So the compiler refuses the shape instead of proving it safe.

## The fix

Move the server functions into a module of their own.

```ts
// todos.server.ts — every export is a server function
import { createServerFn } from "@barqjs/start";

export const saveTodo = createServerFn().validator(TodoInput).handler(async (todo) => {
  await db.todos.insert(todo);
});
```

```tsx
// TodoList.tsx
import { saveTodo } from "./todos.server.ts";

export function TodoList() {
  return <form action={saveTodo}>…</form>;
}
```

The filename is yours; the compiler decides by **content**, not by name. SvelteKit enforces
the same rule keyed on the filename — a `.remote.ts` may export nothing else — so the
guarantee is the same one and it costs no naming convention here.

## What is not a mix

- A **non-exported** server function. It is never mounted, has no id and no endpoint, and is
  still callable from its siblings — which is the only genuine notion of an internal server
  function in this space.
- Types. `export type` and `export interface` are erased before the client build sees them.

## Why it is an error and not a warning

A warning here would be advice about a security boundary, delivered at the moment the
boundary is being crossed and ignored by default. The whole point of synthesis is that the
unsafe shape is unrepresentable rather than merely discouraged — `CODESIGN.md` §7.1's method,
applied to what reaches the browser.
