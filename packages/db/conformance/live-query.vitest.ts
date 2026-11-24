/**
 * barq's driver for TanStack DB's shared live-query conformance suite.
 *
 * Each mount runs in a `createRoot` whose dispose is the unmount. Inputs that
 * change after mount are signals read inside the query callback, so the
 * query recompiles on a reactive read the way an application's does. A barq
 * write is staged until `flush()`, so the observation cut after a parameter
 * change is the flush that follows the write.
 *
 * All registered laws must pass; the driver declares no waivers.
 */

import {
  createRenderEffect,
  createRoot,
  createSignal,
  createStore,
  flush,
  onCleanup,
} from "@barqjs/core";
import {
  BTreeIndex,
  BasicIndex,
  type PooledLiveQueries,
  coalesce,
  count,
  createCollection,
  createLiveQueryCollection,
  createOptimisticAction,
  eq,
  groupKeys,
  gt,
  localOnlyCollectionOptions,
  sum,
} from "@tanstack/db";
import { describe, expect, it } from "vitest";

import type {
  ConformanceResult,
  ControllableHandle,
  DeferredSourceHandle,
  LiveQueryDriver,
  LiveQueryHandle,
  QueryBuild,
  SourceHandle,
} from "@tanstack-db-tests/conformance/contract";
import { makeErrorSource } from "@tanstack-db-tests/conformance/error-source";
import { makeLaggingSource } from "@tanstack-db-tests/conformance/lagging-source";
import { createPublicationLog } from "@tanstack-db-tests/conformance/publication-log";
import { expectResultSurface, selectedRowKeys } from "@tanstack-db-tests/conformance/result-laws";
import { runRowSnapshotHistories } from "@tanstack-db-tests/conformance/row-snapshot-oracle";
import { withScopeSetup } from "@tanstack-db-tests/conformance/scope-setup";
import { runSuite } from "@tanstack-db-tests/conformance/suite";
import { makeSyncSource } from "@tanstack-db-tests/conformance/sync-source";

import { useLiveQuery } from "../src/index.ts";
import { registerDriver } from "./oracles.ts";
import { controlledCollection } from "./sources.ts";

/** The builder a query callback receives, as the suite's contract types it. */
type Builder = Parameters<QueryBuild>[0];
type AnyCollection = SourceHandle["collection"];

let sequence = 0;

interface Result {
  readonly data: unknown;
  readonly state: ReadonlyMap<unknown, unknown> | undefined;
  readonly status: string;
  readonly isReady: boolean;
  readonly isLoadingError: boolean;
  readonly isCrashed: boolean;
  readonly isSyncError: boolean;
  readonly isEnabled: boolean;
  readonly health: ConformanceResult["health"];
  readonly collection: AnyCollection | undefined;
}

function live(input: unknown): Result {
  return (useLiveQuery as (input: unknown) => Result)(input);
}

interface KeyedRow {
  id: string;
}

function writer<T extends KeyedRow>(collection: ReturnType<typeof controlledCollection<T>>) {
  return (type: "insert" | "update" | "delete", value: T): void => {
    collection.utils.begin();
    collection.utils.write({ type, value });
    collection.utils.commit();
  };
}

interface SourceOptions {
  rowUpdateMode?: "full";
}

function makeSource<T extends KeyedRow>(
  initialData: ReadonlyArray<T>,
  collectionId?: string,
  options?: SourceOptions,
): SourceHandle<T> {
  const collection = controlledCollection<T>({
    id: collectionId ?? `conformance-barq-${sequence++}`,
    getKey: (row) => row.id,
    initialData,
    rowUpdateMode: options?.rowUpdateMode,
  });
  const write = writer(collection);
  return {
    collection,
    insert: (row) => write("insert", row),
    update: (row) => write("update", row),
    remove: (row) => write("delete", row),
  };
}

