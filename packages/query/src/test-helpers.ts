import { flush } from "@barqjs/core";
import { jest } from "bun:test";

/** A wait inside a query or mutation function, driven by whichever clock is installed. */
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// `setImmediate` is the one timer fake timers leave real, and it fires once the
// microtask queue is empty.
const immediate = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

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
 * zero-delay timeout in the file with it.
 */
export async function realClock(): Promise<void> {
  if (!jest.isFakeTimers()) return;
  for (let round = 0; jest.getTimerCount() > 0; round++) {
    if (round === 100) {
      throw new Error(`${jest.getTimerCount()} timers still pending: something was left running`);
    }
    jest.runOnlyPendingTimers();
    await immediate();
  }
  jest.useRealTimers();
}

/** Every queued microtask, then the DOM. */
export async function drain(): Promise<void> {
  await immediate();
  flush();
}

/**
 * `ms` of fake time, a millisecond at a time, with the microtasks each step
 * started run before the next, then applies what they wrote.
 */
export async function elapse(ms: number): Promise<void> {
  for (let step = 0; step < ms; step++) {
    jest.advanceTimersByTime(1);
    await immediate();
  }
  flush();
}
