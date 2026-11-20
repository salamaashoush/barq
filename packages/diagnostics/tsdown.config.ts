import { defineConfig } from "tsdown";

/**
 * One entry per subpath in `exports`. `matchers-bun` and `matchers-vitest`
 * carry only a module augmentation each, in separate files so a project loads
 * the one for the runner it has installed.
 */
export default defineConfig({
  entry: [
    "./src/index.ts",
    "./src/matchers.ts",
    "./src/matchers-bun.ts",
    "./src/matchers-vitest.ts",
    "./src/browser.ts",
    "./src/playwright.ts",
    "./src/protocol.ts",
    "./src/vite.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  deps: {
    neverBundle: ["@barqjs/core", "@solidjs/signals", "bun:test", "vite", "vitest"],
  },
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
