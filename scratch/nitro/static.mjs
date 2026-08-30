/**
 * The comparison that decides it: nitro's static miss against the one barq
 * actually has today (`kitchen-sink/preview.mjs`), which stats the filesystem
 * per request. MICROseconds.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { decodePath, joinURL, withLeadingSlash, withoutTrailingSlash } from "ufo";

const root = new URL("./dist/client/", import.meta.url).pathname;

// preview.mjs:29-38, verbatim in shape.
function previewStatic(pathname) {
  for (const candidate of [join(root, pathname), join(root, pathname, "index.html")]) {
    if (!existsSync(candidate) || !statSync(candidate).isFile()) continue;
    return candidate;
  }
  return null;
}

const ASSETS = Object.fromEntries(
  Array.from({ length: 21 }, (_, i) => [`/assets/chunk-${i}.js`, { type: "text/javascript" }]),
);
const EncodingMap = { gzip: ".gz", br: ".br", zstd: ".zst" };
function nitroStatic(pathname, encodingHeader) {
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

function measure(label, fn, n) {
  for (let i = 0; i < 20000; i++) fn();
  const t0 = Bun.nanoseconds();
  for (let i = 0; i < n; i++) fn();
  const ns = (Bun.nanoseconds() - t0) / n;
  console.log(`${label.padEnd(34)} ${(ns / 1000).toFixed(4)} us  ${Math.round(1e9 / ns).toLocaleString()}/s`);
  return ns;
}

const N = 200_000;
const enc = "gzip, deflate, br, zstd";
console.log("MISS (an SSR page request, the common case):");
measure("preview.mjs (existsSync+statSync)", () => previewStatic("/some/page"), N);
measure("nitro (build-time asset map)", () => nitroStatic("/some/page", enc), N);
console.log("\nHIT (a hashed asset request):");
measure("preview.mjs (existsSync+statSync)", () => previewStatic("/assets/chunk-7.js"), N);
measure("nitro (build-time asset map)", () => nitroStatic("/assets/chunk-7.js", enc), N);
