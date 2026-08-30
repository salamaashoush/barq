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
  root as sRoot,
  createSignal as sSignal,
  flush as sFlush,
} from "@solidjs/signals";

export interface BarqApi {
  signal: <T>(v: T) => { (): T; set: (n: T) => void };
  computed: <T>(fn: () => T) => () => T;
  effect: (fn: () => unknown) => unknown;
  flush: () => void;
  scope: <T>(fn: (dispose: () => void) => T, detached?: boolean) => T;
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
  const { signal, computed, effect, flush, scope } = B;
  const makes: (() => () => void)[] = [
    () => () => {
      signal(0);
    },

    () => () => {
      scope((dispose) => {
        const s = signal(0);
        computed(() => s() * 2);
        dispose();
      }, true);
    },

    () => () => {
      scope((dispose) => {
        const s = signal(0);
        effect(() => s());
        flush();
        dispose();
      }, true);
    },

    () => {
      const s = signal(0);
      let i = 0;
      return () => {
        for (let k = 0; k < 100; k++) s.set(++i);
      };
    },

    () => {
      const s = signal(0);
      effect(() => s());
      flush();
      let i = 0;
      return () => {
        s.set(++i);
        flush();
      };
    },

    () => {
      const s = signal(0);
      effect(() => s());
      flush();
      let i = 0;
      return () => {
        for (let k = 0; k < 100; k++) s.set(++i);
        flush();
      };
    },

    () => {
      const s = signal(0);
      let c: () => number = () => s();
      for (let d = 0; d < 5; d++) {
        const prev = c;
        c = computed(() => prev() + 1);
      }
      effect(() => c());
      flush();
      let i = 0;
      return () => {
        s.set(++i);
        flush();
      };
    },

    () => {
      const s = signal(0);
      const a = computed(() => s() + 1);
      const b = computed(() => s() + 2);
      const d = computed(() => a() + b());
      effect(() => d());
      flush();
      let i = 0;
      return () => {
        s.set(++i);
        flush();
      };
    },

    () => {
      const sigs = Array.from({ length: 10 }, (_, i) => signal(i));
      const sum = computed(() => {
        let t = 0;
        for (let k = 0; k < 10; k++) t += sigs[k]();
        return t;
      });
      effect(() => sum());
      flush();
      let i = 0;
      return () => {
        for (let k = 0; k < 10; k++) sigs[k].set(++i);
        flush();
      };
    },

    () => {
      const s = signal(1);
      const c = computed(() => s() * 2);
      c();
      return () => {
        for (let k = 0; k < 100; k++) c();
      };
    },

    () => () => {
      scope((dispose) => {
        const s = signal(0);
        for (let k = 0; k < 50; k++) computed(() => s() + k);
        dispose();
      }, true);
    },

    () => {
      const s = signal(0);
      let c: () => number = () => s();
      for (let d = 0; d < 500; d++) {
        const prev = c;
        c = computed(() => prev() + 1);
      }
      effect(() => c());
      flush();
      let i = 0;
      return () => {
        s.set(++i);
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
