/**
 * Asking for the next page when the end of a collection comes into reach.
 *
 * A list that loads as it scrolls puts a loader item where more rows will
 * appear: a `<ListBoxLoadMoreItem>`, `<GridListLoadMoreItem>`,
 * `<TableLoadMoreItem>` or `<TreeLoadMoreItem>`, rendered for an item whose
 * `getType` answers `"loader"`. Each one renders two things. The loading row,
 * while `isLoading`, is what a user sees and a screen reader reads; it takes no
 * focus and counts towards no `aria-setsize`, because a spinner is not one of
 * the items. The sentinel is a one-pixel element that is always there, loading
 * or not, inert and zero-sized, and an `IntersectionObserver` watching it is
 * what calls `onLoadMore`.
 *
 * Inside a `<Virtualizer>` nothing is in document flow, so the sentinel is
 * placed where the layout put the loader, and the layout keeps the loader in
 * its window wherever the scroll is: a sentinel that scrolled out of the DOM
 * could never come back into view to ask for more.
 */

import { type Accessor, createEffect } from "@barqjs/core";
import { isServer } from "@barqjs/web";
import type { Key } from "./collections.ts";
import { scrollParents } from "./dom.ts";
import type { ElementRef } from "./interactions/press.ts";
import { access, type MaybeAccessor } from "./utils.ts";
import { rowStyle, type VirtualizerValue } from "./virtualizer.tsx";

export interface LoadMoreSentinelOptions {
  /** Changes whenever the rows above the sentinel do, so the observer is set up again. */
  collection: Accessor<unknown>;
  onLoadMore?: () => void;
  /**
   * How far from the end of the scrolling region, as a fraction of its height,
   * the sentinel counts as reached. @default 1
   */
  scrollOffset?: MaybeAccessor<number | undefined>;
  /** `"start"` for a list that grows upwards. @default "end" */
  direction?: MaybeAccessor<"start" | "end" | undefined>;
}

/**
 * Call `onLoadMore` when the sentinel comes within reach of the scrolling
 * region's edge.
 *
 * The observer is rebuilt whenever the collection changes. Kept, it would not
 * fire again after a page loads that left the sentinel inside the margin,
 * because nothing about its intersection changed, and the list would stop
 * growing with room still to fill.
 */
export function loadMoreSentinel(options: LoadMoreSentinelOptions, ref: ElementRef): void {
  if (isServer) return;
  createEffect(
    () => ({
      collection: options.collection(),
      element: access(ref) as Element | null,
      offset: access(options.scrollOffset) ?? 1,
      direction: access(options.direction) ?? "end",
    }),
    ({ element, offset, direction }) => {
      if (element === null || typeof IntersectionObserver === "undefined") return undefined;
      const margin = 100 * offset;
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) options.onLoadMore?.();
          }
        },
        {
          root: scrollParents(element)[0] ?? null,
          rootMargin:
            direction === "start"
              ? `${margin}% 0px 0px 0px`
              : `0px ${margin}% ${margin}% ${margin}%`,
        },
      );
      observer.observe(element);
      return () => observer.disconnect();
    },
  );
}

/**
 * The style of the zero-sized box the sentinel sits in.
 *
 * In document flow it is relative, so the sentinel lands where the loader is
 * written. Virtualised, every row is absolutely positioned and the flow is
 * empty, so it is placed at the loader's own position in the layout; left in
 * flow it would sit at the top of the list, always in view, and ask for page
 * after page.
 */
export function loadMoreSentinelStyle(
  virtual: VirtualizerValue | null,
  key: Key,
): Record<string, string> {
  if (virtual === null) return { position: "relative", width: "0", height: "0" };
  // Read for the subscription: the layout is not reactive, its size is.
  virtual.contentSize();
  const info = virtual.layout.getLayoutInfo(key);
  if (info === null) return { position: "relative", width: "0", height: "0" };
  return {
    position: "absolute",
    top: `${info.rect.y}px`,
    left: `${info.rect.x}px`,
    width: "0",
    height: "0",
  };
}

/**
 * The style of a loader's loading row: its own, or virtualised, where the
 * layout put it.
 *
 * The layout gives the row its height only once the row says it is loading,
 * which is after the row exists, so the position is read again whenever the
 * layout changes rather than once.
 */
export function loaderRowStyle(
  virtual: VirtualizerValue | null,
  key: Key,
  own: Record<string, string | number | undefined> | undefined,
): Record<string, string | number | undefined> | undefined {
  if (virtual === null) return own;
  virtual.contentSize();
  const info = virtual.layout.getLayoutInfo(key);
  return info === null ? own : { ...own, ...rowStyle(info) };
}

/**
 * Tell the enclosing virtualiser whether a loader row is showing, so its
 * layout gives it a row's height while loading and none otherwise.
 */
export function reportLoading(
  virtual: VirtualizerValue | null,
  key: Key,
  isLoading: Accessor<boolean>,
): void {
  if (isServer || virtual === null) return;
  createEffect(isLoading, (loading) => {
    virtual.setLoading(key, loading);
  });
}
