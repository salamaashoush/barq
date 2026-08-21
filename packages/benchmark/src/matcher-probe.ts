/**
 * The isolation probe behind one row of `matcher-head-to-head.ts`.
 *
 * At 1000 routes the generated matcher's FIRST-hit median reads 136 ns in the
 * paired run against the scan's 46 — the one case the contender loses. Raising
 * `stats.paired`'s warmup from 500 to 20 000 does not move it, so "not warmed
 * up" is not the explanation.
 *
 * Run alone, with nothing else in the process, the same function answers the
 * same path in 85 ns. The perturbation is the PAIRING: interleaving exists so
 * thermal and GC drift land on both sides equally, and that is not the same as
 * protecting one side's JIT state from the other's when the two differ in code
 * size by three orders of magnitude.
 *
 * It also prints the generated source size, which is the number that actually
 * decided the client/server split in the design: ~64 bytes of JavaScript per
 * route, so 64 kB at 1000 routes — not payable in a browser bundle.
 *
 * Run: bun run src/matcher-probe.ts
 */

const specsOf = (n: number): string[][] =>
  Array.from({ length: n }, (_, i) => [`s${i % 37}`, `u${i}`, ":a", ":b"]);

function generate(specs: string[][]): string {
  const byCount = new Map<number, number[]>();
  specs.forEach((s, id) => byCount.set(s.length, [...(byCount.get(s.length) ?? []), id]));

  const lines: string[] = [
    "let from = 1, count = 0, i = 0;",
    "const n = p.length;",
    "if (n < 2 || p.charCodeAt(0) !== 47) return null;",
    "const seg = [];",
    "for (i = 1; i <= n; i++) { if (i === n || p.charCodeAt(i) === 47) { seg.push(p.slice(from, i)); from = i + 1; count++; } }",
    "switch (count) {",
  ];

  const emit = (len: number, pos: number, candidates: number[]): void => {
    if (pos >= len) {
      const id = candidates[0];
      if (id === undefined) return;
      const params = specs[id]
        .map((s, k) => (s.startsWith(":") ? `${JSON.stringify(s.slice(1))}: seg[${k}]` : null))
        .filter((x): x is string => x !== null)
        .join(", ");
      lines.push(`return { id: ${id}, params: { ${params} } };`);
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
      emit(len, pos + 1, wild);
      return;
    }
    lines.push(`switch (seg[${pos}]) {`);
    for (const [lit, ids] of literals) {
      lines.push(`case ${JSON.stringify(lit)}: {`);
      emit(len, pos + 1, [...ids, ...wild]);
      lines.push("}");
    }
    lines.push("}");
    if (wild.length > 0) emit(len, pos + 1, wild);
  };

  for (const [len, ids] of byCount) {
    lines.push(`case ${len}: {`);
    emit(len, 0, ids);
    lines.push("break; }");
  }
  lines.push("}", "return null;");
  return lines.join("\n");
}

for (const n of [200, 1000]) {
  const specs = specsOf(n);
  const code = generate(specs);
  // eslint-disable-next-line no-new-func
  const fn = new Function("p", code) as (p: string) => unknown;
  console.log(`n=${n}: generated source ${code.length} bytes (${(code.length / n).toFixed(1)} per route)`);

  const first = `/${specs[0].slice(0, 2).join("/")}/x/y`;
  const last = `/${specs[n - 1].slice(0, 2).join("/")}/x/y`;
  for (const [label, path] of [
    ["first", first],
    ["last", last],
  ] as const) {
    for (let w = 0; w < 20_000; w++) fn(path);
    const start = Bun.nanoseconds();
    for (let i = 0; i < 200_000; i++) fn(path);
    const ns = (Bun.nanoseconds() - start) / 200_000;
    console.log(`  ${label.padEnd(6)} ${path.padEnd(16)} ${ns.toFixed(1)} ns  -> ${JSON.stringify(fn(path))}`);
  }
}
