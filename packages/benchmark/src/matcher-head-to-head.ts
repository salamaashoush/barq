/**
 * The route matcher: a regex-per-route linear scan against a generated switch.
 *
 * Comparand is `@barqjs/extra`'s shipped matcher — `compilePath` builds a RegExp
 * per route into a `Map` and `matchRoutes` scans linearly. The contender is a
 * prototype of what a generator would emit: a switch on segment COUNT, then a
 * switch on each literal segment, with params popped positionally.
 *
 * The DENOMINATOR is the point. On a client navigation the matcher runs once and
 * is followed by a network fetch, so a microsecond there is noise. The only
 * place the number can matter is the server, once per request, competing against
 * `renderToString` rather than against a fetch — so the ratio to a page render is
 * what decides whether a generated matcher is worth a generator at all.
 */

import { type RouteLike, matchRoutes } from "./legacy-matcher.ts";

import { SUMMARY_HEADER, paired, summaryLine, wilcoxon } from "./stats.ts";

const noop = (): null => null;

interface Table {
  routes: RouteLike[];
  specs: string[][];
  match: (pathname: string) => { id: number; params: Record<string, string> } | null;
}

/** Flat, every route two params deep, first segments deliberately colliding. */
function build(n: number): Table {
  const routes: RouteLike[] = [];
  const specs: string[][] = [];
  for (let i = 0; i < n; i++) {
    const segs = [`s${i % 37}`, `u${i}`, ":a", ":b"];
    specs.push(segs);
    routes.push({ path: `/${segs.join("/")}`, component: noop as never });
  }
  return { routes, specs, match: compile(specs) };
}

/**
 * What the generator would emit, written by hand so the benchmark measures the
 * SHAPE rather than a generator that does not exist yet.
 *
 * Segment count first, because it partitions the table for free and every miss
 * of the wrong length costs one integer compare. Then one `switch` per literal
 * position, which V8 lowers to a hash lookup rather than a chain of compares.
 */
function compile(specs: string[][]): Table["match"] {
  const byCount = new Map<number, number[]>();
  specs.forEach((segs, id) => {
    const list = byCount.get(segs.length) ?? [];
    list.push(id);
    byCount.set(segs.length, list);
  });

  const lines: string[] = [
    "let from = 1, count = 0, i = 0;",
    "const n = p.length;",
    "if (n < 2 || p.charCodeAt(0) !== 47) return null;",
    "const seg = [];",
    "for (i = 1; i <= n; i++) { if (i === n || p.charCodeAt(i) === 47) { seg.push(p.slice(from, i)); from = i + 1; count++; } }",
    "switch (count) {",
  ];

  const emit = (len: number, pos: number, candidates: number[], depth: number): void => {
    const pad = "  ".repeat(depth);
    if (pos >= len) {
      const id = candidates[0];
      if (id === undefined) return;
      const params = specs[id]
        .map((s, k) => (s.startsWith(":") ? `${JSON.stringify(s.slice(1))}: seg[${k}]` : null))
        .filter((x): x is string => x !== null)
        .join(", ");
      lines.push(`${pad}return { id: ${id}, params: { ${params} } };`);
      return;
    }
    const literals = new Map<string, number[]>();
    const wild: number[] = [];
    for (const id of candidates) {
      const s = specs[id][pos];
      if (s.startsWith(":")) wild.push(id);
      else literals.set(s, [...(literals.get(s) ?? []), id]);
    }
    if (literals.size === 0) {
      emit(len, pos + 1, wild, depth);
      return;
    }
    lines.push(`${pad}switch (seg[${pos}]) {`);
    for (const [lit, ids] of literals) {
      lines.push(`${pad}case ${JSON.stringify(lit)}: {`);
      emit(len, pos + 1, [...ids, ...wild], depth + 1);
      lines.push(`${pad}}`);
    }
    lines.push(`${pad}}`);
    if (wild.length > 0) emit(len, pos + 1, wild, depth);
  };

  for (const [len, ids] of byCount) {
    lines.push(`case ${len}: {`);
    emit(len, 0, ids, 1);
    lines.push("break; }");
  }
  lines.push("}", "return null;");
  // eslint-disable-next-line no-new-func
  return new Function("p", lines.join("\n")) as Table["match"];
}

const SIZES = [25, 200, 1000];

console.log("route matcher — @barqjs/extra matchRoutes vs a generated switch");
console.log("instrument: bun, stats.paired, 41 trials x 2000 iterations, Wilcoxon on paired diffs\n");
console.log(SUMMARY_HEADER);

for (const n of SIZES) {
  const t = build(n);
  const first = `/${t.specs[0].slice(0, 2).join("/")}/x/y`;
  const last = `/${t.specs[n - 1].slice(0, 2).join("/")}/x/y`;
  const miss = "/nothing/here/at/all";

  // Sanity: the two must agree on EVERY path in the table plus a miss, on the
  // route they pick and on the params they extract, before either is timed. A
  // faster matcher that answers differently is not a faster matcher.
  for (let i = 0; i < n; i++) {
    const path = `/${t.specs[i].slice(0, 2).join("/")}/x/y`;
    const a = matchRoutes(path, t.routes);
    const b = t.match(path);
    if (a === null || b === null) throw new Error(`no match for ${path}`);
    if (a.route.path !== `/${t.specs[b.id].join("/")}`) {
      throw new Error(`route disagreement on ${path}: scan=${a.route.path} switch=${b.id}`);
    }
    if (JSON.stringify(a.params) !== JSON.stringify(b.params)) {
      throw new Error(`param disagreement on ${path}: ${JSON.stringify(a.params)} vs ${JSON.stringify(b.params)}`);
    }
  }
  if (matchRoutes(miss, t.routes) !== null || t.match(miss) !== null) {
    throw new Error("a miss matched something");
  }

  for (const [label, path] of [
    ["first-hit", first],
    ["last-hit", last],
    ["miss", miss],
  ] as const) {
    const r = paired(
      () => () => {
        matchRoutes(path, t.routes);
      },
      () => () => {
        t.match(path);
      },
      { trials: 41, iterations: 2000, warmup: 20000 },
    );
    const w = wilcoxon(r.diffs);
    console.log(summaryLine(`${n}r ${label} scan`, r.a));
    console.log(summaryLine(`${n}r ${label} switch`, r.b));
    console.log(`   ratio ${(r.a.median / r.b.median).toFixed(2)}x   p=${w.p.toExponential(1)}  n=${w.n}\n`);
  }
}
