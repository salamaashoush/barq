/** Where h3's per-request cost actually goes. Units are MICROseconds. */
import { H3, serveStatic, toRequest } from "h3";

const BODY = "<!doctype html><html><head><title>x</title></head><body>hello</body></html>";
const terminal = { fetch: () => new Response(BODY, { headers: { "content-type": "text/html" } }) };

const bare = new H3();
bare.all("/**", () => terminal.fetch());

const withStatic = new H3();
withStatic.use((event) => serveStatic(event, { getContents: () => undefined, getMeta: () => undefined }));
withStatic.all("/**", (event) => terminal.fetch(toRequest(event.req)));

// Nitro serves public assets from a prebuilt map; a miss is a Map.get, not a stat.
const assets = new Map([["/assets/index-abc.js", 1]]);
const withMap = new H3();
withMap.use((event) => (assets.has(new URL(event.req.url).pathname) ? new Response("asset") : undefined));
withMap.all("/**", (event) => terminal.fetch(toRequest(event.req)));

async function measure(label, fn, n) {
  for (let i = 0; i < 20000; i++) await fn();
  const t0 = Bun.nanoseconds();
  for (let i = 0; i < n; i++) await fn();
  const ns = (Bun.nanoseconds() - t0) / n;
  console.log(`${label.padEnd(30)} ${(ns / 1000).toFixed(4)} us  ${Math.round(1e9 / ns).toLocaleString()}/s`);
  return ns;
}

const N = 200_000;
const url = "http://localhost/some/page";
const direct = await measure("terminal only", () => terminal.fetch(), N);
const req = await measure("+ new Request()", () => { new Request(url); return terminal.fetch(); }, N);
const h3bare = await measure("h3, route only", () => bare.fetch(new Request(url)), N);
const h3map = await measure("h3 + asset Map miss", () => withMap.fetch(new Request(url)), N);
const h3static = await measure("h3 + serveStatic miss", () => withStatic.fetch(new Request(url)), N);
console.log(`\nh3 dispatch alone     ${((h3bare - req) / 1000).toFixed(3)} us`);
console.log(`h3 + asset map miss   ${((h3map - req) / 1000).toFixed(3)} us`);
console.log(`h3 + serveStatic miss ${((h3static - req) / 1000).toFixed(3)} us`);
