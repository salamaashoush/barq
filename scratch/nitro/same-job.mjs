/**
 * The only fair comparison: the SAME job, both ways.
 *
 * Both check a build-time asset map, both fall through to the same terminal
 * handler. The only difference is that nitro's path goes through h3. So the
 * delta IS h3's dispatch, with nothing else moving.
 */
import { H3, HTTPError, toRequest } from "h3";
import { decodePath, joinURL, withLeadingSlash, withoutTrailingSlash } from "ufo";

const BODY = "<!doctype html><html><head><title>x</title></head><body>hello</body></html>";
const terminal = () => new Response(BODY, { headers: { "content-type": "text/html" } });

const ASSETS = Object.fromEntries(
  Array.from({ length: 21 }, (_, i) => [`/assets/chunk-${i}.js`, { type: "text/javascript" }]),
);
const EncodingMap = { gzip: ".gz", br: ".br", zstd: ".zst" };

function lookup(pathname, encodingHeader) {
  const id = decodePath(withLeadingSlash(withoutTrailingSlash(pathname)));
  const encodings = [
    ...encodingHeader.split(",").map((e) => EncodingMap[e.trim()]).filter(Boolean).sort(),
    "",
  ];
  for (const encoding of encodings) {
    for (const _id of [id + encoding, joinURL(id, "index.html" + encoding)]) {
      if (ASSETS[_id]) return _id;
    }
  }
  return null;
}

/** What `serveBarq` would be: one function, no framework. */
const direct = (request) => {
  const url = new URL(request.url);
  const hit = lookup(url.pathname, request.headers.get("accept-encoding") || "");
  return hit ? new Response("asset") : terminal();
};

/** What nitro is: the same two steps, through h3. */
const app = new H3();
app.use((event) => {
  const hit = lookup(event.url.pathname, event.req.headers.get("accept-encoding") || "");
  if (hit) return "asset";
  if (event.url.pathname.startsWith("/assets/")) throw new HTTPError({ status: 404 });
});
app.all("/**", (event) => { toRequest(event.req); return terminal(); });

async function measure(label, fn, n) {
  for (let i = 0; i < 20000; i++) await fn();
  const t0 = Bun.nanoseconds();
  for (let i = 0; i < n; i++) await fn();
  const ns = (Bun.nanoseconds() - t0) / n;
  console.log(`  ${label.padEnd(24)} ${(ns / 1000).toFixed(4)} us  ${Math.round(1e9 / ns).toLocaleString()}/s`);
  return ns;
}

const N = 300_000;
const headers = { "accept-encoding": "gzip, deflate, br, zstd" };
for (const [what, path] of [["SSR page (asset miss)", "/some/page"], ["static asset (hit)", "/assets/chunk-7.js"]]) {
  console.log(`\n${what}:`);
  const a = await measure("serveBarq (no h3)", () => direct(new Request(`http://x${path}`, { headers })), N);
  const b = await measure("nitro (through h3)", () => app.fetch(new Request(`http://x${path}`, { headers })), N);
  console.log(`  -> nitro costs ${((b - a) / 1000).toFixed(3)} us more (${((b / a - 1) * 100).toFixed(0)}%)`);
}
