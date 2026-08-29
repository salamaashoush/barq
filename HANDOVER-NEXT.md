# barq — next session

Paste this as the opening prompt. Everything below was verified, not remembered.

---

## How I want you to work

1. **Agree a public API shape with me BEFORE building it.** Put the shape up, wait,
   then build. This is the rule the whole `createFileRoute` migration exists because
   an earlier session broke.
2. **Treat every comment, registry row and gate as a CLAIM to verify, not a law.**
   Check it against the reference implementation from SOURCE — clone it, quote
   `file:line`. Never from memory. Do not rewrite a comment casually; do question it.
   Three gates in this repo turned out to encode a bug rather than catch one, and
   all three were found this way.
3. **Measure, then fix.** A probe in `scratch/` is a vibe; a test in the suite is a
   proof. Every fix lands with the test that would have caught it.
4. Do not write design documents. The reasoning goes in a comment beside the thing
   and in the commit message.
5. Every gate green before each commit.

## State — verified

```
core 921 · server 103 · router 312 · start 59 · extra 26 · testing 16 — all 0 fail
compiler-rs: cargo 344 pass · bun 3652 pass / 0 fail / 17 todo
  (the "1 error" is a self-check that fires BECAUSE nothing fails — do not chase it)
L5 buffered oracle 284 · L5-S streaming oracle 144 — both 0 fail
bun run ci (lint + format) clean
```

The Rust workspace root is `packages/compiler-rs`, not the repo root.

**~111 files are uncommitted on `main`.** That includes incidental formatting churn
under `packages/compiler-rs/scratch/` from bringing that package into the repo-wide
format scope. Commit before starting anything new. Suggested split, each green on
its own: document hydration · route surface · renderer unification · stream frame ·
eager seeding · islands.

## THE INITIAL WORK, and it is what to do next

`createFileRoute` — barq's route modules move to TanStack Start's authoring
surface. The router half is DONE; the compiler and the reference app are not.

### Already landed

`packages/router/src/file-route.ts` — `createFileRoute(id)(options)`,
`createRootRoute(options)`, `createRootRouteWithContext<C>()(options)`, and the
route-scoped hooks (`useLoaderData`/`useParams`/`useRouteContext`/`useMatch`/
`useNavigate`). Hooks resolve the match AT CALL TIME so a hook called from the
wrong module throws naming both ids — that is what TanStack's `from:` prevents.
`<Outlet />` is in `components.ts` and places the same Block `children` always was,
so a layout's providers still wrap the route it renders. `pending` →
`pendingComponent`, `searchMiddlewares` → `search: { middlewares }`.

### What remains — all of it compiler + app

1. **`packages/compiler-rs/src/routes.rs` reads the wrong thing.** `read_config`
   is a line-scan for `export const ssr` / `export const prerender`. It must
   oxc-PARSE the module, find `export const Route = createFileRoute("<id>")({…})`
   or `createRootRoute({…})`, and read `ssr`/`prerender` as literal properties of
   that options object. oxc is already a dependency and already parses.
2. **The path literal is generator-owned.** Agreed with the user: when the literal
   disagrees with the id derived from the filename, the generator REWRITES it in
   the source file, as TanStack's plugin does. Use the oxc span and splice bytes so
   the rest of the file is untouched.
3. **File conventions move to TanStack's** (`docs/router/routing/file-based-routing.md:60-77`):
   `__root.tsx` for the root, a bare `posts.tsx` is automatically the layout for
   `posts.*` (no `.route` suffix), `_pathlessLayout.tsx`, and `posts_.$postId.tsx`
   to escape nesting. `build_tree` currently keys on `.route` and `route.tsx`.
4. **`generate_module`'s pickers** read `m.default` / `m.loader` / `m.head` /
   `m.Pending` / `m.shellComponent`. They become `m.Route.options.component`,
   `.loader`, `.head`, `.pendingComponent`, and the root's `.shellComponent`.
   `lazy()` already takes a picker, so this is the same shape.
5. **The `.d.ts` `DataOf<M>`** resolves `M extends { loader: infer L }`; it has to
   go through `Route`'s options.
6. **`packages/kitchen-sink`** — rename every route file and rewrite it to one
   `export const Route`, `<Outlet />` and `Route.useLoaderData()`.

Do 1–5 before 6 so the app is rewritten ONCE, against the finished shape.

## Decisions already made — do not relitigate

