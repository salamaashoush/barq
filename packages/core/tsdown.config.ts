import { defineConfig } from "tsdown";

// Use separate configs to avoid shared chunks between entries
// This prevents .d.ts files from importing from .js chunk files
export default defineConfig([
  {
    entry: ["./src/index.ts"],
    format: ["esm"],
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
    dts: true,
    clean: false, // Don't clean on second build
    external: ["csstype"],
    esbuildOptions: {
      jsx: "automatic",
      jsxImportSource: ".",
    },
  },
]);
