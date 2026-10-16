# @barqjs/start

Server functions, middleware, the request context, sessions, cookies, rate
limiting, and the server the build emits. A server function is a typed `GET` or
`POST` endpoint you call like a function. A `GET` call needs barq's `x-barq-fn`
header and passes an origin check. A production server sends a thrown error's
message only when it was marked with `markSafeError`. With `verify` on, the
build refuses to ship a route whose server functions skip its middleware. The API follows TanStack Start's design:
`createServerFn`, `createMiddleware`, `createStart`, `useSession`, and the
request helpers under their names.

## Install

```bash
bun add @barqjs/start
bun add -d @barqjs/vite vite
```

`bun create barq` installs it for you. This document is the reference for what
that project uses. Routing, the document and API routes are in
[@barqjs/router](../router/README.md).

## Example

The smallest server function, and a call to it:

```tsx
import { createServerFn } from "@barqjs/start";

export const serverTime = createServerFn().handler(() => new Date());

const at = await serverTime(); // a Date, fetched from the server
```

## Coming from TanStack Start

`createServerFn` with `GET` as the default method, `.validator`, `.middleware`,
`.handler`, `createMiddleware` with `.server` and `.client` halves,
`createStart` with request and function middleware, `redirect`, `notFound`,
`useSession` and the request helpers follow TanStack Start under their names.
What barq adds is the build-time route-action check (`verify`), the wire-type
check on results, and the `x-barq-fn` header on `GET` calls.

## Server functions

```ts
import { createServerFn } from "@barqjs/start";

export const createPost = createServerFn({ method: "POST" })
  .validator(PostSchema) // any Standard Schema, such as zod, valibot or arktype
  .handler(async ({ data, context, signal }) => db.posts.insert(data));
```

`.validator` is TanStack's name for it. `.inputValidator`, the name their
release candidates used, is the same method and is accepted so code written
against them keeps working. It takes a Standard Schema, a function that returns
the validated value or throws, or an object with a `parse`. The caller passes
the schema's INPUT and the handler is handed its OUTPUT, so a schema that turns
an ISO string into a `Date` is called with a string. A function validator's
parameter type is what the caller passes:

```ts
export const byId = createServerFn()
  .validator((input: { id: string }) => ({ id: Number(input.id) }))
  .handler(({ data }) => db.users.find(data.id)); // data: { id: number }

await byId({ data: { id: "41" } }); // { id: 41 } is a type error
```

A function handed a form receives the `FormData` itself.

Call it like a function. It is an HTTP endpoint:

```tsx
const post = await createPost({ data: { title: "Hello" } });
```

The compiler replaces this module's exports with client stubs that call
`/_barq/fn/<id>`, so the handler's body, and the database driver it imports,
is in no client chunk. The id is `<project-relative module>#<export>`, derived
once and used by both halves, because deriving it twice is how the two drift
into a call that reaches nothing.

**A function with no validator accepts no argument.** That is the safe default:
opening the input is a decision you make per function. `.validator("unchecked")`
takes anything.

### GET and POST

`GET` is the default, as it is TanStack's. A function that writes declares
`POST`, which is also the only method a form can reach:

```ts
export const listNotes = createServerFn() // GET
  .middleware([requireSession])
  .handler(({ context }) => {
    setResponseHeader("cache-control", "private, max-age=60");
    return notesOf(context.user);
  });
```

The call is the same either way. A `GET` call carries its payload in
`?payload=`, so one input is one URL, and a long input belongs in a `POST`.
`method` must be a literal, since the compiler reads it to write the stub; a
value it cannot read is taken as the default. Nothing is cached unless the
handler says so: an answer carries no `cache-control` and no `Vary` of its own, which is
TanStack's behaviour too.

