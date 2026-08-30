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
`useMutation`, `useQueries`, `useMutationState`, `useIsFetching`,
`useIsMutating`, `usePrefetchQuery`, `useQueryClient` and `useIsRestoring`, plus
the typed `queryOptions`, `infiniteQueryOptions` and `mutationOptions` helpers.
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

## The surface

|                                                         |                                     |
| ------------------------------------------------------- | ----------------------------------- |
| `useQuery` `useSuspenseQuery`                           | one query                           |
| `useInfiniteQuery` `useSuspenseInfiniteQuery`           | paged                               |
| `useQueries`                                            | a set, through one observer         |
| `useMutation` `useMutationState`                        | writes                              |
| `useIsFetching` `useIsMutating`                         | counters                            |
| `usePrefetchQuery`                                      | start one without reading it        |
| `useQueryClient` `useIsRestoring`                       | the client, and a persister's state |
| `queryOptions` `infiniteQueryOptions` `mutationOptions` | typed, shareable options            |
| `QueryClientProvider` `IsRestoringProvider`             | the two providers                   |

`QueryClient`, `QueryCache`, `MutationCache`, `hydrate`, `dehydrate`,
`skipToken` and `keepPreviousData` are re-exported from `@tanstack/query-core`,
so an application pins one version rather than two.

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
