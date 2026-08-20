import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: ["./src/codec.ts"],
    format: ["esm"],
    dts: true,
    clean: true,
    external: ["seroval"],
  },
  {
    entry: ["./src/index.ts"],
    format: ["esm"],
    dts: true,
    clean: false,
    external: ["csstype", "seroval", "@barqjs/core", "@barqjs/core/internal"],
    esbuildOptions: {
      jsx: "automatic",
      jsxImportSource: "@barqjs/core",
    },
  },
]);