- Components take no props: `Route.useLoaderData()` and `<Outlet />`, not `RouteProps`.
- The generator rewrites the `createFileRoute` path literal in source.
- File conventions align to TanStack.
- **Selective hydration is WITHDRAWN.** React's version is a remedy for a cost a
  fine-grained framework does not pay — `ReactFiberBeginWork.js:1966-1972` hydrates
  inside the render loop, so React re-executes every component and needs lanes to
  slice it. barq runs components once and hydrates by walking the DOM: measured
  1000 dense rows = 15.6 ms. Solid has no hydration scheduler at all
  (`client.js:251-268` is one synchronous `render`). The fine-grained answer was
  islands, and islands are DONE.
- **The head becomes a rendered tree and barq hydrates the DOCUMENT** (agreed,
  not yet built — see below).

## Still open

**The head rework, and the kitchen-sink entry depends on it.** `<HeadContent />`
stays in the shell's `<head>`, the SHELL becomes part of the hydrated region, and
`installHead` / `applyTags` / `sameTag` / `OWNED` / `captureHead` are DELETED —
navigation updates the head through ordinary reactivity. Core is READY: `hydrate`
takes a `Document`, the claim walk skips the doctype, and `element()` claims
(`claimElement` + the compiler's `TAGGED`), so a tree rooted at `<html>` hydrates
with 0 mismatches. Two red-team findings (the unowned `<title>` write, the nonce
defeating node reuse) stop existing when the patcher goes, so do not fix them first.

**From `scratch/p9/SSR-GAPS.md`, still open:** runtime scripts are emitted after
the shell instead of in `<head>` (Solid's `HydrationScript` is a head component);
no asset hoisting, so a late boundary's `<link>`/`<title>` can never reach `<head>`;
no bounded stream buffers (TanStack errors at three explicit limits).

**Red-team item 1, still true of shipped code** — measurements in
`scratch/p7/FINDINGS.md`:
- `ssr: false` ships a head for routes the server never rendered. `projectHead`
  (`packages/router/src/server.ts:529`) maps the whole chain. TanStack runs the
  `ssr: false` route's own `head` and then BREAKS the lane
  (`router-core/src/load-server.ts:651`).
- A throw between `setContexts` and the render leaks the router state:
  `projectHead` at `:529` is still above `let disposed` at `:570`. Structural fix —
  hoist `dispose` and move the `try` up.
- `bun run preview` is 100% broken: `package.json:9` runs `node ./preview.mjs` and
  the file uses `Bun.serve`. Belongs with the production-server work, not the head.

## Traps that cost real time

- **Stale `dist/` bites.** Type-aware lint and `tsc` resolve workspace types through
  `dist/*.d.ts`. After editing `packages/core` or `packages/router`, run
  `bun run build` there before linting anything downstream. After editing
  `packages/compiler-rs/src`, run `bun run build` there too — it is a napi binary and
  `cargo test` passing does not mean the `.node` was rebuilt.
- **`oxfmt <dir>` rewrites MARKDOWN and would rewrite `fixtures/`.** Both break
  tests: `semantics.test.ts` parses `SEMANTICS.md`'s §13 table, and fixture
  whitespace is semantic (`pre-dynamic-leading-newline` exists for a leading
  newline). The root `format` scope names `packages/compiler-rs/src` and
  `packages/compiler-rs/test` explicitly for that reason.
- **`Helper` discriminants index `IMPORTED`**, and `FIRST_SERVER_HELPER` /
  `FIRST_INTERP_HELPER` slice that array. Appending a helper at the end files it
  under `/interp`. A construct needs TWO forms: the region form and a `(s, props)`
  component form for `-O0`/flow-pass-off. There is a THIRD backend, `interp`, with
  its own dispatch.
- **Adding a corpus fixture owes six registries** a row: effect counts, the
  ownership census, optimality, the mode matrix, the leak oracle and the ownership
  reach pin. Each failure prints the observed value to paste.
- `grep -a` under `packages/compiler-rs/test/` — `ssr.test.ts` is classified binary
  and grep silently prints nothing for literals that are plainly there.
- **Anything a ROUTE MODULE imports ships to the browser.** `shellComponent` and
  `head` live in route modules, so they may only import `@barqjs/router`, never
  `@barqjs/router/server` — that reaches `node:async_hooks`, Vite externalises it,
  and the page renders EMPTY with a correct head above it.
- A component IS a Block. `readSlot` refuses one in a value slot.
- A new diagnostic needs a `docs/BARQ0xx.md`, a `docs/README.md` row and a reachable
  entry in `test/diagnostics.test.ts`. Next free code is BARQ014; 006 and 007 are
  tombstones.

## Where the references are

Cloned this session, and worth keeping: TanStack `router`, `solidjs/solid`,
`ryansolid/dom-expressions`, `facebook/react` (sparse). Clone from the CANONICAL
org and quote `file:line` for every claim about what another framework does.
