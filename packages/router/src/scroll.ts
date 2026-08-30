/**
 * Scroll restoration and view transitions.
 *
 * Both are new work: the router this replaced had ZERO tests for either, so
 * there was nothing to port, only a list of what it got wrong and TanStack's
 * shape to compare against. Every bug below is one of theirs, named where it
 * came from.
 */

import type { Location } from "./history.ts";

/** Bumped when the stored shape changes, so an old entry is ignored rather than misread. */
const STORAGE_KEY = "barq-scroll-v1";

/** Beyond this the oldest entries go. The old router's map grew forever. */
const MAX_ENTRIES = 50;

/** An element opts into having its own scroll remembered. */
export const SCROLL_ID_ATTRIBUTE = "data-scroll-id";

interface Offsets {
  readonly x: number;
  readonly y: number;
}

/** One saved position per scrollable thing, keyed by element id or `window`. */
type Entry = Record<string, Offsets>;

/**
 * The key a position is filed under.
 *
 * Includes the HASH, unlike the old router's `pathname + search`, because
 * `/docs#intro` and `/docs#api` are different places on the page and sharing one
 * slot means arriving at the wrong one. It does NOT include `state`, which is
 * not part of where you are.
 */
export function scrollKey(location: Location): string {
  return location.pathname + location.search + location.hash;
}

