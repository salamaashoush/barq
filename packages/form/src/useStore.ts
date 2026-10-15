import { type Accessor, createSignal, onCleanup } from "@barqjs/core";
import { shallow } from "@tanstack/store";

export interface UseSelectorOptions<TSelected> {
  compare?: (a: TSelected, b: TSelected) => boolean;
}

export interface SelectionSource<TSource> {
  get: () => TSource;
  subscribe: (listener: (value: TSource) => void) => { unsubscribe: () => void };
}

/**
 * Selects a slice of a TanStack store or atom and returns it as an accessor.
 *
 * The store stays the source of truth. The signal only carries the
 * notification: a barq write is staged until the next flush, so the accessor
 * answers with the slice the subscription last saw rather than with the
 * signal's own value, and a handler that writes to the form and reads the
 * selection in the same tick sees what it wrote.
 */
export function useSelector<TSource, TSelected = NoInfer<TSource>>(
  source: SelectionSource<TSource>,
  selector: (snapshot: TSource) => TSelected = (snapshot) => snapshot as unknown as TSelected,
  options?: UseSelectorOptions<TSelected>,
): Accessor<TSelected> {
  const compare = options?.compare ?? shallow;
  let current = selector(source.get());

  // `ownedWrite`: a core write can land while a component is still being built
  // (a field mounting seeds its default value), which the engine refuses for an
  // ordinary signal. The slice itself is not stored: a selected function would
  // make `createSignal` build a derived signal out of it.
  const [track, notify] = createSignal(0, { equals: false, ownedWrite: true });

  const subscription = source.subscribe((snapshot) => {
    const next = selector(snapshot);
    if (compare(current, next)) return;
    current = next;
    notify(0);
  });

  onCleanup(() => {
    subscription.unsubscribe();
  });

  return () => {
    track();
    return current;
  };
}

export const useStore = <TSource, TSelected = NoInfer<TSource>>(
  source: SelectionSource<TSource>,
  selector?: (snapshot: TSource) => TSelected,
  compare?: (a: TSelected, b: TSelected) => boolean,
): Accessor<TSelected> => useSelector(source, selector, { compare });
