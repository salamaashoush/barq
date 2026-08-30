/**
 * Runs `head-to-head-var.ts`, min-of-9 per side, in N independent processes per
 * build, and reports the spread a single process never had.
 *
 *   bun run src/eleven-h2h.ts --procs 9 --build on=@barqjs/core --build off=/path/to/index.ts
 */
import { summarize, wilcoxon } from "./stats.ts";

const args = process.argv.slice(2);
const procs = Number(args.includes("--procs") ? args[args.indexOf("--procs") + 1] : 9);
const builds: { label: string; path: string }[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--build") {
    const [label, ...rest] = args[i + 1].split("=");
    builds.push({ label, path: rest.join("=") });
  }
}
if (builds.length === 0) builds.push({ label: "on", path: "@barqjs/core" });

const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : "";

interface Row {
  name: string;
  barq: number;
  solid: number;
}

function runOnce(path: string): Row[] {
  const proc = Bun.spawnSync({
    cmd: ["bun", "run", `${import.meta.dir}/head-to-head-var.ts`],
    env: { ...process.env, BARQ_A: path },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    console.error(proc.stderr.toString());
    process.exit(1);
  }
  const rows: Row[] = [];
  for (const line of proc.stdout.toString().split("\n")) {
    const m = /^(.+?)\s{2,}(\d+)\s+(\d+)\s+\d/.exec(line);
    if (m === null) continue;
    rows.push({ name: m[1].trim(), barq: Number(m[2]), solid: Number(m[3]) });
  }
  return rows;
}

const collected = new Map<string, Row[][]>();
for (const b of builds) {
  const runs: Row[][] = [];
  for (let p = 0; p < procs; p++) {
    runs.push(runOnce(b.path));
    process.stderr.write(`  ${b.label} ${p + 1}/${procs}\n`);
  }
  collected.set(b.label, runs);
}

const names = collected.get(builds[0].label)![0].map((r) => r.name);
const report: Record<string, unknown>[] = [];

for (const b of builds) {
  const runs = collected.get(b.label)!;
  console.log(`\n### ${b.label} — ${b.path}`);
  console.log(
    `${procs} processes; each is head-to-head-var.ts unchanged: 3000-iteration warmup per side, ` +
      `min-of-9 rounds of n iterations, barq and solid alternating inside every round.`,
  );
  console.log(
    `${"case".padEnd(46)}${"barq ns".padStart(10)}${"solid ns".padStart(10)}${"ratio".padStart(9)}` +
      `${"lo".padStart(8)}${"hi".padStart(8)}${"barq sd%".padStart(10)}${"wilcox p".padStart(10)}`,
  );
  console.log("-".repeat(101));
  names.forEach((name, i) => {
    const bs = runs.map((r) => r[i].barq);
    const ss = runs.map((r) => r[i].solid);
    const ratios = bs.map((v, k) => ss[k] / v);
    const sb = summarize(bs);
    const sr = summarize(ratios);
    const w = wilcoxon(bs.map((v, k) => v - ss[k]));
    console.log(
      name.padEnd(46) +
        sb.min.toFixed(0).padStart(10) +
        summarize(ss).min.toFixed(0).padStart(10) +
        `${sr.median.toFixed(2)}x`.padStart(9) +
        sr.min.toFixed(2).padStart(8) +
        sr.max.toFixed(2).padStart(8) +
        ((100 * sb.sd) / sb.mean).toFixed(1).padStart(10) +
        w.p.toExponential(1).padStart(10),
    );
    report.push({
      build: b.label,
      name,
      barq: sb,
      solid: summarize(ss),
      ratio: sr,
      p: w.p,
      barqRuns: bs,
      solidRuns: ss,
    });
  });
}

if (builds.length > 1) {
  const [first, ...others] = builds;
  const base = collected.get(first.label)!;
  for (const b of others) {
    const runs = collected.get(b.label)!;
    console.log(`\n### ${first.label} vs ${b.label} — barq side only, per case`);
    console.log(
      `${"case".padEnd(46)}${`${first.label} ns`.padStart(10)}${`${b.label} ns`.padStart(10)}` +
        `${"speedup".padStart(10)}${"lo".padStart(8)}${"hi".padStart(8)}${"mannwhit p".padStart(12)}`,
    );
    console.log("-".repeat(104));
    names.forEach((name, i) => {
      const xs = base.map((r) => r[i].barq);
      const ys = runs.map((r) => r[i].barq);
      const sx = summarize(xs);
      const sy = summarize(ys);
      console.log(
        name.padEnd(46) +
          sx.min.toFixed(0).padStart(10) +
          sy.min.toFixed(0).padStart(10) +
          `${(sy.median / sx.median).toFixed(3)}x`.padStart(10) +
          (sy.min / sx.min).toFixed(3).padStart(8) +
          (sy.max / sx.max).toFixed(3).padStart(8) +
          mannWhitney(xs, ys).toExponential(1).padStart(12),
      );
    });
  }
}

/** Two-sided Mann-Whitney U, normal approximation; the samples are unpaired. */
function mannWhitney(xs: readonly number[], ys: readonly number[]): number {
  const all = [...xs.map((v) => ({ v, x: true })), ...ys.map((v) => ({ v, x: false }))].toSorted(
    (a, b) => a.v - b.v,
  );
  const ranks = new Array<number>(all.length);
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const r = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[k] = r;
    i = j + 1;
  }
  let rx = 0;
  all.forEach((e, k) => {
    if (e.x) rx += ranks[k];
  });
  const n1 = xs.length;
  const n2 = ys.length;
  const u = rx - (n1 * (n1 + 1)) / 2;
  const mean = (n1 * n2) / 2;
  const sd = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = (Math.abs(u - mean) - 0.5) / sd;
  const t = 1 / (1 + (0.3275911 * z) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return 2 * (1 - 0.5 * (1 + y));
}

if (jsonOut !== "") await Bun.write(jsonOut, JSON.stringify(report, null, 2));
