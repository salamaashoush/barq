import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/css-registration.ts"],
  format: ["esm"],
  // `exports` names `.js`/`.d.ts`; tsdown 0.22 defaults to `.mjs`/`.d.mts`.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  dts: true,
  clean: true,
  deps: {
    neverBundle: [
      "vite",
      "@barqjs/compiler",
      /^@barqjs\/router(\/|$)/,
      /^@barqjs\/start(\/|$)/,
      /^srvx(\/|$)/,
    ],
  },
});
