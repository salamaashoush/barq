import {
  type Cell,
  type JSXElement,
  type Scope,
  block,
  cell,
  context,
  provide,
  read,
  readSlot,
  signal,
} from "@barqjs/core";
import type { QueryClient } from "@tanstack/query-core";

const CLIENT = context<QueryClient>(undefined, "barq-query-client");
const RESTORING = context<() => boolean>(undefined, "barq-query-restoring");

export interface QueryClientProviderProps {
  client: QueryClient;
  children?: unknown;
}

/**
 * Forks the context on its own instance scope and builds `children` INSIDE it,
 * so a consumer constructed below sees this client rather than an outer one.
 */
export const QueryClientProvider = block(
  (scope: Scope | null, props: { client: Cell<QueryClient>; children?: unknown }): unknown => {
    const client = readSlot(props.client, "QueryClientProvider.client") as QueryClient;
    return provide(scope as Scope, CLIENT, cell(client), (inner: Scope | null) => {
      const children = props.children;
      return typeof children === "function"
        ? (children as (s: Scope | null) => unknown)(inner)
        : children;
    });
  },
) as unknown as (props: QueryClientProviderProps) => JSXElement;

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
      "[barq] no QueryClient in scope. Wrap the tree in `<QueryClientProvider client={…}>`, " +
        "or pass one to this hook.",
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
export const IsRestoringProvider = block(
  (scope: Scope | null, props: { value: Cell<() => boolean>; children?: unknown }): unknown => {
    const value = readSlot(props.value, "IsRestoringProvider.value") as () => boolean;
    return provide(scope as Scope, RESTORING, cell(value), (inner: Scope | null) => {
      const children = props.children;
      return typeof children === "function"
        ? (children as (s: Scope | null) => unknown)(inner)
        : children;
    });
  },
) as unknown as (props: IsRestoringProviderProps) => JSXElement;

const NOT_RESTORING = signal(false);

export function useIsRestoring(): () => boolean {
  try {
    return read(RESTORING)();
  } catch {
    // No provider is the ordinary case: nothing is restoring.
    return NOT_RESTORING;
  }
}
