import { type JSXElement, isServer } from "@barqjs/core";
import { type RouterState, isRedirect, useRouteContext } from "@barqjs/router";
import {
  type DehydrateOptions,
  type DehydratedState,
  type HydrateOptions,
  type QueryClient,
  defaultShouldDehydrateQuery,
  dehydrate,
  hydrate,
} from "@tanstack/query-core";

import { built, provideClient } from "./client.ts";
import { seededByRead } from "./seed.ts";

/**
 * What the integration puts in the router context, and reads back out of it.
 *
 * A type alias rather than an interface: a route's `context` and
 * `createRootRouteWithContext` take a `Record<string, unknown>`, and an
 * interface has no index signature to satisfy one.
 */
export type QueryRouterContext = {
  queryClient: QueryClient;
};

/**
 * A root route's `context`, handing every loader and component a `QueryClient`.
 *
 * The router runs a root `context()` once for each request it renders on the
 * server and again on every navigation in the browser. One call is one client
 * on the server, so nothing one visitor fetched can answer another's request,
 * and every call in the browser gets the first one's client back, so a
 * navigation does not start from an empty cache.
 */
export function queryClientContext(create: () => QueryClient): () => QueryRouterContext {
  let browser: QueryClient | undefined;
  return () => {
    if (isServer) return { queryClient: create() };
    browser ??= create();
    return { queryClient: browser };
  };
}

/** The client the router context holds, for a component that is not handed its route's props. */
export function useRouterQueryClient(): QueryClient {
  const context = useRouteContext<Partial<QueryRouterContext> & Record<string, unknown>>();
  const client = context().queryClient;
  if (client === undefined) {
    throw new Error(
      "[barq] `useRouterQueryClient()` found no `queryClient` in the router context, so there is no cache to run queries against. " +
        "Give the root route `context: queryClientContext(() => new QueryClient())`.",
    );
  }
  return client;
}

export interface RouterQueryClientProviderProps {
  children?: unknown;
}

/**
 * `QueryClientProvider` over the client in the router context, for a root
 * route's component to put around its children.
 *
 * `setupRouterSsrQueryIntegration` provides the client through the router's
 * `Wrap` instead, so an application that calls it needs this only with
 * `wrapQueryClient: false`.
 */
export const RouterQueryClientProvider = ((props: { children?: unknown }): unknown =>
  provideClient(useRouterQueryClient(), () => built(props.children))) as unknown as (
  props: RouterQueryClientProviderProps,
) => JSXElement;

export interface RouterSsrQueryOptions {
  router: RouterState;
  queryClient: QueryClient;
  /** Which queries cross, and how their data is written. The client's own defaults otherwise. */
  dehydrateOptions?: DehydrateOptions;
  hydrateOptions?: HydrateOptions;
  /**
   * Follow a redirect a query or a mutation fails with.
   * @default true
   */
  handleRedirects?: boolean;
  /**
   * Provide the client to the whole router through its `Wrap`. Turn it off for
   * an application that places its own `QueryClientProvider`.
   * @default true
   */
  wrapQueryClient?: boolean;
}

type Dehydrated = DehydratedState["queries"];

/** What the integration adds to the router's dehydrated payload. */
interface DehydratedQueries {
  readonly query: {
    /** What the cache held when the loaders had settled. */
    readonly initial: Dehydrated;
    /** What settled between then and the end of the render, in batches. Absent when nothing can. */
    readonly stream?: AsyncIterable<Dehydrated>;
  };
}

/** Batches handed over as they are pushed, to one reader, until closed. */
function channel<T>(): { push(value: T): void; close(): void; values: AsyncIterable<T> } {
  const buffered: T[] = [];
  let closed = false;
  let wake: (() => void) | null = null;
  const woken = (): void => {
    const waiter = wake;
    wake = null;
    waiter?.();
  };
  return {
    push(value) {
      buffered.push(value);
      woken();
    },
    close() {
      closed = true;
      woken();
    },
    values: {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          while (buffered.length > 0) yield buffered.shift() as T;
          if (closed) return;
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      },
    },
  };
}

/**
 * The server half: the request's cache, carried in the router's own payload.
 *
 * A query a component read is already crossing with that read, which is also
 * what keeps the browser's observer from fetching it again, so this carries the
 * rest: what a loader put in the cache and nothing rendered from.
 */
