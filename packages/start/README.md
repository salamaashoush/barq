# @barqjs/start

Server functions, the request context, sessions, cookies, rate limiting, and the
server the build emits.

```bash
bun add @barqjs/start
```

Normally installed for you by `bun create barq`. This document is the reference
for what that project uses.

## Server functions

```ts
import { createServerFn } from "@barqjs/start";

export const createPost = createServerFn()
  .validator(PostSchema) // any Standard Schema: zod, valibot, arktype
  .handler(async ({ data, context, signal }) => db.posts.insert(data));
```

Call it like a function. It is an HTTP endpoint:

```tsx
const post = await createPost({ data: { title: "Hello" } });
```

The compiler replaces this module's exports with client stubs that POST to
`/_barq/fn/<id>`, so the handler's body — and the database driver it imports —
is in no client chunk. The id is `<project-relative module>#<export>`, derived
once and used by both halves, because deriving it twice is how the two drift
into a call that reaches nothing.

**A function with no validator accepts no argument.** That is the safe default:
opening the input is a decision you make per function. `.validator("unchecked")`
takes anything.

**POST only.** `createServerFn({ method: "GET" })` is a type error and a runtime
refusal that says why: a mutation reachable by navigation is a link that mutates,
and it has shipped that way elsewhere as a one-click CSRF carrying `SameSite=Lax`
cookies.

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
import { type Middleware, createServerFn, useSession } from "@barqjs/start";

export const requireSession: Middleware = async (next) => {
  const session = await useSession<{ user: string }>(sessionConfig);
  if (session.data.user === undefined) throw new Response("sign in first", { status: 401 });
  return next({ context: { user: session.data.user } });
};

export const adminStats = createServerFn()
  .middleware([requireSession])
  .handler(({ context }) => stats(context.user));
```

Middleware runs BEFORE validation, deliberately: an unauthenticated caller
should be refused without the server parsing its payload, and a rejection that
depended on well-formed input is one an attacker skips by sending malformed
input. A middleware refuses by THROWING a `Response`.

Declare the same closure on the route, and the build checks the two agree:

```ts
// vite.config.ts
barqStart({ verify: { reachability: () => reachability } });

// src/routes/admin.tsx
export const Route = createFileRoute("/admin")({ middleware: [requireSession] });
```

**This closes the hole every framework in the field documents instead.** A
server function is its own HTTP endpoint; a guard on the route that renders it
does not run when the function is called directly. Next.js says so in as many
words, and TanStack says it three times in their own docs. `vite build` walks
the client module graph from each route to the functions it can reach, and fails
naming the route, the function, and how much of the chain is missing.

It VALIDATES AND REJECTS, never redispatches. Re-running a mis-routed action
under the owning route's middleware executes it in a different request context,
and — the deeper reason — a client-supplied route selecting a middleware chain
lets the caller pick the weakest chain that reaches the action.

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
module variable hands one request's session to another — which has shipped
elsewhere as cross-user data disclosure.

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
const next = await session.update({ user: "ada" });
```

A sealed cookie with no store behind it: AES-GCM through WebCrypto, so no
dependency and no encrypt-then-MAC composition to get wrong.

`session.data` is READ-ONLY and `update()` returns a NEW manager. The handle you
already hold is deliberately unchanged, so nothing can read a half-applied
session.

The expiry is enforced on UNSEAL as well as on the cookie, because a cookie's
own expiry is a request the client is free to ignore.

The password is a KEY: anyone holding it can mint a session for any user.
Rotating it logs everyone out, which is the intended way to do that.

## Rate limiting

```ts
import { byIP, memoryStore, rateLimit } from "@barqjs/start";

const limit = rateLimit({
  limit: 30,
  windowMs: 60_000,
  key: byIP(),
  store: memoryStore(),
});
```

Build it ONCE at module scope. The store is the state, and a fresh one per
request counts to one forever.

Neither `key` nor `store` has a default, and that is the point:

- Keying by IP is right for a public endpoint and wrong for an authenticated one
  behind a corporate NAT, where it limits a building as though it were one user.
  Key by user id where there is one. Returning `null` exempts the caller.
- `memoryStore()` is correct for a single instance and wrong behind a load
  balancer, where three instances permit three times the limit.

`byIP()` does not trust `X-Forwarded-For` unless you ask, because a caller who
can set that header picks their own bucket.

## The build and the server

```ts
import { barqStart } from "@barqjs/start/vite";

barqStart({
  compiler: { hydratable: true, routes: () => routes },
  prerender: { routes: ["/"] },
  pages: false, // an SPA: this plugin keeps the RPC and drops the document
});
```

`vite build` emits two directories:

```
dist/client/    the browser bundle, plus every prerendered page
dist/server/
  server.js     importable; default-exports the handler and serves nothing
  serve.js      runnable: `bun dist/server/serve.js`
```

They are two files because `bun <file>` auto-serves any default export carrying
a `fetch`, so one entry that both exported the handler and started a server
would bind the port twice. It also keeps a `serve()` out of the module `vite
build` imports to prerender.

`serve.js` answers in this order: static assets from a manifest the build wrote,
then server functions, then the page handler. The static lookup costs 0.33 µs
per request against the 0.75 µs a `statSync` costs, and a prerendered page keeps
the status it was rendered as.

Deployment goes through [srvx](https://github.com/h3js/srvx), so Node, Bun, Deno
and Cloudflare take the same entry.

### Entry files are optional

`src/entry-client.tsx` and `src/entry-server.tsx` are overrides. The defaults
are two lines each and the plugin supplies them; nothing in an application names
a `virtual:` or `#`-prefixed specifier.

## Subpaths

| import                    | where it runs                                                            |
| ------------------------- | ------------------------------------------------------------------------ |
| `@barqjs/start`           | the isomorphic surface: `createServerFn`, the context, sessions, cookies |
| `@barqjs/start/client`    | the RPC stub the compiler emits                                          |
| `@barqjs/start/server`    | `handleServerFn`, `mount`, the origin check                              |
| `@barqjs/start/serve`     | `serveBarq`, the asset middleware                                        |
| `@barqjs/start/vite`      | `barqStart()`                                                            |
| `@barqjs/start/prerender` | the prerenderer, for a custom build                                      |
