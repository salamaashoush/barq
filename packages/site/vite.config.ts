import { fileURLToPath } from "node:url";

import barq from "@barqjs/compiler/vite";
import { defineConfig } from "vite";

const from = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * The site: what ui.shadcn.com is, over `@barqjs/ui`.
 *
 * `@barqjs/ui` and `@barqjs/router` are aliased to their SOURCE rather than
 * resolved as packages, and that is the point: the compiler plugin then folds
 * every `css` block and every component on the way through, so what the browser
 * paints is what a consumer's build produces rather than what the runtime
 * fallback produces. A `dist` the plugin did not compile would leave those two
 * running the fallback while everything around them is folded.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@barqjs\/ui$/, replacement: from("../ui/src/index.ts") },
      { find: /^@barqjs\/ui\/(.*)$/, replacement: `${from("../ui/src")}/$1` },
      { find: /^@barqjs\/router$/, replacement: from("../router/src/index.ts") },
    ],
  },
  plugins: [barq({ strictCss: true })],
  server: { port: 5183 },
});
