import { NotReadyError, createMemo, createRenderEffect, createSignal, untrack } from "@barqjs/core";
import { isServer } from "@barqjs/web";
import {
  type Collection,
  type CollectionStatus,
  type Context,
  type DbClient,
  type GetResult,
  type HealthNode,
  type InferResultType,
  type InitialQueryBuilder,
  type LiveQueryCollectionConfig,
  type LiveQueryKey,
  type LiveQueryObserver,
  type LiveQuerySnapshot,
  type LiveQueryStatusFlags,
  type NonSingleResult,
  type PooledLiveQueries,
  type QueryBuilder,
  type SingleResult,
  type UtilsRecord,
  createLiveQueryObserver,
  getLiveQueryStatusFlags,
  getPublicCollection,
  isCollection,
  isSingleResultCollection,
  resolveLiveQueryValue,
  toBoundaryError,
} from "@tanstack/db";

import {
  type AnyCollection,
  type Compiled,
  DEFAULT_GC_TIME_MS,
  Rejected,
  type Resolution,
  compiled,
  field,
  resume,
} from "./binding.ts";
import { serverAnswer } from "./seed.ts";

export type UseLiveQueryStatus = CollectionStatus | "disabled";

type UseLiveQueryConfigOptions<TContext extends Context> = Omit<
  LiveQueryCollectionConfig<TContext>,
  "query"
> & {
  /**
   * The identity a `DbClient` matches a preloaded or hydrated result by, for a
   * query whose plan has no stable identity of its own (`.fn.where`).
   */
  queryKey?: LiveQueryKey;
  /** Resolve descriptors against this client instead of the `DbProvider`'s. */
  client?: DbClient;
  /** Share one partition among `eq`-filtered queries of one shape. */
  pool?: PooledLiveQueries;
};

type ConfiguredQueryBuilder<TContext extends Context> = Extract<
  LiveQueryCollectionConfig<TContext>["query"],
  QueryBuilder<TContext>
>;

export type UseLiveQueryConfig<TContext extends Context> = UseLiveQueryConfigOptions<TContext> &
  Pick<LiveQueryCollectionConfig<TContext>, "query">;

export type ConditionalUseLiveQueryConfig<TContext extends Context> =
  UseLiveQueryConfigOptions<TContext> & {
    query:
      | ConfiguredQueryBuilder<TContext>
      | ((q: InitialQueryBuilder) => ConfiguredQueryBuilder<TContext> | undefined | null);
  };

/** The status fields every live-query result has. */
export interface UseLiveQueryFlags extends LiveQueryStatusFlags {
  readonly isLoading: boolean;
  readonly isReady: boolean;
  readonly isIdle: boolean;
  readonly isLoadingError: boolean;
  readonly isCrashed: boolean;
  readonly isCleanedUp: boolean;
  readonly isSyncError: boolean;
  readonly health: HealthNode | undefined;
}

export interface NoCollectionUtils {}

/** An enabled query: it always has a Collection and a result. */
export interface UseLiveQueryResult<
  TData,
  TRow extends object,
  TKey extends string | number,
  TCollection = Collection<TRow, TKey, NoCollectionUtils>,
> extends UseLiveQueryFlags {
  readonly data: TData;
  readonly state: Map<TKey, TRow>;
  readonly collection: TCollection;
  readonly status: CollectionStatus;
  readonly isEnabled: true;
}

/** A query whose input can be `null` or `undefined`, which disables it. */
export interface UseConditionalLiveQueryResult<
  TData,
  TRow extends object,
  TKey extends string | number,
  TCollection = Collection<TRow, TKey, NoCollectionUtils>,
> extends UseLiveQueryFlags {
  readonly data: TData | undefined;
  readonly state: Map<TKey, TRow> | undefined;
  readonly collection: TCollection | undefined;
  readonly status: UseLiveQueryStatus;
  readonly isEnabled: boolean;
}

/** What a server render carries to the page for one live query. */
export interface LiveQuerySeed {
  readonly rows: ReadonlyArray<readonly [string | number, object]>;
  readonly status: CollectionStatus;
}

interface Binding {
  readonly collection: AnyCollection | null;
  readonly observer: LiveQueryObserver<object, string | number>;
  readonly client: DbClient | undefined;
  readonly deferred: Compiled["deferred"];
}

type Snapshot = LiveQuerySnapshot<object, string | number>;

