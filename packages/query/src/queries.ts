import {
  NotReadyError,
  createRenderEffect,
  createSignal,
  createStore,
  isServer,
  untrack,
} from "@barqjs/core";
import {
  type DefaultError,
  type OmitKeyof,
  QueriesObserver,
  type QueriesPlaceholderDataFunction,
  type QueryClient,
  type QueryFunction,
  type QueryKey,
  type QueryObserverOptions,
  type QueryObserverResult,
  notifyManager,
} from "@tanstack/query-core";

import { defaultThrowOnError, suspending, through } from "./base.ts";
import { useIsRestoring, useQueryClient } from "./client.ts";
import type {
  UseQueryOptions,
  UseQueryResult,
  UseSuspenseQueryOptions,
  UseSuspenseQueryResult,
} from "./hooks.ts";
import { carried, firstAnswer, seededByRead } from "./seed.ts";

/** `placeholderData` takes no previous value here: the set can change length between runs. */
export type UseQueryOptionsForUseQueries<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = OmitKeyof<UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>, "placeholderData"> & {
  placeholderData?: TQueryFnData | QueriesPlaceholderDataFunction<TQueryFnData>;
};

// A tuple longer than this would hit the compiler's own recursion limit.
type MAXIMUM_DEPTH = 20;

// Widened, so inference survives a `skipToken` that is not a unique symbol at the call site.
type SkipTokenForUseQueries = symbol;

type ErrorOf<TThrow> = TThrow extends (error: infer TError, query: never) => boolean
  ? unknown extends TError
    ? DefaultError
    : TError
  : DefaultError;

type GetUseQueryOptionsForUseQueries<T> =
  // An explicit object: { queryFnData, error, data }.
  T extends { queryFnData: infer TQueryFnData; error?: infer TError; data: infer TData }
    ? UseQueryOptionsForUseQueries<TQueryFnData, TError, TData>
    : T extends { queryFnData: infer TQueryFnData; error?: infer TError }
      ? UseQueryOptionsForUseQueries<TQueryFnData, TError>
      : T extends { data: infer TData; error?: infer TError }
        ? UseQueryOptionsForUseQueries<unknown, TError, TData>
        : // An explicit tuple: [TQueryFnData, TError, TData].
          T extends [infer TQueryFnData, infer TError, infer TData]
          ? UseQueryOptionsForUseQueries<TQueryFnData, TError, TData>
          : T extends [infer TQueryFnData, infer TError]
            ? UseQueryOptionsForUseQueries<TQueryFnData, TError>
            : T extends [infer TQueryFnData]
              ? UseQueryOptionsForUseQueries<TQueryFnData>
              : // Nothing explicit: inferred from the options themselves.
                T extends {
                    queryFn?:
                      | QueryFunction<infer TQueryFnData, infer TQueryKey>
                      | SkipTokenForUseQueries;
                    select?: (data: never) => infer TData;
                    throwOnError?: infer TThrow;
                  }
                ? UseQueryOptionsForUseQueries<
                    TQueryFnData,
                    ErrorOf<TThrow>,
                    unknown extends TData ? TQueryFnData : TData,
                    TQueryKey
                  >
                : UseQueryOptionsForUseQueries;

// The key is `never` in the results: a `queryFn` taking a specific key, which is
// what `queryOptions` hands back, is not a `QueryFunction` of every `QueryKey`.
type GetUseQueryResult<T> = T extends {
  queryFnData: unknown;
  error?: infer TError;
  data: infer TData;
}
  ? UseQueryResult<TData, TError>
  : T extends { queryFnData: infer TQueryFnData; error?: infer TError }
    ? UseQueryResult<TQueryFnData, TError>
    : T extends { data: infer TData; error?: infer TError }
      ? UseQueryResult<TData, TError>
      : T extends [unknown, infer TError, infer TData]
        ? UseQueryResult<TData, TError>
        : T extends [infer TQueryFnData, infer TError]
          ? UseQueryResult<TQueryFnData, TError>
          : T extends [infer TQueryFnData]
            ? UseQueryResult<TQueryFnData>
            : T extends {
                  queryFn?: QueryFunction<infer TQueryFnData, never> | SkipTokenForUseQueries;
                  select?: (data: never) => infer TData;
                  throwOnError?: infer TThrow;
                }
              ? UseQueryResult<unknown extends TData ? TQueryFnData : TData, ErrorOf<TThrow>>
              : UseQueryResult;

