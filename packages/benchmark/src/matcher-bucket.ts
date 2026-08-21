/**
 * The red team's counter-proposal to a generated matcher, measured.
 *
 * The claim under test: the shipped matcher's 3.3 µs at 200 routes is NOT the
 * regexes — V8 compiles those to native code and one exec is single-digit
 * nanoseconds — it is 200 linear iterations. If so, bucketing candidates by
 * their first static segment recovers most of the win in ~15 lines, keeping
 * `compilePath` and `matchPath` untouched, and the generated switch is left
 * competing for the remainder.
 *
 * Run: bun run src/matcher-bucket.ts
 */

import { type RouteLike, compilePath, matchPath, matchRoutes } from "./legacy-matcher.ts";
import { SUMMARY_HEADER, summarize, summaryLine } from "./stats.ts";

const noop = (): null => null;

function table(n: number): RouteLike[] {
  return Array.from({ length: n }, (_, i) => ({
    path: `/s${i % 37}/u${i}/:a/:b`,
    component: noop as never,
  })) as RouteLike[];
}

/** The whole counter-proposal. Same regexes, same params, one Map. */
function bucketed(routes: RouteLike[]) {
  const buckets = new Map<string, RouteLike[]>();
  for (const route of routes) {
    const head = route.path.split("/")[1] ?? "";
    const list = buckets.get(head) ?? [];
    list.push(route);
    buckets.set(head, list);
  }
  return (pathname: string) => {
    const slash = pathname.indexOf("/", 1);
    const head = slash === -1 ? pathname.slice(1) : pathname.slice(1, slash);
    const candidates = buckets.get(head);
    if (candidates === undefined) return null;
    for (const route of candidates) {
      const params = matchPath(pathname, compilePath(route.path));
      if (params !== null) return { route, params };
    }
    return null;
  };
}

function time(iterations: number, body: () => void): number[] {
  for (let i = 0; i < 20_000; i++) body();
  const out: number[] = [];
  for (let trial = 0; trial < 41; trial++) {
    const start = Bun.nanoseconds();
    for (let i = 0; i < iterations; i++) body();
    out.push((Bun.nanoseconds() - start) / iterations);
  }
  return out;
}

const routes = table(200);
const bucket = bucketed(routes);
const last = "/s14/u199/x/y";
const miss = "/nothing/here/at/all";

// The bucket must answer identically before it is timed.
for (let i = 0; i < 200; i++) {
  const p = `/s${i % 37}/u${i}/x/y`;
  const a = matchRoutes(p, routes);
  const b = bucket(p);
  if (a?.route.path !== b?.route.path || JSON.stringify(a?.params) !== JSON.stringify(b?.params)) {
    throw new Error(`disagreement on ${p}`);
  }
}
if (bucket(miss) !== null) throw new Error("miss matched");

const oneRegex = compilePath("/s14/u199/:a/:b");

console.log("is the linear scan's cost the regexes, or the 200 iterations? (200 routes, ns/op)\n");
console.log(SUMMARY_HEADER);
console.log(summaryLine("one matchPath exec", summarize(time(200_000, () => { matchPath(last, oneRegex); }))));
console.log(summaryLine("linear scan, last-hit", summarize(time(20_000, () => { matchRoutes(last, routes); }))));
console.log(summaryLine("bucketed, last-hit", summarize(time(200_000, () => { bucket(last); }))));
console.log(summaryLine("bucketed, miss", summarize(time(200_000, () => { bucket(miss); }))));
