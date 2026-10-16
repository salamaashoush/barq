import { describe, expect, jest, test } from "bun:test";
import { flush, createRoot, createSignal } from "@barqjs/core";
import { elapsed, interval, now, timeout } from "./timer.ts";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Wait for a condition rather than a duration; a loaded machine fires timers late. */
async function eventually(predicate: () => boolean, what: string, deadline = 2000): Promise<void> {
  const until = Date.now() + deadline;
  while (Date.now() < until) {
    if (predicate()) return;
    await sleep(5);
  }
  throw new Error(`timed out after ${deadline}ms waiting for ${what}`);
}

describe("timeout", () => {
  test("runs once and stops with its owner", async () => {
    let calls = 0;
    const dispose = createRoot((d) => {
      timeout(() => calls++, 10);
      return d;
    });
    await eventually(() => calls === 1, "the timeout to fire");
    await sleep(40);
    expect(calls, "the timeout fired more than once").toBe(1);
    dispose();
  });

  test("a null delay holds it, and a number releases it", async () => {
    const [delay, setDelay] = createSignal<number | null>(null);
    let calls = 0;
    const dispose = createRoot((d) => {
      timeout(() => calls++, delay);
      return d;
    });
    await sleep(20);
    expect(calls).toBe(0);
    setDelay(10);
    flush();
    await eventually(() => calls === 1, "the released timeout to fire");
    dispose();
  });

  test("disposing before the deadline cancels it", async () => {
    let calls = 0;
    const dispose = createRoot((d) => {
      timeout(() => calls++, 20);
      return d;
    });
    dispose();
    await sleep(40);
    expect(calls).toBe(0);
  });

  test("the returned function cancels it", async () => {
    let calls = 0;
    const clear = timeout(() => calls++, 20);
    clear();
    await sleep(40);
    expect(calls).toBe(0);
  });
});

describe("interval", () => {
  test("ticks repeatedly and stops with its owner", async () => {
    let calls = 0;
    const dispose = createRoot((d) => {
      interval(() => calls++, 10);
      return d;
    });
    await eventually(() => calls >= 3, "three ticks");
    dispose();
    const seen = calls;
    await sleep(50);
    expect(calls, "the interval kept ticking after its owner disposed").toBe(seen);
  });

  test("changing the period restarts the cycle", async () => {
    const [period, setPeriod] = createSignal(1000);
    let calls = 0;
    const dispose = createRoot((d) => {
      interval(() => calls++, period);
      return d;
    });
    await sleep(20);
    expect(calls).toBe(0);
    setPeriod(10);
    flush();
    await eventually(() => calls >= 2, "two ticks at the shortened period");
    dispose();
  });
});

describe("now / elapsed", () => {
  test("now advances on its own period", async () => {
    const dispose = createRoot((d) => {
      const time = now(10);
      const first = time();
      return [d, time, first] as const;
    });
    await eventually(() => {
      flush();
      return dispose[1]() > dispose[2];
    }, "the clock to advance");
    dispose[0]();
  });

  test("elapsed counts from the call", () => {
    jest.useFakeTimers();
    try {
      const [dispose, since] = createRoot((d) => [d, elapsed(10)] as const);
      expect(since()).toBe(0);
      jest.advanceTimersByTime(25);
      flush();
      expect(since(), "sampled at 10 and 20, not read live").toBe(20);
      dispose();
    } finally {
      jest.useRealTimers();
    }
  });
});
