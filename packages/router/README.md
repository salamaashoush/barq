# @barqjs/router

Typed file-based routing for barq, with server rendering, streaming,
prerendering and API routes. A file under `src/routes` is a route, its params
and loader data are typed from it, and the compiler reports a `<Link to>` that
no route matches. The route API follows TanStack Router's design:
`createFileRoute`, `createRootRoute`, `beforeLoad`, `loader`, `loaderDeps`,
`head`, `shellComponent`, `<HeadContent />` and `<Scripts />`.

## Install

```bash
bun add @barqjs/router @barqjs/core @barqjs/server @barqjs/start
bun add -d @barqjs/vite vite
```

`bun create barq my-app` writes a project that already builds. This document
is what that project is made of.

## The smallest app

```ts
// vite.config.ts
import barq from "@barqjs/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [barq({ ssr: true, start: true })],
});
```

```tsx
// src/routes/__root.tsx
import type { Child } from "@barqjs/core";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@barqjs/router";

const shellComponent = (props: { children: Child }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <HeadContent />
    </head>
    <body>
      <div id="app">{props.children}</div>
      <Scripts />
    </body>
  </html>
);

export const Route = createRootRoute({
  shellComponent,
  head: { meta: [{ title: "barq" }] },
  component: () => <Outlet />,
});
```

```tsx
// src/routes/index.tsx
import { createFileRoute } from "@barqjs/router";

export const Route = createFileRoute("/")({
  component: () => <h1>hello</h1>,
});
```

`vite dev` serves it and `vite build` writes `dist/server/serve.js`, which
`bun dist/server/serve.js` runs. Server functions, sessions and the server
itself are in [@barqjs/start](../start/README.md).

## The Vite plugin

`@barqjs/vite` turns file routes on when `@barqjs/router` is installed and
`src/routes` exists. It writes `src/routeTree.gen.ts`, splits each route's
components into their own chunk, and hands the compiler the route set
[`BARQ013`](../compiler/docs/BARQ013.md) checks links against.
`barq({ router: { routesDir, routeTree, codeSplitting } })` moves or tunes it.

`ssr: true` makes both halves hydratable, which server rendering requires: the
server writes hydration markers and the client walks them.

Under `vite dev`, an edit inside a route's component replaces the component in
place. An edit to the route's options (`loader`, `head`, `validateSearch`)
reloads the page, because the router read them when it was created.

## `src/routeTree.gen.ts`

The plugin writes it. **Commit it, and do not edit it.** It is an ordinary
module the project imports by path: the route table and the route types in one
file a person can open, typecheck and read, rather than a virtual specifier only
the bundler can resolve.

Every route module is imported statically there, so a route's whole option set
reaches the router. The components are split out by the compiler, not by the
table.

## File names

```text
__root.tsx                    ->  the root: the document and the outermost layout
index.tsx                     ->  /
posts.tsx                     ->  /posts, and the layout everything below nests in
posts.index.tsx               ->  /posts/
posts.$postId.tsx             ->  /posts/$postId
posts_.$postId.edit.tsx       ->  /posts/$postId/edit, NOT nested in posts.tsx
posts/route.tsx               ->  the same layout as posts.tsx, directory form
files.$.tsx                   ->  /files/$   (splat)
docs.{-$version}.guide.tsx    ->  /docs/{-$version}/guide   (optional parameter)
report.{$name}[.]csv.tsx      ->  /report/{$name}.csv   (parameter with a suffix)
_app.tsx                      ->  a pathless layout
(marketing)/about.tsx         ->  /about     (the group is not in the URL)
script[.]js.tsx               ->  /script.js
-helpers.tsx                  ->  not a route at all
```

Nesting is decided by walking the `/` segments of the route path and taking the
longest registered prefix, not by comparing dotted filenames. That is what makes
the `_` suffix work with no rule of its own.

## A route

```tsx
import { createFileRoute } from "@barqjs/router";

interface Post {
  readonly title: string;
}

function Post() {
  const post = Route.useLoaderData();
  const params = Route.useParams();
  return (
    <article>
      <h1>{() => post()?.title}</h1>
      <p>post {() => params().postId}</p>
    </article>
  );
}

export const Route = createFileRoute("/posts/$postId")({
  loader: ({ params }) => fetchPost(params.postId),
  component: Post,
  pendingComponent: () => <p>loading…</p>,
  errorComponent: ({ error }) => <p>{() => error().message}</p>,
  head: { meta: [{ title: "A post" }] },
});
```

