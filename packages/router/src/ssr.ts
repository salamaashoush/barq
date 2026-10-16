/**
 * What a router carries across a server render besides its loaders: the hooks
 * an integration installs, and the channel their data crosses on.
 *
 * TanStack's `router.options.dehydrate` / `hydrate` / `Wrap` / `InnerWrap` and
 * `router.serverSsr`, under their names. Isomorphic: nothing here reaches
 * `@barqjs/server`, so the client half of an integration can import it.
 */

import type { Child } from "@barqjs/core";

import type { RouterConfig, RouterState } from "./router.ts";

/** What `Wrap` and `InnerWrap` are handed: the tree they go around, to place once. */
export interface WrapProps {
  readonly children: () => Child;
}

export type WrapComponent = (props: WrapProps) => unknown;

/**
 * The hooks of one router, mutable so an integration can install its own
 * around whatever the application configured.
 */
export interface RouterOptions<Dehydrated = unknown> {
  /** Runs on the server once the matched loaders have settled. Its result reaches `hydrate`. */
  dehydrate?: () => Dehydrated | Promise<Dehydrated>;
  /** Runs in the browser with what `dehydrate` returned, before the first render. */
  hydrate?: (dehydrated: Dehydrated) => void | Promise<void>;
  /** Around the whole router output, outside the router's own context. */
  Wrap?: WrapComponent;
  /** Around the matched routes, inside the router's context. */
  InnerWrap?: WrapComponent;
}

/** What a server render offers the code running inside it. */
export interface ServerSsr {
  /**
   * Put a script in the response after whatever has been sent so far.
   *
   * The source is the body of a `<script>`, so it must not contain a closing
   * tag: the caller escapes what it interpolates.
   */
  injectScript(script: string): void;
  /**
   * Run `listener` once the render has produced its last byte. One registered
   * after that moment runs at once.
   */
  onRenderFinished(listener: () => void): void;
}

/** Where the dehydrated payload is left for the client router to find. */
export const ROUTER_DEHYDRATED_GLOBAL = "__BARQ_ROUTER__";

type Overrides = Partial<RouterConfig> | ((provided: RouterConfig) => Partial<RouterConfig>);

/**
 * The configuration the next `createRouter` call is given on top of its own.
 *
 * A project's `getRouter()` builds its router with no knowledge of the request
 * it is for, and the page handler is the only thing that knows the location and
 * owns the answer a loader throws. Set and cleared around one synchronous call,
 * so it never outlives the frame that set it and one request cannot read
 * another's.
 */
const pending: { overrides: Overrides | null; taken: boolean } = { overrides: null, taken: false };

/**
 * Call `build`, handing `overrides` to the `createRouter` it calls.
 *
 * `build` has to reach `createRouter` before it first awaits: after that the
 * overrides are gone, and the router would be built for no request at all.
 */
export function withRouterOverrides<T>(overrides: Overrides, build: () => T): T {
  const outer = { ...pending };
  pending.overrides = overrides;
  pending.taken = false;
  let built: T;
  let taken: boolean;
  try {
    built = build();
    taken = pending.taken;
  } finally {
    pending.overrides = outer.overrides;
    pending.taken = outer.taken;
  }
  if (!taken) {
    throw new Error(
      "[barq-router] `getRouter()` did not call `createRouter` before it returned or awaited, so " +
        "the router it built does not know the request it is for. Call `createRouter` " +
        "synchronously inside `getRouter`, before any `await`.",
    );
  }
  return built;
}

/** `provided`, with whatever {@link withRouterOverrides} is offering laid over it. */
export function applyRouterOverrides(provided: RouterConfig): RouterConfig {
  const offered = pending.overrides;
  if (offered === null) return provided;
  pending.overrides = null;
  pending.taken = true;
  const overrides = typeof offered === "function" ? offered(provided) : offered;
  const given = Object.entries(overrides).filter(([, value]) => value !== undefined);
  return {
    ...provided,
    ...Object.fromEntries(given),
    // Merged rather than replaced: the application's own context is what its
    // routes are typed against, and a request adds to it.
    context:
      provided.context === undefined && overrides.context === undefined
        ? undefined
        : { ...provided.context, ...overrides.context },
  };
}

/** `build`'s tree inside `component`, or as it stands when there is none. */
export function wrapWith(component: WrapComponent | undefined, build: () => unknown): unknown {
  if (component === undefined) return build();
  // On the string backend the tree is markup rather than nodes, and it is
  // still what JSX written around it reads as a `Child`, as route children are.
  return component({ children: build as () => Child });
}

type Queued = () => unknown;

/**
 * Take the server's dehydrated payload, if the page carries one.
 *
 * The page queues it as functions rather than values, so a payload that names a
 * serialization adapter is rebuilt here, after the adapters are registered,
 * instead of at parse time when they are not. The first entry answers with the
 * payload; each one after it settles something the payload left pending. What
 * arrives once this has run is applied on arrival.
 */
export function takeDehydrated(
  late?: (value: unknown) => void,
): { readonly value: unknown } | null {
  const holder = globalThis as Record<string, unknown>;
  const queue = holder[ROUTER_DEHYDRATED_GLOBAL] as Queued[] | undefined;
  if (!Array.isArray(queue) || queue.length === 0) {
    // A streamed page's payload comes after the loaders settle, which is after
    // a client that hydrates at shell time has booted. Its first entry is
    // handed over when it lands.
    if (late !== undefined && queue === undefined) {
      let first = true;
      holder[ROUTER_DEHYDRATED_GLOBAL] = {
        push(settle: Queued): void {
          const value = settle();
          if (first) {
            first = false;
            late(value);
          }
        },
      };
    }
    return null;
  }
  const [first, ...later] = queue;
  const value = first?.();
  for (const settle of later) settle();
  holder[ROUTER_DEHYDRATED_GLOBAL] = {
    push(settle: Queued): void {
      settle();
    },
  };
  return { value };
}

/**
 * Hand the server's dehydrated payload to the router's `hydrate`.
 *
 * Awaited by the client boot before the router starts, so a loader that asks an
 * integration for data finds what the server already fetched.
 */
export async function hydrateRouter(state: RouterState): Promise<void> {
  const hydrate = state.options.hydrate;
  if (hydrate === undefined) return;
  const dehydrated = takeDehydrated((value) => {
    Promise.resolve(hydrate(value)).catch((error: unknown) => console.error(error));
  });
  if (dehydrated !== null) await hydrate(dehydrated.value);
}
