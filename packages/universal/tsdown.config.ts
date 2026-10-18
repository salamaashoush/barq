import { defineConfig } from "tsdown";

/**
 * `@barqjs/core` is never bundled: two copies of it are two engines, and a
 * tree rendered by one whose signals came from the other updates nothing.
 */
export default defineConfig({
  entry: ["./src/index.ts", "./src/jsx-runtime.ts"],
  format: ["esm"],
  // `exports` names `.js`/`.d.ts`; tsdown 0.22 defaults to `.mjs`/`.d.mts`.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  dts: true,
  clean: true,
  deps: { neverBundle: ["@barqjs/core", "@barqjs/core/internal"] },
});
