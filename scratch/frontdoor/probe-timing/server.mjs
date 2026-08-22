/**
 * When does a deferred `<script type="module">` in the BODY of a STREAMED
 * document actually execute, relative to later stream flushes?
 *
 * Mirrors barq's wrapStream shape: head, mount div with a parked boundary, the
 * client-entry module script, then LATER flushes that carry the seed.
 */
import { createServer } from "node:http";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ENTRY = `
  const t0 = performance.now();
  window.__LOG__ = window.__LOG__ || [];
  window.__LOG__.push({
    at: "module-entry-executed",
    t: Math.round(performance.now()),
    readyState: document.readyState,
    seedOpen: window.__BARQ_SEED__ ? window.__BARQ_SEED__.open : "no-channel",
    seedKeys: window.__BARQ_DATA__ ? Object.keys(window.__BARQ_DATA__) : "no-data",
    bodyHTML: document.getElementById("app") ? document.getElementById("app").innerHTML : null,
  });
`;

createServer(async (req, res) => {
  if (req.url === "/entry.js") {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(ENTRY);
    return;
  }
  if (req.url === "/entry-async.js") {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(ENTRY.replace("module-entry-executed", "async-module-entry-executed"));
    return;
  }
  const mode = new URL(req.url, "http://x").searchParams.get("mode") ?? "module";
  const attr = mode === "async" ? " async" : mode === "defer" ? " defer" : "";
  const src = mode === "async" ? "/entry-async.js" : "/entry.js";
  const type = mode === "classic" ? "" : ' type="module"';
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  // head
  res.write(`<!doctype html><html><head><title>t</title><script>window.__LOG__=[];window.__LOG__.push({at:"head-inline",t:Math.round(performance.now())})<\/script></head><body>`);
  res.write(`<div id="app"><!--[--><!--[b:0--><i>loading</i><!--]--><!--]--></div>`);
  // the client entry, exactly where barq's document function would put it
  res.write(`<script${type}${attr} src="${src}"><\/script>`);
  await sleep(1200);
  // a later flush: the seed channel + a swap, like renderToStream's rounds
  res.write(`<script>window.__LOG__.push({at:"late-flush-1",t:Math.round(performance.now()),moduleRan:window.__LOG__.some(e=>e.at.includes("entry-executed"))});window.__BARQ_SEED__={open:1,wait(){},tell(){}};window.__BARQ_DATA__={"r:/users/$id|id=7":{name:"Ada"}}<\/script>`);
  await sleep(1200);
  res.write(`<script>window.__LOG__.push({at:"late-flush-2-done",t:Math.round(performance.now()),moduleRan:window.__LOG__.some(e=>e.at.includes("entry-executed"))});window.__BARQ_SEED__.open=0<\/script>`);
  res.end(`</body></html>`);
}).listen(5311, () => console.log("timing probe on http://localhost:5311"));
