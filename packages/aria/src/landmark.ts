/**
 * Landmark navigation: F6 and Shift+F6 move between the regions of a page,
 * Alt+F6 goes straight to `main`.
 *
 * A screen reader user already has landmark navigation; a sighted keyboard
 * user does not, and without it reaching the table in the middle of a page
 * means tabbing through every control in the header and the sidebar first.
 * The desktop convention for moving between the panes of an application is
 * F6, so that is the key.
 *
 * Three things make it more than a jump:
 *
 * - **Coming back lands where you left.** The last element focused inside a
 *   landmark is remembered, and F6 into that landmark restores it rather than
 *   starting over at the landmark itself. Only a landmark never visited, or
 *   one whose element has gone, takes focus on itself, with `tabIndex={-1}`
 *   for exactly as long as it holds it, so a click can never land there.
 * - **Nesting is document order.** A region inside `main` comes after `main`
 *   and before whatever follows `main`, which is what a reader moving down the
 *   page expects, and a landmark under `aria-hidden` is skipped.
 * - **One manager per document.** Every landmark on the page registers with a
 *   single manager kept on the document under a `Symbol.for` key, so two
 *   copies of this package (an application and a widget built against another
 *   version) share one F6 sequence instead of each moving focus for the same
 *   key. The newer manager wins and announces itself, and every landmark
 *   re-registers with it.
 *
 * Reaching either end of the sequence dispatches a cancelable
 * `barq-landmark-navigation` event from the focused element before wrapping;
 * cancelling it stops the wrap, which is how an application hands the key on
 * to a parent frame.
 */

import {
  type Accessor,
  createEffect,
  createSignal,
  isDev,
  untrack,
  type RefObject,
} from "@barqjs/core";
import { tryCleanup } from "@barqjs/primitives/utils";
import { isServer } from "@barqjs/web";
import { contains, targetElement } from "./dom.ts";
import type { ElementRef } from "./interactions/press.ts";
import { access, type DOMProps, type MaybeAccessor } from "./utils.ts";

export type LandmarkRole =
  | "main"
  | "region"
  | "search"
  | "navigation"
  | "form"
  | "banner"
  | "contentinfo"
  | "complementary";

export type LandmarkDirection = "forward" | "backward";

export interface LandmarkOptions {
  role: MaybeAccessor<LandmarkRole>;
  /** The landmark's element. */
  ref: ElementRef<HTMLElement>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  /**
   * Take focus when F6 arrives, for a landmark that manages focus inside
   * itself. By default the landmark's own element is focused.
   */
  focus?: (direction: LandmarkDirection) => void;
}

export interface LandmarkResult {
  landmarkProps: DOMProps;
  /** Whether the landmark's own element holds focus because F6 put it there. */
  isLandmarkFocused: Accessor<boolean>;
}

export interface LandmarkControllerOptions {
  /** Where to navigate from. @default document.activeElement */
  from?: Element;
}

/** Landmark navigation driven from code: a toolbar button, a shortcut of the page's own. */
export interface LandmarkController {
  focusNext(options?: LandmarkControllerOptions): boolean;
  focusPrevious(options?: LandmarkControllerOptions): boolean;
  focusMain(): boolean;
  navigate(direction: LandmarkDirection, options?: LandmarkControllerOptions): boolean;
  /**
   * Release the controller. Once no landmark and no controller remain, the
   * manager takes its keyboard listeners off the document.
   */
  dispose(): void;
}

/**
 * Bumped whenever {@link LandmarkManagerApi} or {@link Landmark} change. A copy
 * of the package finding a manager of the same or a newer version uses it.
 */
const LANDMARK_API_VERSION = 1;

/**
 * The contract between copies of this package. Members may be added; none may
 * change or go, or an older copy registering with a newer manager breaks.
 */
interface LandmarkManagerApi {
  version: number;
  createLandmarkController(): LandmarkController;
  registerLandmark(landmark: Landmark): () => void;
}

/**
 * One registered landmark. Properties added later must be optional, so a
 * landmark from an older copy still registers with a newer manager.
 */
interface Landmark {
  /** Compared by identity: the same handle registering again is an update. */
  ref: Readonly<RefObject<HTMLElement>>;
  role: LandmarkRole;
  label?: string | undefined;
  lastFocused?: HTMLElement | undefined;
  focus: (direction: LandmarkDirection) => void;
  blur: () => void;
}

