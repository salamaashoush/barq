import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  external: ["zest", "goober", "@tanstack/query-core"],
  esbuildOptions: {
    jsx: "automatic",
    jsxImportSource: "zest",
  },
});
