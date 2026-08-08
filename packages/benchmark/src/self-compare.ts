/**
 * Before/after for the core changes: original signals.ts vs current.
 * Both are separate module instances with independent global state.
 * Run: bun run src/self-compare.ts
 */
import * as NEW from "../../core/src/signals.ts";
import * as OLD from "../.bench-baseline/signals-baseline.ts";

type Mod = typeof NEW;

type Case = { name: string; make: (m: Mod) => () => void; n?: number };

const cases: Case[] = [
  {
    name: "create: signal",
    make: (m) => () => {
      m.signal(0);
    },
  },
  {
    name: "create: scope + signal + effect + dispose",
    make: (m) => () => {
      m.createScope((dispose) => {
        const s = m.signal(0);
        m.effect(() => {
          s();
        });
        m.flush();
        dispose();
      }, true);
    },
  },
  {
    name: "write: no subscribers (x100)",
    n: 5000,
    make: (m) => {
      const s = m.signal(0);
      let i = 0;
      return () => {
        for (let k = 0; k < 100; k++) s.set(++i);
      };
    },
  },
  {
    name: "steady: 1 write + flush, 1 effect",
    make: (m) => {
      const s = m.signal(0);
      m.effect(() => {
        s();
      });
      m.flush();
      let i = 0;
      return () => {
        s.set(++i);
        m.flush();
      };
    },
  },
  {
    name: "steady: chain(5) write + flush",
    make: (m) => {
      const s = m.signal(0);
      let c: () => number = () => s();
      for (let d = 0; d < 5; d++) {
        const prev = c;
        c = m.computed(() => prev() + 1);
      }
      m.effect(() => {
        c();
      });
      m.flush();
      let i = 0;
      return () => {
        s.set(++i);
        m.flush();
      };
    },
  },
  {
    name: "steady: deep tree (height 40) 1 effect",
    make: (m) => {
      const s = m.signal(0);
      let c: () => number = () => s();
      for (let d = 0; d < 40; d++) {
        const prev = c;
        c = m.computed(() => prev() + 1);
      }
      m.effect(() => {
        c();
      });
      m.flush();
      let i = 0;
      return () => {
        s.set(++i);
        m.flush();
      };
    },
  },
  {
    name: "steady: 100 effects at height 40",
    n: 2000,
    make: (m) => {
      const s = m.signal(0);
      let c: () => number = () => s();
      for (let d = 0; d < 40; d++) {
        const prev = c;
        c = m.computed(() => prev() + 1);
      }
      const last = c;
      for (let e = 0; e < 100; e++) {
        m.effect(() => {
          last();
        });
      }
      m.flush();
      let i = 0;
      return () => {
        s.set(++i);
        m.flush();
      };
    },
  },
  {
    name: "steady: wide(10) write all + flush",
    make: (m) => {
      const sigs = Array.from({ length: 10 }, (_, i) => m.signal(i));
      const sum = m.computed(() => {
        let t = 0;
        for (let k = 0; k < 10; k++) t += sigs[k]();
        return t;
      });
      m.effect(() => {
        sum();
      });
      m.flush();
      let i = 0;
      return () => {
        for (let k = 0; k < 10; k++) sigs[k].set(++i);
        m.flush();
      };
    },
  },
  {
    name: "read: settled computed (x100)",
    n: 5000,
    make: (m) => {
      const s = m.signal(1);
      const c = m.computed(() => s() * 2);
      c();
      return () => {
        for (let k = 0; k < 100; k++) c();
      };
    },
  },
];

console.log(
  `${"case".padEnd(44)}${"before ns".padStart(11)}${"after ns".padStart(10)}${"change".padStart(12)}`,
);
console.log("-".repeat(77));

for (const c of cases) {
  const n = c.n ?? 20000;
  const oldFn = c.make(OLD as unknown as Mod);
  const newFn = c.make(NEW);
  const warm = Math.min(n, 3000);
  for (let i = 0; i < warm; i++) oldFn();
  for (let i = 0; i < warm; i++) newFn();
  Bun.gc(true);

  const run = (fn: () => void): number => {
    const start = Bun.nanoseconds();
    for (let i = 0; i < n; i++) fn();
    return (Bun.nanoseconds() - start) / n;
  };

  let bestOld = Number.POSITIVE_INFINITY;
  let bestNew = Number.POSITIVE_INFINITY;
  for (let round = 0; round < 9; round++) {
    const o = run(oldFn);
    const nw = run(newFn);
    if (o < bestOld) bestOld = o;
    if (nw < bestNew) bestNew = nw;
  }
  const speedup = bestOld / bestNew;
  const tag = speedup >= 1 ? `${speedup.toFixed(2)}x faster` : `${(1 / speedup).toFixed(2)}x slower`;
  console.log(
    `${c.name.padEnd(44)}${bestOld.toFixed(0).padStart(11)}${bestNew.toFixed(0).padStart(10)}${tag.padStart(17)}`,
  );
}
