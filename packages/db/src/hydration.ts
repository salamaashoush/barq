import {
  type Cell,
  type JSXElement,
  createRenderEffect,
  readSlot,
  runWithOwner,
  untrack,
} from "@barqjs/core";
import type { DehydratedDbState } from "@tanstack/db";

import { built, useDbClient } from "./client.ts";

export interface HydrationBoundaryProps {
  state: DehydratedDbState;
  children?: unknown;
}

/**
 * Put dehydrated DB state into the `DbClient` in scope before what is below
 * reads it.
 *
 * The first state is hydrated while this component is being built, so a live
 * query constructed underneath starts from its rows; a later state is
 * hydrated when it arrives. Hydration can publish to queries already on
 * screen, so it runs with no owner: those writes are theirs, not this
 * component's.
 */
export const HydrationBoundary = ((props: {
  state: Cell<DehydratedDbState>;
  children?: unknown;
}): unknown => {
  const client = useDbClient();
  const state = (): DehydratedDbState =>
    readSlot(props.state, "HydrationBoundary.state") as DehydratedDbState;

  let hydrated = untrack(state);
  runWithOwner(null, () => client.hydrate(hydrated));
  createRenderEffect(state, (next) => {
    if (next === hydrated) return;
    hydrated = next;
    runWithOwner(null, () => client.hydrate(next));
  });

  return built(props.children);
}) as unknown as (props: HydrationBoundaryProps) => JSXElement;