A link still cannot reach a `GET` function, so one that writes and forgot to
say `POST` is not a one-click CSRF carrying `SameSite=Lax` cookies. Every `GET`
call carries an `x-barq-fn` header, which a link, an `<img>`, a prefetch or a
navigation cannot set, and the server answers a `GET` without it with a 403. A
script on another site that sets it is preflighted, and the origin check
refuses it either way. A function answers its own method only (a `POST` to a
`GET` function is a 405, and the reverse), a `GET` function has no form channel, and a
payload longer than `maxBodySize` is a 413. Keep `public` out of `cache-control`
for anything that reads a session: a shared cache would hand one user's answer to
the next.

A call takes three options beside `data`:

```ts
const controller = new AbortController();
await createPost({
  data: { title: "Hello" },
  signal: controller.signal, // cancels the fetch; the handler's `signal` follows the request
  headers: { "x-trace": id }, // wins over a client middleware's `next({ headers })`
  fetch: tracedFetch, // in place of the global one
});
```

A `Response` a middleware, a validator or the handler throws
(`throw new Response("sign in first", { status: 401 })`) is what the call
rejects with, as in TanStack: its status, headers and body are the author's
words to the caller. Any other failure rejects with `ServerFnError`, carrying
the `status`, the server's `response`, and `issues` when the validator refused
the input. A handler's own error is answered with one fixed line and nothing
else, so a thrown `Error`'s message never leaves the server. A development
server also sends `thrown`, the error's name, message and stack; production
leaves it `undefined`.

`throw redirect({ to, params, search, hash, replace, reloadDocument, href })`
and `throw notFound({ data, routeId })` from a handler reach the caller with
everything they said, and their `headers` leave on the response. `useServerFn`
from `@barqjs/router` navigates on the redirect. A redirect whose `params` or
`search` is a function cannot cross and arrives as its resolved target alone.

`fn.url` is the address `<form action={fn}>` posts to, `fn.method` the method it
answers, and `fn.serverFnMeta.id` (also `fn.meta.id`) the id it is mounted at.
A handler is handed the same two beside `data`, `context` and `signal`:

```ts
createServerFn().handler(({ method, serverFnMeta }) => `${method} ${serverFnMeta.id}`);
```

`json(payload, init)` builds a JSON `Response`, for a handler that answers with
one.

### What crosses the wire

A handler's result and a validator's input are checked against what the codec
carries, so a value it would refuse at runtime is a type error where it is
written, naming where:

```ts
createServerFn().handler(() => ({ user: { format: () => "x" } }));
// ... { readonly "cannot cross the wire": "the result.user.format is a function" }
```

Primitives, `bigint`, `Date`, `Error`, `Map`, `Set`, `Promise`, typed arrays and
plain objects cross; a function, a symbol, a `RegExp`, a `URL`, a `Blob` and an
instance of a class with methods do not. A form crosses as a `POST`'s input. A
class with no methods is a plain object to a type and is refused by the codec
at runtime only. `createServerFn({ strict: false })` turns the check off, and
`strict: { input: false }` or `strict: { output: false }` one side of it, for a
class a `createSerializationAdapter` carries.

### Static server functions

```ts
import { staticFunctionMiddleware } from "@barqjs/start/client";

export const buildInfo = createServerFn({ method: "GET" })
  .middleware([staticFunctionMiddleware])
  .validator((input: { page: string }) => input)
  .handler(({ data }) => ({ page: data.page, builtAt: new Date() }));
```

While the build prerenders, each call writes its result to
`/_barq/static/<key>.json` in the client output, one file per function and
input. Reordering the input's keys gives the same file. In the browser the call reads
that file first and goes to the server only when there is none, so a page
prerendered whole works from a host that serves files and nothing else.

Import it from `@barqjs/start/client`, the subpath the client stub already
imports from: a chain naming anything from another package is not carried into
the browser. List it last, since the key is the input as it sees it. Only the
result is stored: a `sendContext` is not, and a `Response`, a stream or a result
of `undefined` is never written. Two calls whose keys collide stop the build.

### Streaming

A handler that returns an async generator, or a `ReadableStream` of values,
answers over time. The caller reads an async iterable of the same values:

```ts
export const ticks = createServerFn().handler(async function* () {
  for (const row of await rows()) yield { row, at: new Date() };
});

for await (const { row, at } of await ticks()) render(row, at);
```