/** The options tuple, element by element, so each query keeps its own types. */
export type QueriesOptions<
  T extends unknown[],
  TResults extends unknown[] = [],
  TDepth extends readonly number[] = [],
> = TDepth["length"] extends MAXIMUM_DEPTH
  ? UseQueryOptionsForUseQueries[]
  : T extends []
    ? []
    : T extends [infer Head]
      ? [...TResults, GetUseQueryOptionsForUseQueries<Head>]
      : T extends [infer Head, ...infer Tails]
        ? QueriesOptions<
            [...Tails],
            [...TResults, GetUseQueryOptionsForUseQueries<Head>],
            [...TDepth, 1]
          >
        : readonly unknown[] extends T
          ? T
          : // Some array of one known type: what `ids.map((id) => ({ ... }))` produces.
            T extends UseQueryOptionsForUseQueries<
                infer TQueryFnData,
                infer TError,
                infer TData,
                infer TQueryKey
              >[]
            ? UseQueryOptionsForUseQueries<TQueryFnData, TError, TData, TQueryKey>[]
            : UseQueryOptionsForUseQueries[];

/** The results tuple matching `QueriesOptions`, position for position. */
export type QueriesResults<
  T extends unknown[],
  TResults extends unknown[] = [],
  TDepth extends readonly number[] = [],
> = TDepth["length"] extends MAXIMUM_DEPTH
  ? UseQueryResult[]
  : T extends []
    ? []
    : T extends [infer Head]
      ? [...TResults, GetUseQueryResult<Head>]
      : T extends [infer Head, ...infer Tails]
        ? QueriesResults<[...Tails], [...TResults, GetUseQueryResult<Head>], [...TDepth, 1]>
        : { [K in keyof T]: GetUseQueryResult<T[K]> };

type GetUseSuspenseQueryOptions<T> = T extends {
  queryFnData: infer TQueryFnData;
  error?: infer TError;
  data: infer TData;
}
  ? UseSuspenseQueryOptions<TQueryFnData, TError, TData>
  : T extends { queryFnData: infer TQueryFnData; error?: infer TError }
    ? UseSuspenseQueryOptions<TQueryFnData, TError>
    : T extends { data: infer TData; error?: infer TError }
      ? UseSuspenseQueryOptions<unknown, TError, TData>
      : T extends [infer TQueryFnData, infer TError, infer TData]
        ? UseSuspenseQueryOptions<TQueryFnData, TError, TData>
        : T extends [infer TQueryFnData, infer TError]
          ? UseSuspenseQueryOptions<TQueryFnData, TError>
          : T extends [infer TQueryFnData]
            ? UseSuspenseQueryOptions<TQueryFnData>
            : T extends {
                  queryFn?: QueryFunction<infer TQueryFnData, infer TQueryKey>;
                  select?: (data: never) => infer TData;
                }
              ? UseSuspenseQueryOptions<
                  TQueryFnData,
                  DefaultError,
                  unknown extends TData ? TQueryFnData : TData,
                  TQueryKey
                >
              : UseSuspenseQueryOptions;

// `never` for the key, as in `GetUseQueryResult`.
type GetUseSuspenseQueryResult<T> = T extends {
  queryFnData: unknown;
  error?: infer TError;
  data: infer TData;
}
  ? UseSuspenseQueryResult<TData, TError>
  : T extends { queryFnData: infer TQueryFnData; error?: infer TError }
    ? UseSuspenseQueryResult<TQueryFnData, TError>
    : T extends { data: infer TData; error?: infer TError }
      ? UseSuspenseQueryResult<TData, TError>
      : T extends [unknown, infer TError, infer TData]
        ? UseSuspenseQueryResult<TData, TError>
        : T extends [infer TQueryFnData, infer TError]
          ? UseSuspenseQueryResult<TQueryFnData, TError>
          : T extends [infer TQueryFnData]
            ? UseSuspenseQueryResult<TQueryFnData>
            : T extends {
                  queryFn?: QueryFunction<infer TQueryFnData, never>;
                  select?: (data: never) => infer TData;
                }
              ? UseSuspenseQueryResult<unknown extends TData ? TQueryFnData : TData>
              : UseSuspenseQueryResult;

