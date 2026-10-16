/**
 * `assetMiddleware` against a per-request `existsSync` + `statSync`, on the same
 * files: kitchen-sink's build output and the manifest that build wrote.
 *
 * A production request is overwhelmingly a MISS, an SSR page asking about a
 * path that is not a file, so the miss is what is measured. A hit is delegated
 * to `srvx/static`, which streams from an open handle; looping it without
 * consuming every body leaks descriptors, which would measure the loop.
 *
 * Run: bun run --cwd packages/kitchen-sink build && bun run src/static-lookup.ts
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { ASSET_MANIFEST_FILE, assetMiddleware } from "@barqjs/start/serve";

const dir = new URL("../../kitchen-sink/dist/client", import.meta.url).pathname;
if (!existsSync(join(dir, ASSET_MANIFEST_FILE))) {
  console.error("build kitchen-sink first: bun run --cwd packages/kitchen-sink build");
  process.exit(1);
}

function statLookup(pathname: string): string | null {
  for (const candidate of [join(dir, pathname), join(dir, pathname, "index.html")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const middleware = assetMiddleware({ dir });
const next = (): Response => new Response("page handler");

async function measure(label: string, fn: () => unknown, n: number): Promise<number> {
  for (let i = 0; i < 5000; i++) await fn();
  const start = Bun.nanoseconds();
  for (let i = 0; i < n; i++) await fn();
  const ns = (Bun.nanoseconds() - start) / n;
  console.log(
    `  ${label.padEnd(30)} ${(ns / 1000).toFixed(4)} us  ${Math.round(1e9 / ns).toLocaleString()}/s`,
  );
  return ns;
}

const N = 100_000;
console.log("\nMISS (an SSR page request):");
const stat = await measure("existsSync + statSync", () => statLookup("/store"), N);
const manifest = await measure(
  "assetMiddleware (manifest)",
  () => middleware(new Request("http://localhost/store"), next),
  N,
);
console.log(
  `  -> ${((stat - manifest) / 1000).toFixed(3)} us saved per request (${(((stat - manifest) / stat) * 100).toFixed(0)}% faster)`,
);
