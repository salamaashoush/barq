/**
 * Rendering a ROUTE, with the boot order the framework gets right and a test
 * would not.
 *
 * TanStack has no testing package; their docs prescribe a `createTestRouter`
 * every project writes for itself (`docs/router/how-to/setup-testing.md`), and
 * it is four lines because their `RouterProvider` boots internally. barq's
 * cannot be four lines, and the difference is the reason this exists rather
 * than being copied into each project's `src/test/`:
 *
 *  1. `state.start()` has to have SETTLED before the tree is built, or
 *     `useRouteContext()` answers nothing on the first render. `RouterProvider`
 *     calls it with `void` (`components.ts:774`) because a mount cannot await;
 *     a test can, and must.
 *  2. `preloadMatched` has to have settled too, or a route module that has not
 *     arrived throws `NotReadyError`, parks its boundary and REBUILDS — which
 *     produces the right markup from the wrong path, so the test passes while
 *     measuring nothing.
 *
 * That is the same order `startClient` documents and for the same reasons. A
 * project that hand-rolls this gets a router that mostly works and a suite with
 * a race in it.
 */

import { flush } from "@barqjs/core";
import type { Scope } from "@barqjs/core";
import {
  type AnyRouteDefinition,
  type NavigateOptions,
  type RouterState,
  RouterProvider,
  createRouter,
  memoryHistory,
  preloadMatched,
} from "@barqjs/router";

import { render } from "./pure.ts";
import type { RenderResult } from "./types.ts";

export interface RenderRouteOptions {
  /** The table. A test's own, not `routeTree.gen.ts`. */
  readonly routeTree: readonly AnyRouteDefinition[];
  /** Where to start. Default `"/"`. */
  readonly path?: string;
  /**
   * The whole history stack, when a test needs one.
   *
   * `path` is the common case and sets `initial: [path]`. Passing both is a
   * contradiction and this takes `initial`.
   */
  readonly initial?: readonly string[];
  readonly container?: HTMLElement;
}

export interface RouteRenderResult extends RenderResult {
  /** The live router, for asserting on `location()`, `params()` and the rest. */
  readonly state: RouterState;
  /**
   * Navigate and settle.
   *
   * `state.navigate` resolves when the location has changed; this also flushes,
   * so the assertion after it sees the DOM the navigation produced rather than
   * the one before the microtask queue ran.
   */
  navigate: (to: string, options?: NavigateOptions) => Promise<void>;
}

/**
 * Boot a router over `routeTree`, render it, and hand back the queries.
 *
 * `async` because the boot is, and there is no honest synchronous version: the
 * two awaits above are what separate a route that rendered from a route that
 * rendered its fallback.
 */
export async function renderRoute(options: RenderRouteOptions): Promise<RouteRenderResult> {
  const initial = options.initial ?? [options.path ?? "/"];
  const state = createRouter({
    routeTree: options.routeTree,
    history: memoryHistory({ initial: [...initial] }),
  });

  await state.start();
  await preloadMatched(state.chain());

  // `(scope, props)`, which is the real calling convention behind the
  // props-first type — the same cast `router.test.ts`'s `mountState` uses.
  const provider = RouterProvider as never as (s: Scope | null, p: unknown) => unknown;
  const result = render(
    ((scope: Scope | null) => provider(scope, { state: () => state })) as never,
    {
      container: options.container,
      // Through `render`'s own registry rather than by wrapping `unmount`, so
      // `cleanup()` reaches it too. A router left running keeps its history
      // subscription and its loader cache; nothing fails, it just leaks for the
      // rest of the process.
      onUnmount: () => state.dispose(),
    },
  );
  flush();

  return {
    ...result,
    state,
    navigate: async (to, navigateOptions) => {
      await state.navigate(to, navigateOptions);
      // `state.navigate` resolves when the LOCATION has changed, which is
      // before the incoming route's module has arrived — so without this a
      // code-split route asserts against the outgoing page.
      await preloadMatched(state.chain());
      flush();
    },
  };
}
