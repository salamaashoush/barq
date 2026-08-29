import { describe, expect, it } from "bun:test";

import {
  compileFixture,
  compileSource,
  emittedCalls,
  fixtureSource,
  listFixtures,
} from "./harness.ts";
import { concatFixtures, type Measurement, measure, typicalComponentFile } from "./measure.ts";

/**
 * Compile throughput. This runs on every HMR update, so it is a feature.
 *
 * The asserted bound is the stated target, not a padded one: the measurement is
 * a minimum across rounds, which is stable enough to assert against. See
 * measure.ts for why.
 *
 * Recorded so the trend is visible rather than rediscovered — typical component
 * file, same machine: M1 0.0108 ms (identity round-trip), M2 0.0221 ms. The 2x
 * is structural, not incidental: P1 builds an intermediate `Tmp` tree in std
 * heap Vecs before flattening into the Skeleton, and the visitor re-walks the
 * EMITTED expression, which is larger than the input and grows every milestone.
 * M3 restructures `lower_unit` into lower-all -> passes -> emit-all anyway;
 * both drivers go away there.
 */

/** The target from the project brief, asserted per file. */
const CEILING_MS = 1;

/**
 * A budget is only evidence when what is being timed is a real compile: an
 * identity round-trip beats every number here by a wide margin and proves
 * nothing at all. Each block below states what the compiler actually produced
 * for the input it timed, so the two claims stand or fall together.
 */
function assertReallyCompiled(name: string, source: string, code: string): void {
  expect(code, `${name} came back unchanged — nothing was compiled`).not.toBe(source);
  expect(emittedCalls(code, "template"), `${name} reached no template`).toBeGreaterThan(0);
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

describe("compile throughput", () => {
  it("every fixture compiles under the per-file budget", () => {
    const names = listFixtures();
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

    let compiled = 0;
    for (const name of names) {
      const code = compileFixture(name);
      if (code === fixtureSource(name)) throw new Error(`${name} came back unchanged`);
      if (emittedCalls(code, "template") > 0) compiled++;
    }
    expect(
      compiled,
      "the timings above have to be timings of a real compile",
    ).toBeGreaterThanOrEqual(40);

    for (const row of rows) {
      expect(row.msPerCompile, `${row.name} exceeded the per-file budget`).toBeLessThan(CEILING_MS);
    }
  }, 120_000);

  it("a realistic multi-component file stays inside the same budget", () => {
    const source = typicalComponentFile(fixtureSource);
    const measurement = measure("typical-component-file", source);
    console.log(
      `\ntypical component file: ${measurement.bytes} bytes, ${measurement.lines} lines, ` +
        `${measurement.msPerCompile.toFixed(4)} ms/compile`,
    );
    assertReallyCompiled("typical-component-file", source, compileSource(source, "typical.tsx"));
    expect(measurement.msPerCompile).toBeLessThan(CEILING_MS);
  }, 120_000);

  it("a file past the inline-stack threshold still compiles fast", () => {
    // Anything over 8 KiB is parsed on a guard thread instead of the caller's
    // stack. That path costs a thread spawn, so it gets its own number.
    const source = concatFixtures(listFixtures(), fixtureSource);
    const measurement = measure("whole-corpus-one-file", source);
    console.log(
      `\nguard-thread path: ${measurement.bytes} bytes, ` +
        `${measurement.msPerCompile.toFixed(4)} ms/compile`,
    );
    assertReallyCompiled("whole-corpus-one-file", source, compileSource(source, "corpus.tsx"));
    expect(measurement.bytes).toBeGreaterThan(8 * 1024);

    // Bounded by RATE, not by the per-file millisecond budget the other two use.
    // This input is the whole fixture corpus glued together, so its size is a
    // fact about how many fixtures exist: it crossed 60 KiB when the M5 shape
    // catalogue landed, and a flat 1 ms then measured the corpus rather than the
    // compiler. What does not move with the corpus is MB/s.
    //
    // It is also a far tighter gate than the budget it replaces. The per-file
    // budget sits ~48x above where this path actually runs; the floor below sits
    // at about a third of it, so it catches a 2.7x regression where the budget
    // could not see a 40x one.
    const mbPerSecond = measurement.bytes / 1024 / 1024 / (measurement.msPerCompile / 1000);
    console.log(`guard-thread path: ${mbPerSecond.toFixed(1)} MB/s`);
    expect(mbPerSecond).toBeGreaterThan(20);
  }, 120_000);

  /**
   * The regression gate, and the one number in this file that does not move
   * with the machine. A millisecond budget is 37x away from where the compiler
   * actually sits, so it cannot see a 2x regression in the pass stage; a CI
   * runner is also slower and noisier than a laptop, which is why an absolute
   * ceiling near the real figure would flake instead of catching anything.
   *
   * `templates: false` runs the identical pipeline with every element refused,
   * so it pays for the parse, the harvest, the semantic table and the
   * `createElement` codegen and NOTHING that milestone 4 touches. The ratio is
   * therefore exactly the cost of P1 plus the pass stage plus template
   * emission, as a multiple of work that is not ours — and it is scale-free.
   */
  it("the IR pipeline stays a small multiple of parsing the same file", () => {
    const source = typicalComponentFile(fixtureSource);
    const baseline = measure("templates-off", source, { templates: false });
    const compiled = measure("templates-on", source);
    const ratio = compiled.msPerCompile / baseline.msPerCompile;
    console.log(
      `\npass stage: ${baseline.msPerCompile.toFixed(4)} ms parse-only, ` +
        `${compiled.msPerCompile.toFixed(4)} ms compiled, ${ratio.toFixed(2)}x`,
    );

    // Both halves have to be real: a `templates: false` run that stopped
    // refusing, or a compiled run that stopped templating, would make the
    // ratio 1.0 and prove nothing.
    const off = compileSource(source, "typical.tsx", { templates: false });
    const on = compileSource(source, "typical.tsx");
    expect(emittedCalls(off, "template"), "the baseline must emit no template").toBe(0);
    expect(emittedCalls(on, "template"), "the compiled run must emit templates").toBeGreaterThan(0);

    // M4 measured 1.37x on the author's machine. The ceiling leaves room for a
    // slower runner's noise and none for a structural regression.
    expect(ratio).toBeLessThan(1.9);
  }, 120_000);
});
