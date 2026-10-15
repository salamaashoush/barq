# BIND_TARGET_NOT_WRITABLE

**Severity:** error. Raised in the browser, in a development build.

## Message

```text
`bind:value` on `<input>` was given a value of type `function` instead of a signal, so the
element does not follow the value and what the user types is never written back. Pass the
whole signal, the `[read, write]` pair `createSignal` returns: `const text = createSignal("")`
and then `bind:value={text}`.
```

## What raises it

A `bind:` attribute whose value is not a `[read, write]` pair, such as a memo
or the read half of a signal on its own:

```tsx
import { createMemo, createSignal } from "@barqjs/core";

export function NameField() {
  const [name] = createSignal("salama");
  const upper = createMemo(() => name().toUpperCase());
  return <input type="text" bind:value={upper} />;
}
```

The field does not show `SALAMA`: it is handed the memo function itself and
displays its source text. Typing in it changes nothing in the program.

## The fix

Bind the signal itself. Keep the pair whole, or put it back together:

```tsx
import { createSignal } from "@barqjs/core";

export function NameField() {
  const name = createSignal("salama");
  return <input type="text" bind:value={name} />;
}

export function SplitNameField() {
  const [name, setName] = createSignal("salama");
  return <input type="text" bind:value={[name, setName]} />;
}
```

For a derived value that should stay read-only, use the plain attribute:
`value={upper()}`.

## Why it is reported

`bind:` promises two directions: the signal updates the element, and an edit
updates the signal. A value that is not a signal gives it neither, and nothing
throws, so the field looks present and is connected to nothing. TypeScript
rejects the same code, so this diagnostic mostly reaches JavaScript files and
values typed `any`.

## Where it shows

Each console entry is followed by the component it happened in, as
`in <App> › <Row>` (from a development compile, which names the components it
calls), and by the address of this page.

A development build prints `[barq] BIND_TARGET_NOT_WRITABLE: ...` to the console
with `console.error`, and the dev overlay lists it. To collect it yourself,
subscribe to the channel:

```ts
import { DEV } from "@barqjs/core";

const stop = DEV.diagnostics.subscribe((event) => {
  if (event.code === "BIND_TARGET_NOT_WRITABLE") console.error(event.message, event.docs);
});
```

There is no comment that silences a runtime diagnostic. A production build
subscribes nothing, so nothing is reported there.