The argument is the route ID, not a pattern to parse. The generator rewrites
that literal in place when you rename the file.

`Route.useLoaderData()` is typed by what `loader` returns, here a `Post` when
`fetchPost` returns `Promise<Post>`. A type argument, `createFileRoute<Post>(…)`,
is a type the loader's value must satisfy, and the value's type for a route
with no loader.

`Route.useLoaderData()`, `useParams()`, `useSearch()`, `useLoaderDeps()`,
`useRouteContext()`, `useMatch()` and `useNavigate()` hang off the route so they
carry its types. Each returns a cell to read inside JSX or a memo. Calling one
while another route is rendering throws and names both routes: reaching another
route's data by copy-paste reads as correct, and this is where it is caught. The
plain hooks (`useParams`, `useSearch`, `useMatch` and the rest) are exported
from the package root for code outside a route module.

`errorComponent` receives `{ error, reset, params, data }`, each a function to
call. `notFoundComponent` takes the same props, with `data` carrying what
`notFound({ data })` said.

## The document

Only `__root.tsx` may declare a shell, and the shell is the document (see the
root route above).

`<HeadContent />` renders every matched route's merged `head` plus the
framework's own tags: the matched chunks' modulepreloads, the `beforeLoad`
handoff, the client CSS. `<Scripts />` renders the body scripts and the client
entry. **There is no order to get right and no template to assemble.**

The shell is built around the routes rather than before them, so anything a
route registers while rendering (a CSS-in-JS sheet, for instance) is in the head
by the time it serialises. The cost is that a context the shell provides does
not reach the routes. Put providers in the root route's `component`, which is
where a layout's providers belong anyway.

### `head` merging

A leaf replaces the identities it names and inherits the rest, so a page's
`title` overrides the site's while `og:site_name` survives. `head` returns
TanStack's shape, `{ meta, links, scripts, styles }`, with `title` inside
`meta`. A route's own `scripts` option is the body half. Three deliberate
divergences from TanStack, all invisible in the API, are recorded in
[`src/head.ts`](src/head.ts):

- `meta` dedup keeps `name`, `property` and `http-equiv` in separate namespaces.
- `rel="canonical"` is a singleton, so a child's replaces a parent's.
- A single tag still goes through dedup.

A `head` written as an object costs no wait. A `head` written as a function is
asking for the match, so its own route's loader settles before the head
serialises, and only its own. Measured on a 300 ms loader: an object head
streams its first byte at 5 ms, a function head at 301 ms.

## Render modes

```tsx
export const Route = createFileRoute("/about")({ prerender: true }); // a file on disk
export const Route = createFileRoute("/admin")({ ssr: false }); // client-only
export const Route = createFileRoute("/feed")({ ssr: "data-only" }); // loaders run, fallback renders
```

The generator copies both options into the route table as literals, because the
prerenderer and the server need the answer before any route module has run.
Write them as literals: a value the generator cannot read is reported, and the
route keeps the default.

`prerender` writes the page at build time. The build renders the seed paths from
`barq({ start: { prerender: { routes } } })`, follows same-origin links out of what
each page produced, and keeps a crawled path only when the route it matched asks
for one.

`ssr` inheritance is asymmetric, as in TanStack: a parent's `false` forces every
descendant to `false`, a parent's `"data-only"` clamps a child's `true` down to
`"data-only"`, and a child may always opt further out.

`ssr` may also be a function, which decides for one request. It runs on the
server only, before `beforeLoad`, and answering nothing leaves the default:

```tsx
createFileRoute("/docs/$kind")({
  ssr: ({ params, search }) => {
    if (params.status === "success" && params.value.kind === "sheet") return false;
    if (search.status === "success" && search.value.details) return "data-only";
  },
});
```

`createPageHandler` with `shell: true` renders the root route with nothing
under it. That is the document
`barq({ ssr: true, start: { spa: { enabled: true } } })` writes once and serves
for every path.

## The router, per request

`src/router.ts` is optional. Without it the plugin uses
`export const config = { routeTree }`. Write it to export `config`, or
`getRouter` when a router needs more than configuration. `getRouter` runs once
for each request on the server and once in the browser, so what it creates
belongs to one visitor:

