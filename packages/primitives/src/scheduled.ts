import { type Accessor, isServer, isTracking, signal } from "@barqjs/core";
import { type Clear, noop, tryCleanup } from "./utils.ts";

/** A callback whose invocation is deferred, with the deferral under your control. */
export interface Scheduled<Args extends unknown[]> {
  (...args: Args): void;
  /** Drop a pending call. */
  clear: Clear;
  /** Run a pending call now, with the arguments it is holding. */
  flush: Clear;
  /** Whether a call is waiting to run. */
  pending: () => boolean;
}

/** The shape {@link debounce}, {@link throttle} and {@link scheduleIdle} share. */
export type Schedule = <Args extends unknown[]>(
  callback: (...args: Args) => void,
  wait?: number,
) => Scheduled<Args>;

function inert<Args extends unknown[]>(): Scheduled<Args> {
  return Object.assign(noop as (...args: Args) => void, {
    clear: noop,
    flush: noop,
    pending: () => false,
  });
}

/**
 * The server shape of a leading-edge schedule: the first call runs, every
 * later one is dropped, and nothing is ever pending — because the window it
 * would be pending on has no end.
 */
function firstCallOnly<Args extends unknown[]>(callback: (...args: Args) => void): Scheduled<Args> {
  let spent = false;
  const call = ((...args: Args) => {
    if (spent) return;
    spent = true;
    callback(...args);
  }) as Scheduled<Args>;
  call.clear = () => {
    spent = false;
  };
  call.flush = noop;
  call.pending = () => false;
  return call;
}

/**
 * A callback that runs on the trailing edge, `wait` milliseconds after the last
 * call. Cleared when the owning scope disposes.
 *
 * On the server the returned callback does nothing: a string render has no
 * later tick to run it on, and a timer left armed keeps the process awake.
 */
export const debounce: Schedule = <Args extends unknown[]>(
  callback: (...args: Args) => void,
  wait?: number,
): Scheduled<Args> => {
  if (isServer) return inert<Args>();

  let id: ReturnType<typeof setTimeout> | undefined;
  let held: Args | undefined;

  const run = (): void => {
    id = undefined;
    const args = held as Args;
    held = undefined;
    callback(...args);
  };

  const call = ((...args: Args) => {
    held = args;
    if (id !== undefined) clearTimeout(id);
    id = setTimeout(run, wait);
  }) as Scheduled<Args>;

  call.clear = () => {
    if (id === undefined) return;
    clearTimeout(id);
    id = undefined;
    held = undefined;
  };
  call.flush = () => {
    if (id === undefined) return;
    clearTimeout(id);
    run();
  };
  call.pending = () => id !== undefined;

  tryCleanup(call.clear);
  return call;
};

/**
 * A callback that runs at most once per `wait` milliseconds, on the trailing
 * edge, with the arguments of the most recent call in the window.
 */
export const throttle: Schedule = <Args extends unknown[]>(
  callback: (...args: Args) => void,
  wait?: number,
): Scheduled<Args> => {
  if (isServer) return inert<Args>();

  let id: ReturnType<typeof setTimeout> | undefined;
  let held: Args | undefined;

  const run = (): void => {
    id = undefined;
    const args = held as Args;
    held = undefined;
    callback(...args);
  };

  const call = ((...args: Args) => {
    held = args;
    if (id !== undefined) return;
    id = setTimeout(run, wait);
  }) as Scheduled<Args>;

  call.clear = () => {
    if (id === undefined) return;
    clearTimeout(id);
    id = undefined;
    held = undefined;
  };
  call.flush = () => {
    if (id === undefined) return;
    clearTimeout(id);
    run();
  };
  call.pending = () => id !== undefined;

  tryCleanup(call.clear);
  return call;
};

const hasIdleCallback = typeof requestIdleCallback === "function";

/**
 * A callback deferred to the browser's idle time, with `wait` as the deadline
 * past which it runs anyway.
 *
 * Falls back to {@link throttle} where `requestIdleCallback` is missing, which
 * as of 2026 is Safari.
 */
