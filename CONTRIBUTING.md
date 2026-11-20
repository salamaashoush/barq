# Contributing

## Setup

You need [Bun](https://bun.sh) and a Rust toolchain, since the root build
compiles the native compiler. The compiler's browser tests also need Chrome;
point `CHROME_PATH` at the binary when it is not on the default path.

```bash
bun install
bun run build      # every package, then the apps
bun run dev        # the kitchen-sink app
```

## Checks

These are what CI runs, and a change is ready when all of them pass:

```bash
bun run test                        # every package's suite
bun run ci                          # lint and format
bash .github/scripts/typecheck.sh   # types, against the recorded baseline
```

For a change inside `packages/compiler`, also run its Rust checks from that
directory:

```bash
cargo test --workspace
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```

`bun run build` in `packages/compiler` rebuilds the native binding the
JavaScript tests load, so run it after changing Rust and before those tests.

## Things worth knowing

- `bun test` resolves the workspace packages from `src`, but a Vite build such
  as the docs site resolves them from `dist`. Rebuild a package after changing
  it before checking the change there.
- `packages/ui/registry/*.json` is generated from `packages/ui/src`. Run
  `bun run registry` in `packages/ui` after changing a component.
- A failing test reports a defect in the code. Change what a test asserts only
  when the behaviour it pins is meant to change, and say so in the commit.

## Commits and releases

Commit subjects carry a conventional prefix (`fix(css):`, `feat(compiler):`,
`perf(server):`). The body says what was wrong and what now stops it coming
back.

A change that should reach npm carries a changeset: `bun run changeset`.
[RELEASING.md](./RELEASING.md) describes the rest of the release.
