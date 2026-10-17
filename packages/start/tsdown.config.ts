import { defineConfig } from "tsdown";

/**
 * A subpath in `exports` needs an entry HERE and a build, or it resolves to
 * `any` with nothing to say so. With no config at all `tsdown` builds
 * `src/index.ts` alone, and `./server` and `./serve` were never
 * emitted.
 */
export default defineConfig({
  entry: [
    "./src/index.ts",
    "./src/client.ts",
    "./src/middleware.ts",
    "./src/env.ts",
    "./src/server.ts",
    "./src/serve.ts",
    "./src/prerender.ts",
    "./src/protocol.ts",
  ],
  format: ["esm"],
  tsconfig: "./tsconfig.build.json",
  dts: true,
  clean: true,
  deps: {
    neverBundle: [
      "@barqjs/core",
      "@barqjs/server",
      "@barqjs/server/codec",
      "srvx",
      "srvx/body-limit",
      "srvx/node",
      "node:async_hooks",
    ],
  },
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
