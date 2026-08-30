import { type Accessor, isServer, renderEffect, scope, signal } from "@barqjs/core";
import { type Clear, type MaybeAccessor, access, noop } from "./utils.ts";

/** A delay of `null` or `false` means "not running". */
export type Delay = MaybeAccessor<number | null | false>;

/**
 * `setTimeout` tied to the owning scope, with a delay that may be reactive.
 *
 * Changing the delay restarts the wait from zero; `null` or `false` cancels it
 * until a number comes back.
 *
 * Inert on the server, like every schedule in this package: a string render is
 * a snapshot, so nothing a timer does afterwards can reach it, and an armed
 * timer keeps the process awake for no reason. To await a delay in server code
 * — where the point is the waiting, not the scheduling — use `sleep`.
 */
export function timeout(fn: () => void, delay: Delay = 0): Clear {
  if (isServer) return noop;
  return scope((dispose) => {
    renderEffect(() => {
      const ms = access(delay);
      if (ms === null || ms === false) return undefined;
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    });
    return dispose;
  });
}

/**
 * `setInterval` tied to the owning scope, with a period that may be reactive.
 *
 * Changing the period restarts the cycle, so the next tick is a full period
 * away rather than whatever was left of the old one.
 *
 * Inert on the server, for the reason {@link timeout} gives.
 */
export function interval(fn: () => void, delay: Delay): Clear {
  if (isServer) return noop;
  return scope((dispose) => {
    renderEffect(() => {
      const ms = access(delay);
      if (ms === null || ms === false) return undefined;
      const id = setInterval(fn, ms);
      return () => clearInterval(id);
    });
    return dispose;
  });
}

/**
 * The wall clock, as a signal that reads `Date.now()` and updates every
 * `period` milliseconds.
 *
 * This is what a "3 minutes ago" label should depend on: one timer for the
 * page instead of one per label, and a period you can widen as the timestamp
 * gets older. On the server it reads the render's own clock and never moves.
 */
export function now(period: Delay = 1000): Accessor<number> {
  const time = signal(Date.now());
  interval(() => time.set(Date.now()), period);
  return time;
}

/** Milliseconds since this call, sampled every `period` milliseconds. */
export function elapsed(period: Delay = 1000): Accessor<number> {
  const start = Date.now();
  const time = now(period);
  return () => time() - start;
}
