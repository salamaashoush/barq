import { flush } from "@barqjs/core";
import { jest } from "bun:test";

export { fakeClock, realClock } from "../../testing/src/test-clock.ts";

/** A wait inside a query or mutation function, driven by whichever clock is installed. */
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// `setImmediate` is the one timer fake timers leave real, and it fires once the
// microtask queue is empty.
const immediate = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

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
