import { defineConfig } from "tsdown";

/**
 * ONE build for all four entries, so they SHARE the runtime.
 *
 * This was four separate configs, to keep the `.d.ts` files from importing out
 * of a shared `.js` chunk. The cost was a second copy of `src/signals.ts` in
 * every entry, and with it a second `activeAsyncSession`, a second scheduler and
 * a second hydration store. `@barqjs/router/server` calls `setAsyncSession` from
 * `@barqjs/core/internal` while the render parks into the session that
 * `@barqjs/core` holds, so nothing ever resumed it: measured on a scaffolded
 * project, an SSR route with a loader served its pending fallback forever and
 * seeded no data. The workspace never saw it, because `bun` resolution takes
 * every `@barqjs/*` import to `src/` where there is only one copy.
 */
export default defineConfig({
  entry: ["./src/index.ts", "./src/jsx-runtime.ts", "./src/interp.ts", "./src/internal.ts"],
  format: ["esm"],
  // `exports` names `.js`/`.d.ts`; tsdown 0.22 defaults to `.mjs`/`.d.mts`.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  dts: true,
  clean: true,
  external: ["csstype"],
  esbuildOptions: {
    jsx: "automatic",
    jsxImportSource: ".",
  },
});
