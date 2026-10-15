import { createSignal, untrack } from "@barqjs/core";
import { batch, createAtom } from "@tanstack/store";
import type { Atom, ReadonlyAtom, Subscription } from "@tanstack/store";
import type { TableAtomOptions, TableReactivityBindings } from "@tanstack/table-core/reactivity";

/**
 * table-core writes an atom and reads it back in the same call (`setPageSize`
 * derives the next page index from the state it has just written), and a barq
 * signal write is staged until `flush()`. So the value lives in a TanStack
 * Store atom, which is synchronous, and barq only carries a version signal per
 * atom: `get()` reads the version to subscribe the running computation and
 * returns the atom's own value.
 */
export function barqReactivity(): TableReactivityBindings {
  const subscriptions = new Set<Subscription>();

  const tracked = <T>(atom: ReadonlyAtom<T>): (() => T) => {
    // The first notification can arrive while the component that owns the
    // table is still being built, which the engine's development build treats
    // as a write inside an owned scope unless the signal opts in.
    const [version, setVersion] = createSignal(0, { ownedWrite: true });
    subscriptions.add(atom.subscribe(() => setVersion((count) => count + 1)));
    return () => {
      version();
      return atom.get();
    };
  };

  return {
    createOptionsStore: true,
    wrapExternalAtoms: false,
    addSubscription: (subscription) => {
      subscriptions.add(subscription);
    },
    unmount: () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      subscriptions.clear();
    },
    schedule: (fn) => queueMicrotask(fn),
    batch,
    untrack,
    createReadonlyAtom: <T>(fn: () => T, options?: TableAtomOptions<T>): ReadonlyAtom<T> => {
      // Untracked on the barq side: a computation that reads this atom is
      // woken by this atom's version, not by every atom the resolver read.
      const atom = createAtom(() => untrack(fn), { compare: options?.compare });
      return { get: tracked(atom), subscribe: atom.subscribe };
    },
    createWritableAtom: <T>(value: T, options?: TableAtomOptions<T>): Atom<T> => {
      const atom = createAtom(value, { compare: options?.compare });
      return {
        get: tracked(atom),
        // A Store atom drops `set(undefined)`, and table-core resets a slice
        // whose initial state is `undefined` (the global filter) that way. An
        // updater that returns the value is written whatever it is.
        set: (next: T | ((previous: T) => T)) => {
          atom.set(typeof next === "function" ? (next as (previous: T) => T) : () => next);
        },
        subscribe: atom.subscribe,
      };
    },
  };
}
