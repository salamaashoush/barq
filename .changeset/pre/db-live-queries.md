---
"@barqjs/db": minor
---

`@barqjs/db` is barq's adapter for TanStack DB: `useLiveQuery`, `useLiveInfiniteQuery`, `useLiveSuspenseQuery`, `useLiveQueryEffect` and `usePacedMutations`, with `DbProvider` and `HydrationBoundary` for a `DbClient`. The API follows `@tanstack/react-db`. A query's callback is tracked, so there is no dependency array, and a server render's rows hydrate without a loading flash before the browser's collections take over. It passes TanStack DB's shared live-query and infinite-query conformance suites.
