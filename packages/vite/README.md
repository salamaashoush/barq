# @barqjs/vite

The Vite plugin for barq: the compiler, the file route table, compiled styles,
server functions and the server build, from one call to `barq()`.

## Install

```bash
bun add -d @barqjs/vite vite
```

Every barq application needs it. Without it a `.tsx` file goes through a generic
JSX transform and gets different semantics.

## Usage

```ts
// vite.config.ts
import barq from "@barqjs/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [barq({ ssr: true, start: true })],
});
```

`bun create barq` writes one of three shapes:

```ts
barq({ ssr: true, start: { prerender: { routes: ["/"] }, verify: true } }); // pages rendered on the server
barq({ start: true }); // pages rendered in the browser from index.html, plus server functions
barq(); // the compiler alone
```

## Options

Where a concept is the same, the option has the name Solid 2.0's
`@solidjs/vite-plugin` gives it, so `solid({ ssr: true, start: true })` reads
the same here.

- `ssr`: whether the server renders pages. One meaning everywhere: the
  server renders the document and the client hydrates it, so both halves compile
  hydratable. With `start`, it also turns the page handler on. Off by default.
- `start`: the server half from `@barqjs/start`. Server functions and API
  routes, the dev server's page and function middleware, `vite preview`, and a
  `vite build` that builds the client and then the server. `true` is `{}`. Its
  options are `@barqjs/start`'s: `prerender`, `server`, `spa`, `allowedOrigins`,
  `importProtection`, `srcDirectory`, `outputDirectory`, plus `verify` and `env`
  below.
- `router`: file routes from `@barqjs/router`. On when `src/routes` exists
  and the package is installed; `false` turns it off, and an object sets
  `routesDir`, `routeTree` and `codeSplitting`. The route table is generated
  into `src/routeTree.gen.ts`, and its patterns are what `BARQ013` checks every
  `<Link to>` against.
- `dev`: resolve the development builds under `vite dev` and compile with
  the dev-only diagnostics. On by default; no effect on `vite build`.
- `refresh`: `{ disabled: true }` turns off replacing an edited component
  in place.
- `conditions`: export conditions every environment resolves first. A
  top-level `resolve.conditions` reaches the client environment only, and a
  condition that selects a package's build has to reach both halves or the app
  loads two copies of it.
- `compiler`: options for the barq compiler (`strictCss`, `checks`,
  `overlay`, and the rest). `compiler.routes` adds patterns `BARQ013` accepts
  beside the file routes, for a router the app mounts with a table of its own.

Where it differs from Solid's plugin: barq has one native compiler, so there is
no `compiler: "babel"` switch and `compiler` holds what Solid calls `solid`.
Server functions are `createServerFn` and live in `start`, which is what serves
them, so there is no separate `serverFunctions` flag.

## What it composes

- The compiler, hydratable when `ssr` is on.
- For `@barqjs/router`: the route table, route code splitting and the
  route-to-server-function walk `verify` checks.
- For `@barqjs/start`: the generated entries, the server-function manifest, the
  dev middleware, `buildApp`, `vite preview`, and the `.server.` / `.client.`
  bundle check.
- `server-only` and `client-only` import markers.
- Resolution: the `barq` condition, under which a barq package publishes its
  source, and `development` under `vite dev`, in every environment and in the
  server's `externalConditions`, and `resolve.dedupe` of `@barqjs/core` and
  `@solidjs/signals` where the project can reach them.
- Dependency optimization: packages that publish barq source are excluded, and
  the runtime modules that only compiled code imports are pre-bundled up front,
  so the first edit does not re-optimize and reload the page.

The facts that cross between these (the route patterns the compiler checks, the
reachability `verify` reads) live in the plugin, so a config never threads them
through variables of its own.

## Hot updates

An edit inside a route's component replaces that component in place. An edit to
the route's options (`loader`, `head`, `validateSearch`) reloads the page,
because the router read them when it was created. An edit to a module only the
server imports reloads the page, since nothing in the browser would otherwise
change.

## `server-only` and `client-only`

```ts
import "server-only"; // this module must never reach the browser bundle
```

The build fails where the browser bundle imports `server-only`, or the server
bundle imports `client-only`, naming the importer. For their types:

```ts
/// <reference types="@barqjs/vite/boundary-modules" />
```

## Typed environment variables

With `start`, an `env.ts` at the project root default-exports `server` and
`client` maps of [Standard Schema](https://standardschema.dev) validators (zod,
valibot, arktype):

```ts
// env.ts
import { z } from "zod";

export default {
  server: { DATABASE_URL: z.url() },
  client: { VITE_APP_NAME: z.string().min(1) },
};
```

```ts
import { env } from "virtual:env/client"; // anywhere: the public values
import { env } from "virtual:env/server"; // server code only: every value
```

Client values are validated at build time and written into the bundle, which is
what the public `VITE_` prefix means. Server values are read from `process.env`
and validated when the server starts, so no secret is in any build output. The
`.env` files are loaded into `process.env` for you. The browser bundle importing
`virtual:env/server` fails the build, as does a server value found written into
a browser chunk. `barq-env.d.ts` is generated beside the schema; keep both in
your tsconfig's `include`. `start: { env: "./config/env.ts" }` moves the schema,
and `env: false` turns this off.

## When another plugin owns the server environment

`@cloudflare/vite-plugin` and Nitro replace the `ssr` environment with one that
runs elsewhere. barq detects that and leaves pages and server functions to the
host in dev, which imports the `index` input of the `ssr` environment
(`dist/server/index.js` once built): a `{ fetch }` over server functions and
pages. In a build, barq builds the client first and leaves the server to the
host's own orchestration; `prerender` and `verify` import the server bundle
barq builds, so under such a host they do not run, and the build says so.

## Internal subpath

`@barqjs/vite/internal` is not public API. It holds the CSS registration the
repository's own `bun test` preloads append to a compiled module, and it can
change in any release.
