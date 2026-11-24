export interface Throttled<Args extends unknown[]> {
  (...args: Args): void;
  /** Drops the trailing call. */
  cancel(): void;
  /** Runs the trailing call now, if there is one. */
  flush(): void;
}

/**
 * lodash's `throttle`: runs at most once per `wait`, on the leading edge
 * and with the latest arguments on the trailing one, as Excalidraw's
 * collaboration paces its broadcasts.
 */
export const throttle = <Args extends unknown[]>(
  fn: (...args: Args) => unknown,
  wait: number,
  { leading = true, trailing = true }: { leading?: boolean; trailing?: boolean } = {},
): Throttled<Args> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Args | null = null;
  const run = (args: Args): void => {
    void fn(...args);
  };

  // a pending trailing call does not keep a server or a test runner alive
  const schedule = (): ReturnType<typeof setTimeout> => {
    const handle = setTimeout(onTimer, wait);
    (handle as { unref?: () => void }).unref?.();
    return handle;
  };

  const onTimer = (): void => {
    timer = null;
    if (trailing && pending) {
      const args = pending;
      pending = null;
      run(args);
      timer = schedule();
    } else {
      pending = null;
    }
  };

  const throttled = (...args: Args): void => {
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
  };

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
};
