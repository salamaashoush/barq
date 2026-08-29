# The code-split probe

`hydration-probe.ts` drives headless Chrome against a BUILT reference
application and answers the one question the suites cannot: does the page still
hydrate when every route's component arrives in a chunk of its own?

The measure is node IDENTITY, not markup. A component behind a cold `lazy()`
throws `NotReadyError`, which parks its depth's boundary and makes it REBUILD —
so the page looks right precisely because it threw the server's work away.

```
cd packages/kitchen-sink && bun run build
bun /path/to/serve.mjs "$PWD/dist/client"       # any static server on :4321
bun scratch/split/hydration-probe.ts http://localhost:4321/
```

Measured at the commit that introduced the split:

```
REUSE 98.7%  (149/151 server nodes kept), errors: []
navigation to /store fetched exactly 1 new chunk
the freshly-loaded chunk was live: Count: 0 -> Count: 1 on click
```

The two nodes not kept are the head's, which `<HeadContent />` reconciles as a
keyed list.