Leaving the loop early stops the generator. A failure after the first value ends
the iterable with a `ServerFnError`.

### With JavaScript off

```tsx
<form action={createPost}>
  <input name="title" />
  <button type="submit">post</button>
</form>
```

`action={fn}` writes the endpoint and `method="post"` together, and the handler
receives a real `FormData`. The same function sees the same input type whether
or not JS ran, which is the divergence progressive enhancement exists to
prevent.

## Middleware, and the check the build runs

```ts
import { createMiddleware, createServerFn, useSession } from "@barqjs/start";

export const requireSession = createMiddleware().server(async ({ next }) => {
  const session = await useSession<{ user: string }>(sessionConfig);
  if (session.data.user === undefined) throw new Response("sign in first", { status: 401 });
  return next({ context: { user: session.data.user } });
});

export const adminStats = createServerFn()
  .middleware([requireSession])
  .handler(({ context }) => stats(context.user)); // context.user: string
```

What a middleware passes to `next({ context })` is TYPED into everything after
it: the handler's `context`, the `context` of a middleware that lists it in its
own `.middleware([...])`, and a route handler's under `server.middleware`. A key
no typed step declared still reads, as `unknown`. A bare closure states what it
adds, and is checked against it:

```ts
const tenant: Middleware<{ tenant: string }> = async (next) => next({ context: { tenant } });
```

A middleware's `.validator()` types its own `data` and, when the function has
none of its own, the handler's and the caller's. A client half's `next()` takes
`headers`, `sendContext` and `fetch`; the call's own `headers` and `fetch` win
over a middleware's, and a later middleware's over an earlier one's. What a
client half sends arrives on the server as `clientContext`, untyped on purpose:
it is whatever the caller chose to send.

