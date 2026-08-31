import { createRequire } from "node:module";
import { defineConfig } from "tsdown";

import { ENTRIES } from "./src/entries.ts";

const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler-rs") as {
  transform(code: string, options?: Record<string, unknown>): { code: string; css?: string };
};

/**
 * The BUILD runs the barq compiler, over `.ts` as well as `.tsx`.
 *
 * `.tsx` for the usual reason — rolldown's generic JSX transform gives a
 * component different semantics — and `.ts` because a `css` block is only a
 * class name once the compiler has folded it. Without that half, every rule in
 * the package would be registered by the runtime fallback at import time
 * instead of arriving as CSS.
 *
 * The CSS a module produced is appended as a `registerCss` call rather than
 * emitted as an asset. tsdown builds a LIBRARY: there is no HTML document to
 * link a stylesheet from, and a consumer's own bundler is what will emit one.
 * Keyed by module id, so importing a component twice inserts one copy.
 */
const barq = {
  name: "barq",
  transform(code: string, id: string): { code: string } | null {
    if (!/\.tsx?$/.test(id)) return null;
    const result = native.transform(code, { filename: id });
    if (result.css === undefined || result.css === "") return { code: result.code };
    return {
      code:
        `${result.code}\nimport { registerCss as _$registerCss } from "@barqjs/css";\n` +
        `_$registerCss(${JSON.stringify(id)}, ${JSON.stringify(result.css)});\n`,
    };
  },
};

export default defineConfig({
  entry: ENTRIES.map((entry) => `./src/${entry}`),
  format: ["esm"],
  // `exports` names `.js`/`.d.ts`; tsdown 0.22 defaults to `.mjs`/`.d.mts`.
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  dts: true,
  clean: true,
  plugins: [barq],
  external: ["@barqjs/aria", "@barqjs/core", "@barqjs/css", "@barqjs/lucide", "@barqjs/primitives"],
});
