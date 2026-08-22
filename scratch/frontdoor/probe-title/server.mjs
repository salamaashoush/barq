/** Which `<title>` wins when a document carries two, and in which order. */
import { createServer } from "node:http";
const page = (inner) =>
  `<!doctype html><html><head><meta charset="utf-8">${inner}</head><body>x</body></html>`;
createServer((req, res) => {
  const mode = new URL(req.url, "http://x").searchParams.get("mode");
  const route = `<title data-barq-head="title">ROUTE</title>`;
  const fallback = `<title>FALLBACK</title>`;
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(
    page(
      mode === "route-first" ? route + fallback
      : mode === "fallback-first" ? fallback + route
      : route,
    ),
  );
}).listen(4607, () => console.log("probe-title on 4607"));
