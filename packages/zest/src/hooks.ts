/**
 * Core hooks - essential reactive primitives
 */

import { type Resource, resource } from "./async.ts";
import { type Computed, computed, effect, signal } from "./signals.ts";

/**
 * Create a reactive signal for primitive values
 */
export function useState<T>(initial: T): [() => T, (value: T | ((prev: T) => T)) => void] {
  const s = signal(initial);

  const setter = (value: T | ((prev: T) => T)) => {
    if (typeof value === "function") {
      s.update(value as (prev: T) => T);
    } else {
      s.set(value);
    }
  };

  return [() => s(), setter];
}

/**
 * Create a computed/memoized value
 */
export function useMemo<T>(fn: () => T): Computed<T> {
  return computed(fn);
}

/**
 * Run a side effect when dependencies change
 */
export function useEffect(fn: () => void | (() => void)): () => void {
  return effect(fn);
}

/**
 * Create a resource for async data loading with reactive source
 */
export function useResource<T, S = unknown>(
  source: () => S,
  fetcher: (source: S, info: { prev?: T; refetching: boolean }) => Promise<T>,
): Resource<T> {
  return resource(source, fetcher);
}