export type SuspenseQueriesOptions<
  T extends unknown[],
  TResults extends unknown[] = [],
  TDepth extends readonly number[] = [],
> = TDepth["length"] extends MAXIMUM_DEPTH
  ? UseSuspenseQueryOptions[]
  : T extends []
    ? []
    : T extends [infer Head]
      ? [...TResults, GetUseSuspenseQueryOptions<Head>]
      : T extends [infer Head, ...infer Tails]
        ? SuspenseQueriesOptions<
            [...Tails],
            [...TResults, GetUseSuspenseQueryOptions<Head>],
            [...TDepth, 1]
          >
        : unknown[] extends T
          ? T
          : T extends UseSuspenseQueryOptions<
                infer TQueryFnData,
                infer TError,
                infer TData,
                infer TQueryKey
              >[]
            ? UseSuspenseQueryOptions<TQueryFnData, TError, TData, TQueryKey>[]
            : UseSuspenseQueryOptions[];

export type SuspenseQueriesResults<
  T extends unknown[],
  TResults extends unknown[] = [],
  TDepth extends readonly number[] = [],
> = TDepth["length"] extends MAXIMUM_DEPTH
  ? UseSuspenseQueryResult[]
  : T extends []
    ? []
    : T extends [infer Head]
      ? [...TResults, GetUseSuspenseQueryResult<Head>]
      : T extends [infer Head, ...infer Tails]
        ? SuspenseQueriesResults<
            [...Tails],
            [...TResults, GetUseSuspenseQueryResult<Head>],
            [...TDepth, 1]
          >
        : { [K in keyof T]: GetUseSuspenseQueryResult<T[K]> };

type AnyResult = QueryObserverResult;
type AnyCombine = (results: AnyResult[]) => unknown;

interface AnyQueriesOptions {
  queries: readonly QueryObserverOptions[];
  combine?: AnyCombine;
}

/**
 * Bring a store node level with `next` without replacing it.
 *
 * The object a caller holds is read once, when the component body runs, so a
 * combined result that was swapped for a new one would leave them holding the
 * first. `combine`'s output is already structurally shared, so a field that
 * did not change is the same reference and the assignment is dropped.
 */
function level(draft: object, next: object): void {
  if (Array.isArray(draft) && Array.isArray(next)) {
    for (const [index, value] of next.entries()) draft[index] = value;
    draft.length = next.length;
    return;
  }
  const target = draft as Record<string, unknown>;
  for (const key of Object.keys(target)) {
    if (!Object.hasOwn(next, key)) delete target[key];
  }
  Object.assign(target, next);
}

function combinable(value: unknown): object {
  if (typeof value === "object" && value !== null) return value;
  throw new TypeError(
    `[barq] \`combine\` has to return an object or an array, and it returned ${value === null ? "`null`" : `a ${typeof value}`}. ` +
      "The result is read field by field, so a bare value never updates the page. Wrap it in an object: `combine: (results) => ({ total: results.length })`.",
  );
}

