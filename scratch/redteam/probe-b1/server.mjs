/**
 * Red-team probe for DESIGN-BATTERIES B1.
 *
 * Reproduces scratch/frontdoor/probe-boot and then attacks it on four axes the
 * original did not test:
 *   graph   - a REAL module entry with a static import chain (a bundle is not a
 *             zero-import file). Each hop costs a round trip.
 *   cached  - the entry served with a long max-age, so a second load has the
 *             chunk already in the HTTP cache. Does document order still hold
 *             against the inline boot script?
 *   real    - the REAL seedChannel/seedLater pair from @barqjs/server and
 *             @barqjs/core semantics, so "the read parks" is measured, not
 *             assumed.
 *   nodone  - the channel opened in the head by the document (B1's `boot`) on a
 *             stream that never emits `done()` because `renderToStream` never
 *             set `seededChannel`.
 */
import { createServer } from "node:http";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HOP_MS = 120;
const STREAM_MS = 600;

// The real one, copied verbatim from packages/server/src/server.ts seedChannel.
const SEED_CHANNEL = `(function seedChannel() {
  const waiting = {};
  const wake = (keys) => {
    const list = keys === null ? Object.keys(waiting) : keys;
    for (let i = list.length; i--;) {
      const k = list[i];
      const fns = waiting[k];
      if (!fns) continue;
      delete waiting[k];
      for (let j = fns.length; j--;) fns[j]();
    }
  };
  window.__BARQ_SEED__ = {
    open: 1,
    wait(key, fn) { (waiting[key] = waiting[key] ?? []).push(fn); },
    tell(keys) { wake(keys); },
    done() { window.__BARQ_SEED__.open = 0; wake(null); },
  };
})();`;

// The real seedLater + getSeed, from packages/core/src/signals.ts.
const CLIENT_READ = `
window.__READ__ = function (key) {
  const getSeed = (k) => {
    const store = window.__BARQ_DATA__;
    if (store && k in store) { const v = store[k]; delete store[k]; return { found: true, value: v }; }
    return { found: false };
  };
  const seedLater = (k) => {
    const ch = window.__BARQ_SEED__;
    if (ch === undefined || ch.open !== 1) return null;
    return new Promise((deliver) => { ch.wait(k, () => deliver(getSeed(k))); });
  };
  const hit = getSeed(key);
  if (hit.found) { window.__LOG__.push({ at: "read-sync-hit", key, t: T() }); return; }
  const later = seedLater(key);
  if (later === null) { window.__LOG__.push({ at: "read-refetch", key, t: T() }); return; }
  window.__LOG__.push({ at: "read-parked", key, t: T() });
  later.then((a) => window.__LOG__.push({ at: "read-resolved", key, found: a.found, t: T() }));
};`;

const ENTRY_BODY = (mode) => `
window.__LOG__.push({
  at: "entry-executed",
  t: T(),
  readyState: document.readyState,
  seedOpen: window.__BARQ_SEED__ ? window.__BARQ_SEED__.open : "no-channel",
  seedKeys: window.__BARQ_DATA__ ? Object.keys(window.__BARQ_DATA__) : [],
  appHTML: (document.getElementById("app") || {}).innerHTML || null,
});
${CLIENT_READ}
window.__READ__("r:/users/$id|id=7");
`;

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const mode = url.searchParams.get("mode") ?? "head";
  const cacheable = url.searchParams.get("cache") === "1";
  const cc = cacheable ? "public, max-age=3600" : "no-store";

  // A three-module static import chain: entry -> dep1 -> dep2.
  if (url.pathname === "/entry.js") {
    await sleep(HOP_MS);
    res.writeHead(200, { "content-type": "text/javascript", "cache-control": cc });
    const graph = url.searchParams.get("graph") === "1";
    res.end(
      (graph ? `import "/dep1.js?cache=${cacheable ? 1 : 0}";\n` : "") +
        `const T=()=>Math.round(performance.now()-window.__T0__);\n` +
        ENTRY_BODY(mode),
    );
    return;
  }
  if (url.pathname === "/dep1.js") {
    await sleep(HOP_MS);
    res.writeHead(200, { "content-type": "text/javascript", "cache-control": cc });
    res.end(`import "/dep2.js?cache=${cacheable ? 1 : 0}";\nwindow.__LOG__.push({at:"dep1",t:Math.round(performance.now()-window.__T0__)});`);
    return;
  }
  if (url.pathname === "/dep2.js") {
    await sleep(HOP_MS);
    res.writeHead(200, { "content-type": "text/javascript", "cache-control": cc });
    res.end(`window.__LOG__.push({at:"dep2",t:Math.round(performance.now()-window.__T0__)});`);
    return;
  }

  const graph = url.searchParams.get("graph") === "1";
  const entryHref = `/entry.js?graph=${graph ? 1 : 0}&cache=${cacheable ? 1 : 0}`;
  const headScript = mode === "head" ? `<script type="module" async src="${entryHref}"></script>` : "";
  const headPreload = mode === "preload" ? `<link rel="modulepreload" href="${entryHref}">` : "";
  const tailScript = mode === "head" ? "" : `<script type="module" src="${entryHref}"></script>`;

  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });

  // B1's document: boot (capture + channel) in the HEAD, ahead of the entry.
  const bootInHead = mode === "head" || mode === "nodone";
  res.write(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<script>window.__T0__=performance.now();window.__LOG__=[];window.T=()=>Math.round(performance.now()-window.__T0__)<\/script>` +
      (bootInHead
        ? `<script>window.__LOG__.push({at:"channel-open-HEAD",t:T()});${SEED_CHANNEL}<\/script>`
        : "") +
      `${headPreload}` +
      (mode === "nodone" ? `<script type="module" async src="${entryHref}"></script>` : headScript) +
      `</head><body><div id="app"><p>loading...</p>`,
  );
  if (!bootInHead) {
    res.write(
      `<script>window.__LOG__.push({at:"channel-open-BODY",t:T()});${SEED_CHANNEL}<\/script>`,
    );
  }
  await sleep(STREAM_MS);
  if (mode !== "nodone") {
    res.write(
      `<script>window.__LOG__.push({at:"seed-flush",t:T()});` +
        `window.__BARQ_DATA__=Object.assign(window.__BARQ_DATA__||{},{"r:/users/$id|id=7":{name:"Ada"}});` +
        `window.__BARQ_SEED__&&window.__BARQ_SEED__.tell(["r:/users/$id|id=7"])<\/script>`,
    );
    res.write(
      `<script>window.__LOG__.push({at:"channel-done",t:T()});window.__BARQ_SEED__&&window.__BARQ_SEED__.done()<\/script>`,
    );
  } else {
    // renderToStream with parked.length === 0: no seed, no channel, NO done().
    res.write(`<script>window.__LOG__.push({at:"stream-end-no-done",t:T()})<\/script>`);
  }
  res.end(`</div>${tailScript}</body></html>`);
}).listen(4601, () => console.log("probe-b1 on http://localhost:4601"));
