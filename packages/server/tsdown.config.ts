import { defineConfig } from "tsdown";

import { outExtensions, wireText } from "./wire-text.config.ts";

export default defineConfig([
  wireText,
  {
    entry: ["./src/codec.ts"],
    format: ["esm"],
    outExtensions,
    dts: true,
    clean: false,
    deps: { neverBundle: ["seroval", "@barqjs/core", "@barqjs/web", /^#/] },
  },
  {
    entry: ["./src/storage.ts"],
    format: ["esm"],
    outExtensions,
    dts: true,
    clean: false,
    deps: { neverBundle: ["@barqjs/core", "@barqjs/web"] },
  },
  {
    entry: ["./src/index.ts"],
    format: ["esm"],
    outExtensions,
    dts: true,
    clean: false,
    deps: {
      neverBundle: [
        "csstype",
        "seroval",
        "@barqjs/core",
        "@barqjs/core/internal",
        "@barqjs/web",
        "@barqjs/web/internal",
        /^#/,
      ],
    },
    esbuildOptions: {
      jsx: "automatic",
      jsxImportSource: "@barqjs/web",
    },
  },
]);
