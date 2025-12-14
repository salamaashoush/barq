/**
 * Async data loading primitives
 * Based on SolidJS createResource patterns
 */

import { computed, effect, signal, untrack } from "./signals.ts";

/**
 * Resource status - matches SolidJS states
 * - "unresolved": Initial state, no data yet
 * - "pending": First load in progress
 * - "ready": Data loaded successfully
 * - "refreshing": Refetching with existing data
 * - "errored": Error occurred
 */
export type ResourceStatus = "unresolved" | "pending" | "ready" | "refreshing" | "errored";

/**
 * Resource state - represents async data
 */
export type ResourceState<T> =
  | { status: "unresolved" }
  | { status: "pending" }
  | { status: "ready"; data: T }
  | { status: "refreshing"; data: T }
  | { status: "errored"; error: Error; data?: T };

/**
 * Resource - reactive async data container
 */
export interface Resource<T> {
  (): T | undefined;
  state: () => ResourceStatus;
  loading: () => boolean;
  error: () => Error | undefined;
  /** Returns the last successful data, undefined if never loaded */
  latest: () => T | undefined;
  refetch: () => Promise<void>;
  mutate: (data: T) => void;
}

/**
 * Create a resource for async data loading
 * Automatically refetches when source signals change
 *
 * Following SolidJS patterns:
 * 1. Memoize the source to prevent unnecessary refetches
 * 2. Use scheduled flag to prevent concurrent fetches
 * 3. Run fetcher in untracked context
 * 4. Track "refreshing" state separately from "pending"
 */
export function resource<T, S = unknown>(
  source: () => S,
  fetcher: (source: S, info: { prev?: T; refetching: boolean }) => Promise<T>,
): Resource<T> {
  const internalState = signal<ResourceState<T>>({ status: "unresolved" });
  let abortController: AbortController | null = null;
  let scheduled = false;

  // Memoize source to only trigger on actual changes (SolidJS pattern)
  const memoizedSource = computed(source);

  const load = async (refetching = false) => {
    // Prevent concurrent fetches
    if (scheduled && !refetching) return;
    scheduled = true;

    // Schedule reset of flag
    queueMicrotask(() => {
      scheduled = false;
    });

    // Abort any in-flight request
    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();

    // Get previous value without tracking
    const currentState = untrack(() => internalState());
    const prev =
      currentState.status === "ready" || currentState.status === "refreshing"
        ? currentState.data
        : currentState.status === "errored"
          ? currentState.data
          : undefined;

    // Get current source value without tracking
    const currentSource = untrack(() => memoizedSource());

    // Set pending or refreshing state based on whether we have existing data
    if (prev !== undefined) {
      internalState.set({ status: "refreshing", data: prev });
    } else {
      internalState.set({ status: "pending" });
    }

    try {
      // Run fetcher - this is async so no tracking issues
      const data = await fetcher(currentSource, {
        prev,
        refetching,
      });

      // Check if aborted
      if (abortController.signal.aborted) return;

      internalState.set({ status: "ready", data });
    } catch (err) {
      if (abortController.signal.aborted) return;
      internalState.set({
        status: "errored",
        error: err instanceof Error ? err : new Error(String(err)),
        data: prev, // Keep previous data on error
      });
    }
  };

  // Track memoized source and refetch on change
  // The memoized source ensures we only refetch when the actual value changes
  effect(() => {
    // Reading memoizedSource creates the subscription
    memoizedSource();
    // Load data (will be prevented if already scheduled)
    load(false);
  });

  const accessor = (() => {
    const s = internalState();
    if (s.status === "ready" || s.status === "refreshing") {
      return s.data;
    }
    if (s.status === "errored") {
      return s.data;
    }
    return undefined;
  }) as Resource<T>;

  accessor.state = () => internalState().status;
  accessor.loading = () => {
    const status = internalState().status;
    return status === "pending" || status === "refreshing";
  };
  accessor.error = () => {
    const s = internalState();
    return s.status === "errored" ? s.error : undefined;
  };
  accessor.latest = () => {
    const s = internalState();
    if (s.status === "ready" || s.status === "refreshing") {
      return s.data;
    }
    if (s.status === "errored") {
      return s.data;
    }
    return undefined;
  };
  accessor.refetch = () => load(true);
  accessor.mutate = (data: T) => internalState.set({ status: "ready", data });

  return accessor;
}

/**
 * Simple async resource without reactive source
 */
export function createResource<T>(fetcher: () => Promise<T>): Resource<T> {
  return resource(
    () => null,
    () => fetcher(),
  );
}

/**
 * Suspense-like wrapper for resources
 * Returns data or throws for loading/error states
 */
export function suspend<T>(resource: Resource<T>): T {
  const status = resource.state();

  if (status === "pending" || status === "unresolved") {
    throw new Promise<void>((resolve) => {
      const unsubscribe = effect(() => {
        const current = resource.state();
        if (current !== "pending" && current !== "unresolved") {
          unsubscribe();
          resolve();
        }
      });
    });
  }

  if (status === "errored") {
    const err = resource.error();
    if (err) throw err;
  }

  // Ready or refreshing - return data
  const data = resource.latest();
  if (data !== undefined) {
    return data;
  }

  throw new Error("Resource not initialized");
}

/**
 * Await multiple resources
 */
export async function awaitAll<T extends Resource<unknown>[]>(
  ...resources: T
): Promise<{ [K in keyof T]: T[K] extends Resource<infer U> ? U : never }> {
  await Promise.all(
    resources.map(
      (r) =>
        new Promise<void>((resolve) => {
          const status = r.state();
          if (status === "ready" || status === "errored") {
            resolve();
            return;
          }

          const unsub = effect(() => {
            const s = r.state();
            if (s === "ready" || s === "errored") {
              unsub();
              resolve();
            }
          });
        }),
    ),
  );

  return resources.map((r) => {
    const status = r.state();
    if (status === "errored") {
      const err = r.error();
      if (err) throw err;
    }
    const data = r.latest();
    if (data !== undefined) return data;
    throw new Error("Resource not loaded");
  }) as { [K in keyof T]: T[K] extends Resource<infer U> ? U : never };
}
