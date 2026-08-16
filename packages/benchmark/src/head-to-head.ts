/**
 * Head-to-head microbenchmark: barq core vs Solid 2.0 (@solidjs/signals).
 * Creation, steady-state propagation and teardown are measured separately.
 * Run: bun run src/head-to-head.ts
 */
import {
  computed as bComputed,
  createScope as bScope,
  effect as bEffect,
  flush as bFlush,
  signal as bSignal,
} from "@barqjs/core";
import {
  createEffect as sEffect,
  createMemo as sMemo,
  createRoot as sRoot,
  createSignal as sSignal,
  flush as sFlush,
} from "@solidjs/signals";

type Case = { name: string; barq: () => void; solid: () => void; n?: number };

const cases: Case[] = [];
function add(name: string, barq: () => void, solid: () => void, n = 20000): void {
  cases.push({ name, barq, solid, n });
}

// ---------------------------------------------------------------- creation

add(
  "create: signal",
  () => {
    bSignal(0);
  },
  () => {
    sSignal(0);
  },
);

add(
  "create: root + signal + memo + dispose",
  () => {
    bScope((dispose) => {
      const s = bSignal(0);
      bComputed(() => s() * 2);
      dispose();
    }, true);
  },
  () => {
    sRoot((dispose) => {
      const [s] = sSignal(0);
      sMemo(() => s() * 2);
      dispose();
    });
  },
);

