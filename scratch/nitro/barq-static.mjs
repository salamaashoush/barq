/**
 * `assetMiddleware` against what `preview.mjs` used to do, on the SAME files.
 *
 * Not a model this time: the real middleware, the real manifest kitchen-sink's
 * build wrote, and the real output directory.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { assetMiddleware } from "../../packages/start/src/static.ts";

const dir = new URL("../../packages/kitchen-sink/dist/client", import.meta.url).pathname;
if (!existsSync(join(dir, "barq-assets.json"))) {
  console.error("build kitchen-sink first: bun run --cwd packages/kitchen-sink build");
  process.exit(1);
}

// preview.mjs:29-38, as it was.
function previous(pathname) {
  for (const candidate of [join(dir, pathname), join(dir, pathname, "index.html")]) {
    if (!existsSync(candidate) || !statSync(candidate).isFile()) continue;
    return candidate;
  }
  return null;
}

const middleware = assetMiddleware({ dir });
const next = () => new Response("page handler");
const hit = JSON.parse(await Bun.file(join(dir, "barq-assets.json")).text()).files.find((f) =>
  f.endsWith(".js"),
);

async function measure(label, fn, n) {
  for (let i = 0; i < 5000; i++) await fn();
  const t0 = Bun.nanoseconds();
  for (let i = 0; i < n; i++) await fn();
  const ns = (Bun.nanoseconds() - t0) / n;
  console.log(`  ${label.padEnd(30)} ${(ns / 1000).toFixed(4)} us  ${Math.round(1e9 / ns).toLocaleString()}/s`);
  return ns;
}

const N = 100_000;
console.log("\nMISS (an SSR page request, the common case):");
const a = await measure("preview.mjs (existsSync+stat)", () => previous("/store"), N);
const b = await measure("assetMiddleware (manifest)", () =>
  middleware(new Request("http://x/store"), next), N);
console.log(`  -> ${((a - b) / 1000).toFixed(3)} us saved per request (${(((a - b) / a) * 100).toFixed(0)}% faster)`);

// NO HIT BENCHMARK. A hit is delegated to `srvx/static`, which streams the file
// from an open handle — measuring it in a loop without consuming 100,000 bodies
// leaks descriptors and bun errors on the collection, which says more about the
// benchmark than about the middleware. The claim being made here is about the
// MISS, and that is what is measured.
