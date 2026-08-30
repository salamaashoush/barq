# create-barq

Scaffold a barq project.

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
  -h, --help
```

## The templates

| Template | Pages | Router | Server functions | Run it with |
| --- | --- | --- | --- | --- |
| `full-stack` | rendered on the server, prerendered where a route says so | yes | yes | `bun dist/server/serve.js` |
| `spa` | rendered in the browser, from your own `index.html` | yes | yes | `bun dist/server/serve.js` |
| `minimal` | one `index.html` | no | no | any static host |

`full-stack` is the default. Every one of them builds, typechecks and runs
before it is published: `test/scaffold.test.ts` scaffolds each into a temporary
directory, runs its own `vite build` and `tsc`, starts the server it produced
and fetches from it.

## What a scaffolded project does not contain

- **No entry files.** `src/entry-client.tsx` and `src/entry-server.tsx` are
  optional overrides. The defaults are two lines each and the plugin supplies
  them.
- **No `src/routeTree.gen.ts`.** `barqRouter` writes it on the first build or
  dev start. Commit it: it is an ordinary module the project imports by path,
  and it typechecks and reads like one.
- **No `src/virtual.d.ts`.** The declarations for the build's own modules ship
  inside `@barqjs/router`.

## Adding routes

A route is a file under `src/routes`. `about.tsx` is `/about`, `posts/$id.tsx`
is `/posts/:id`, `api/health.ts` is an API route because it declares `server`
handlers instead of a component, and `__root.tsx` is the layout and, for a
server-rendered app, the document.