function queriesBase(
  options: () => AnyQueriesOptions,
  queryClient: QueryClient | undefined,
  suspense: boolean,
): unknown {
  const client = useQueryClient(queryClient);
  const isRestoring = useIsRestoring();

  const defaultedFor = (answered: boolean) =>
    options().queries.map((each) => {
      const resolved = client.defaultQueryOptions(each);
      resolved._optimisticResults = isRestoring() ? "isRestoring" : "optimistic";
      if (suspense) {
        resolved.suspense = true;
        resolved.enabled = true;
        resolved.placeholderData = undefined;
        resolved.throwOnError = defaultThrowOnError;
      }
      if (answered) resolved.refetchOnMount = false;
      return resolved;
    });
  const combine = (): AnyCombine | undefined => options().combine;
  const combining = untrack(combine) !== undefined;
  const observerOptions = () => {
    const given = combine();
    return given === undefined ? undefined : { combine: given };
  };

  const initial = untrack(() => defaultedFor(false));
  const observer = new QueriesObserver<unknown>(client, initial, untrack(observerOptions));

  const answer = firstAnswer(
    client,
    `queries:${initial.map((each) => each.queryHash).join("|")}`,
    () => {
      const cache = client.getQueryCache();
      const [optimistic] = observer.getOptimisticResult(initial, undefined);
      const asked: string[] = [];
      const flying: Promise<unknown>[] = [];
      for (const [index, each] of initial.entries()) {
        const result = optimistic[index];
        const query = cache.build(client, each);
        if (result !== undefined && result.isPending && result.fetchStatus !== "idle") {
          flying.push(query.fetch(each));
          asked.push(each.queryHash);
        } else if (query.state.dataUpdateCount > 0 && !carried(client).has(each.queryHash)) {
          asked.push(each.queryHash);
        }
      }
      if (asked.length === 0) return undefined;
      for (const hash of asked) seededByRead(client).add(hash);
      return Promise.all(flying).then(() => asked);
    },
  );

  let held = answer.seeded || answer.arriving;
  const [arrived, setArrived] = createSignal(!answer.arriving);
  const defaulted = () => defaultedFor(false);

  if (held)
    observer.setQueries(
      untrack(() => defaultedFor(true)),
      untrack(observerOptions),
    );

  /** A suspense set is combined only once every member has data to combine. */
  const combined = (results: readonly AnyResult[], answered: boolean): object | undefined => {
    if (!combining) return undefined;
    if (suspense && results.some((each) => each.data === undefined)) return undefined;
    const [, combineWith] = observer.getOptimisticResult(
      untrack(() => defaultedFor(answered)),
      untrack(combine),
    );
    return combinable(combineWith([...results]));
  };

  const [first] = observer.getOptimisticResult(
    untrack(() => defaultedFor(held)),
    undefined,
  );
  const [state, setState] = createStore<{ results: AnyResult[]; combined: object | undefined }>({
    results: [...first],
    combined: combined(first, held),
  });

  /**
   * Written INDEX BY INDEX, never replaced.
   *
   * The array a caller holds is read once, when the component body runs, so
   * swapping it for a new one leaves them holding the first. Writing through
   * the store keeps one array and makes `results[1].data` a dependency of its
   * own — which is the whole reason to run a set through one observer rather
   * than a loop of `useQuery`.
   */
  const write = (results: readonly AnyResult[]): void => {
    const next = combined(results, false);
    setState((draft) => {
      for (const [index, result] of results.entries()) {
        const current = draft.results[index] as AnyResult | undefined;
        if (current === undefined) {
          draft.results[index] = result;
          continue;
        }
        Object.assign(current, result);
      }
      if (results.length < draft.results.length) draft.results.length = results.length;
      if (next === undefined) return;
      if (draft.combined === undefined) draft.combined = next;
      else level(draft.combined, next);
    });
  };

  createRenderEffect(
    () => [defaulted(), observerOptions()] as const,
    ([queries, given]) => {
      if (!held) observer.setQueries(queries, given);
    },
  );

  createRenderEffect(
    () => !isServer && arrived() && !isRestoring(),
    (subscribing) => {
      if (!subscribing) return undefined;
      const unsubscribe = observer.subscribe(notifyManager.batchCalls(write));
      if (held) {
        held = false;
        observer.setQueries(untrack(defaulted), untrack(observerOptions));
      }
      return unsubscribe;
    },
  );

  let behind = isServer || answer.arriving;
  answer.landed((seed) => {
    const resolved = untrack(() => defaultedFor(seed !== undefined));
    observer.setQueries(resolved, untrack(observerOptions));
    write(observer.getOptimisticResult(resolved, undefined)[0]);
    behind = false;
    held = seed !== undefined;
    setArrived(true);
  });

  /** The observer's own results, once the first answer is in the cache. */
  const current = (): AnyResult[] => {
    const seed = answer.read();
    const resolved = untrack(() => defaultedFor(seed !== undefined));
    return observer.getOptimisticResult(resolved, undefined)[0];
  };

  const plain = !behind && !suspense;

  if (combining) {
    if (plain && state.combined !== undefined) return state.combined;
    // The combined value does not exist until every member has data, so what
    // is handed back forwards to it rather than being it.
    return new Proxy(
      {},
      {
        get(_target, property) {
          const published = state.combined as Record<PropertyKey, unknown> | undefined;
          const tracked = published?.[property];
          if (typeof property === "symbol") return tracked;
          if (behind) {
            const results = current();
            const fresh = combined(results, true);
            if (fresh !== undefined) return Reflect.get(fresh, property) as unknown;
          }
          if (published === undefined) throw new NotReadyError(undefined);
          return tracked;
        },
        has: (_target, property) =>
          state.combined !== undefined && Reflect.has(state.combined, property),
        ownKeys: () => (state.combined === undefined ? [] : Reflect.ownKeys(state.combined)),
        getOwnPropertyDescriptor(_target, property) {
          if (state.combined === undefined) return undefined;
          const descriptor = Reflect.getOwnPropertyDescriptor(state.combined, property);
          return descriptor === undefined ? undefined : { ...descriptor, configurable: true };
        },
      },
    );
  }

  if (plain) return state.results;

  const wrappers = new WeakMap<object, AnyResult>();
  const wrapped = (member: AnyResult, index: number): AnyResult => {
    let wrapper = wrappers.get(member);
    if (wrapper === undefined) {
      const live = through(
        member,
        () => behind,
        () => current()[index] ?? member,
      );
      wrapper = suspense ? suspending(live) : live;
      wrappers.set(member, wrapper);
    }
    return wrapper;
  };

  return new Proxy(state.results, {
    get(target, property, receiver) {
      const published = Reflect.get(target, property, receiver) as unknown;
      if (typeof property === "symbol") return published;
      if (behind && property === "length") return current().length;
      const index = Number(property);
      if (!Number.isInteger(index) || index < 0) return published;
      if (typeof published !== "object" || published === null) return published;
      return wrapped(published as AnyResult, index);
    },
  });
}

