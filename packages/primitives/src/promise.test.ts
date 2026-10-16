import { describe, expect, jest, test } from "bun:test";
import { flush, createRoot, createSignal } from "@barqjs/core";
import { TimeoutError, abortOnCleanup, raceTimeout, sleep, until } from "./promise.ts";

describe("until", () => {
  test("resolves at once when the condition is already true", async () => {
    const [ready] = createSignal("value");
    await expect(until(ready)).resolves.toBe("value");
  });

  test("waits for the condition", async () => {
    const [ready, setReady] = createSignal<string | null>(null);
    const dispose = createRoot((d) => {
      const promise = until(ready);
      return [d, promise] as const;
    });
    setReady("here");
    flush();
    await expect(dispose[1]).resolves.toBe("here");
    dispose[0]();
  });

  test("skips a falsy value on the way", async () => {
    const [ready, setReady] = createSignal<number>(0);
    const promise = createRoot(() => until(ready));
    setReady(0);
    flush();
    setReady(5);
    flush();
    await expect(promise).resolves.toBe(5);
  });

  test("cancel rejects", async () => {
    const [ready] = createSignal(false);
    const promise = until(ready);
    promise.cancel();
    await expect(promise).rejects.toThrow("cancelled");
  });

  test("stops watching once resolved", async () => {
    const [ready, setReady] = createSignal(0);
    let reads = 0;
    const promise = until(() => {
      reads++;
      return ready();
    });
    setReady(1);
    flush();
    await promise;
    const seen = reads;
    setReady(2);
    flush();
    await Promise.resolve();
    expect(reads).toBe(seen);
  });
});

describe("raceTimeout", () => {
  test("passes a value through", async () => {
    await expect(raceTimeout(Promise.resolve(1), 50)).resolves.toBe(1);
  });

  test("rejects with a TimeoutError", async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 100));
    await expect(raceTimeout(slow, 10)).rejects.toBeInstanceOf(TimeoutError);
  });

  test("passes a rejection through", async () => {
    await expect(raceTimeout(Promise.reject(new Error("nope")), 50)).rejects.toThrow("nope");
  });
});

describe("sleep", () => {
  test("resolves after the delay", async () => {
    jest.useFakeTimers();
    try {
      let resolved = false;
      void sleep(20).then(() => (resolved = true));
      jest.advanceTimersByTime(19);
      await Promise.resolve();
      expect(resolved).toBe(false);
      jest.advanceTimersByTime(1);
      await Promise.resolve();
      expect(resolved).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test("is cancelled with its owner, and never resolves after that", async () => {
    let resolved = false;
    const dispose = createRoot((d) => {
      void sleep(20).then(() => (resolved = true));
      return d;
    });
    dispose();
    await new Promise((r) => setTimeout(r, 50));
    expect(resolved).toBe(false);
  });
});

describe("abortOnCleanup", () => {
  test("aborts when the scope disposes", () => {
    const dispose = createRoot((d) => {
      const abort = abortOnCleanup();
      expect(abort.aborted).toBe(false);
      return [d, abort] as const;
    });
    dispose[0]();
    expect(dispose[1].aborted).toBe(true);
  });
});
