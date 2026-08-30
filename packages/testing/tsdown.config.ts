import { defineConfig } from "tsdown";

/**
 * Two entries, because `./pure` is a real subpath: it is how a suite opts out of
 * the `afterEach(cleanup)` `./index.ts` registers. A subpath the `exports` map
 * declares and the build does not emit resolves to `any`, which is the trap
 * `packages/start/tsdown.config.ts` records having already sprung.
 */
export default defineConfig({
  entry: [
    "./src/index.ts",
    "./src/pure.ts",
    "./src/router.ts",
    "./src/server.ts",
    "./src/a11y.ts",
    "./src/user.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  external: [
    "@barqjs/core",
    "@barqjs/server",
    "@barqjs/router",
    "@barqjs/start",
    "@testing-library/dom",
  ],
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
