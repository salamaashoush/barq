import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm"],
  // `bin` names `./dist/index.js`; tsdown 0.22 defaults to `.mjs`.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  clean: true,
  // A `bin` is run by the shell, not imported.
  dts: false,
});
