# @barqjs/query

[TanStack Query](https://tanstack.com/query) for barq, over `@tanstack/query-core`.

```bash
bun add @barqjs/query @tanstack/query-core
```

```tsx
import { QueryClient, QueryClientProvider, useQuery } from "@barqjs/query";

const client = new QueryClient();

function Users() {
  const users = useQuery(() => ({ queryKey: ["users"], queryFn: fetchUsers }));

  return (
    <Show when={() => !users.isPending} fallback={<Spinner />}>
      <For each={() => users.data ?? []}>{(user) => <li>{user.name}</li>}</For>
    </Show>
  );
}

render(
  () => (
    <QueryClientProvider client={client}>
      <Users />
    </QueryClientProvider>
  ),
  root,
);
```

`useQuery`, `useSuspenseQuery`, `useInfiniteQuery`, `useSuspenseInfiniteQuery`,
`useMutation`, `useQueries`, `useSuspenseQueries`, `useMutationState`,
`useIsFetching`, `useIsMutating`, `usePrefetchQuery`,
`usePrefetchInfiniteQuery`, `useQueryClient` and `useIsRestoring`, plus the
typed `queryOptions`, `infiniteQueryOptions` and `mutationOptions` helpers.
That is the same surface the React and Solid adapters carry.

## Two things it does differently

**Options are an accessor, not an object.** A query key built from a signal
refetches when that signal changes, because the observer re-reads the options
rather than being handed a snapshot of them once.

**Results are stores, not signals.** `query.data` and `query.isFetching` are
separate dependencies.

An observer notifies on every state change a query has. Fetching starts.
Fetching ends. Data arrives. `isStale` flips on a timer. Held in one signal,
each of those wakes every reader, so a component rendering `data` re-runs twice
on every background refetch, forever.

The store writes the result field by field and drops a write whose value did
not change. A refetch returning the same response wakes nobody.
`src/index.test.tsx` counts the runs.

That is the same design `@tanstack/solid-query` uses, for the same reason.

## Suspense

```tsx
import { Loading } from "@barqjs/core";
import { useSuspenseQuery } from "@barqjs/query";

function Profile() {
  const user = useSuspenseQuery(() => ({ queryKey: ["me"], queryFn: fetchMe }));
  return <h1>{() => user.data.name}</h1>;
}

<Loading fallback={<Spinner />}>
  <Profile />
</Loading>;
```

Reading `data` before there is any parks the enclosing `Loading` boundary.
`isPending` and `error` stay readable, so a fallback and an inline indicator
are both expressible against the same object.

`throwOnError` works too, and routes to the enclosing `Errored` boundary — a
barq component body runs once, so the check lives in an effect rather than in a
render that happens again.

## Several at once

```ts
const results = useQueries(() => ({
  queries: ids().map((id) => ({ queryKey: ["user", id], queryFn: () => fetchUser(id) })),
}));
```

One `QueriesObserver`, not a loop of `useQuery`: the whole set batches into a
single notification, so a page fetching twelve resources settles once rather
than twelve times. The array is written index by index and never replaced, so
`results[1].data` is a dependency of its own.

A literal array is typed member by member, and `combine` folds the set into one
value. That value has to be an object or an array: it is read field by field
like every other result, and a bare number has no field to subscribe to.

```ts
const summary = useQueries(() => ({
  queries: [userQuery(id()), teamQuery(id())],
  combine: ([user, team]) => ({
    pending: user.isPending || team.isPending,
    title: `${user.data?.name} of ${team.data?.name}`,
  }),
}));
```

`useSuspenseQueries` is the same set with every member parking its boundary.

## Across a server render

A query read during `renderPage` or `renderToStream` parks its `Loading`
boundary until the data is there, and the answer is written into the page with
the rest of the render's seeds. Hydration finds it, fills the cache, and mounts
without fetching. On a streamed page a query that settles after the shell
arrives with its boundary, and a client that hydrated first waits for it.

Nothing has to be dehydrated by hand for that. What does need care is the
client: one for each request, never one for the module.

```tsx
export function render(request: Request) {
  const client = new QueryClient();
  return renderToStream(() => (
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  ));
}
```

A query a loader already fetched crosses the same way when a component reads
it. State dehydrated somewhere else goes through `HydrationBoundary`:

```tsx
<HydrationBoundary state={dehydratedState}>
  <Posts />
</HydrationBoundary>
```

On the server a read parks whichever hook made it, `useQuery` included: a
string render has one pass, and "pending" is not something it can take back.

## Errors, and trying again

`Errored`'s reset asks what failed again, and a failed query answers with the
same error. `QueryErrorResetBoundary` is what tells the queries below it to
fetch instead:

```tsx
function Guarded() {
  const queries = useQueryErrorResetBoundary();
  return (
    <Errored
      fallback={(error, reset) => (
        <button
          onClick={() => {
            queries.reset();
            reset();
          }}
        >
          {error().message}: try again
        </button>
      )}
    >
      <Profile />
    </Errored>
  );
}

<QueryErrorResetBoundary>
  <Guarded />
</QueryErrorResetBoundary>;
```

## Entries of their own

Each needs a package the main entry does not, so each is an optional peer
behind its own import.

```tsx
// @tanstack/query-persist-client-core
import { PersistQueryClientProvider } from "@barqjs/query/persist";

<PersistQueryClientProvider client={client} persistOptions={{ persister }}>
  <App />
</PersistQueryClientProvider>;
```

```tsx
// @tanstack/query-devtools, imported when the component is first built
import { BarqQueryDevtools } from "@barqjs/query/devtools";

<BarqQueryDevtools initialIsOpen={false} />;
```

Keep the devtools behind a development flag. The panel is a Solid 1
application and delegates events the way barq does, so while it is loaded a
delegated handler runs once for each of them.

```tsx
// @barqjs/router: src/router.ts
import { setupRouterSsrQueryIntegration } from "@barqjs/query/router";

// Once for each request on the server, once for the tab in the browser.
export function getRouter() {
  const queryClient = new QueryClient();
  const router = createRouter({ routeTree, context: { queryClient } });
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}

// Any route.
loader: ({ context, params }) => context.queryClient.ensureQueryData(userQuery(params.id)),
component: (props) => {
  const user = useSuspenseQuery(() => userQuery(props.params().id));
  return <h1>{user.data.name}</h1>;
},
```

`setupRouterSsrQueryIntegration({ router, queryClient })` ties the two together:

- the client reaches every route through the router's `Wrap`, so no
  `QueryClientProvider` is written (`wrapQueryClient: false` leaves that to you);
- what a loader put in the cache crosses to the page whether or not a component
  read it, and a query that settles after the loaders is streamed behind them;
- the browser's cache is filled before the first render, so hydrating a page
  fetches nothing the server already fetched;
- a redirect a query or a mutation fails with is followed (`handleRedirects`).

`dehydrateOptions` and `hydrateOptions` are passed through to `query-core`. The
returned function undoes all of it.

Without `getRouter`, `queryClientContext(() => new QueryClient())` on the root
route's `context` still gives each request a client of its own, and
`RouterQueryClientProvider` provides it from the root route's component.

## The surface

|                                                         |                                     |
| ------------------------------------------------------- | ----------------------------------- |
| `useQuery` `useSuspenseQuery`                           | one query                           |
| `useInfiniteQuery` `useSuspenseInfiniteQuery`           | paged                               |
| `useQueries` `useSuspenseQueries`                       | a set, through one observer         |
| `useMutation` `useMutationState`                        | writes                              |
| `useIsFetching` `useIsMutating`                         | counters                            |
| `usePrefetchQuery` `usePrefetchInfiniteQuery`           | start one without reading it        |
| `useQueryClient` `useIsRestoring`                       | the client, and a persister's state |
| `queryOptions` `infiniteQueryOptions` `mutationOptions` | typed, shareable options            |
| `QueryClientProvider` `IsRestoringProvider`             | the two providers                   |
| `HydrationBoundary`                                     | dehydrated state, into the client   |
| `QueryErrorResetBoundary` `useQueryErrorResetBoundary`  | the retry half of `Errored`         |

Everything `@tanstack/query-core` exports is re-exported (`QueryClient`,
`focusManager`, `onlineManager`, `hydrate`, `dehydrate`, `skipToken`,
`keepPreviousData`, the types, and the rest), so an application pins one
version rather than two.

The filters `useIsFetching`, `useIsMutating` and `useMutationState` take may be
an object or a function; a function is tracked.

## Outside a provider

Every hook takes an optional client as its last argument, which is what makes a
query usable in a test or in a route loader that has the client in hand and no
component tree to read it through.

```ts
const users = useQuery(() => ({ queryKey: ["users"], queryFn: fetchUsers }), client);
```

This package used to live inside `@barqjs/extra`, alongside hook-shaped wrappers
that were a second copy of what `@barqjs/primitives` owns. Those are gone; the
adapter is here.
