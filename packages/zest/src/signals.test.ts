import { describe, expect, test } from "bun:test";
import { batch, computed, effect, signal } from "./signals.ts";

describe("signal", () => {
  test("creates a signal with initial value", () => {
    const count = signal(0);
    expect(count()).toBe(0);
  });

  test("updates value with set", () => {
    const count = signal(0);
    count.set(5);
    expect(count()).toBe(5);
  });

  test("updates value with update function", () => {
    const count = signal(10);
    count.update((n) => n + 5);
    expect(count()).toBe(15);
  });

  test("peek reads without tracking", () => {
    const count = signal(42);
    expect(count.peek()).toBe(42);
  });
});

describe("computed", () => {
  test("derives value from signals", () => {
    const count = signal(5);
    const doubled = computed(() => count() * 2);
    expect(doubled()).toBe(10);
  });

  test("updates when dependency changes", () => {
    const count = signal(3);
    const tripled = computed(() => count() * 3);

    expect(tripled()).toBe(9);
    count.set(4);
    expect(tripled()).toBe(12);
  });

  test("peek reads without tracking", () => {
    const count = signal(7);
    const squared = computed(() => count() ** 2);
    expect(squared.peek()).toBe(49);
  });
});

describe("effect", () => {
  test("runs immediately", () => {
    let ran = false;
    effect(() => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  test("runs when dependencies change", () => {
    const count = signal(0);
    let effectCount = 0;

    effect(() => {
      count(); // Subscribe
      effectCount++;
    });

    expect(effectCount).toBe(1);
    count.set(1);
    expect(effectCount).toBe(2);
  });

  test("cleanup function is called", () => {
    let cleanedUp = false;
    const count = signal(0);

    effect(() => {
      count();
      return () => {
        cleanedUp = true;
      };
    });

    expect(cleanedUp).toBe(false);
    count.set(1);
    expect(cleanedUp).toBe(true);
  });

  test("returns stop function", () => {
    const count = signal(0);
    let effectCount = 0;

    const stop = effect(() => {
      count();
      effectCount++;
    });

    expect(effectCount).toBe(1);
    stop();
    count.set(1);
    expect(effectCount).toBe(1); // Should not run after stop
  });
});

describe("batch", () => {
  test("batches multiple updates", () => {
    const a = signal(0);
    const b = signal(0);
    let effectCount = 0;

    effect(() => {
      a();
      b();
      effectCount++;
    });

    expect(effectCount).toBe(1);

    batch(() => {
      a.set(1);
      b.set(1);
    });

    // Effect should run once more after batch
    expect(effectCount).toBe(2);
  });
});
