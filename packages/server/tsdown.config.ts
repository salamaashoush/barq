import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: ["./src/codec.ts"],
    format: ["esm"],
    // `exports` names `.js`/`.d.ts`; tsdown 0.22 defaults to `.mjs`/`.d.mts`.
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
    dts: true,
    clean: true,
    external: ["seroval"],
  },
  {
    entry: ["./src/index.ts"],
    format: ["esm"],
    // `exports` names `.js`/`.d.ts`; tsdown 0.22 defaults to `.mjs`/`.d.mts`.
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
    dts: true,
    clean: false,
    external: ["csstype", "seroval", "@barqjs/core", "@barqjs/core/internal"],
    esbuildOptions: {
      jsx: "automatic",
      jsxImportSource: "@barqjs/core",
    },
  },
]);
