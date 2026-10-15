import * as CUR from "../../core/src/signals.ts";
import * as NOGEN from "../.bench-baseline/signals-nogen.ts";
import * as NOHEAP from "../.bench-baseline/signals-noheap.ts";
import * as ORIG from "../.bench-baseline/signals-baseline.ts";
type Legacy = typeof ORIG;
const order = (process.argv[2] ?? "abcd").split("");
const legacy = (m: Legacy) => () => {
  m.createScope((dispose) => {
    const s = m.signal(0);
    m.effect(() => {
      s();
    });
    m.flush();
    dispose();
  }, true);
};
const current = () => {
  CUR.createRoot((dispose) => {
    const [s] = CUR.createSignal(0);
    CUR.createTrackedEffect(() => {
      s();
    });
    CUR.flush();
    dispose();
  });
};
const all: Record<string, [string, () => void]> = {
  a: ["original", legacy(ORIG)],
  b: ["current", current],
  c: ["current -gen", legacy(NOGEN as unknown as Legacy)],
  d: ["current -heap", legacy(NOHEAP as unknown as Legacy)],
};
const fns = order.map((k) => all[k]);
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
