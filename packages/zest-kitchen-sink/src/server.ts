/**
 * Development server for kitchen sink app
 */

const server = Bun.serve({
  port: 3456,
  async fetch(req) {
    const url = new URL(req.url);

    // API endpoints for testing
    if (url.pathname === "/api/users") {
      await Bun.sleep(500); // Simulate latency
      return Response.json([
        { id: 1, name: "Alice", email: "alice@example.com" },
        { id: 2, name: "Bob", email: "bob@example.com" },
        { id: 3, name: "Charlie", email: "charlie@example.com" },
      ]);
    }

    if (url.pathname.startsWith("/api/users/")) {
      const id = url.pathname.split("/").pop();
      await Bun.sleep(300);
      return Response.json({
        id: Number(id),
        name: `User ${id}`,
        email: `user${id}@example.com`,
        bio: "Lorem ipsum dolor sit amet",
      });
    }

    if (url.pathname === "/api/posts") {
      const page = Number(url.searchParams.get("page") || "1");
      await Bun.sleep(400);
      return Response.json({
        posts: Array.from({ length: 10 }, (_, i) => ({
          id: (page - 1) * 10 + i + 1,
          title: `Post ${(page - 1) * 10 + i + 1}`,
          body: "Lorem ipsum dolor sit amet...",
        })),
        nextPage: page < 5 ? page + 1 : null,
      });
    }

    if (url.pathname === "/api/slow") {
      await Bun.sleep(2000);
      return Response.json({ message: "Slow response complete" });
    }

    if (url.pathname === "/api/error") {
      return new Response("Internal Server Error", { status: 500 });
    }

    // Build the app
    if (url.pathname === "/app.js") {
      const result = await Bun.build({
        entrypoints: ["./src/main.tsx"],
        target: "browser",
        format: "esm",
        minify: false,
        sourcemap: "inline",
      });

      if (!result.success) {
        console.error("Build failed:", result.logs);
        return new Response("Build failed", { status: 500 });
      }

      const output = await result.outputs[0].text();
      return new Response(output, {
        headers: { "Content-Type": "application/javascript" },
      });
    }

    // Serve index.html for all other routes (SPA)
    return new Response(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zest Kitchen Sink</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/app.js"></script>
</body>
</html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  },
});

console.log(`Kitchen Sink running at http://localhost:${server.port}`);
