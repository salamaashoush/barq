# @barqjs/benchmark

The measurements behind barq's published numbers. Private, never published.

## Against Solid

`bun run bench:solid2` compares barq with Solid 2.0 and Solid 1.9 on one
machine, each compiled by its own compiler and bundled by the same bundler.
The results and the method are in [SOLID2-RESULTS.md](./SOLID2-RESULTS.md).

```bash
bun run bench:solid2:prepare   # build Solid 2.0 from a local checkout, once
bun run bench:solid2           # every lane
bun run bench:solid2 ssr       # one lane: size, ssr, hydrate, script or jfb
```

The browser lanes need Chrome; set `CHROME_PATH` when it is not on the default
path. A run rewrites `solid2-results.json`, so take it on an idle machine
before committing the file.

## Other lanes

- `bench:tier2`: js-framework-benchmark and js-reactivity-benchmark in a real
  browser, with durations read from Chrome's trace. CI runs it on a schedule.
- `bench:three`: `@barqjs/three` against react-three-fiber.
- `bench:dom`, `bench:replace-all`, `bench:shape`, `bench:flags`,
  `bench:spread`, `bench:static`, `bench:eleven`: focused comparisons of one
  compiler or runtime decision each. `bench:shape` runs in CI, where it checks
  that every write a benchmark case times reaches the DOM.
- `bench`, `bench:browser`, `bench:ssr`: the original comparisons against
  Solid 1.9.
