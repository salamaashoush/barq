/**
 * Paired benchmarking with a reported spread.
 *
 * A single min-of-N ratio is not evidence: it hides run-to-run drift and it
 * cannot distinguish a 1% regression from a 1% breeze. Everything here samples
 * both sides many times, interleaved and with the order flipped every trial so
 * thermal and GC drift lands on both sides equally, and reports the
 * distribution plus a distribution-free test on the PAIRED differences.
 */

export interface Summary {
  n: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  mean: number;
  sd: number;
}

export function summarize(xs: readonly number[]): Summary {
  const s = [...xs].toSorted((a, b) => a - b);
  const n = s.length;
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? s.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return {
    n,
    min: s[0],
    p25: quantile(s, 0.25),
    median: quantile(s, 0.5),
    p75: quantile(s, 0.75),
    max: s[n - 1],
    mean,
    sd: Math.sqrt(variance),
  };
}

function quantile(sorted: readonly number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Wilcoxon signed-rank on the paired differences, normal approximation with a
 * continuity correction and tie-corrected variance. Paired because each trial
 * times both sides back to back under the same machine conditions, which
 * removes the between-trial drift that swamps a 1% effect.
 */
export function wilcoxon(diffs: readonly number[]): { p: number; positive: number; n: number } {
  const nonzero = diffs.filter((d) => d !== 0);
  const n = nonzero.length;
  if (n < 6) return { p: 1, positive: nonzero.filter((d) => d > 0).length, n };

  const byAbs = nonzero.map((d, i) => ({ d, a: Math.abs(d), i })).toSorted((x, y) => x.a - y.a);
  const ranks = new Array<number>(n);
  const tieGroups: number[] = [];
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && byAbs[j + 1].a === byAbs[i].a) j++;
    const rank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[k] = rank;
    if (j > i) tieGroups.push(j - i + 1);
    i = j + 1;
  }

  let wPlus = 0;
  for (let k = 0; k < n; k++) if (byAbs[k].d > 0) wPlus += ranks[k];

  const mean = (n * (n + 1)) / 4;
  const tieTerm = tieGroups.reduce((a, t) => a + (t ** 3 - t), 0) / 48;
  const sd = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24 - tieTerm);
  if (sd === 0) return { p: 1, positive: nonzero.filter((d) => d > 0).length, n };
  const z = (Math.abs(wPlus - mean) - 0.5) / sd;
  return { p: 2 * (1 - normalCdf(z)), positive: nonzero.filter((d) => d > 0).length, n };
}

function normalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26 on erf
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return 0.5 * (1 + (z >= 0 ? y : -y));
}

/** Percentile bootstrap CI for the median of a sample. */
export function bootstrapMedianCi(
  xs: readonly number[],
  iterations = 20000,
  alpha = 0.05,
): [number, number] {
  const n = xs.length;
  const medians = new Float64Array(iterations);
  const buf = new Float64Array(n);
  let seed = 0x9e3779b9;
  const rand = (): number => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) buf[i] = xs[(rand() * n) | 0]!;
    buf.sort();
    medians[it] = n % 2 ? buf[(n - 1) / 2] : (buf[n / 2 - 1] + buf[n / 2]) / 2;
  }
  const sorted = Array.from(medians).toSorted((a, b) => a - b);
  return [
    sorted[Math.floor(iterations * (alpha / 2))],
    sorted[Math.min(iterations - 1, Math.floor(iterations * (1 - alpha / 2)))],
  ];
}

export interface PairedOptions {
  /** Independent trials. Each one times both sides. */
  trials?: number;
  /** Iterations timed inside one trial. */
  iterations?: number;
  /** Iterations run before the first timed trial, per side. */
  warmup?: number;
}

export interface PairedResult {
  a: Summary;
  b: Summary;
  /** Per-trial `a - b`, in nanoseconds per iteration. */
  diffs: number[];
  /** Per-trial `a / b`. */
  ratios: number[];
}

/**
 * Time two implementations of the same work against each other.
 *
 * `setupA`/`setupB` run once and return the measured closure, matching the
 * shape the existing head-to-head files already use.
 */
export function paired(
  setupA: () => () => void,
  setupB: () => () => void,
  options: PairedOptions = {},
): PairedResult {
  const trials = options.trials ?? 41;
  const iterations = options.iterations ?? 200;
  const warmup = options.warmup ?? Math.min(iterations, 500);

  const a = setupA();
  const b = setupB();
  for (let i = 0; i < warmup; i++) a();
  for (let i = 0; i < warmup; i++) b();
  Bun.gc(true);

  const time = (fn: () => void): number => {
    const start = Bun.nanoseconds();
    for (let i = 0; i < iterations; i++) fn();
    return (Bun.nanoseconds() - start) / iterations;
  };

  const as: number[] = [];
  const bs: number[] = [];
  const diffs: number[] = [];
  const ratios: number[] = [];
  for (let t = 0; t < trials; t++) {
    // Flip the order every trial: whichever side runs second inherits the
    // other's cache and allocator state, and a fixed order would hand that
    // asymmetry to the same side every time.
    let ta: number;
    let tb: number;
    if (t % 2 === 0) {
      ta = time(a);
      tb = time(b);
    } else {
      tb = time(b);
      ta = time(a);
    }
    as.push(ta);
    bs.push(tb);
    diffs.push(ta - tb);
    ratios.push(ta / tb);
  }

  return { a: summarize(as), b: summarize(bs), diffs, ratios };
}

export interface MultiCase {
  name: string;
  setup: () => () => void;
}

/**
 * The same interleaving for more than two contenders: every trial times every
 * case, and the starting case rotates so no case always runs cold.
 */
export function multi(
  cases: readonly MultiCase[],
  options: PairedOptions = {},
): Map<string, number[]> {
  const trials = options.trials ?? 41;
  const iterations = options.iterations ?? 200;
  const warmup = options.warmup ?? Math.min(iterations, 500);

  const fns = cases.map((c) => c.setup());
  for (const fn of fns) for (let i = 0; i < warmup; i++) fn();
  Bun.gc(true);

  const out = new Map<string, number[]>(cases.map((c) => [c.name, []]));
  for (let t = 0; t < trials; t++) {
    for (let k = 0; k < cases.length; k++) {
      const idx = (k + t) % cases.length;
      const fn = fns[idx];
      const start = Bun.nanoseconds();
      for (let i = 0; i < iterations; i++) fn();
      out.get(cases[idx].name)!.push((Bun.nanoseconds() - start) / iterations);
    }
  }
  return out;
}

export function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

export function summaryLine(label: string, s: Summary, scale = 1, digits = 1): string {
  const f = (v: number): string => (v / scale).toFixed(digits).padStart(10);
  return `${label.padEnd(26)}${f(s.min)}${f(s.p25)}${f(s.median)}${f(s.p75)}${f(s.max)}${f(s.sd)}`;
}

export const SUMMARY_HEADER = `${"".padEnd(26)}${"min".padStart(10)}${"p25".padStart(10)}${"median".padStart(10)}${"p75".padStart(10)}${"max".padStart(10)}${"sd".padStart(10)}`;
