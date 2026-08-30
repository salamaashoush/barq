import { describe, expect, test } from "bun:test";
import { flush, root, signal } from "@barqjs/core";
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
    const dispose = root((d) => {
      timeout(() => calls++, 10);
      return d;
    });
    await eventually(() => calls === 1, "the timeout to fire");
    await sleep(40);
    expect(calls, "the timeout fired more than once").toBe(1);
    dispose();
  });

  test("a null delay holds it, and a number releases it", async () => {
    const delay = signal<number | null>(null);
    let calls = 0;
    const dispose = root((d) => {
      timeout(() => calls++, delay);
      return d;
    });
    await sleep(20);
    expect(calls).toBe(0);
    delay.set(10);
    flush();
    await eventually(() => calls === 1, "the released timeout to fire");
    dispose();
  });

  test("disposing before the deadline cancels it", async () => {
    let calls = 0;
    const dispose = root((d) => {
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
    const dispose = root((d) => {
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
    const period = signal(1000);
    let calls = 0;
    const dispose = root((d) => {
      interval(() => calls++, period);
      return d;
    });
    await sleep(20);
    expect(calls).toBe(0);
    period.set(10);
    flush();
    await eventually(() => calls >= 2, "two ticks at the shortened period");
    dispose();
  });
});

describe("now / elapsed", () => {
  test("now advances on its own period", async () => {
    const dispose = root((d) => {
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

  test("elapsed counts from the call", async () => {
    const dispose = root((d) => {
      const since = elapsed(10);
      expect(since()).toBeLessThan(5);
      return [d, since] as const;
    });
    await eventually(() => {
      flush();
      return dispose[1]() >= 20;
    }, "20ms of elapsed time to be sampled");
    dispose[0]();
  });
});
