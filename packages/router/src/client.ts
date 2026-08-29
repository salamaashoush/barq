/**
 * The client entry's whole job, so an application's own entry does not carry it.
 *
 * TanStack Start ships this as a DEFAULT ENTRY the app never writes:
 * `hydrateRoot(document, <StartClient />)`, with `StartClient` hiding the boot
 * behind a promise (`start-client-core/src/client/hydrateStart.ts`). barq cannot
 * hide it behind a promise for a reason that is barq's own — the tree has to be
 * complete BEFORE `hydrate` walks it, or the claim runs against a page the
 * client has not finished deciding — so the boot is awaited here and the
 * function is `async`. What the application writes is the same size either way.
 *
 * PROVIDERS DO NOT BELONG HERE, and that is theirs too: a `QueryClientProvider`
 * goes in the ROOT ROUTE's component, where it wraps every route and is visible
 * to the server render as well. An entry that wraps the tree wraps only the
 * client's.
 */

import { type Scope, hydrate } from "@barqjs/core";

import { Document, RouterProvider, resolveHeadFor } from "./components.ts";
import { browserHistory } from "./history.ts";
import { preloadMatched } from "./route.ts";
import { type RouterState, createRouter } from "./router.ts";
import type { AnyRouteDefinition } from "./route.ts";

export interface StartClientOptions {
  /** The generated table, from `./routeTree.gen`. */
  readonly routeTree: readonly AnyRouteDefinition[];
  /** Defaults to `browserHistory()`; a test may hand over its own. */
  readonly history?: RouterState["history"];
  /** Defaults to the whole document — the shell is part of the tree. */
  readonly container?: HTMLElement | Document;
}

/**
 * Boot the client and hydrate the document.
 *
 * The ORDER is the whole of it, and every step is load-bearing:
 *
 * 1. `start()`, because the walk claims one range per route depth and a chain
 *    that is still empty when `hydrate` runs claims ranges for nothing.
 * 2. `preloadMatched`, because a route module that has not arrived throws
 *    `NotReadyError`, which parks the depth's boundary and rebuilds it —
 *    discarding exactly the markup hydration exists to keep. The shell is in
 *    that set too: it renders `<html>`, so a cold `lazy()` there fails from a
 *    position with no boundary above it.
 * 3. The head, because `<HeadContent />` is a keyed list and a first render
 *    with nothing in it claims nothing and then replaces every tag the server
 *    wrote.
 */
export async function startClient(options: StartClientOptions): Promise<RouterState> {
  const state = createRouter({
    routeTree: options.routeTree,
    history: options.history ?? browserHistory(),
  });

  await state.start();
  await preloadMatched(state.chain());
  const head = await resolveHeadFor(state);

  // `(scope, props)`, which is the real calling convention behind the
  // props-first type — the same cast `server.test.ts` uses at its own boundary.
  const provider = RouterProvider as never as (scope: unknown, props: unknown) => unknown;
  // The ROOT SCOPE, forwarded. `mount` calls this with the scope it just
  // entered, and passing `null` instead skipped `Document`'s `provide` — so
  // `<HeadContent />` read no assets and rendered nothing. Hydration still
  // CLAIMED the server's tags, which hid it until the first navigation, where
  // the update reconciled the whole head away.
  hydrate(
    ((scope: Scope | null) =>
      Document(scope, {
        state: () => state,
        head: () => head,
        children: (inner: unknown) => provider(inner, { state: () => state }),
      })) as never,
    options.container ?? globalThis.document,
  );

  return state;
}
