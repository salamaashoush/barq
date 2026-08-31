/**
 * A viewport that stays at the end while new content arrives.
 *
 * This is the piece `@barqjs/ui`'s `<MessageScroller>` needed. Upstream's is a
 * React primitive package, so the engine is written here and only the behaviour
 * is upstream's.
 *
 * A transcript is the one scroller where the interesting end is the BOTTOM, and
 * three things follow from that.
 *
 * **Sticking is a decision, and it survives new content.** Someone reading at
 * the bottom wants the next message; someone who has scrolled up to read wants
 * to be left alone. So the answer is not "scroll on every append" but "keep
 * doing whatever the last scroll said", and a message arriving does not change
 * what that was.
 *
 * **The end needs a tolerance.** Sub-pixel scroll offsets, a browser zoom and a
 * fractional device pixel ratio all mean
 * `scrollTop + clientHeight === scrollHeight` is almost never exactly true, and
 * a scroller that tests for it is one that never counts as being at the end.
 *
 * **A programmatic scroll is not the person scrolling.** Calling `toEnd()`
 * fires the same `scroll` event a finger does, and reading that event as
 * intent is how a scroller decides the user just scrolled away from the
 * bottom it moved them to.
 */

import { signal, type Accessor } from "@barqjs/core";

import { access, type MaybeAccessor } from "./utils.ts";

/** How far from the end still counts as being at it, in px. */
const TOLERANCE = 8;

export interface MessageScrollerOptions {
  /** How close to the end still counts. @default 8 */
  tolerance?: MaybeAccessor<number | undefined>;
  /** Whether to follow new content at all. @default true */
  follow?: MaybeAccessor<boolean | undefined>;
}

export interface MessageScroller {
  /** Whether the viewport is at the end, within the tolerance. */
  readonly isAtEnd: Accessor<boolean>;
  /** Whether there is anything to scroll: false hides the button. */
  readonly isScrollable: Accessor<boolean>;
  /** True while a programmatic scroll is in flight. */
  readonly isAutoscrolling: Accessor<boolean>;
  /** The element to watch, or `null` to stop watching. */
  readonly attach: (viewport: HTMLElement | null) => void;
  /** Jump or glide to the bottom. */
  readonly toEnd: (behavior?: ScrollBehavior) => void;
  readonly toStart: (behavior?: ScrollBehavior) => void;
  /** Re-measure, which an append does through the observer already. */
  readonly measure: () => void;
}

export function messageScroller(options: MessageScrollerOptions = {}): MessageScroller {
  const atEnd = signal(true);
  const scrollable = signal(false);
  const autoscrolling = signal(false);

  let viewport: HTMLElement | null = null;
  let observer: ResizeObserver | null = null;
  let mutations: MutationObserver | null = null;
  // What the last real scroll said, which an append must not change.
  let sticking = true;
  let settle: ReturnType<typeof setTimeout> | null = null;

  const distance = (element: HTMLElement): number =>
    element.scrollHeight - element.clientHeight - element.scrollTop;

  const measure = (): void => {
    if (viewport === null) return;
    const room = viewport.scrollHeight - viewport.clientHeight;
    scrollable.set(room > (access(options.tolerance) ?? TOLERANCE));
    atEnd.set(distance(viewport) <= (access(options.tolerance) ?? TOLERANCE));
  };

  const onScroll = (): void => {
    measure();
    // Only a scroll the PERSON made changes the decision. The one `toEnd`
    // caused fires this too, and reading it as intent is how a scroller
    // decides the user scrolled away from the bottom it just moved them to.
    if (!autoscrolling()) sticking = atEnd();
  };

  const follow = (): void => {
    measure();
    if (!sticking || access(options.follow) === false) return;
    toEnd("auto");
  };

  function toEnd(behavior: ScrollBehavior = "smooth"): void {
    if (viewport === null) return;
    sticking = true;
    // The flag is for the ANIMATION and an instant jump has none. A smooth
    // scroll passes through positions that are not the end, and each fires a
    // `scroll` event that would otherwise read as the person scrolling away
    // from the bottom this call is taking them to. A jump lands at the end and
    // whatever event follows finds it there.
    if (behavior === "smooth") {
      autoscrolling.set(true);
      if (settle !== null) clearTimeout(settle);
      // There is no event for a smooth scroll finishing, so the flag is held
      // long enough to cover it and then dropped.
      settle = setTimeout(() => {
        autoscrolling.set(false);
        measure();
      }, 400);
    }
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    measure();
  }

  return {
    isAtEnd: atEnd,
    isScrollable: scrollable,
    isAutoscrolling: autoscrolling,
    toEnd,
    measure,
    toStart(behavior: ScrollBehavior = "smooth") {
      if (viewport === null) return;
      sticking = false;
      viewport.scrollTo({ top: 0, behavior });
    },
    attach(element) {
      observer?.disconnect();
      mutations?.disconnect();
      viewport?.removeEventListener("scroll", onScroll);
      observer = null;
      mutations = null;
      viewport = element;
      if (element === null) return;

      element.addEventListener("scroll", onScroll, { passive: true });
      // Both, because the two ways a transcript grows are different events: a
      // message added is a mutation, and an image finishing loading or a
      // window narrowing is a resize.
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(follow);
        observer.observe(element);
        const inner = element.firstElementChild;
        if (inner !== null) observer.observe(inner);
      }
      if (typeof MutationObserver !== "undefined") {
        mutations = new MutationObserver(follow);
        mutations.observe(element, { childList: true, subtree: true, characterData: true });
      }
      measure();
    },
  };
}
