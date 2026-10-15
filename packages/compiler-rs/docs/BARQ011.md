# BARQ011: `keyed={false}` keeps element state in place when the list reorders

**Level:** note · [all codes](README.md)

## Message

> `keyed={false}` reuses each row's elements by position, so what the user did inside
> `<input>` (typed text, the caret, a selection, playback, open or closed) stays in that
> position when the list reorders and ends up on a different item. Remove
> `keyed={false}` so a row moves with its item, or key by a stable field: `keyed={(row)
> => row.id}`.

## Failing example

```tsx
import { For, createSignal } from "@barqjs/core";

const [todos] = createSignal([{ id: 1, text: "Write the docs" }]);

export const Todos = () => (
  <ul>
    <For each={todos} keyed={false}>
      {(todo) => (
        <li>
          <input value={todo().text} />
        </li>
      )}
    </For>
  </ul>
);
```

## Fixed example

```tsx
import { For, createSignal } from "@barqjs/core";

const [todos] = createSignal([{ id: 1, text: "Write the docs" }]);

export const Todos = () => (
  <ul>
    <For each={todos} keyed={(todo) => todo.id}>
      {(todo) => (
        <li>
          <input value={todo().text} />
        </li>
      )}
    </For>
  </ul>
);
```

## Why this rule exists

With `keyed={false}` the first row is always the first `<li>`, whichever item is in it.
What barq writes follows the item, but what the browser keeps inside an element does not:
the text being typed, the caret, a selection, a `<video>`'s position, an open `<details>`.
After a reorder or a removal that state sits on a different item.

The note looks at elements written directly in the row: `input`, `textarea`, `select`,
`video`, `audio`, `details`, `canvas`, `dialog` and custom elements. It cannot see inside
a component used in the row, so its silence does not mean a row holds no such state.

## Silencing one line

```tsx
import { For, createSignal } from "@barqjs/core";

const [todos] = createSignal([{ id: 1, text: "Write the docs" }]);

export const Todos = () => (
  <ul>
    <For each={todos} keyed={false}>
      {(todo) => (
        <li>
          {/* barq-ignore-next-line BARQ011 (this list is append-only) */}
          <input value={todo().text} />
        </li>
      )}
    </For>
  </ul>
);
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ011 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
