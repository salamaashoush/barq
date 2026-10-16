/**
 * The client entry's whole job, so an application's own entry does not carry it.
 *
 * TanStack Start ships this as a DEFAULT ENTRY the app never writes:
 * `hydrateRoot(document, <StartClient />)`, with `StartClient` hiding the boot
 * behind a promise. barq cannot
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

import { hydrate, shellReady } from "@barqjs/core";
import { type AnySerializationAdapter, registerSerializationAdapters } from "@barqjs/server/codec";
import { frameAdapter } from "@barqjs/start/client";

import { Document, RouterProvider, resolveHeadFor } from "./components.ts";
import { browserHistory } from "./history.ts";
import { preloadMatched } from "./route.ts";
import { type RouterConfig, type RouterState, createRouter } from "./router.ts";
import { hydrateRouter, withRouterOverrides } from "./ssr.ts";
import type { AnyRouteDefinition } from "./route.ts";

export interface StartClientOptions {
  /**
   * The table. Omitted, it comes from the project's `src/router.ts`.
   *
   * An application's own entry does NOT import `routeTree.gen.ts` to pass it
   * here, and theirs does not either. The import lives in `src/router.ts`,
   * which is an ordinary file naming an ordinary relative path.
   *
   * Route TYPES are unaffected either way: they travel through `Register`, which
   * `routeTree.gen.ts` augments, and this parameter is `AnyRouteDefinition[]`,
   * which never carried them.
   *
   * Still accepted, because a test hands over a table of its own.
   */
  readonly routeTree?: readonly AnyRouteDefinition[];
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
/**
 * Put the application's adapters where the codec and the queued seed can find
 * them, then let the seed run.
 *
 * Two registries because there are two readers. `registerSerializationAdapters`
 * is the codec's, for `decodeWire` on every later server-function call;
 * `window.__BARQ_ADAPTERS__` is the emitted seed's, which can only name a key.
 *
 * The drain is unconditional and cheap: `__BARQ_SEED__` exists only on a page
 * whose server had adapters registered, and an application with none never
 * emitted the bootstrap at all.
 */
function installSerializationAdapters(adapters: readonly AnySerializationAdapter[]): void {
  if (adapters.length > 0) registerSerializationAdapters(adapters);
  const holder = globalThis as unknown as {
    __BARQ_ADAPTERS__?: Map<string, (value: never) => unknown>;
    __BARQ_SEED__?: { drain: () => void };
  };
  if (holder.__BARQ_ADAPTERS__ !== undefined) {
    // A frame a route's loader returned is named in the seed by its address.
    // Only the seed names one, so the codec, which reads server-function
    // answers, is not given it.
    for (const adapter of [...adapters, frameAdapter]) {
      holder.__BARQ_ADAPTERS__.set(adapter.key, adapter.fromSerializable);
    }
  }
  holder.__BARQ_SEED__?.drain();
}

export async function startClient(options: StartClientOptions = {}): Promise<RouterState> {
  // DYNAMIC, and only when nothing was passed: this package's own suite imports
  // this module with no Vite plugin anywhere, so a static import would fail to
  // resolve at load. `#barq-router-entry` is an ALIAS to the project's own
  // `src/router.ts`, not a synthesised module — the client must never reach
  // `virtual:barq-server-fns`, which would put the whole server registry in the
  // browser bundle.
  // The project's `src/start.ts` first: importing it registers the global
  // middleware whose client halves run around every server-function call.
  // Both at once: awaited one after the other, the router's entry was not even
  // requested until the start entry had been fetched and run.
  const [start, entry] =
    options.routeTree === undefined
      ? await Promise.all([import("#barq-start-entry"), import("#barq-router-entry")])
      : [undefined, { config: { routeTree: options.routeTree }, getRouter: undefined }];
  // The base reaches the HISTORY, not only the router: `browserHistory`
  // strips it from `window.location` on the way in and adds it back on every
  // push, and it is the only thing that reads `window.location` at all. A
  // router given a `basepath` over a history without one matched
  // `/app/about` as `/app/about` and found nothing.
  const historyFor = (config: RouterConfig): RouterState["history"] =>
    options.history ??
    browserHistory(config.basepath === undefined ? undefined : { base: config.basepath });
  const { config, getRouter } = entry;
  // The application's `createStart({ defaultSsr })` wins over the router's, on
  // this side as on the server, so both agree on what was rendered there.
  const startSsr = start?.startInstance?.getOptions().defaultSsr;
  const ssr = startSsr === undefined ? {} : { defaultSsr: startSsr };
  let state: RouterState;
  if (getRouter !== undefined) {
    state = await withRouterOverrides(
      (own) => ({ history: own.history ?? historyFor(own), ...ssr }),
      getRouter,
    );
  } else if (config !== undefined) {
    state = createRouter({ ...config, history: historyFor(config), ...ssr });
  } else {
    throw new Error(
      "[barq-router] `src/router.ts` exports neither `config` nor `getRouter`, so there is no router to start. " +
        "Export one of them: `export const config = { routeTree }` or `export function getRouter() { return createRouter({ routeTree }); }`.",
    );
  }
  // A streamed page loads this module from its head, so it can be here before
  // the parser has reached the shell's seed. Nothing above read one.
  await shellReady();
  // BEFORE anything reads a seeded value. The seed is an inline script that
  // ran while this module was still being fetched, so it queued its assignment
  // rather than making it — see `ADAPTER_BOOTSTRAP`. Registering here and
  // draining is what turns the queue into `__BARQ_DATA__`.
  installSerializationAdapters([
    ...(state.config.serializationAdapters ?? []),
    ...(start?.startInstance?.getOptions().serializationAdapters ?? []),
  ]);

  // Before `start`, which is what runs the first loaders: one that asks an
  // integration for data has to find what the server already fetched.
  await hydrateRouter(state);
  await state.start();
  await preloadMatched(state.chain());
  const head = await resolveHeadFor(state);

  const provider = RouterProvider as never as (props: unknown) => unknown;
  hydrate(
    () =>
      Document({
        state: () => state,
        head: () => head,
        // Ownership is ambient: `Document`'s `provide` has entered its own
        // scope by the time this runs, so the provider is built under it
        // without anything being handed over.
        children: () => provider({ state: () => state }),
      }),
    options.container ?? globalThis.document,
  );

  return state;
}