function bindObserver(windowOwner: object) {
  return (input: Compiled, previous: Binding | undefined): Binding => {
    let collection: AnyCollection | null;
    if (isCollection(input.prepared)) {
      collection = input.prepared;
      collection.startSyncImmediate();
    } else {
      collection = resolveLiveQueryValue(input.prepared, {
        gcTime: DEFAULT_GC_TIME_MS,
        // A client matches results by identity, which a shared partition has none of.
        pool: input.client === undefined ? undefined : false,
        previousCollection:
          previous !== undefined && previous.client === input.client ? previous.collection : null,
        windowOwner,
      });
    }
    // A limit or offset change moves the existing window: same Collection, same watcher.
    if (previous !== undefined && previous.collection === collection) return previous;
    const deferred = input.deferred;
    const observer = createLiveQueryObserver<object, string | number>(collection, {
      mode: "wholesale",
      client: input.client,
      queryHash: input.queryHash,
      onPreload: () => resume(deferred),
    });
    return { collection, observer, client: input.client, deferred };
  };
}

function releaseObserver(binding: Binding): void {
  resume(binding.deferred);
  binding.observer.dispose();
}

/** The status a server's answer leaves the page with, or that ends a seed's stand-in. */
function settled(status: UseLiveQueryStatus): boolean {
  return status === "ready" || status === "error" || status === "crashed" || status === "disabled";
}

async function capture(
  observer: LiveQueryObserver<object, string | number>,
): Promise<LiveQuerySeed> {
  try {
    await observer.preload();
  } catch {
    // The page renders the failure; the browser runs the query for itself.
    return { rows: [], status: "error" };
  }
  const { rows } = observer.dehydrate();
  return {
    rows: rows.map((row) => [row.key, row.value] as const),
    status: observer.getSnapshot().status as CollectionStatus,
  };
}

function seededSnapshot(seed: LiveQuerySeed, collection: AnyCollection): Snapshot {
  const values = seed.rows.map(([, value]) => value);
  let state: Map<string | number, object> | undefined;
  return {
    get state() {
      return (state ??= new Map(seed.rows));
    },
    data: isSingleResultCollection(collection) ? values[0] : values,
    collection: getPublicCollection(collection),
    layoutRevision: 0,
    status: seed.status,
    ...getLiveQueryStatusFlags(seed.status, undefined),
    isEnabled: true,
  };
}

type View = Snapshot | Rejected;

/** The view a hook reads: the live observer's, or the server's answer standing in for it. */
interface LiveView {
  readonly resolution: () => Resolution<Binding>;
  readonly view: () => View;
}

/**
 * The shared body of `useLiveQuery` and `useLiveSuspenseQuery`.
 *
 * The query compiles in a memo, and its observer is a wholesale one: a
 * notification bumps a tick, and the view re-reads `getSnapshot()`, whose
 * identity only moves when the result does. The observer subscribes in a
 * render effect, never while the component is being built and never on the
 * server, and the effect's cleanup is what unsubscribes it.
 *
 * Across a server render, the first result is preloaded on the server and
 * carried to the page. Hydration renders it, and the browser's observer takes
 * over once its own result is ready or has failed.
 */
function liveView(input: unknown, name: string): LiveView {
  const resolution = compiled<Binding>(input, bindObserver({}), releaseObserver, `${name}:query`);
  const first = untrack(resolution).binding;

  const answer = serverAnswer<LiveQuerySeed>(`${name}:server`, () => {
    const binding = untrack(resolution).binding;
    if (binding === undefined || binding.collection === null) return undefined;
    return capture(binding.observer);
  });

  const [tick, setTick] = createSignal(0);
  const [held, setHeld] = createSignal(isServer || answer.seeded || answer.arriving);
  answer.landed((seed) => {
    if (seed === undefined) setHeld(false);
  });

  const view = createMemo<View>(
    () => {
      const { binding, error } = resolution();
      if (binding === undefined) return new Rejected(error);
      if (held() && binding === first && binding.collection !== null) {
        const seed = answer.read();
        if (seed !== undefined) return seededSnapshot(seed, binding.collection);
      }
      tick();
      return binding.observer.getSnapshot();
    },
    { name: `${name}:view` },
  );

  createRenderEffect(
    () => (isServer ? undefined : resolution().binding),
    (binding) => {
      if (binding === undefined) return undefined;
      const { observer } = binding;
      let live = true;
      function publish(): void {
        if (!live) return;
        setTick((count) => count + 1);
        if (untrack(held) && settled(observer.getSnapshot().status)) setHeld(false);
      }
      resume(binding.deferred);
      const unsubscribe = observer.subscribe(publish);
      // Starting the sync can move the result between the view's first read
      // and this subscription, and nothing notifies for that. The catch-up
      // read waits for the scope under construction to return: a write from
      // inside it is refused.
      queueMicrotask(publish);
      return () => {
        live = false;
        unsubscribe();
      };
    },
  );

  return { resolution, view };
}

