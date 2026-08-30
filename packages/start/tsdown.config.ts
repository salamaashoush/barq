import { defineConfig } from "tsdown";

/**
 * A subpath in `exports` needs an entry HERE and a build, or it resolves to
 * `any` with nothing to say so. With no config at all `tsdown` builds
 * `src/index.ts` alone, and `./server`, `./vite` and `./serve` were never
 * emitted.
 */
export default defineConfig({
  entry: [
    "./src/index.ts",
    "./src/client.ts",
    "./src/server.ts",
    "./src/serve.ts",
    "./src/vite.ts",
    "./src/prerender.ts",
    "./src/protocol.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  external: [
    "@barqjs/core",
    "@barqjs/server",
    "@barqjs/server/codec",
    "@barqjs/compiler",
    "srvx",
    "srvx/node",
    "vite",
    "node:async_hooks",
  ],
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
