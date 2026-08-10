/**
 * Drives `eleven-run.ts` across N independent processes and aggregates.
 *
 * A single process cannot distinguish a real effect from one JIT tier-up
 * decision, which is why §9 asks for a Wilcoxon across ≥5 processes. Pairing
 * stays inside a process — every trial times both sides back to back — and the
 * paired differences are pooled across processes for the test.
 */
import { summarize, wilcoxon, type Summary } from "./stats.ts";

interface RunCase {
  name: string;
  iters: number;
  a: Summary;
  b: Summary;
  diffs: number[];
  ratios: number[];
}
interface Run {
  pid: number;
  cases: RunCase[];
}

const args = process.argv.slice(2);
const arg = (flag: string, fallback: string): string => {
  const i = args.indexOf(flag);
  return i === -1 ? fallback : args[i + 1];
};

const pathA = arg("--a", "@barqjs/core");
const pathB = arg("--b", "solid");
const procs = Number(arg("--procs", "7"));
const trials = Number(arg("--trials", "41"));
const label = arg("--label", `${pathA} vs ${pathB}`);
const invert = args.includes("--invert");
const jsonOut = arg("--json", "");

const runs: Run[] = [];
for (let p = 0; p < procs; p++) {
  const proc = Bun.spawnSync({
    cmd: ["bun", "run", `${import.meta.dir}/eleven-run.ts`],
    env: { ...process.env, BARQ_A: pathA, BARQ_B: pathB, TRIALS: String(trials) },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    console.error(proc.stderr.toString());
    process.exit(1);
  }
  const line = proc.stdout.toString().trim().split("\n").at(-1) as string;
  runs.push(JSON.parse(line) as Run);
  process.stderr.write(`  process ${p + 1}/${procs} done\n`);
}

const names = runs[0].cases.map((c) => c.name);
const rows = names.map((name, i) => {
  const per = runs.map((r) => r.cases[i]);
  const aAll = per.flatMap((c) => Array.from({ length: c.a.n }, (_, k) => k)).length; // trials count
  void aAll;
  const diffs = per.flatMap((c) => c.diffs);
  const ratios = per.flatMap((c) => c.ratios);
  // per-process headline: the min-of-trials on each side, the metric
  // head-to-head.ts reported, so the old numbers are comparable.
  const aMins = per.map((c) => c.a.min);
  const bMins = per.map((c) => c.b.min);
  const procRatios = per.map((c, k) => (invert ? bMins[k] / aMins[k] : aMins[k] / bMins[k]));
  const w = wilcoxon(diffs);
  const shown = invert ? ratios.map((r) => 1 / r) : ratios;
  return {
    name,
    iters: per[0].iters,
    aMin: Math.min(...aMins),
    bMin: Math.min(...bMins),
    aMedian: summarize(per.flatMap((c) => [c.a.median])).median,
    bMedian: summarize(per.flatMap((c) => [c.b.median])).median,
    ratio: summarize(shown),
    procRatios: summarize(procRatios),
    p: w.p,
    nPairs: w.n,
  };
});

console.log(`\n### ${label}`);
console.log(
  `${procs} processes x ${trials} paired trials; per-case iterations in the "iters" column; ` +
    `warmup min(iters,3000) per side; sides interleaved and order-flipped every trial.`,
);
/**
 * The headline, computed rather than narrated.
 *
 * The ratio is A/B and both sides are TIMES, so below 1.00 is A faster. A row
 * counts for A only when the Wilcoxon rejects at 0.05 AND the interquartile band
 * of the per-trial ratios sits entirely on one side of parity: a point estimate
 * of 0.97x whose p25–p75 spans 0.85–1.09 is a TIE however small its p, and
 * reporting one as a win is exactly what `CODESIGN.md` §0 withdrew three
 * designs' claims for.
 */
function verdict(r: (typeof rows)[number]): "A" | "tie" | "B" {
  if (r.p >= 0.05) return "tie";
  if (r.ratio.p25 < 1 && r.ratio.p75 < 1) return "A";
  if (r.ratio.p25 > 1 && r.ratio.p75 > 1) return "B";
  return "tie";
}

console.log(
  `${"case".padEnd(46)}${"iters".padStart(7)}${"A min".padStart(10)}${"B min".padStart(10)}` +
    `${"ratio".padStart(8)}${"p25".padStart(8)}${"p75".padStart(8)}${"proc lo".padStart(9)}${"proc hi".padStart(9)}${"wilcoxon p".padStart(12)}${"verdict".padStart(9)}`,
);
console.log("-".repeat(136));
for (const r of rows) {
  console.log(
    r.name.padEnd(46) +
      String(r.iters).padStart(7) +
      r.aMin.toFixed(1).padStart(10) +
      r.bMin.toFixed(1).padStart(10) +
      `${r.ratio.median.toFixed(2)}x`.padStart(8) +
      r.ratio.p25.toFixed(2).padStart(8) +
      r.ratio.p75.toFixed(2).padStart(8) +
      r.procRatios.min.toFixed(2).padStart(9) +
      r.procRatios.max.toFixed(2).padStart(9) +
      r.p.toExponential(1).padStart(12) +
      verdict(r).padStart(9),
  );
}

const tally = { A: 0, tie: 0, B: 0 };
for (const r of rows) tally[verdict(r)]++;
console.log(
  `\n${pathA}: ${tally.A} win(s) / ${tally.tie} tie(s) / ${tally.B} loss(es) of ${rows.length}. ` +
    "A tie is a tie; quote this line, not the row count.",
);

if (jsonOut !== "") {
  await Bun.write(jsonOut, JSON.stringify({ label, pathA, pathB, procs, trials, rows }, null, 2));
}
