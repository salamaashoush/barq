/**
 * `transformShell` (packages/start/src/vite.ts:227-236) relocates every
 * `injectTo: "body"` tag to just BEFORE `</head>`. With B1 the client entry is
 * the last thing in the head, so a relocated preamble lands AFTER it.
 * Who wins?
 */
import { createServer } from "node:http";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/entry.js") {
    res.writeHead(200, { "content-type": "text/javascript", "cache-control": "public, max-age=3600" });
    res.end(`window.__RESULT__={
      t: Math.round(performance.now()-window.__T0__),
      readyState: document.readyState,
      preambleRanFirst: typeof window.__PREAMBLE__ !== "undefined",
      appFound: document.getElementById("app") !== null,
    };`);
    return;
  }
  const gap = Number(url.searchParams.get("gap") ?? 0);
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.write(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<script>window.__T0__=performance.now()<\/script>` +
      `<script type="module" async src="/entry.js"></script>`,
  );
  if (gap > 0) await sleep(gap);
  // what transformShell relocates to just before </head>
  res.write(`<script>window.__PREAMBLE__=1<\/script></head><body><div id="app"><p>ssr</p></div></body></html>`);
  res.end();
}).listen(4603, () => console.log("probe-preamble on 4603"));
