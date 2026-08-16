# BARQ011 — a positional row holds DOM state

**Level:** note · **Dev builds only** · [all codes](README.md)

## What fires

A `<For keyed={false}>` — the positional mode — whose row markup contains an element whose
state lives in the element rather than in any attribute the compiler writes: `input`,
`textarea`, `select`, `video`, `audio`, `details`, `canvas`, `dialog`, or a custom element.

```jsx
<For each={todos} keyed={false}>
  {(todo) => <li><input value={todo().text} /></li>}   // BARQ011
</For>
```

## What it means

`keyed={false}` makes a row's identity its **position**. Slot 0 is reused for whatever item
is at index 0, so the caret, the selection, the playback offset and the open/closed toggle
belong to the slot rather than to the item that happens to be in it. Reorder the list and
that state stays behind.

## The fix

Drop `keyed={false}` — the default is identity keying, where the row travels with its item
(SEMANTICS K1):

```jsx
<For each={todos}>{(todo) => <li><input value={todo.text} /></li>}</For>
```

or key on a stable field, which keeps the row across an item replacement too:

```jsx
<For each={todos} keyed={(todo) => todo.id}>
  {(todo) => <li><input value={todo().text} /></li>}
</For>
```

## What this note is not

It is a hint, not a safety net, and the difference is the reason the keying default is
identity rather than index. This note sees **inline markup only**. A component compiles to
an opaque call, so `{todo => <TodoRow todo={todo}/>}` with an `<input>` inside `TodoRow`
produces nothing here — and neither does a scroll offset on a plain `<div>`, a running
animation, or a third-party widget behind a `ref`. A default that relied on this note to
stay correct would have been silently wrong for every one of those.

Nothing rests on it now: `keyed={false}` is written by hand, and this only says what that
spelling means for the state the compiler happens to be able to see.

## Silencing it

```jsx
{/* barq-ignore-next-line BARQ011 (this list never reorders) */}
<For each={rows} keyed={false}>{(row) => <li><input value={row()} /></li>}</For>
```
