# BLOCK_EVALUATED_TWICE

**Severity:** error. Raised in the browser, in a development build.

## Message

```text
The content of one `<Show>`, `<For>`, `<Loading>` or `<Portal>` was built twice for a single
render, so its effects exist twice and one copy of its DOM was thrown away. This is a bug in
barq, not in your component: please report it with the component that triggered it.
```

## What raises it

No application code is known to raise it. The content of a `<Show>`, a row of a
`<For>`, the children of a `<Loading>` and the children of a `<Portal>` are
each built once every time they appear, and this diagnostic is the runtime
checking that rule against itself. A component like this one is built exactly
once per appearance and stays quiet:

```tsx
import { Show, createSignal } from "@barqjs/core";

export function Panel() {
  const [open, setOpen] = createSignal(false);
  return (
    <section>
      <button onClick={() => setOpen(!open())}>Toggle</button>
      <Show when={open()}>
        <p>Details</p>
      </Show>
    </section>
  );
}
```

Closing and opening the panel again builds `<p>Details</p>` a second time. That
is a second appearance, and it is not reported.

## The fix

There is nothing to change in the component. Report it at
https://github.com/salamaashoush/barq/issues with the component that was on
screen and the versions of `@barqjs/core` and `@barqjs/compiler` in use.

## Why it is reported

Content that is built twice creates two sets of DOM nodes and two sets of
effects. One set of nodes is shown and the other is discarded, while both sets
of effects stay alive until the content goes away. The page still looks right,
which is why the runtime checks for it instead of leaving it to be noticed.

## Where it shows

Each console entry is followed by the component it happened in, as
`in <App> › <Row>` (from a development compile, which names the components it
calls), and by the address of this page.

A development build prints `[barq] BLOCK_EVALUATED_TWICE: ...` to the console
with `console.error`, and the dev overlay lists it. To collect it yourself,
subscribe to the channel:

```ts
import { DEV } from "@barqjs/core";

const stop = DEV.diagnostics.subscribe((event) => {
  if (event.code === "BLOCK_EVALUATED_TWICE") console.error(event.message, event.docs);
});
```

There is no comment that silences a runtime diagnostic. A production build
subscribes nothing, so nothing is reported there.
