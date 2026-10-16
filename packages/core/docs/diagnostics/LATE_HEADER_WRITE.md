# LATE_HEADER_WRITE

**Severity:** warning. Raised on the server by `setResponseHeader`,
`appendResponseHeader`, `removeResponseHeader`, `clearResponseHeaders`,
`setResponseStatus`, `setCookie`, `replaceCookie` and `deleteCookie`, by
`httpStatus` and `httpHeader`, and by a write to `getRequestEvent().response.headers`
itself, once the response head has been committed, in a development build.

## Message

```text
`setResponseHeader("cache-control")` ran at Profile (/app/src/routes/profile.tsx:9:3) after the
response's status and headers had been sent, so it changed nothing the browser receives. Code
runs that late inside a part of the page that renders after the shell (a `<Loading>` boundary or
a loader the shell does not wait for), or in a streamed server function after its first value.
Set the status, headers and cookies while the response is still open: in a `beforeLoad`, a
loader the route awaits, a route handler, a middleware, or a server function before it returns.
```

The message names the call and the line that made it. The overlay shows the
whole stack, mapped to your source.

## What raises it

A write from a part of the page that renders after the shell was sent:

```tsx
import { Loading, createMemo } from "@barqjs/core";
import { setResponseHeader } from "@barqjs/start";

async function loadProfile(): Promise<{ name: string }> {
  return { name: "Salama" };
}

function Profile() {
  const profile = createMemo(async () => {
    const loaded = await loadProfile();
    setResponseHeader("cache-control", "private, max-age=60");
    return loaded;
  });
  return <p>{profile().name}</p>;
}

export function Page() {
  return (
    <Loading fallback={<p>Loading the profile</p>}>
      <Profile />
    </Loading>
  );
}
```

## The fix

Write it where the response is still open, before the shell is sent, such as
the route's `beforeLoad`:

```tsx
import { createFileRoute } from "@barqjs/router";
import { setResponseHeader } from "@barqjs/start";

export const Route = createFileRoute("/profile")({
  beforeLoad: () => {
    setResponseHeader("cache-control", "private, max-age=60");
  },
  component: Profile,
});

function Profile() {
  return <p>Salama</p>;
}
```

## Why it is reported

The status and headers leave with the shell. A write after that changes a head
nobody reads, so the header, the cookie or the status silently never reaches the
browser: a session that is not rotated, a page cached that should not be.

## Where it shows

Each console entry is followed by the component it happened in, as
`in <App> › <Row>` (from a development compile, which names the components it
calls), and by the address of this page.

The server's terminal prints `[barq] LATE_HEADER_WRITE: ...`, and the overlay
lists it. The channel carries the call as `event.data.call`:

```ts
import { DEV } from "@barqjs/core";

const stop = DEV.diagnostics.subscribe((event) => {
  if (event.code === "LATE_HEADER_WRITE") console.warn(event.data?.call, event.message);
});
```

A production build subscribes nothing, and the write is dropped as before.
