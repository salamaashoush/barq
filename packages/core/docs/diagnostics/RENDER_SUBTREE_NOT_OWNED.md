# RENDER_SUBTREE_NOT_OWNED

**Severity:** warning. Raised in the browser, in a development build.

## Message

```text
`render` was given nodes that were built before the call, as in `const view = <App />`
followed by `render(view, host)`, so the function it returns removes the nodes but cannot
dispose their effects and listeners. Pass a function instead: `render(() => <App />, host)`.
```

## What raises it

`render` called with DOM nodes that already exist, instead of with a function
that builds them:

```tsx
import { createSignal, render } from "@barqjs/core";

function Counter() {
  const [count, setCount] = createSignal(0);
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>;
}

const view = <Counter />;
const dispose = render(view, document.body);
```

`<Counter />` runs on the line that assigns `view`, before `render` has made
the root that should own it.

## The fix

Hand `render` a function, so the component runs inside the root:

```tsx
import { createSignal, render } from "@barqjs/core";

function Counter() {
  const [count, setCount] = createSignal(0);
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>;
}

const dispose = render(() => <Counter />, document.body);
```

## Why it is reported

Every effect and listener belongs to the owner that was current when it was
created, and disposing that owner is what stops them. Nodes built before
`render` have no such owner, so calling the function `render` returns takes
them off the page and leaves their effects running. Unmounting and mounting
again then leaks one set of effects each time.

## Where it shows

Each console entry is followed by the component it happened in, as
`in <App> › <Row>` (from a development compile, which names the components it
calls), and by the address of this page.

A development build prints `[barq] RENDER_SUBTREE_NOT_OWNED: ...` to the console
once, and the dev overlay lists it. To collect it yourself, subscribe to the
channel:

```ts
import { DEV } from "@barqjs/core";

const stop = DEV.diagnostics.subscribe((event) => {
  if (event.code === "RENDER_SUBTREE_NOT_OWNED") console.warn(event.message, event.docs);
});
```

There is no comment that silences a runtime diagnostic. A production build
subscribes nothing, so nothing is reported there.
