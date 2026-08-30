import { type Accessor, renderEffect, scope, untrack } from "@barqjs/core";
import { type Clear, tryCleanup } from "./utils.ts";

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * A promise that resolves the first time `condition` reads truthy.
 *
 * Resolves synchronously if it is already true, so `await until(ready)` in a
 * hot path costs one microtask rather than a subscription. The subscription is
 * torn down on resolve and when the owning scope disposes, and it is
 * cancellable through the `cancel` on the returned promise.
 *
 * ```ts
 * const user = await until(currentUser);
 * ```
 */
export function until<T>(condition: Accessor<T>): Promise<NonNullable<T>> & { cancel: Clear } {
  let cancel: Clear = () => {};

  const promise = new Promise<NonNullable<T>>((resolve, reject) => {
    const initial = untrack(condition);
    if (initial) {
      resolve(initial);
      return;
    }

    const dispose = scope((disposeScope) => {
      let settled = false;
      renderEffect(() => {
        const value = condition();
        if (settled || !value) return;
        settled = true;
        resolve(value);
        // Deferred: the effect is mid-run, so tearing its own scope down here
        // would unlink the node the runtime is still holding.
        queueMicrotask(disposeScope);
      });
      return disposeScope;
    });

    cancel = () => {
      dispose();
      reject(new Error("until() was cancelled"));
    };
    tryCleanup(cancel);
  });

  // Nothing else is going to attach a handler if the caller cancels and walks
  // away, and an unhandled rejection would be reported as a crash.
  promise.catch(() => {});
  return Object.assign(promise, { cancel });
}

/** Reject with a {@link TimeoutError} if `promise` has not settled within `ms`. */
export function raceTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** A promise that resolves after `ms`, cleared with the owning scope. */
export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    tryCleanup(() => clearTimeout(timer));
  });
}

/**
 * An `AbortSignal` that fires when the owning scope disposes.
 *
 * The reason a component's `fetch` should take one: unmount the component and
 * the request is cancelled rather than resolving into a scope nobody is
 * listening to.
 */
export function abortOnCleanup(): AbortSignal {
  const controller = new AbortController();
  tryCleanup(() => controller.abort(new Error("the owning scope was disposed")));
  return controller.signal;
}
