import { barqRouter } from "@barqjs/router/vite";
import { barqStart } from "@barqjs/start/vite";
import { defineConfig } from "vite";

// `barqRouter` scans `src/routes`, `barqStart` compiles and builds, and two
// facts have to cross between them. Neither can be a closure they share: Vite
// re-resolves the config per environment, so a module-scope variable is the
// channel.
let routes: readonly string[] = [];
let reachability: ReadonlyMap<string, ReadonlySet<string>> | undefined;

export default defineConfig({
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
        // A thunk, not an array. `onRoutes` fires in `configResolved` and this
        // is read per transform; an array here is snapshotted while it is still
        // empty, and every `<Link to>` is reported as matching no route.
        routes: () => routes,
      },
      // `/` is the seed. Everything else is found by crawling the links each
      // rendered page produced, and kept only where the route declares
      // `prerender`.
      prerender: { routes: ["/"] },
      // Fails the build when a route reaches a server function that does not
      // carry that route's declared middleware.
      verify: { reachability: () => reachability },
    }),
  ],
});
