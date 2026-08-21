/**
 * The loader-cell read path as it stood before the caching work, preserved as a
 * benchmark COMPARAND.
 *
 * `packages/router/src/router.ts` rebuilt the cache key on every read, because
 * `props([{...}])` returns a single plain record UNCHANGED (`props.ts:168-174`)
 * and therefore memoises nothing: `routeProps.data` is
 * `() => state.dataFor(route, state.params())()`, read inside a tracked
 * `insert`, and each read ran `Object.keys().toSorted()`, a `.map`, a `.join`
 * and a template literal before the `Map` lookup.
 *
 * Copied here verbatim so the number that justified memoising the key stays
 * reproducible after the original is gone. Its shortcoming is preserved too,
 * deliberately: the search is absent from the key, which is the defect
 * `ac8c51d` fixed — a comparand that has been quietly improved is not the thing
 * that was measured.
 *
 * Nothing imports this but the benchmarks.
 */

export type Params = Readonly<Record<string, string>>;

/** The key as it was: route id plus sorted params, rebuilt per read. */
export function legacyLoaderKey(routeId: string, params: Params): string {
  const names = Object.keys(params).toSorted();
  const pairs = names.map((name) => `${name}=${params[name]}`).join("&");
  return `r:${routeId}|${pairs}`;
}

export interface LegacyCache {
  dataFor(routeId: string, params: Params): () => unknown;
  size(): number;
}

/**
 * `dataFor`'s shape, minus the reactivity: a `Map` keyed by the rebuilt string,
 * with insertion-order eviction past a fixed ceiling.
 *
 * The cell is a plain thunk rather than a `computed` on purpose — this measures
 * the KEY path, and putting a real async computed on both sides would bury a
 * 150 ns difference under a settled-read that both sides pay identically.
 */
export function legacyCache(limit = 100): LegacyCache {
  const cells = new Map<string, () => unknown>();
  let generation = 0;
  void generation;

  return {
    dataFor(routeId: string, params: Params): () => unknown {
      const key = `${legacyLoaderKey(routeId, params)}#${generation}`;
      const existing = cells.get(key);
      if (existing !== undefined) return existing;
      const cell = (): unknown => undefined;
      cells.set(key, cell);
      if (cells.size > limit) {
        const oldest = cells.keys().next();
        if (!oldest.done) cells.delete(oldest.value);
      }
      return cell;
    },
    size: () => cells.size,
  };
}
