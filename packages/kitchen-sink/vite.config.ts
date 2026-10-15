import barq from "@barqjs/vite";
import { defineConfig, type Plugin } from "vite";

/**
 * Patterns `BARQ013` accepts beside the file routes.
 *
 * `src/demos/RoutingDemo.tsx` mounts a SECOND router on a `memoryHistory` with
 * its own table, which the file scan cannot know about, so its patterns are
 * declared here and unioned in.
 *
 * BARQ013's premise is one route table per project, and an application is not
 * obliged to satisfy it. This is what "declare the union" looks like.
 */
const NESTED_DEMO_ROUTES = [
  "/demo/dashboard",
  "/demo/dashboard/login",
  "/demo/dashboard/users",
  "/demo/dashboard/users/$id",
  "/demo/dashboard/posts",
  "/demo/dashboard/posts/$id",
  "/demo/dashboard/admin",
];

// The demos fetch these. In production they are prerendered away or client-only,
// so this is a dev convenience rather than part of the app.
function mockApiPlugin(): Plugin {
  return {
    name: "mock-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
        const json = (value: unknown): void => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(value));
        };
        if (url.pathname === "/api/users") {
          await sleep(500);
          json([
            { id: 1, name: "Alice", email: "alice@example.com" },
            { id: 2, name: "Bob", email: "bob@example.com" },
            { id: 3, name: "Charlie", email: "charlie@example.com" },
          ]);
          return;
        }
        if (url.pathname.startsWith("/api/users/")) {
          const id = url.pathname.split("/").pop();
          await sleep(300);
          json({
            id: Number(id),
            name: `User ${id}`,
            email: `user${id}@example.com`,
            bio: "Lorem ipsum dolor sit amet",
          });
          return;
        }
        if (url.pathname === "/api/posts") {
          const page = Number(url.searchParams.get("page") || "1");
          await sleep(400);
          json({
            posts: Array.from({ length: 10 }, (_, i) => ({
              id: (page - 1) * 10 + i + 1,
              title: `Post ${(page - 1) * 10 + i + 1}`,
              body: "Lorem ipsum dolor sit amet...",
            })),
            nextPage: page < 5 ? page + 1 : null,
          });
          return;
        }
        if (url.pathname === "/api/slow") {
          await sleep(2000);
          json({ message: "Slow response complete" });
          return;
        }
        // One slot of a Reveal group. `?delay` is what makes the group's slots
        // settle OUT of registration order, which is the only condition under
        // which the three orders differ from each other at all.
        if (url.pathname === "/api/staggered") {
          const name = url.searchParams.get("name") ?? "?";
          await sleep(Number(url.searchParams.get("delay") ?? "0"));
          json({ name, at: Date.now() });
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
  plugins: [
    barq({
      ssr: true,
      // In this workspace the `bun` condition takes `@barqjs/*` to `src`, and
      // both environments must resolve them the same way: an ssr environment
      // that took `import` to `dist` would give the app two copies of
      // `@barqjs/core`, one holding the async session a streamed render parks
      // into and the other the loop that would resume it.
      conditions: ["bun"],
      start: {
        // `/` seeds it; `/about` is found by crawling the layout's own nav.
        prerender: { routes: ["/"] },
        /**
         * The route-action chain check, ARMED.
         *
         * `/admin` declares `middleware: [requireSession]`, and both server
         * functions in `admin.data.ts` carry the same closure. Delete
         * `.middleware([requireSession])` from either and this build fails
         * naming the route, the function and how many of the chain it is
         * missing.
         */
        verify: true,
      },
      compiler: { routes: NESTED_DEMO_ROUTES },
    }),
    mockApiPlugin(),
  ],
  server: { port: 3456 },
});
