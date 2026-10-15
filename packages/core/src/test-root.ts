/**
 * Run a test body under a root scope.
 *
 * A derived value created under no owner is released whenever nothing observes
 * it and recomputed from scratch on its next read, so a test that counts
 * recomputations at module level counts something an application never sees:
 * everything an application creates is under the root `render` opens.
 */
import { createRoot, runWithOwner } from "./signals.ts";

export function rooted<R>(body: () => R): () => R {
  return () =>
    runWithOwner(null, () =>
      createRoot((dispose) => {
        let result: R;
        try {
          result = body();
        } catch (error) {
          dispose();
          throw error;
        }
        if (result instanceof Promise) return result.finally(dispose) as R;
        dispose();
        return result;
      }),
    );
}