function makeDeferredSource<T extends KeyedRow>(): DeferredSourceHandle<T> {
  const collection = controlledCollection<T>({
    id: `conformance-barq-${sequence++}`,
    getKey: (row) => row.id,
  });
  collection.startSyncImmediate();
  const write = writer(collection);
  return {
    collection,
    insert: (row) => write("insert", row),
    update: (row) => write("update", row),
    remove: (row) => write("delete", row),
    emit: (rows) => {
      collection.utils.begin();
      for (const value of rows) collection.utils.write({ type: "insert", value });
      collection.utils.commit();
    },
    markReady: () => collection.utils.markReady(),
  };
}

interface PrecreatedOptions {
  startSync?: boolean;
  gcTime?: number;
}

function makePrecreated(build: QueryBuild, opts?: PrecreatedOptions) {
  return {
    collection: createLiveQueryCollection({
      query: build as never,
      startSync: opts?.startSync ?? true,
      gcTime: opts?.gcTime,
    }),
  };
}

/** The suite's cut: barq's staged writes applied, then core sync given time to settle. */
async function settle(): Promise<void> {
  flush();
  await new Promise((resolve) => setTimeout(resolve, 10));
  flush();
}

function surface(result: Result): ConformanceResult {
  return expectResultSurface({
    data: result.data,
    state: result.state,
    status: result.status,
    isReady: result.isReady,
    isLoadingError: result.isLoadingError,
    isCrashed: result.isCrashed,
    isSyncError: result.isSyncError,
    isEnabled: result.isEnabled,
    health: result.health,
  });
}

function makeHandle(result: Result, dispose: () => void): LiveQueryHandle {
  return {
    collection: () => result.collection ?? null,
    current: () => surface(result),
    flush: settle,
    async apply(fn) {
      fn();
      await settle();
    },
    unmount: dispose,
  };
}

interface RootedResult {
  result: Result;
  dispose: () => void;
}

function inRoot(build: () => Result): RootedResult {
  let result!: Result;
  let dispose!: () => void;
  withScopeSetup(
    () =>
      createRoot((release) => {
        dispose = release;
        result = build();
      }),
    () => dispose(),
  );
  return { result, dispose };
}

function mount(build: QueryBuild): LiveQueryHandle {
  const { result, dispose } = inRoot(() => live(build));
  return makeHandle(result, dispose);
}

function mountCollection(collection: AnyCollection): LiveQueryHandle {
  const { result, dispose } = inRoot(() => live(collection));
  return makeHandle(result, dispose);
}

function mountConfig(build: QueryBuild, opts?: Parameters<LiveQueryDriver["mountConfig"]>[1]) {
  const { result, dispose } = inRoot(() => live({ query: build, ...opts }));
  return makeHandle(result, dispose);
}

function mountDisabled(): LiveQueryHandle {
  const { result, dispose } = inRoot(() => live(() => null));
  return makeHandle(result, dispose);
}

const REJECTED = Symbol("rejected");

interface ControllableOptions {
  pool?: PooledLiveQueries;
}

interface ParamBox<P> {
  value: P;
}

function mountControllable<P>(
  build: (q: Builder, param: P) => unknown,
  initial: P,
  opts?: ControllableOptions,
): ControllableHandle<P> {
  const [param, setParam] = createSignal<ParamBox<P>>({ value: initial });
  const published = createPublicationLog();
  function record(result: Result): void {
    const shown = read(result);
    if (shown !== REJECTED) published.record(shown.data, shown.state);
  }
  const { result, dispose } = inRoot(() => {
    const query =
      opts?.pool === undefined
        ? live((q: Builder) => build(q, param().value))
        : live(() => {
            const { value } = param();
            return { query: (q: Builder) => build(q, value), pool: opts.pool };
          });
    // barq paints what its render effects read.
    createRenderEffect(
      () => read(query),
      (shown) => {
        if (shown !== REJECTED) published.record(shown.data, shown.state);
      },
    );
    return query;
  });
  return {
    ...makeHandle(result, dispose),
    publications: published.values,
    statePublications: published.stateValues,
    async setParam(next, observe) {
      setParam({ value: next });
      flush();
      observe?.();
      // The first paint after the change: the write is applied, no later task has run.
      record(result);
      await settle();
    },
  };
}

