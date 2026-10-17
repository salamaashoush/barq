# BARQ004: A `<For>` row reads a field once, which goes stale if `each` holds store objects

**Level:** note · [all codes](README.md)

## Message

> `<For>` reads a field of this row once, when the row is built, and the compiler cannot
> tell where the items in `each` come from. If they are store objects, changing that field
> in place leaves the row showing the old value. Read the field where it is shown, as
> `{row.name}` in the row callback's JSX, or key the list and read the row by calling it:
> `keyed={(row) => row.id}` with `row().name`.

## Failing example

```tsx
import { For, createStore } from "@barqjs/core";

const [state] = createStore({ rows: [{ id: 1, name: "salama" }] });

export const List = () => (
  <ul>
    <For each={state.rows}>{({ name }) => <li>{name}</li>}</For>
  </ul>
);
```

```tsx
import { For, createStore } from "@barqjs/core";

const [state] = createStore({ rows: [{ id: 1, name: "salama" }] });

export const List = () => (
  <ul>
    <For each={state.rows}>
      {(row) => {
        const label = row.name.toUpperCase();
        return <li>{label}</li>;
      }}
    </For>
  </ul>
);
```

## Fixed example

```tsx
import { For, createStore } from "@barqjs/core";

const [state] = createStore({ rows: [{ id: 1, name: "salama" }] });

export const List = () => (
  <ul>
    <For each={state.rows}>{(row) => <li>{row.name}</li>}</For>
  </ul>
);
```

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

Without `keyed`, a row is identified by the item itself and receives it as a plain value.
A store changes fields in place: the item stays the same object, so the row is kept rather
than built again. What the row shows is then up to where each field is read.

A field read in a hole of the row callback, a child like `{row.name}`, an attribute like
`title={row.name}`, or a component prop, is compiled as a read that runs again when the
field changes, so that row follows the store and nothing is reported. That holds for a
callback written inline and for one passed by name, `{renderRow}`, alike. A field read
anywhere the row reads it only while it is built is reported:

- a destructured parameter, `({ name }) => …`, or `const { name } = row`;
- a read outside the JSX, `const name = row.name`, or a row handed to a function there;
- a read that picks the JSX, `row.done ? <s/> : <li/>`, or the tag, `<row.Icon />`;
- a callback the module does not show, such as an import, whose reads cannot be seen.

Handlers, `ref`, `bind:` and a form's `action` are handed over once whatever their
source, a signal's included, so a row field read there is not reported.

The note needs both halves: a callback that reads a field once, and rows the compiler
cannot prove are plain values. Rows written as an array literal are plain, and a `<For>`
over them is not reported. With `keyed={(row) => row.id}` or `keyed={false}` the row
receives an accessor, `row().name` is read again when the field changes, and nothing is
reported.

## Silencing one line

```tsx
import { For, createStore } from "@barqjs/core";

const [state] = createStore({ rows: [{ id: 1, name: "salama" }] });

export const List = () => (
  <ul>
    {/* barq-ignore-next-line BARQ004 (rows are replaced, never changed in place) */}
    <For each={state.rows}>{({ name }) => <li>{name}</li>}</For>
  </ul>
);
```

The reason in parentheses is required and has to be at least 10 characters. Between JSX
children, write the comment as `{/* barq-ignore-next-line BARQ004 (reason) */}` on the line
above: a `//` line there is text and would be rendered on the page. To change the level
for the whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
