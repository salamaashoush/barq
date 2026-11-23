# @barqjs/db

Live queries for barq over [TanStack DB](https://tanstack.com/db) collections:
`useLiveQuery`, `useLiveInfiniteQuery`, `useLiveSuspenseQuery`, server
rendering and hydration, on `@tanstack/db`. The API follows
`@tanstack/react-db`, so the collections an application already defines carry
over unchanged and the hooks change only where barq's model differs from
React's, listed below.

## Install

```bash
bun add @barqjs/db
```

`@barqjs/core` and `@barqjs/web` are peer dependencies. `@tanstack/db` is a
dependency of this package and is re-exported from it, so `createCollection`,
`eq`, `BasicIndex` and the rest come from the same import. Collection adapters
such as `@tanstack/query-db-collection` install beside it.

## Example

A channel list and a message feed over collections that a `QueryClient` fills.

```tsx
import { For, Show, createSignal } from "@barqjs/core";
import { render } from "@barqjs/web";
import { QueryClient } from "@tanstack/query-core";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { BasicIndex, createCollection, eq, useLiveInfiniteQuery, useLiveQuery } from "@barqjs/db";

interface Channel {
  id: string;
  workspace_id: string;
  name: string;
}
interface Message {
  id: string;
  channel_id: string;
  text: string;
  created_at: string;
}

const queryClient = new QueryClient();

const channels = createCollection(
  queryCollectionOptions<Channel>({
    queryKey: ["channels"],
    queryFn: () => fetch("https://example.com/api/channels").then((r) => r.json()),
    queryClient,
    getKey: (channel) => channel.id,
  }),
);

const messages = createCollection(
  queryCollectionOptions<Message>({
    queryKey: ["messages"],
    queryFn: () => fetch("https://example.com/api/messages").then((r) => r.json()),
    queryClient,
    autoIndex: "eager",
    defaultIndexType: BasicIndex,
    getKey: (message) => message.id,
  }),
);

function Feed(props: { channelId: string }) {
  const feed = useLiveInfiniteQuery(
    (q) =>
      q
        .from({ message: messages })
        .where(({ message }) => eq(message.channel_id, props.channelId))
        .orderBy(({ message }) => message.created_at, "desc"),
    { pageSize: 50 },
  );

  return (
    <>
      <For each={feed.data} keyed={(message: Message) => message.id}>
        {(message: () => Message) => <p>{message().text}</p>}
      </For>
      <Show when={feed.hasNextPage}>
        <button onClick={() => feed.fetchNextPage()}>older</button>
      </Show>
    </>
  );
}

function App() {
  const [workspaceId] = createSignal<string | null>("acme");
  const [channelId, setChannelId] = createSignal("general");

  const list = useLiveQuery((q) => {
    const id = workspaceId();
    return id
      ? q.from({ channel: channels }).where(({ channel }) => eq(channel.workspace_id, id))
      : null;
  });

  return (
    <>
      <Show when={list.isReady} fallback={<p>loading</p>}>
        <For each={list.data ?? []} keyed={(channel: Channel) => channel.id}>
          {(channel: () => Channel) => (
            <button onClick={() => setChannelId(channel().id)}>{channel().name}</button>
          )}
        </For>
      </Show>
      <Feed channelId={channelId()} />
    </>
  );
}

render(() => <App />, document.getElementById("app")!);
```

## Coming from `@tanstack/react-db`

- **No dependency array, no identity to derive.** The query callback runs in a
  memo. A signal or prop it reads compiles the query again when it changes, so
  `useLiveQuery((q) => ..., [channelId])` becomes `useLiveQuery((q) => ...)`.
  A `queryKey` is only the identity a `DbClient` matches a preloaded or
  hydrated result by.
- **Read fields where they render.** The result is an object whose fields are
  each their own dependency: `list.data`, `list.isLoading`. A component body
  runs once, so `const { data } = useLiveQuery(...)` at its top reads `data`
  once and never again. Read `list.data` in JSX or in a memo.
- **A function input is always a query callback.** It is called with the
  builder and may return a query, a config object, a Collection or `null`, so
  `() => liveCollection` and `() => ({ query, gcTime })` are inputs too, and a
  signal they read swaps them.
- **`useLiveInfiniteQuery` takes its config as an object or an accessor.** A
  signal the accessor reads (`pageSize`) applies the new page shape.
- **Rows keep their identity.** An unchanged row is the same object from one
  result to the next. `For` with `keyed={(row) => row.id}` keeps a row's
  element when only its fields change and hands it an accessor that updates.
- **Suspense is barq's `Loading`.** `useLiveSuspenseQuery` parks the enclosing
  `Loading` boundary until the first result, and a failed first load or a crash
  reaches the enclosing `Errored` boundary.

The 0.x `isError` flag is `isLoadingError` in the 1.0 RC this adapter follows,
and `isSyncError` reports a sync problem after the data is shown.

## API

- `useLiveQuery(input)`: `data` (rows in order; one row or `undefined` for
  `findOne`), `state` (rows by key), `collection`, `status`, `isLoading`,
  `isReady`, `isIdle`, `isLoadingError`, `isCrashed`, `isCleanedUp`,
  `isSyncError`, `isEnabled` and `health`. A disabled query has
  `status: "disabled"`, `isReady: true` and no `data` or `state`.
- `useLiveInfiniteQuery(input, config)`: the query must have an `orderBy`.
  `data`, `pages`, `pageParams`, `hasNextPage`, `isFetchingNextPage` and
  `fetchNextPage()`, plus the status fields. A page fetch widens the window of
  the same live query, so the loaded rows stay live. `pageSize` defaults to 20.
- `useLiveSuspenseQuery(input)`: `data`, `state`, `collection` and `health`,
  parking `Loading` until ready.
- `useLiveQueryEffect(config)`: `onEnter`, `onUpdate`, `onExit` and `onBatch`
  for a live query's deltas, for as long as the calling scope lives.
- `usePacedMutations(config)`: optimistic mutations persisted on a
  `debounceStrategy`, `throttleStrategy` or `queueStrategy`.
- `DbProvider`, `useDbClient()`, `useOptionalDbClient()`: the `DbClient` that
  resolves `collectionOptions` descriptors in a query's `from`.
- `HydrationBoundary`: puts a `DehydratedDbState` into the client in scope
  before what is below reads it.
- Everything `@tanstack/db` exports.

## Server rendering

Nothing needs setting up for a page rendered with `renderPage` or
`renderToStream` from `@barqjs/server`. On the server a live query preloads its
collections, parks the `Loading` boundary around it until they are ready, and
renders the rows. The rows it rendered go to the page with the rest of the
render's async values. Hydration renders those rows while the browser's own
collections start, so the markup matches and nothing flashes a loading state,
and each query hands over to its live result once that is ready or has failed.
On a streamed page a query whose boundary had not settled when the shell went
out waits for its rows to arrive down the stream.

The server's rows stand in for the first result only: the browser's
collections still sync, and a `queryCollectionOptions` collection still runs its
`queryFn` in the browser.

Applications on TanStack DB's descriptors and a `DbClient` per request keep
that model: `dbClient.preloadLiveQuery(...)` and `dbClient.dehydrate()` on the
server, `<DbProvider client={dbClient}>` and `<HydrationBoundary state={...}>`
in the browser.

## Disposal

A live query lives as long as the scope that called the hook. Disposing it, by
unmounting the component or disposing a root, unsubscribes its observer, and a
live query the hook compiled is cleaned up once nothing watches it. A query
that compiles again retires the one it replaced. `src/hooks.test.tsx` checks the
source collections' subscriber counts for each.

## Conformance

`bun run conformance` runs TanStack DB's shared framework-adapter suite against
this package: the live-query suite and the infinite-query suite that
`@tanstack/react-db`, `@tanstack/solid-db` and the other first-party adapters
pass, under vitest, against the engine's development and production builds.
Upstream keeps the suite in its repository rather than publishing it, so
`conformance/upstream.ts` checks out `packages/db/tests` at a pinned commit
whose `@tanstack/db` is the version this package depends on. The drivers are
`conformance/live-query.vitest.ts` and `conformance/infinite.vitest.ts`.
