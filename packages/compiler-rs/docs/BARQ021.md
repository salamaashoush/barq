# BARQ021: An async computation reads a source after its first `await`, which is not tracked

**Level:** warning · [all codes](README.md)

## Message

> `query()` is read after an `await`, and an async computation tracks only what it reads
> before its first `await`. When it changes, this `createMemo` does not run again and its
> value stays stale. Read it before the first `await` and keep the value in a local, or
> wrap the read in `untrack(() => …)` if one read is meant.

## Failing example

```tsx
import { createMemo, createSignal } from "@barqjs/core";

const [query] = createSignal("");

export const results = createMemo(async () => {
  const response = await fetch("https://example.com/items");
  const items = await response.json();
  return items.filter((item) => item.tag === query());
});
```

## Fixed example

```tsx
import { createMemo, createSignal } from "@barqjs/core";

const [query] = createSignal("");

export const results = createMemo(async () => {
  const tag = query();
  const response = await fetch("https://example.com/items");
  const items = await response.json();
  return items.filter((item) => item.tag === tag);
});
```

## Why this rule exists

A computation records what it reads while it runs. An `async` function stops running at
its first `await`, and what it does after the promise settles happens in a later task,
outside the computation. A signal, memo, store or prop read there returns its current
value, but it is not a dependency: when it changes the computation does not run again,
and its value stays stale without any error.

Read every source before the first `await` and keep the value in a local. A source that is
also read before the first `await` is tracked and is not reported, and neither is a read
wrapped in `untrack(() => …)`, which says that one read is meant. A function created after
the `await` and passed to a call, such as the callback of `filter`, runs after it too and
is checked; a function returned for someone else to call is not.

The rule looks at the function passed to `createMemo`, `createProjection`, the derived
forms of `createSignal` and `createStore`, and the first function of `createEffect` and
`createRenderEffect`. Development builds of the engine have a runtime check for the same
mistake that can follow a read into another function; this one sees it in the file, before
anything runs.

## Silencing one line

```tsx
import { createMemo, createSignal } from "@barqjs/core";

const [query] = createSignal("");

export const results = createMemo(async () => {
  const response = await fetch("https://example.com/items");
  const items = await response.json();
  // barq-ignore-next-line BARQ021 (the filter is fixed once the list arrives)
  return items.filter((item) => item.tag === query());
});
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ021 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
