import {
  createMemo,
  createRenderEffect,
  createSignal,
  flush,
  getOwner,
  untrack,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import {
  type Collection,
  type CollectionStatus,
  type Context,
  type DbClient,
  type GetResult,
  type HealthNode,
  type InitialQueryBuilder,
  type LiveQueryKey,
  type LiveQueryWindowBinding,
  type LiveQueryWindowSnapshot,
  type NonSingleResult,
  type QueryBuilder,
  type UtilsRecord,
  bindLiveQueryWindow,
  fetchNextLiveQueryWindowPage,
  UnhashableQueryIRError,
  getLiveQueryStatusFlags,
  getPreparedLiveQueryIdentity,
  getPublicCollection,
  readLiveQueryWindowPageShape,
} from "@tanstack/db";

import {
  type AnyCollection,
  type Compiled,
  type Deferred,
  Rejected,
  compiled,
  field,
  resume,
} from "./binding.ts";
import type { NoCollectionUtils, UseLiveQueryFlags } from "./live-query.ts";
import { serverAnswer } from "./seed.ts";

export interface UseLiveInfiniteQueryConfig {
  /** Rows per page. */
  pageSize?: number;
  /** The first page's label in `pageParams`, not a server cursor or offset. */
  initialPageParam?: number;
  /** The identity a `DbClient` matches a preloaded or hydrated first window by. */
  queryKey?: LiveQueryKey;
  /** Resolve descriptors against this client instead of the `DbProvider`'s. */
  client?: DbClient;
}

export interface UseLiveInfiniteQueryResult<
  TRow extends object,
  TKey extends string | number = string | number,
  TCollection = Collection<TRow, TKey, NoCollectionUtils>,
> extends UseLiveQueryFlags {
  /** Every row of every loaded page, in order. */
  readonly data: Array<TRow>;
  readonly pages: Array<Array<TRow>>;
  readonly pageParams: Array<number>;
  readonly state: Map<TKey, TRow>;
  readonly collection: TCollection;
  readonly status: CollectionStatus;
  readonly isEnabled: true;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  /** Load one more page; resolves once it is committed. Safe to call from a handler. */
  fetchNextPage(): Promise<void>;
}

/** What a server render carries to the page for one infinite query. */
export interface LiveInfiniteQuerySeed {
  readonly rows: ReadonlyArray<readonly [string | number, object]>;
  readonly pageLengths: ReadonlyArray<number>;
  readonly pageParams: ReadonlyArray<number>;
  readonly hasNextPage: boolean;
  readonly status: CollectionStatus;
}

type Snapshot = LiveQueryWindowSnapshot<object, string | number>;
type View = Snapshot | Rejected;
type Config = UseLiveInfiniteQueryConfig;

interface Binding {
  readonly window: LiveQueryWindowBinding;
  readonly deferred: Deferred;
}

function bindWindow(input: Compiled<Config>, previous: Binding | undefined): Binding {
  const { prepared } = input;
  const window = bindLiveQueryWindow(previous?.window ?? null, {
    ...readLiveQueryWindowPageShape(input.options),
    // The callback already ran; the library still judges what it returned.
    input: input.callback ? () => prepared : prepared,
    dependencies: [identityOf(prepared)],
    // The query callback ran in the hook's memo, which reruns only when
    // something it read changed: every update is a new query.
    recompile: "always",
    scope: input.client,
    client: input.client,
    queryKey: input.queryKey,
  });
  if (previous !== undefined && previous.window === window) return previous;
  return { window, deferred: input.deferred };
}

/**
 * What decides whether a new query keeps the pages already loaded: a query
 * whose plan is the same as the last one's, as when a signal it reads was set
 * to an equal value, keeps them; any other starts again from the first page.
 */
function identityOf(prepared: unknown): unknown {
  try {
    return getPreparedLiveQueryIdentity(prepared);
  } catch (error) {
    // A plan with no stable identity equals nothing, itself included.
    if (error instanceof UnhashableQueryIRError) return {};
    throw error;
  }
}

function releaseWindow(binding: Binding): void {
  resume(binding.deferred);
  binding.window.controller.dispose();
}

function settled(status: Snapshot["status"]): boolean {
  return status === "ready" || status === "error" || status === "crashed";
}

async function capture({ window, deferred }: Binding): Promise<LiveInfiniteQuerySeed> {
  const { controller } = window;
  resume(deferred);
  try {
    await controller.preload();
  } catch {
    return { rows: [], pageLengths: [], pageParams: [], hasNextPage: false, status: "error" };
  }
  const snapshot: Snapshot = controller.getSnapshot();
  const keys = new Map<object, string | number>();
  for (const [key, row] of snapshot.state ?? []) keys.set(row, key);
  return {
    rows: snapshot.data.map((row) => [keys.get(row) as string | number, row] as const),
    pageLengths: snapshot.pages.map((page) => page.length),
    pageParams: [...snapshot.pageParams],
    hasNextPage: snapshot.hasNextPage,
    status: snapshot.status as CollectionStatus,
  };
}

function seededSnapshot(seed: LiveInfiniteQuerySeed, collection: AnyCollection): Snapshot {
  const data = seed.rows.map(([, row]) => row);
  const pages: object[][] = [];
  let offset = 0;
  for (const length of seed.pageLengths) {
    pages.push(data.slice(offset, offset + length));
    offset += length;
  }
  let state: Map<string | number, object> | undefined;
  return {
    data,
    pages,
    pageParams: seed.pageParams,
    hasNextPage: seed.hasNextPage,
    isFetchingNextPage: false,
    get state() {
      return (state ??= new Map(seed.rows));
    },
    collection: getPublicCollection(collection),
    status: seed.status,
    ...getLiveQueryStatusFlags(seed.status, undefined),
    isEnabled: true,
  };
}

export function useLiveInfiniteQuery<TContext extends Context>(
  queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>,
  config: Config | (() => Config),
): UseLiveInfiniteQueryResult<GetResult<TContext>>;

export function useLiveInfiniteQuery<
  TResult extends object,
  TKey extends string | number,
  TUtils extends UtilsRecord,
>(
  collection:
    | (Collection<TResult, TKey, TUtils> & NonSingleResult)
    | (() => Collection<TResult, TKey, TUtils> & NonSingleResult),
  config: Config | (() => Config),
): UseLiveInfiniteQueryResult<TResult, TKey, Collection<TResult, TKey, TUtils>>;

/**
 * A live query read a page at a time.
 *
 * The query must have an `orderBy`. The hook compiles it with a window of the
 * loaded pages plus one row, which is how `hasNextPage` is known, and
 * `fetchNextPage` widens that window in place: the live query and its
 * subscriptions stay, and rows already shown keep updating. A signal the query
 * callback or the config accessor reads starts again from the first page.
 */
export function useLiveInfiniteQuery(input: unknown, config: Config | (() => Config)): unknown {
  const name = "useLiveInfiniteQuery";
  const resolution = compiled<Binding, Config>(
    input,
    bindWindow,
    releaseWindow,
    `${name}:query`,
    () => (typeof config === "function" ? config() : { ...config }),
  );
  const first = untrack(resolution).binding;

  const answer = serverAnswer<LiveInfiniteQuerySeed>(`${name}:server`, () => {
    const binding = untrack(resolution).binding;
    return binding === undefined ? undefined : capture(binding);
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
      if (held() && binding === first) {
        const seed = answer.read();
        if (seed !== undefined) return seededSnapshot(seed, binding.window.collection);
      }
      tick();
      return binding.window.controller.getSnapshot();
    },
    { name: `${name}:view` },
  );

  createRenderEffect(
    () => (isServer ? undefined : resolution().binding),
    (binding) => {
      if (binding === undefined) return undefined;
      const { controller, warning } = binding.window;
      let live = true;
      function publish(): void {
        if (!live) return;
        setTick((count) => count + 1);
        if (untrack(held) && settled(controller.getSnapshot().status)) setHeld(false);
      }
      if (warning !== undefined) console.warn(warning);
      resume(binding.deferred);
      const unsubscribe = controller.subscribe(publish);
      // The catch-up read after subscribing waits for the scope under
      // construction to return, which refuses a write from inside it.
      queueMicrotask(publish);
      return () => {
        live = false;
        unsubscribe();
      };
    },
  );

  const status = field(view, (snapshot) => snapshot.status);
  const health = field(view, (snapshot) => snapshot.health);
  const data = field(view, (snapshot) => snapshot.data);
  const pages = field(view, (snapshot) => snapshot.pages);
  const pageParams = field(view, (snapshot) => snapshot.pageParams);
  const hasNextPage = field(view, (snapshot) => snapshot.hasNextPage);
  const isFetchingNextPage = field(view, (snapshot) => snapshot.isFetchingNextPage);
  const collection = field(view, (snapshot) => snapshot.collection);

  function fetchNextPage(): Promise<void> {
    // From a handler that has just changed what the query reads, the page
    // belongs to the new query: apply the staged writes before choosing.
    if (getOwner() === null) flush();
    const binding = untrack(resolution).binding;
    if (binding === undefined) return Promise.resolve();
    return fetchNextLiveQueryWindowPage(binding.window.controller);
  }

  return {
    get data() {
      return data();
    },
    get pages() {
      return pages();
    },
    get pageParams() {
      return pageParams();
    },
    get hasNextPage() {
      return hasNextPage();
    },
    get isFetchingNextPage() {
      return isFetchingNextPage();
    },
    get state() {
      const value = view();
      if (value instanceof Rejected) throw value.error;
      return value.state;
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
      return status() === "ready";
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
    get health(): HealthNode | undefined {
      return health();
    },
    fetchNextPage,
  };
}
