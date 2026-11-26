# @barqjs/db

## 0.2.0-next.4

### Minor Changes

- a9cfdab: `@barqjs/db` is barq's adapter for TanStack DB: `useLiveQuery`, `useLiveInfiniteQuery`, `useLiveSuspenseQuery`, `useLiveQueryEffect` and `usePacedMutations`, with `DbProvider` and `HydrationBoundary` for a `DbClient`. The API follows `@tanstack/react-db`. A query's callback is tracked, so there is no dependency array, and a server render's rows hydrate without a loading flash before the browser's collections take over. It passes TanStack DB's shared live-query and infinite-query conformance suites.

### Patch Changes

- Updated dependencies [59a9e79]
- Updated dependencies [0a43dbe]
- Updated dependencies [0968d16]
- Updated dependencies [ec06e14]
- Updated dependencies [7847b93]
- Updated dependencies [f265cd9]
- Updated dependencies [3f6aa6d]
- Updated dependencies [b6342be]
  - @barqjs/web@0.2.0-next.4
  - @barqjs/core@0.2.0-next.4
