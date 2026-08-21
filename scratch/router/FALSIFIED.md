# Falsified while designing @barqjs/router

The DESIGN-START.md §1 model: recorded so they are not relitigated.

| Claim | Where it was made | Killed by |
|---|---|---|
| The route tree is "generated in Rust" from the filesystem | DESIGN-ROUTER §3.1 | The crate does ZERO filesystem reads outside `build.rs` and `#[cfg(test)]` — audited every `std::fs`/`read_dir` site; `walkdir` is not a dependency. All three napi entries are synchronous, and there is no `.d.ts` emitter (`index.d.ts` is a `napi build` artefact). A Rust `read_dir` would be a second source of truth about disk that Vite's watcher does not invalidate. Discovery belongs where `addWatchFile` and `moduleGraph.invalidateModule` are — the plugin, template at `packages/start/src/vite.ts:103-115`. |
| Generated interfaces make tsc's cost "O(routes) instead of O(routes x path inference)" | DESIGN-ROUTER §3.1 | MEASURED, both directions wrong. Instantiations are ~120/route inferred and exactly 8/route generated — both LINEAR, a 15x constant not a complexity class. On the clock, generated wins 1.4x at 200 routes (0.007s vs 0.010s), ties at 800, and LOSES 1.15x at 2000 and 1.32x at 5000. Same shape on TypeScript 5.9.3 and 7.0.2, so it is not a TS 7 artefact. Zero type errors, three trials, `--extendedDiagnostics`. The justification for generating types is CAPABILITY — `loaderData` per route id is not derivable from a path string at any speed — not tsc cost. |
| "Static hrefs can be constant-folded" | DESIGN-ROUTER §3.3 | Probed. `<Link to="/users/1">` emits `Link(_s$, { to: _k$1 })` with `_k$1 = () => "/users/1"`. A component root is `Root::Verbatim` (`ir/module.rs:95-97`) so it has no skeleton for a value to migrate into, and `fold::run` rewrites only `Op::SetOnce`/`Op::Insert` on units (`fold.rs:19-23`). Folding needs a Link-INLINING lowering rule — special-casing a non-`@barqjs/core` component in lowering, for which the crate has no precedent. Dropped. |
| "`reserveChildSlot` keys per owner — read DESIGN-START §1's row on address-keyed seeds before touching it" reads as a warning | DESIGN-ROUTER §4 | That row is a DEFENCE of the current scheme, not a warning against it: an address is per call-site and identical for all 100 rows of a `For`, while the owner-slot scheme gives 100 distinct seeds. A router touches none of it — it passes `{ key }`, which skips slot reservation entirely (`signals.ts:2219-2224`). |
| "the identity-gated re-render the router hand-rolls in ten lines at `router.tsx:1576`" | compiler-rs/CODESIGN.md §3.4 | Stale. That code was deleted in `35be05c`. Its current equivalent is `renderDepth`'s `key = () => errorAt() ?? routeAt()` handed to core's `branch` (`packages/extra/src/router.ts:960`, `:999`) — the primitive already does the gate. The correction worth carrying is that `data` was in the old key and is deliberately out of the new one. |
| The ten control-flow constructs include `Fragment`, and `Switch`/`Match` count as one | DESIGN-ROUTER §5 | The authoritative ten is the compiler's `Flow` enum (`packages/compiler-rs/src/ir/symbols.rs:230-243`): `For, Repeat, Show, Switch, Match, Loading, Errored, Reveal, Portal, Dynamic`. `Fragment` is not in it — it is JSX syntax and a three-line array wrapper (`components.ts:186-190`). "Do not add an eleventh" means an eleventh `Flow` variant. |
| "`packages/core/CODESIGN.md` §3.2" | DESIGN-ROUTER §5 | No such file. `CODESIGN.md` and `SEMANTICS.md` are both under `packages/compiler-rs/`. The `(scope, props)` rule is real; the path is not. |

## Survived, and is stronger than the brief claimed

**`<Link to>` checked at compile time.** `bind.rs:821-850` (`cell_slot_evidence`) already
resolves a component callee to a `SymbolId` and walks named attributes with spans, and
`Diag` -> `analysis_diagnostics` -> `pos` -> Rollup's code frame is a finished channel. Three
real costs, each verified: the route set must arrive as a new `TransformOptions` field (and
every field must be in `OPTION_KEYS` or `options_keys_cover_every_field` fails); the check must
escape `options.diagnostics`'s `dev` default to run in CI; `docs/README.md` requires a new code
to ship at warning or below. Next code is BARQ013 — 006 and 007 are tombstones and are never
reused.

## Found, unrelated to the router, pre-existing — and it is armed, not theoretical

Every `@barqjs/*` `package.json` `exports` map points at `./dist/x.js` and `./dist/x.d.ts`;
`tsdown` 0.22.14 emits `.mjs` and `.d.mts`, and there is no `outExtension` or `publishConfig`
anywhere (grepped). Separately, `packages/start` has no `tsdown.config.ts` at all, so its
`./server`, `./vite` and `./serve` subpaths are never built — the trap DESIGN-ROUTER §5 warns
about, already sprung.

**`bun run build` in `packages/server` breaks `bun run ci`, and I set it off.** `packages/server/dist`
held `codec.d.ts` and `index.d.ts` from an older tsdown. `tsdown.config.ts` sets `clean: true`
on the first entry, so a rebuild deletes them and writes `codec.d.mts` / `index.d.mts` — names
the `exports` map does not name. Type-aware lint then resolves `@barqjs/server/codec` to
nothing, `decodeWire<Error>` comes back **error typed**, and `packages/start/src/server.test.ts:161`
raises `no-unsafe-argument`, which `--deny-warnings` turns into a failed gate.

So the green baseline depends on a stale build artefact that any `build` destroys. Recovery
here was to rebuild and copy each `x.mjs`/`x.d.mts` to `x.js`/`x.d.ts`; the real fix is
`outExtension` in each `tsdown.config.ts` (or `.mjs`/`.d.mts` in each `exports` map), plus a
`tsdown.config.ts` for `packages/start`. Needs a decision before `@barqjs/router` declares
subpaths of its own, because it would inherit both.

**Operational, and it cost a confusing gate run:** `bun run ci` lints and format-checks
`packages/{core,server,start,extra,testing}` RECURSIVELY. Any scratch or probe file left inside
one of those directories fails the gate on formatting or on a type-aware warning. Probes belong
in `packages/compiler-rs/scratch/` (not in the lint list) or in the repo-root `scratch/`.
