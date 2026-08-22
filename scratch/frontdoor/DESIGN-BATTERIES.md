# The batteries — design, before any code

Working document for the session that follows `8066ac0`. Each section states what
is being built, what was measured, and what was rejected.

---

## B1. The boot, and what `__BARQ_SEED__` is actually for

**Measured** (`scratch/frontdoor/probe-boot`, Chrome, a stream that opens its
channel at t=0 and flushes its seed at t≈594 ms, entry chunk costing 120 ms):

| entry placement | request starts | EXECUTES | `__BARQ_SEED__.open` |
|---|---:|---:|---|
| `<script type="module" src>` in the tail — today | 594 ms | **718 ms** | `0`, closed |
| same, plus `<link rel="modulepreload">` in the head | ~0 ms | **598 ms** | `0`, closed |
| `<script type="module" async src>` in the head | ~0 ms | **121 ms** | **`1`, open** |

Three conclusions, and the third is the design.

1. The tail placement costs the entry's entire fetch: the browser cannot discover
   a script it has not parsed to, and `wrapStream` puts the tail after the last
   flush.
2. `modulepreload` recovers the fetch and **does not** revive the channel. A
   module script is deferred by definition; it runs at `readyState:"interactive"`,
   which is after `done()`. This closes DESIGN-FRONTDOOR §5's remaining door: the
   channel is not dead because the entry is fetched late, it is dead because a
   module script cannot run before the parser finishes.
3. `async` in the head executes at 121 ms with the channel open, the seed empty,
   and `#app` still holding the fallback.

**So the channel is not decoration — it is the mechanism that makes an early
entry safe.** Move the entry early without it and `state.start()` runs the
chain's loaders at 121 ms against an EMPTY `__BARQ_DATA__`, and every one of them
refetches on the client something the server is in the middle of sending.
`seedLater` is what parks those reads until the flush that carries them. The two
changes only make sense together, which is why §5 could not see a use for the
channel while the entry stayed in the tail.

What must NOT move: `hydrate()`. At 121 ms `readyState` is `"loading"` and the
body is half-parsed. The boot awaits DOM-ready before hydrating, so the walk sees
exactly the DOM it sees today.

### The document contract, revised

`DocumentParts` gains `boot`, and the document places, in the head, in order:

```
<meta charset> <meta viewport>
{boot}      ← event capture, then the seed channel. Inline, nonce-carrying.
{seed}      ← non-streamed only; empty on a streamed page
{head}      ← §B2
{context}
{preload}   ← modulepreload for the matched route chunks
{scripts}   ← the client entry, type="module" async
{css}
```

`boot` is in the head and not after the app markup — where `renderToStream` emits
it today — because the entry is now in the head too and document order is the only
ordering guarantee an `async` script has. It also captures strictly more: a click
made while the shell is painting currently happens before the capture script.

`renderToStream` takes `boot: false` when the caller has placed it. It is not
removed: `renderToStream` has callers that are not `createPageHandler`.

### Rejected

- **Delete the channel.** It was the answer while the entry stayed in the tail,
  and the measurement above says the entry does not have to stay there.
- **`hydrate()` from the `async` entry directly.** `readyState:"loading"`,
  measured. The boot awaits DOM-ready.
- **`modulepreload` alone.** Recovers 120 ms of the 597, leaves the channel dead,
  and leaves `state.start()` on the critical path behind the whole stream.

---

## B2. Head management

Prior art read in full: `@solidjs/meta` 0.29.7, `@solidjs/web` 2.0.0-rc.0,
`unhead` 3.4.0, TanStack Router, SvelteKit, React 19's metadata hoisting, and
`dom-expressions/docs/head-management-rfc.md`.

**The measurement that decides the shape:** a `<title>` written into the BODY
loses to the shell's title — `document.title` is the first title in tree order —
and body `<meta>`/`<link>` are not hoisted by the parser at all. So head content
that must reach a crawler has to be in the shell bytes. There is no third option;
Next.js ships a byte-level stream rewrite to rescue `<link rel="icon">` out of the
body and that is the shape of the workaround.

### The declaration

`export const head` in a route module: a `HeadTags` object, or a function of
`{ params, search, context }`. Reached exactly as `loader` already is — the
generator emits `head: lazyHead(() => import(specifier))`, which imports the
module and calls it — and **awaited in the same pre-shell phase as
`beforeLoad`**, which already resolves the whole chain before a byte goes out.

Loader DATA is deliberately not in scope. A loader parks; awaiting one before the
shell is DESIGN-START §2.1's head-of-line barrier reintroduced at the document
level. A route that wants a title from its data says so imperatively on the
client, and that limit is written down rather than discovered.

### The merge

Solid 2's identity ladder, which is the best in the field, plus its
group-replaceable-set rule:

```
title                          -> "title"          (last wins, single)
base                           -> "base"
meta[charset]                  -> "charset"
{tag} with an explicit key     -> "{tag}:key:{key}"
meta[name|property|http-equiv] -> "meta:{ns}:{value}[:media={media}]"
link[rel=icon|apple-touch-icon]-> "link:{rel}[:sizes=][:type=]"
link                           -> "link:{rel}:{href}"
anything else                  -> unique, never collides
```

Two bugs this avoids, both reproduced by the research agent against shipped code:
`@solidjs/meta` puts `content` in the key, so **a page cannot override a layout's
description**; TanStack dedups on `JSON.stringify(tag)`, so a child cannot
override a parent's `rel="canonical"` (their #6719, open).