A middleware ends in `return next(...)`, answers with a result of its own (a
`Response` included), or throws. Returning `undefined` is neither: without
`next()` the call would have no answer, and after it the handler's result would
be lost. Either way the call fails with an error naming the middleware (its
function's name when it has one), its place in the chain and the server
function, as TanStack's does. A returned `redirect()` or `notFound()` is thrown
as the answer it describes. A middleware's halves are also handed `method` and
`serverFnMeta`.

A server function in the list stands for the middleware it declared, as in
TanStack: `.middleware([whoami])` runs `whoami`'s guards, typed, and never its
handler. A second `.middleware([...])` call adds to the chain.

Middleware runs BEFORE validation, deliberately: an unauthenticated caller
should be refused without the server parsing its payload, and a rejection that
depended on well-formed input is one an attacker skips by sending malformed
input. A middleware refuses by THROWING a `Response`.

Declare the same closure on the route, and the build checks the two agree:

```ts
// vite.config.ts
barq({ ssr: true, start: { verify: true } });

// src/routes/admin.tsx
export const Route = createFileRoute("/admin")({ middleware: [requireSession] });
```

A server function is its own HTTP endpoint, so a guard on the route that
renders it does not run when the function is called directly. Next.js and
TanStack both document that gap and leave it to the author. `vite build` walks
the client module graph from each route to the functions it can reach, and fails
naming the route, the function, and how much of the chain is missing.

It VALIDATES AND REJECTS, never redispatches. Re-running a mis-routed action
under the owning route's middleware executes it in a different request context.
The deeper reason: a client-supplied route selecting a middleware chain lets the
caller pick the weakest chain that reaches the action.

The chain is compared by reference identity. `Middleware` is an anonymous
closure with no build-visible name, and every attempt to read `.middleware([…])`
out of source dies on the shapes people write: `[m]`, `[...chain]`,
`chain.filter(Boolean)`.

## The request context

```ts
import { getRequest, getRequestHeader, setCookie, setResponseHeader } from "@barqjs/start";
```

These read an ambient request, so a loader, a route handler, a server function
and a middleware all reach it the same way. It is an `AsyncLocalStorage` and not
a module variable: two requests are in flight at once on any real server, and a
module variable hands one request's session to another. That has shipped
elsewhere as cross-user data disclosure.

`setCookie` and `deleteCookie` default to `path: "/"`. A browser would otherwise
scope the cookie to `/_barq/fn`, the directory of the URL that set it, and no
page would receive it. `appendResponseHeader` adds to a list header such as
`Vary`, where `setResponseHeader` replaces.

`setResponseHeader` and `setCookie` write to a DRAFT, because the response is
built after the handler returns and a streamed response is handed back before
its body exists. The draft rides an error out too, so a middleware that rotated
a session cookie and then refused does not lose the rotation.

## Sessions

```ts
import { type SessionConfig, useSession } from "@barqjs/start";

const sessionConfig: SessionConfig = {
  password: process.env.SESSION_PASSWORD!, // at least 32 characters
  cookie: { secure: true },
};

const session = await useSession<{ user: string }>(sessionConfig);
session.data.user;
const next = await session.update({ user: "salama" });
```

A sealed cookie with no store behind it: AES-GCM through WebCrypto, so no
dependency and no encrypt-then-MAC composition to get wrong.

`session.data` is READ-ONLY and `update()` returns a NEW manager. The handle you
already hold is deliberately unchanged, so nothing can read a half-applied
session.

The expiry is enforced on UNSEAL as well as on the cookie, because a cookie's
own expiry is a request the client is free to ignore.

The cookie's NAME is under the seal. Two sessions sharing a password (`name:
"barq-session-admin"` beside the default) are two sessions: a value issued under
one name does not open under the other. Envelopes start `b2.`; a `b1.` cookie
from an older release opens until it expires, under any name, and is sealed as
`b2` the next time the session is updated.

The password is a KEY: anyone holding it can mint a session for any user.
Rotating it logs everyone out, which is the intended way to do that.

## Rate limiting

```ts
import { byIP, createServerFn, memoryStore, rateLimit } from "@barqjs/start";

const limit = rateLimit({
  limit: 30,
  windowMs: 60_000,
  key: byIP(),
  store: memoryStore(),
});

export const login = createServerFn({ method: "POST" })
  .middleware([limit])
  .validator(LoginSchema)
  .handler(({ data }) => signIn(data));
```

`rateLimit` returns a middleware, so the same value guards a server function or
a route's `server.middleware`. It runs before validation. Past the limit it
throws a 429 with `Retry-After`, or what `onLimit(info)` returns. A store that
throws lets the request through and logs the error, because a limiter that
refuses everything while its store is down has become the outage.

Build it ONCE at module scope. The store is the state, and a fresh one per
request counts to one forever. A store is one atomic method,
`hit(key, windowMs)`, returning `{ count, resetAt }`; Redis does it with `INCR`
and `PEXPIRE`.

Neither `key` nor `store` has a default, and that is the point:

- Keying by IP is right for a public endpoint and wrong for an authenticated
  one behind a corporate NAT, where it limits a building as though it were one user.
  Key by user id where there is one. Returning `null` exempts the caller.
- `memoryStore()` is correct for a single instance and wrong behind a load
  balancer, where three instances permit three times the limit.

`byIP()` does not trust `X-Forwarded-For` unless you ask, because a caller who
can set that header picks their own bucket. There are two ways to ask:

- `byIP({ xForwardedFor: true })` reads the leftmost entry. That is the client
  only when your edge proxy OVERWRITES the header. Behind one that appends, the
  leftmost entry is whatever the caller sent.
- `byIP({ xForwardedFor: { trustedProxies: 1 } })` counts from the right: the
  entry the nth proxy you run wrote. A forged prefix is never read, and a
  header with fewer entries than proxies is ignored.

### Global middleware

`src/start.ts` declares what runs for the whole application:

```ts
import { createMiddleware, createStart } from "@barqjs/start";

const logging = createMiddleware({ type: "request" }).server(
  async ({ next, request, pathname }) => {
    const started = performance.now();
    const response = await next({ context: { requestId: crypto.randomUUID() } });
    log(request.method, pathname, performance.now() - started);
    return response;
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [logging], // every page, route handler and server function
  functionMiddleware: [requireSession], // every server function, ahead of its own chain
  serializationAdapters: [money], // a type only the application knows, both ways
  serverFns: { fetch: tracedFetch }, // every call, unless a middleware or the call names one
  defaultSsr: "data-only", // every route that says nothing about `ssr`
}));
```

`createSerializationAdapter({ key, test, toSerializable, fromSerializable })`
makes an adapter. The ones named here are installed the first time the options
are read, which the server does before it answers anything and the browser
before it reads the page's seed. `defaultSsr` wins over the router's own, on
both sides.

The order is global request, global function, then the function's own. What a
request middleware passes to `next({ context })` starts every server function's
`context`, reaches a route handler's, and is `getGlobalStartContext()` anywhere
in the request. A `{ type: "function" }` middleware may have a `.client()` half,
which runs in the browser around every call.

A global request middleware runs after a call has passed the method, origin and
id checks, and before its body is read, so a forged request reaches none of it.

Register the instance and what the global middleware adds is typed too, in every
handler's `context` and in `getGlobalStartContext()` (each key optional there,
since it can be called outside a request):

```ts
declare module "@barqjs/start" {
  interface Register {
    start: typeof startInstance;
  }
}
```

### With Solid's async primitives

A server function returns a promise, so it is what an async memo reads and what
an `action` yields:

```tsx
const notes = createMemo(async () => listNotes());
const [guesses, setGuesses] = createOptimistic<readonly Note[]>([]);

