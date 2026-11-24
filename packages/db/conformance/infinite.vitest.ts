/**
 * barq's driver for TanStack DB's shared infinite-query conformance suite.
 *
 * A `createRoot` owns the hook and its dispose is the unmount. Inputs that
 * change are signals the query callback or the config accessor reads. A render
 * effect records what the hook publishes, the value barq would paint.
 */

import { createRenderEffect, createRoot, createSignal, flush, onCleanup } from "@barqjs/core";
import {
  BTreeIndex,
  createCollection,
  createLiveQueryCollection,
  createLiveQueryWindowController,
  eq,
  gt,
} from "@tanstack/db";
import { describe, expect, it } from "vitest";

import type { QueryBuild, SourceHandle } from "@tanstack-db-tests/conformance/contract";
import type {
  InfiniteQueryConfig,
  InfiniteQueryDriver,
  InfiniteQueryHandle,
  InfiniteQueryObservation,
  InfiniteQueryResult,
} from "@tanstack-db-tests/conformance/infinite-contract";
import { makeInfiniteOnDemandSource } from "@tanstack-db-tests/conformance/infinite-on-demand";
import { runInfiniteQuerySuite } from "@tanstack-db-tests/conformance/infinite-suite";
import { registerInfiniteQueryUnitScenarios } from "@tanstack-db-tests/conformance/infinite-suite-cases";
import { withScopeSetup } from "@tanstack-db-tests/conformance/scope-setup";

import { useLiveInfiniteQuery } from "../src/index.ts";
import { controlledCollection } from "./sources.ts";

/** The builder a query callback receives, as the suite's contract types it. */
type Builder = Parameters<QueryBuild>[0];
type AnyCollection = SourceHandle["collection"];

let sequence = 0;

type Result = InfiniteQueryResult & { fetchNextPage: () => Promise<void> };

function infinite(input: unknown, config: unknown): Result {
  return (useLiveInfiniteQuery as (input: unknown, config: unknown) => Result)(input, config);
}

interface KeyedRow {
  id: string;
}

function makeSource<T extends KeyedRow>(
  initialData: ReadonlyArray<T>,
  collectionId?: string,
): SourceHandle<T> {
  const collection = controlledCollection<T>({
    autoIndex: "eager",
    id: collectionId ?? `infinite-conformance-barq-${sequence++}`,
    getKey: (row) => row.id,
    initialData,
  });
  function write(type: "insert" | "update" | "delete", value: T): void {
    collection.utils.begin();
    collection.utils.write({ type, value });
    collection.utils.commit();
  }
  return {
    collection,
    insert: (row) => write("insert", row),
    update: (row) => write("update", row),
    remove: (row) => write("delete", row),
  };
}

async function settle(): Promise<void> {
  flush();
  await new Promise((resolve) => setTimeout(resolve, 0));
  flush();
}

function observe(result: Result): InfiniteQueryObservation {
  return {
    status: result.status,
    ids: result.data.map((row: KeyedRow) => row.id),
    pages: result.pages.map((page: Array<KeyedRow>) => page.map((row) => row.id)),
    hasNextPage: result.hasNextPage,
  };
}

function inRoot(build: () => Result) {
  let result!: Result;
  let dispose!: () => void;
  const log: Array<InfiniteQueryObservation> = [];
  withScopeSetup(
    () =>
      createRoot((release) => {
        dispose = release;
        result = build();
        // A hook that rejects its input throws from the mount.
        observe(result);
        // What barq paints: every value a render effect reads. A rejection
        // after mount paints nothing; `current()` reports it.
        createRenderEffect(
          () => {
            try {
              return observe(result);
            } catch {
              return undefined;
            }
          },
          (observation) => {
            if (observation !== undefined) log.push(observation);
          },
        );
      }),
    () => dispose(),
  );
  return { result, dispose, log };
}

