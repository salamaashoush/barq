# TODO

## lint-1.79 — rules turned off to unblock CI, not because they are wrong

Bumping `oxlint` 1.33 → 1.79 turned six rules on by default. They fire 693 times across code
that predates them, so they are `"off"` in `.oxlintrc.json` rather than fixed in the same pass
as a dependency bump. Each one is worth doing.

| rule | count | note |
|---|---:|---|
| `typescript/no-unnecessary-type-assertion` | 132 | Real signal — an assertion that changes nothing. Some are `as never` in tests that TypeScript 7 now infers without help. Mostly auto-fixable with `oxlint --fix`. |
| `no-shadow` | 128 | Nested closures reusing a name. Worth reading rather than renaming blindly. |
| `typescript/no-unnecessary-type-parameters` | 13 | A generic used once, which is a type-level no-op. |
| `typescript/no-unnecessary-type-conversion` | 6 | `String(x)` where `x` is already a string, and friends. |
| `typescript/consistent-return` | 5 | All in `packages/extra/src/hooks.ts` — a function that returns a value on one path and nothing on another. |
| `no-unmodified-loop-condition` | 1 | Worth looking at rather than silencing: it is the shape of an infinite loop. |

`no-underscore-dangle` (403) is **not** in that list and is off permanently. `node._value`,
`_inFlight` and `_serializeKey` are the runtime's internal-field convention, deliberate and
documented at their declarations.

`prefer-const` stays `"warn"` and its 4 hits are inside the above files.

## Deferred from the dependency bump

- `packages/benchmark` moved to `@babel/core` ^8 and `@solidjs/signals` ^2.0.0-rc. Neither is
  exercised by `bun run ci`; the benchmark harness needs a run before either is trusted.
