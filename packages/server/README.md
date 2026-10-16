# @barqjs/server

Server rendering for barq: `renderToString` and `renderToStream` with Solid
2.0's names and options, the hydration seed, and the string runtime that a
module compiled for the server calls into.

Most applications never import this directly. `@barqjs/router` renders through
it, and `@barqjs/start` builds the server that drives it. Reach for it when you
render barq to HTML without the router.

## Install

```bash
bun add @barqjs/server @barqjs/core
bun add -d @barqjs/vite
```

## A streamed page

```tsx
// App.tsx
import { Loading, createMemo } from "@barqjs/core";

export function App() {
  const user = createMemo(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return "salama";
  });
  return (
    <html lang="en">
      <body>
        <Loading fallback={<p>loading</p>}>
          <p>hello {user()}</p>
        </Loading>
      </body>
    </html>
  );
}
```

```tsx
// server.tsx
import { renderToStream } from "@barqjs/server";

import { App } from "./App.tsx";

export default {
  fetch(): Response {
    const stream = renderToStream(() => <App />);
    return new Response(stream.readable, { headers: { "content-type": "text/html" } });
  },
};
```

Both files go through `barq()` from `@barqjs/vite` in an SSR build, which
compiles them for the string backend. The first bytes are the shell with the
`Loading` fallback in place. When the memo settles the same response carries a
`<template>` with `<p>hello salama</p>` and the script that swaps it in.

## Rendering

The entry points are Solid 2.0's, under its names and options:

```ts
import { renderToStream, renderToString } from "@barqjs/server";

const html = renderToString(() => <App />, { nonce });

const stream = renderToStream(() => <App />, {
  nonce,
  onCompleteShell: ({ write }) => write('<script type="module" src="/entry.js"></script>'),
  onError: (error, { handling }) => console.error(handling, error),
});
new Response(stream.readable); // or stream.pipe(res), or stream.pipeTo(writable)

const settled = await renderToStream(() => <App />); // the settled document
```

- **`renderToString(fn, options)`** renders synchronously. A pending async value
  renders its `Loading` fallback. What did resolve is seeded before `</body>`
  unless `noScripts` is set, so the client does not fetch it again.
- **`renderToStream(fn, options)`** renders the shell synchronously, so a shell
  that throws throws here, after `onError` heard it with `handling: "failed"`.
  The result is consumed exactly one way: `readable`, `pipe`, `pipeTo`, or
  `await`. Awaiting resumes every boundary in place rather than buffering the
  stream, so the settled document carries no placeholders or swap scripts.
- **Shared options:** `nonce` (a string, or `{ script, style }`), `renderId` to
  namespace the ids a render writes, `noScripts`, `plugins` (serialization
  adapters for one render), `onError`, `onHead` (the collected head markup, for
  a document with no `</head>`) and `manifest` (the assets each `lazy()` module
  needs).
- **Stream options:** `onCompleteShell({ write })` and `onCompleteAll({ write })`,
  `signal` to abort, and `timeout`, how long one boundary may stay parked before
  it is abandoned to its fallback.
- **`generateHydrationScript()` and `<HydrationScript />`** are the
  input-capture bootstrap for a hand-built document. They carry no render's
  data: a render's seed travels only with that render.

`renderToStringAsync` remains for older callers. Solid 2.0 removed it in favour
of `await renderToStream(...)`, which returns the same document with its seed.

## The request

Re-exported from `@barqjs/core`, so a component can use them without importing
a server package:

- **`getRequestEvent()`** returns the current `{ request, locals, response }`,
  or `undefined` outside a request and in the browser.
- **`httpStatus(code, text?)`** and **`httpHeader(name, value, { append })`**
  declare the response status and headers for as long as the calling scope
  lives. A declaration made after the head was sent is reported as
  `LATE_HEADER_WRITE` rather than lost silently.
- **`markSafeError(error)`** lets an error reach the browser as thrown in a
  production build too, where every other error is replaced with a generic one.
- **`useHead(tags)`** (from `@barqjs/core`) declares head tags from wherever a
  component renders. Tags declared while the shell renders go into its
  `<head>`, and tags declared by a boundary that resumes later stream as a
  patch.

`provideRequestEvent(event, fn)` from `@barqjs/server/storage` runs `fn` with
`event` as the current request across every `await`. It is its own entry
because it imports `node:async_hooks`. `@barqjs/start` calls it for you.

## Serialization

Values cross to the client through [seroval](https://github.com/lxsmnsyc/seroval),
so a `Date`, a `Map` or a cycle survives, and reconstruction evaluates nothing.
A class of your own needs an adapter, TanStack's four fields under their names:

```ts
import { createSerializationAdapter, registerSerializationAdapters } from "@barqjs/server/codec";

class Money {
  constructor(readonly cents: number) {}
}

registerSerializationAdapters([
  createSerializationAdapter({
    key: "money",
    test: (value): value is Money => value instanceof Money,
    toSerializable: (money) => money.cents,
    fromSerializable: (cents: number) => new Money(cents),
  }),
]);
```

A keyed async value is written into the payload the moment its flight starts,
as a promise, so a client read that misses finds something to await rather
than a hole.

## How streaming works

An unready `Loading` boundary flushes `<!--[b:7-->fallback<!--]-->` plus a
continuation record, the Block and its scope. When its promises settle the
server flushes a `<template>` and, in one script, the swap and the values the
content read. The Block is re-invocable with its scope, so there is no second
code path for a resumed boundary to diverge along.

A client may hydrate while the stream is open. A boundary hydrated on its
fallback is asked before a swap replaces it, and claims the nodes the swap
places when its values arrive.

The shell is one ordinary string render with a sink installed. There is no
second render of the page.

## The hydration wire

Under `hydratable`, the string backend writes a range around a position the
client cannot otherwise measure, and the DOM backend walks a logical index that
steps over exactly those ranges. Both halves of one deployment must be built the
same way. A mismatch is detected at run time and degrades to a full client
render rather than to a wrong tree.

What is written is what recovery needs and nothing else. Writing a comment at
every position was reversed on a measurement (the comments cost 55.7% raw and
7.3% gzipped on a 100-row page), so a hole that owns its parent's child list
gets none, and a row of an `each` gets none. Rows are built in order and each
claims from the list's cursor, so its extent is what it consumed.

Detection is a separate axis. A dev build also spells the key a branch chose
into its open comment. That is the one fact the client cannot re-derive
(re-evaluating the condition may read data the client has not been seeded with)
and the one thing recovery does not need. A production page pays for the range
and not for the key.

## Two backends, one ABI

`ssr.ts` is the string backend a compiled module calls: every function in it
builds bytes, and a module compiled entirely this way renders with no
`document` in scope. `server.ts` renders anything still built as DOM (a
hand-written `createElement` tree, or a component from a module the compiler
never saw) through a DOM such as happy-dom's `GlobalRegistrator`.
`renderToString` accepts both.

`branch`, `each`, `boundary` and `portal` are exported here under the names
`@barqjs/core` exports them under, with the same argument order. The compiler
emits the same call for both backends and chooses between them by choosing the
import source, which is why a string-compiled module imports from here and from
nowhere else.

`esc`, `escAttr` and `html` are the escaping primitives the compiler emits
around. `html` brands a string as already safe, and `esc` passes such a value
through untouched and escapes everything else, so a nested render composes
without double escaping.
