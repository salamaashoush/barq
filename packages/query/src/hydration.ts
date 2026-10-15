import { type Cell, type JSXElement, createRenderEffect, readSlot, untrack } from "@barqjs/core";
import {
  type DehydratedState,
  type HydrateOptions,
  type OmitKeyof,
  type QueryClient,
  hydrate,
} from "@tanstack/query-core";

import { built, useQueryClient } from "./client.ts";
import { carried } from "./seed.ts";

export interface HydrationBoundaryProps {
  state: DehydratedState | null | undefined;
  options?: OmitKeyof<HydrateOptions, "defaultOptions"> & {
    defaultOptions?: OmitKeyof<Exclude<HydrateOptions["defaultOptions"], undefined>, "mutations">;
  };
  children?: unknown;
  queryClient?: QueryClient;
}

type Dehydrated = DehydratedState["queries"];

/**
 * Put dehydrated state into the client in scope, before what is below reads it.
 *
 * A query the cache has never seen is hydrated while this component is being
 * built, so a `useQuery` constructed underneath starts with its data. One the
 * cache already holds is left for an effect: writing it now would notify
 * observers that are already on screen, from inside the build of a different
 * part of the tree.
 */
export const HydrationBoundary = ((props: {
  state: Cell<DehydratedState | null | undefined>;
  options?: Cell<HydrationBoundaryProps["options"]>;
  children?: unknown;
  queryClient?: Cell<QueryClient | undefined>;
}): unknown => {
  const client = useQueryClient(
    readSlot(props.queryClient, "HydrationBoundary.queryClient") as QueryClient | undefined,
  );
  const options = (): HydrateOptions | undefined =>
    readSlot(props.options, "HydrationBoundary.options") as HydrateOptions | undefined;

  const sorted = (): Dehydrated => {
    const state = readSlot(props.state, "HydrationBoundary.state") as
      | DehydratedState
      | null
      | undefined;
    const queries = state?.queries ?? [];
    const cache = client.getQueryCache();
    const unseen: Dehydrated = [];
    const newer: Dehydrated = [];
    for (const dehydrated of queries) {
      carried(client).add(dehydrated.queryHash);
      const existing = cache.get(dehydrated.queryHash);
      if (existing === undefined) {
        unseen.push(dehydrated);
        continue;
      }
      const settledSince =
        dehydrated.promise !== undefined &&
        existing.state.status !== "pending" &&
        existing.state.fetchStatus !== "fetching" &&
        dehydrated.dehydratedAt !== undefined &&
        dehydrated.dehydratedAt > existing.state.dataUpdatedAt;
      if (dehydrated.state.dataUpdatedAt > existing.state.dataUpdatedAt || settledSince) {
        newer.push(dehydrated);
      }
    }
    if (unseen.length > 0) hydrate(client, { queries: unseen }, untrack(options));
    return newer;
  };

  createRenderEffect(sorted, (newer) => {
    if (newer.length > 0) hydrate(client, { queries: newer }, untrack(options));
  });

  return built(props.children);
}) as unknown as (props: HydrationBoundaryProps) => JSXElement;
