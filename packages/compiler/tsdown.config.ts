import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/vite.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  external: ["vite", "@barqjs/compiler-rs"],
});