/** The current snapshot, or the compile error thrown from the reader's own computation. */
function current(view: View): Snapshot {
  if (view instanceof Rejected) throw view.error;
  return view;
}

/** The result object both hooks return, each field its own dependency. */
function resultOf(view: () => View): object {
  const status = field(view, (snapshot) => snapshot.status);
  const health = field(view, (snapshot) => snapshot.health);
  const data = field(view, (snapshot) => snapshot.data);
  const collection = field(view, (snapshot) => snapshot.collection);
  return {
    get data() {
      return data();
    },
    get state() {
      return current(view()).state;
    },
    get collection() {
      return collection();
    },
    get status() {
      return status();
    },
    get isEnabled() {
      return status() !== "disabled";
    },
    get isLoading() {
      return status() === "loading";
    },
    get isReady() {
      const now = status();
      return now === "ready" || now === "disabled";
    },
    get isIdle() {
      return status() === "idle";
    },
    get isLoadingError() {
      return status() === "error";
    },
    get isCrashed() {
      return status() === "crashed";
    },
    get isCleanedUp() {
      return status() === "cleaned-up";
    },
    get isSyncError() {
      return status() === "ready" && health()?.hasErrors === true;
    },
    get health() {
      return health();
    },
  };
}

// Overload 1: a query callback that always returns a query.
export function useLiveQuery<TContext extends Context>(
  queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>,
): UseLiveQueryResult<InferResultType<TContext>, GetResult<TContext>, string | number>;

// Overload 2: a query callback that can return `null` or `undefined` to disable the query.
export function useLiveQuery<TContext extends Context>(
  queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext> | undefined | null,
): UseConditionalLiveQueryResult<InferResultType<TContext>, GetResult<TContext>, string | number>;

// Overload 3: a query callback that returns a config object.
export function useLiveQuery<TContext extends Context>(
  queryFn: (q: InitialQueryBuilder) => LiveQueryCollectionConfig<TContext> | undefined | null,
): UseConditionalLiveQueryResult<InferResultType<TContext>, GetResult<TContext>, string | number>;

// Overload 4: a callback that returns a pre-created live query Collection.
export function useLiveQuery<
  TResult extends object,
  TKey extends string | number,
  TUtils extends UtilsRecord,
>(
  collection: () => Collection<TResult, TKey, TUtils> & NonSingleResult,
): UseLiveQueryResult<Array<TResult>, TResult, TKey, Collection<TResult, TKey, TUtils>>;

// Overload 5: a callback that returns a pre-created single-result Collection.
export function useLiveQuery<
  TResult extends object,
  TKey extends string | number,
  TUtils extends UtilsRecord,
>(
  collection: () => Collection<TResult, TKey, TUtils> & SingleResult,
): UseLiveQueryResult<
  TResult | undefined,
  TResult,
  TKey,
  Collection<TResult, TKey, TUtils> & SingleResult
>;

// Overload 6: a callback that returns a Collection, or `null` to disable the query.
export function useLiveQuery<
  TResult extends object,
  TKey extends string | number,
  TUtils extends UtilsRecord,
>(
  queryFn: (q: InitialQueryBuilder) => Collection<TResult, TKey, TUtils> | undefined | null,
): UseConditionalLiveQueryResult<Array<TResult>, TResult, TKey, Collection<TResult, TKey, TUtils>>;

// Overload 7: a config object.
export function useLiveQuery<TContext extends Context>(
  config: UseLiveQueryConfig<TContext> | (() => UseLiveQueryConfig<TContext>),
): UseLiveQueryResult<InferResultType<TContext>, GetResult<TContext>, string | number>;

// Overload 8: a config object whose query can disable it.
export function useLiveQuery<TContext extends Context>(
  config: ConditionalUseLiveQueryConfig<TContext> | (() => ConditionalUseLiveQueryConfig<TContext>),
): UseConditionalLiveQueryResult<InferResultType<TContext>, GetResult<TContext>, string | number>;

// Overload 9: a pre-created live query Collection.
export function useLiveQuery<
  TResult extends object,
  TKey extends string | number,
  TUtils extends UtilsRecord,
>(
  collection: Collection<TResult, TKey, TUtils> & NonSingleResult,
): UseLiveQueryResult<Array<TResult>, TResult, TKey, Collection<TResult, TKey, TUtils>>;

