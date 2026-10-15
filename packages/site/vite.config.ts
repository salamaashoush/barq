import { fileURLToPath } from "node:url";

import barq from "@barqjs/vite";
import { defineConfig } from "vite";

const from = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * The site: what ui.shadcn.com is, over `@barqjs/ui`, rendered on the server.
 *
 * `@barqjs/ui` is aliased to its SOURCE rather than resolved as a package, and
 * that is the point: the compiler plugin then folds every `css` block and every
 * component on the way through, so what the browser receives is what a
 * consumer's build produces rather than what the runtime fallback produces.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@barqjs\/ui$/, replacement: from("../ui/src/index.ts") },
      // The barrel carries sonner's `toast` and `Toaster`; the other pair has
      // this path of its own, and it is a component file rather than a
      // directory under `src`.
      { find: /^@barqjs\/ui\/toast$/, replacement: from("../ui/src/ui/toast.tsx") },
      { find: /^@barqjs\/ui\/(.*)$/, replacement: `${from("../ui/src")}/$1` },
      { find: /^@barqjs\/router$/, replacement: from("../router/dist/index.js") },
      { find: /^@barqjs\/router\/server$/, replacement: from("../router/dist/server.js") },
      { find: /^@barqjs\/router\/client$/, replacement: from("../router/dist/client.js") },
    ],
  },
  plugins: [barq({ ssr: true, start: { verify: true }, compiler: { strictCss: true } })],
  server: { port: 5183 },
});
