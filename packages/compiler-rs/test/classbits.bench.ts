/**
 * The class-bitmask measurement, taken BEFORE anything was built on the strength
 * of it. `CODESIGN.md` §0.4 is the cautionary case: three designs asserted a
 * 10-25% win from removing `setProp` dispatch and the measurement returned 0-8%,
 * so a §3.5 optimisation without a number does not ship.
 *
 * §3.5 proposes lowering a conditional class list to an integer:
 *
 *   class={{a: x(), b: y()}}  →  setClassBits(el, (x()?1:0)|(y()?2:0), NAMES, base)
 *
 * with the name list and the static prefix hoisted, and an early return when the
 * bits equal the previous value. What that buys over the channel as it stands is
 * one object allocation and one `classToString` string build per run — the
 * compare against the previous applied value already exists.
 *
 * Three arms, one workload: a row's class recomputed once per frame, with the
 * conditional flipping on some frames and not on others (the realistic mix — a
 * list re-renders far more rows than it changes).
 *
 *   bun test/classbits.bench.ts
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const { setClass, signal, renderEffect, flush } = await import("@barqjs/core");

const ROWS = Number(process.env.BARQ_BENCH_ROWS ?? 200);
const FRAMES = Number(process.env.BARQ_BENCH_FRAMES ?? 400);
const REPEATS = Number(process.env.BARQ_BENCH_REPEATS ?? 7);

/** How often the conditional actually flips. 1 in 8 is the list case. */
const FLIP_EVERY = 8;

const NAMES = ["row", "row--selected", "row--dirty"] as const;

function makeRows(): Element[] {
  const host = document.createElement("div");
  const out: Element[] = [];
  for (let i = 0; i < ROWS; i++) {
    const el = document.createElement("div");
    host.appendChild(el);
    out.push(el);
  }
  return out;
}

/** Arm A — the channel as it stands: an object literal per run, normalised. */
function objectArm(rows: Element[]): void {
  const prev: unknown[] = new Array(rows.length).fill(undefined);
  for (let frame = 0; frame < FRAMES; frame++) {
    const selected = Math.floor(frame / FLIP_EVERY) % 2 === 0;
    const dirty = Math.floor(frame / (FLIP_EVERY * 2)) % 2 === 0;
    for (let i = 0; i < rows.length; i++) {
      prev[i] = setClass(
        rows[i]!,
        "class",
        { row: true, "row--selected": selected, "row--dirty": dirty },
        prev[i],
      );
    }
  }
}

/** Arm B — the same thing as a string the compiler could have built inline. */
function stringArm(rows: Element[]): void {
  const prev: unknown[] = new Array(rows.length).fill(undefined);
  for (let frame = 0; frame < FRAMES; frame++) {
    const selected = Math.floor(frame / FLIP_EVERY) % 2 === 0;
    const dirty = Math.floor(frame / (FLIP_EVERY * 2)) % 2 === 0;
    for (let i = 0; i < rows.length; i++) {
      const value = `row${selected ? " row--selected" : ""}${dirty ? " row--dirty" : ""}`;
      prev[i] = setClass(rows[i]!, "class", value, prev[i]);
    }
  }
}

/**
 * Arm C — §3.5's proposal. The bits are the compute's return, the names are
 * hoisted, and an unchanged mask returns before any string exists.
 */
function setClassBits(
  element: Element,
  bits: number,
  names: readonly string[],
  base: string,
  prev: number,
): number {
  if (bits === prev) return bits;
  let out = base;
  for (let i = 0; i < names.length; i++) {
    if (bits & (1 << i)) out += (out === "" ? "" : " ") + names[i]!;
  }
  (element as Element & { className: string }).className = out;
  return bits;
}

function bitsArm(rows: Element[]): void {
  const prev: number[] = new Array(rows.length).fill(-1);
  for (let frame = 0; frame < FRAMES; frame++) {
    const selected = Math.floor(frame / FLIP_EVERY) % 2 === 0;
    const dirty = Math.floor(frame / (FLIP_EVERY * 2)) % 2 === 0;
    const bits = 1 | (selected ? 2 : 0) | (dirty ? 4 : 0);
    for (let i = 0; i < rows.length; i++) {
      prev[i] = setClassBits(rows[i]!, bits, NAMES, "", prev[i]!);
    }
  }
}

function time(label: string, arm: (rows: Element[]) => void): number {
  const samples: number[] = [];
  for (let r = 0; r < REPEATS; r++) {
    const rows = makeRows();
    arm(rows); // warm
    const start = performance.now();
    arm(rows);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)]!;
  console.log(
    `${label.padEnd(26)} ${median.toFixed(2)} ms   [${samples.map((s) => s.toFixed(1)).join(" ")}]`,
  );
  return median;
}

console.log(`${ROWS} rows x ${FRAMES} frames = ${(ROWS * FRAMES).toLocaleString()} class writes`);
console.log(`the conditional flips 1 frame in ${FLIP_EVERY}\n`);

const object = time("object literal (today)", objectArm);
const string = time("string (today)", stringArm);
const bits = time("bitmask (§3.5)", bitsArm);

console.log(
  `\nbitmask vs object literal: ${(object / bits).toFixed(2)}x` +
    `\nbitmask vs string        : ${(string / bits).toFixed(2)}x`,
);

// ---------------------------------------------------------------------------
// The number that actually decides, because §0.4's lesson is that a channel
// measured on its own is not the thing the compiler changes. Here the class
// write sits inside the emitted shape it really has: a fused record whose
// compute is tracked, driven by a signal write and a scheduler flush, over a
// list of rows.
// ---------------------------------------------------------------------------

interface Frame {
  (): void;
}

function endToEnd(label: string, build: (el: Element, sel: () => boolean) => void): number {
  const samples: number[] = [];
  for (let r = 0; r < REPEATS; r++) {
    const selected = signal(false);
    const rows = makeRows();
    for (const el of rows) build(el, () => selected());
    flush();
    const drive: Frame = () => {
      for (let frame = 0; frame < FRAMES; frame++) {
        selected.set(frame % 2 === 0);
        flush();
      }
    };
    drive();
    const start = performance.now();
    drive();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)]!;
  console.log(
    `${label.padEnd(26)} ${median.toFixed(2)} ms   [${samples.map((s) => s.toFixed(1)).join(" ")}]`,
  );
  return median;
}

console.log(`\n--- end to end: ${ROWS} rows, ${FRAMES} frames, one signal driving every row ---\n`);

const liveObject = endToEnd("emitted today", (el, sel) => {
  renderEffect(
    () => ({ a: { row: true, "row--selected": sel(), "row--dirty": false } }),
    (v: { a: unknown }, p: { a?: unknown } = {}) => {
      v.a = setClass(el, "class", v.a, p.a);
    },
  );
});

const liveBits = endToEnd("emitted with classBits", (el, sel) => {
  renderEffect(
    () => 1 | (sel() ? 2 : 0),
    (v: number, p: number) => {
      if (v !== p) setClassBits(el, v, NAMES, "", p);
    },
  );
});

console.log(`\nend to end, bitmask vs today: ${(liveObject / liveBits).toFixed(2)}x`);
