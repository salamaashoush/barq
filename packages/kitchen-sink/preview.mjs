/**
 * Serve the build: prerendered HTML and static assets first, then SSR.
 *
 * `vite preview` is client-only — it reads `environments.client.build.outDir`
 * and nothing else — so previewing an app with a server half is this.
 *
 * IT USED TO BE A HAND-ROLLED STATIC SERVER, and that is the whole reason
 * `serveBarq` grew `static`. It called `existsSync` and `statSync` per request,
 * which measured 1.3295 us to answer a MISS against 0.8080 us for the build-time
 * manifest (`scratch/nitro/static.mjs`), and it could not know that a
 * prerendered page had a status of its own — every page came back 200 whatever
 * it was rendered as. Both are the framework's problem, not an application's,
 * and both are now solved where every deployment gets them.
 *
 * What is left here is the demos' own endpoints, which are the app's fixtures.
 */

import { serveBarq } from "@barqjs/start/serve";

import entry from "./dist/server/server.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const json = (value) =>
  new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });

/**
 * The demos' endpoints, which `vite.config.ts` serves in dev.
 *
 * Here too, because a preview that 404s them shows a demo its error state and
 * calls that the production build. An `srvx` middleware rather than a branch in
 * `fetch`, so it composes the same way anything else a project adds would.
 */
async function mockApi(request, next) {
  const url = new URL(request.url);
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
    return json({
      id: Number(id),
      name: `User ${id}`,
      email: `user${id}@example.com`,
      bio: "Lorem ipsum dolor sit amet",
    });
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
  return next();
}

const port = Number(process.env.PORT ?? 3456);

serveBarq({
  port,
  fetch: entry.fetch,
  // A year, and immutable: every filename under `assets/` is content-hashed, so
  // a changed file is a changed URL and a cached one can never be wrong.
  static: { dir: new URL("./dist/client", import.meta.url).pathname, maxAge: 31_536_000, immutable: true },
  middleware: [mockApi],
});

console.log(`preview on http://localhost:${port}`);
