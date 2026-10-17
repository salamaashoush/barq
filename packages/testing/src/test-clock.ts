import { jest } from "bun:test";

/**
 * Installs the fake clock.
 *
 * happy-dom folds every zero-delay timeout into one native timer. One left
 * pending on the real clock would collect the zero-delay timeouts made under the
 * fake one, where advancing it never reaches them, so it is let fire first.
 */
export async function fakeClock(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  jest.useFakeTimers();
}

/**
 * Runs out the fake clock, then puts the real one back.
 *
 * A zero-delay timeout still pending on the fake clock is dropped with it, and
 * happy-dom's shared timer would then never fire again, taking every later
 * zero-delay timeout in the file with it. bun's `runAllTimers` cannot stand in:
 * it runs no microtasks between timers, so a timer a promise schedules is never
 * reached. `setImmediate` is the one timer fake timers leave real, and it fires
 * once the microtask queue is empty.
 */
export async function realClock(): Promise<void> {
  if (!jest.isFakeTimers()) return;
  for (let round = 0; jest.getTimerCount() > 0; round++) {
    if (round === 100) {
      throw new Error(`${jest.getTimerCount()} timers still pending: something was left running`);
    }
    jest.runOnlyPendingTimers();
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  jest.useRealTimers();
}
