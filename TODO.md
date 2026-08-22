# TODO

## Deferred from the dependency bump

- `packages/benchmark` moved to `@babel/core` ^8 and `@solidjs/signals` ^2.0.0-rc. Neither is
  exercised by `bun run ci`; the benchmark harness needs a run before either is trusted.

## `typecheck` is not yet a gate, and `kitchen-sink` was not what was holding it

`bun run --filter '*' typecheck` is red in two packages, both only in TEST files:
`packages/core` (85) and `packages/server` (17). Every `src/` file in every package
typechecks. The two remaining classes are `Resource<T>` invariance in `async.test.ts`
(~45 hits of one shape) and `Text` vs `Block<unknown>` in the region tests. Neither is a
runtime defect; both are one narrow fix each.

Three of `packages/server`'s pre-existing errors are worth a look on their own:
`ssr.ts:843` reads `Cell<unknown> is not assignable to Cell<unknown>` — `@barqjs/core`
resolving through both `src` and `dist` in one program, which is the same duplicate-identity
hazard `kitchen-sink/vite.config.ts` documents for the two Vite environments.
