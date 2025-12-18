import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/jsx-runtime.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  external: ["alien-signals"],
  esbuildOptions: {
    jsx: "automatic",
    jsxImportSource: ".",
  },
});