function makeHandle(
  result: Result,
  dispose: () => void,
  log: Array<InfiniteQueryObservation>,
): InfiniteQueryHandle {
  return {
    observations: () => log,
    current: () => ({
      data: result.data,
      pages: result.pages,
      pageParams: result.pageParams,
      hasNextPage: result.hasNextPage,
      isFetchingNextPage: result.isFetchingNextPage,
      isLoadingError: result.isLoadingError,
      status: result.status,
      collection: result.collection,
    }),
    fetchNextPage: () => result.fetchNextPage(),
    flush: settle,
    async apply(fn) {
      fn();
      await settle();
    },
    unmount: dispose,
  };
}

function mount(build: QueryBuild, config: InfiniteQueryConfig = {}): InfiniteQueryHandle {
  const { result, dispose, log } = inRoot(() => infinite(build, config));
  return makeHandle(result, dispose, log);
}

interface ParamBox<P> {
  value: P;
}

function mountControllable<P>(
  build: (q: Builder, param: P) => unknown,
  initial: P,
  config: InfiniteQueryConfig = {},
) {
  const [param, setParam] = createSignal<ParamBox<P>>({ value: initial });
  const { result, dispose, log } = inRoot(() =>
    infinite((q: Builder) => build(q, param().value), config),
  );
  return {
    ...makeHandle(result, dispose, log),
    setParamSync(next: P) {
      setParam({ value: next });
    },
  };
}

function mountCollection(
  collection: AnyCollection,
  config: InfiniteQueryConfig = {},
): InfiniteQueryHandle {
  const { result, dispose, log } = inRoot(() => infinite(collection, config));
  return makeHandle(result, dispose, log);
}

function mountCollectionControllable(initial: AnyCollection, config: InfiniteQueryConfig = {}) {
  const [collection, setCollection] = createSignal(initial);
  const { result, dispose, log } = inRoot(() => infinite(() => collection(), config));
  return {
    ...makeHandle(result, dispose, log),
    replaceCollectionSync(next: AnyCollection) {
      setCollection(() => next);
    },
  };
}

function mountConfigControllable(build: QueryBuild, initial: InfiniteQueryConfig) {
  const [config, setConfig] = createSignal<InfiniteQueryConfig>({ ...initial });
  const { result, dispose, log } = inRoot(() => infinite(build, () => config()));
  return {
    ...makeHandle(result, dispose, log),
    setConfigSync(next: InfiniteQueryConfig) {
      setConfig({ ...next });
    },
  };
}

function mountInputControllable(
  collection: AnyCollection,
  build: QueryBuild,
  config: InfiniteQueryConfig = {},
) {
  const [kind, setKind] = createSignal<"collection" | "query">("collection");
  const { result, dispose, log } = inRoot(() =>
    infinite((q: Builder) => (kind() === "collection" ? collection : build(q)), config),
  );
  return {
    ...makeHandle(result, dispose, log),
    setInputKindSync(next: "collection" | "query") {
      setKind(next);
    },
  };
}

const barqInfiniteDriver: InfiniteQueryDriver = {
  name: "barq",
  // Reactive reads decide when the query compiles again.
  comparesQueryIdentity: false,
  gt,
  eq,
  makeSource,
  makeOnDemandSource: (data, delay) =>
    makeInfiniteOnDemandSource({ createCollection, BTreeIndex }, data, delay),
  makeLaggingOnDemandSource: (data) =>
    makeInfiniteOnDemandSource({ createCollection, BTreeIndex }, data, undefined, "lagging"),
  makePrecreated: (build) => ({ collection: createLiveQueryCollection({ query: build as never }) }),
  makeWindowController: createLiveQueryWindowController,
  mount,
  mountControllable,
  mountCollection,
  mountCollectionControllable,
  mountConfigControllable,
  mountInputControllable,
  limits: [],
};

runInfiniteQuerySuite(barqInfiniteDriver, registerInfiniteQueryUnitScenarios);

describe("infinite driver scope ownership", () => {
  it("retains a successful scope until its owner disposes", () => {
    let calls = 0;
    const { dispose } = inRoot(() => {
      onCleanup(() => {
        calls++;
      });
      return { data: [], pages: [], hasNextPage: false } as unknown as Result;
    });
    expect(calls).toBe(0);
    dispose();
    expect(calls).toBe(1);
  });
});
