import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["./src/index.ts", "./src/babel.ts", "./src/vite.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  external: [
    "@babel/core",
    "@babel/types",
    "@babel/helper-plugin-utils",
    "vite",
  ],
})
