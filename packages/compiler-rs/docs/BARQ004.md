# BARQ004: `<For>` rows may show stale fields when `each` holds store objects

**Level:** note · [all codes](README.md)

## Message

> `<For>` reads a row's fields once, when the row is created, and the compiler cannot
> tell where the items in `each` come from. If they are store objects, changing a field
> in place leaves the row showing the old value. Key the list and read the row by
> calling it: `keyed={(row) => row.id}` with `row().name`.

## Failing example

```tsx
import { For, createStore } from "@barqjs/core";

const [state] = createStore({ rows: [{ id: 1, name: "salama" }] });

export const List = () => (
  <ul>
    <For each={state.rows}>{(row) => <li>{row.name}</li>}</For>
  </ul>
);
```

## Fixed example

```tsx
import { For, createStore } from "@barqjs/core";

const [state] = createStore({ rows: [{ id: 1, name: "salama" }] });

export const List = () => (
  <ul>
    <For each={state.rows} keyed={(row) => row.id}>
      {(row) => <li>{row().name}</li>}
    </For>
  </ul>
);
```

## Why this rule exists

Without `keyed`, a row is identified by the item itself and receives it as a plain value,
so `{row.name}` is written once. That is right when a change replaces the item with a new
object, because a new item is a new row. A store changes fields in place: the item stays
the same object, the row is kept, and the old text stays on the page.

The compiler cannot tell which kind of list `each` holds, which is why this is a note and
not a warning. With `keyed={(row) => row.id}` or `keyed={false}` the row receives an
accessor, `row().name` is read again when the field changes, and nothing is reported.

## Silencing one line

```tsx
import { For, createStore } from "@barqjs/core";

const [state] = createStore({ rows: [{ id: 1, name: "salama" }] });

export const List = () => (
  <ul>
    {/* barq-ignore-next-line BARQ004 (rows are replaced, never changed in place) */}
    <For each={state.rows}>{(row) => <li>{row.name}</li>}</For>
  </ul>
);
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ004 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
