# barq, minimal

The compiler and signals, and nothing else. No router, no server.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist
npm run preview
npm run typecheck
```

```
index.html       the document
src/main.tsx     render(() => <App />, root)
src/App.tsx      a signal and a button
```

`{count}` in JSX is a tracked read rather than a snapshot: the compiler wraps it,
and only that text node updates when the signal changes. The same wrapping is why
control-flow props take a plain expression, as in `<Show when={count() > 5}>`,
rather than a function.

Adding `@barqjs/router` and `@barqjs/start` later is not a rewrite, but starting
from the `full-stack` template is less work than retrofitting.
