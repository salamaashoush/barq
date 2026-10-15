/**
 * The eleven reactivity cases, as a library.
 *
 * `head-to-head.ts` hard-wires one barq module and reports a bare min-of-9
 * ratio. These are the same graphs, but the barq side is a parameter so two
 * builds of `signals.ts` can be timed against each other in one process, and
 * the timing is left to `stats.paired` so every row carries a spread.
 *
 * ## Why there is a twelfth, and why it is 500 deep
 *
 * The original eleven were all shallow — the deepest chain was 5 — and that is
 * the whole reason M7b's F1 escaped: propagation was quadratic in graph depth
 * and every case here was too shallow to show it. Eleven green rows sat beside
 * a 187x loss on `cellx2500`. `chain(500)` is the row that cannot be green
 * while F1 is true, so a per-write cost that grows with depth fails HERE, in
 * the suite that is run every milestone, rather than in a browser benchmark
 * nobody ran until M7b. Its per-iteration cost divided by 500 is the same
 * ms-per-layer that `tier2/jrb.ts` sweeps.
 */
import {
  createEffect as sEffect,
  createMemo as sMemo,
  createRoot as sRoot,
  createSignal as sSignal,
  flush as sFlush,
} from "@solidjs/signals";

export interface BarqApi {
  createSignal: <T>(v: T) => [() => T, (n: T) => void];
  createMemo: <T>(fn: () => T) => () => T;
  createEffect: <T>(compute: () => T, effect: (value: T) => void) => void;
  flush: () => void;
  createRoot: <T>(fn: (dispose: () => void) => T) => T;
}

export interface Case {
  name: string;
  /** Iterations timed inside one trial; carried over from head-to-head.ts. */
  iters: number;
  make: () => () => void;
}

export const NAMES: readonly string[] = [
  "create: signal",
  "create: root + signal + memo + dispose",
  "create: root + signal + effect + flush + dispose",
  "write: no subscribers (x100)",
  "steady: 1 write + flush, 1 effect",
  "steady: 100 writes + 1 flush, 1 effect",
  "steady: chain(5) write + flush",
  "steady: diamond write + flush",
  "steady: wide(10) write all + flush",
  "read: settled memo (x100)",
  "dispose: root with 50 memos",
  "steady: chain(500) write + flush",
];

const ITERS: readonly number[] = [
  20000, 20000, 20000, 5000, 20000, 5000, 20000, 20000, 20000, 5000, 2000, 200,
];

export function barqCases(B: BarqApi): Case[] {
  // Destructured, never `signal(...)` inside a timed closure: a property get
  // on a module namespace object is an exotic lookup, and leaving it in the
  // loop taxes the barq side by 2-3x on the allocation-heavy rows while the
  // solid side reads a plain module binding.
  const { createSignal, createMemo, createEffect, flush, createRoot } = B;
  const makes: (() => () => void)[] = [
    () => () => {
      createSignal(0);
    },

    () => () => {
      createRoot((dispose) => {
        const [s] = createSignal(0);
        createMemo(() => s() * 2);
        dispose();
      });
    },

    () => () => {
      createRoot((dispose) => {
        const [s] = createSignal(0);
        createEffect(
          () => s(),
          () => {},
        );
        flush();
        dispose();
      });
    },

    () => {
      const [, set] = createRoot(() => createSignal(0));
      let i = 0;
      return () => {
        for (let k = 0; k < 100; k++) set(++i);
      };
    },

    () => {
      const [, set] = createRoot(() => {
        const sig = createSignal(0);
        createEffect(
          () => sig[0](),
          () => {},
        );
        return sig;
      });
      flush();
      let i = 0;
      return () => {
        set(++i);
        flush();
      };
    },

    () => {
      const [, set] = createRoot(() => {
        const sig = createSignal(0);
        createEffect(
          () => sig[0](),
          () => {},
        );
        return sig;
      });
      flush();
      let i = 0;
      return () => {
        for (let k = 0; k < 100; k++) set(++i);
        flush();
      };
    },

    () => {
      const [, set] = createRoot(() => {
        const sig = createSignal(0);
        let c: () => number = () => sig[0]();
        for (let d = 0; d < 5; d++) {
          const prev = c;
          c = createMemo(() => prev() + 1);
        }
        createEffect(
          () => c(),
          () => {},
        );
        return sig;
      });
      flush();
      let i = 0;
      return () => {
        set(++i);
        flush();
      };
    },

    () => {
      const [, set] = createRoot(() => {
        const sig = createSignal(0);
        const a = createMemo(() => sig[0]() + 1);
        const b = createMemo(() => sig[0]() + 2);
        const d = createMemo(() => a() + b());
        createEffect(
          () => d(),
          () => {},
        );
        return sig;
      });
      flush();
      let i = 0;
      return () => {
        set(++i);
        flush();
      };
    },

    () => {
      const sigs = createRoot(() => {
        const arr = Array.from({ length: 10 }, (_, k) => createSignal(k));
        const sum = createMemo(() => {
          let t = 0;
          for (let k = 0; k < 10; k++) t += arr[k][0]();
          return t;
        });
        createEffect(
          () => sum(),
          () => {},
        );
        return arr;
      });
      flush();
      let i = 0;
      return () => {
        for (let k = 0; k < 10; k++) sigs[k][1](++i);
        flush();
      };
    },

    () => {
      const c = createRoot(() => {
        const sig = createSignal(1);
        return createMemo(() => sig[0]() * 2);
      });
      c();
      return () => {
        for (let k = 0; k < 100; k++) c();
      };
    },

    () => () => {
      createRoot((dispose) => {
        const [s] = createSignal(0);
        for (let k = 0; k < 50; k++) createMemo(() => s() + k);
        dispose();
      });
    },

    () => {
      const [, set] = createRoot(() => {
        const sig = createSignal(0);
        let c: () => number = () => sig[0]();
        for (let d = 0; d < 500; d++) {
          const prev = c;
          c = createMemo(() => prev() + 1);
        }
        createEffect(
          () => c(),
          () => {},
        );
        return sig;
      });
      flush();
      let i = 0;
      return () => {
        set(++i);
        flush();
      };
    },
  ];
  return makes.map((make, i) => ({ name: NAMES[i], iters: ITERS[i], make }));
}

