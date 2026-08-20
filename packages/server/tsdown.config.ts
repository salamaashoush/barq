import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: ["./src/index.ts"],
    format: ["esm"],
    dts: true,
    clean: true,
    external: ["csstype", "seroval", "@barqjs/core", "@barqjs/core/internal"],
    esbuildOptions: {
      jsx: "automatic",
      jsxImportSource: "@barqjs/core",
    },
  },
]);
