/**
 * Profiling script to understand performance differences
 */

import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

import { signal, computed, effect, batch, scope } from "@barqjs/core";
import { createEffect, createMemo, root, createSignal, batch as solidBatch } from "solid-js";

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
  const s = signal(0);
  for (let i = 0; i < 100; i++) s.set(i);
});

profile("solid: signal set", () => {
  root((dispose) => {
    const [, setS] = createSignal(0);
    for (let i = 0; i < 100; i++) setS(i);
    dispose();
  });
});

// Test 2: Signal with one subscriber
console.log("\n--- Signal with 1 computed subscriber ---");

profile("barq: signal + 1 computed", () => {
  scope((dispose) => {
    const s = signal(0);
    const c = computed(() => s() * 2);
    batch(() => {
      for (let i = 0; i < 100; i++) s.set(i);
    });
    c();
    dispose();
  }, true);
});

profile("solid: signal + 1 computed", () => {
  root((dispose) => {
    const [s, setS] = createSignal(0);
    const c = createMemo(() => s() * 2);
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
  scope((dispose) => {
    let runs = 0;
    const s = signal(0);
    effect(() => {
      s();
      runs++;
    });
    batch(() => {
      for (let i = 0; i < 10; i++) s.set(i);
    });
    dispose();
  }, true);
});

profile("solid: effect trigger", () => {
  root((dispose) => {
    let runs = 0;
    const [s, setS] = createSignal(0);
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
  scope((dispose) => {
    const a = signal(1);
    const b = computed(() => a() * 2);
    const c = computed(() => b() + 1);
    const d = computed(() => c() * 3);
    const e = computed(() => d() - 2);
    const f = computed(() => e() + a());
    batch(() => {
      for (let i = 0; i < 50; i++) a.set(i);
    });
    f();
    dispose();
  }, true);
});

profile("solid: computed chain", () => {
  root((dispose) => {
    const [a, setA] = createSignal(1);
    const b = createMemo(() => a() * 2);
    const c = createMemo(() => b() + 1);
    const d = createMemo(() => c() * 3);
    const e = createMemo(() => d() - 2);
    const f = createMemo(() => e() + a());
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
  batch(() => {});
});

profile("solid: empty batch", () => {
  solidBatch(() => {});
});

// Test 6: scope/root overhead
console.log("\n--- Scope creation overhead ---");

profile("barq: scope", () => {
  scope((dispose) => {
    dispose();
  }, true);
});

profile("solid: root", () => {
  root((dispose) => {
    dispose();
  });
});

// Test 7: Pure computed read (already computed)
console.log("\n--- Computed read (cached) ---");

const barqS = signal(42);
const barqC = computed(() => barqS() * 2);
barqC(); // initial compute

profile("barq: computed read (cached)", () => {
  for (let i = 0; i < 100; i++) barqC();
});

let solidC: () => number;
root(() => {
  const [s] = createSignal(42);
  solidC = createMemo(() => s() * 2);
  solidC(); // initial compute
});

profile("solid: computed read (cached)", () => {
  for (let i = 0; i < 100; i++) solidC();
});

// Test 8: Diamond pattern
console.log("\n--- Diamond pattern ---");

profile("barq: diamond", () => {
  scope((dispose) => {
    const x = signal(1);
    const a = computed(() => x() * 2);
    const b = computed(() => x() * 3);
    const c = computed(() => a() + b());
    batch(() => {
      for (let i = 0; i < 50; i++) x.set(i);
    });
    c();
    dispose();
  }, true);
});

profile("solid: diamond", () => {
  root((dispose) => {
    const [x, setX] = createSignal(1);
    const a = createMemo(() => x() * 2);
    const b = createMemo(() => x() * 3);
    const c = createMemo(() => a() + b());
    solidBatch(() => {
      for (let i = 0; i < 50; i++) setX(i);
    });
    c();
    dispose();
  });
});

console.log("\n" + "=".repeat(60));
