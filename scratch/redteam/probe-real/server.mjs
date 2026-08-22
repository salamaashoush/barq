import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
const DIST = "/home/sashoush/Workspace/barq/packages/kitchen-sink/dist/client";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".svg": "image/svg+xml" };
const ENTRY = "/assets/index-Ciplqqjz.js";
createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/assets/")) {
    try {
      const body = await readFile(join(DIST, url.pathname));
      res.writeHead(200, { "content-type": MIME[extname(url.pathname)] ?? "application/octet-stream", "cache-control": "public, max-age=3600" });
      res.end(body);
    } catch { res.writeHead(404).end("nope"); }
    return;
  }
  const mode = url.searchParams.get("mode") ?? "b1";
  const gap = Number(url.searchParams.get("gap") ?? 30);
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.write(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<script>window.__ERRORS__=[];addEventListener("error",function(e){window.__ERRORS__.push(String((e.error&&e.error.message)||e.message))});` +
      `addEventListener("unhandledrejection",function(e){window.__ERRORS__.push("rejection: "+String((e.reason&&e.reason.message)||e.reason))});<\/script>` +
      (mode === "b1" ? `<script type="module" async src="${ENTRY}"></script>` : ""),
  );
  if (gap > 0) await sleep(gap);
  res.write(`</head><body><div id="app"><p>server markup</p></div>`);
  res.end((mode === "b1" ? "" : `<script type="module" src="${ENTRY}"></script>`) + `</body></html>`);
}).listen(4606, () => console.log("probe-real on 4606"));
