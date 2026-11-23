import { createMemo, onCleanup, runWithOwner, untrack } from "@barqjs/core";
import {
  type Collection,
  type DbClient,
  type DeferredLiveQueryCollections,
  type InitialQueryBuilder,
  type LiveQueryKey,
  Query,
  UnhashableQueryIRError,
  getLiveQueryHash,
  getLiveQueryKey,
  isCollection,
  prepareLiveQueryValue,
  resumeDeferredLiveQueryCollections,
} from "@tanstack/db";

import { useOptionalDbClient } from "./client.ts";

/** Live queries a hook compiles are released as soon as nothing watches them. */
export const DEFAULT_GC_TIME_MS = 1;

export type AnyCollection = Collection<object>;

/**
 * What a hook is handed: a query callback, a config object or a Collection.
 *
 * A function is always a query callback and is called with a fresh builder,
 * whatever its arity, so `(q) => q.from(...)` and `() => collection` both
 * work. It may return a query, a config object, a Collection, or `null` or
 * `undefined` to disable the query. It runs inside the hook's memo, so a
 * signal it reads compiles the query again when it changes.
 */
function readInput(input: unknown): unknown {
  return typeof input === "function"
    ? (input as (q: InitialQueryBuilder) => unknown)(new Query())
    : input;
}

/** The per-query `client` a config object names, which wins over the provider's. */
function clientOf(value: unknown): DbClient | undefined {
  if (value === null || typeof value !== "object" || isCollection(value)) return undefined;
  return (value as { client?: DbClient }).client;
}

/**
 * The identity a `DbClient` matches a hydrated or preloaded result by.
 *
 * A query whose plan has no stable identity and names no `queryKey` has none,
 * and is watched without the client's seeds: it recompiles on reactive reads
 * here, so nothing else needs its identity.
 */
function hashOf(prepared: unknown, queryKey: LiveQueryKey | undefined): string | undefined {
  try {
    return getLiveQueryHash(prepared, queryKey);
  } catch (error) {
    if (error instanceof UnhashableQueryIRError && queryKey === undefined) return undefined;
    throw error;
  }
}

export type Deferred = DeferredLiveQueryCollections;

/** One compiled query input: what the hook's observer or window watches. */
export interface Compiled<TOptions = undefined> {
  /** Whether the input was a query callback rather than a value. */
  readonly callback: boolean;
  /** What the callback returned, or the input itself. */
  readonly value: unknown;
  readonly prepared: unknown;
  readonly client: DbClient | undefined;
  readonly queryHash: string | undefined;
  readonly queryKey: LiveQueryKey | undefined;
  /** Source starts held back until something subscribes or preloads. */
  readonly deferred: Deferred;
  /** What `options` read beside the input, tracked with it. */
  readonly options: TOptions;
}

export type Resolution<TBinding> =
  | { readonly binding: TBinding; readonly error?: undefined }
  | { readonly binding?: undefined; readonly error: unknown };

/** Release the source starts a compile held back. */
export function resume(deferred: Deferred): void {
  runWithOwner(null, () => resumeDeferredLiveQueryCollections(deferred));
}

/**
 * The memo every hook here is built on: the query input, compiled.
 *
 * Reading the input is tracked, so the query compiles again when a signal it
 * reads changes. Everything after that read is the library's: it is untracked,
 * and it runs with no owner, because starting a source can deliver rows to
 * other observers synchronously, and their writes are not this memo's.
 *
 * A compile that throws becomes `{ error }` rather than a throwing memo, so
 * the subscription below it can drop the previous query's rows; the hook's
 * readers rethrow it.
 */
export function compiled<TBinding, TOptions = undefined>(
  input: unknown,
  bind: (compiled: Compiled<TOptions>, previous: TBinding | undefined) => TBinding,
  release: (binding: TBinding) => void,
  name: string,
  options?: () => TOptions,
): () => Resolution<TBinding> {
  const contextClient = useOptionalDbClient();
  let last: TBinding | undefined;

  const resolution = createMemo<Resolution<TBinding>>(
    () => {
      try {
        const value = readInput(input);
        const read = options?.() as TOptions;
        const client = clientOf(value) ?? clientOf(read) ?? contextClient;
        const deferred: Deferred = new Set();
        const prepared = isCollection(value)
          ? value
          : prepareLiveQueryValue(value, client, client === undefined ? undefined : deferred);
        return untrack(() =>
          runWithOwner(null, () => {
            const queryKey = isCollection(value)
              ? undefined
              : (getLiveQueryKey(value) ?? getLiveQueryKey(read));
            const binding = bind(
              {
                callback: typeof input === "function",
                value,
                prepared,
                client,
                queryHash: client === undefined ? undefined : hashOf(prepared, queryKey),
                queryKey,
                deferred,
                options: read,
              },
              last,
            );
            if (last !== undefined && last !== binding) release(last);
            last = binding;
            return { binding };
          }),
        );
      } catch (error) {
        if (last !== undefined) runWithOwner(null, () => release(last as TBinding));
        last = undefined;
        return { error };
      }
    },
    { name },
  );

  onCleanup(() => {
    if (last !== undefined) release(last);
    last = undefined;
  });

  return resolution;
}

/** A compile the hook refused. Readers rethrow it from their own computation. */
export class Rejected {
  constructor(readonly error: unknown) {}
}

/**
 * One field of a hook's view as its own dependency.
 *
 * No memo a hook declares throws a compile error or returns a row. An error
 * leaving a computation arrives wrapped, so the rejection is carried as a
 * value and thrown from the reader's own computation. And a memo's value is
 * probed for `then`, which a row may have and a pooled query's Collection
 * answers by building itself, so the field is boxed and compared by identity.
 */
export function field<TView extends object, T>(
  view: () => TView | Rejected,
  pick: (view: TView) => T,
): () => T {
  const boxed = createMemo<{ readonly value: T | Rejected }>(
    () => {
      const value = view();
      return { value: value instanceof Rejected ? value : pick(value) };
    },
    { equals: (previous, next) => previous.value === next.value },
  );
  return () => {
    const { value } = boxed();
    if (value instanceof Rejected) throw value.error;
    return value;
  };
}
