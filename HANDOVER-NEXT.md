# barq — next session

Paste this as the opening prompt. Everything below was verified, not remembered.

---

## How I want you to work

1. **Agree a public API shape with me BEFORE building it.** Put the shape up, wait,
   then build.
2. **Treat every comment, registry row and gate as a CLAIM to verify, not a law.**
   Check it against the reference implementation from SOURCE — clone it, quote
   `file:line`. Never from memory.

   **A gate written by an agent is not evidence.** Four of them were wrong this
   session and were FIXED rather than worked around; two had been passing by
   accident and one asserted the defect it existed to catch. When a gate objects
   to a correct fix, read what it is actually pinning before you believe it. Do
   not revert a fix because a gate complains — I had to say this twice.
3. **Measure, then fix.** A probe in `scratch/` is a vibe; a test in the suite is a
   proof. Every fix lands with the test that would have caught it, and falsify the
   test before you land it — break the fix and watch it go red.
4. Do not write design documents. The reasoning goes in a comment beside the thing
   and in the commit message.
5. Every gate green before each commit. Do not leave the tree red at a stopping
   point; if you cannot finish, revert to green and say what is unfinished.

## State — verified

```
core 921 · router 320 · server 104 · start 59 · extra 26 · testing 16 · compiler 22
compiler-rs: cargo 363 pass · bun 3656 pass / 0 fail / 17 todo (3673 across 24 files)
  (the "1 error" is a self-check that fires BECAUSE nothing fails — do not chase it)
bun run ci (lint + format) clean · cargo clippy 0 · cargo fmt clean
kitchen-sink: typechecks, builds, prerenders `/` and `/about`
```

The Rust workspace root is `packages/compiler-rs`, not the repo root.

**The tree is clean and committed.** 18 commits since the last handover, 156 files,
+12773/−7467. `git log 55a16fd..HEAD`.

## What landed

**`createFileRoute`.** Route modules have ONE export and it is called `Route`.
All eight TanStack file conventions, ported from their ALGORITHM rather than
their docs — nesting is a walk up the `/` segments of the absolute route path
taking the longest registered prefix (`router-generator/src/utils.ts:47-62`),
which is why `posts_` un-nesting needs no rule of its own. The id literal is
generator-owned: dev rewrites it in place, a build refuses.

**The head is the render.** `installHead`, `applyTags`, `sameTag`, `elementFor`,
`captureHead` and the `data-barq-head` attribute are GONE. `hydrate(…, document)`,
the shell is a component, `<HeadContent />` is a keyed list. Verified in Chrome:
`mismatches: []`, `claimed: 97`, `built: 0`, and the title lands in the same poll
as the content (`gapMs: 0` — the patcher was a tick late, so the tab title lagged
one navigation behind on every link).

**The client entry is three lines**, like theirs. `startClient` owns the boot
order; providers moved to `__root.tsx`.

**Four measured defects fixed:** the white flash (three separate causes — head
serialised before the body, `extractCss` draining per request, `globalCss` never
reaching the server at all), every nav link rendering its text twice on hydration
(`element.append` into a claimed node — CLS 0.0003 → 0), server-rendered fields
arriving empty, and `<Dynamic component="script">` shipping HTML-escaped
JavaScript.

## THE INITIAL WORK, and it is what to do next

**`routes.gen.ts` — the route table becomes a real, fully typed file.** I do not
want `virtual:barq-routes`; TanStack generates `routeTree.gen.ts` and the app
imports it by path (`examples/react/start-basic/src/router.tsx:2`), with no
virtual specifier anywhere in a Start application.

A partial attempt is saved and REVERTED — it left the crate not building. Start
from the design, not the patch, but the patch has the shape:

```
/tmp/claude-1000/-home-sashoush-Workspace-barq/97e0e475-.../scratchpad/routes-gen-wip.patch
```

What it contains: `generate_module(tree, out_dir)` emitting annotated TypeScript
(`RouteExports`/`Options`/`Load`, typed `lazyLoader`/`lazyAsset`/`lazyMiddleware`,
`export const routes: AnyRouteDefinition[]`), `generate_types` with the
`declare module` wrapper removed so it can live in the same file, and `barqRouter`
writing it with a `writeOnChange` guard.

TWO THINGS THE PATCH GOT RIGHT AND THE NEXT PASS MUST KEEP:

- **The dynamic imports have to become RELATIVE.** They are
  `import("/src/routes/x.tsx")` today — root-absolute, which is the FILESYSTEM
  root to TypeScript and silently resolves to `any`. That is the same trap the
  `.d.ts` already works around with `specifier_from`, and it is the one change
  that actually buys type safety on a lazy table.
- **`src:` stays root-absolute.** It is a manifest key the bundler matches on,
  not an import.

`writeOnChange` is not an optimisation: the table is regenerated on every route
file event and the watcher watches the file it writes, so rewriting identical
bytes is a loop.

## Still open

**The server entry is still 49 lines.** The client one is three. Theirs is two
(`react-start/src/default-entry/server.ts`:
`createStartHandler(defaultStreamHandler)`). `entry-server.tsx` still carries
`options`, `createPageHandler`, `chainVerifier` and four virtual-module imports.

