/**
 * Serve the build: prerendered HTML and static assets first, then SSR.
 *
 * `vite preview` is client-only — it reads `environments.client.build.outDir`
 * and nothing else — so previewing an app with a server half is this. It is also
 * the shape a deployment has: a static file wins, and whatever is left is
 * rendered.
 *
 * RUN IT WITH BUN, which is what `package.json` does. It was `node
 * ./preview.mjs` against a file whose every I/O call is `Bun.serve` and
 * `Bun.file`, so `bun run preview` was a `ReferenceError` on the first request
 * and had been for as long as the script existed — nothing runs it in CI.
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("./dist/client/", import.meta.url).pathname;
const { default: entry } = await import("./dist/server/server.js");

const TYPES = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function staticFile(pathname) {
  for (const candidate of [join(root, pathname), join(root, pathname, "index.html")]) {
    if (!existsSync(candidate) || !statSync(candidate).isFile()) continue;
    const extension = candidate.slice(candidate.lastIndexOf("."));
    return new Response(Bun.file(candidate), {
      headers: { "content-type": TYPES[extension] ?? "application/octet-stream" },
    });
  }
  return null;
}

/**
 * The demos' endpoints, which `vite.config.ts` serves in dev.
 *
 * Here too, because a preview that 404s them shows a demo its error state and
 * calls that the production build. They are the app's fixtures, not the
 * framework's.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function mockApi(url) {
  const json = (value) =>
    new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
  if (url.pathname === "/api/users") {
    await sleep(500);
    return json([
      { id: 1, name: "Alice", email: "alice@example.com" },
      { id: 2, name: "Bob", email: "bob@example.com" },
      { id: 3, name: "Charlie", email: "charlie@example.com" },
    ]);
  }
  if (url.pathname.startsWith("/api/users/")) {
    const id = url.pathname.split("/").pop();
    await sleep(300);
    return json({ id: Number(id), name: `User ${id}`, email: `user${id}@example.com`, bio: "Lorem ipsum dolor sit amet" });
  }
  if (url.pathname === "/api/posts") {
    const page = Number(url.searchParams.get("page") || "1");
    await sleep(400);
    return json({
      posts: Array.from({ length: 10 }, (_, i) => ({
        id: (page - 1) * 10 + i + 1,
        title: `Post ${(page - 1) * 10 + i + 1}`,
        body: "Lorem ipsum dolor sit amet...",
      })),
      nextPage: page < 5 ? page + 1 : null,
    });
  }
  if (url.pathname === "/api/slow") {
    await sleep(2000);
    return json({ message: "Slow response complete" });
  }
  if (url.pathname === "/api/staggered") {
    await sleep(Number(url.searchParams.get("delay") ?? "0"));
    return json({ name: url.searchParams.get("name") ?? "?", at: Date.now() });
  }
  if (url.pathname === "/api/error") return new Response("Internal Server Error", { status: 500 });
  return null;
}

const port = Number(process.env.PORT ?? 3456);
Bun.serve({
  port,
  fetch: async (request) => {
    const url = new URL(request.url);
    return (await mockApi(url)) ?? staticFile(url.pathname) ?? entry.fetch(request);
  },
});
console.log(`preview on http://localhost:${port}`);
