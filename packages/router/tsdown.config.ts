import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/server.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  external: ["@barqjs/core", "@barqjs/server", "@barqjs/start"],
  // `package.json` names `./dist/index.js` and `./dist/index.d.ts`. tsdown 0.22
  // defaults to `.mjs`/`.d.mts`, and every other package in this repo declares
  // names its build does not emit — invisible in-repo because workspace
  // resolution takes the `bun` condition to `src/`, and fatal once published.
  // Named here rather than inherited.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  esbuildOptions: {
    jsx: "automatic",
    jsxImportSource: "@barqjs/core",
  },
});
