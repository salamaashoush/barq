import { defineConfig } from "tsdown";

// Use separate configs to avoid shared chunks between entries
// This prevents .d.ts files from importing from .js chunk files
export default defineConfig([
  {
    entry: ["./src/index.ts"],
    format: ["esm"],
    // `exports` names `.js`/`.d.ts`; tsdown 0.22 defaults to `.mjs`/`.d.mts`.
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
    dts: true,
    clean: true,
    external: ["csstype"],
    esbuildOptions: {
      jsx: "automatic",
      jsxImportSource: ".",
    },
  },
  {
    entry: ["./src/jsx-runtime.ts"],
    format: ["esm"],
    // `exports` names `.js`/`.d.ts`; tsdown 0.22 defaults to `.mjs`/`.d.mts`.
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
    dts: true,
    clean: false, // Don't clean on second build
    external: ["csstype"],
    esbuildOptions: {
      jsx: "automatic",
      jsxImportSource: ".",
    },
  },
  {
    entry: ["./src/interp.ts"],
    format: ["esm"],
    // `exports` names `.js`/`.d.ts`; tsdown 0.22 defaults to `.mjs`/`.d.mts`.
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
    dts: true,
    clean: false,
    external: ["csstype"],
    esbuildOptions: {
      jsx: "automatic",
      jsxImportSource: ".",
    },
  },
  {
    entry: ["./src/internal.ts"],
    format: ["esm"],
    // `exports` names `.js`/`.d.ts`; tsdown 0.22 defaults to `.mjs`/`.d.mts`.
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
    dts: true,
    clean: false,
    external: ["csstype"],
    esbuildOptions: {
      jsx: "automatic",
      jsxImportSource: ".",
    },
  },
]);
