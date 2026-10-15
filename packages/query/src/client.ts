import {
  type Cell,
  type JSXElement,
  cell,
  createContext,
  isServer,
  onCleanup,
  provide,
  read,
  readSlot,
  createSignal,
} from "@barqjs/core";
import type { QueryClient } from "@tanstack/query-core";

const CLIENT = createContext<QueryClient>(undefined, "barq-query-client");
const RESTORING = createContext<() => boolean>(undefined, "barq-query-restoring");

export interface QueryClientProviderProps {
  client: QueryClient;
  children?: unknown;
}

/**
 * Forks the context on its own instance scope and builds `children` INSIDE it,
 * so a consumer constructed below sees this client rather than an outer one.
 */
export const QueryClientProvider = ((props: {
  client: Cell<QueryClient>;
  children?: unknown;
}): unknown => {
  const client = readSlot(props.client, "QueryClientProvider.client") as QueryClient;
  return provideClient(client, () => built(props.children));
}) as unknown as (props: QueryClientProviderProps) => JSXElement;

/** A children slot, built: the compiler hands one over as a thunk. */
export function built(children: unknown): unknown {
  return typeof children === "function" ? (children as () => unknown)() : children;
}

/** `QueryClientProvider` for a caller that already has the client and a builder in hand. */
export function provideClient(client: QueryClient, build: () => unknown): unknown {
  return provide(CLIENT, cell(client), () => {
    // A client listens for the window's focus and the network's return only
    // while something has mounted it, and counts its mounts, so two providers
    // over one client are safe. A string render has neither to listen to.
    if (!isServer) {
      client.mount();
      onCleanup(() => client.unmount());
    }
    return build();
  });
}

/** `QueryClientProvider` and `IsRestoringProvider` in one scope, for a provider that is both. */
export function provideRestoring(
  client: QueryClient,
  restoring: () => boolean,
  children: unknown,
): unknown {
  return provideClient(client, () => provide(RESTORING, cell(restoring), () => built(children)));
}

/**
 * The client in scope, or the one you hand in.
 *
 * Every hook here takes the same optional argument, which is what makes a
 * query usable outside a provider — in a test, or in a route loader that has
 * the client in hand and no component tree to read it through.
 */
export function useQueryClient(queryClient?: QueryClient): QueryClient {
  if (queryClient !== undefined) return queryClient;
  try {
    return read(CLIENT)();
  } catch (cause) {
    throw new Error(
      "[barq] A query hook was called with no `QueryClient` available, so there is no cache to run it against. " +
        "Wrap the tree in `<QueryClientProvider client={queryClient}>`, or pass the client as the hook's last argument.",
      { cause },
    );
  }
}

export interface IsRestoringProviderProps {
  value: () => boolean;
  children?: unknown;
}

/**
 * Whether a persister is restoring the cache from storage.
 *
 * While it is, an observer must not fetch: the data it would fetch is about to
 * arrive from disk, and the two would race. `@tanstack/query-persist-client-core`
 * drives this, and every hook below reads it — which is why it exists here
 * rather than in whatever package eventually wraps the persister.
 */
export const IsRestoringProvider = ((props: {
  value: Cell<() => boolean>;
  children?: unknown;
}): unknown => {
  const value = readSlot(props.value, "IsRestoringProvider.value") as () => boolean;
  return provide(RESTORING, cell(value), () => built(props.children));
}) as unknown as (props: IsRestoringProviderProps) => JSXElement;

const [NOT_RESTORING] = createSignal(false);

export function useIsRestoring(): () => boolean {
  try {
    return read(RESTORING)();
  } catch {
    // No provider is the ordinary case: nothing is restoring.
    return NOT_RESTORING;
  }
}
