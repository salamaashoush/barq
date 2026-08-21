/**
 * RED: F2/§1.3 compares the current read (159 ns) against a raw
 * `Map.get(preBuiltString)` (2.5 ns) and concludes the memo turns 159 into 2.5.
 * The CONTENDER is not a raw Map.get: §1.3 says "a `computed` per depth whose
 * inputs are the routeId, the params and the deps". So measure that, plus what
 * the B1 fix (searchKey in the key) costs on a URL that actually HAS a search.
 */
import { summarize, summaryLine, SUMMARY_HEADER } from "../../packages/benchmark/src/stats.ts";
import { createRouter, loaderKey } from "../../packages/router/src/router.ts";
import { memoryHistory } from "../../packages/router/src/history.ts";
import { computed, runWithOwner, flush } from "@barqjs/core";

function time(label: string, fn: () => unknown, trials = 41, iterations = 20000): void {
  for (let i = 0; i < 50000; i++) fn();
  const xs: number[] = [];
  for (let t = 0; t < trials; t++) {
    const start = Bun.nanoseconds();
    for (let i = 0; i < iterations; i++) fn();
    xs.push((Bun.nanoseconds() - start) / iterations);
  }
  console.log(summaryLine(label, summarize(xs)));
}

const routes = [{ id: "user", path: "/users/$id/posts/$postId", loader: () => "x" }];
for (const url of ["/users/7/posts/3", "/users/7/posts/3?page=2&sort=desc&ref=abc"]) {
  const state = createRouter({ routes, history: memoryHistory({ initial: [url] }) });
  const route = state.chain()[0]!;
  const params = state.params();
  await new Promise((r) => setTimeout(r, 20));
  try { state.dataFor(route, params)(); } catch { /* warm */ }
  await new Promise((r) => setTimeout(r, 20));
  console.log(`\n--- ${url}`);
  console.log(SUMMARY_HEADER);
  
  time("loaderKey(id,params,deps)", () => loaderKey(route.id, params));
  time("full props.data() read", () => { try { return state.dataFor(route, state.params())(); } catch { return null; } });

  // The real contender: a memoised key per match, read through a settled computed.
  const memo = runWithOwner(null, () => computed(() => loaderKey(route.id, state.params())));
  flush(); memo();
  const map = new Map<string, () => unknown>([[memo(), () => "x"]]);
  time("computed(key)() read", () => memo());
  time("map.get(computed(key)())", () => map.get(memo()));
  const cached = memo();
  time("map.get(preBuiltString)", () => map.get(cached));
  state.dispose();
}
