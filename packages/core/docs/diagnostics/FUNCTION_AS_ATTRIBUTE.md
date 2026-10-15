# FUNCTION_AS_ATTRIBUTE

**Severity:** warning. Raised in the browser, in a development build.

## Message

```text
The `title` attribute on `<button>` was given a function, so the function's source text is
written to the page instead of its value. Call the accessor where the value is chosen:
`title={open() ? label() : "closed"}`.
```

## What raises it

An attribute whose expression evaluates to a function. The usual way there is a
signal or a prop named without its call inside a larger expression:

```tsx
import { createSignal } from "@barqjs/core";

export function Toggle() {
  const [open, setOpen] = createSignal(true);
  const [label] = createSignal("Open");
  return (
    <button title={open() ? label : "closed"} onClick={() => setOpen(!open())}>
      Toggle
    </button>
  );
}
```

`open() ? label : "closed"` picks the accessor `label` itself, so while the
button is open its tooltip is the source text of a function.

## The fix

Call the accessor at the point the value is chosen:

```tsx
import { createSignal } from "@barqjs/core";

export function Toggle() {
  const [open, setOpen] = createSignal(true);
  const [label] = createSignal("Open");
  return (
    <button title={open() ? label() : "closed"} onClick={() => setOpen(!open())}>
      Toggle
    </button>
  );
}
```

## Why it is reported

An attribute holds text, and the text of a function is its source code. Nothing
throws, so the mistake is only visible to someone who hovers the element or
reads the markup. A bare accessor on its own, `title={label}`, is read for you
and is not reported: only a function that comes out of an expression is.

## Where it shows

Each console entry is followed by the component it happened in, as
`in <App> › <Row>` (from a development compile, which names the components it
calls), and by the address of this page.

A development build prints `[barq] FUNCTION_AS_ATTRIBUTE: ...` to the console
once per distinct message, and the dev overlay lists it. To collect it
yourself, subscribe to the channel:

```ts
import { DEV } from "@barqjs/core";

const stop = DEV.diagnostics.subscribe((event) => {
  if (event.code === "FUNCTION_AS_ATTRIBUTE") console.warn(event.message, event.docs);
});
```

There is no comment that silences a runtime diagnostic. A production build
subscribes nothing, so nothing is reported there.