const add = action(function* (text: string) {
  setGuesses((list) => [...list, { id: -1, text }]); // shown at once, dropped when this settles
  yield addNote({ data: { text } });
  refresh(notes); // the real row arrives with the refreshed list
});
```

On the server the memo's call is in-process and its answer seeds the page, so
the browser does not ask again until `refresh`.

## Subpaths

- `@barqjs/start`: the isomorphic surface. `createServerFn`, `createMiddleware`,
  `createStart`, the request context, sessions, cookies, rate limiting.
- `@barqjs/start/client`: the RPC stub the compiler emits, and
  `staticFunctionMiddleware`.
- `@barqjs/start/server`: `handleServerFn`, `mount`, the origin check.
- `@barqjs/start/serve`: `serveBarq`, `createFetchHandler`, the asset
  middleware.
- `@barqjs/start/prerender`: the prerenderer, for a custom build.
- `@barqjs/start/middleware` and `@barqjs/start/env`: the middleware runner and
  the one-side functions, split out so the client stub can import them without
  reaching `node:async_hooks`. The compiler emits these; import from
  `@barqjs/start` instead.
- `@barqjs/start/protocol`: the server-entry contract router and vite share.
  Not public API.

## The build and the server

The Vite side is `@barqjs/vite`, one plugin for the compiler, the file routes
and this package's build:

```ts
import barq from "@barqjs/vite";

barq({ ssr: true, start: { prerender: { routes: ["/"] } } }); // server-rendered
barq({ start: true }); // an SPA: `index.html` is the document, the server keeps the RPC
```

`start` is what this package adds: server functions and API routes, the dev
server's page and function middleware, `vite preview`, and a `vite build` that
builds the client and then the server. `ssr` decides whether the server renders
pages, and with them whether both halves compile hydratable.

`vite build` emits two directories:

```
dist/client/    the browser bundle, plus every prerendered page
dist/server/
  server.js     importable; default-exports the handler and serves nothing
  serve.js      runnable: `bun dist/server/serve.js`
  index.js      `{ fetch }` over server functions and pages, for a host