/**
 * Several queries at once, through ONE observer.
 *
 * Not a loop over `useQuery`: `QueriesObserver` batches the whole set into a
 * single notification, so a page fetching twelve resources re-renders once
 * rather than twelve times.
 *
 * `combine` folds the set into one value. It has to return an object or an
 * array, because what comes back is read field by field like every other
 * result here.
 */
export function useQueries<T extends unknown[], TCombinedResult = QueriesResults<T>>(
  options: () => {
    queries:
      | readonly [...QueriesOptions<T>]
      | readonly [...{ [K in keyof T]: GetUseQueryOptionsForUseQueries<T[K]> }];
    combine?: (result: QueriesResults<T>) => TCombinedResult;
  },
  queryClient?: QueryClient,
): TCombinedResult {
  return queriesBase(options as unknown as () => AnyQueriesOptions, queryClient, false) as never;
}

/**
 * `useQueries`, with every member parking the enclosing `Loading` boundary on
 * its `data` until there is some. The fetches still run side by side: parking
 * is a property of the read, not of the request.
 */
export function useSuspenseQueries<
  T extends unknown[],
  TCombinedResult = SuspenseQueriesResults<T>,
>(
  options: () => {
    queries:
      | readonly [...SuspenseQueriesOptions<T>]
      | readonly [...{ [K in keyof T]: GetUseSuspenseQueryOptions<T[K]> }];
    combine?: (result: SuspenseQueriesResults<T>) => TCombinedResult;
  },
  queryClient?: QueryClient,
): TCombinedResult {
  return queriesBase(options as unknown as () => AnyQueriesOptions, queryClient, true) as never;
}
