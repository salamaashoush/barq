# HYDRATION_SEED_DRIFT

**Severity:** warning. Raised in the browser by `hydrate`, in a development
build.

## Message

```text
The server sent 1 async value that no `createMemo` in the browser asked for (r0001). The
browser rendered a different set of components than the server did, so an async memo may be
showing a value the server computed for another one. Render the same components on both
sides, and name each async memo so that a mismatch fetches again instead:
`createMemo(load, { name: "user" })`.
```

## What raises it

The server resolves every async memo it renders and sends the values with the
page, so the browser does not fetch them again. A value is matched to its memo
by the memo's position among the ones that were created. When the browser
renders a different set of components, the positions shift:

```tsx
import { Loading, createMemo } from "@barqjs/core";

function Notice() {
  const notice = createMemo(async () => (await fetch("/api/notice")).text());
  return <p>{notice()}</p>;
}

function Profile() {
  const user = createMemo(async () => (await fetch("/api/user")).text());
  return <h1>{user()}</h1>;
}

export default function Page() {
  return (
    <Loading fallback={<p>Loading</p>}>
      {typeof window === "undefined" ? <Notice /> : null}
      <Profile />
    </Loading>
  );
}
```

The server renders `Notice` and then `Profile`, and sends two values. The
browser renders only `Profile`, whose memo is now the first one, so it takes
the notice and the heading shows it. The user's value is left over, and this
diagnostic lists it.

## The fix

Render the same components on both sides, and name the async memos:

```tsx
import { Loading, createMemo } from "@barqjs/core";

function Notice() {
  const notice = createMemo(async () => (await fetch("/api/notice")).text(), { name: "notice" });
  return <p>{notice()}</p>;
}

function Profile() {
  const user = createMemo(async () => (await fetch("/api/user")).text(), { name: "user" });
  return <h1>{user()}</h1>;
}

export default function Page() {
  return (
    <Loading fallback={<p>Loading</p>}>
      <Notice />
      <Profile />
    </Loading>
  );
}
```

Rendering the same components is what removes the diagnostic. The names are
the safety net: a named memo that finds no value of its own fetches again
instead of taking another memo's, so a difference that slips through costs a
request and not a wrong heading. `key` replaces the position outright and has
to be unique on the page: `createMemo(load, { key: "current-user" })`.

## Why it is reported

A value matched to the wrong memo is wrong data on the page, shown at once and
with no error, where a miss would only have cost one more request. Nothing can
tell the two apart at the moment a memo reads its value. A value that nobody
asked for is the evidence that positions shifted, and it is only available once
hydration has finished.

## Where it shows

Each console entry is followed by the component it happened in, as
`in <App> › <Row>` (from a development compile, which names the components it
calls), and by the address of this page.

A development build prints `[barq] HYDRATION_SEED_DRIFT: ...` to the console,
and the dev overlay lists it. The event's `data.keys` is the list of leftover keys:

```ts
import { DEV } from "@barqjs/core";

const stop = DEV.diagnostics.subscribe((event) => {
  if (event.code === "HYDRATION_SEED_DRIFT") console.warn(event.message, event.data?.keys);
});
```

There is no comment that silences a runtime diagnostic. A production build
subscribes nothing, so nothing is reported there.
