# SERVER_FUNCTION_FAILED

**Severity:** error. Raised on the server when a server function, or a request
middleware in front of it, throws, in a development build.

## Message

```text
The server function "src/orders.ts#placeOrder" threw: `TypeError: Cannot read properties of
undefined (reading 'length')`. The caller received a 500. Fix the throw at the top of the stack,
or throw a `Response`, `redirect()` or `notFound()` to answer the caller on purpose.
```

On the development server the caller is told what was thrown: the call rejects
with a `ServerFnError` whose message names the error, and whose `thrown` holds
its name, message and stack mapped to your source. The overlay shows the same
failure from the server's side, with a link to the line that threw.

A production server sends only the status and the line `internal server error`.
`error.thrown` is then `undefined`, so handle a failure by `error.status`.

## What raises it

A handler that throws:

```tsx
import { createServerFn } from "@barqjs/start";

export const placeOrder = createServerFn({ method: "POST" })
  .validator("unchecked")
  .handler(async ({ data }: { data: { lines?: string[] } }) => data.lines!.length);
```

## The fix

Fix the throw. Where the failure is an answer the caller should act on, throw
one:

```tsx
import { createServerFn } from "@barqjs/start";

export const placeOrder = createServerFn({ method: "POST" })
  .validator("unchecked")
  .handler(async ({ data }: { data: { lines?: string[] } }) => {
    if (data.lines === undefined) {
      throw new Response("an order needs at least one line", { status: 422 });
    }
    return data.lines.length;
  });
```

Input the caller sent wrong is a validator's job. Its issues reach the caller in
every build as `error.issues`, each with the path to its field.

## Why it is reported

A handler's message can name a table, a column or a file, so production never
sends it. In development the caller is the developer, and a bare 500 sends them
to the terminal to find out what happened.

## Where it shows

Each console entry is followed by the component it happened in, as
`in <App> › <Row>` (from a development compile, which names the components it
calls), and by the address of this page.

The server's terminal prints the error. The channel carries it with the
function's id as `event.data.id` and the error as `event.data.error`:

```ts
import { DEV } from "@barqjs/core";

const stop = DEV.diagnostics.subscribe((event) => {
  if (event.code === "SERVER_FUNCTION_FAILED") console.error(event.data?.id, event.data?.error);
});
```
