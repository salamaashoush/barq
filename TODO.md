# TODO

## Deferred from the dependency bump

- `packages/benchmark` moved to `@babel/core` ^8 and `@solidjs/signals` ^2.0.0-rc. Neither is
  exercised by `bun run ci`; the benchmark harness needs a run before either is trusted.

## `typecheck` is green in every package's `src`, and can become a gate

The old entry here said core 85 and server 17, and named `Resource<T>` invariance and
`Text` vs `Block<unknown>` as two narrow fixes. Both classes are gone, and neither needed a
fix: they were the stale `dist/` described below, resolving `@barqjs/core` to two identities
in one program. Measured after a rebuild:

```
aria css primitives query router server start testing ui   0
core         8    all in node_modules/reactive-framework-test-suite, all TS6133
compiler-rs  123  all in fixtures/, which exist to be compiled, not to typecheck
```

Neither remainder is barq source. `packages/core` pulls a third-party suite's `.ts` into its
program, and `skipLibCheck` does not reach it; excluding it is the fix. `compiler-rs`'s
fixtures deliberately hold shapes that do not typecheck, `my-grid` and the handler tuples
among them, so they want their own tsconfig rather than a fix.

## `bun run ci` is red: 59 type-aware lint findings

```
site 35 · router 21 · server 8 · ui 5 · core 1
no-unsafe-argument 37 · no-unnecessary-type-assertion 9 · no-unnecessary-type-arguments 8
no-redundant-type-constituents 3 · no-base-to-string 2
```

`packages/ui`'s three are `EmblaCarouselType` resolving to an error type in `carousel.tsx`,
which is a missing or unresolvable dependency rather than a lint to satisfy. Fix that one
first; it may take the two `no-unsafe-argument` warnings beside it.

## `routeTree.gen.ts` is committed formatted and generated compact

`oxfmt` owns the committed file and the generator owns the emitted one, so every `dev` and
every `build` leaves `packages/kitchen-sink/src/routeTree.gen.ts` dirty with a diff that
changes no routes. Either the generator emits what `oxfmt` would, or the file leaves the
formatter's scope.
