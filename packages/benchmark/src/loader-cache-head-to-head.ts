/**
 * The loader-cell READ path: a key rebuilt per read against a key memoised per
 * match.
 *
 * The denominator is the point, as it was for the matcher. `routeProps.data` is
 * `() => state.dataFor(route, state.params())()`, read inside a tracked
 * `insert`, so it runs at least once per route depth per render and again on
 * every reactive update that touches it. Against M2's compiled 20-row
 * `renderToString` — 1 199.6 ns — a 150 ns read is a double-digit percentage of
 * a whole page.
 *
 * The comparand is `legacy-loader-cache.ts`, the shape this package shipped
 * before the caching work, preserved verbatim rather than reconstructed.
 *
 * WHAT THIS CANNOT DECIDE. A Bun microbenchmark bounds per-call CPU on a
 * synthetic route. It cannot see how many times a real page reads `props.data()`
 * per render, which is the multiplier that turns ns into a percentage — that
 * needs the Tier-2 lane, and per CODESIGN §0.7 this is Tier 1 and PROVISIONAL
 * until it has one.
 */

import { computed, runWithOwner } from "@barqjs/core";

import { legacyCache, legacyLoaderKey } from "./legacy-loader-cache.ts";
import { SUMMARY_HEADER, summarize, summaryLine } from "./stats.ts";

const WARMUP = 50_000;
const TRIALS = 41;
const ITERATIONS = 20_000;

function time(label: string, fn: () => unknown): void {
  for (let i = 0; i < WARMUP; i++) fn();
  const xs: number[] = [];
  for (let t = 0; t < TRIALS; t++) {
    const start = Bun.nanoseconds();
    for (let i = 0; i < ITERATIONS; i++) fn();
    xs.push((Bun.nanoseconds() - start) / ITERATIONS);
  }
  console.log(summaryLine(label, summarize(xs)));
}

const ROUTE_ID = "/users/$id/posts/$postId";
const PARAMS = { id: "7", postId: "3" };
const SEARCH = new URLSearchParams("page=2&sort=asc&q=ada");

// ---------------------------------------------------------------- comparand
const legacy = legacyCache();
// Warm the entry so both sides measure a HIT rather than a mint.
legacy.dataFor(ROUTE_ID, PARAMS);

// ---------------------------------------------------------------- contender
// What the router does now: the key is built once per match and the read is a
// Map lookup plus a settled cell read. Modelled here rather than imported so the
// benchmark measures the SHAPE and does not drag a whole router, a history and a
// matcher into the loop.
const settledCell = runWithOwner(null, () => computed(() => "value"));
// One read, so the memo is warm exactly as it is after the first render.
settledCell();

interface Memo {
  params: unknown;
  reader: () => unknown;
}
const memo = new Map<string, Memo>();
const entries = new Map<string, () => unknown>();

function memoisedRead(routeId: string, params: typeof PARAMS): unknown {
  const hit = memo.get(routeId);
  if (hit !== undefined && hit.params === params) return hit.reader();
  const key = legacyLoaderKey(routeId, params);
  const reader = entries.get(key) ?? settledCell;
  entries.set(key, reader);
  memo.set(routeId, { params, reader });
  return reader();
}
memoisedRead(ROUTE_ID, PARAMS);

console.log("loader cell read path — key rebuilt per read vs memoised per match");
console.log(`instrument: bun, ${TRIALS} trials x ${ITERATIONS} iterations, warmup ${WARMUP}`);
console.log("denominator: a compiled 20-row renderToString is 1199.6 ns (M2)\n");
console.log(SUMMARY_HEADER);

time("legacy: key + Map.get", () => legacy.dataFor(ROUTE_ID, PARAMS));
time("legacy: key alone", () => legacyLoaderKey(ROUTE_ID, PARAMS));
time("memoised: full read", () => memoisedRead(ROUTE_ID, PARAMS));
time("settled cell read alone", () => settledCell());

// The search now joins the key, so the honest comparison shows what that costs
// the LEGACY shape — which is the shape that would have had to build it.
const withSearch = (): string => {
  const pairs: string[] = [];
  for (const [name, value] of SEARCH) pairs.push(`${name}=${value}`);
  return `${legacyLoaderKey(ROUTE_ID, PARAMS)}|${pairs.toSorted().join("&")}`;
};
time("legacy: key + 3-key search", withSearch);

console.log(
  "\nThe memoised read pays the key ONCE PER MATCH; the legacy one paid it per read.\n" +
    "A hash change or an unrelated re-render costs the difference every time.",
);
