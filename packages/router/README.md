# @barqjs/router

File-based routing, server rendering, prerendering and API routes.

```bash
bun add @barqjs/router @barqjs/core @barqjs/server @barqjs/start
bun add -d @barqjs/compiler vite
```

The fastest way in is `bun create barq my-app`, which writes a project that
already builds. This document is what that project is made of.

## The Vite plugin

```ts
import { barqRouter } from "@barqjs/router/vite";
import { barqStart } from "@barqjs/start/vite";
import { defineConfig } from "vite";

let routes: readonly string[] = [];

export default defineConfig({
  plugins: [
    barqRouter({ onRoutes: (patterns) => (routes = patterns) }),
    barqStart({ compiler: { hydratable: true, routes: () => routes } }),
  ],
});
```

`barqRouter` scans `src/routes`, writes `src/routeTree.gen.ts`, and splits each
route's components into their own chunk. `barqStart` compiles the app and builds
the server.

`hydratable: true` is required for server rendering and is off by default: the
server writes hydration markers and the client walks them, and both halves of
one deployment must agree.

`routes` is a THUNK. `onRoutes` fires during config resolution and the compiler
reads this per transform, so an array here is captured while it is still empty
and every `<Link to>` is reported as matching no route.

## `src/routeTree.gen.ts`

The plugin writes it. **Commit it, and do not edit it.** It is an ordinary
module the project imports by path — the route table and the route types in one
file a person can open, typecheck and read, rather than a virtual specifier only
the bundler can resolve.

Every route module is imported STATICALLY there, so a route's whole option set
reaches the router; the components are split out by the compiler, not by the
table.

## File names

```text
__root.tsx                ->  the root: the document and the outermost layout
index.tsx                 ->  /
posts.tsx                 ->  /posts, and the layout everything below nests in
posts.index.tsx           ->  /posts/
posts.$postId.tsx         ->  /posts/$postId
posts_.$postId.edit.tsx   ->  /posts/$postId/edit, NOT nested in posts.tsx
posts/route.tsx           ->  the same layout as posts.tsx, directory form
files.$.tsx               ->  /files/$   (splat)
_app.tsx                  ->  a pathless layout
(marketing)/about.tsx     ->  /about     (the group is not in the URL)
script[.]js.tsx           ->  /script.js
-helpers.tsx              ->  not a route at all
```

Nesting is decided by walking the `/` segments of the route path and taking the
longest registered prefix, not by comparing dotted filenames. That is what makes
the `_` suffix work with no rule of its own.

## A route

```tsx
import { createFileRoute } from "@barqjs/router";

function Post() {
  const post = Route.useLoaderData();
  const { postId } = Route.useParams();
  return <article>{() => post()?.title}</article>;
}

export const Route = createFileRoute("/posts/$postId")({
  loader: ({ params }) => fetchPost(params.postId),
  component: Post,
  pendingComponent: () => <p>loading…</p>,
  errorComponent: (error) => <p>{() => error().message}</p>,
  head: { meta: [{ title: "A post" }] },
});
```

The argument is the route ID, not a pattern to parse. The generator rewrites
that literal in place when you rename the file.

`Route.useLoaderData()`, `useParams()`, `useRouteContext()`, `useMatch()` and
`useNavigate()` hang off the route so they carry ITS types. Calling one from
another route's module throws, naming both positions — the mistake is reaching
another route's data by copy-paste, and it reads as correct.

## The document

Only `__root.tsx` may declare a shell, and the shell IS the document:

```tsx
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

`<HeadContent />` renders every matched route's merged `head` plus the
framework's own tags: the matched chunks' modulepreloads, the `beforeLoad`
handoff, the client CSS. `<Scripts />` renders the body scripts and the client
entry. **There is no order to get right and no template to assemble.**

The shell is built AROUND the routes rather than before them, so anything a
route registers while rendering — a CSS-in-JS sheet, for instance — is in the
head by the time it serialises. What that costs is that a context the SHELL
provides does not reach the routes; put providers in the root route's
`component`, which is where a layout's providers belong anyway.

### `head` merging

A leaf replaces the identities it names and inherits the rest, so a page's
`title` overrides the site's while `og:site_name` survives. Three deliberate
divergences from TanStack, all invisible in the API:

- `meta` dedup keeps `name`, `property` and `http-equiv` in separate namespaces.
- `rel="canonical"` is a singleton, so a child's replaces a parent's.
- A single tag still goes through dedup.

A `head` written as an OBJECT costs no wait. A `head` written as a FUNCTION is
asking for the match, so its own route's loader settles before the head
serialises — and only its own. Measured on a 300 ms loader: an object head
streams its first byte at 5 ms, a function head at 301 ms.

## Render modes

Both are properties of the route's options, lifted into the generated table as
literals, because neither can be read at run time: every route module is
`lazy()`, and the answers are wanted before it loads.

```tsx
export const Route = createFileRoute("/about")({ prerender: true }); // a file on disk
export const Route = createFileRoute("/admin")({ ssr: false }); // client-only
export const Route = createFileRoute("/feed")({ ssr: "data-only" }); // loaders run, fallback renders
```

`prerender` writes the page at build time. The build renders the seed paths from
`barqStart({ prerender: { routes } })`, follows same-origin links out of what
each page produced, and keeps a crawled path only when the route it matched asks
for one.

`ssr` inheritance is asymmetric: a parent's `false` forces every descendant to
`false`, a parent's `"data-only"` clamps a child's `true` down to
`"data-only"`, and a child may always opt further out.

## API routes

An API route is an ordinary route file that declares handlers instead of a
component. One tree, one file convention, one generator — and a route may be
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

The compiler deletes `server` from the client build, so a handler's body — and
the database driver it imports — is in no client chunk.

A route handler answers before the method gate, which is the whole point of one:
a page can only be a GET. `csrf` is on by default and refuses a state-changing
request a BROWSER made cross-origin, while leaving a webhook or a cron alone,
because those send no `Origin` at all.

## Links and navigation

```tsx
import { Link, NavLink, useNavigate, useParams, useSearch } from "@barqjs/router";

<Link to="/posts/1">a post</Link>
<NavLink to="/about" activeClass="active">about</NavLink>;

const navigate = useNavigate();
await navigate("/posts/2", { replace: true });
```

`BARQ013` checks every `<Link to>` against the route set the same scan produced,
at compile time. If your project mounts a second router with its own table, add
those patterns to `barqStart({ compiler: { routes } })` — the check's premise is
one route table per project, and an application is not obliged to satisfy it.

## Subpaths

| import                  | where it runs                                 |
| ----------------------- | --------------------------------------------- |
| `@barqjs/router`        | isomorphic: routes, components, hooks         |
| `@barqjs/router/client` | `startClient()`, the hydrating boot           |
| `@barqjs/router/server` | `createStartHandler()`, `createPageHandler()` |
| `@barqjs/router/vite`   | `barqRouter()`                                |

Do not import `@barqjs/router/server` from a route module. A root route ships to
the browser like any other route, and that subpath reaches `node:async_hooks`.