const MANAGER_KEY = Symbol.for("barq-landmark-manager");
const MANAGER_CHANGE = "barq-landmark-manager-change";
const NAVIGATION_EVENT = "barq-landmark-navigation";

type ManagedDocument = Document & { [MANAGER_KEY]?: LandmarkManagerApi };

function parentElementOf(element: Element): Element | null {
  if (element.parentElement !== null) return element.parentElement;
  const parent = element.parentNode;
  return parent instanceof ShadowRoot ? parent.host : null;
}

class LandmarkManager implements LandmarkManagerApi {
  version = LANDMARK_API_VERSION;
  #landmarks: Landmark[] = [];
  #isListening = false;
  #controllers = 0;

  #setupIfNeeded(): void {
    if (this.#isListening) return;
    document.addEventListener("keydown", this.#onKeyDown, { capture: true });
    document.addEventListener("focusin", this.#onFocusIn, { capture: true });
    document.addEventListener("focusout", this.#onFocusOut, { capture: true });
    this.#isListening = true;
  }

  #teardownIfNeeded(): void {
    if (!this.#isListening || this.#landmarks.length > 0 || this.#controllers > 0) return;
    document.removeEventListener("keydown", this.#onKeyDown, { capture: true });
    document.removeEventListener("focusin", this.#onFocusIn, { capture: true });
    document.removeEventListener("focusout", this.#onFocusOut, { capture: true });
    this.#isListening = false;
  }

  #add(entry: Landmark): void {
    this.#setupIfNeeded();
    const element = entry.ref.current;
    if (element === null || this.#landmarks.some((each) => each.ref === entry.ref)) return;

    if (isDev && entry.role === "main" && this.#landmarks.some((each) => each.role === "main")) {
      console.error('Page can contain no more than one landmark with the role "main".');
    }

    // Kept in document order, a parent before what it contains, so the
    // sequence F6 walks is the order a reader meets them in.
    let start = 0;
    let end = this.#landmarks.length - 1;
    while (start <= end) {
      const middle = Math.floor((start + end) / 2);
      const other = this.#landmarks[middle]?.ref.current;
      const position =
        other === null || other === undefined ? 0 : element.compareDocumentPosition(other);
      const isAfter =
        (position & Node.DOCUMENT_POSITION_PRECEDING) !== 0 ||
        (position & Node.DOCUMENT_POSITION_CONTAINS) !== 0;
      if (isAfter) start = middle + 1;
      else end = middle - 1;
    }
    this.#landmarks.splice(start, 0, entry);
    this.#checkLabels(entry.role);
  }

  #update(change: Pick<Landmark, "ref"> & Partial<Landmark>): void {
    const index = this.#landmarks.findIndex((each) => each.ref === change.ref);
    const current = this.#landmarks[index];
    if (current === undefined) return;
    const next = { ...current, ...change };
    this.#landmarks[index] = next;
    this.#checkLabels(next.role);
  }

  #remove(ref: Landmark["ref"]): void {
    this.#landmarks = this.#landmarks.filter((each) => each.ref !== ref);
    this.#teardownIfNeeded();
  }

  /**
   * Two landmarks of one role must each be labelled, and labelled
   * differently, or a screen reader's landmark list shows two identical
   * entries with nothing to choose between them.
   */
  #checkLabels(role: LandmarkRole): void {
    if (!isDev) return;
    const withRole = this.#landmarks.filter((each) => each.role === role);
    if (withRole.length < 2) return;

    const unlabelled = withRole.filter((each) => each.label === undefined || each.label === "");
    if (unlabelled.length > 0) {
      console.warn(
        `Page contains more than one landmark with the '${role}' role. If two or more landmarks on a page share the same role, all must be labeled with an aria-label or aria-labelledby attribute: `,
        unlabelled.map((each) => each.ref.current),
      );
      return;
    }

    const labels = withRole.map((each) => each.label);
    const duplicates = new Set(labels.filter((label, index) => labels.indexOf(label) !== index));
    for (const label of duplicates) {
      console.warn(
        `Page contains more than one landmark with the '${role}' role and '${String(label)}' label. If two or more landmarks on a page share the same role, they must have unique labels: `,
        withRole.filter((each) => each.label === label).map((each) => each.ref.current),
      );
    }
  }

  /** The nearest registered landmark at or above `element`. */
  #closest(element: Element | null): Landmark | undefined {
    if (element === null) return undefined;
    const byElement = new Map(this.#landmarks.map((each) => [each.ref.current, each]));
    let at: Element | null = element;
    while (at !== null && !byElement.has(at as HTMLElement) && at !== document.body) {
      at = parentElementOf(at);
    }
    return at === null ? undefined : byElement.get(at as HTMLElement);
  }

  #next(from: Element, backward: boolean): Landmark | undefined {
    const current = this.#closest(from);
    let index = backward ? this.#landmarks.length - 1 : 0;
    if (current !== undefined) index = this.#landmarks.indexOf(current) + (backward ? -1 : 1);

    // Past either end: say so first, and stop if the page took the key.
    const wrapIfNeeded = (): boolean => {
      if (index < 0 || index >= this.#landmarks.length) {
        const direction: LandmarkDirection = index < 0 ? "backward" : "forward";
        const proceed = from.dispatchEvent(
          new CustomEvent(NAVIGATION_EVENT, {
            detail: { direction },
            bubbles: true,
            cancelable: true,
          }),
        );
        if (!proceed) return true;
        index = index < 0 ? this.#landmarks.length - 1 : 0;
      }
      return index < 0 || index >= this.#landmarks.length;
    };

    if (wrapIfNeeded()) return undefined;

    const start = index;
    while (this.#landmarks[index]?.ref.current?.closest("[aria-hidden=true]")) {
      index += backward ? -1 : 1;
      if (wrapIfNeeded()) return undefined;
      if (index === start) break;
    }
    return this.#landmarks[index];
  }

  #focusLandmark(element: HTMLElement, direction: LandmarkDirection): void {
    this.#landmarks.find((each) => each.ref.current === element)?.focus(direction);
  }

  focusMain(): boolean {
    const main = this.#landmarks.find((each) => each.role === "main");
    const element = main?.ref.current;
    if (element === null || element === undefined || !element.isConnected) return false;
    this.#focusLandmark(element, "forward");
    return true;
  }

  navigate(from: Element, backward: boolean): boolean {
    const next = this.#next(from, backward);
    if (next === undefined) return false;

    const last = next.lastFocused;
    if (last !== undefined && contains(document.body, last)) {
      last.focus();
      return true;
    }

    const element = next.ref.current;
    if (element !== null && element.isConnected) {
      this.#focusLandmark(element, backward ? "backward" : "forward");
      return true;
    }
    return false;
  }

  // Arrow properties: they are added to and removed from the document, and the
  // same function has to be handed to both.
  #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "F6") return;
    const from = targetElement(event) ?? document.body;
    const handled = event.altKey ? this.focusMain() : this.navigate(from, event.shiftKey);
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  #onFocusIn = (event: FocusEvent): void => {
    const target = targetElement(event);
    const within = this.#closest(target);
    if (within !== undefined && within.ref.current !== target && target instanceof HTMLElement) {
      this.#update({ ref: within.ref, lastFocused: target });
    }
    // Focus moving off a landmark that F6 had focused gives it back its
    // place out of the Tab order.
    const previous = event.relatedTarget instanceof Element ? event.relatedTarget : null;
    if (previous !== null) {
      const left = this.#closest(previous);
      if (left !== undefined && left.ref.current === previous) left.blur();
    }
  };