```

They are two files because `bun <file>` auto-serves any default export carrying
a `fetch`, so one entry that both exported the handler and started a server
would bind the port twice. It also keeps a `serve()` out of the module `vite
build` imports to prerender.

`serve.js` answers in this order: static assets from a manifest the build wrote,
then server functions, then the page handler. The static lookup costs 0.33 µs
per request against the 0.75 µs a `statSync` costs, and a prerendered page keeps
the status it was rendered as.

`vite preview` serves `dist/client` and sends everything else through
`index.js`, so it runs what a deployment runs.

A plugin that owns the `ssr` environment, such as `@cloudflare/vite-plugin` or
Nitro, runs the server half itself. The dev server then leaves pages and server
functions to that plugin's runtime, which imports the `index` input the way a
deployment does, and a host that orchestrates `vite build` builds the server
after barq has built the client. `prerender` and `verify` import the server
bundle barq builds, so under such a host they do not run, and the build says so.

Prerendering takes three more options:

```ts
barq({
  ssr: true,
  start: {
    prerender: {
      routes: ["/", "/404"],
      retryCount: 2, // ask again after a throw or a 5xx; a 4xx is an answer
      retryDelay: 500, // ms between attempts
      sitemap: { host: "https://example.com" }, // outputPath defaults to sitemap.xml
    },
  },
});
```

The sitemap lists every page written with a 2xx, sorted. A page prerendered at
`/404` is left out of it and is also written to `404.html` at the root, the name
a static host serves for a path it has no file for.

SPA mode renders the pages in the browser from one shell:

```ts
barq({
  ssr: true,
  start: { spa: { enabled: true, maskPath: "/", prerender: { outputPath: "/_shell.html" } } },
});
```

`ssr` stays on: the server renders the shell and the client hydrates it.

The build renders the root route once, with nothing under it, and writes that
document. The server then renders no pages: a navigation nothing else answers
gets the shell, and server functions and route handlers answer as before.

Under `static`, a name the build hashed (everything it emitted under
`build.assetsDir`) is answered `max-age=31536000, immutable`. A file with a
stable name, and every prerendered page, gets an `ETag` and a 304 instead.

Behind a proxy that terminates TLS, tell the generated server so, or the origin
check sees `http://` where the browser said `https://` and refuses every server
function:

```ts
barq({
  ssr: true,
  start: {
    server: {
      trustProxy: "loopback", // or true, or the proxy addresses
      allowedOrigins: ["https://admin.example.com"], // beyond the server's own
    },
  },
});
```

### Functions for one side

```ts
import { createClientOnlyFn, createIsomorphicFn, createServerOnlyFn } from "@barqjs/start";

const readConfig = createServerOnlyFn(() => process.env.API_TOKEN);
const storage = createClientOnlyFn(() => localStorage);
const now = createIsomorphicFn()
  .server(() => "server")
  .client(() => "browser");
```

The compiler replaces these calls in each bundle. `createServerOnlyFn` keeps its
body in the server build and becomes a throwing stub in the browser, so a secret
cannot reach the client even as dead code. `createClientOnlyFn` is the mirror.
`createIsomorphicFn` keeps one half per bundle, and a half that is not declared
is a no-op. Uncompiled code, such as a `bun test`, gets the server half.

### Server-only and client-only files

`db.server.ts` is for what must not leave the server, `chart.client.ts` for what
cannot run there. `vite build` fails when code from a `.server.` file is in a
browser chunk or code from a `.client.` file is in the server bundle, naming the
file and what imported it. It reads the rendered bundle, so a `.server.` import
used only inside `createServerOnlyFn`, or a module whose exports are server
functions, is not a violation. `start: { importProtection: false }` turns it off.

`import "server-only"` and `import "client-only"` mark a module the same way at
the import itself: `@barqjs/vite` fails the build where the browser bundle
imports `server-only` or the server bundle imports `client-only`, naming the
importer. Add `/// <reference types="@barqjs/vite/boundary-modules" />` for
their types.

Deployment goes through [srvx](https://github.com/h3js/srvx), so Node, Bun, Deno
and Cloudflare take the same entry.

### Entry files are optional

`src/entry-client.tsx` and `src/entry-server.tsx` are overrides. The defaults
are two lines each and the plugin supplies them; nothing in an application names
a `virtual:` or `#`-prefixed specifier.
