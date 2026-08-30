import { type Accessor, isServer, signal, untrack } from "@barqjs/core";
import { type Clear, type MaybeAccessor, access, tryCleanup } from "./utils.ts";

export interface Loop {
  /** Begin requesting frames. Calling it while running does nothing. */
  start: Clear;
  /** Stop requesting frames. The next `start` resumes with a fresh timestamp. */
  stop: Clear;
  running: Accessor<boolean>;
}

/**
 * An animation-frame loop that stops with its owner.
 *
 * `callback` receives the frame timestamp. With `fps` set, frames are dropped
 * to hold that rate: the loop still runs every frame, because that is the only
 * way to stay aligned with the display, but the callback is called only when
 * the budget has elapsed.
 *
 * The loop does not start on its own — call `start`, which keeps a hidden tab
 * from queueing work nobody asked for.
 */
export function raf(callback: (timestamp: number) => void, rate?: MaybeAccessor<number>): Loop {
  if (isServer) {
    return { start: () => {}, stop: () => {}, running: () => false };
  }

  const running = signal(false);
  let id = 0;
  let previous = 0;

  const frame = (timestamp: number): void => {
    id = requestAnimationFrame(frame);
    const limit = rate === undefined ? undefined : access(rate);
    if (limit !== undefined && limit > 0) {
      const budget = 1000 / limit;
      // Carrying the remainder rather than resetting to `timestamp` keeps the
      // long-run rate honest; resetting loses the overshoot on every frame and
      // drifts slow.
      if (timestamp - previous < budget) return;
      previous = timestamp - ((timestamp - previous) % budget);
    }
    callback(timestamp);
  };

  const start = (): void => {
    if (untrack(running)) return;
    running.set(true);
    previous = performance.now();
    id = requestAnimationFrame(frame);
  };

  const stop = (): void => {
    if (!untrack(running)) return;
    running.set(false);
    cancelAnimationFrame(id);
    id = 0;
  };

  tryCleanup(stop);
  return { start, stop, running };
}

/**
 * Frames per second, averaged over the last `sample` frames.
 *
 * Reads 0 until the first full sample, so a caller cannot mistake the warm-up
 * for a stalled display.
 */
export function fps(sample = 10): Accessor<number> {
  const rate = signal(0);
  let frames = 0;
  let since = 0;

  const loop = raf((timestamp) => {
    if (frames === 0) {
      since = timestamp;
      frames = 1;
      return;
    }
    if (++frames <= sample) return;
    const seconds = (timestamp - since) / 1000;
    if (seconds > 0) rate.set((frames - 1) / seconds);
    frames = 0;
  });
  loop.start();

  return rate;
}
