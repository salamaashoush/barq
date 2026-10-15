/**
 * A navigation menu's state: which item is open, and which way it moved.
 *
 * This is the piece `@barqjs/ui`'s `<NavigationMenu>` needed and nothing here
 * had. It is not a menu: a menu opens one panel at a time from a press and
 * closes on choosing, and a navigation menu opens on HOVER, keeps the panel
 * while the pointer travels to it, and slides sideways when the pointer moves
 * to the next trigger rather than closing and reopening.
 *
 * Three things follow from that and each is a decision rather than a detail.
 *
 * **Opening is immediate once one is open.** The first panel waits, so brushing
 * the bar on the way somewhere else opens nothing; after that the menu is
 * "active" and moving between triggers is instant, because a delay there reads
 * as lag rather than as intent.
 *
 * **Closing waits.** The pointer has to cross the gap between the trigger and
 * the panel, and a menu that closes the moment it leaves the trigger cannot be
 * reached at all.
 *
 * **The previous key is kept**, because the panel's animation depends on which
 * side it came from. That is upstream's `data-motion`, and it is the only
 * reason a navigation menu looks different from a row of popovers.
 *
 * {@link navigationMenu} is the other half: the keyboard and the pointer. Its
 * decisions:
 *
 * **The bar is a row of Tab stops, and the arrows are a shortcut along it.**
 * This is the disclosure navigation pattern, not a menubar: every trigger and
 * every top-level link stays in the Tab order, because a site's navigation
 * that Tab skips is navigation a keyboard user has to learn a second key for.
 *
 * **Tab reads a panel straight after its trigger, wherever the panel is.** A
 * shared viewport sits after the whole list in the document, so the browser's
 * own order would visit every other trigger first. The order is corrected only
 * when the two disagree, so a panel rendered beside its trigger is left to the
 * browser entirely.
 *
 * **The key that points at the panel goes into it.** ArrowDown under a
 * horizontal bar, the inline-end arrow beside a vertical one. It opens the
 * panel first when it is closed, where Radix moves along the bar instead: an
 * arrow pointing at where a panel will appear and going sideways is the
 * surprise, and the horizontal arrows already do that.
 *
 * **A press closes only what a press opened.** Reaching a trigger with a mouse
 * means entering it first, which opens the panel, so a press that toggles
 * finds it open and shuts it again.
 */

import { createSignal, createEffect, createUniqueId, isServer, type Accessor } from "@barqjs/core";
import { resizeObserver } from "@barqjs/primitives/observers";
import { ref as makeRef } from "@barqjs/primitives/refs";

import type { Key } from "./collections.ts";
import { activeElement, contains, ownerDocument, targetElement } from "./dom.ts";
import { focusableWalker } from "./focus.ts";
import { useLocale } from "./i18n.ts";
import type { ElementRef } from "./interactions/press.ts";
import { presence } from "./presence.ts";
import type { Direction, Orientation } from "./selection.ts";
import { access, id, type DOMProps, type MaybeAccessor } from "./utils.ts";

/** How long the FIRST panel waits before opening on hover. */
const OPEN_DELAY = 200;
/** How long any panel stays after the pointer leaves it and its trigger. */
const CLOSE_DELAY = 300;
/** How long after closing a hover still opens at once. */
const SKIP_DELAY = 300;

export interface NavigationMenuStateOptions {
  value?: MaybeAccessor<Key | null | undefined>;
  defaultValue?: MaybeAccessor<Key | null | undefined>;
  /** How long the first panel waits. @default 200 */
  delay?: MaybeAccessor<number | undefined>;
  /** How long a panel stays once the pointer has left. @default 300 */
  closeDelay?: MaybeAccessor<number | undefined>;
  /**
   * How long after the last panel closed a hover opens the next one with no
   * wait. Zero makes every first open wait. @default 300
   */
  skipDelay?: MaybeAccessor<number | undefined>;
  onValueChange?: (value: Key | null) => void;
}

export type MotionDirection = "from-start" | "from-end" | "to-start" | "to-end" | null;

