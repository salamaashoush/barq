import {
  type Cell,
  type JSXElement,
  createEffect,
  createRenderEffect,
  createSignal,
  isServer,
  readSlot,
} from "@barqjs/core";
import type { OmitKeyof, QueryClient } from "@tanstack/query-core";
import {
  type PersistQueryClientOptions,
  persistQueryClientRestore,
  persistQueryClientSubscribe,
} from "@tanstack/query-persist-client-core";

import { type QueryClientProviderProps, provideRestoring } from "./client.ts";

export type PersistQueryClientProviderProps = QueryClientProviderProps & {
  persistOptions: OmitKeyof<PersistQueryClientOptions, "queryClient">;
  /** Called once restoring finishes, whether or not anything was restored. */
  onSuccess?: () => unknown;
  /** Called when restoring, or `onSuccess`, throws. */
  onError?: () => unknown;
};

type Persisted = OmitKeyof<PersistQueryClientOptions, "queryClient">;

/**
 * `QueryClientProvider`, with the cache restored from storage before any query
 * below it fetches, and written back as it changes.
 *
 * Every hook reads `useIsRestoring`, so a query built while the restore is in
 * flight reports idle rather than racing the storage for the same data.
 */
export const PersistQueryClientProvider = ((props: {
  client: Cell<QueryClient>;
  persistOptions: Cell<Persisted>;
  onSuccess?: Cell<PersistQueryClientProviderProps["onSuccess"]>;
  onError?: Cell<PersistQueryClientProviderProps["onError"]>;
  children?: unknown;
}): unknown => {
  const client = readSlot(props.client, "PersistQueryClientProvider.client") as QueryClient;
  // A string render has no storage to restore from and nothing to wait for.
  const [isRestoring, setIsRestoring] = createSignal(!isServer);

  const options = (): PersistQueryClientOptions => ({
    ...(readSlot(props.persistOptions, "PersistQueryClientProvider.persistOptions") as Persisted),
    queryClient: client,
  });

  // `createEffect`, whose second half may write: restoring starts over when
  // the options change, and says so before the storage answers.
  createEffect(options, (resolved) => {
    if (isServer) return undefined;
    let superseded = false;
    setIsRestoring(true);
    const settled = (callback: Cell<(() => unknown) | undefined> | undefined, origin: string) =>
      (readSlot(callback, origin) as (() => unknown) | undefined)?.();
    persistQueryClientRestore(resolved)
      .then(() => settled(props.onSuccess, "PersistQueryClientProvider.onSuccess"))
      .catch(() => settled(props.onError, "PersistQueryClientProvider.onError"))
      .finally(() => {
        if (!superseded) setIsRestoring(false);
      });
    return () => {
      superseded = true;
    };
  });

  createRenderEffect(
    () => (isRestoring() ? undefined : options()),
    (resolved) => (resolved === undefined ? undefined : persistQueryClientSubscribe(resolved)),
  );

  return provideRestoring(client, isRestoring, props.children);
}) as unknown as (props: PersistQueryClientProviderProps) => JSXElement;
