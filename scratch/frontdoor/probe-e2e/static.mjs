import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const root = `${import.meta.dirname}/dist/client`;
Bun.serve({ port: 5200, fetch(req) {
  const p = new URL(req.url).pathname;
  for (const f of [join(root, p), join(root, p, "index.html")]) {
    if (existsSync(f) && !f.endsWith("/")) {
      try { const b = readFileSync(f); return new Response(b, { headers: { "content-type": f.endsWith(".js") ? "text/javascript" : "text/html" } }); } catch {}
    }
  }
  return new Response("404", { status: 404 });
}});
console.log("static on :5200");
