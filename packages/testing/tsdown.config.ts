import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  external: ["@barqjs/core", "@testing-library/dom"],
  esbuildOptions: {
    jsx: "automatic",
    jsxImportSource: "@barqjs/core",
  },
});
