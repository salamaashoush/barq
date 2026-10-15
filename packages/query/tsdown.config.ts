import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/devtools.ts", "./src/persist.ts", "./src/router.ts"],
  format: ["esm"],
  // `exports` names `.js`/`.d.ts`; tsdown 0.22 defaults to `.mjs`/`.d.mts`.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  dts: true,
  clean: true,
  deps: {
    neverBundle: [
      "@barqjs/core",
      "@barqjs/router",
      "@tanstack/query-core",
      "@tanstack/query-devtools",
      "@tanstack/query-persist-client-core",
    ],
  },
  esbuildOptions: {
    jsx: "automatic",
    jsxImportSource: "@barqjs/core",
  },
});
