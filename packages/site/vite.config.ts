import { fileURLToPath } from "node:url";

import { barqRouter } from "@barqjs/router/vite";
import { barqStart } from "@barqjs/start/vite";
import { defineConfig } from "vite";

const from = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * The site: what ui.shadcn.com is, over `@barqjs/ui`, rendered on the server.
 *
 * `@barqjs/ui` and `@barqjs/router` are aliased to their SOURCE rather than
 * resolved as packages, and that is the point: the compiler plugin then folds
 * every `css` block and every component on the way through, so what the browser
 * receives is what a consumer's build produces rather than what the runtime
 * fallback produces. A `dist` the plugin did not compile would leave those two
 * running the fallback while everything around them is folded.
 *
 * `barqRouter` scans `src/routes` and `barqStart` compiles and builds, and two
 * facts have to cross between them. Neither can be a closure they share: Vite
 * re-resolves the config per environment, so a module-scope variable is the
 * channel.
 */
let routes: readonly string[] = [];
let reachability: ReadonlyMap<string, ReadonlySet<string>> | undefined;

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@barqjs\/ui$/, replacement: from("../ui/src/index.ts") },
      { find: /^@barqjs\/ui\/(.*)$/, replacement: `${from("../ui/src")}/$1` },
      { find: /^@barqjs\/router$/, replacement: from("../router/dist/index.js") },
      { find: /^@barqjs\/router\/server$/, replacement: from("../router/dist/server.js") },
      { find: /^@barqjs\/router\/client$/, replacement: from("../router/dist/client.js") },
      { find: /^@barqjs\/router$/, replacement: from("../router/src/index.ts") },
    ],
  },
  plugins: [
    barqRouter({
      onRoutes: (patterns) => (routes = patterns),
      onReachability: (found) => (reachability = found),
    }),
    barqStart({
      compiler: {
        // Required for SSR: the server writes hydration markers and the client
        // walks them. Off by default, and both halves must agree.
        hydratable: true,
        strictCss: true,
        // A thunk, not an array. `onRoutes` fires in `configResolved` and this
        // is read per transform; an array here is snapshotted while it is still
        // empty and every `<Link to>` is reported as matching no route.
        routes: () => routes,
      },
      verify: { reachability: () => reachability },
    }),
  ],
  server: { port: 5183 },
});
