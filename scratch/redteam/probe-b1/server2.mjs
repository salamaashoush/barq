/**
 * Does the `async` module entry in the head see `#app`?
 *
 * `defaultClientEntry` (packages/start/src/vite.ts:85-88) does
 *   const container = document.getElementById("app");
 *   if (container === null) throw new Error(...)
 * at MODULE TOP LEVEL, before `state.start()`. B1 moves that module into the
 * head as `<script type="module" async src>`. An async script runs the moment
 * it is available; with the chunk in the HTTP cache that is while the parser is
 * still inside the head.
 *
 * pad=N puts N bytes of head content (a realistic head: CSS links, modulepreload
 * tags, the inline seed) between the entry tag and `<div id="app">`, and — more
 * importantly — makes the shell span more than one TCP segment when `split=1`.
 */
import { createServer } from "node:http";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/entry.js") {
    res.writeHead(200, { "content-type": "text/javascript", "cache-control": "public, max-age=3600" });
    res.end(`
const t = Math.round(performance.now() - window.__T0__);
const container = document.getElementById("app");
window.__RESULT__ = {
  t, readyState: document.readyState,
  appFound: container !== null,
  headParsed: document.head ? document.head.childElementCount : -1,
  bodyExists: !!document.body,
  wouldThrow: container === null,
};
`);
    return;
  }
  const pad = Number(url.searchParams.get("pad") ?? 0);
  const split = url.searchParams.get("split") === "1";
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.write(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<script>window.__T0__=performance.now()<\/script>` +
      `<script type="module" async src="/entry.js"></script>`,
  );
  if (pad > 0) {
    // realistic head tail: stylesheet + modulepreloads + the inline context seed
    let padding = "";
    while (padding.length < pad) padding += `<link rel="modulepreload" href="/chunk-${padding.length}.js">`;
    res.write(padding); const gap = Number(url.searchParams.get("gap") ?? 0); if (gap > 0) await sleep(gap);
  }
  res.write(`</head><body><div id="app"><p>ssr</p></div></body></html>`);
  res.end();
}).listen(4602, () => console.log("probe-b1-app on http://localhost:4602"));
