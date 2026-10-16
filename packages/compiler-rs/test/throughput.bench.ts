/**
 * Compile throughput. This runs on every HMR update, so it is a feature.
 *
 * A benchmark and not a test: every number here is a reading of the clock, and
 * a loaded machine moves it without the compiler changing. What the suite holds
 * instead is the count `tests/compile_work.rs` takes of the same workloads,
 * which no machine can move. Run this against a release build:
 *
 *   bun test/throughput.bench.ts
 *
 * It exits non-zero when a budget below is broken. The bounds are the stated
 * targets, not padded ones: each measurement is a minimum across rounds, which
 * is stable enough to hold against. See measure.ts for why.
 */

import {
  compileFixture,
  compileSource,
  emittedCalls,
  fixtureSource,
  listFixtures,
} from "./harness.ts";
import { concatFixtures, type Measurement, measure, typicalComponentFile } from "./measure.ts";

/** The target from the project brief, held per file. */
const CEILING_MS = 1;

const broken: string[] = [];

function hold(ok: boolean, what: string): void {
  if (!ok) broken.push(what);
}

/**
 * A budget is only evidence when what is being timed is a real compile: an
 * identity round-trip beats every number here by a wide margin and proves
 * nothing at all.
 */
function reallyCompiled(name: string, source: string, code: string): void {
  if (code === source) throw new Error(`${name} came back unchanged, nothing was compiled`);
  if (emittedCalls(code, "template") === 0) throw new Error(`${name} reached no template`);
}

function table(rows: Measurement[]): string {
  const head = ["fixture", "bytes", "lines", "ms/compile", "MB/s"];
  const body = rows.map((r) => [
    r.name,
    String(r.bytes),
    String(r.lines),
    r.msPerCompile.toFixed(4),
    (r.bytes / 1e6 / (r.msPerCompile / 1000)).toFixed(1),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((row) => row[i].length)));
  const line = (cells: string[]) =>
    cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("  ");
  return [line(head), widths.map((w) => "-".repeat(w)).join("  "), ...body.map(line)].join("\n");
}

{
  const names = listFixtures();
  let compiled = 0;
  for (const name of names) {
    const code = compileFixture(name);
    if (code === fixtureSource(name)) throw new Error(`${name} came back unchanged`);
    if (emittedCalls(code, "template") > 0) compiled++;
  }
  if (compiled < 40) throw new Error(`only ${compiled} fixtures reached a template`);

  const rows = names.map((name) => measure(name, fixtureSource(name)));
  rows.sort((a, b) => b.msPerCompile - a.msPerCompile);
  const totalBytes = rows.reduce((n, r) => n + r.bytes, 0);
  const totalMs = rows.reduce((n, r) => n + r.msPerCompile, 0);
  const slowest = rows[0];
  const median = [...rows].sort((a, b) => a.msPerCompile - b.msPerCompile)[
    Math.floor(rows.length / 2)
  ];

  console.log(`\n${table(rows)}\n`);
  console.log(
    [
      `fixtures        : ${rows.length}`,
      `corpus          : ${totalBytes} bytes`,
      `total           : ${totalMs.toFixed(3)} ms`,
      `median          : ${median.msPerCompile.toFixed(4)} ms/compile  (${median.name})`,
      `slowest         : ${slowest.msPerCompile.toFixed(4)} ms/compile  (${slowest.name})`,
      `throughput      : ${(totalBytes / 1e6 / (totalMs / 1000)).toFixed(1)} MB/s`,
      `budget          : ${CEILING_MS} ms/compile`,
    ].join("\n"),
  );
  for (const row of rows) {
    hold(row.msPerCompile < CEILING_MS, `${row.name} exceeded the per-file budget`);
  }
}

{
  const source = typicalComponentFile(fixtureSource);
  reallyCompiled("typical-component-file", source, compileSource(source, "typical.tsx"));
  const measurement = measure("typical-component-file", source);
  console.log(
    `\ntypical component file: ${measurement.bytes} bytes, ${measurement.lines} lines, ` +
      `${measurement.msPerCompile.toFixed(4)} ms/compile`,
  );
  hold(measurement.msPerCompile < CEILING_MS, "the typical component file exceeded the budget");
}

{
  // Anything over 8 KiB is parsed on a guard thread instead of the caller's
  // stack. That path costs a thread spawn, so it gets its own number.
  const source = concatFixtures(listFixtures(), fixtureSource);
  reallyCompiled("whole-corpus-one-file", source, compileSource(source, "corpus.tsx"));
  const measurement = measure("whole-corpus-one-file", source);
  if (measurement.bytes <= 8 * 1024) throw new Error("the corpus file is under the guard limit");

  // Bounded by RATE, not by the per-file millisecond budget: this input is the
  // whole fixture corpus glued together, so its size is a fact about how many
  // fixtures exist. What does not move with the corpus is MB/s.
  const mbPerSecond = measurement.bytes / 1024 / 1024 / (measurement.msPerCompile / 1000);
  console.log(
    `\nguard-thread path: ${measurement.bytes} bytes, ` +
      `${measurement.msPerCompile.toFixed(4)} ms/compile, ${mbPerSecond.toFixed(1)} MB/s`,
  );
  hold(mbPerSecond > 20, "the guard-thread path fell under 20 MB/s");
}

{
  // `templates: false` runs the identical pipeline with every element refused,
  // so the ratio is the cost of the IR pipeline as a multiple of work that is
  // not ours. Measured at 1.37x on the author's machine.
  const source = typicalComponentFile(fixtureSource);
  const off = compileSource(source, "typical.tsx", { templates: false });
  const on = compileSource(source, "typical.tsx");
  if (emittedCalls(off, "template") !== 0) throw new Error("the baseline must emit no template");
  if (emittedCalls(on, "template") === 0) throw new Error("the compiled run must emit templates");
  const baseline = measure("templates-off", source, { templates: false });
  const compiled = measure("templates-on", source);
  const ratio = compiled.msPerCompile / baseline.msPerCompile;
  console.log(
    `\npass stage: ${baseline.msPerCompile.toFixed(4)} ms parse-only, ` +
      `${compiled.msPerCompile.toFixed(4)} ms compiled, ${ratio.toFixed(2)}x`,
  );
  hold(ratio < 1.9, `the IR pipeline costs ${ratio.toFixed(2)}x parsing the same file`);
}

if (broken.length > 0) {
  console.error(`\n${broken.length} budget(s) broken:\n  ${broken.join("\n  ")}`);
  process.exit(1);
}
