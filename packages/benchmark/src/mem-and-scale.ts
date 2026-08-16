/**
 * Memory-per-node and large-graph steady-state: barq vs Solid 2.0.
 * Run: bun run src/mem-and-scale.ts
 */
import {
  computed as bComputed,
  scope as bScope,
  effect as bEffect,
  flush as bFlush,
  signal as bSignal,
  store as bStore,
} from "@barqjs/core";
import {
  createEffect as sEffect,
  createMemo as sMemo,
  root as sRoot,
  createSignal as sSignal,
  createStore as sStore,
  flush as sFlush,
} from "@solidjs/signals";

const N = 100_000;

function heapBytes(): number {
  Bun.gc(true);
  return (process.memoryUsage() as { heapUsed: number }).heapUsed;
}

function mem(name: string, make: (i: number) => unknown): void {
  const keep: unknown[] = new Array(N);
  const before = heapBytes();
  for (let i = 0; i < N; i++) keep[i] = make(i);
  const after = heapBytes();
  console.log(`${name.padEnd(38)}${((after - before) / N).toFixed(0).padStart(8)} bytes/node`);
  if (keep.length !== N) throw new Error("unreachable");
}

console.log("== retained size per node ==");
mem("barq signal", () => bSignal(0));
mem("solid2 createSignal", () => sSignal(0));
mem("barq computed", () => {
  const s = bSignal(0);
  return bComputed(() => s() + 1);
});
mem("solid2 createMemo", () =>
  sRoot(() => {
    const [s] = sSignal(0);
    return sMemo(() => s() + 1);
  }),
);

// ---------------------------------------------------------------- scale

function time(name: string, barq: () => void, solid: () => void, n: number): void {
  const run = (fn: () => void): number => {
    for (let i = 0; i < Math.min(n, 200); i++) fn();
    Bun.gc(true);
    let best = Number.POSITIVE_INFINITY;
    for (let r = 0; r < 5; r++) {
      const t = Bun.nanoseconds();
      for (let i = 0; i < n; i++) fn();
      const per = (Bun.nanoseconds() - t) / n;
      if (per < best) best = per;
    }
    return best;
  };
  const b = run(barq);
  const s = run(solid);
  const ratio = s / b;
  const tag = ratio >= 1 ? `${ratio.toFixed(2)}x` : `${(1 / ratio).toFixed(2)}x SLOW`;
  console.log(
    `${name.padEnd(42)}${(b / 1000).toFixed(1).padStart(10)}${(s / 1000).toFixed(1).padStart(11)}${tag.padStart(14)}`,
  );
}

console.log("\n== large graph (µs/op) ==");
console.log(
  `${"case".padEnd(42)}${"barq µs".padStart(10)}${"solid2 µs".padStart(11)}${"ratio".padStart(9)}`,
);

{
  // 1000 signals -> 1000 memos -> 100 effects each reading 10 memos
  const W = 1000;
  const bSigs = Array.from({ length: W }, (_, i) => bSignal(i));
  const bMemos = bSigs.map((s) => bComputed(() => s() * 2));
  for (let e = 0; e < 100; e++) {
    const slice = bMemos.slice(e * 10, e * 10 + 10);
    bEffect(() => {
      let t = 0;
      for (const m of slice) t += m();
      return t;
    });
  }
  bFlush();

  const sSigs = sRoot(() => {
    const sigs = Array.from({ length: W }, (_, i) => sSignal(i));
    const memos = sigs.map(([s]) => sMemo(() => s() * 2));
    for (let e = 0; e < 100; e++) {
      const slice = memos.slice(e * 10, e * 10 + 10);
      sEffect(
        () => {
          let t = 0;
          for (const m of slice) t += m();
          return t;
        },
        () => {},
      );
    }
    return sigs;
  });
  sFlush();

  let i = 0;
  time(
    "graph1k: write 10 signals + flush",
    () => {
      for (let k = 0; k < 10; k++) bSigs[k * 97].set(++i);
      bFlush();
    },
    () => {
      for (let k = 0; k < 10; k++) sSigs[k * 97][1](++i);
      sFlush();
    },
    5000,
  );

  time(
    "graph1k: write all 1000 + flush",
    () => {
      for (let k = 0; k < 1000; k++) bSigs[k].set(++i);
      bFlush();
    },
    () => {
      for (let k = 0; k < 1000; k++) sSigs[k][1](++i);
      sFlush();
    },
    500,
  );
}

console.log("\n== store (µs/op) ==");
console.log(
  `${"case".padEnd(42)}${"barq µs".padStart(10)}${"solid2 µs".padStart(11)}${"ratio".padStart(9)}`,
);
{
  const [bs, bset] = bStore({ a: { b: { c: 0 } }, list: [] as number[] });
  bEffect(() => bs.a.b.c);
  bFlush();
  const [ss, sset] = sRoot(() => sStore({ a: { b: { c: 0 } }, list: [] as number[] }));
  sEffect(
    () => ss.a.b.c,
    () => {},
  );
  sFlush();
  let i = 0;
  time(
    "store: deep write + flush",
    () => {
      bset("a", "b", "c", ++i);
      bFlush();
    },
    () => {
      sset((s) => {
        s.a.b.c = ++i;
      });
      sFlush();
    },
    20000,
  );
}
