# barq, full-stack

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/client and dist/server
npm run preview    # bun dist/server/serve.js
npm run typecheck
```

## The files

```
src/routes/__root.tsx   the document (shellComponent) and the layout
src/routes/index.tsx    /            prerendered to a file at build time
src/routes/about.tsx    /about       rendered per request, from a loader
src/routes/api/health.ts /api/health an API route: handlers, no component
src/data/greeting.ts    a server function
src/routeTree.gen.ts    written by the build. Commit it, do not edit it.
```

A file under `src/routes` is a route. `posts/$id.tsx` is `/posts/:id`,
`posts.tsx` beside a `posts/` directory is that subtree's layout, and a file
that declares `server: { handlers }` instead of a component is an API route.

## Three things worth knowing

**`prerender: true` is read at build time.** It is lifted out of the route's
options by the generator, so it has to be a literal. The build renders `/`,
follows the links in what it produced, and writes every page it reaches whose
route asks for one.

**A server function is its own endpoint.** `greeting()` looks like a call and is
an HTTP request to `/_barq/fn/<id>`. A guard on the route that renders it does
not run when somebody calls it directly, which is why `vite.config.ts` arms
`verify`: declare `middleware` on a route and the build refuses to ship unless
every server function that route can reach carries the same middleware.

**The document is a route.** `shellComponent` in `__root.tsx` renders `<html>`,
and `<HeadContent />` and `<Scripts />` place themselves. There is no HTML
template and no order to get right.
