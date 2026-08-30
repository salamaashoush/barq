import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/client.ts", "./src/server.ts", "./src/vite.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  // The build-time specifiers `client.ts` and `server.ts` import. They are
  // resolved by `barqStart` when an APPLICATION is built, so they must survive
  // this build as written rather than be chased down here.
  external: [
    "@barqjs/core",
    "@barqjs/server",
    "@barqjs/start",
    "vite",
    "node:fs",
    "node:path",
    "#barq-router-entry",
    /^virtual:barq-/,
  ],
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
