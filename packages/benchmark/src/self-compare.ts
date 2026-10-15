/**
 * Before/after for the core changes: original signals.ts vs current.
 * Both are separate module instances with independent global state.
 * Run: bun run src/self-compare.ts
 */
import * as NEW from "../../core/src/signals.ts";
import * as OLD from "../.bench-baseline/signals-baseline.ts";

type Case = { name: string; before: () => () => void; after: () => () => void; n?: number };

const cases: Case[] = [
  {
    name: "create: signal",
    before: () => () => {
      OLD.signal(0);
    },
    after: () => () => {
      NEW.createSignal(0);
    },
  },
  {
    name: "create: scope + signal + effect + dispose",
    before: () => () => {
      OLD.createScope((dispose) => {
        const s = OLD.signal(0);
        OLD.effect(() => {
          s();
        });
        OLD.flush();
        dispose();
      }, true);
    },
    after: () => () => {
      NEW.createRoot((dispose) => {
        const [s] = NEW.createSignal(0);
        NEW.createEffect(
          () => s(),
          () => {},
        );
        NEW.flush();
        dispose();
      });
    },
  },
  {
    name: "write: no subscribers (x100)",
    n: 5000,
    before: () => {
      const s = OLD.signal(0);
      let i = 0;
      return () => {
        for (let k = 0; k < 100; k++) s.set(++i);
      };
    },
    after: () => {
      const [, set] = NEW.createSignal(0);
      let i = 0;
      return () => {
        for (let k = 0; k < 100; k++) set(++i);
        NEW.flush();
      };
    },
  },
  {
    name: "steady: 1 write + flush, 1 effect",
    before: () => {
      const s = OLD.signal(0);
      OLD.effect(() => {
        s();
      });
      OLD.flush();
      let i = 0;
      return () => {
        s.set(++i);
        OLD.flush();
      };
    },
    after: () => {
      const [, set] = NEW.createRoot(() => {
        const sig = NEW.createSignal(0);
        NEW.createEffect(
          () => sig[0](),
          () => {},
        );
        return sig;
      });
      NEW.flush();
      let i = 0;
      return () => {
        set(++i);
        NEW.flush();
      };
    },
  },
  {
    name: "steady: chain(5) write + flush",
    before: () => {
      const s = OLD.signal(0);
      let c: () => number = () => s();
      for (let d = 0; d < 5; d++) {
        const prev = c;
        c = OLD.computed(() => prev() + 1);
      }
      OLD.effect(() => {
        c();
      });
      OLD.flush();
      let i = 0;
      return () => {
        s.set(++i);
        OLD.flush();
      };
    },
    after: () => {
      const [, set] = NEW.createRoot(() => {
        const sig = NEW.createSignal(0);
        let c: () => number = () => sig[0]();
        for (let d = 0; d < 5; d++) {
          const prev = c;
          c = NEW.createMemo(() => prev() + 1);
        }
        NEW.createEffect(
          () => c(),
          () => {},
        );
        return sig;
      });
      NEW.flush();
      let i = 0;
      return () => {
        set(++i);
        NEW.flush();
      };
    },
  },
  {
    name: "steady: deep tree (height 40) 1 effect",
    before: () => {
      const s = OLD.signal(0);
      let c: () => number = () => s();
      for (let d = 0; d < 40; d++) {
        const prev = c;
        c = OLD.computed(() => prev() + 1);
      }
      OLD.effect(() => {
        c();
      });
      OLD.flush();
      let i = 0;
      return () => {
        s.set(++i);
        OLD.flush();
      };
    },
    after: () => {
      const [, set] = NEW.createRoot(() => {
        const sig = NEW.createSignal(0);
        let c: () => number = () => sig[0]();
        for (let d = 0; d < 40; d++) {
          const prev = c;
          c = NEW.createMemo(() => prev() + 1);
        }
        NEW.createEffect(
          () => c(),
          () => {},
        );
        return sig;
      });
      NEW.flush();
      let i = 0;
      return () => {
        set(++i);
        NEW.flush();
      };
    },
  },
  {
    name: "steady: 100 effects at height 40",
    n: 2000,
    before: () => {
      const s = OLD.signal(0);
      let c: () => number = () => s();
      for (let d = 0; d < 40; d++) {
        const prev = c;
        c = OLD.computed(() => prev() + 1);
      }
      const last = c;
      for (let e = 0; e < 100; e++) {
        OLD.effect(() => {
          last();
        });
      }
      OLD.flush();
      let i = 0;
      return () => {
        s.set(++i);
        OLD.flush();
      };
    },
    after: () => {
      const [, set] = NEW.createRoot(() => {
        const sig = NEW.createSignal(0);
        let c: () => number = () => sig[0]();
        for (let d = 0; d < 40; d++) {
          const prev = c;
          c = NEW.createMemo(() => prev() + 1);
        }
        const last = c;
        for (let e = 0; e < 100; e++) {
          NEW.createEffect(
            () => last(),
            () => {},
          );
        }
        return sig;
      });
      NEW.flush();
      let i = 0;
      return () => {
        set(++i);
        NEW.flush();
      };
    },
  },
  {
    name: "steady: wide(10) write all + flush",
    before: () => {
      const sigs = Array.from({ length: 10 }, (_, i) => OLD.signal(i));
      const sum = OLD.computed(() => {
        let t = 0;
        for (let k = 0; k < 10; k++) t += sigs[k]();
        return t;
      });
      OLD.effect(() => {
        sum();
      });
      OLD.flush();
      let i = 0;
      return () => {
        for (let k = 0; k < 10; k++) sigs[k].set(++i);
        OLD.flush();
      };
    },
    after: () => {
      const sigs = NEW.createRoot(() => {
        const arr = Array.from({ length: 10 }, (_, k) => NEW.createSignal(k));
        const sum = NEW.createMemo(() => {
          let t = 0;
          for (let k = 0; k < 10; k++) t += arr[k][0]();
          return t;
        });
        NEW.createEffect(
          () => sum(),
          () => {},
        );
        return arr;
      });
      NEW.flush();
      let i = 0;
      return () => {
        for (let k = 0; k < 10; k++) sigs[k][1](++i);
        NEW.flush();
      };
    },
  },
  {
    name: "read: settled computed (x100)",
    n: 5000,
    before: () => {
      const s = OLD.signal(1);
      const c = OLD.computed(() => s() * 2);
      c();
      return () => {
        for (let k = 0; k < 100; k++) c();
      };
    },
    after: () => {
      const c = NEW.createRoot(() => {
        const sig = NEW.createSignal(1);
        return NEW.createMemo(() => sig[0]() * 2);
      });
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
  const oldFn = c.before();
  const newFn = c.after();
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
  const tag =
    speedup >= 1 ? `${speedup.toFixed(2)}x faster` : `${(1 / speedup).toFixed(2)}x slower`;
  console.log(
    `${c.name.padEnd(44)}${bestOld.toFixed(0).padStart(11)}${bestNew.toFixed(0).padStart(10)}${tag.padStart(17)}`,
  );
}