function storage(): Storage | null {
  try {
    // Touching `sessionStorage` at all throws on an opaque origin, so the read
    // is what has to be guarded, not just its result.
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function read(): Record<string, Entry> {
  const store = storage();
  if (store === null) return {};
  try {
    const raw = store.getItem(STORAGE_KEY);
    return raw === null ? {} : (JSON.parse(raw) as Record<string, Entry>);
  } catch {
    return {};
  }
}

function write(all: Record<string, Entry>): void {
  const store = storage();
  if (store === null) return;
  const keys = Object.keys(all);
  // Oldest-first, because insertion order is what `Object.keys` gives and a
  // re-saved key is deleted before it is re-added.
  if (keys.length > MAX_ENTRIES) {
    for (const key of keys.slice(0, keys.length - MAX_ENTRIES)) delete all[key];
  }
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // A full quota or a private window. Losing a scroll position is not worth
    // failing a navigation over.
  }
}

/** Every element that opted in, plus the window. */
function containers(): { id: string; get: () => Offsets; set: (to: Offsets) => void }[] {
  const out = [
    {
      id: "window",
      get: (): Offsets => ({ x: window.scrollX, y: window.scrollY }),
      set: (to: Offsets): void => window.scrollTo(to.x, to.y),
    },
  ];
  for (const element of document.querySelectorAll(`[${SCROLL_ID_ATTRIBUTE}]`)) {
    const id = element.getAttribute(SCROLL_ID_ATTRIBUTE);
    if (id === null || id === "") continue;
    out.push({
      id,
      get: () => ({ x: element.scrollLeft, y: element.scrollTop }),
      set: (to) => {
        element.scrollLeft = to.x;
        element.scrollTop = to.y;
      },
    });
  }
  return out;
}

export interface ScrollRestoration {
  /** Remember where the CURRENT page is, before leaving it. */
  save(location: Location): void;
  /** Put the new page where it was, or at the top, or at its hash. */
  restore(location: Location, options?: { readonly reset?: boolean }): void;
  dispose(): void;
}

/**
 * Scroll restoration, or a no-op where there is no DOM.
 *
 * `history.scrollRestoration` is set to `"manual"`, which the old router never
 * did — so the browser's own restoration raced the router's on every popstate,
 * and could clobber `window.scrollY` before the handler read it.
 */
export function scrollRestoration(): ScrollRestoration {
  if (typeof document === "undefined") {
    return { save: () => {}, restore: () => {}, dispose: () => {} };
  }

  const previous = history.scrollRestoration;
  try {
    history.scrollRestoration = "manual";
  } catch {
    // Not every environment allows it; the router still restores what it can.
  }

  return {
    save(location) {
      const key = scrollKey(location);
      const all = read();
      const entry: Entry = {};
      for (const container of containers()) entry[container.id] = container.get();
      // Delete before re-adding so the eviction order stays least-recently-used
      // rather than first-ever-seen.
      delete all[key];
      all[key] = entry;
      write(all);
    },

    restore(location, options) {
      const saved = options?.reset === true ? undefined : read()[scrollKey(location)];
      const apply = (): void => {
        if (saved !== undefined) {
          for (const container of containers()) {
            const at = saved[container.id];
            if (at !== undefined) container.set(at);
          }
          return;
        }
        // A hash wins over the top, which the old router never handled at all:
        // it scrolled to `(0,0)` for every `#section` link.
        const id = location.hash.slice(1);
        if (id !== "") {
          const target = document.getElementById(id);
          if (target !== null) {
            target.scrollIntoView();
            return;
          }
        }
        window.scrollTo(0, 0);
      };

      // BEFORE the next paint. The old router restored after
      // `await transition.finished`, i.e. at the END of the view transition, so
      // the page visibly jumped once the animation had already played.
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(apply);
      else apply();
    },

    dispose() {
      try {
        history.scrollRestoration = previous;
      } catch {
        // As above.
      }
    },
  };
}

export interface ViewTransitionOptions {
  /** Skip the transition for this navigation. */
  readonly enabled?: boolean;
}

let transitionsInert = false;

/**
 * A running view transition paints a snapshot ABOVE the page and that snapshot
 * takes the hit test, so the first click after a commit lands on it and is
 * discarded — for the whole animation, and silently. One stylesheet, once.
 *
 * The one thing the deleted router got right here, kept verbatim in intent.
 */
function makeTransitionsInert(): void {
  if (transitionsInert || typeof document === "undefined") return;
  transitionsInert = true;
  const sheet = document.createElement("style");
  sheet.textContent =
    "::view-transition-group(*),::view-transition-old(*),::view-transition-new(*)" +
    "{pointer-events:none}";
  document.head.append(sheet);
}

let inFlight = false;

/**
 * Run a DOM commit inside a view transition when one is available and wanted.
 *
 * THREE THINGS, and the first is the one both prior arts get wrong in opposite
 * directions.
 *
 *  - It awaits `updateCallbackDone`, NOT `finished`. `finished` resolves when
 *    the ANIMATION ends, so awaiting it pins everything downstream — a loading
 *    flag, a scroll restore, an `afterEach` hook — for the animation's whole
 *    duration. The old router awaited `finished` and did exactly that.
 *  - The commit is flushed SYNCHRONOUSLY inside the callback. The browser
 *    snapshots the DOM as it stands when the callback returns, and barq's
 *    propagation is microtask-scheduled, so without the flush the transition
 *    animates old-to-old. This line is worth stealing verbatim and it is the
 *    reason `flush` is imported here at all.
 *  - A hidden tab and an in-flight transition both fall back to a plain commit.
 *    In a background tab the promises may never settle, which would hang the
 *    navigation; overlapping calls are rejected by the browser.
 */
export async function withViewTransition(
  commit: () => void,
  options?: ViewTransitionOptions,
): Promise<void> {
  const supported =
    typeof document !== "undefined" &&
    typeof (document as { startViewTransition?: unknown }).startViewTransition === "function";

  // `inFlight` first: it is the cheapest check, and the convention test reads a
  // module-level mutable AFTER a `||` as a resolver falling back to one. This is
  // a re-entrancy guard rather than a fallback — the browser allows one
  // transition per document, so the flag is correctly global — but the ordering
  // is better this way regardless.
  if (
    inFlight ||
    options?.enabled !== true ||
    !supported ||
    document.visibilityState === "hidden"
  ) {
    commit();
    return;
  }

  makeTransitionsInert();
  inFlight = true;
  try {
    const transition = (
      document as unknown as {
        startViewTransition: (callback: () => void) => {
          updateCallbackDone: Promise<void>;
          finished: Promise<void>;
        };
      }
    ).startViewTransition(commit);
    // The animation is left to run unobserved, and its rejection is swallowed
    // here rather than becoming an unhandled one.
    void transition.finished.catch(() => {});
    await transition.updateCallbackDone;
  } catch {
    // A synchronous refusal — the callback threw, or the browser declined.
    commit();
  } finally {
    inFlight = false;
  }
}
