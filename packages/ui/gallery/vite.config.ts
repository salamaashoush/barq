import { fileURLToPath } from "node:url";

import barq from "@barqjs/compiler/vite";
import { defineConfig } from "vite";

const from = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * The gallery: every component on one page, for looking at in a real browser.
 *
 * `@barqjs/ui` is aliased to its SOURCE rather than resolved as a package, and
 * that is the point: the compiler plugin then folds every `css` block on the
 * way through, so what the browser paints is what a consumer's build produces
 * rather than what the runtime fallback produces.
 *
 * `root` is set explicitly because the config is loaded from the package above
 * it (`bun run gallery`), and Vite would otherwise look for `index.html` there.
 */
export default defineConfig({
  root: from("."),
  resolve: {
    alias: [
      { find: /^@barqjs\/ui$/, replacement: from("../src/index.ts") },
      { find: /^@barqjs\/ui\/(.*)$/, replacement: `${from("../src")}/$1` },
    ],
  },
  plugins: [barq({ strictCss: true })],
  server: { port: 5183 },
});
