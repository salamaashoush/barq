# BARQ027: A `bind:` or a form `action` is written for a custom renderer

**Level:** error · [all codes](README.md)

## Message

> `bind:` is a two-way binding to a document form control, and this element is built by a
> custom renderer, which has none. Pass the value as a prop and write it back from the
> host's own event: `value={text()}` with `onChange={(next) => setText(next)}`.

For `action` on a `<form>`, the message says that the action is a document form's submit
handler or URL and suggests calling it from the host's own event, such as
`onSubmit={() => save()}`.

## Failing example

```tsx
// compiled with target: "universal"
export const Field = (props) => <input bind:value={props.text} />;
```

## Fixed example

```tsx
// compiled with target: "universal"
export const Field = (props) => (
  <input value={props.text()} onChange={(next: string) => props.setText(next)} />
);
```

## Why this rule exists

An element a custom renderer builds (in a module compiled with `target: "universal"`, a
file a `renderers` entry gives to one, or the children of a `boundaries` component whose
target is `universal`) has every attribute and event written as one `setProp` call on the
host's node, and the host decides what a name means. `bind:` needs two facts only a document form
control has: the property a user edits (`value`, `checked`, `valueAsNumber`) and the event
that reports the edit (`input`, `change`). A form `action` is the document's submit,
which a scene graph or a terminal does not have. Neither has a meaning the compiler could
write for an arbitrary host, so the module would build an element that silently never
updates, and the build fails instead. A literal `action="/save"` is an ordinary property
and is not reported.

## Silencing one line

```tsx
// barq-ignore-next-line BARQ027 (the host reads this name itself in a later version)
export const Field = (props) => <input bind:value={props.text} />;
```

The reason in parentheses is required and has to be at least 10 characters. Silencing the
code does not make the binding work: nothing is emitted for it. To change the level for the
whole project, see [the index](README.md#changing-a-level-for-the-whole-project).
