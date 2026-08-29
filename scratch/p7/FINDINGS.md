# HANDOVER item 1 — measured at 55a16fd, PARKED for the createFileRoute migration

All five re-measured this session against shipped code, not taken from the brief.
Probes: `scratch/p7/ssr-head.ts`, `scratch/p7/patch.ts`
(run the second as `cd packages/router && bun --preload ./src/test-setup.ts ../../scratch/p7/patch.ts`).

## 1. `ssr: false` ships a head for routes the server never rendered — CONFIRMED

`scratch/p7/ssr-head.ts`, chain `root` → `account` (`ssr: false`) → `leaf`:

```
heads that RAN on the server: root, account, leaf
head bytes: <title data-barq-head="title">Account</title>
            <meta data-barq-head="meta:name:root" name="root" content="yes">
            <meta data-barq-head="meta:name:leaf" name="leaf" content="SHIPPED-BELOW-SSR-FALSE">
body bytes: <div><!--[--><!--]--></div>          <- nothing below `account` rendered
context:    produced:[{user:"ada"}, void 0, void 0]  <- beforeLoad skipped for both
```

The body correctly stops at the `ssr: false` depth; the head does not.

TANSTACK, FROM SOURCE — `router-core/src/load-server.ts:623-654` (`projectLane`):
the head for a match runs, and THEN

```js
if (match.ssr === false || match.status !== 'success' || match._notFound) break
```

So the `ssr: false` route's own `head` DOES run on the server; every depth below it
does not. barq runs all of them. `projectHead` (`packages/router/src/server.ts:512`)
maps the whole chain and never consults `resolveSsr`.

Fix: truncate the chain handed to `projectHead` at the first `false` depth, INCLUSIVE
of that depth. One `resolveSsr` call at the call site.

NOTE, and it kills half the original report: barq's `HeadContext` (`head.ts:76-83`)
has no `context` field, and neither does TanStack's `AssetFnContextOptions`
(`router-core/src/route.ts:1194-1241`). A `head` cannot read route context in either
framework, so "reading a context missing its own contribution" is not reachable
through the documented API. What ships wrong is the TAGS, not a value inside them.

## 2. A throw between `setContexts` and the render leaks the router state — CONFIRMED by reading

`packages/router/src/server.ts`: `preloadMatched`, `projectHead`, `contextScript` and
`preloadTags` all run between `state.setContexts(before.contexts)` and the `try {` that
owns `dispose()`. Any throw there escapes with the state undisposed — the loader cache
kept and history still subscribed.

Fix is structural, not a new catch: hoist `let disposed` / `const dispose` to just after
`createRouter(config)` and move the `try {` up to before `preloadMatched`.

## 3. The client patcher rewrites an UNOWNED `<title>` — CONFIRMED

`scratch/p7/patch.ts` case B, shell ships `<title>My App</title>`:

```
head: <title>About</title><title data-barq-head="title">About</title>
title count: 2      UNOWNED node was rewritten? "About"
```

`applyTags` ends with `target.title = …`, and the `document.title` setter writes the
FIRST `<title>` in tree order — the application's, not ours. That is a direct violation
of the rule stated in `applyTags`'s own comment ("only nodes carrying `data-barq-head`
are ever removed or rewritten").

Case C, retracting a title with no shell fallback: the setter CREATES an unowned
`<title>` and every later navigation writes into that one instead of the owned node —
`after retraction: <title>My App</title>` with `unowned titles: 1`, then two titles
forever.

Case D, `captured` is a module-level singleton:
`d2's original was DOC-TWO; restored to "My App"`.

## 4. A nonce defeats node reuse on the client's first apply — CONFIRMED

`scratch/p7/patch.ts` case A, identical tag re-applied over server bytes carrying a nonce:

```
served: <script data-barq-head="script:{&quot;children&quot;:&quot;a=1&quot;}">a=1</script>
same node reused? false
```

`sameTag` (`head.ts:476-490`) allows exactly `+1` attribute for `data-barq-head`; the
nonce makes the count `+2`, so nothing ever matches and the node is replaced — which
re-executes the script. `nonce` has to be excluded by NAME on both sides, not by value:
a browser under CSP empties the nonce content attribute but keeps the attribute present.

## 5. `bun run preview` is 100% broken — CONFIRMED by reading

`packages/kitchen-sink/package.json:9` is `node ./preview.mjs`; the file uses `Bun.serve`
and `Bun.file`. Also no `Cache-Control`, no ETag, no 304, no HEAD, no trailing-slash 308,
a five-entry MIME table, and a missing `/assets/*.js` is answered with an SSR HTML shell.

`serveBarq` (`packages/start/src/serve.ts:56`) still has zero callers. This one belongs
with HANDOVER item 3 (the production server and a deployable output), not with the head.