function carryQueries(options: RouterSsrQueryOptions): void {
  const { router, queryClient } = options;
  const configured = router.options.dehydrate;

  router.options.dehydrate = async (): Promise<object | undefined> => {
    const base = (await configured?.()) as object | undefined;
    const defaults = queryClient.getDefaultOptions().dehydrate;
    const wanted =
      options.dehydrateOptions?.shouldDehydrateQuery ??
      defaults?.shouldDehydrateQuery ??
      defaultShouldDehydrateQuery;
    const sent = new Set<string>();
    const take = (): Dehydrated => {
      const read = seededByRead(queryClient);
      const batch = dehydrate(queryClient, {
        ...options.dehydrateOptions,
        shouldDehydrateMutation: () => false,
        shouldDehydrateQuery: (query) =>
          !sent.has(query.queryHash) && !read.has(query.queryHash) && wanted(query),
      }).queries;
      for (const query of batch) sent.add(query.queryHash);
      return batch;
    };

    const initial = take();
    const later = channel<Dehydrated>();
    let scheduled = false;
    const flush = (): void => {
      scheduled = false;
      const batch = take();
      if (batch.length > 0) later.push(batch);
    };
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (scheduled || sent.has(event.query.queryHash)) return;
      scheduled = true;
      // One batch for everything that settles in the same turn.
      queueMicrotask(flush);
    });
    let finished = false;
    const finish = (): void => {
      finished = true;
      unsubscribe();
      flush();
      later.close();
    };
    if (router.serverSsr === undefined) finish();
    else router.serverSsr.onRenderFinished(finish);

    // A render that has already produced its last byte has nothing left to
    // settle, so the page carries the snapshot alone, or nothing at all.
    if (!finished) return { ...base, query: { initial, stream: later.values } };
    return initial.length === 0 ? base : { ...base, query: { initial } };
  };
}

/** The browser half: the payload into the cache, and the batches behind it as they arrive. */
function absorbQueries(options: RouterSsrQueryOptions): void {
  const { router, queryClient } = options;
  const configured = router.options.hydrate;

  router.options.hydrate = async (dehydrated: Partial<DehydratedQueries>): Promise<void> => {
    await configured?.(dehydrated as never);
    const carried = dehydrated.query;
    if (carried === undefined) return;
    const put = (queries: Dehydrated): void =>
      hydrate(queryClient, { mutations: [], queries }, options.hydrateOptions);
    put(carried.initial);
    const stream = carried.stream;
    if (stream === undefined) return;
    void (async () => {
      for await (const batch of stream) put(batch);
    })().catch((error: unknown) =>
      console.error(
        "[barq] Reading the queries streamed from the server failed, so queries that settled on the server after the first render did not reach the browser's cache. The error:",
        error,
      ),
    );
  };
}

/**
 * Tie a client to a router for as long as the returned function is not called.
 *
 * Called from `getRouter`, which runs once for each request on the server and
 * once in the browser, so the client it is handed is that request's own. On
 * the server it carries the cache to the page; in the browser it puts that
 * cache back before the first render and goes where a failed query says to.
 * Either way the client is provided to every route through the router's `Wrap`.
 */
export function setupRouterSsrQueryIntegration(options: RouterSsrQueryOptions): () => void {
  const { router, queryClient } = options;
  const before = { ...router.options };
  const undo: (() => void)[] = [
    () => {
      Object.assign(router.options, before);
    },
  ];

  if (options.wrapQueryClient !== false) {
    const configured = router.options.Wrap;
    router.options.Wrap = (props) =>
      provideClient(queryClient, () =>
        configured === undefined ? props.children() : configured(props),
      );
  }

  if (isServer) carryQueries(options);
  else {
    absorbQueries(options);
    if (options.handleRedirects !== false) undo.push(followRedirects(router, queryClient));
  }

  return () => {
    for (const step of undo) step();
  };
}

function followRedirects(router: RouterState, queryClient: QueryClient): () => void {
  const follow = (thrown: unknown): boolean => {
    if (!isRedirect(thrown)) return false;
    // An options-form redirect carries its search and params; a string one
    // has only where it goes.
    const described = "options" in thrown ? thrown.options : undefined;
    const going =
      described === undefined
        ? router.navigate(thrown.to as never)
        : router.navigate(described as never);
    going.catch(() => {});
    return true;
  };

  const queries = queryClient.getQueryCache();
  const mutations = queryClient.getMutationCache();
  const queryConfig = queries.config;
  const mutationConfig = mutations.config;
  queries.config = {
    ...queryConfig,
    onError: (error, query) => {
      if (!follow(error)) queryConfig.onError?.(error, query);
    },
  };
  mutations.config = {
    ...mutationConfig,
    onError: (error, ...rest) =>
      follow(error) ? undefined : mutationConfig.onError?.(error, ...rest),
  };

  return () => {
    queries.config = queryConfig;
    mutations.config = mutationConfig;
  };
}
