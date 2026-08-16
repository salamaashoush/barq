import * as CUR from "../../core/src/signals.ts";
import * as NOGEN from "../.bench-baseline/signals-nogen.ts";
import * as NOHEAP from "../.bench-baseline/signals-noheap.ts";
import * as ORIG from "../.bench-baseline/signals-baseline.ts";
type M = typeof CUR;
const order = (process.argv[2] ?? "abcd").split("");
const all: Record<string, [string, M]> = {
  a: ["original", ORIG as unknown as M],
  b: ["current", CUR],
  c: ["current -gen", NOGEN as unknown as M],
  d: ["current -heap", NOHEAP as unknown as M],
};
const mods: [string, M][] = order.map((k) => all[k]);
const make = (m: M) => () => {
  m.scope((dispose) => {
    const s = m.signal(0);
    m.effect(() => {
      s();
    });
    m.flush();
    dispose();
  }, true);
};
const fns = mods.map(([n, m]) => [n, make(m)] as const);
for (const [, f] of fns) for (let i = 0; i < 5000; i++) f();
Bun.gc(true);
const best = new Map<string, number>();
for (let r = 0; r < 9; r++) {
  for (const [n, f] of fns) {
    const t = Bun.nanoseconds();
    for (let i = 0; i < 20000; i++) f();
    const per = (Bun.nanoseconds() - t) / 20000;
    if (per < (best.get(n) ?? Infinity)) best.set(n, per);
  }
}
for (const [n] of fns) console.log(`${n.padEnd(16)}${best.get(n)!.toFixed(1).padStart(8)} ns`);