export interface NavigationMenuState {
  /** The open item, or `null`. */
  readonly value: Accessor<Key | null>;
  /** What was open immediately before, which is what the direction is measured from. */
  readonly previous: Accessor<Key | null>;
  /** Open it now, with no delay. A press and the keyboard both want this. */
  open(value: Key): void;
  /** Open it after the delay, unless something is already open. */
  openSoon(value: Key): void;
  close(): void;
  /** Close after the delay, so the pointer can cross the gap to the panel. */
  closeSoon(): void;
  /** Cancel a pending close, which is what entering the panel does. */
  keep(): void;
  /**
   * Which way a panel is arriving or leaving, given the order of the items.
   *
   * `null` when there is nothing to compare against, and the caller writes no
   * `data-motion` at all rather than writing a direction it made up.
   */
  motion(value: Key, order: readonly Key[]): MotionDirection;
}

export function navigationMenuState(options: NavigationMenuStateOptions = {}): NavigationMenuState {
  const [inner, setInner] = createSignal<Key | null>(access(options.defaultValue) ?? null);
  const [previous, setPrevious] = createSignal<Key | null>(null);
  let openTimer: ReturnType<typeof setTimeout> | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  // Someone who has just had a panel open is still using the bar, so the next
  // hover is not the accidental brush the first delay is there to ignore.
  let warmTimer: ReturnType<typeof setTimeout> | null = null;
  let warm = false;

  const clear = (timer: ReturnType<typeof setTimeout> | null): null => {
    if (timer !== null) clearTimeout(timer);
    return null;
  };

  const value = (): Key | null => access(options.value) ?? inner();

  const set = (next: Key | null): void => {
    const now = value();
    if (now === next) return;
    warmTimer = clear(warmTimer);
    warm = false;
    if (next === null) {
      const lasts = access(options.skipDelay) ?? SKIP_DELAY;
      if (lasts > 0) {
        warm = true;
        warmTimer = setTimeout(() => {
          warm = false;
          warmTimer = null;
        }, lasts);
      }
    }
    setPrevious(now);
    if (access(options.value) === undefined) setInner(next);
    options.onValueChange?.(next);
  };

  const open = (next: Key): void => {
    openTimer = clear(openTimer);
    closeTimer = clear(closeTimer);
    set(next);
  };

  return {
    value,
    previous,
    open,
    openSoon(next) {
      closeTimer = clear(closeTimer);
      // Already open: move NOW. A delay between triggers reads as lag, where
      // the same delay before the first one reads as not having meant it.
      if (value() !== null || warm) {
        open(next);
        return;
      }
      openTimer = clear(openTimer);
      openTimer = setTimeout(() => open(next), access(options.delay) ?? OPEN_DELAY);
    },
    close() {
      openTimer = clear(openTimer);
      closeTimer = clear(closeTimer);
      set(null);
    },
    closeSoon() {
      openTimer = clear(openTimer);
      closeTimer = clear(closeTimer);
      closeTimer = setTimeout(() => set(null), access(options.closeDelay) ?? CLOSE_DELAY);
    },
    keep() {
      closeTimer = clear(closeTimer);
    },
    motion(item, order) {
      const now = value();
      const before = previous();
      const at = order.indexOf(item);
      if (at < 0) return null;

      // Arriving: which side of the one that was open is this?
      if (now === item) {
        if (before === null) return null;
        const from = order.indexOf(before);
        if (from < 0) return null;
        return from < at ? "from-end" : "from-start";
      }

      // Leaving: which side is the one that took its place?
      if (before === item && now !== null) {
        const to = order.indexOf(now);
        if (to < 0) return null;
        return to < at ? "to-end" : "to-start";
      }

      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// The keyboard and the pointer
// ---------------------------------------------------------------------------

/** On every trigger and link: what the arrow keys move between. */
const ITEM = "data-barq-navigation-item";
/** On every panel, so a link inside one is not counted as part of the bar. */
const CONTENT = "data-barq-navigation-content";

export interface NavigationMenuOptions {
  /** The `<nav>`. */
  ref: ElementRef;
  /** @default "horizontal" */
  orientation?: MaybeAccessor<Orientation | undefined>;
  /** @default the direction in scope */
  direction?: MaybeAccessor<Direction | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
}

export interface NavigationMenuItemOptions {
  /** What identifies the item to the shared state. @default a generated id */
  key?: Key | undefined;
}

export interface NavigationMenuTriggerOptions {
  isDisabled?: MaybeAccessor<boolean | undefined>;
}

export interface NavigationMenuLinkOptions {
  /** The link is the current page. */
  isActive?: MaybeAccessor<boolean | undefined>;
  /**
   * Called when the link is chosen, before the menu closes. Cancelling the
   * event keeps the menu open.
   */
  onSelect?: (event: Event) => void;
}

export interface NavigationMenuItemResult {
  key: Key;
  isOpen: Accessor<boolean>;
  contentId: Accessor<string>;
  /** The panel's element, once it exists. */
  content: Accessor<HTMLElement | null>;
  triggerRef: (element: HTMLElement | null) => void;
  contentRef: (element: HTMLElement | null) => void;
  triggerProps: (options?: NavigationMenuTriggerOptions) => DOMProps;
  contentProps: DOMProps;
}

export interface NavigationMenuResult {
  rootProps: DOMProps;
  listProps: DOMProps;
  viewportProps: DOMProps;
  indicatorProps: DOMProps;
  /** Every item, in the order it was declared: the motion is measured from it. */
  order: Accessor<Key[]>;
  orientation: Accessor<Orientation>;
  /** The shared viewport's element, once it exists. */
  viewport: Accessor<HTMLElement | null>;
  viewportRef: (element: HTMLElement | null) => void;
  item: (options?: NavigationMenuItemOptions) => NavigationMenuItemResult;
  linkProps: (options?: NavigationMenuLinkOptions) => DOMProps;
}

interface ItemRecord {
  trigger: Accessor<HTMLElement | null>;
  content: Accessor<HTMLElement | null>;
}

const MOVES = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

function isModified(event: KeyboardEvent): boolean {
  return event.altKey || event.ctrlKey || event.metaKey;
}

function tabbablesIn(root: Element): HTMLElement[] {
  const walker = focusableWalker(root, { tabbable: true });
  const found: HTMLElement[] = [];
  let node = walker.nextNode();
  while (node !== null) {
    found.push(node as HTMLElement);
    node = walker.nextNode();
  }
  return found;
}

function mouseOnly(handler: () => void): (event: PointerEvent) => void {
  return (event) => {
    if (event.pointerType === "mouse") handler();
  };
}

/**
 * The behaviour of a navigation menu, as props for the elements that make it.
 *
 * ```tsx
 * const state = navigationMenuState();
 * const menu = navigationMenu({ ref }, state);
 * const products = menu.item({ key: "products" });
 *
 * <nav {...menu.rootProps} ref={ref.set}>
 *   <ul {...menu.listProps}>
 *     <li>
 *       <button {...products.triggerProps()} ref={products.triggerRef}>Products</button>
 *       <div {...products.contentProps} ref={products.contentRef}>
 *         <a {...menu.linkProps()} href="/analytics">Analytics</a>
 *       </div>
 *     </li>
 *   </ul>
 * </nav>
 * ```
 */
export function navigationMenu(
  options: NavigationMenuOptions,
  state: NavigationMenuState,
): NavigationMenuResult {
  const locale = useLocale();
  const orientation = (): Orientation => access(options.orientation) ?? "horizontal";
  const direction = (): Direction => access(options.direction) ?? locale().direction;
  const root = (): Element | null => (access(options.ref) as Element | null) ?? null;

  const items = new Map<Key, ItemRecord>();
  // `ownedWrite`: an item registers from a component body. The array beside it
  // answers "already registered" within one render, where the signal still
  // holds what the last flush published.
  const declared: Key[] = [];
  const [order, setOrder] = createSignal<Key[]>([], { ownedWrite: true });

  const viewport = makeRef<HTMLElement>();
  const [viewportSize, setViewportSize] = createSignal<{ width: number; height: number } | null>(
    null,
  );
  const [indicator, setIndicator] = createSignal<{ offset: number; size: number } | null>(null);
  // The viewport is a surface of its own, with a size it keeps from the last
  // panel. Left in view while nothing is open, it is an empty box under the bar.
  const viewportGate = presence({ isOpen: () => state.value() !== null, ref: viewport });

  /** Set by a hover that did the opening, cleared by the press that follows. */
  let viaHover = false;
  /** The item whose panel takes focus as soon as it exists. */
  let entering: Key | null = null;

  const openRecord = (): ItemRecord | null => {
    const key = state.value();
    return key === null ? null : (items.get(key) ?? null);
  };

  const focusInto = (content: HTMLElement, end: "first" | "last"): boolean => {
    const inside = tabbablesIn(content);
    const target = end === "first" ? inside[0] : inside[inside.length - 1];
    if (target === undefined) return false;
    target.focus();
    return true;
  };

  /** Close, handing focus back to the trigger when it was inside the panel. */
  const dismiss = (): void => {
    const record = openRecord();
    const content = record?.content() ?? null;
    const held = content !== null && contains(content, activeElement(ownerDocument(content)));
    state.close();
    if (held) record?.trigger()?.focus();
  };

  /** Move along `group` for an arrow, Home or End. */
  const move = (event: KeyboardEvent, group: HTMLElement[]): void => {
    if (event.defaultPrevented || isModified(event) || event.shiftKey) return;
    if (!MOVES.has(event.key)) return;
    const current = targetElement(event)?.closest<HTMLElement>(`[${ITEM}]`) ?? null;
    if (current === null) return;

    const backwards = [direction() === "rtl" ? "ArrowRight" : "ArrowLeft", "ArrowUp", "End"];
    let candidates = backwards.includes(event.key) ? group.toReversed() : group;
    if (event.key.startsWith("Arrow"))
      candidates = candidates.slice(candidates.indexOf(current) + 1);

    candidates[0]?.focus();
    event.preventDefault();
  };

  const itemsOf = (container: Element, content: Element | null): HTMLElement[] =>
    [...container.querySelectorAll<HTMLElement>(`[${ITEM}]`)].filter(
      (element) =>
        element.closest(`[${CONTENT}]`) === content &&
        !(element instanceof HTMLButtonElement && element.disabled),
    );

  /**
   * Tab through the open panel as if it came straight after its trigger.
   *
   * Nothing is done when the document's own order already says that, which is
   * every menu with no shared viewport.
   */
  const onTab = (event: KeyboardEvent): void => {
    const record = openRecord();
    const trigger = record?.trigger() ?? null;
    const content = record?.content() ?? null;
    if (trigger === null || content === null) return;

    const doc = ownerDocument(trigger);
    const active = activeElement(doc);
    const all = tabbablesIn(doc.body);
    const inside = all.filter((element) => contains(content, element));
    if (inside.length === 0) return;

    const outside = all.filter((element) => !contains(content, element));
    const at = outside.indexOf(trigger);
    if (at < 0) return;

    const read = [...outside.slice(0, at + 1), ...inside, ...outside.slice(at + 1)];
    const step = event.shiftKey ? -1 : 1;
    const next = read[read.indexOf(active as HTMLElement) + step];
    if (active === null || !read.includes(active as HTMLElement) || next === undefined) return;
    if (all[all.indexOf(active as HTMLElement) + step] === next) return;

    event.preventDefault();
    next.focus();
  };

  const onRootKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || isModified(event)) return;
    if (event.key === "Tab") {
      onTab(event);
      return;
    }
    if (event.key === "Escape" && state.value() !== null) {
      // Handled here, so a dialog the bar sits in does not close with it.
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    }
  };

  const onListKeyDown = (event: KeyboardEvent): void => {
    const list = event.currentTarget as Element;
    const inPanel = targetElement(event)?.closest(`[${CONTENT}]`) ?? null;
    if (inPanel !== null) return;
    move(event, itemsOf(list, null));
  };

  if (!isServer) {
    // While something is open, the rest of the page can close it: a press
    // anywhere that is not a trigger or the panel, focus going elsewhere, and
    // Escape from wherever the keyboard happens to be.
    createEffect(
      () => (state.value() === null ? null : root()),
      (nav) => {
        if (nav === null) return undefined;
        const doc = ownerDocument(nav);

        const onPointerDown = (event: Event): void => {
          const target = targetElement(event);
          if (target === null) return;
          if (contains(nav, target)) {
            const content = openRecord()?.content() ?? null;
            const view = viewport();
            if (
              (content !== null && contains(content, target)) ||
              (view !== null && contains(view, target)) ||
              target.closest(`[${ITEM}][aria-expanded]`) !== null
            ) {
              return;
            }
          }
          state.close();
        };

        const onFocusIn = (event: Event): void => {
          const target = targetElement(event);
          if (target !== null && !contains(nav, target)) state.close();
        };

        const onKeyDown = (event: KeyboardEvent): void => {
          if (event.key !== "Escape" || event.defaultPrevented) return;
          if (contains(nav, targetElement(event))) return;
          state.close();
        };

        doc.addEventListener("pointerdown", onPointerDown, true);
        doc.addEventListener("focusin", onFocusIn, true);
        doc.addEventListener("keydown", onKeyDown);
        return () => {
          doc.removeEventListener("pointerdown", onPointerDown, true);
          doc.removeEventListener("focusin", onFocusIn, true);
          doc.removeEventListener("keydown", onKeyDown);
        };
      },
    );

    // Where the open trigger is along the bar. Kept when the menu closes, so
    // the indicator fades out where it was rather than jumping to the corner.
    const place = (): void => {
      const nav = root();
      const trigger = openRecord()?.trigger() ?? null;
      if (nav === null || trigger === null) return;
      const bar = nav.getBoundingClientRect();
      const box = trigger.getBoundingClientRect();
      setIndicator(
        orientation() === "horizontal"
          ? { offset: box.left - bar.left, size: box.width }
          : { offset: box.top - bar.top, size: box.height },
      );
    };
    createEffect(
      () => [root(), openRecord()?.trigger() ?? null, orientation()] as const,
      () => place(),
    );
    resizeObserver(root, place);
  }

  const register = (key: Key): void => {
    // Declaration order, and it has to be stable: the motion direction is an
    // index comparison, so a list that reorders itself would animate the wrong
    // way. An item registers once and stays where it was.
    if (declared.includes(key)) return;
    declared.push(key);
    setOrder([...declared]);
  };

  const item = (itemOptions: NavigationMenuItemOptions = {}): NavigationMenuItemResult => {
    const key = itemOptions.key ?? createUniqueId();
    const trigger = makeRef<HTMLElement>();
    const content = makeRef<HTMLElement>();
    const triggerId = id();
    const contentId = id();
    const isOpen = (): boolean => state.value() === key;
    /** One pointer visit opens once, however many moves it is made of. */
    let visited = false;

    register(key);
    items.set(key, { trigger, content });

    const enter = (): void => {
      if (!isOpen()) {
        viaHover = false;
        state.open(key);
      }
      const element = content();
      if (element !== null && element.isConnected && focusInto(element, "first")) return;
      entering = key;
    };

    if (!isServer) {
      // The panel is built after the key that asked for it, and a portalled one
      // is attached later still, so the focus waits for it.
      createEffect(content, (element) => {
        if (element === null || entering !== key) return undefined;
        let attempts = 4;
        const attempt = (): void => {
          if (entering !== key) return;
          if (element.isConnected) {
            entering = null;
            focusInto(element, "first");
          } else if (attempts-- > 0) {
            queueMicrotask(attempt);
          }
        };
        attempt();
        return undefined;
      });

      // The viewport grows to whatever is open, so the panel says how big it
      // is. `offsetWidth`, not `getBoundingClientRect`: every panel enters with
      // a scale animation, and a transformed box reports what it is PAINTED at.
      const report = (): void => {
        const element = content();
        if (element === null || !isOpen()) return;
        setViewportSize({ width: element.offsetWidth, height: element.offsetHeight });
      };
      createEffect(
        () => [content(), isOpen()] as const,
        () => report(),
      );
      resizeObserver(() => (isOpen() ? content() : null), report);
    }

    const onContentKeyDown = (event: KeyboardEvent): void => {
      const element = event.currentTarget as Element;
      // A panel inside this one answers for its own links.
      if (targetElement(event)?.closest(`[${CONTENT}]`) !== element) return;
      move(event, itemsOf(element, element));
    };

    return {
      key,
      isOpen,
      contentId,
      content,
      triggerRef: trigger.set,
      contentRef: content.set,
      triggerProps: (triggerOptions = {}) => {
        const isDisabled = (): boolean => access(triggerOptions.isDisabled) === true;
        return {
          id: triggerId,
          [ITEM]: "",
          disabled: () => isDisabled() || undefined,
          "aria-expanded": () => (isOpen() ? "true" : "false"),
          "aria-controls": () => (isOpen() ? contentId() : undefined),
          "data-state": () => (isOpen() ? "open" : "closed"),
          "data-disabled": () => (isDisabled() ? "" : undefined),
          onPointerMove: mouseOnly(() => {
            if (isDisabled() || visited) return;
            visited = true;
            // Only when the visit DID the opening. Arriving at a trigger that
            // is already open changes nothing, and marking it hover-opened
            // would make the press that follows do nothing for ever.
            if (!isOpen()) viaHover = true;
            state.openSoon(key);
          }),
          onPointerLeave: mouseOnly(() => {
            visited = false;
            if (!isDisabled()) state.closeSoon();
          }),
          onClick: () => {
            if (isOpen() && !viaHover) {
              state.close();
              return;
            }
            viaHover = false;
            state.open(key);
          },
          onKeyDown: (event: KeyboardEvent) => {
            if (isModified(event) || event.shiftKey) return;
            const into =
              orientation() === "horizontal"
                ? "ArrowDown"
                : direction() === "rtl"
                  ? "ArrowLeft"
                  : "ArrowRight";
            if (event.key !== into) return;
            event.preventDefault();
            enter();
          },
        };
      },
      contentProps: {
        id: contentId,
        [CONTENT]: "",
        "aria-labelledby": triggerId,
        "data-state": () => (isOpen() ? "open" : "closed"),
        "data-motion": () => state.motion(key, order()) ?? undefined,
        "data-orientation": orientation,
        onPointerEnter: () => state.keep(),
        onPointerLeave: mouseOnly(() => state.closeSoon()),
        onKeyDown: onContentKeyDown,
      },
    };
  };

  const linkProps = (linkOptions: NavigationMenuLinkOptions = {}): DOMProps => {
    const isActive = (): boolean => access(linkOptions.isActive) === true;
    return {
      [ITEM]: "",
      "data-active": () => (isActive() ? "true" : undefined),
      "aria-current": () => (isActive() ? "page" : undefined),
      onClick: (event: MouseEvent) => {
        const link = event.currentTarget as HTMLElement;
        const select = new CustomEvent("navigationMenu.linkSelect", {
          bubbles: true,
          cancelable: true,
        });
        if (linkOptions.onSelect !== undefined) {
          link.addEventListener(select.type, linkOptions.onSelect, { once: true });
        }
        link.dispatchEvent(select);
        // A modified click opens the link somewhere else and leaves this page,
        // and its menu, as they were.
        if (select.defaultPrevented || event.metaKey || event.ctrlKey) return;
        const content = openRecord()?.content() ?? null;
        if (content !== null && contains(content, link)) dismiss();
      },
    };
  };

  return {
    order,
    orientation,
    viewport,
    viewportRef: viewport.set,
    item,
    linkProps,
    rootProps: {
      "aria-label": () =>
        access(options["aria-label"]) ??
        (access(options["aria-labelledby"]) === undefined ? "Main" : undefined),
      "aria-labelledby": () => access(options["aria-labelledby"]),
      "data-orientation": orientation,
      onKeyDown: onRootKeyDown,
    },
    listProps: {
      "data-orientation": orientation,
      onKeyDown: onListKeyDown,
    },
    viewportProps: {
      hidden: () => !viewportGate.isPresent() || undefined,
      "data-state": () => (state.value() === null ? "closed" : "open"),
      "data-closed": () => (viewportGate.isExiting() ? "" : undefined),
      "data-orientation": orientation,
      onPointerEnter: () => state.keep(),
      onPointerLeave: mouseOnly(() => state.closeSoon()),
      // The measured box arrives as custom properties, so how the viewport
      // grows into it is the stylesheet's decision. Radix's names are written
      // beside these, for a class list copied from a Radix design system.
      style: () => {
        const box = viewportSize();
        if (box === null) return {};
        const width = `${String(box.width)}px`;
        const height = `${String(box.height)}px`;
        return {
          "--barq-viewport-width": width,
          "--barq-viewport-height": height,
          "--radix-navigation-menu-viewport-width": width,
          "--radix-navigation-menu-viewport-height": height,
          height: "var(--barq-viewport-height)",
        };
      },
    },
    indicatorProps: {
      "aria-hidden": "true",
      "data-state": () => (state.value() === null ? "hidden" : "visible"),
      "data-orientation": orientation,
      style: () => {
        const at = indicator();
        if (at === null) return {};
        const size = `${String(at.size)}px`;
        const offset = `${String(at.offset)}px`;
        return orientation() === "horizontal"
          ? { position: "absolute", left: "0px", width: size, transform: `translateX(${offset})` }
          : { position: "absolute", top: "0px", height: size, transform: `translateY(${offset})` };
      },
    },
  };
}
