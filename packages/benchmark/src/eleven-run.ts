/**
 * One process of the eleven-case measurement. Prints one JSON line.
 *
 * BARQ_A  module path for the A side (a build of @barqjs/core)
 * BARQ_B  module path for the B side, or "solid"
 * TRIALS  independent trials per case; each one times both sides
 */
import { barqCases, solidCases, type BarqApi, type Case } from "./eleven-cases.ts";
import { paired } from "./stats.ts";

const pathA = process.env.BARQ_A ?? "@barqjs/core";
const pathB = process.env.BARQ_B ?? "solid";
const trials = Number(process.env.TRIALS ?? 41);

async function load(path: string): Promise<Case[]> {
  if (path === "solid") return solidCases();
  const mod = (await import(path)) as unknown as BarqApi;
  return barqCases(mod);
}

const a = await load(pathA);
const b = await load(pathB);

const out = a.map((ca, i) => {
  const cb = b[i];
  const r = paired(ca.make, cb.make, {
    trials,
    iterations: ca.iters,
    warmup: Math.min(ca.iters, 3000),
  });
  return { name: ca.name, iters: ca.iters, a: r.a, b: r.b, diffs: r.diffs, ratios: r.ratios };
});

console.log(JSON.stringify({ pid: process.pid, a: pathA, b: pathB, trials, cases: out }));
