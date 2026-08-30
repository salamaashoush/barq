# @barqjs/testing

Rendering, routes, hydration, server rendering and the RPC wire, under test.

```bash
bun add -d @barqjs/testing
```

Queries come from [@testing-library/dom](https://testing-library.com/docs/dom-testing-library/intro),
so `getByRole`, `findByText`, `within` and the rest are theirs and behave
exactly as documented there.

## Rendering a component

```tsx
import { fireEvent, render, screen } from "@barqjs/testing";

test("the counter counts", () => {
  render(() => <Counter />);

  fireEvent.click(screen.getByRole("button"));

  expect(screen.getByRole("button").textContent).toContain("clicked 1 times");
});
```

`render` mounts into the document and registers the tree for cleanup.
`fireEvent` and `act` FLUSH: barq batches on the microtask queue, so an
assertion made straight after a `set()` would otherwise read the DOM as it was
before.

Importing `@barqjs/testing` registers `afterEach(cleanup)`. Two escape hatches,
both React Testing Library's: import `@barqjs/testing/pure`, or set
`BARQ_SKIP_AUTO_CLEANUP`.

## The event trap

barq DELEGATES its events. A `click` on a detached node reaches no listener, so
anything the assertion after it measures is meaningless. `render` attaches to the
document for you; a hand-built host has to.

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

`async`, and there is no honest synchronous version. Two awaits separate a route
that rendered from a route that rendered its fallback: `state.start()` has to
have settled before the tree is built, or `useRouteContext()` answers nothing on
the first render; and the matched modules have to have arrived, or a `lazy()`
route throws `NotReadyError`, parks its boundary and REBUILDS — producing the
right markup by the wrong path, so the test passes while measuring nothing.

`navigate` waits for the incoming route's module too, because `state.navigate`
resolves when the LOCATION changed, which is before the module landed.

## Hydration

```tsx
import { renderAndHydrate } from "@barqjs/testing";

const { container } = await renderAndHydrate(() => <Widget />);
```

Renders through the string backend, puts that markup in the document, and
hydrates over it — which is the arrangement that can see a claim go wrong. A
markup diff cannot: a replaced node and a claimed node serialise identically.

## Server rendering

```tsx
import { ssrPage } from "@barqjs/testing/server";

const page = await ssrPage("/about", { routeTree });

expect(page.status).toBe(200);
expect(page.html).toStartWith("<!doctype html>");
expect(page.container.querySelector("h1")?.textContent).toBe("About");
```

The whole document, as a `Response` — status, headers, html, and the parsed
`<body>` for queries. `stream: false` by default, so `html` is the finished page
rather than a shell plus the scripts that would fill it.

The assertion worth writing is that a loader's value is IN the markup. A page
that rendered its pending state and called itself server-rendered looks fine
from every other angle.

## Server functions, over the wire

```ts
import { callServerFn } from "@barqjs/testing/server";
import { mount, unmountAll } from "@barqjs/start/server";

beforeEach(unmountAll);

test("greets", async () => {
  mount("src/data.ts#greet", greet);

  const call = await callServerFn<{ message: string }>({ id: "src/data.ts#greet", input: "Ada" });

  expect(call.status).toBe(200);
  expect(call.value?.message).toBe("Hello Ada");
});
```

POSTs to `/_barq/fn/<id>` and decodes through the client's own codec, so a
`Date` comes back a `Date`.

Calling the handler directly skips the method gate, the origin check,
`reachable`, and the split between the JSON channel and the FormData one — which
is everything a server function's security rests on. Those are what this
exercises:

```ts
await callServerFn({ id, method: "GET" }); // 405
await callServerFn({ id, origin: "https://evil.example" }); // 403
await callServerFn({ id, reachable: () => false }); // 404, same as unknown
await callServerFn({ id, form }); // 303, the no-JS channel
```

The registry is module state and `mount` refuses a duplicate id, so a suite that
mounts per test wants `beforeEach(unmountAll)`.

## Requests, cookies and sessions

```ts
import { cookiesOf, runInRequest, testRequest } from "@barqjs/testing/server";

const run = await runInRequest(testRequest("/", { cookies: { session: sealed } }), () =>
  useSession(config),
);

expect(cookiesOf(run).session).toBeDefined();
```

Two environment traps this exists for, and both cost every suite the same
afternoon:

- **A `Cookie` set through the `Request` constructor is dropped.** It is a
  forbidden header per the fetch spec and happy-dom enforces it, so a test that
  writes `new Request(url, { headers: { cookie } })` sends no cookie and every
  session test reads an empty session. `Origin` and every `Sec-` name behave the
  same way. `testRequest` installs them the way a server would receive them.
- **A `Response` built with `new Response(body, { headers })` drops every
  `set-cookie`** under happy-dom. `runInRequest` hands back the DRAFT, where the
  cookie is still readable.

## Subpaths

| import                   | what it adds                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `@barqjs/testing`        | the queries, `render`, `renderHook`, `renderAndHydrate`, plus `afterEach(cleanup)` |
| `@barqjs/testing/pure`   | the same, without the auto-cleanup hook                                            |
| `@barqjs/testing/router` | `renderRoute`                                                                      |
| `@barqjs/testing/server` | `ssrPage`, `callServerFn`, `testRequest`, `runInRequest`                           |
