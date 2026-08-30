/**
 * One resource.
 *
 * `resource(source, fetcher)` is an async memo with three things bolted to the
 * scope that created it rather than to a state machine beside it:
 *
 * - **A1, cancellation is structural.** The `AbortController` is a cleanup on
 *   the creating scope. Dispose aborts it, a re-run aborts the previous one,
 *   and the signal is handed to the fetcher.
 * - **A2, staleness by generation captured at call time.** Every run captures
 *   its own `gen` and the creating scope's `gen`; the continuation compares the
 *   pair it captured against the current pair. Nothing in the continuation
 *   reads a mutable outer variable that by then names the newest request.
 * - **A3, `NotReady` is a control signal.** The read is a Cell: it throws
 *   `NotReadyError` before settlement, which `Loading` catches, `latest()`
 *   steps over and `isPending()` reports. There is no second status channel.
 *
 * What this replaces: the `ResourceState` union and its `internalState` signal,
 * `createResource`, `suspend` and `awaitAll`. The union duplicated flags the
 * graph already carries; `createResource` was `resource` with a null source;
 * `suspend` threw a promise nothing awaited; `awaitAll` is `resolve()`.
 */

import {
  type Computed,
  NotReadyError,
  type Owner,
  computed,
  getOwner,
  latest as readLatest,
  onCleanup,
  signal,
  untrack,
} from "./signals.ts";

/**
 * `unresolved` is not in this union: a status read is itself a read, and a read
 * starts the fetch, so there is no observable moment between creation and
 * `pending`.
 */
export type ResourceStatus = "pending" | "ready" | "refreshing" | "errored";

/** The third argument a fetcher never used to get (A1). */
export interface ResourceInfo<T> {
  readonly prev: T | undefined;
  readonly refetching: boolean;
  readonly signal: AbortSignal;
}

export interface ResourceOptions<T = unknown> {
  /**
   * Serialization key for SSR seeding. Opt-in rather than positional: the
   * auto-key stream is a shared counter and a resource silently consuming a
   * slot would shift every `computed` after it.
   */
  readonly key?: string;
  /**
   * Commit #0 (A8): a value the resource is BORN with, served until the first
   * fetch answers. During that window `loading()` is false, `state()` is
   * `"ready"` and nothing suspends — the skeleton is the VALUE, not a
   * boundary's fallback. Once the first answer lands it leaves the lineage and
   * a refetch is an ordinary revalidation.
   *
   * Declare it in the resource's type to use `null` — `resource<User | null>(…,
   * { loadingValue: null })` — so every consumer sees the window honestly.
   */
  readonly loadingValue?: T;
}

/** A `Cell<T>` with the status channel hung off the function object. */
export interface Resource<T> {
  (): T;
  state: () => ResourceStatus;
  loading: () => boolean;
  error: () => Error | undefined;
  /** The last settled value, never a throw. `undefined` until one exists. */
  latest: () => T | undefined;
  refetch: () => Promise<void>;
  mutate: (value: T) => void;
}

interface Box<T> {
  readonly value: T;
}

interface Probe {
  readonly pending: boolean;
  readonly error: Error | undefined;
}

function asError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

export function resource<T, S = unknown>(
  source: () => S,
  fetcher: (source: S, info: ResourceInfo<T>) => T | Promise<T>,
  options?: ResourceOptions<T>,
): Resource<T> {
  const owner: Owner | null = getOwner();

  const bump = signal(0, { equals: false });
  const override = signal<Box<T> | null>(null);

  let issued = 0;
  let manual = false;
  let inflight: AbortController | null = null;
  let awaiting: Promise<unknown> | null = null;
  let settled: Box<T> | null = null;

  const cancel = (reason: string): void => {
    const controller = inflight;
    if (controller === null) return;
    inflight = null;
    controller.abort(reason);
  };

  if (owner !== null) onCleanup(() => cancel("the scope that owns this request was disposed"));

  const compute = (prev?: T): T => {
    bump();
    const input = source();
    const refetching = manual;
    manual = false;

    const gen = ++issued;
    const scopeGen = owner === null ? 0 : owner.gen;
    cancel("a newer request was issued");
    const controller = new AbortController();
    inflight = controller;

    /** A2: the whole staleness decision, captured here and read nowhere else. */
    const current = (): boolean =>
      gen === issued && (owner === null || owner.gen === scopeGen) && !controller.signal.aborted;

    const out = untrack(() => fetcher(input, { prev, refetching, signal: controller.signal }));

    if (!(out instanceof Promise)) {
      inflight = null;
      settled = { value: out };
      return out;
    }

    const tracked = out.then(
      (value) => {
        if (!current()) return value;
        inflight = null;
        settled = { value };
        override.set(null);
        return value;
      },
      (thrown) => {
        if (current()) inflight = null;
        throw thrown;
      },
    );
    awaiting = tracked;
    return tracked as unknown as T;
  };

  // One primitive: `computed` IS the async one, and a key is just an option on
  // it. `resource` adds what a memo has no business having — an
  // `AbortController` per run, the generation guard, and the override lane.
  // A8 goes on the node that FLIES. `view` derives from it, so a window that
  // does not throw is a window `view` does not throw through either, and
  // `probe()` reports `loading: false` for free.
  const fetched: Computed<T> = computed<T>(
    compute,
    options !== undefined && "loadingValue" in options
      ? { key: options.key, loadingValue: options.loadingValue as T }
      : { key: options?.key },
  );

  /**
   * A4's shape at the level of one value: the read is a derivation over the
   * settled memo and the pending override, so retiring the override restores
   * nothing — it stops being part of the sum.
   */
  const view = computed<T>(() => {
    const pending = override();
    return pending === null ? fetched() : pending.value;
  });

  const read = (() => view()) as Resource<T>;

  const probe = (): Probe => {
    try {
      view();
      return { pending: false, error: undefined };
    } catch (thrown) {
      if (thrown instanceof NotReadyError) return { pending: true, error: undefined };
      return { pending: false, error: asError(thrown) };
    }
  };

  read.state = (): ResourceStatus => {
    const { pending, error } = probe();
    if (error !== undefined) return "errored";
    if (!pending) return "ready";
    return settled === null ? "pending" : "refreshing";
  };

  read.loading = (): boolean => probe().pending;

  read.error = (): Error | undefined => probe().error;

  read.latest = (): T | undefined => {
    try {
      // The seeded first run commits without passing through `compute`, so this
      // is also where a hydrated value becomes the remembered one.
      const value = readLatest(() => view());
      settled = { value };
      return value;
    } catch {
      return settled === null ? undefined : settled.value;
    }
  };

  read.refetch = async (): Promise<void> => {
    manual = true;
    bump.set(0);
    untrack(() => {
      try {
        view();
      } catch {
        /* pending or errored; both are states this call reports through `read` */
      }
    });
    const pending = awaiting;
    if (pending !== null) {
      try {
        await pending;
      } catch {
        /* surfaced by `error()`, not by the refetch call */
      }
    }
    await Promise.resolve();
  };

  read.mutate = (value: T): void => {
    settled = { value };
    override.set({ value });
  };

  return read;
}
