# @barqjs/testing

Testing utilities for barq: rendering, user events, accessibility checks,
routes, hydration, server rendering and the server-function wire.

Queries come from [@testing-library/dom](https://testing-library.com/docs/dom-testing-library/intro),
so `getByRole`, `findByText`, `within` and the rest are theirs and behave
exactly as documented there. The shape of `render`, `cleanup` and the `pure`
entry follows React Testing Library.

## Install

```bash
bun add -d @barqjs/testing
```

Components under test go through the barq compiler, like an application build.
Under `vite`/vitest that is `barq()` from `@barqjs/vite`; under `bun test`, a
preload that hands `.tsx` to `@barqjs/compiler` (this package's own
[`src/preload.ts`](./src/preload.ts) is one). Bun's generic JSX transform gives
different semantics and is not supported.

## Rendering a component

```tsx
import { createSignal } from "@barqjs/core";
import { fireEvent, render, screen } from "@barqjs/testing";
import { expect, test } from "bun:test";

function Counter() {
  const [count, setCount] = createSignal(0);
  return (
    <button type="button" onClick={() => setCount((n) => n + 1)}>
      clicked {count} times
    </button>
  );
}

test("the counter counts", () => {
  render(() => <Counter />);

  fireEvent.click(screen.getByRole("button"));

  expect(screen.getByRole("button").textContent).toContain("clicked 1 times");
});
```

`render` mounts into the document and registers the tree for cleanup.
`fireEvent` and `act` flush: a signal write is applied at the next flush, a
microtask later, so an assertion made straight after one would otherwise read
the DOM as it was before. A test that writes a signal itself calls `flush()`
from `@barqjs/core` before it asserts.

Importing `@barqjs/testing` registers `afterEach(cleanup)`. Two escape hatches,
both React Testing Library's: import `@barqjs/testing/pure`, or set
`BARQ_SKIP_AUTO_CLEANUP`.

`renderHook`, `waitFor`, `act` and `tick` are exported beside `render`.

## The event trap

barq delegates its events. A `click` on a detached node reaches no listener, so
anything the assertion after it measures is meaningless. `render` attaches to the
document for you; a hand-built host has to.

## User events and accessibility

`fireEvent` dispatches one synthetic event. `@barqjs/testing/user` dispatches
the sequence a browser fires: `click` is the hover events, then `pointerdown`,
`mousedown`, focus, `pointerup`, `mouseup` and `click`.

```ts
import { click, keyboard, tab, type } from "@barqjs/testing/user";

click(screen.getByRole("button", { name: "Open" }));
type(screen.getByRole("textbox"), "salama");
keyboard("{Enter}");
tab();
```

`@barqjs/testing/a11y` computes what assistive technology would read and checks
the ARIA rules a headless DOM can honestly check:

```ts
import { accessibleName, expectNoAriaViolations } from "@barqjs/testing/a11y";

expect(accessibleName(screen.getByRole("dialog"))).toBe("Settings");
expectNoAriaViolations(document.body);
```

Both are also exported from the package root.

## Routes

```tsx
import { renderRoute } from "@barqjs/testing/router";

const { state, navigate, getByText } = await renderRoute({
  routeTree,
  path: "/posts/1",
});

await navigate("/about");
expect(getByText("About")).toBeDefined();
```

`renderRoute` is `async`, and there is no honest synchronous version. Two
awaits separate a route that rendered from a route that rendered its fallback.
First, `state.start()` has to have settled before the tree is built, or
`useRouteContext()` answers nothing on the first render. Second, the matched
modules have to have arrived, or a `lazy()` route throws `NotReadyError`, parks
its boundary and rebuilds. That produces the right markup by the wrong path, so
the test passes while measuring nothing.

`navigate` waits for the incoming route's module too, because `state.navigate`
resolves when the location changed, which is before the module landed.

## Hydration

```tsx
import { html } from "@barqjs/server";
import { renderAndHydrate } from "@barqjs/testing";

const result = renderAndHydrate({
  server: () => html("<b>hi</b>"),
  client: () => <b>hi</b>,
});

expect(result.recovered).toBe(false);
expect(result.reuse).toBe(1);
```

`renderAndHydrate` renders the `server` half through `renderToString`, puts that
markup in the document, hydrates it with the `client` half, and reports what
survived. A test process has one compilation, so it supplies both halves: a
module compiled for the string backend (or `html()` from `@barqjs/server`) and
the DOM-compiled component that claims it. Pass `seed` with a seed script's
payload when the client reads a loader's value.

The measure is node identity, not markup. A replaced node and a claimed node
serialise identically, so `kept`, `total` and `reuse` count the server's own
nodes still in the tree, and `claimed`, `mismatches` and `recovered` are the
walk's own report.

## Server rendering

```tsx
import { ssrPage } from "@barqjs/testing/server";

const page = await ssrPage("/about", { routeTree });

expect(page.status).toBe(200);
expect(page.html).toStartWith("<!doctype html>");
expect(page.container.querySelector("h1")?.textContent).toBe("About");
```

`ssrPage` returns the whole document as a `Response`, with its status, headers,
html, and the parsed `<body>` for queries. It renders with `stream: false`, so
`html` is the finished page rather than a shell plus the scripts that would fill
it.

The assertion worth writing is that a loader's value is in the markup. A page
that rendered its pending state and called itself server-rendered looks fine
from every other angle.

## Server functions, over the wire

```ts
import { createServerFn } from "@barqjs/start";
import { mount, unmountAll } from "@barqjs/start/server";
import { callServerFn } from "@barqjs/testing/server";

const greet = createServerFn({ method: "POST" })
  .inputValidator((name: string) => name)
  .handler(({ data }) => ({ message: `Hello ${data}` }));

beforeEach(unmountAll);

test("greets", async () => {
  mount("src/data.ts#greet", greet);

  const call = await callServerFn<{ message: string }>({
    id: "src/data.ts#greet",
    input: "salama",
  });

  expect(call.status).toBe(200);
  expect(call.value?.message).toBe("Hello salama");
});
```

`callServerFn` calls `/_barq/fn/<id>` with the method the mounted function
answers (a `GET` with its input in the query and the caller header, as the stub
sends it, or a `POST`) and decodes through the client's own codec, so a `Date`
comes back a `Date`.

Calling the handler directly skips the method gate, the origin check,
`reachable`, and the split between the JSON channel and the FormData one. That
is everything a server function's security rests on, and it is what this
exercises:

```ts
await callServerFn({ id, method: "GET" }); // 405 for a POST function
await callServerFn({ id, origin: "https://evil.example" }); // 403
await callServerFn({ id, reachable: () => false }); // 404, same as unknown
await callServerFn({ id, form }); // 303, the no-JS channel
```

The registry is module state and `mount` refuses a duplicate id, so a suite that
mounts per test wants `beforeEach(unmountAll)`.

## Requests, cookies and sessions

```ts
import { useSession } from "@barqjs/start";
import { cookiesOf, runInRequest, testRequest } from "@barqjs/testing/server";

const config = { password: process.env.SESSION_PASSWORD!, name: "session" };

const login = await runInRequest("/login", async () => {
  const session = await useSession<{ user: string }>(config);
  await session.update({ user: "salama" });
});
const sealed = cookiesOf(login).session!;

const me = await runInRequest(testRequest("/me", { cookies: { session: sealed } }), async () => {
  const session = await useSession<{ user: string }>(config);
  return session.data.user;
});

expect(me.value).toBe("salama");
```

`runInRequest` runs a function inside a request, the way a server function or a
route handler runs, and returns its value, the response draft, its status and
the `Set-Cookie` lines. `useSession` writes nothing until `update` is called, so
reading a session issues no cookie.

This exists for two environment traps. Both cost every suite the same afternoon.

- **A `Cookie` set through the `Request` constructor is dropped.** It is a
  forbidden header per the fetch spec and happy-dom enforces it, so a test that
  writes `new Request(url, { headers: { cookie } })` sends no cookie and every
  session test reads an empty session. `Origin`, `Host`, `Referer` and every
  `Sec-` name behave the same way. `testRequest` installs them the way a server
  would receive them.
- **A `Response` built with `new Response(body, { headers })` drops every
  `set-cookie`** under happy-dom. `runInRequest` hands back the draft, where the
  cookie is still readable.

## Entry points

- `@barqjs/testing`: the queries, `render`, `renderHook`, `fireEvent`, `act`,
  `waitFor`, `renderAndHydrate`, the user events and the a11y checks, plus
  `afterEach(cleanup)`.
- `@barqjs/testing/pure`: the same, without the auto-cleanup hook.
- `@barqjs/testing/user`: browser-shaped pointer and keyboard sequences.
- `@barqjs/testing/a11y`: `role`, `accessibleName`, `accessibleDescription`,
  `ariaViolations`, `expectNoAriaViolations`.
- `@barqjs/testing/router`: `renderRoute`.
- `@barqjs/testing/server`: `ssrPage`, `callServerFn`, `testRequest`,
  `runInRequest`, `cookiesOf`.
