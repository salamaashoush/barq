export interface Throttled<Args extends unknown[]> {
  (...args: Args): void;
  /** Drops the trailing call. */
  cancel(): void;
  /** Runs the trailing call now, if there is one. */
  flush(): void;
}

export interface ThrottleOptions {
  leading?: boolean;
  trailing?: boolean;
}

interface UnrefHandle {
  unref?: () => void;
}

/**
 * lodash's `throttle`: runs at most once per `wait`, on the leading edge
 * and with the latest arguments on the trailing one, as Excalidraw's
 * collaboration paces its broadcasts.
 */
export function throttle<Args extends unknown[]>(
  fn: (...args: Args) => unknown,
  wait: number,
  { leading = true, trailing = true }: ThrottleOptions = {},
): Throttled<Args> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Args | null = null;
  function run(args: Args): void {
    void fn(...args);
  }

  // a pending trailing call does not keep a server or a test runner alive
  function schedule(): ReturnType<typeof setTimeout> {
    const handle = setTimeout(onTimer, wait);
    (handle as UnrefHandle).unref?.();
    return handle;
  }

  function onTimer(): void {
    timer = null;
    if (trailing && pending) {
      const args = pending;
      pending = null;
      run(args);
      timer = schedule();
    } else {
      pending = null;
    }
  }

  function throttled(...args: Args): void {
    if (timer === null) {
      if (leading) {
        run(args);
      } else {
        pending = args;
      }
      timer = schedule();
      return;
    }
    pending = args;
  }

  throttled.cancel = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  throttled.flush = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (pending) {
      const args = pending;
      pending = null;
      run(args);
    }
  };

  return throttled;
}