add(
  "create: root + signal + effect + flush + dispose",
  () => {
    bScope((dispose) => {
      const s = bSignal(0);
      bEffect(() => {
        s();
      });
      bFlush();
      dispose();
    }, true);
  },
  () => {
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
);

// ------------------------------------------------------- steady-state write

{
  const s = bSignal(0);
  let i = 0;
  const [g, set] = sRoot(() => sSignal(0));
  let j = 0;
  add(
    "write: no subscribers (x100)",
    () => {
      for (let k = 0; k < 100; k++) s.set(++i);
    },
    () => {
      for (let k = 0; k < 100; k++) set(++j);
    },
    5000,
  );
  void g;
}

{
  const s = bSignal(0);
  bEffect(() => {
    s();
  });
  bFlush();
  let i = 0;

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

  add(
    "steady: 1 write + flush, 1 effect",
    () => {
      s.set(++i);
      bFlush();
    },
    () => {
      set(++j);
      sFlush();
    },
  );
}

{
  const s = bSignal(0);
  bEffect(() => {
    s();
  });
  bFlush();
  let i = 0;

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

  add(
    "steady: 100 writes + 1 flush, 1 effect",
    () => {
      for (let k = 0; k < 100; k++) s.set(++i);
      bFlush();
    },
    () => {
      for (let k = 0; k < 100; k++) set(++j);
      sFlush();
    },
    5000,
  );
}

{
  // 5-deep chain, effect at the end
  const s = bSignal(0);
  let c: () => number = () => s();
  for (let d = 0; d < 5; d++) {
    const prev = c;
    c = bComputed(() => prev() + 1);
  }
  bEffect(() => {
    c();
  });
  bFlush();
  let i = 0;

  const [, sset] = sRoot(() => {
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

  add(
    "steady: chain(5) write + flush",
    () => {
      s.set(++i);
      bFlush();
    },
    () => {
      sset(++j);
      sFlush();
    },
  );
}

{
  // diamond
  const s = bSignal(0);
  const a = bComputed(() => s() + 1);
  const b = bComputed(() => s() + 2);
  const d = bComputed(() => a() + b());
  bEffect(() => {
    d();
  });
  bFlush();
  let i = 0;

  const [, sset] = sRoot(() => {
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

  add(
    "steady: diamond write + flush",
    () => {
      s.set(++i);
      bFlush();
    },
    () => {
      sset(++j);
      sFlush();
    },
  );
}

{
  // wide: 10 signals -> 1 memo -> effect
  const sigs = Array.from({ length: 10 }, (_, i) => bSignal(i));
  const sum = bComputed(() => {
    let t = 0;
    for (let k = 0; k < 10; k++) t += sigs[k]();
    return t;
  });
  bEffect(() => {
    sum();
  });
  bFlush();
  let i = 0;

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

  add(
    "steady: wide(10) write all + flush",
    () => {
      for (let k = 0; k < 10; k++) sigs[k].set(++i);
      bFlush();
    },
    () => {
      for (let k = 0; k < 10; k++) ssigs[k][1](++j);
      sFlush();
    },
  );
}

{
  // untracked read of settled memo
  const s = bSignal(1);
  const c = bComputed(() => s() * 2);
  c();
  const sc = sRoot(() => {
    const sig = sSignal(1);
    return sMemo(() => sig[0]() * 2);
  });
  sc();
  add(
    "read: settled memo (x100)",
    () => {
      for (let k = 0; k < 100; k++) c();
    },
    () => {
      for (let k = 0; k < 100; k++) sc();
    },
    5000,
  );
}

{
  // deep tree teardown: 100 nested effects disposed
  add(
    "dispose: root with 50 memos",
    () => {
      bScope((dispose) => {
        const s = bSignal(0);
        for (let k = 0; k < 50; k++) bComputed(() => s() + k);
        dispose();
      }, true);
    },
    () => {
      sRoot((dispose) => {
        const [s] = sSignal(0);
        for (let k = 0; k < 50; k++) sMemo(() => s() + k);
        dispose();
      });
    },
    2000,
  );
}

{
  // chain(500). The other cases bottom out at depth 5, which is why M7b's F1 —
  // propagation quadratic in graph depth — was invisible to every one of them
  // while cellx2500 lost 186.6x. This row cannot be green while that is true.
  const s = bSignal(0);
  let c: () => number = () => s();
  for (let d = 0; d < 500; d++) {
    const prev = c;
    c = bComputed(() => prev() + 1);
  }
  bEffect(() => {
    c();
  });
  bFlush();
  let i = 0;

  const [, sset] = sRoot(() => {
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

  add(
    "steady: chain(500) write + flush",
    () => {
      s.set(++i);
      bFlush();
    },
    () => {
      sset(++j);
      sFlush();
    },
    200,
  );
}

// ---------------------------------------------------------------- harness

/**
 * Rounds alternate barq/solid so both see the same machine conditions;
 * best-of-N per side then survives background load reasonably well.
 */
function timePair(c: Case): [number, number] {
  const n = c.n ?? 20000;
  const warm = Math.min(n, 3000);
  for (let i = 0; i < warm; i++) c.barq();
  for (let i = 0; i < warm; i++) c.solid();
  Bun.gc(true);

  const run = (fn: () => void): number => {
    const start = Bun.nanoseconds();
    for (let i = 0; i < n; i++) fn();
    return (Bun.nanoseconds() - start) / n;
  };

  let bestB = Number.POSITIVE_INFINITY;
  let bestS = Number.POSITIVE_INFINITY;
  for (let round = 0; round < 9; round++) {
    const b = run(c.barq);
    const s = run(c.solid);
    if (b < bestB) bestB = b;
    if (s < bestS) bestS = s;
  }
  return [bestB, bestS];
}

console.log(
  `${"case".padEnd(42)}${"barq ns".padStart(10)}${"solid2 ns".padStart(11)}${"ratio".padStart(9)}`,
);
console.log("-".repeat(72));
for (const c of cases) {
  const [b, s] = timePair(c);
  const ratio = s / b; // >1 means barq faster
  const tag = ratio >= 1 ? `${ratio.toFixed(2)}x` : `${(1 / ratio).toFixed(2)}x SLOW`;
  console.log(
    `${c.name.padEnd(42)}${b.toFixed(0).padStart(10)}${s.toFixed(0).padStart(11)}${tag.padStart(14)}`,
  );
}
