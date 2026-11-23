import {
  NotReadyError,
  createEffect,
  createMemo,
  createRoot,
  onCleanup,
  runWithOwner,
  untrack,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";

export interface ServerAnswer<T> {
  /** The server's answer was on the page and is in hand. */
  readonly seeded: boolean;
  /** The server's answer is still on its way down the stream. */
  readonly arriving: boolean;
  /** The answer, parking the reader until it is known. `undefined` when no server answered. */
  read(): T | undefined;
  /** Run `fn` once an arriving answer has landed, or has been given up on. */
  landed(fn: (answer: T | undefined) => void): void;
}

/**
 * A live query's first result, as a value that crosses a server render.
 *
 * On the server `flight` preloads the query and captures the rows it rendered;
 * the memo is what a `Loading` boundary parks on, what `renderPage` waits for,
 * and what the seed payload records. In the browser the same declaration finds
 * that record instead of running: settled on a buffered page, a promise on a
 * streamed one.
 *
 * The memo is declared on both sides whether or not anything crosses, because
 * a seed is found by the position of its declaration: a side that skipped it
 * would move every async value declared after it.
 */
export function serverAnswer<T>(
  name: string,
  flight: () => Promise<T> | undefined,
): ServerAnswer<T> {
  let asked = false;
  const memo = createMemo<T | undefined>(
    () => {
      asked = true;
      return isServer ? flight() : undefined;
    },
    { name },
  );

  let answer: T | undefined;
  let arriving = false;
  if (!asked) {
    // Outside every owner: a pending read made under the component being built
    // would park that component on a value it has not asked to wait for.
    runWithOwner(null, () => {
      try {
        answer = untrack(memo);
      } catch (error) {
        if (!(error instanceof NotReadyError)) throw error;
        arriving = true;
      }
    });
  }

  return {
    seeded: answer !== undefined,
    arriving,
    read: () => memo(),
    landed(fn) {
      if (!arriving || isServer) return;
      const stop = runWithOwner(null, () =>
        createRoot((dispose) => {
          createEffect(memo, {
            effect: (value) => fn(value),
            // The server's preload failed after the shell had gone. This side
            // runs the query for itself.
            error: () => fn(undefined),
          });
          return dispose;
        }),
      );
      onCleanup(stop);
    },
  };
}
