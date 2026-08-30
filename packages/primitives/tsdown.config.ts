import { defineConfig } from "tsdown";

const modules = [
  "index",
  "animation",
  "browser",
  "bus",
  "clipboard",
  "collections",
  "derived",
  "element",
  "event",
  "focus",
  "fullscreen",
  "geolocation",
  "history",
  "keyboard",
  "machine",
  "media",
  "mouse",
  "observers",
  "promise",
  "raf",
  "refs",
  "scheduled",
  "scroll",
  "storage",
  "timer",
  "utils",
  "virtual",
  "websocket",
];

export default defineConfig({
  entry: modules.map((name) => `./src/${name}.ts`),
  format: ["esm"],
  // `exports` names `.js`/`.d.ts`; tsdown 0.22 defaults to `.mjs`/`.d.mts`.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  dts: true,
  clean: true,
  external: ["@barqjs/core"],
});
