/**
 * Profiling script to understand performance differences
 */

import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

import {
  createSignal,
  createMemo,
  createEffect as barqCreateEffect,
  flush,
  createRoot,
} from "@barqjs/core";
import {
  createEffect,
  createMemo as solidCreateMemo,
  createRoot as root,
  createSignal as solidCreateSignal,
  batch as solidBatch,
} from "solid-js";

const ITERATIONS = 10000;

function profile(name: string, fn: () => void) {
  // Warmup
  for (let i = 0; i < 100; i++) fn();

  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) fn();
  const end = performance.now();

  const avgMs = (end - start) / ITERATIONS;
  console.log(`${name}: ${avgMs.toFixed(6)}ms avg (${(end - start).toFixed(2)}ms total)`);
  return avgMs;
}

console.log("=".repeat(60));
console.log("DETAILED PROFILING");
console.log("=".repeat(60));

// Test 1: Raw signal read/write without effects
console.log("\n--- Signal Read/Write (no effects) ---");

profile("barq: signal set", () => {
  const [s, writeS] = createSignal(0);
  for (let i = 0; i < 100; i++) writeS(i);
  flush();
});

profile("solid: signal set", () => {
  root((dispose) => {
    const [, setS] = solidCreateSignal(0);
    for (let i = 0; i < 100; i++) setS(i);
    dispose();
  });
});

// Test 2: Signal with one subscriber
console.log("\n--- Signal with 1 computed subscriber ---");

profile("barq: signal + 1 computed", () => {
  const [writeS, c, dispose] = createRoot((dispose) => {
    const [s, writeS] = createSignal(0);
    const c = createMemo(() => s() * 2);
    return [writeS, c, dispose] as const;
  });
  flush(() => {
    for (let i = 0; i < 100; i++) writeS(i);
  });
  c();
  dispose();
});

profile("solid: signal + 1 computed", () => {
  root((dispose) => {
    const [s, setS] = solidCreateSignal(0);
    const c = solidCreateMemo(() => s() * 2);
    solidBatch(() => {
      for (let i = 0; i < 100; i++) setS(i);
    });
    c();
    dispose();
  });
});

// Test 3: Effect only
console.log("\n--- Effect triggering ---");

profile("barq: effect trigger", () => {
  const [writeS, dispose] = createRoot((dispose) => {
    let runs = 0;
    const [s, writeS] = createSignal(0);
    barqCreateEffect(
      () => s(),
      () => {
        runs++;
      },
    );
    return [writeS, dispose] as const;
  });
  flush();
  flush(() => {
    for (let i = 0; i < 10; i++) writeS(i);
  });
  dispose();
});

profile("solid: effect trigger", () => {
  root((dispose) => {
    let runs = 0;
    const [s, setS] = solidCreateSignal(0);
    createEffect(() => {
      s();
      runs++;
    });
    solidBatch(() => {
      for (let i = 0; i < 10; i++) setS(i);
    });
    dispose();
  });
});

// Test 4: Computed chain
console.log("\n--- Computed Chain (5 deep) ---");

profile("barq: computed chain", () => {
  const [writeA, f, dispose] = createRoot((dispose) => {
    const [a, writeA] = createSignal(1);
    const b = createMemo(() => a() * 2);
    const c = createMemo(() => b() + 1);
    const d = createMemo(() => c() * 3);
    const e = createMemo(() => d() - 2);
    const f = createMemo(() => e() + a());
    return [writeA, f, dispose] as const;
  });
  flush(() => {
    for (let i = 0; i < 50; i++) writeA(i);
  });
  f();
  dispose();
});

profile("solid: computed chain", () => {
  root((dispose) => {
    const [a, setA] = solidCreateSignal(1);
    const b = solidCreateMemo(() => a() * 2);
    const c = solidCreateMemo(() => b() + 1);
    const d = solidCreateMemo(() => c() * 3);
    const e = solidCreateMemo(() => d() - 2);
    const f = solidCreateMemo(() => e() + a());
    solidBatch(() => {
      for (let i = 0; i < 50; i++) setA(i);
    });
    f();
    dispose();
  });
});

// Test 5: Just batch overhead
console.log("\n--- Batch overhead ---");

profile("barq: empty batch", () => {
  flush(() => {});
});

profile("solid: empty batch", () => {
  solidBatch(() => {});
});

// Test 6: scope/root overhead
console.log("\n--- Scope creation overhead ---");

profile("barq: scope", () => {
  createRoot((dispose) => {
    dispose();
  });
});

profile("solid: root", () => {
  root((dispose) => {
    dispose();
  });
});

// Test 7: Pure computed read (already computed)
console.log("\n--- Computed read (cached) ---");

const barqC = createRoot(() => {
  const [barqS] = createSignal(42);
  return createMemo(() => barqS() * 2);
});
barqC(); // initial compute

profile("barq: computed read (cached)", () => {
  for (let i = 0; i < 100; i++) barqC();
});

let solidC: () => number;
root(() => {
  const [s] = solidCreateSignal(42);
  solidC = solidCreateMemo(() => s() * 2);
  solidC(); // initial compute
});

profile("solid: computed read (cached)", () => {
  for (let i = 0; i < 100; i++) solidC();
});

// Test 8: Diamond pattern
console.log("\n--- Diamond pattern ---");

profile("barq: diamond", () => {
  const [writeX, c, dispose] = createRoot((dispose) => {
    const [x, writeX] = createSignal(1);
    const a = createMemo(() => x() * 2);
    const b = createMemo(() => x() * 3);
    const c = createMemo(() => a() + b());
    return [writeX, c, dispose] as const;
  });
  flush(() => {
    for (let i = 0; i < 50; i++) writeX(i);
  });
  c();
  dispose();
});

profile("solid: diamond", () => {
  root((dispose) => {
    const [x, setX] = solidCreateSignal(1);
    const a = solidCreateMemo(() => x() * 2);
    const b = solidCreateMemo(() => x() * 3);
    const c = solidCreateMemo(() => a() + b());
    solidBatch(() => {
      for (let i = 0; i < 50; i++) setX(i);
    });
    c();
    dispose();
  });
});

console.log("\n" + "=".repeat(60));