The group rule: within one route's `head`, same-identity tags COEXIST — three
`og:image` all survive. Across routes, a deeper route REPLACES the shallower
one's whole set for that identity. Route depth is the group sequence.

### Delivery

- **SSR / SSG** — `DocumentParts.head` is the rendered string, in the shell.
- **Client navigation** — the same reducer over the new chain, then patch
  `document.head`: remove only nodes carrying `data-barq-head="{identity}"` for
  retracted identities, reuse an owned node whose attributes already match,
  restore the captured original `<title>` when nothing claims it. **Never touch a
  node without the ownership attribute** — that is how analytics and extension
  tags get destroyed.

### Rejected

- **A streaming patch protocol** (`useHead` + `$dh`-style ops parked under a
  boundary key). It is the expensive half and it is crawler-useless by the
  measurement above. Stated as a known limit with the mechanism named, so the
  next session starts from the design rather than from the survey.
- **Blocking the shell on `head()`** — DESIGN-START §2.1 exists to remove exactly
  that barrier.
- **Late head tags in the body** — measured wrong, and it looks right in devtools.

---

## B3. The production server, and the output manifest

`serveBarq` has zero callers. `kitchen-sink/preview.mjs` hand-rolls `Bun.serve`
plus a static walk plus a mock API — the reference application writing the
framework's missing half. Measured against the checklist the research produced,
that walk has: no `Cache-Control` on anything, no ETag, no `Last-Modified`, no
304, no HEAD handling, no range, no trailing-slash 308, a five-entry MIME table,
no dotfile denial, and it is Bun-only while `package.json` runs it with `node`.

### `dist/barq.json`

The build already computes everything in it and throws most of it away:
`PrerenderedPage{path,file,status,headers}` goes to `onPages` and is never
persisted.

```jsonc
{ "version": 1,
  "serverEntry": "server/server.js",   // RECORDED, never reconstructed — TanStack #8118
  "clientDir": "client",
  "assetsPrefix": "assets",            // the only class that may be cached immutably
  "base": "/",
  "prerendered": { "/": { "file": "index.html", "status": 200, "headers": {} } },
  "redirects":   { "/about/": { "status": 308, "location": "/about" } } }
```

One artifact, three consumers: `barq preview`, the production server, and every
future adapter. Nitro reached this two majors late (`nitro.json` gained
`serverEntry` only in v3, and it immediately bought a preset-agnostic preview).

### The server

`serveBarq({ manifest })` on `srvx`, which barq already depends on and which
already resolves node/deno/bun/workerd by export condition. Order:

1. server functions — their URL is reserved (this is already `createFetchHandler`);
2. prerendered HTML, by manifest lookup, plus the trailing-slash 308;
3. static files, in two classes, because they want opposite headers:
   `assetsPrefix/*` → `public, max-age=31536000, immutable`; everything else →
   `public, max-age=0, must-revalidate`. A 404 under `assetsPrefix` is `no-store`
   and does NOT fall through to SSR — otherwise a miss gets immutably cached as
   dynamic content;
4. the SSR entry.

**No `Cache-Control` is not neutral** and this is the field's shared gap
(kit #3194, #11875): RFC 9111 §4.2.2 permits heuristic freshness at 10% of
`Date − Last-Modified`, so a month-old prerendered file is reusable for three
days without revalidating.

### Rejected

- **A `vite preview` plugin as the deployment story.** Twice rejected upstream
  (vitejs #14836, #14837); `PreviewServer` has no `environments`; every asset is
  served `no-cache`; `@polka/compression` is unconditional and corrupts HTTP/2
  SSE (vitejs #22654). DESIGN-FRONTDOOR §5's claim holds for Vite 7 and 8 alike.
- **A preset registry that owns the bundler.** Nitro's biggest liability — its
  own tracker records a preset overriding the user's `wrangler.jsonc`, and pi0
  now recommends the 10-line `standard` preset instead of writing one. barq's
  stable artifact is the WinterCG `{ fetch }` default export, which it already
  has; packaging is a thin layer on top.
- **Writing our own Node request/response bridge.** `srvx` has the correct
  answers to 27 gotchas we would otherwise rediscover — HTTP/2 pseudo-headers,
  `duplex: "half"`, `set-cookie` via a flat `writeHead` array, HEAD not pumping
  an unbounded body, undrained request bodies corrupting keep-alive.

---

## B4. The route-action manifest, armed

`verifyRouteChains` is tested since `83c81d4` and called by nobody.
`barqRouter({ verify })` is the seam and `buildEnd` already computes reachability
from a real Rollup graph. What is missing is the `check` callback, which needs
two things the plugin cannot have — the application's route definitions with
their `middleware` closures, and the server `REGISTRY` — both reachable through
`environment.runner.import`, which `start/vite.ts` already does for the
server-function manifest.

Validate and REJECT, never redispatch. Next.js is removing action forwarding
(#96951); the deeper reason is this repo's own rule — a client-supplied route
selecting a middleware chain lets the caller pick the weakest chain that reaches
the action.

kitchen-sink gets a route whose middleware a server function must carry, and a
test that the build FAILS when it does not.

---

## B5. `@barqjs/testing`

`grep -c hydrate packages/testing/src/index.ts` is 0. The router and server suites
hand-roll SSR-then-hydrate harnesses; `router/src/server.test.ts`'s "hydration"
describe is the model. What is missing: `renderToString`-style SSR, a seed
installer, and a hydrate helper that reports what was claimed.

---

## B6. The client story for a mutation

`<form action={serverFn}>` works with JS disabled (P3). On the JS path there is
nothing for pending state, optimistic values or error display. The answer has to
be written down either way.
