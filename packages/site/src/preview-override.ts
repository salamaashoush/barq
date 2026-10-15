/**
 * The uncommitted parameters a hovered picker item applies to the preview.
 *
 * A port of `apps/v4/app/(app)/(create)/components/preview-override.tsx`, and
 * the reason it is a separate thing from the committed parameters rather than a
 * shortcut into them: committing on hover would re-encode the URL and push a
 * history entry for every item the pointer crossed, so Back would walk one
 * hovered value at a time and a copied link would hold whatever the cursor
 * happened to be over.
 *
 * Two more things are load-bearing and both were learned by watching it fail.
 *
 * **A preview is debounced and a clear is not.** Every `mousemove` over an item
 * re-arms a trailing timer, so nothing applies while the pointer is in motion —
 * applying one is a whole theme rewrite. Reverting has to feel instant, so
 * leaving the list, closing the menu and pressing Escape all clear immediately.
 *
 * **An identical override is not an override.** Hovering the value that is
 * already committed, or re-entering the item under the cursor, would otherwise
 * re-apply and re-render for no change at all.
 */

import { createSignal, type Accessor } from "@barqjs/core";

/**
 * How long the pointer must settle before a preview applies.
 *
 * 50ms is upstream's, and it is short enough to feel like hover rather than
 * like a delay: sweeping the list still previews every item you stop on.
 */
const SETTLE_MS = 50;

export interface PreviewOverride<T> {
  /** What is being previewed, or `null`. Read by whatever renders the preview. */
  readonly value: Accessor<Partial<T> | null>;
  /** Applied once the pointer has settled. */
  set(next: Partial<T>): void;
  /** Applied at once, because reverting must not lag. */
  clear(): void;
}

function same<T extends object>(a: Partial<T> | null, b: Partial<T> | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  const keys = Object.keys(a) as (keyof T)[];
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

export function previewOverride<T extends object>(): PreviewOverride<T> {
  const [value, setValue] = createSignal<Partial<T> | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  return {
    value,
    set(next) {
      cancel();
      timer = setTimeout(() => {
        timer = undefined;
        setValue((prev) => (same(prev, next) ? prev : next));
      }, SETTLE_MS);
    },
    clear() {
      cancel();
      setValue(null);
    },
  };
}
