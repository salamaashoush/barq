import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm"],
  // `exports` names `.js`/`.d.ts`; tsdown 0.22 defaults to `.mjs`/`.d.mts`.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  dts: true,
  clean: true,
  external: ["@barqjs/core", "@testing-library/dom"],
  esbuildOptions: {
    jsx: "automatic",
    jsxImportSource: "@barqjs/core",
  },
});
