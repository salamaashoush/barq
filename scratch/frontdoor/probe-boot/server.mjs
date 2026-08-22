/**
 * When does the client ENTRY start downloading, and when does it execute,
 * relative to a stream that is still open?
 *
 * barq's `wrapStream` puts the document tail — and therefore the entry
 * `<script type="module" src>` — after the body, so the browser cannot discover
 * it until the last flush. Three shapes, one document, same stream timing:
 *
 *   tail     what barq emits today
 *   preload  the same, plus `<link rel="modulepreload">` in the head
 *   head     `<script type="module" async>` in the head instead
 *
 * The channel snippet is emitted where barq emits it — right after the app
 * markup — so "does the entry land inside the seed window" is asked against the
 * real byte order rather than a convenient one.
 */
import { createServer } from "node:http";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ENTRY_MS = 120; // the entry chunk is not free to fetch
const STREAM_MS = 600; // one slow boundary

const ENTRY = `
window.__LOG__.push({
  at: "entry-executed",
  t: Math.round(performance.now() - window.__T0__),
  readyState: document.readyState,
  seedOpen: window.__BARQ_SEED__ ? window.__BARQ_SEED__.open : "no-channel",
  seedKeys: window.__BARQ_DATA__ ? Object.keys(window.__BARQ_DATA__) : [],
  appHTML: (document.getElementById("app") || {}).innerHTML || null,
});
`;

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/entry.js") {
    await sleep(ENTRY_MS);
    res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" });
    res.end(ENTRY);
    return;
  }
  const mode = url.searchParams.get("mode") ?? "tail";
  const headScript =
    mode === "head" ? `<script type="module" async src="/entry.js"></script>` : "";
  const headPreload =
    mode === "preload" ? `<link rel="modulepreload" href="/entry.js">` : "";
  const tailScript = mode === "head" ? "" : `<script type="module" src="/entry.js"></script>`;

  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  // The shell: the document up to and including the mount element.
  res.write(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<script>window.__T0__=performance.now();window.__LOG__=[]<\/script>` +
      `${headPreload}${headScript}</head><body><div id="app"><p>loading...</p>`,
  );
  // What `renderToStream` writes right after the shell: capture, then channel.
  res.write(
    `<script>window.__LOG__.push({at:"channel-open",t:Math.round(performance.now()-window.__T0__)});` +
      `window.__BARQ_SEED__={open:1,wait:function(k,f){},tell:function(){}}<\/script>`,
  );
  await sleep(STREAM_MS);
  res.write(
    `<script>window.__LOG__.push({at:"seed-flush",t:Math.round(performance.now()-window.__T0__)});` +
      `window.__BARQ_DATA__={"r:/users/$id|id=7":{name:"Ada"}}<\/script>`,
  );
  res.write(
    `<script>window.__LOG__.push({at:"channel-done",t:Math.round(performance.now()-window.__T0__)});` +
      `window.__BARQ_SEED__.open=0<\/script>`,
  );
  res.end(`</div>${tailScript}</body></html>`);
}).listen(4599, () => console.log("probe-boot on http://localhost:4599"));
