# @barqjs/server

The string backend: the runtime a module compiled for the server calls into, and
the streaming loop above it.

```bash
bun add @barqjs/server
```

Most applications never import this directly. `@barqjs/router` renders through
it, and `@barqjs/start` builds the server that drives it. Reach for it when you
are rendering barq to a string without the router.

## Two strategies, one entry point

`ssr.ts` is the string backend a compiled module calls: every function in it
builds bytes, and a module compiled entirely this way renders with no `document`
in scope at all. `server.ts` is the happy-dom path that renders anything still
built as DOM — a hand-written `createElement` tree, or a component from a module
this compiler never saw.

`branch`, `each`, `boundary` and `portal` are exported here under the names
`@barqjs/core` exports them under, with the same argument order. One ABI, two
implementations: the compiler emits the same call for both backends and chooses
between them by choosing the import SOURCE, which is why a string-compiled
module imports from here and from nowhere else.

## Rendering

Solid 2.0's entry points, under its names and options:

```ts
import { renderToStream, renderToString } from "@barqjs/server";

const html = renderToString(() => App(), { nonce }); // synchronous, with its seed
const stream = renderToStream(() => App(), { nonce, onCompleteShell, onCompleteAll });
new Response(stream.readable); // or stream.pipe(res), stream.pipeTo(writable)
const settled = await renderToStream(() => App()); // the settled document
```

`renderToStream` renders the shell synchronously, so a shell that throws throws
here, after `onError` heard it with `handling: "failed"`. Exactly one consumer
may claim the result. `then` resumes every boundary in place rather than
buffering the stream, so the settled document carries no placeholders or swap
scripts for data that was fully known.

`nonce` is a string or `{ script, style }`. `noScripts` drops the seed and the
input capture, `plugins` adds serialization adapters for one render, and
`renderId` namespaces the ids a render writes. `generateHydrationScript()` and
`<HydrationScript />` are the input-capture bootstrap for a hand-built
document; a render's data travels only with that render.

## Streaming

An unready `Loading` boundary flushes `<!--[b:7-->fallback<!--]-->` plus a
continuation record — the Block and its scope — and when its promises settle the
server flushes a `<template>` and, in one script, the swap and the values the
content read. The Block is re-invocable with its scope, so there is no second
code path for a resumed boundary to diverge along.

A client may hydrate while the stream is open: a boundary hydrated on its
fallback is asked before a swap replaces it, and claims the nodes the swap
places when its values arrive. `onCompleteShell({ write })` is where an `async`
module entry goes, after the shell's seed and swap.

The shell is one ordinary string render with a sink installed. There is no
second render of the page.

## The hydration wire

Under `hydratable`, the string backend writes a range around a position the
client cannot otherwise measure, and the DOM backend walks a logical index that
steps over exactly those ranges. Both halves of one deployment must be built the
same way; a mismatch is detected at run time and degrades to a full client
render rather than to a wrong tree.

What is written is what RECOVERY needs and nothing else. Writing a comment at
every position was reversed on a measurement — the comments cost 55.7% raw and
7.3% gzipped on a 100-row page — so a hole that owns its parent's child list
gets none, and a row of an `each` gets none: rows are built in order and each
claims from the list's cursor, so its extent is what it consumed.

DETECTION is a separate axis. A dev build additionally spells the key a branch
CHOSE into its open comment, which is the one fact the client cannot re-derive
(re-evaluating the condition may read data the client has not been seeded with)
and the one thing recovery does not need. A production page pays for the range
and not for the key.

## The seed channel

A keyed async value is written into the payload the MOMENT its flight starts, as
a promise, so a client read that misses finds something to await rather than a
hole. Values go over the wire through [seroval](https://github.com/lxsmnsyc/seroval),
so a `Date`, a `Map` or a cycle survives, and reconstruction evaluates nothing.

## Escaping

`esc`, `escAttr` and `html` are the primitives the compiler emits around. `html`
brands a string as already-safe; `esc` passes such a value through untouched and
escapes everything else, so a nested render composes without double-escaping.

`serializeNode` is the declared bridge in the other direction: a module that
fell back to the DOM backend hands a string-compiled caller real nodes, and they
reach the wire as the markup they already are.