export const scheduleIdle: Schedule = <Args extends unknown[]>(
  callback: (...args: Args) => void,
  wait?: number,
): Scheduled<Args> => {
  if (isServer) return inert<Args>();
  if (!hasIdleCallback) return throttle(callback, wait);

  let id: ReturnType<typeof requestIdleCallback> | undefined;
  let held: Args | undefined;

  const run = (): void => {
    id = undefined;
    const args = held as Args;
    held = undefined;
    callback(...args);
  };

  const call = ((...args: Args) => {
    held = args;
    if (id !== undefined) return;
    id = requestIdleCallback(run, { timeout: wait });
  }) as Scheduled<Args>;

  call.clear = () => {
    if (id === undefined) return;
    cancelIdleCallback(id);
    id = undefined;
    held = undefined;
  };
  call.flush = () => {
    if (id === undefined) return;
    cancelIdleCallback(id);
    run();
  };
  call.pending = () => id !== undefined;

  tryCleanup(call.clear);
  return call;
};

/**
 * Turn a trailing-edge schedule into a leading-edge one: the first call runs
 * immediately and the rest of the window is swallowed.
 */
export function leading<Args extends unknown[]>(
  schedule: Schedule,
  callback: (...args: Args) => void,
  wait?: number,
): Scheduled<Args> {
  // The one schedule that is NOT inert on the server, and deliberately: the
  // leading edge is "now", which is a moment a string render has. What it does
  // not have is the end of the window, so the first call runs and the rest are
  // swallowed for good.
  if (isServer) return firstCallOnly(callback);

  let waiting = false;
  const window_ = schedule<[]>(() => {
    waiting = false;
  }, wait);

  const call = ((...args: Args) => {
    if (!waiting) callback(...args);
    waiting = true;
    window_();
  }) as Scheduled<Args>;

  call.clear = () => {
    waiting = false;
    window_.clear();
  };
  // Nothing is held back, so there is never a call to force; closing the window
  // early is the useful meaning of "get it over with".
  call.flush = call.clear;
  call.pending = () => waiting;

  tryCleanup(call.clear);
  return call;
}

/**
 * Leading edge for the first call in a window, trailing edge for the last —
 * the shape most "as you type, but respond at once" fields want.
 */
export function leadingAndTrailing<Args extends unknown[]>(
  schedule: Schedule,
  callback: (...args: Args) => void,
  wait?: number,
): Scheduled<Args> {
  // Leading only on the server, for the reason {@link leading} gives: the
  // trailing edge is a moment that never arrives there.
  if (isServer) return firstCallOnly(callback);

  // 0 idle, 1 ran on the leading edge, 2 called again since
  let state = 0;

  const window_ = schedule<[Args]>((args) => {
    if (state === 2) callback(...args);
    state = 0;
  }, wait);

  const call = ((...args: Args) => {
    if (state !== 2) {
      if (state === 0) callback(...args);
      state++;
    }
    window_(args);
  }) as Scheduled<Args>;

  call.clear = () => {
    state = 0;
    window_.clear();
  };
  call.flush = () => {
    window_.flush();
  };
  call.pending = () => state === 2;

  tryCleanup(call.clear);
  return call;
}

/**
 * A tracked boolean that reads `false` until `schedule` lets it through, so a
 * computation can rate-limit itself while still depending on everything it
 * reads.
 *
 * ```ts
 * const settled = scheduled((fire) => debounce(fire, 250));
 * effect(() => {
 *   const q = query();
 *   if (settled()) search(q);
 * });
 * ```
 *
 * The subscriber count is what keeps two readers in one flush agreeing: the
 * flag stays raised while anyone is still tracking it and falls on the run that
 * re-arms it.
 */
export function scheduled(schedule: (fire: Clear) => Clear): Accessor<boolean> {
  let listeners = 0;
  let dirty = false;
  const version = signal(0, { equals: false });
  const fire = schedule(() => {
    dirty = true;
    version.set(0);
  });

  return () => {
    if (!dirty) {
      fire();
      version();
    }

    if (dirty) {
      dirty = listeners > 0;
      return true;
    }

    if (isTracking()) {
      listeners++;
      tryCleanup(() => listeners--);
    }
    return false;
  };
}
