import { describe, expect, test } from "bun:test";
import { flush, root, signal } from "@barqjs/core";
import { cubicBezier, easing, spring, tween } from "./animation.ts";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Wait for a condition, not for a duration.
 *
 * These tests drive real animation frames, and a machine under load delivers
 * them late — a fixed nap then measures the scheduler rather than the tween.
 * The deadline is what keeps a genuine hang a failure.
 */
async function eventually(predicate: () => boolean, what: string, deadline = 2000): Promise<void> {
  const until = Date.now() + deadline;
  while (Date.now() < until) {
    if (predicate()) return;
    await sleep(5);
  }
  throw new Error(`timed out after ${deadline}ms waiting for ${what}`);
}

describe("easing", () => {
  test("every easing is anchored at both ends", () => {
    for (const [name, fn] of Object.entries(easing)) {
      expect(fn(0), name).toBeCloseTo(0, 5);
      expect(fn(1), name).toBeCloseTo(1, 5);
    }
  });

  test("cubicBezier matches linear when its controls are", () => {
    const linear = cubicBezier(1 / 3, 1 / 3, 2 / 3, 2 / 3);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(linear(t)).toBeCloseTo(t, 2);
    }
  });

  test("cubicBezier clamps outside the unit interval", () => {
    const ease = cubicBezier(0.4, 0, 0.2, 1);
    expect(ease(-1)).toBe(0);
    expect(ease(2)).toBe(1);
    expect(ease(0.5)).toBeGreaterThan(0);
    expect(ease(0.5)).toBeLessThan(1);
  });
});

describe("tween", () => {
  test("starts at the source value and arrives at the target", async () => {
    const target = signal(0);
    const dispose = root((d) => {
      const value = tween(target, { duration: 60, easing: easing.linear });
      expect(value()).toBe(0);
      target.set(100);
      flush();
      return [d, value] as const;
    });

    // It moves off the start before it reaches the target, which is the whole
    // claim; how far it has moved at any wall-clock moment is not.
    await eventually(() => dispose[1]() > 0, "the tween to leave its start");
    expect(dispose[1]()).toBeLessThanOrEqual(100);

    await eventually(() => dispose[1]() === 100, "the tween to arrive");
    dispose[0]();
  });

  test("retargets from where it is", async () => {
    const target = signal(0);
    const dispose = root((d) => {
      const value = tween(target, { duration: 60, easing: easing.linear });
      target.set(100);
      flush();
      return [d, value] as const;
    });

    await eventually(() => dispose[1]() > 0, "the tween to leave its start");
    target.set(0);
    flush();
    await eventually(() => dispose[1]() === 0, "the retargeted tween to arrive");
    dispose[0]();
  });

  test("animates a list of numbers together", async () => {
    const target = signal<readonly number[]>([0, 10]);
    const dispose = root((d) => {
      const value = tween(target, { duration: 40, easing: easing.linear });
      target.set([100, 110]);
      flush();
      return [d, value] as const;
    });
    await eventually(
      () => JSON.stringify(dispose[1]()) === "[100,110]",
      "the list tween to arrive",
    );
    dispose[0]();
  });

  test("stops with its owner", async () => {
    const target = signal(0);
    let value!: () => number;
    const dispose = root((d) => {
      value = tween(target, { duration: 60, easing: easing.linear });
      target.set(100);
      flush();
      return d;
    });
    dispose();
    const frozen = value();
    await sleep(120);
    expect(value(), "a disposed tween kept animating").toBe(frozen);
  });
});

describe("spring", () => {
  test("settles on the target", async () => {
    const target = signal(0);
    const dispose = root((d) => {
      const value = spring(target, { stiffness: 0.3, damping: 0.6 });
      expect(value()).toBe(0);
      target.set(50);
      flush();
      return [d, value] as const;
    });

    await eventually(() => dispose[1]() === 50, "the spring to settle", 3000);
    dispose[0]();
  });

  test("settles on a list target", async () => {
    const target = signal<readonly number[]>([0, 0]);
    const dispose = root((d) => {
      const value = spring(target, { stiffness: 0.3, damping: 0.6 });
      target.set([10, 20]);
      flush();
      return [d, value] as const;
    });
    await eventually(
      () => JSON.stringify(dispose[1]()) === "[10,20]",
      "the list spring to settle",
      3000,
    );
    dispose[0]();
  });

  test("stops its loop once settled", async () => {
    const target = signal(0);
    const dispose = root((d) => {
      const value = spring(target, { stiffness: 0.4, damping: 0.5 });
      target.set(1);
      flush();
      return [d, value] as const;
    });
    await eventually(() => dispose[1]() === 1, "the spring to settle", 3000);
    const settled = dispose[1]();
    await sleep(120);
    expect(dispose[1](), "the loop kept running after settling").toBe(settled);
    dispose[0]();
  });
});