interface ReadSnapshot {
  data: unknown;
  state: Result["state"];
}

/** A render that throws shows nothing; the suite reads the rejection through `current()`. */
function read(result: Result): ReadSnapshot | typeof REJECTED {
  try {
    return { data: result.data, state: result.state };
  } catch {
    return REJECTED;
  }
}

/** A row the way barq hands one out: behind a store's proxy. */
function inStore<T extends object>(value: T): T {
  return createStore(value as Record<string, unknown>)[0] as unknown as T;
}

const barqDriver: LiveQueryDriver = {
  name: "barq",
  parameterObservationCut: "flush() after the write",
  // Reactive reads decide when the query compiles again.
  comparesQueryIdentity: false,
  disabledRepresentation: "absent",
  ops: { eq, gt, count, sum, coalesce, groupKeys, createOptimisticAction },
  indexTypes: { basic: BasicIndex, btree: BTreeIndex },
  makeSource,
  wrapSnapshotValue: inStore,
  makeDeferredSource,
  makeLaggingSource: <T extends KeyedRow>() =>
    makeLaggingSource<T>(createCollection, `conformance-barq-lagging-${sequence++}`),
  makeSyncSource: <T extends KeyedRow>(data: ReadonlyArray<T>) =>
    makeSyncSource<T>(createCollection, `conformance-barq-health-${sequence++}`, data),
  makePrecreated,
  makeErrorSource: (kind) =>
    makeErrorSource(createCollection, `conformance-barq-err-${sequence++}`, kind),
  mount,
  mountControllable,
  mountCollection,
  mountConfig,
  mountDisabled,
  errorSurface: "flag",
  limits: [],
  features: { serverSnapshot: false, suspense: false, pooledEqFilters: true },
};

describe("owned native scope setup", () => {
  it("keeps a successful scope alive until explicit disposal", () => {
    let calls = 0;
    const handle = inRoot(() => {
      onCleanup(() => {
        calls++;
      });
      return {} as Result;
    });
    expect(calls).toBe(0);
    handle.dispose();
    expect(calls).toBe(1);
  });

  it("disposes a failed setup and keeps its error", () => {
    const primary = new Error("scope setup failure");
    let calls = 0;
    expect(() =>
      inRoot(() => {
        onCleanup(() => {
          calls++;
        });
        throw primary;
      }),
    ).toThrow(primary);
    expect(calls).toBe(1);
  });
});

registerDriver(barqDriver.name);
runSuite(barqDriver);

// A local-only source hands the hook the transaction's own drafts. Keep that
// path on the same snapshot law as the suite's controlled sync source.
it.each(["callback", "config", "collection"] as const)(
  "preserves local-only row snapshots through the %s input",
  async (input) => {
    await runRowSnapshotHistories(
      {
        ...barqDriver,
        name: "barq-local-only",
        snapshotSourceUsesDraft: true,
        makeSource<T extends KeyedRow>(
          initialData: ReadonlyArray<T>,
          collectionId?: string,
          options?: SourceOptions,
        ) {
          const collection = createCollection(
            localOnlyCollectionOptions<T>({
              id: collectionId,
              getKey: (row) => row.id,
              initialData: [...initialData],
            }),
          );
          return {
            collection,
            insert: (row: T) => {
              collection.insert(row);
            },
            update: (row: T) =>
              collection.update(row.id, (draft) => {
                if (options?.rowUpdateMode === "full") {
                  for (const key of selectedRowKeys(draft)) {
                    if (!Object.hasOwn(row, key)) Reflect.deleteProperty(draft, key);
                  }
                }
                Object.assign(draft, row);
              }),
            remove: (row: T) => {
              collection.delete(row.id);
            },
          };
        },
      },
      input,
      "sync",
    );
  },
);
