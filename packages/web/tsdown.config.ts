import { defineConfig } from "tsdown";

/**
 * One build for every entry, so they share one copy of the renderer's state:
 * the delegated listeners, the head sink and the hydration walk `hydrate`
 * installs. `@barqjs/core` is never bundled: two copies of it are two engines,
 * and a page whose `render` ran on one and whose signals came from the other
 * updates nothing.
 */
export default defineConfig({
  entry: [
    "./src/index.ts",
    "./src/host.ts",
    "./src/internal.ts",
    "./src/interp.ts",
    "./src/jsx-runtime.ts",
    "./src/env.ts",
    "./src/env.server.ts",
    "./src/env.client.ts",
  ],
  format: ["esm"],
  // `exports` names `.js`/`.d.ts`; tsdown 0.22 defaults to `.mjs`/`.d.mts`.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  dts: true,
  clean: true,
  deps: { neverBundle: ["csstype", "#env", "@barqjs/core", "@barqjs/core/internal"] },
  esbuildOptions: {
    jsx: "automatic",
    jsxImportSource: "@barqjs/web",
  },
});
