# DELEGATED_EVENT_DOES_NOT_BUBBLE

**Severity:** warning. Raised in the browser, in a development build.

## Message

```text
`delegateEvents(["focus"])` asks for a listener on each render root, but the `focus` event
does not bubble, so a handler registered this way never runs. Attach it to the element itself:
`listen(element, "focus", handler)`.
```

## What raises it

A call to `delegateEvents` naming an event that does not bubble: `focus`,
`blur`, `mouseenter`, `mouseleave`, `load`, `scroll` and the rest of that
family. Delegation installs one listener on the container each `render` or
`hydrate` mounts into and finds the handler by walking up from the target, so an
event that never reaches that container never finds it:

```tsx
import { delegateEvents } from "@barqjs/web";

export function Search() {
  delegateEvents(["focus"]);
  return <input aria-label="Search" />;
}
```

Compiled `on*` handlers never ask for this: the compiler binds non-bubbling
events to the element directly. Only a hand-written call reaches it.

## The fix

Listen on the element itself:

```tsx
import { listen } from "@barqjs/web";

export function Search() {
  return (
    <input
      aria-label="Search"
      ref={(input) => {
        listen(input, "focus", () => input.select());
      }}
    />
  );
}
```

## Why it is reported

Nothing throws. The listener is installed and silently receives nothing, so the
handler looks registered and never runs.

## Where it shows

Each console entry is followed by the component it happened in, as
`in <App> › <Row>` (from a development compile, which names the components it
calls), and by the address of this page.

A development build prints `[barq] DELEGATED_EVENT_DOES_NOT_BUBBLE: ...` to the
console once per distinct message, and the dev overlay lists it. To collect it
yourself, subscribe to the channel:

```ts
import { DEV } from "@barqjs/core";

const stop = DEV.diagnostics.subscribe((event) => {
  if (event.code === "DELEGATED_EVENT_DOES_NOT_BUBBLE") console.warn(event.message, event.docs);
});
```

There is no comment that silences a runtime diagnostic. A production build
subscribes nothing, so nothing is reported there.
