import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "tsdown";

const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler-rs") as {
  transform(code: string, options?: Record<string, unknown>): { code: string };
};

/**
 * The icons are `.tsx`, so the BUILD runs the barq compiler over them.
 *
 * Without it they go through rolldown's generic JSX transform and each one
 * builds its `<svg>` element by element, where the compiler makes it one cloned
 * template. Consumers pay nothing for it: `dist` is already lowered, so an
 * application without the compiler still uses these.
 */
const barq = {
  name: "barq",
  transform(code: string, id: string): { code: string } | null {
    if (!id.endsWith(".tsx")) return null;
    return { code: native.transform(code, { filename: id }).code };
  },
};

/**
 * An entry per icon as well as the barrel.
 *
 * `@barqjs/lucide/icons/check` has to resolve to a module of its own, and a
 * single-entry build would inline all 1,790 into one file that no dev server
 * wants to parse to reach one chevron.
 */
const icons = readdirSync(resolve(import.meta.dirname, "src/icons"))
  .filter((entry) => entry.endsWith(".tsx"))
  .map((entry) => `./src/icons/${entry}`);

export default defineConfig({
  entry: ["./src/index.ts", "./src/icon.ts", "./src/manifest.ts", ...icons],
  format: ["esm"],
  // `exports` names `.js`/`.d.ts`; tsdown 0.22 defaults to `.mjs`/`.d.mts`.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  dts: true,
  clean: true,
  plugins: [barq],
  external: ["@barqjs/core"],
});
