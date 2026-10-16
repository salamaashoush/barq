# create-barq

Scaffold a barq project: a Vite app with the barq compiler, and, depending on
the template, file routes, server rendering and server functions.

## Usage

```bash
bun create barq my-app
npm create barq@latest my-app
pnpm create barq my-app
```

With no arguments it asks for a directory and a template. With them it asks
nothing:

```bash
bun create barq my-app --template spa
```

```
create-barq [directory] [options]

  -t, --template NAME   full-stack | spa | minimal
      --overwrite       empty the directory first
  -h, --help            show this
```

Then install and start the dev server with the package manager that ran it:

```bash
cd my-app
bun install
bun run dev
```

## The templates

- `full-stack`: pages rendered on the server, prerendered where a route says
  so, with file routes, an API route and a server function. Run the build with
  `bun dist/server/serve.js`.
- `spa`: pages rendered in the browser from your own `index.html`, with file
  routes and a server function. Run the build with `bun dist/server/serve.js`.
- `minimal`: one `index.html`, the compiler and signals, no router and no
  server. The build is static files for any host.

`full-stack` is the default. Each `vite.config.ts` is one call to the plugin
from `@barqjs/vite`: `barq({ ssr: true, start })`, `barq({ start: true })` and
`barq()`.

Every template is tested before it is published. `test/scaffold.test.ts`
scaffolds each into a temporary directory, runs its own `vite build` and `tsc`,
starts the server it produced and fetches from it.

## What a scaffolded project does not contain

- **No server or client entry.** `src/entry-client.tsx` and
  `src/entry-server.ts` are optional overrides, and the plugin supplies the
  defaults. The `spa` template's `src/main.tsx` is the module `index.html`
  loads, not an entry the plugin looks for.
- **No `src/routeTree.gen.ts`.** The Vite plugin writes it on the first build
  or dev start. Commit it. It is an ordinary module the project imports by
  path, and it typechecks and reads like one.
- **No `src/virtual.d.ts`.** The declarations for the build's own modules ship
  inside `@barqjs/router`.

## Adding routes

A route is a file under `src/routes`. `about.tsx` is `/about`. `posts/$id.tsx`
is `/posts/:id`. `api/health.ts` is an API route, because it declares `server`
handlers instead of a component. `__root.tsx` is the layout every page renders
inside and, for a server-rendered app, the document. The conventions are
TanStack Router's; see the [router README](../router/README.md).
