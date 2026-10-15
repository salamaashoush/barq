import { type JSXElement, cell, createContext, provide, read } from "@barqjs/core";

export interface QueryErrorResetBoundaryValue {
  /** Forget the reset, once the queries below have been given their retry. */
  clearReset: () => void;
  /** Whether `reset` has been called and not yet used. */
  isReset: () => boolean;
  /** Let every failed query below fetch again the next time it is built. */
  reset: () => void;
}

const RETRIES = new WeakMap<QueryErrorResetBoundaryValue, Set<() => void>>();

function createValue(): QueryErrorResetBoundaryValue {
  let isReset = false;
  const retries = new Set<() => void>();
  const value: QueryErrorResetBoundaryValue = {
    clearReset: () => {
      isReset = false;
    },
    reset: () => {
      isReset = true;
      for (const retry of retries) retry();
    },
    isReset: () => isReset,
  };
  RETRIES.set(value, retries);
  return value;
}

/**
 * Have `retry` run when the boundary is reset, until the returned function is
 * called.
 *
 * An `Errored` boundary's own reset asks the failed reads again where they
 * stand; it does not build the tree a second time. So there is no remount for
 * a failed query to notice the reset on, and the boundary tells it directly.
 */
export function retriedBy(boundary: QueryErrorResetBoundaryValue, retry: () => void): () => void {
  const retries = RETRIES.get(boundary);
  retries?.add(retry);
  return () => {
    retries?.delete(retry);
  };
}

const BOUNDARY = createContext<QueryErrorResetBoundaryValue>(
  undefined,
  "barq-query-error-reset-boundary",
);

// With no boundary above, nothing can ask for the retry, so nothing gets one.
const UNBOUNDED = createValue();

export function useQueryErrorResetBoundary(): QueryErrorResetBoundaryValue {
  try {
    return read(BOUNDARY)();
  } catch {
    return UNBOUNDED;
  }
}

export interface QueryErrorResetBoundaryProps {
  children?: ((value: QueryErrorResetBoundaryValue) => JSXElement) | JSXElement;
}

/**
 * The retry half of an `Errored` boundary.
 *
 * `Errored`'s reset asks what failed below it again, and a query that failed
 * is still failed in the cache, so asking it again throws the same error
 * straight back. `reset()` is what tells the queries below to fetch instead,
 * so a fallback's retry button calls it before it calls the boundary's own
 * reset.
 */
export const QueryErrorResetBoundary = ((props: { children?: unknown }): unknown => {
  const value = createValue();
  return provide(BOUNDARY, cell(value), () => {
    const children = props.children;
    if (typeof children !== "function") return children;
    const made = (children as (value?: QueryErrorResetBoundaryValue) => unknown)(value);
    // A render-prop child arrives through the slot's own thunk.
    return typeof made === "function"
      ? (made as (value: QueryErrorResetBoundaryValue) => unknown)(value)
      : made;
  });
}) as unknown as (props: QueryErrorResetBoundaryProps) => JSXElement;
