/**
 * A registered symbol, so a brand put on an error by one copy of this module is
 * read by another: a server bundle and the package it inlined can both be in a
 * process.
 */
export const SAFE_ERROR: unique symbol = Symbol.for("barq.safe-error") as never;

/**
 * Let `error` reach the browser as it was thrown, in a production build too.
 *
 * A production server replaces every error it sends to the client with a
 * generic one, because a message can name a table, a host or a path. An error
 * written for the user to read is the exception, and this says so. Returns the
 * same value, for `throw markSafeError(new Error("..."))`.
 */
export function markSafeError<E>(error: E): E {
  if (error !== null && (typeof error === "object" || typeof error === "function")) {
    Object.defineProperty(error, SAFE_ERROR, {
      value: true,
      enumerable: false,
      configurable: true,
    });
  }
  return error;
}

export function isSafeError(value: unknown): boolean {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    (value as { [SAFE_ERROR]?: unknown })[SAFE_ERROR] === true
  );
}