  // Focus lost to nothing raises no `focusin`, so the landmark that had it is
  // told here instead.
  #onFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget;
    if (next !== null && (next as unknown) !== document) return;
    const previous = targetElement(event);
    const left = this.#closest(previous);
    if (left !== undefined && left.ref.current === previous) left.blur();
  };

  createLandmarkController(): LandmarkController {
    let disposed = false;
    this.#controllers++;
    this.#setupIfNeeded();
    function from(options?: LandmarkControllerOptions): Element {
      return options?.from ?? document.activeElement ?? document.body;
    }
    return {
      navigate: (direction, options) =>
        !disposed && this.navigate(from(options), direction === "backward"),
      focusNext: (options) => !disposed && this.navigate(from(options), false),
      focusPrevious: (options) => !disposed && this.navigate(from(options), true),
      focusMain: () => !disposed && this.focusMain(),
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.#controllers--;
        this.#teardownIfNeeded();
      },
    };
  }

  registerLandmark(entry: Landmark): () => void {
    if (this.#landmarks.some((each) => each.ref === entry.ref)) this.#update(entry);
    else this.#add(entry);
    return () => this.#remove(entry.ref);
  }
}

/** The document's manager, made and announced when there is none as new as this one. */
function landmarkManager(): LandmarkManagerApi | null {
  if (typeof document === "undefined") return null;
  const doc = document as ManagedDocument;
  const existing = doc[MANAGER_KEY];
  if (existing !== undefined && existing.version >= LANDMARK_API_VERSION) return existing;

  const created = new LandmarkManager();
  doc[MANAGER_KEY] = created;
  document.dispatchEvent(new CustomEvent(MANAGER_CHANGE));
  return created;
}

