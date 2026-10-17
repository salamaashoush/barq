import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm"],
  // `exports` names `.js`/`.d.ts`; tsdown 0.22 defaults to `.mjs`/`.d.mts`.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  dts: true,
  clean: true,
  deps: { neverBundle: ["@barqjs/core", "@barqjs/web", "@tanstack/virtual-core"] },
  esbuildOptions: {
    jsx: "automatic",
    jsxImportSource: "@barqjs/web",
  },
});