```ts
import { createRouter } from "@barqjs/router";
import { setupRouterSsrQueryIntegration } from "@barqjs/query/router";
import { QueryClient } from "@tanstack/query-core";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const queryClient = new QueryClient();
  const router = createRouter({ routeTree, context: { queryClient } });
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}
```

It has to call `createRouter` before it first awaits: that call is where the
server hands over the request's location.

A router carries TanStack's four hooks, as configuration or installed on
`router.options` after `createRouter` has returned:

```tsx
createRouter({
  routeTree,
  dehydrate: () => ({ flags }), // server, once the matched loaders have settled
  hydrate: (dehydrated) => restore(dehydrated.flags), // browser, before the first render
  Wrap: (props) => <Theme>{props.children()}</Theme>, // around the router output
  InnerWrap: (props) => <Session>{props.children()}</Session>, // inside the router context
});
```

`hydrate` is typed by what `dehydrate` returns. A wrapper's `children` builds
the tree it goes around, so call it once, where that tree belongs.
The value crosses through the same codec as loader data: a promise or an async
iterable inside it is streamed, so the shell goes first and what settles later
follows it. During a render `router.serverSsr` offers `injectScript(source)` and
`onRenderFinished(listener)`.

A context for one request, without `getRouter`, is a function on the handler. It
runs inside the request and is laid over the router's own context:

```ts
import { createStartHandler } from "@barqjs/router/server";

export default createStartHandler({
  context: async (request) => ({ tenant: await tenantOf(request) }),
});
```

## API routes

An API route is an ordinary route file that declares handlers instead of a
component. One tree, one file convention, one generator, and a route may be
both, serving HTML to a browser and JSON to a `fetch` from the same path.

```ts
import { createFileRoute } from "@barqjs/router";
import { setResponseHeader } from "@barqjs/start";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => {
        setResponseHeader("cache-control", "no-store");
        return Response.json({ ok: true });
      },
      POST: async ({ request }) => Response.json(await request.json(), { status: 201 }),
    },
  },
});
```

The compiler deletes `server` from the client build, so a handler's body, and
the database driver it imports, is in no client chunk.

Middleware goes on the route, where everything under it inherits it, or on one
method through `createHandlers`:

```ts
createFileRoute("/api/posts")({
  server: {
    middleware: [requireSession],
    handlers: ({ createHandlers }) =>
      createHandlers({
        GET: () => Response.json(posts()),
        POST: { middleware: [rateLimited], handler: ({ context }) => create(context.user) },
      }),
  },
});
```

A request passes the application's global request middleware first (`createStart`
in `@barqjs/start`), then the route's, then the method's own, and each one's
`next({ context })` reaches the handler's `context`. A cross-origin refusal is
answered before any of them runs.

A route handler answers before the method gate, which is the whole point of one:
a page can only be a GET. `csrf` is on by default and refuses a state-changing
request a browser made cross-origin, while leaving a webhook or a cron alone,
because those send no `Origin` at all.

## Links and navigation

```tsx
import { Link, NavLink, useNavigate } from "@barqjs/router";

<Link to="/posts/1">a post</Link>
<NavLink to="/about" activeClass="active">about</NavLink>;

const navigate = useNavigate();
await navigate("/posts/2", { replace: true });
await navigate({ to: "/posts/$postId", params: { postId: "3" } });
```

`navigate` takes a path string or TanStack's `{ to, params, search, hash }`
object. `BARQ013` checks every `<Link to>` against the route set the same scan
produced, at compile time. If your project mounts a second router with its own
table, add those patterns to `barq({ compiler: { routes } })`: the check assumes
one route table per project.

## Subpaths

- `@barqjs/router`: isomorphic. Routes, components, hooks, `createRouter`,
  `redirect`, `notFound`.
- `@barqjs/router/client`: `startClient()`, the hydrating boot.
- `@barqjs/router/server`: `createStartHandler()` and `createPageHandler()`.

Do not import `@barqjs/router/server` from a route module. A root route ships to
the browser like any other route, and that subpath reaches `node:async_hooks`.

## Coming from TanStack Router

Route options, hooks, `head`, search validation and middlewares, `beforeLoad`,
`loaderDeps`, `shouldReload`, `redirect` and `notFound` follow TanStack Router
and Start, under their names. Where barq diverges, the reason is written beside
the code: the `head` merge in [`src/head.ts`](src/head.ts), and the lifted
`ssr` and `prerender` above. Hooks return barq cells rather than values, because
a barq component runs once and reads them reactively.