function onManagerChange(listener: () => void): () => void {
  document.addEventListener(MANAGER_CHANGE, listener);
  return () => document.removeEventListener(MANAGER_CHANGE, listener);
}

/**
 * Landmark navigation from code.
 *
 * ```ts
 * const landmarks = createLandmarkController();
 * skipButton.onclick = () => landmarks.focusMain();
 * ```
 *
 * Holding a controller keeps F6 working on a page with no landmark registered
 * yet. Calls go to whichever manager the document holds at the time, so a
 * newer copy of the package taking over does not strand it.
 */
export function createLandmarkController(): LandmarkController {
  let controller = landmarkManager()?.createLandmarkController();
  const unsubscribe =
    typeof document === "undefined"
      ? () => {}
      : onManagerChange(() => {
          controller?.dispose();
          controller = landmarkManager()?.createLandmarkController();
        });

  return {
    navigate: (direction, options) => controller?.navigate(direction, options) ?? false,
    focusNext: (options) => controller?.focusNext(options) ?? false,
    focusPrevious: (options) => controller?.focusPrevious(options) ?? false,
    focusMain: () => controller?.focusMain() ?? false,
    dispose: () => {
      controller?.dispose();
      unsubscribe();
      controller = undefined;
    },
  };
}

/**
 * Make an element a landmark that F6 can reach.
 *
 * ```tsx
 * const domRef = ref<HTMLElement>();
 * const { landmarkProps } = landmark({ role: "navigation", "aria-label": "Site", ref: domRef });
 * <nav {...landmarkProps} ref={domRef.set}>…</nav>
 * ```
 */
export function landmark(options: LandmarkOptions): LandmarkResult {
  const [isLandmarkFocused, setLandmarkFocused] = createSignal(false);
  function label(): string | undefined {
    return access(options["aria-label"]) ?? access(options["aria-labelledby"]);
  }

  if (!isServer) {
    // A newer copy of the package can replace the manager from inside its own
    // component body, so the write lands under that component's owner.
    const [manager, setManager] = createSignal<LandmarkManagerApi | null>(landmarkManager(), {
      ownedWrite: true,
    });
    tryCleanup(onManagerChange(() => setManager(() => landmarkManager())));

    const handle: Landmark["ref"] = {
      // Read by the manager from event listeners, which may run inside an
      // effect that moved focus: imperative, so never tracked.
      get current() {
        return untrack(() => access(options.ref)) ?? null;
      },
    };

    createEffect(
      () => ({
        current: manager(),
        element: access(options.ref),
        role: access(options.role),
        label: label(),
      }),
      ({ current, element, role, label: name }) => {
        if (current === null || element === null || element === undefined) return undefined;
        return current.registerLandmark({
          ref: handle,
          role,
          label: name,
          focus: (direction) => {
            if (options.focus !== undefined) options.focus(direction);
            else setLandmarkFocused(true);
          },
          blur: () => setLandmarkFocused(false),
        });
      },
    );

    // After the render that put `tabIndex={-1}` on it: a `<main>` without one
    // refuses focus.
    createEffect(
      () => (isLandmarkFocused() ? access(options.ref) : null),
      (element) => element?.focus(),
    );
  }

  return {
    isLandmarkFocused,
    landmarkProps: {
      role: () => access(options.role),
      tabIndex: () => (isLandmarkFocused() ? -1 : undefined),
      "aria-label": () => access(options["aria-label"]),
      "aria-labelledby": () => access(options["aria-labelledby"]),
    },
  };
}
