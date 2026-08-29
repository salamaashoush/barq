import { defineConfig } from "tsdown";

/**
 * This package had no config at all, so `tsdown` built `src/index.ts` alone and
 * the `./server`, `./vite` and `./serve` subpaths its `exports` map declares
 * were never emitted. That is the trap `DESIGN-ROUTER.md` §5 names — "a new
 * subpath export needs a `tsdown.config.ts` entry and a build, or it silently
 * resolves to `any`" — and it was already sprung.
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
