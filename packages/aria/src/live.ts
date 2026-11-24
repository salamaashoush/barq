/**
 * Telling a screen reader something that is not in the document.
 *
 * "3 results", "Copied", "Removed from cart": a change a sighted user sees in
 * a corner of the screen and a screen reader user learns nothing about unless
 * it is announced. A live region is the mechanism, and it has to exist before
 * the text lands in it — a region added and filled in the same task is read by
 * nothing, because the announcement is diffed against what was there when the
 * region was first observed.
 *
 * One pair of regions for the page, created on the first announcement and
 * reused. Two, not one: `assertive` interrupts what the user is listening to
 * and `polite` waits, and a widget that gets that choice wrong is either
 * ignored or infuriating.
 */

import { focusWithin } from "./interactions/focus-events.ts";

export type Assertiveness = "assertive" | "polite";

/** Text, or a reference to an element that already holds the text. */
export type Announcement = string | { "aria-labelledby": string };

const DEFAULT_TIMEOUT = 7000;

const HIDDEN_STYLE = {
  border: "0",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  height: "1px",
  margin: "-1px",
  overflow: "hidden",
  padding: "0",
  position: "absolute",
  width: "1px",
  whiteSpace: "nowrap",
} as const;

class Announcer {
  node: HTMLElement | null = null;
  #assertive: HTMLElement | null = null;
  #polite: HTMLElement | null = null;

  constructor() {
    if (typeof document === "undefined") return;

    this.node = document.createElement("div");
    this.node.dataset.barqLiveAnnouncer = "true";
    Object.assign(this.node.style, HIDDEN_STYLE);

    this.#assertive = this.#createLog("assertive");
    this.#polite = this.#createLog("polite");
    this.node.append(this.#assertive, this.#polite);

    // Prepended rather than appended: a region at the end of the body is
    // inside whatever overlay was portalled there last, and an `aria-hidden`
    // on that overlay would hide the announcements with it.
    document.body.prepend(this.node);
  }

  #createLog(live: Assertiveness): HTMLElement {
    const log = document.createElement("div");
    log.setAttribute("role", "log");
    log.setAttribute("aria-live", live);
    // Only additions are announced; the removal below must be silent.
    log.setAttribute("aria-relevant", "additions");
    return log;
  }

  isAttached(): boolean {
    return this.node?.isConnected === true;
  }

  announce(message: Announcement, assertiveness: Assertiveness, timeout: number): () => void {
    if (this.node === null) return () => {};

    const entry = document.createElement("div");
    if (typeof message === "object") {
      // An `aria-labelledby` is only read on an element with a role that takes
      // a name from one.
      entry.setAttribute("role", "img");
      entry.setAttribute("aria-labelledby", message["aria-labelledby"]);
    } else {
      entry.textContent = message;
    }

    (assertiveness === "assertive" ? this.#assertive : this.#polite)?.appendChild(entry);

    // Removed once it has certainly been read, so the region does not grow
    // without bound over a long session.
    const timer = message === "" ? undefined : setTimeout(() => entry.remove(), timeout);
    return () => {
      clearTimeout(timer);
      entry.remove();
    };
  }

  /** Take out every entry named by an element that is no longer in the document. */
  prune(): void {
    if (this.node === null) return;
    for (const entry of this.node.querySelectorAll("[aria-labelledby]")) {
      const ids = (entry.getAttribute("aria-labelledby") ?? "").split(/\s+/u);
      if (ids.some((id) => id !== "" && document.getElementById(id) === null)) entry.remove();
    }
  }

  clear(assertiveness?: Assertiveness): void {
    if (this.node === null) return;
    if (assertiveness === undefined || assertiveness === "assertive") {
      if (this.#assertive !== null) this.#assertive.innerHTML = "";
    }
    if (assertiveness === undefined || assertiveness === "polite") {
      if (this.#polite !== null) this.#polite.innerHTML = "";
    }
  }

  destroy(): void {
    this.node?.remove();
    this.node = null;
  }
}

let announcer: Announcer | null = null;

/** Whether the first announcement should wait for the region to settle. */
const isTest = typeof process !== "undefined" && process.env.NODE_ENV === "test";

/**
 * Say something to assistive technology.
 *
 * ```ts
 * announce(`${count} results`, "polite");
 * ```
 *
 * The first call creates the region and waits a moment before filling it:
 * WebKit reads nothing from a region that gained its content in the same frame
 * it was inserted. Subsequent calls are immediate.
 *
 * Returns a function that takes the announcement back. One made by reference
 * must be taken back when the element it names goes: until its timeout the
 * entry would point at an id that is gone, or that the next element to be
 * given the id answers for.
 */
export function announce(
  message: Announcement,
  assertiveness: Assertiveness = "assertive",
  timeout: number = DEFAULT_TIMEOUT,
): () => void {
  // A region the page took out of the document says nothing, and an
  // application that replaces the body's content does take it out.
  if (announcer !== null && !announcer.isAttached()) destroyAnnouncer();

  if (announcer !== null) {
    return announcer.announce(message, assertiveness, timeout);
  }

  announcer = new Announcer();

  if (isTest) {
    return announcer.announce(message, assertiveness, timeout);
  }

  let withdraw: (() => void) | undefined;
  let withdrawn = false;
  setTimeout(() => {
    if (withdrawn || announcer?.isAttached() !== true) return;
    withdraw = announcer.announce(message, assertiveness, timeout);
  }, 100);
  return () => {
    withdrawn = true;
    withdraw?.();
  };
}

/**
 * Take out the announcements made by reference whose element has gone: one
 * named a part shown only for a moment, such as a pending button's progress
 * bar, and would otherwise point at nothing until its timeout.
 */
export function pruneAnnouncements(): void {
  announcer?.prune();
}

/** Drop everything queued, for one politeness level or both. */
export function clearAnnouncer(assertiveness?: Assertiveness): void {
  announcer?.clear(assertiveness);
}

/** Remove the live regions entirely. */
export function destroyAnnouncer(): void {
  announcer?.destroy();
  announcer = null;
}

// ---------------------------------------------------------------------------
// Visually hidden
// ---------------------------------------------------------------------------

export interface VisuallyHiddenOptions {
  /**
   * Let the element appear when it takes focus.
   *
   * For a skip link: hidden until the user tabs to it, then visible so a
   * sighted keyboard user can see where focus went.
   */
  isFocusable?: boolean;
}

export interface VisuallyHiddenResult {
  visuallyHiddenProps: Record<string, unknown>;
}

/**
 * Hidden from sight, present for assistive technology.
 *
 * Not `display: none` and not `visibility: hidden`: both remove the element
 * from the accessibility tree, which is the opposite of the point. The clip
 * rectangle is what leaves it in the tree while occupying no visible space.
 *
 * ```tsx
 * const { visuallyHiddenProps } = visuallyHidden();
 * <span {...visuallyHiddenProps}>Loading</span>
 * ```
 */
export function visuallyHidden(options: VisuallyHiddenOptions = {}): VisuallyHiddenResult {
  if (options.isFocusable !== true) {
    return { visuallyHiddenProps: { style: { ...HIDDEN_STYLE } } };
  }

  const { isFocusWithin, focusWithinProps } = focusWithin({});

  return {
    visuallyHiddenProps: {
      ...focusWithinProps,
      style: () => (isFocusWithin() ? {} : { ...HIDDEN_STYLE }),
    },
  };
}
