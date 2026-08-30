/**
 * Differential test: run the same reactive scenario against barq and
 * Solid 2.0 (@solidjs/signals) and compare observable behaviour.
 * Run: bun run src/differential.ts
 */
import * as B from "@barqjs/core";
import * as S from "@solidjs/signals";

type Api = {
  signal: <T>(v: T, opts?: { equals?: false }) => [() => T, (v: T) => void];
  memo: <T>(fn: (prev?: T) => T, opts?: { equals?: false }) => () => T;
  effect: (fn: () => void) => void;
  root: <T>(fn: (dispose: () => void) => T) => T;
  flush: () => void;
  cleanup: (fn: () => void) => void;
  untrack: <T>(fn: () => T) => T;
};

const barq: Api = {
  signal: (v, opts) => {
    const s = B.signal(v, opts as never);
    return [s, s.set];
  },
  memo: (fn, opts) => B.computed(fn as never, opts as never) as never,
  effect: (fn) => {
    B.effect(fn);
  },
  root: (fn) => B.scope(fn, true),
  flush: () => B.flush(),
  cleanup: (fn) => {
    B.onCleanup(fn);
  },
  untrack: (fn) => B.untrack(fn),
};

const solid: Api = {
  signal: (v, opts) => {
    const [g, s] = S.createSignal(v as never, opts as never);
    return [g, s as (v: never) => void] as never;
  },
  memo: (fn, opts) => S.createMemo(fn as never, opts as never) as never,
  effect: (fn) => {
    S.createEffect(fn as never, () => {});
  },
  root: (fn) => S.createRoot(fn),
  flush: () => S.flush(),
  cleanup: (fn) => {
    S.onCleanup(fn);
  },
  untrack: (fn) => S.untrack(fn),
};

