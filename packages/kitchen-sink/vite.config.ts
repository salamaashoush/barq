import { defineConfig, type Plugin } from "vite";
import { barqVitePlugin } from "@barqjs/compiler/vite";

/**
 * The route set `BARQ013` checks every `<Link to>` against.
 *
 * The compiler sees one module and a route set is a whole-project fact, so it
 * has to be handed one. `@barqjs/router/vite`'s `barqRouter({ onRoutes })`
 * reports it for a FILE-BASED project; this app is code-based — twice over,
 * which is the part worth knowing:
 *
 *  - `src/App.tsx` builds its table from `sections`, one route per demo;
 *  - `src/demos/RoutingDemo.tsx` has a SECOND, nested router on a
 *    `memoryHistory`, with its own table under `/demo/dashboard`.
 *
 * So the set is the union, declared here, and BARQ013's premise — one route
 * table per project — is not something an application is obliged to satisfy. A
 * project that passes only half of its routes gets a warning on every link into
 * the other half, which is why this is opt-in and absent means off.
 */
const DEMO_SECTIONS = [
  "signals",
  "components",
  "store",
  "async",
  "css",
  "hooks",
  "query",
  "routing",
  "jsx-types",
];

const ROUTES = [
  "/",
  ...DEMO_SECTIONS.map((id) => `/${id}`),
  "/demo/dashboard",
  "/demo/dashboard/login",
  "/demo/dashboard/users",
  "/demo/dashboard/users/$id",
  "/demo/dashboard/posts",
  "/demo/dashboard/posts/$id",
  "/demo/dashboard/admin",
];

// Mock API plugin for development
function mockApiPlugin(): Plugin {
  return {
    name: "mock-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url!, `http://${req.headers.host}`);

        if (url.pathname === "/api/users") {
          await sleep(500);
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify([
              { id: 1, name: "Alice", email: "alice@example.com" },
              { id: 2, name: "Bob", email: "bob@example.com" },
              { id: 3, name: "Charlie", email: "charlie@example.com" },
            ]),
          );
          return;
        }

        if (url.pathname.startsWith("/api/users/")) {
          const id = url.pathname.split("/").pop();
          await sleep(300);
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              id: Number(id),
              name: `User ${id}`,
              email: `user${id}@example.com`,
              bio: "Lorem ipsum dolor sit amet",
            }),
          );
          return;
        }

        if (url.pathname === "/api/posts") {
          const page = Number(url.searchParams.get("page") || "1");
          await sleep(400);
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              posts: Array.from({ length: 10 }, (_, i) => ({
                id: (page - 1) * 10 + i + 1,
                title: `Post ${(page - 1) * 10 + i + 1}`,
                body: "Lorem ipsum dolor sit amet...",
              })),
              nextPage: page < 5 ? page + 1 : null,
            }),
          );
          return;
        }

        if (url.pathname === "/api/slow") {
          await sleep(2000);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ message: "Slow response complete" }));
          return;
        }

        // One slot of a Reveal group. `?delay` is what makes the group's slots
        // settle OUT of registration order, which is the only condition under
        // which the three orders differ from each other at all.
        if (url.pathname === "/api/staggered") {
          const name = url.searchParams.get("name") ?? "?";
          await sleep(Number(url.searchParams.get("delay") ?? "0"));
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ name, at: Date.now() }));
          return;
        }

        if (url.pathname === "/api/error") {
          res.statusCode = 500;
          res.end("Internal Server Error");
          return;
        }

        next();
      });
    },
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default defineConfig({
  plugins: [barqVitePlugin({ routes: ROUTES }), mockApiPlugin()],
  resolve: {
    // Use "bun" condition to resolve workspace packages to source files
    conditions: ["bun", "import", "module", "browser", "default"],
  },
  server: {
    port: 3456,
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "@barqjs/core",
  },
});