**Applications still ship entry files at all.** TanStack's are DEFAULT ENTRIES the
app never writes, resolved by `resolveEntry` + a `#tanstack-router-entry` alias,
with an app override at `src/client.tsx`/`src/server.ts`. That is a Vite-plugin
change, not a router change.

**Red-team item 1, still true of shipped code** — measurements in
`scratch/p7/FINDINGS.md`:

- `ssr: false` ships a head for routes the server never rendered. `projectHead`
  (`packages/router/src/server.ts:531`) maps the whole chain. TanStack runs the
  `ssr: false` route's own `head` and then BREAKS the lane
  (`router-core/src/load-server.ts:651`).
- A throw between `setContexts` and the render leaks the router state:
  `projectHead` at `:531` is still above `let disposed` at `:593`. Structural fix —
  hoist `dispose` and move the `try` up.
- `bun run preview` is broken: `packages/kitchen-sink/package.json:9` runs
  `node ./preview.mjs` and the file uses `Bun.serve`.

**From `scratch/p9/SSR-GAPS.md`, still open:** runtime scripts are emitted after
the shell instead of in `<head>` (Solid's `HydrationScript` is a head component);
no asset hoisting, so a late boundary's `<link>`/`<title>` can never reach
`<head>`; no bounded stream buffers (TanStack errors at three explicit limits).

**`<textarea>`, `<select>` and `<output>` still SSR without their value.** `value`
is not a content attribute on any of them — a textarea's is its child text and a
select's is the selected option — so serialising them correctly means emitting
CHILDREN, which is not a thing an attribute function can do. `attr` says nothing
there today, which is honest but incomplete.

## Traps that cost real time

- **Stale `dist/` bites, and it bit twice.** Type-aware lint and `tsc` resolve
  workspace types through `dist/*.d.ts`. After editing `packages/core` or
  `packages/router`, run `bun run build` there before linting anything downstream.
  After editing `packages/compiler-rs/src`, run `bun run build` there too — it is a
  napi binary and `cargo test` passing does not mean the `.node` was rebuilt.
  ADDING AN EXPORT is the same rule: a new `exports` subpath whose `dist` file has
  not been built resolves under the `bun` condition (which points at `src/`) and
  fails under `import`, so it works for you and breaks for the app.
- **`packages/compiler-rs/test/browser-differential.ts` is EMBEDDED into a page.**
  A backtick in a comment there terminates the template literal and the file stops
  parsing. Eleven tests silently vanished from the run before I noticed the count.
- **A hand-written component cannot use `each` for a hydrating list.** `each` claims
  through `claimAt(parent, anchor, …)` and a component has neither — which is why
  the compiler emits `_$each(_s$, _el$2, _el$6, …)`. Use `element()`, which claims
  the next node by TAG.
- **`readSlot` refuses a Block.** `props.children` crosses BY IDENTITY; reading it
  through a value slot throws "was invoked without a scope".
- **`mount` hands your callback the root scope.** Ignoring it and passing `null`
  skips every `provide` above the tree, and hydration still CLAIMS — so it looks
  fine until the first update reconciles everything away.
- **`oxfmt <dir>` rewrites MARKDOWN and would rewrite `fixtures/`.** The root
  `format` scope names `packages/compiler-rs/src` and `test` explicitly for that
  reason.
- **`Helper` discriminants index `IMPORTED`**, and `FIRST_SERVER_HELPER` /
  `FIRST_INTERP_HELPER` slice that array. Appending a helper at the end files it
  under `/interp`. A construct needs THREE forms: the region form, a `(s, props)`
  component form, and `interp`.
- **Adding a corpus fixture owes six registries** a row. Each failure prints the
  observed value to paste.
- `grep -a` under `packages/compiler-rs/test/` — `ssr.test.ts` is classified binary.
- **Anything a ROUTE MODULE imports ships to the browser.** `shellComponent` and
  `head` live in route modules, so they may only import `@barqjs/router`, never
  `@barqjs/router/server`.
- A new diagnostic needs a `docs/BARQ0xx.md`, a `docs/README.md` row and a reachable
  entry in `test/diagnostics.test.ts`. Next free code is BARQ014; 006 and 007 are
  tombstones.

## Where the references are

Clone from the CANONICAL org and quote `file:line` for every claim about what
another framework does: TanStack `router`, `solidjs/solid`,
`ryansolid/dom-expressions`, `solidjs/solid-start`, `solidjs/solid-meta`.

**Solid and TanStack do the head OPPOSITELY, and the difference is settled.**
`@solidjs/meta` renders `null` for every tag and patches `document.head`
imperatively (`solid-meta/src/index.tsx:60-64,177,222`) — that was barq's old
design. TanStack hydrates the document and renders the tags as a tree
(`react-start/src/default-entry/client.tsx`,
`react-router/src/HeadContent.tsx:22-26`). **barq follows TanStack.** Do not
reintroduce the patcher on the strength of Solid's source.