const scenarios: Record<string, (api: Api) => unknown> = {
  "dep read order flips": (api) => {
    const log: number[] = [];
    api.root(() => {
      const [flip, setFlip] = api.signal(false);
      const [a, setA] = api.signal(1);
      const [b, setB] = api.signal(2);
      const c = api.memo(() => (flip() ? b() + a() : a() + b()));
      api.effect(() => log.push(c()));
      api.flush();
      setFlip(true);
      api.flush();
      setB(10);
      api.flush();
      setA(100);
      api.flush();
    });
    return log;
  },

  "conditional dep drop and re-add": (api) => {
    const log: number[] = [];
    api.root(() => {
      const [use, setUse] = api.signal(true);
      const [a, setA] = api.signal(1);
      const [b, setB] = api.signal(2);
      const c = api.memo(() => (use() ? a() : b()));
      api.effect(() => log.push(c()));
      api.flush();
      setB(20); // not a dep -> no run
      api.flush();
      setUse(false);
      api.flush();
      setA(100); // no longer a dep -> no run
      api.flush();
      setB(200);
      api.flush();
    });
    return log;
  },

  "diamond is glitch free": (api) => {
    const log: number[] = [];
    api.root(() => {
      const [x, setX] = api.signal(1);
      const l = api.memo(() => x() * 2);
      const r = api.memo(() => x() * 3);
      const sum = api.memo(() => l() + r());
      api.effect(() => log.push(sum()));
      api.flush();
      setX(2);
      api.flush();
      setX(3);
      api.flush();
    });
    return log;
  },

  "memo equality cuts propagation": (api) => {
    let runs = 0;
    api.root(() => {
      const [n, setN] = api.signal(1);
      const parity = api.memo(() => n() % 2);
      api.effect(() => {
        parity();
        runs++;
      });
      api.flush();
      setN(3); // same parity
      api.flush();
      setN(5); // same parity
      api.flush();
      setN(2); // parity changes
      api.flush();
    });
    return runs;
  },

  "equals:false always propagates": (api) => {
    let runs = 0;
    api.root(() => {
      const [n, setN] = api.signal(1, { equals: false });
      api.effect(() => {
        n();
        runs++;
      });
      api.flush();
      setN(1);
      api.flush();
      setN(1);
      api.flush();
    });
    return runs;
  },

  "revert within a batch is a no-op": (api) => {
    let runs = 0;
    api.root(() => {
      const [n, setN] = api.signal(1);
      api.effect(() => {
        n();
        runs++;
      });
      api.flush();
      setN(2);
      setN(1); // back to original before flush
      api.flush();
    });
    return runs;
  },

  "cleanup runs LIFO before rerun": (api) => {
    const log: string[] = [];
    api.root(() => {
      const [n, setN] = api.signal(0);
      api.effect(() => {
        const v = n();
        api.cleanup(() => log.push(`c1:${v}`));
        api.cleanup(() => log.push(`c2:${v}`));
      });
      api.flush();
      setN(1);
      api.flush();
      setN(2);
      api.flush();
    });
    return log;
  },

  "nested effect disposed on outer rerun": (api) => {
    const log: string[] = [];
    api.root(() => {
      const [outer, setOuter] = api.signal(0);
      const [inner, setInner] = api.signal(0);
      api.effect(() => {
        const o = outer();
        api.effect(() => log.push(`in:${o}:${inner()}`));
      });
      api.flush();
      setInner(1);
      api.flush();
      setOuter(1);
      api.flush();
      setInner(2);
      api.flush();
    });
    return log;
  },

  "dispose stops all updates": (api) => {
    let runs = 0;
    const [n, setN] = api.root(() => {
      const sig = api.signal(0);
      api.effect(() => {
        sig[0]();
        runs++;
      });
      return sig;
    });
    api.flush();
    const before = runs;
    setN(1);
    api.flush();
    void n;
    return { ranAfterCreate: before > 0, ranAfterWrite: runs > before };
  },

  "untrack does not subscribe": (api) => {
    let runs = 0;
    api.root(() => {
      const [a, setA] = api.signal(0);
      const [b, setB] = api.signal(0);
      api.effect(() => {
        a();
        api.untrack(() => b());
        runs++;
      });
      api.flush();
      setB(1);
      api.flush();
      setA(1);
      api.flush();
    });
    return runs;
  },

  "memo prev value argument": (api) => {
    const log: unknown[] = [];
    api.root(() => {
      const [n, setN] = api.signal(1);
      const acc = api.memo<number>((prev) => (prev ?? 0) + n());
      api.effect(() => log.push(acc()));
      api.flush();
      setN(2);
      api.flush();
      setN(3);
      api.flush();
    });
    return log;
  },

  "same dep read twice in one pass": (api) => {
    const log: number[] = [];
    api.root(() => {
      const [a, setA] = api.signal(1);
      const c = api.memo(() => a() + a());
      api.effect(() => log.push(c()));
      api.flush();
      setA(5);
      api.flush();
    });
    return log;
  },

  "interleaved repeat reads a,b,a,b": (api) => {
    const log: number[] = [];
    api.root(() => {
      const [a, setA] = api.signal(1);
      const [b, setB] = api.signal(10);
      const c = api.memo(() => a() + b() + a() + b());
      api.effect(() => log.push(c()));
      api.flush();
      setA(2);
      api.flush();
      setB(20);
      api.flush();
    });
    return log;
  },

  "deep chain propagates once": (api) => {
    let runs = 0;
    api.root(() => {
      const [n, setN] = api.signal(0);
      let cur: () => number = n;
      for (let i = 0; i < 10; i++) {
        const prev = cur;
        cur = api.memo(() => prev() + 1);
      }
      const last = cur;
      api.effect(() => {
        last();
        runs++;
      });
      api.flush();
      setN(1);
      api.flush();
    });
    return runs;
  },

  "wide fan-in single rerun per flush": (api) => {
    let runs = 0;
    api.root(() => {
      const sigs = Array.from({ length: 5 }, (_, i) => api.signal(i));
      const sum = api.memo(() => sigs.reduce((t, [g]) => t + g(), 0));
      api.effect(() => {
        sum();
        runs++;
      });
      api.flush();
      for (const [, set] of sigs) set(99);
      api.flush();
    });
    return runs;
  },

  "effect ordering parent before child": (api) => {
    const log: string[] = [];
    api.root(() => {
      const [n, setN] = api.signal(0);
      api.effect(() => {
        n();
        log.push("parent");
        api.effect(() => {
          n();
          log.push("child");
        });
      });
      api.flush();
      setN(1);
      api.flush();
    });
    return log;
  },
};

let mismatches = 0;
for (const [name, run] of Object.entries(scenarios)) {
  let b: unknown;
  let s: unknown;
  let berr: string | null = null;
  let serr: string | null = null;
  try {
    b = run(barq);
  } catch (e) {
    berr = String(e);
  }
  try {
    s = run(solid);
  } catch (e) {
    serr = String(e);
  }
  const bs = berr ?? JSON.stringify(b);
  const ss = serr ?? JSON.stringify(s);
  const same = bs === ss;
  if (!same) mismatches++;
  console.log(`${same ? "  ok  " : "DIFF  "}${name}`);
  if (!same) {
    console.log(`        barq   = ${bs}`);
    console.log(`        solid2 = ${ss}`);
  }
}
console.log(`\n${mismatches} mismatch(es) of ${Object.keys(scenarios).length}`);