// Overload 10: a pre-created single-result Collection.
export function useLiveQuery<
  TResult extends object,
  TKey extends string | number,
  TUtils extends UtilsRecord,
>(
  collection: Collection<TResult, TKey, TUtils> & SingleResult,
): UseLiveQueryResult<
  TResult | undefined,
  TResult,
  TKey,
  Collection<TResult, TKey, TUtils> & SingleResult
>;

/**
 * A live query, its result read field by field.
 *
 * The input is a query callback, a config object or a Collection. A callback
 * is called with the query builder and may return a query, a config object, a
 * Collection, or `null` or `undefined` to disable the query. It runs in a
 * memo, so a signal it reads recompiles the query when it changes; there is no
 * dependency array.
 *
 * `data` is the ordered rows (one row or `undefined` for `findOne`), `state`
 * the rows by key. A first load that fails is `status: "error"` and
 * `isLoadingError`; use `useLiveSuspenseQuery` to send it to an `Errored`
 * boundary instead.
 */
export function useLiveQuery(input: unknown): unknown {
  return resultOf(liveView(input, "useLiveQuery").view);
}

/** A Suspense query has data: its result drops the flags a boundary answers. */
export interface UseLiveSuspenseQueryResult<
  TData,
  TRow extends object,
  TKey extends string | number,
  TCollection = Collection<TRow, TKey, NoCollectionUtils>,
> {
  readonly data: TData;
  readonly state: Map<TKey, TRow>;
  readonly collection: TCollection;
  readonly health: HealthNode | undefined;
}

export function useLiveSuspenseQuery<TContext extends Context>(
  queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>,
): UseLiveSuspenseQueryResult<InferResultType<TContext>, GetResult<TContext>, string | number>;
export function useLiveSuspenseQuery<TContext extends Context>(
  config: UseLiveQueryConfig<TContext> | (() => UseLiveQueryConfig<TContext>),
): UseLiveSuspenseQueryResult<InferResultType<TContext>, GetResult<TContext>, string | number>;
export function useLiveSuspenseQuery<
  TResult extends object,
  TKey extends string | number,
  TUtils extends UtilsRecord,
>(
  collection:
    | (Collection<TResult, TKey, TUtils> & NonSingleResult)
    | (() => Collection<TResult, TKey, TUtils> & NonSingleResult),
): UseLiveSuspenseQueryResult<Array<TResult>, TResult, TKey, Collection<TResult, TKey, TUtils>>;
export function useLiveSuspenseQuery<
  TResult extends object,
  TKey extends string | number,
  TUtils extends UtilsRecord,
>(
  collection:
    | (Collection<TResult, TKey, TUtils> & SingleResult)
    | (() => Collection<TResult, TKey, TUtils> & SingleResult),
): UseLiveSuspenseQueryResult<
  TResult | undefined,
  TResult,
  TKey,
  Collection<TResult, TKey, TUtils> & SingleResult
>;

/**
 * A live query that parks the enclosing `Loading` boundary until its first
 * result is ready, and sends a failed first load, or a crash at any time, to
 * the enclosing `Errored` boundary. A failure after the first ready keeps the
 * rows and shows in `health`.
 *
 * A Suspense query cannot be disabled: render it conditionally instead.
 */
export function useLiveSuspenseQuery(input: unknown): unknown {
  const live = liveView(input, "useLiveSuspenseQuery");
  // The Collection whose result has been ready once. A failure after that keeps
  // the rows; one before it is the boundary's.
  let ready: AnyCollection | undefined;

  function gate(): void {
    const snapshot = current(live.view());
    if (!snapshot.isEnabled) {
      throw new Error(
        "[barq] useLiveSuspenseQuery does not take a disabled query (its input returned null or undefined): " +
          "a Suspense result always has data. Render the component conditionally, or use useLiveQuery, " +
          "whose `isEnabled` reports a disabled query.",
      );
    }
    const collection = snapshot.collection as AnyCollection;
    if (snapshot.isReady) ready = collection;
    const readyOnce = ready === collection;
    if (snapshot.isCrashed || (snapshot.isLoadingError && !readyOnce)) {
      throw toBoundaryError(
        untrack(live.resolution).binding?.observer.getError() ?? collection.health.error?.cause,
      );
    }
    // No source to name: the view read above is what brings this reader back.
    if (!readyOnce) throw new NotReadyError(undefined);
  }

  const result = resultOf(live.view) as Record<string, unknown>;
  return {
    get data() {
      gate();
      return result.data;
    },
    get state() {
      gate();
      return result.state;
    },
    get collection() {
      gate();
      return result.collection;
    },
    get health() {
      return result.health;
    },
  };
}
