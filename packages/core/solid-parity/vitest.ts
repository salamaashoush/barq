/**
 * vitest surface on bun:test, so a ported Solid test needs no edit beyond its
 * import specifier. chai's `.to` chain is rewritten away by `port.ts`.
 */
import { jest, mock, spyOn } from "bun:test";

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test } from "bun:test";

export const vi = {
  fn: mock,
  spyOn,
  restoreAllMocks: () => jest.restoreAllMocks(),
  clearAllMocks: () => jest.clearAllMocks(),
  useFakeTimers: () => jest.useFakeTimers(),
  useRealTimers: () => jest.useRealTimers(),
  advanceTimersByTime: (ms: number) => jest.advanceTimersByTime(ms),
  advanceTimersByTimeAsync: async (ms: number) => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  },
};

/** Solid's bench files are ported for shape only; the harness does not measure. */
export function bench(_name: string, _fn: () => unknown, _options?: unknown): void {}
