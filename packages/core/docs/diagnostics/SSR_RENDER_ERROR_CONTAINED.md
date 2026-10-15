# SSR_RENDER_ERROR_CONTAINED

**Severity:** error. Raised on the server by `renderToStream`, in a development
build, for a throw after the shell was sent.

## Message

```text
Part of the page threw `Error: profile service is down` while it rendered after the shell had
been sent. The status and headers were already on the wire, so the page streamed on: the
nearest error boundary the stream wrote shows its fallback, and without one the part keeps its
loading fallback and the browser builds it again. Fix the throw at the top of the stack, or wrap
the part in `<Errored>` or give its route an `errorComponent` to show the failure on purpose.
```

The development server shows it in the browser's overlay as a server entry,
with the stack mapped to your source and a link to the line that threw. The
console line names the component path, as `in <Page> › <Profile>`.

## What raises it

A part of the page that renders after the shell, inside `<Loading>`, throws:

```tsx
import { Loading, createMemo } from "@barqjs/core";

async function loadProfile(): Promise<{ name: string }> {
  throw new Error("profile service is down");
}

function Profile() {
  const profile = createMemo(() => loadProfile());
  return <p>{profile().name}</p>;
}

export function Page() {
  return (
    <Loading fallback={<p>Loading the profile</p>}>
      <Profile />
    </Loading>
  );
}
```

The shell, with its `200` status, is on the wire before `loadProfile` rejects.

## The fix

Fix the throw. Where the part can fail for reasons outside your code, say what
the page shows when it does:

```tsx
import { Errored, Loading, createMemo } from "@barqjs/core";

async function loadProfile(): Promise<{ name: string }> {
  return { name: "Salama" };
}

function Profile() {
  const profile = createMemo(() => loadProfile());
  return <p>{profile().name}</p>;
}

export function Page() {
  return (
    <Errored fallback={<p>The profile could not be loaded.</p>}>
      <Loading fallback={<p>Loading the profile</p>}>
        <Profile />
      </Loading>
    </Errored>
  );
}
```

## Why it is reported

The response cannot carry the failure: its status was sent with the shell. A
stream that tore the response down would leave a truncated page, so the stream
contains the error and goes on. Without this report the only trace is a line in
the server's terminal and a fallback that never resolves in the browser.

## Where it shows

Each console entry is followed by the component it happened in, as
`in <App> › <Row>` (from a development compile, which names the components it
calls), and by the address of this page.

`renderToStream`'s `onError` receives the error, and prints it with
`console.error` when none is given. The diagnostic is on the same channel as
the browser's:

```ts
import { DEV } from "@barqjs/core";

const stop = DEV.diagnostics.subscribe((event) => {
  if (event.code === "SSR_RENDER_ERROR_CONTAINED") console.error(event.message, event.data?.error);
});
```

A production build subscribes nothing, so nothing is reported there beyond
`onError`.
