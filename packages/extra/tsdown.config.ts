import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  external: ["@barqjs/core", "goober", "@tanstack/query-core"],
  esbuildOptions: {
    jsx: "automatic",
    jsxImportSource: "@barqjs/core",
  },
});
