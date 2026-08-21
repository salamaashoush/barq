/**
 * P6-M0: what does one `props.data()` read cost today, and what is its
 * denominator?
 *
 * `routeProps.data` is `() => state.dataFor(route, state.params())()`, read
 * inside a tracked `insert`. `props([{...}])` returns the record UNCHANGED for
 * a single plain source (`props.ts:168-174`), so nothing memoises it: every
 * read rebuilds the key — `Object.keys().toSorted()`, a `.map`, a `.join` and
 * a template — before the Map lookup.
 */
import { summarize, summaryLine, SUMMARY_HEADER } from "../../packages/benchmark/src/stats.ts";
import { createRouter, loaderKey } from "../../packages/router/src/router.ts";
import { memoryHistory } from "../../packages/router/src/history.ts";

const routes = [
  { id: "user", path: "/users/$id/posts/$postId", loader: () => "x" },
];
const state = createRouter({ routes, history: memoryHistory({ initial: ["/users/7/posts/3"] }) });
const route = state.chain()[0]!;
const params = state.params();

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

console.log("read path, ns/op — bun, 41 trials x 20 000 iterations, warmup 50 000\n");
console.log(SUMMARY_HEADER);
time("loaderKey(id, params)", () => loaderKey(route.id, params));
time("dataFor(route, params)", () => state.dataFor(route, params));
time("state.params()", () => state.params());
// a settled read, so the cost is the cell read and not the throw
await new Promise((r) => setTimeout(r, 20));
try { state.dataFor(route, params)(); } catch { /* warm it */ }
await new Promise((r) => setTimeout(r, 20));
time("full props.data() read", () => { try { return state.dataFor(route, state.params())(); } catch { return null; } });
// A memoised key is the contender's read path: one Map lookup on a cached string.
const cached = loaderKey(route.id, params);
const map = new Map<string, unknown>([[cached, () => "x"]]);
time("Map.get(memoised key)", () => map.get(cached));
