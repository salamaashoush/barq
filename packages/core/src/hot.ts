/**
 * Component replacement for a development server.
 *
 * A module that is edited is evaluated again, and the components it declares
 * are new functions. Everything that imported the old ones still holds them,
 * so each component is handed out as a PROXY that stays the same function for
 * the life of the page and calls whichever implementation is current. An
 * instance on screen is rebuilt in place when its implementation is replaced;
 * the state above it, the router's and every store's, is untouched.
 */

import {
  childScope,
  createSignal,
  disposeScope,
  flush,
  getOwner,
  onCleanup,
  runWithOwner,
} from "./signals.ts";

type Implementation = (...args: never[]) => unknown;

/** The slice of `import.meta.hot` this needs: a bag that survives the module. */
export interface HotContext {
  readonly data: Record<string, unknown>;
}

interface Entry {
  readonly proxy: Implementation;
  signature: string | null;
  replace(next: Implementation): void;
}

const REGISTRY = "barq:components";

/**
 * The proxy for the component `name` of the module `context` belongs to,
 * pointed at `implementation`.
 *
 * What the proxy returns is a Cell over what the component built, so the hole
 * it lands in re-reads it when the implementation changes. Each instance is
 * built under a scope of its own, which is what is disposed when it is
 * replaced.
 *
 * `signature` stands for everything the component is made of. An edit to one
 * component evaluates the whole module again, and a component whose signature
 * did not move keeps the implementation it has, and with it the state of every
 * instance on screen. `null` is a component that reads module state the build
 * cannot follow, which is replaced every time.
 */
export function hot<T extends Implementation>(
  context: HotContext,
  name: string,
  implementation: T,
  signature: string | null = null,
): T {
  const data = context.data;
  const registry = (data[REGISTRY] ??= new Map<string, Entry>()) as Map<string, Entry>;
  const known = registry.get(name);
  if (known !== undefined) {
    if (signature === null || known.signature !== signature) {
      known.signature = signature;
      known.replace(implementation);
    }
    return known.proxy as T;
  }
  let current: Implementation = implementation;
  const instances = new Set<(next: Implementation) => void>();
  const proxy = ((...args: never[]) => {
    const owner = getOwner();
    // Built HERE and directly, exactly as the component would have been: under
    // a scope of its own so it can be taken down again, and not inside a
    // computation, which would put off the first run of every effect it makes
    // until the next flush. A hydrating page claims the server's nodes in the
    // order things are built, so a late effect claimed its neighbour's.
    let scope = childScope(owner);
    let built = runWithOwner(scope, () => current(...args));
    const [version, setVersion] = createSignal(0, { ownedWrite: true });
    const rebuild = (next: Implementation): void => {
      disposeScope(scope);
      scope = childScope(owner);
      built = runWithOwner(scope, () => next(...args));
      setVersion((count) => count + 1);
    };
    instances.add(rebuild);
    if (owner !== null) {
      runWithOwner(owner, () => {
        onCleanup(() => {
          instances.delete(rebuild);
          disposeScope(scope);
        });
      });
    }
    return () => {
      version();
      return built;
    };
  }) as Implementation;
  registry.set(name, {
    proxy,
    signature,
    replace(next) {
      current = next;
      for (const rebuild of instances) rebuild(next);
      flush();
    },
  });
  return proxy as T;
}
