import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm"],
  // `exports` names `.js`/`.d.ts`; tsdown 0.22 defaults to `.mjs`/`.d.mts`.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  dts: true,
  clean: true,
  deps: {
    neverBundle: [
      "vite",
      "@barqjs/compiler",
      "@barqjs/compiler/vite",
      "@barqjs/router",
      "@barqjs/router/vite",
      "@barqjs/start",
      "@barqjs/start/vite",
    ],
  },
});
