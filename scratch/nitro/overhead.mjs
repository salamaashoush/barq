/**
 * Nitro's real per-request overhead in front of a barq handler. MICROseconds.
 *
 * Models nitro's production shape from source: its static handler
 * (`runtime/internal/static.ts`) reads a BUILD-TIME object, so a miss is string
 * normalisation + an accept-encoding parse + object lookups, not a stat.
 */
import { H3, HTTPError, toRequest } from "h3";
import { decodePath, joinURL, withLeadingSlash, withoutTrailingSlash } from "ufo";

const BODY = "<!doctype html><html><head><title>x</title></head><body>hello</body></html>";
const terminal = { fetch: () => new Response(BODY, { headers: { "content-type": "text/html" } }) };

// A build-time asset map the size kitchen-sink produces (21 client files).
const ASSETS = Object.fromEntries(
  Array.from({ length: 21 }, (_, i) => [`/assets/chunk-${i}.js`, { type: "text/javascript", etag: `"${i}"`, mtime: 0, size: 100 }]),
);
const getAsset = (id) => ASSETS[id];
const isPublicAssetURL = (id) => id.startsWith("/assets/");
const METHODS = new Set(["HEAD", "GET"]);
const EncodingMap = { gzip: ".gz", br: ".br", zstd: ".zst" };

function staticHandler(event) {
  if (event.req.method && !METHODS.has(event.req.method)) return;
  let id = decodePath(withLeadingSlash(withoutTrailingSlash(event.url.pathname)));
  let asset;
  const encodingHeader = event.req.headers.get("accept-encoding") || "";
  const encodings = [
    ...encodingHeader.split(",").map((e) => EncodingMap[e.trim()]).filter(Boolean).sort(),
    "",
  ];
  for (const encoding of encodings) {
    for (const _id of [id + encoding, joinURL(id, "index.html" + encoding)]) {
      const _asset = getAsset(_id);
      if (_asset) { asset = _asset; id = _id; break; }
    }
  }
  if (!asset) {
    if (isPublicAssetURL(id)) { event.res.headers.delete("Cache-Control"); throw new HTTPError({ status: 404 }); }
    return;
  }
  return "asset";
}

const nitroish = new H3();
nitroish.use(staticHandler);
nitroish.all("/**", (event) => terminal.fetch(toRequest(event.req)));

async function measure(label, fn, n) {
  for (let i = 0; i < 20000; i++) await fn();
  const t0 = Bun.nanoseconds();
  for (let i = 0; i < n; i++) await fn();
  const ns = (Bun.nanoseconds() - t0) / n;
  console.log(`${label.padEnd(32)} ${(ns / 1000).toFixed(4)} us  ${Math.round(1e9 / ns).toLocaleString()}/s`);
  return ns;
}

const N = 200_000;
const url = "http://localhost/some/page";
const headers = { "accept-encoding": "gzip, deflate, br, zstd" };
const base = await measure("baseline (Request + terminal)", () => { new Request(url, { headers }); return terminal.fetch(); }, N);
const nitro = await measure("nitro shape (static miss + ssr)", () => nitroish.fetch(new Request(url, { headers })), N);
console.log(`\nnitro overhead: ${((nitro - base) / 1000).toFixed(3)} us/request\n`);
for (const [what, us] of [["api route GET", 0.0021 * 1000], ["404", 0.0065 * 1000], ["page render", 0.0152 * 1000]]) {
  const after = us + (nitro - base) / 1000;
  console.log(`${what.padEnd(14)} ${us.toFixed(2)} us -> ${after.toFixed(2)} us   ${Math.round(1e6 / us).toLocaleString()}/s -> ${Math.round(1e6 / after).toLocaleString()}/s  (${((after / us - 1) * 100).toFixed(0)}% slower)`);
}