export function solidCases(): Case[] {
  const makes: (() => () => void)[] = [
    () => () => {
      sSignal(0);
    },

    () => () => {
      sRoot((dispose) => {
        const [s] = sSignal(0);
        sMemo(() => s() * 2);
        dispose();
      });
    },

    () => () => {
      sRoot((dispose) => {
        const [s] = sSignal(0);
        sEffect(
          () => s(),
          () => {},
        );
        sFlush();
        dispose();
      });
    },

    () => {
      const [, set] = sRoot(() => sSignal(0));
      let j = 0;
      return () => {
        for (let k = 0; k < 100; k++) set(++j);
      };
    },

    () => {
      const [, set] = sRoot(() => {
        const sig = sSignal(0);
        sEffect(
          () => sig[0](),
          () => {},
        );
        return sig;
      });
      sFlush();
      let j = 0;
      return () => {
        set(++j);
        sFlush();
      };
    },

    () => {
      const [, set] = sRoot(() => {
        const sig = sSignal(0);
        sEffect(
          () => sig[0](),
          () => {},
        );
        return sig;
      });
      sFlush();
      let j = 0;
      return () => {
        for (let k = 0; k < 100; k++) set(++j);
        sFlush();
      };
    },

    () => {
      const [, set] = sRoot(() => {
        const sig = sSignal(0);
        let m: () => number = () => sig[0]();
        for (let d = 0; d < 5; d++) {
          const prev = m;
          m = sMemo(() => prev() + 1);
        }
        sEffect(
          () => m(),
          () => {},
        );
        return sig;
      });
      sFlush();
      let j = 0;
      return () => {
        set(++j);
        sFlush();
      };
    },

    () => {
      const [, set] = sRoot(() => {
        const sig = sSignal(0);
        const sa = sMemo(() => sig[0]() + 1);
        const sb = sMemo(() => sig[0]() + 2);
        const sd = sMemo(() => sa() + sb());
        sEffect(
          () => sd(),
          () => {},
        );
        return sig;
      });
      sFlush();
      let j = 0;
      return () => {
        set(++j);
        sFlush();
      };
    },

    () => {
      const ssigs = sRoot(() => {
        const arr = Array.from({ length: 10 }, (_, k) => sSignal(k));
        const m = sMemo(() => {
          let t = 0;
          for (let k = 0; k < 10; k++) t += arr[k][0]();
          return t;
        });
        sEffect(
          () => m(),
          () => {},
        );
        return arr;
      });
      sFlush();
      let j = 0;
      return () => {
        for (let k = 0; k < 10; k++) ssigs[k][1](++j);
        sFlush();
      };
    },

    () => {
      const sc = sRoot(() => {
        const sig = sSignal(1);
        return sMemo(() => sig[0]() * 2);
      });
      sc();
      return () => {
        for (let k = 0; k < 100; k++) sc();
      };
    },

    () => () => {
      sRoot((dispose) => {
        const [s] = sSignal(0);
        for (let k = 0; k < 50; k++) sMemo(() => s() + k);
        dispose();
      });
    },

    () => {
      const [, set] = sRoot(() => {
        const sig = sSignal(0);
        let m: () => number = () => sig[0]();
        for (let d = 0; d < 500; d++) {
          const prev = m;
          m = sMemo(() => prev() + 1);
        }
        sEffect(
          () => m(),
          () => {},
        );
        return sig;
      });
      sFlush();
      let j = 0;
      return () => {
        set(++j);
        sFlush();
      };
    },
  ];
  return makes.map((make, i) => ({ name: NAMES[i], iters: ITERS[i], make }));
}
