# barq, SPA

Routing and rendering happen in the browser. `index.html` is the document, and
`vite build` bundles it like any other Vite app. Server functions still work:
they are real HTTP endpoints, and `dist/server/serve.js` serves them alongside
the static files.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/client and dist/server
npm run preview    # bun dist/server/serve.js
npm run typecheck
```

## The files

```
index.html              the document
src/main.tsx            creates the router and renders it into #app
src/routes/__root.tsx   the layout. No shellComponent: index.html is the document.
src/routes/index.tsx    /
src/routes/about.tsx    /about, whose loader calls a server function
src/data/greeting.ts    that server function
src/routeTree.gen.ts    written by the build. Commit it, do not edit it.
```

`src/main.tsx` renders rather than hydrates, and awaits `router.start()` first
so the first frame draws the page that actually matched. `startClient()` from
`@barqjs/router/client` is the hydrating twin and belongs to an application
whose server renders the page.

`dist/server/serve.js` answers a path no route claims with `index.html`, so a
deep link works on a reload. Deploying the client half to a static host works
too, as long as that host is configured to do the same.
