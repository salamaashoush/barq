# HYDRATION_MISMATCH

**Severity:** warning. Raised in the browser by `hydrate`, in a development
build.

## Message

```text
Hydration mismatch (structure): the server sent `<main>` where the browser builds `<div>`.
This usually means the component renders different elements on the server and in the browser
(a branch on `typeof window`, on the time, or on data only one side has), the markup nests
elements the browser's HTML parser moves (a `<div>` inside a `<p>`), or a browser extension
changed the page before it hydrated. The server's markup was discarded and the whole page was
rendered again in the browser, so it works but the server-rendered first paint was thrown
away.
```

The word in parentheses is the kind of mismatch. Each kind has its own usual
causes, listed under [Kinds](#kinds).

## What raises it

`hydrate` walks the server's markup and reuses its nodes. It reports this when
a node the server sent is not the node the component builds in the browser:

```tsx
export default function Page() {
  return typeof window === "undefined" ? <main>Welcome back</main> : <div>Welcome back</div>;
}
```

The server has no `window` and sends `<main>`. The browser has one and builds
`<div>`.

## The fix

Render the same elements on both sides, and move what really differs into
content or attributes that update after hydration:

```tsx
import { createSignal, onSettled } from "@barqjs/core";

export default function Page() {
  const [inBrowser, setInBrowser] = createSignal(false);
  onSettled(() => {
    setInBrowser(true);
  });
  return <main data-ready={inBrowser() ? "yes" : "no"}>Welcome back</main>;
}
```

## Kinds

- `structure`: an element, a text node or a number of nodes differs. Usual
  causes: a branch on `typeof window`, on the time or on data only one side
  has; markup the browser's HTML parser repairs, such as a `<div>` inside a
  `<p>`; a browser extension that edits the page.
- `text`: the text differs. Usual causes: `Date.now()`, `Math.random()`,
  `toLocaleString()` in another locale or time zone; an extension or a page
  translator; server and browser bundles built from different sources.
- `range`: the comments `<!--[-->` and `<!--]-->` that the server writes around
  dynamic content are missing or unbalanced. Usual causes: an HTML minifier, a
  proxy or a CDN that strips comments; a script that edits the page before it
  hydrates; bundles built from different sources.
- `key`: the server rendered one branch of a conditional and the browser picks
  another. Usual causes: a condition that reads `typeof window`,
  `localStorage`, a media query or the time.
- `not-hydratable`: one side was compiled without hydration markers. Set
  `ssr: true` in `barq()` from `@barqjs/vite`, which compiles both the server
  build and the browser build hydratable, and deploy the two together.

## What happens next

Two kinds are repaired where they happen. A dynamic text hole whose value
differs is rewritten in the server's node, and a conditional such as `<Show>` or
`<Switch>` that picks another branch rebuilds only that branch. The rest of the
server's markup is reused. Those repairs are listed in
`hydrate.report.mismatches` and raise no diagnostic. Otherwise the server's markup is discarded and the whole page is rendered again
in the browser, which is when this diagnostic is raised. The page works either
way. What is lost is the benefit of server rendering: the first paint is
replaced, and the browser does the full render it was meant to skip.

## Why it is reported

A page that silently re-renders looks correct and is slower than a page that
was never server-rendered. Without the report the only symptom is a flash of
content, and the cause is in whichever component reads something the server
does not have.

## Where it shows

Each console entry is followed by the component it happened in, as
`in <App> › <Row>` (from a development compile, which names the components it
calls), and by the address of this page.

A development build prints `[barq] HYDRATION_MISMATCH: ...` to the console, and
the dev overlay lists it. In a development compile the message also says where
the template being hydrated was written (`The template being hydrated is at
src/greeting.tsx:3:49.`), the event carries it as `event.data.template`, and the
overlay links it to the editor. The component the walk was in follows as
`in <Page> › <Greeting>`. `hydrate.report` holds the same information in every
build:

```ts
import { DEV } from "@barqjs/core";
import { hydrate } from "@barqjs/web";

const stop = DEV.diagnostics.subscribe((event) => {
  if (event.code === "HYDRATION_MISMATCH") console.warn(event.message, event.docs);
});

export function mismatchesOfLastHydrate(): readonly { kind: string; detail: string }[] {
  return hydrate.report.mismatches;
}
```

There is no comment that silences a runtime diagnostic. A production build
subscribes nothing, so nothing is reported there.
