/**
 * Keyboard and pointer behaviour over a collection.
 *
 * A listbox is one Tab stop, not one per option. Inside it the arrow keys
 * move a roving `tabindex`, typing jumps to a matching item, Home and End go
 * to the ends, Shift extends a range and Escape clears. None of that is
 * something the platform does for a `<div role="listbox">`, and all of it is
 * what the ARIA authoring practices require before a listbox is a listbox.
 *
 * Three details separate this from an arrow-key handler:
 *
 * - Selection follows focus, or it does not, depending on the selection
 *   behaviour: a file-manager list selects as you arrow through it, a checkbox
 *   list does not.
 * - Where focus lands when the collection is entered depends on which way the
 *   user tabbed into it, which `relatedTarget` answers.
 * - A press selects on pointer DOWN in a list and on pointer UP in a menu,
 *   because a menu closes on selection and selecting on down would swallow the
 *   press that opened it.
 */

import { type Accessor, effect, signal } from "@barqjs/core";
import { tryCleanup } from "@barqjs/primitives/utils";
import {
  activeElement,
  contains,
  focusWithoutScrolling,
  isScrollable,
  isTabbable,
  ownerDocument,
  scrollIntoView,
  scrollIntoViewport,
  targetElement,
} from "./dom.ts";
import type {
  Collection,
  Key,
  LayoutDelegate,
  Node,
  Rect,
  SelectionManager,
  Size,
} from "./collections.ts";
import { focusableWalker } from "./focus.ts";
import { collator, useLocale } from "./i18n.ts";
import { focusSafely } from "./interactions/focusable.ts";
import type { BaseEvent } from "./interactions/keyboard.ts";
import { getInteractionModality, type PointerType } from "./interactions/modality.ts";
import { longPress } from "./interactions/long-press.ts";
import { router } from "./interactions/open-link.ts";
import { press, type ElementRef, type PressEvent } from "./interactions/press.ts";
import { isAppleDevice, isMac } from "./platform.ts";
import { access, chain, id, mergeProps, type DOMProps, type MaybeAccessor } from "./utils.ts";

/**
 * The modifier that adds to a selection without extending it.
 *
 * Control with an arrow key has a system-wide meaning on macOS, so Alt takes
 * its place there; Alt with Space has one on Windows and Linux, so it cannot
 * be used everywhere.
 */
export function isNonContiguousSelectionModifier(event: {
  altKey?: boolean;
  ctrlKey?: boolean;
}): boolean {
  return isAppleDevice() ? event.altKey === true : event.ctrlKey === true;
}

/** The platform's "select several" modifier. */
export function isCtrlKeyPressed(event: { ctrlKey?: boolean; metaKey?: boolean }): boolean {
  return isMac() ? event.metaKey === true : event.ctrlKey === true;
}

/** The rendered element for a key, if it is rendered at all. */
export function itemElement(container: Element | null | undefined, key: Key): Element | null {
  if (container === null || container === undefined) return null;
  let selector = `[data-key="${CSS.escape(String(key))}"]`;
  const collection = (container as HTMLElement).dataset?.collection;
  // Scoped to this collection, so a nested one — a tag group inside a table
  // cell — does not answer for its parent.
  if (collection !== undefined)
    selector = `[data-collection="${CSS.escape(collection)}"]${selector}`;
  return container.querySelector(selector);
}

// ---------------------------------------------------------------------------
// Layout and keyboard delegates
// ---------------------------------------------------------------------------

export type { LayoutDelegate, Rect, Size } from "./collections.ts";

/** Geometry read from the rendered DOM. */
export class DOMLayoutDelegate implements LayoutDelegate {
  #ref: ElementRef;

  constructor(ref: ElementRef) {
    this.#ref = ref;
  }

  #container(): HTMLElement | null {
    return (access(this.#ref) as HTMLElement | null) ?? null;
  }

  getItemRect(key: Key): Rect | null {
    const container = this.#container();
    if (container === null) return null;
    const item = itemElement(container, key);
    if (item === null) return null;

    const bounds = container.getBoundingClientRect();
    const rect = item.getBoundingClientRect();
    return {
      x: rect.left - bounds.left - container.clientLeft + container.scrollLeft,
      y: rect.top - bounds.top - container.clientTop + container.scrollTop,
      width: rect.width,
      height: rect.height,
    };
  }

  getContentSize(): Size {
    const container = this.#container();
    return { width: container?.scrollWidth ?? 0, height: container?.scrollHeight ?? 0 };
  }

  getVisibleRect(): Rect {
    const container = this.#container();
    return {
      x: container?.scrollLeft ?? 0,
      y: container?.scrollTop ?? 0,
      width: container?.clientWidth ?? 0,
      height: container?.clientHeight ?? 0,
    };
  }
}

/** Which key each navigation lands on. */
export interface KeyboardDelegate {
  getKeyBelow?(key: Key): Key | null;
  getKeyAbove?(key: Key): Key | null;
  getKeyLeftOf?(key: Key): Key | null;
  getKeyRightOf?(key: Key): Key | null;
  getKeyPageBelow?(key: Key): Key | null;
  getKeyPageAbove?(key: Key): Key | null;
  getFirstKey?(fromKey?: Key | null, global?: boolean): Key | null;
  getLastKey?(fromKey?: Key | null, global?: boolean): Key | null;
  getKeyForSearch?(search: string, fromKey?: Key | null): Key | null;
}

export type Orientation = "horizontal" | "vertical";
export type Direction = "ltr" | "rtl";

export interface ListKeyboardDelegateOptions {
  collection: Accessor<Collection<unknown>>;
  ref: ElementRef;
  disabledKeys?: Accessor<Set<Key>>;
  disabledBehavior?: Accessor<"selection" | "all">;
  collator?: Accessor<Intl.Collator>;
  layout?: "stack" | "grid";
  orientation?: MaybeAccessor<Orientation | undefined>;
  direction?: MaybeAccessor<Direction | undefined>;
  layoutDelegate?: LayoutDelegate;
}

/**
 * Navigation for a list or a grid of items.
 *
 * Disabled items are skipped rather than focused-and-ignored, so holding Down
 * through a list of ten disabled rows takes one keypress, not ten.
 */
export class ListKeyboardDelegate implements KeyboardDelegate {
  #options: ListKeyboardDelegateOptions;
  #layout: LayoutDelegate;

  constructor(options: ListKeyboardDelegateOptions) {
    this.#options = options;
    this.#layout = options.layoutDelegate ?? new DOMLayoutDelegate(options.ref);
  }

  get #collection(): Collection<unknown> {
    return this.#options.collection();
  }

  get #orientation(): Orientation {
    return access(this.#options.orientation) ?? "vertical";
  }

  get #direction(): Direction {
    return access(this.#options.direction) ?? "ltr";
  }

  #isDisabled(item: Node<unknown>): boolean {
    const behavior = this.#options.disabledBehavior?.() ?? "all";
    const disabled = this.#options.disabledKeys?.() ?? new Set<Key>();
    return (
      behavior === "all" &&
      (item.props?.isDisabled === true || disabled.has(item.key)) &&
      item.props?.disabledBehavior !== "selection"
    );
  }

  #nextEnabled(key: Key | null, step: (key: Key) => Key | null): Key | null {
    let at = key;
    while (at !== null) {
      const item = this.#collection.getItem(at);
      if (item?.type === "item" && !this.#isDisabled(item)) return at;
      at = step(at);
    }
    return null;
  }

  getNextKey(key: Key): Key | null {
    return this.#nextEnabled(this.#collection.getKeyAfter(key), (k) =>
      this.#collection.getKeyAfter(k),
    );
  }

  getPreviousKey(key: Key): Key | null {
    return this.#nextEnabled(this.#collection.getKeyBefore(key), (k) =>
      this.#collection.getKeyBefore(k),
    );
  }

  #sameRow(previous: Rect, current: Rect): boolean {
    return previous.y === current.y || previous.x !== current.x;
  }

  #sameColumn(previous: Rect, current: Rect): boolean {
    return previous.x === current.x || previous.y !== current.y;
  }

  /** Step until the geometry says we have left the row or column. */
  #findKey(
    key: Key,
    step: (key: Key) => Key | null,
    skip: (previous: Rect, current: Rect) => boolean,
  ): Key | null {
    let at: Key | null = key;
    let rect = this.#layout.getItemRect(at);
    if (rect === null) return null;

    const from = rect;
    do {
      at = step(at);
      if (at === null) break;
      rect = this.#layout.getItemRect(at);
    } while (rect !== null && skip(from, rect) && at !== null);

    return at;
  }

  getKeyBelow(key: Key): Key | null {
    if (this.#options.layout === "grid" && this.#orientation === "vertical") {
      return this.#findKey(
        key,
        (k) => this.getNextKey(k),
        (a, b) => this.#sameRow(a, b),
      );
    }
    return this.getNextKey(key);
  }

  getKeyAbove(key: Key): Key | null {
    if (this.#options.layout === "grid" && this.#orientation === "vertical") {
      return this.#findKey(
        key,
        (k) => this.getPreviousKey(k),
        (a, b) => this.#sameRow(a, b),
      );
    }
    return this.getPreviousKey(key);
  }

  #nextColumn(key: Key, reversed: boolean): Key | null {
    return reversed ? this.getPreviousKey(key) : this.getNextKey(key);
  }

  getKeyRightOf(key: Key): Key | null {
    const rtl = this.#direction === "rtl";
    if (this.#options.layout === "grid") {
      if (this.#orientation === "vertical") return this.#nextColumn(key, rtl);
      return this.#findKey(
        key,
        (k) => this.#nextColumn(k, rtl),
        (a, b) => this.#sameColumn(a, b),
      );
    }
    if (this.#orientation === "horizontal") return this.#nextColumn(key, rtl);
    return null;
  }

  getKeyLeftOf(key: Key): Key | null {
    const ltr = this.#direction === "ltr";
    if (this.#options.layout === "grid") {
      if (this.#orientation === "vertical") return this.#nextColumn(key, ltr);
      return this.#findKey(
        key,
        (k) => this.#nextColumn(k, ltr),
        (a, b) => this.#sameColumn(a, b),
      );
    }
    if (this.#orientation === "horizontal") return this.#nextColumn(key, ltr);
    return null;
  }

  getFirstKey(): Key | null {
    return this.#nextEnabled(this.#collection.getFirstKey(), (k) =>
      this.#collection.getKeyAfter(k),
    );
  }

  getLastKey(): Key | null {
    return this.#nextEnabled(this.#collection.getLastKey(), (k) =>
      this.#collection.getKeyBefore(k),
    );
  }

  getKeyPageAbove(key: Key): Key | null {
    const container = access(this.#options.ref) as HTMLElement | null;
    let rect = this.#layout.getItemRect(key);
    if (rect === null) return null;

    // Nothing scrolls, so a page is the whole list.
    if (container !== null && !isScrollable(container)) return this.getFirstKey();

    const visible = this.#layout.getVisibleRect();
    let at: Key | null = key;

    if (this.#orientation === "horizontal") {
      const pageX = Math.max(0, rect.x + rect.width - visible.width);
      while (rect !== null && rect.x > pageX && at !== null) {
        at = this.getKeyAbove(at);
        rect = at === null ? null : this.#layout.getItemRect(at);
      }
    } else {
      const pageY = Math.max(0, rect.y + rect.height - visible.height);
      while (rect !== null && rect.y > pageY && at !== null) {
        at = this.getKeyAbove(at);
        rect = at === null ? null : this.#layout.getItemRect(at);
      }
    }

    return at ?? this.getFirstKey();
  }

  getKeyPageBelow(key: Key): Key | null {
    const container = access(this.#options.ref) as HTMLElement | null;
    let rect = this.#layout.getItemRect(key);
    if (rect === null) return null;

    if (container !== null && !isScrollable(container)) return this.getLastKey();

    const visible = this.#layout.getVisibleRect();
    const content = this.#layout.getContentSize();
    let at: Key | null = key;

    if (this.#orientation === "horizontal") {
      const pageX = Math.min(content.width, rect.x - rect.width + visible.width);
      while (rect !== null && rect.x < pageX && at !== null) {
        at = this.getKeyBelow(at);
        rect = at === null ? null : this.#layout.getItemRect(at);
      }
    } else {
      const pageY = Math.min(content.height, rect.y - rect.height + visible.height);
      while (rect !== null && rect.y < pageY && at !== null) {
        at = this.getKeyBelow(at);
        rect = at === null ? null : this.#layout.getItemRect(at);
      }
    }

    return at ?? this.getLastKey();
  }

  getKeyForSearch(search: string, fromKey?: Key | null): Key | null {
    const compare = this.#options.collator?.();
    if (compare === undefined) return null;

    let key = fromKey ?? this.getFirstKey();
    while (key !== null) {
      const item = this.#collection.getItem(key);
      if (item === null) return null;
      const prefix = item.textValue.slice(0, search.length);
      if (item.textValue !== "" && compare.compare(prefix, search) === 0) return key;
      key = this.getNextKey(key);
    }

    return null;
  }
}

// ---------------------------------------------------------------------------
// Typeahead
// ---------------------------------------------------------------------------

const TYPEAHEAD_TIMEOUT = 1000;

export interface TypeSelectOptions {
  keyboardDelegate: KeyboardDelegate;
  selectionManager: Accessor<SelectionManager>;
  onTypeSelect?: (key: Key) => void;
}

export interface TypeSelectResult {
  typeSelectProps: DOMProps;
}

/**
 * Jump to an item by typing its first letters.
 *
 * Space is the awkward case: it is a selection key when nothing has been
 * typed, and part of the search once something has. The two are told apart by
 * whether the buffer is empty, which is why the Space branch has to run before
 * the selection handler sees the key.
 */
export function typeSelect(options: TypeSelectOptions): TypeSelectResult {
  const state = { search: "", timeout: undefined as ReturnType<typeof setTimeout> | undefined };

  tryCleanup(() => clearTimeout(state.timeout));

  const restartTimer = (): void => {
    clearTimeout(state.timeout);
    state.timeout = setTimeout(() => {
      state.search = "";
    }, TYPEAHEAD_TIMEOUT);
  };

  const jump = (): boolean => {
    const manager = options.selectionManager();
    // After the focused item first, so repeated letters cycle forwards rather
    // than always landing on the first match.
    let key = options.keyboardDelegate.getKeyForSearch?.(state.search, manager.focusedKey) ?? null;
    if (key === null) key = options.keyboardDelegate.getKeyForSearch?.(state.search) ?? null;
    if (key === null) return false;

    manager.setFocusedKey(key);
    options.onTypeSelect?.(key);
    return true;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const character = characterFor(event.key);
    const currentTarget = event.currentTarget as Element | null;
    if (
      character === "" ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      currentTarget === null ||
      !contains(currentTarget, targetElement(event)) ||
      (state.search.length === 0 && character === " ")
    ) {
      return;
    }

    state.search += character;

    if (jump()) {
      event.preventDefault();
      event.stopPropagation();
    } else {
      state.search = "";
      clearTimeout(state.timeout);
      state.timeout = undefined;
      return;
    }

    restartTimer();
  };

  /**
   * A Space typed MID-SEARCH is a search character, not "select the focused
   * item", and the two are told apart only by whether the buffer is empty.
   *
   * It is claimed in the CAPTURE phase, before the selection handler in the
   * bubble phase sees it.
   */
  const onKeyDownCapture = (event: KeyboardEvent): void => {
    if (state.search.length === 0 || event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    state.search += " ";
    jump();
    restartTimer();
  };

  return { typeSelectProps: { onKeyDown, onKeyDownCapture } };
}

function characterFor(key: string): string {
  // A single character is what was typed. A longer name that starts with a
  // letter is a named key ("Enter", "ArrowDown"); one that does not is a
  // Unicode character with a multi-code-point name.
  if (key.length === 1 || !/^[A-Z]/i.test(key)) return key;
  return "";
}

// ---------------------------------------------------------------------------
// One item
// ---------------------------------------------------------------------------

export type LinkBehavior = "action" | "selection" | "override" | "none";

export interface SelectableItemOptions {
  selectionManager: Accessor<SelectionManager>;
  key: Key;
  ref: ElementRef;
  id?: MaybeAccessor<string | undefined>;
  /**
   * Select on pointer up rather than down.
   *
   * A menu closes when an item is chosen, so selecting on pointer down would
   * consume the very press that opened it.
   */
  shouldSelectOnPressUp?: MaybeAccessor<boolean | undefined>;
  /** Allow the press to start on one element and finish on another. */
  allowsDifferentPressOrigin?: MaybeAccessor<boolean | undefined>;
  /** Track focus with `aria-activedescendant` rather than moving it. */
  shouldUseVirtualFocus?: MaybeAccessor<boolean | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  onAction?: () => void;
  /**
   * Whether there is an action to perform. @default `onAction !== undefined`
   *
   * Whether an item ACTS changes what a press does: an action is primary while
   * nothing is selected, so the first press performs it instead of selecting.
   * A caller whose own `onAction` is a prop therefore cannot decide by passing
   * or withholding the handler, because the prop is a Cell and the decision
   * would be frozen at construction. It says so here instead, and passes
   * `onAction` unconditionally.
   */
  hasAction?: MaybeAccessor<boolean | undefined>;
  /** @default "action" */
  linkBehavior?: MaybeAccessor<LinkBehavior | undefined>;
  /**
   * Press handling on top of the item's own, chained after it.
   *
   * A menu closes when an item is chosen, and only the press knows which
   * interaction chose it: Enter closes a multi-select menu where a click does
   * not. Reimplementing the press to learn that would mean two press hooks on
   * one element, which is two roving-focus effects and two pressed states.
   */
  onPressStart?: (event: PressEvent) => void;
  onPressUp?: (event: PressEvent) => void;
  onPressEnd?: (event: PressEvent) => void;
  onPress?: (event: PressEvent) => void;
  onPressChange?: (isPressed: boolean) => void;
}

export interface SelectableItemResult {
  itemProps: DOMProps;
  isPressed: Accessor<boolean>;
  isSelected: Accessor<boolean>;
  isFocused: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
  /** Whether the item responds to selection at all. */
  allowsSelection: Accessor<boolean>;
  /** Whether pressing it does something other than select it. */
  hasAction: Accessor<boolean>;
}

function isActionKey(key: string | undefined): boolean {
  return key === "Enter";
}

function isSelectionKey(key: string | undefined): boolean {
  return key === " ";
}

/**
 * One item in a selectable collection.
 *
 * When and what a press does is decided by three things at once: the selection
 * behaviour, whether the item has an action, and the pointer type. With
 * checkbox selection an action is primary and happens on a single click; with
 * highlight selection a click selects and a double click acts; on touch a tap
 * acts and a long press enters selection mode.
 */
export function selectableItem(options: SelectableItemOptions): SelectableItemResult {
  const itemId = id(options.id);
  const navigate = router();

  const manager = (): SelectionManager => options.selectionManager();
  const linkBehavior = (): LinkBehavior => access(options.linkBehavior) ?? "action";
  const virtualFocus = (): boolean => access(options.shouldUseVirtualFocus) === true;

  const isDisabled = (): boolean =>
    access(options.isDisabled) === true || manager().isDisabled(options.key);

  const isLinkOverride = (): boolean =>
    manager().isLink(options.key) && linkBehavior() === "override";

  const hasLinkAction = (): boolean =>
    manager().isLink(options.key) && linkBehavior() !== "selection" && linkBehavior() !== "none";

  const allowsSelection = (): boolean =>
    !isDisabled() && manager().canSelectItem(options.key) && !isLinkOverride();

  const declaresAction = (): boolean => access(options.hasAction) ?? options.onAction !== undefined;

  const allowsActions = (): boolean => (declaresAction() || hasLinkAction()) && !isDisabled();

  const hasPrimaryAction = (): boolean => {
    if (!allowsActions()) return false;
    return manager().selectionBehavior === "replace"
      ? !allowsSelection()
      : !allowsSelection() || manager().isEmpty;
  };

  const hasSecondaryAction = (): boolean =>
    allowsActions() && allowsSelection() && manager().selectionBehavior === "replace";

  const hasAction = (): boolean => hasPrimaryAction() || hasSecondaryAction();

  const select = (event: PressEvent | { pointerType?: string; shiftKey?: boolean }): void => {
    const active = manager();
    const pointerType = (event as PressEvent).pointerType;

    if (pointerType === "keyboard" && isNonContiguousSelectionModifier(event as PressEvent)) {
      active.toggleSelection(options.key);
      return;
    }

    if (active.selectionMode === "none") return;

    if (active.isLink(options.key)) {
      const behavior = linkBehavior();
      const element = access(options.ref) as Element | null;
      if (behavior === "selection" && element !== null) {
        const props = active.getItemProps(options.key);
        navigate.open(element, event, props?.href as string);
        // The selection is put back as it was, so a select or combobox that
        // closes on change does not also change.
        active.setSelectedKeys(active.selectedKeys);
        return;
      }
      if (behavior === "override" || behavior === "none") return;
    }

    if (active.selectionMode === "single") {
      if (active.isSelected(options.key) && !active.disallowEmptySelection) {
        active.toggleSelection(options.key);
      } else {
        active.replaceSelection(options.key);
      }
      return;
    }

    if ((event as PressEvent).shiftKey) {
      active.extendSelection(options.key);
      return;
    }

    if (
      active.selectionBehavior === "toggle" ||
      isCtrlKeyPressed(event as PressEvent) ||
      pointerType === "touch" ||
      pointerType === "virtual"
    ) {
      active.toggleSelection(options.key);
      return;
    }

    active.replaceSelection(options.key);
  };

  const performAction = (event: PressEvent): void => {
    const element = access(options.ref) as Element | null;
    if (declaresAction() && options.onAction !== undefined) {
      options.onAction();
      element?.dispatchEvent(new CustomEvent("barq-item-action", { bubbles: true }));
    }
    if (hasLinkAction() && element !== null) {
      const props = manager().getItemProps(options.key);
      navigate.open(element, event, props?.href as string);
    }
  };

  // Focus the item when it becomes the focused key.
  effect(() => {
    const active = manager();
    if (active.focusedKey !== options.key || !active.isFocused || virtualFocus()) return;
    const element = access(options.ref) as HTMLElement | null;
    if (element !== null && activeElement(ownerDocument(element)) !== element) {
      focusSafely(element);
    }
  });

  // A disabled item cannot hold the roving focus.
  effect(() => {
    if (isDisabled() && manager().focusedKey === options.key) manager().setFocusedKey(null);
  });

  let modality: PointerType | null = null;
  let longPressWasEnabled = false;
  let hadPrimaryActionOnPressStart = false;

  const longPressEnabled = (): boolean => hasAction() && allowsSelection();

  const pressOptions: Parameters<typeof press>[0] = {
    ref: options.ref,
    preventFocusOnPress: virtualFocus,
  };

  const onPressStartCommon = (event: PressEvent): void => {
    modality = event.pointerType;
    longPressWasEnabled = longPressEnabled();
    hadPrimaryActionOnPressStart = hasPrimaryAction();
    if (virtualFocus() && event.pointerType !== "touch") {
      manager().setFocused(true);
      manager().setFocusedKey(options.key);
    }
  };

  if (access(options.shouldSelectOnPressUp) === true) {
    pressOptions.onPressStart = (event) => {
      onPressStartCommon(event);
      // Keyboard selection still happens on key DOWN, as the platform does.
      if (event.pointerType === "keyboard" && (!hasAction() || isSelectionKey(event.key))) {
        select(event);
      }
    };

    if (access(options.allowsDifferentPressOrigin) !== true) {
      pressOptions.onPress = (event) => {
        if (virtualFocus() && event.pointerType === "touch") {
          manager().setFocused(true);
          manager().setFocusedKey(options.key);
        }
        if (hasPrimaryAction() || (hasSecondaryAction() && event.pointerType !== "mouse")) {
          if (event.pointerType === "keyboard" && !isActionKey(event.key)) return;
          performAction(event);
        } else if (event.pointerType !== "keyboard" && allowsSelection()) {
          select(event);
        }
      };
    } else {
      pressOptions.onPressUp = (event) => {
        if (hasPrimaryAction()) return;
        if (event.pointerType === "mouse" && allowsSelection()) select(event);
      };
      pressOptions.onPress = (event) => {
        if (hasPrimaryAction()) {
          performAction(event);
          return;
        }
        if (
          event.pointerType !== "keyboard" &&
          event.pointerType !== "mouse" &&
          allowsSelection()
        ) {
          select(event);
        }
      };
    }
  } else {
    pressOptions.onPressStart = (event) => {
      onPressStartCommon(event);
      // A mouse selects on the way down unless an action will fire on the way
      // up. Space selects on key down; Enter acts on key up.
      if (
        allowsSelection() &&
        ((event.pointerType === "mouse" && !hasPrimaryAction()) ||
          (event.pointerType === "keyboard" && (!allowsActions() || isSelectionKey(event.key))))
      ) {
        select(event);
      }
    };

    pressOptions.onPress = (event) => {
      if (virtualFocus() && event.pointerType === "touch") {
        manager().setFocused(true);
        manager().setFocusedKey(options.key);
      }
      if (
        event.pointerType === "touch" ||
        event.pointerType === "pen" ||
        event.pointerType === "virtual" ||
        (event.pointerType === "keyboard" && hasAction() && isActionKey(event.key)) ||
        (event.pointerType === "mouse" && hadPrimaryActionOnPressStart)
      ) {
        if (hasAction()) performAction(event);
        else if (allowsSelection()) select(event);
      }
    };
  }

  for (const name of ["onPressStart", "onPressUp", "onPressEnd", "onPress"] as const) {
    const own = pressOptions[name];
    const given = options[name];
    if (given === undefined) continue;
    pressOptions[name] = own === undefined ? given : chain(own, given);
  }
  pressOptions.onPressChange = options.onPressChange;

  const { pressProps, isPressed } = press(pressOptions);

  // Long pressing with touch under `replace` selection switches to `toggle`,
  // which is how a touch user enters multi-select without a modifier key.
  const { longPressProps } = longPress({
    isDisabled: () => !longPressEnabled(),
    onLongPress: (event) => {
      if (event.pointerType !== "touch") return;
      select(event);
      manager().setSelectionBehavior("toggle");
    },
  });

  const isFocused = (): boolean => manager().isFocused && manager().focusedKey === options.key;

  const focusProps: DOMProps = {
    tabIndex: () => {
      // Under virtual focus nothing inside is in the Tab order at all: iOS
      // VoiceOver moves real focus to an item that has a tabIndex, which is
      // exactly what virtual focus exists to avoid.
      if (virtualFocus() || isDisabled()) return undefined;
      // A roving tabindex: exactly one item is in the Tab order.
      return manager().focusedKey === options.key ? 0 : -1;
    },
    onFocus: (event: FocusEvent) => {
      if (virtualFocus() || isDisabled()) return;
      if (targetElement(event) === access(options.ref)) manager().setFocusedKey(options.key);
    },
    onMouseDown: (event: MouseEvent) => {
      // Under virtual focus, focus must stay where it is. On a disabled item,
      // letting focus fall to the body would tear down the roving tabindex.
      if (virtualFocus() || isDisabled()) event.preventDefault();
    },
  };

  const onDoubleClick = (event: MouseEvent): void => {
    if (!hasSecondaryAction() || modality !== "mouse") return;
    event.stopPropagation();
    event.preventDefault();
    performAction(event as unknown as PressEvent);
  };

  // A long press that selects must not also start a native drag.
  const onDragStartCapture = (event: DragEvent): void => {
    if (modality === "touch" && longPressWasEnabled) event.preventDefault();
  };

  // A link's navigation is ours to time, so the browser's is cancelled.
  const onClick = (event: MouseEvent): void => {
    if (linkBehavior() === "none" || !manager().isLink(options.key)) return;
    event.preventDefault();
  };

  const itemProps = mergeProps(
    focusProps,
    { "data-key": String(options.key), id: itemId },
    pressProps,
    longPressProps,
    { onDoubleClick, onDragStartCapture, onClick },
  );

  /**
   * Whether a press on `target` belongs to something inside the item rather
   * than to the item itself.
   *
   * A button in a row is such a thing. A CELL is not: `focusPlace` gives
   * whichever cell holds the roving focus `tabindex="0"`, so after the first
   * press on a cell `isTabbable` says yes and every press after it was
   * swallowed before it could reach the row. What tells the two apart is
   * `data-key`, which the collection writes on its own surfaces and nothing
   * else has.
   *
   * A NESTED collection — a tag group inside a table cell — writes
   * `data-collection` on its container, and its items do carry `data-key`. The
   * walk finds that container first, which is why it comes before the
   * `data-key` test.
   */
  const isChildInteraction = (target: Element, element: Element | null): boolean => {
    let at: Element | null = target;
    while (at !== null && at !== element) {
      if (at.hasAttribute("data-collection")) return true;
      at = at.parentElement;
    }
    return isTabbable(target) && !target.hasAttribute("data-key");
  };

  const basePointerDown = itemProps.onPointerDown as ((event: PointerEvent) => void) | undefined;
  itemProps.onPointerDown = (event: PointerEvent): void => {
    const target = targetElement(event);
    const element = access(options.ref) as Element | null;
    if (target !== null && target !== element && isChildInteraction(target, element)) {
      event.stopPropagation();
      return;
    }
    basePointerDown?.(event);
  };

  return {
    itemProps,
    isPressed,
    isSelected: () => manager().isSelected(options.key),
    isFocused,
    isDisabled,
    allowsSelection,
    hasAction,
  };
}

// ---------------------------------------------------------------------------
// The collection
// ---------------------------------------------------------------------------

export interface SelectableCollectionOptions {
  selectionManager: Accessor<SelectionManager>;
  keyboardDelegate: KeyboardDelegate;
  ref: ElementRef;
  /** Focus the collection, or an end of it, on mount. */
  autoFocus?: MaybeAccessor<boolean | "first" | "last" | undefined>;
  /** Wrap around at the ends. @default false */
  shouldFocusWrap?: MaybeAccessor<boolean | undefined>;
  disallowEmptySelection?: MaybeAccessor<boolean | undefined>;
  /** @default false */
  disallowSelectAll?: MaybeAccessor<boolean | undefined>;
  /** @default "clearSelection" */
  escapeKeyBehavior?: MaybeAccessor<"clearSelection" | "none" | undefined>;
  /** Select as focus moves. Defaults to the selection behaviour. */
  selectOnFocus?: MaybeAccessor<boolean | undefined>;
  /** @default false */
  disallowTypeAhead?: MaybeAccessor<boolean | undefined>;
  shouldUseVirtualFocus?: MaybeAccessor<boolean | undefined>;
  /** Let Tab move within the collection rather than out of it. */
  allowsTabNavigation?: MaybeAccessor<boolean | undefined>;
  /** The scrollable element, when it is not the collection itself. */
  scrollRef?: ElementRef;
  linkBehavior?: MaybeAccessor<LinkBehavior | undefined>;
}

export interface SelectableCollectionResult {
  collectionProps: DOMProps;
}

/**
 * Keyboard handling for the element that owns a collection.
 *
 * The collection is one Tab stop: `tabIndex` is 0 while nothing inside is
 * focused and -1 once something is, so Tab enters it once and then leaves.
 */
export function selectableCollection(
  options: SelectableCollectionOptions,
): SelectableCollectionResult {
  const locale = useLocale();
  const navigate = router();
  const delegate = options.keyboardDelegate;
  const collectionId = id();

  const manager = (): SelectionManager => options.selectionManager();
  const virtualFocus = (): boolean => access(options.shouldUseVirtualFocus) === true;
  const wraps = (): boolean => access(options.shouldFocusWrap) === true;
  const scrollElement = (): HTMLElement | null =>
    (access(options.scrollRef ?? options.ref) as HTMLElement | null) ?? null;

  const selectOnFocus = (): boolean => {
    const declared = access(options.selectOnFocus);
    return declared ?? manager().selectionBehavior === "replace";
  };

  const navigateToKey = (
    event: KeyboardEvent,
    key: Key | null | undefined,
    childFocus?: "first" | "last",
  ): void => {
    if (key === null || key === undefined) return;
    const active = manager();

    if (
      active.isLink(key) &&
      access(options.linkBehavior) === "selection" &&
      selectOnFocus() &&
      !isNonContiguousSelectionModifier(event)
    ) {
      active.setFocusedKey(key, childFocus);
      const element = itemElement(access(options.ref), key);
      if (element !== null) {
        navigate.open(element, event, active.getItemProps(key)?.href as string);
      }
      return;
    }

    active.setFocusedKey(key, childFocus);

    if (active.isLink(key) && access(options.linkBehavior) === "override") return;

    if (event.shiftKey && active.selectionMode === "multiple") active.extendSelection(key);
    else if (selectOnFocus() && !isNonContiguousSelectionModifier(event)) {
      active.replaceSelection(key);
    }
  };

  const onKeyDown = (event: BaseEvent<KeyboardEvent>): void => {
    const currentTarget = event.currentTarget as Element | null;
    if (currentTarget === null || !contains(currentTarget, targetElement(event))) {
      event.continuePropagation();
      return;
    }

    const active = manager();
    const focused = active.focusedKey;
    const rtl = locale().direction === "rtl";

    switch (event.key) {
      case "ArrowDown": {
        if (delegate.getKeyBelow === undefined) break;
        let next =
          focused !== null ? delegate.getKeyBelow(focused) : (delegate.getFirstKey?.() ?? null);
        if (next === null && wraps()) next = delegate.getFirstKey?.() ?? null;
        if (next === null) break;
        event.preventDefault();
        navigateToKey(event, next);
        return;
      }

      case "ArrowUp": {
        if (delegate.getKeyAbove === undefined) break;
        let next =
          focused !== null ? delegate.getKeyAbove(focused) : (delegate.getLastKey?.() ?? null);
        if (next === null && wraps()) next = delegate.getLastKey?.() ?? null;
        if (next === null) break;
        event.preventDefault();
        navigateToKey(event, next);
        return;
      }

      case "ArrowLeft": {
        if (delegate.getKeyLeftOf === undefined) break;
        let next =
          focused !== null ? delegate.getKeyLeftOf(focused) : (delegate.getFirstKey?.() ?? null);
        if (next === null && wraps()) {
          next = (rtl ? delegate.getFirstKey?.() : delegate.getLastKey?.()) ?? null;
        }
        if (next === null) break;
        event.preventDefault();
        navigateToKey(event, next, rtl ? "first" : "last");
        return;
      }

      case "ArrowRight": {
        if (delegate.getKeyRightOf === undefined) break;
        let next =
          focused !== null ? delegate.getKeyRightOf(focused) : (delegate.getFirstKey?.() ?? null);
        if (next === null && wraps()) {
          next = (rtl ? delegate.getLastKey?.() : delegate.getFirstKey?.()) ?? null;
        }
        if (next === null) break;
        event.preventDefault();
        navigateToKey(event, next, rtl ? "last" : "first");
        return;
      }

      case "Home": {
        if (delegate.getFirstKey === undefined) break;
        if (focused === null && event.shiftKey) break;
        const first = delegate.getFirstKey(focused, isCtrlKeyPressed(event));
        if (first === null) break;
        event.preventDefault();
        active.setFocusedKey(first);
        if (isCtrlKeyPressed(event) && event.shiftKey && active.selectionMode === "multiple") {
          active.extendSelection(first);
        } else if (selectOnFocus()) {
          active.replaceSelection(first);
        }
        return;
      }

      case "End": {
        if (delegate.getLastKey === undefined) break;
        if (focused === null && event.shiftKey) break;
        const last = delegate.getLastKey(focused, isCtrlKeyPressed(event));
        if (last === null) break;
        event.preventDefault();
        active.setFocusedKey(last);
        if (isCtrlKeyPressed(event) && event.shiftKey && active.selectionMode === "multiple") {
          active.extendSelection(last);
        } else if (selectOnFocus()) {
          active.replaceSelection(last);
        }
        return;
      }

      case "PageDown": {
        if (delegate.getKeyPageBelow === undefined || focused === null) break;
        const next = delegate.getKeyPageBelow(focused);
        if (next === null) break;
        event.preventDefault();
        navigateToKey(event, next);
        return;
      }

      case "PageUp": {
        if (delegate.getKeyPageAbove === undefined || focused === null) break;
        const next = delegate.getKeyPageAbove(focused);
        if (next === null) break;
        event.preventDefault();
        navigateToKey(event, next);
        return;
      }

      case "a": {
        if (!isCtrlKeyPressed(event)) break;
        if (active.selectionMode !== "multiple" || access(options.disallowSelectAll) === true)
          break;
        event.preventDefault();
        active.selectAll();
        return;
      }

      case "Escape": {
        if ((access(options.escapeKeyBehavior) ?? "clearSelection") !== "clearSelection") break;
        if (access(options.disallowEmptySelection) === true) break;
        if (active.selectedKeys.size === 0) break;
        event.preventDefault();
        active.clearSelection();
        return;
      }

      case "Tab": {
        if (access(options.allowsTabNavigation) === true) break;
        const container = access(options.ref) as HTMLElement | null;
        if (container === null) break;

        if (event.shiftKey) {
          // Backwards out of the collection: focus the container so the
          // browser's own Shift+Tab continues from there.
          container.focus();
          break;
        }

        // Forwards out of the collection: move to the LAST tabbable element
        // inside it, so the browser continues past the whole collection rather
        // than into it.
        const walker = focusableWalker(container, { tabbable: true });
        const next = walker.last() as HTMLElement | null;
        const active2 = activeElement(ownerDocument(container));
        if (
          next !== null &&
          (!contains(next, active2) || (active2 !== null && !isTabbable(active2)))
        ) {
          focusWithoutScrolling(next);
        }
        break;
      }

      default:
        break;
    }

    // Everything not handled keeps bubbling: a dialog above still sees Escape.
    event.continuePropagation();
  };

  // The scroll position is restored when focus returns, so tabbing away and
  // back does not jump the list to the focused item.
  const scrollPosition = { top: 0, left: 0 };
  effect(() => {
    const element = scrollElement();
    if (element === null) return undefined;
    const onScroll = (): void => {
      scrollPosition.top = element.scrollTop;
      scrollPosition.left = element.scrollLeft;
    };
    element.addEventListener("scroll", onScroll);
    return () => element.removeEventListener("scroll", onScroll);
  });

  const onFocus = (event: FocusEvent): void => {
    const active = manager();
    const currentTarget = event.currentTarget as Element | null;

    if (active.isFocused) {
      if (currentTarget !== null && !contains(currentTarget, targetElement(event))) {
        active.setFocused(false);
      }
      return;
    }

    if (currentTarget === null || !contains(currentTarget, targetElement(event))) return;

    const how = getInteractionModality();
    active.setFocused(true);

    const focusKey = (key: Key | null | undefined): void => {
      if (key === null || key === undefined) return;
      active.setFocusedKey(key);
      if (selectOnFocus() && !active.isSelected(key)) active.replaceSelection(key);
    };

    if (active.focusedKey === null) {
      // Which end to enter at: `relatedTarget` is where focus came FROM, so a
      // Shift+Tab from below enters at the last item.
      const related = event.relatedTarget as Element | null;
      const fromAfter =
        related !== null &&
        (currentTarget.compareDocumentPosition(related) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      focusKey(
        fromAfter
          ? (active.lastSelectedKey ?? delegate.getLastKey?.())
          : (active.firstSelectedKey ?? delegate.getFirstKey?.()),
      );
    } else {
      const element = scrollElement();
      if (element !== null) {
        element.scrollTop = scrollPosition.top;
        element.scrollLeft = scrollPosition.left;
      }
    }

    const focused = active.focusedKey;
    const container = access(options.ref) as HTMLElement | null;
    if (focused !== null && container !== null) {
      const element = itemElement(container, focused);
      if (element instanceof HTMLElement) {
        if (!contains(element, activeElement(ownerDocument(element))) && !virtualFocus()) {
          focusWithoutScrolling(element);
        }
        if (how === "keyboard") scrollIntoViewport(element, { containingElement: container });
      }
    }
  };

  const onBlur = (event: FocusEvent): void => {
    const currentTarget = event.currentTarget as Element | null;
    // Moving between two items inside the collection is not leaving it.
    if (currentTarget !== null && !contains(currentTarget, event.relatedTarget as Element | null)) {
      manager().setFocused(false);
    }
  };

  // Bring the focused item into view when it changes by keyboard.
  let lastFocusedKey: Key | null = manager().focusedKey;
  effect(() => {
    const active = manager();
    const focused = active.focusedKey;
    const container = access(options.ref) as HTMLElement | null;
    const scroller = scrollElement();

    if (active.isFocused && focused !== null && focused !== lastFocusedKey && scroller !== null) {
      const element = itemElement(container, focused);
      if (element instanceof HTMLElement && getInteractionModality() === "keyboard") {
        scrollIntoView(scroller, element);
        scrollIntoViewport(element, { containingElement: container });
      }
    }

    // The focused item was removed: the collection itself takes focus, or the
    // user is left with focus on the body and no way back in.
    if (!virtualFocus() && active.isFocused && focused === null && lastFocusedKey !== null) {
      if (container !== null) focusSafely(container);
    }

    lastFocusedKey = focused;
  });

  const autoFocused = signal(
    access(options.autoFocus) !== undefined && access(options.autoFocus) !== false,
  );
  effect(() => {
    if (!autoFocused()) return;
    const active = manager();
    const where = access(options.autoFocus);

    let key: Key | null = null;
    if (where === "first") key = delegate.getFirstKey?.() ?? null;
    if (where === "last") key = delegate.getLastKey?.() ?? null;

    // A selected item wins over an end: re-opening a select lands on what is
    // already chosen.
    for (const selected of active.selectedKeys) {
      if (active.canSelectItem(selected)) {
        key = selected;
        break;
      }
    }

    active.setFocused(true);
    active.setFocusedKey(key);

    if (
      key !== null &&
      selectOnFocus() &&
      active.selectedKeys.size === 0 &&
      active.canSelectItem(key)
    ) {
      active.replaceSelection(key);
    }

    if (key === null && !virtualFocus()) {
      const container = access(options.ref) as HTMLElement | null;
      if (container !== null) focusSafely(container);
    }

    if (active.collection.size > 0) autoFocused.set(false);
  });

  // A virtualised collection reuses DOM nodes, so the element a focus scope
  // wants to restore to may now be a different item.
  effect(() => {
    const container = access(options.ref) as HTMLElement | null;
    if (container === null) return undefined;
    const onRestore = (event: Event): void => {
      event.preventDefault();
      manager().setFocused(true);
    };
    container.addEventListener("barq-focus-scope-restore", onRestore);
    return () => container.removeEventListener("barq-focus-scope-restore", onRestore);
  });

  const { typeSelectProps } = typeSelect({
    keyboardDelegate: delegate,
    selectionManager: options.selectionManager,
  });

  const handlers: DOMProps = {
    onKeyDown: (event: KeyboardEvent) => {
      // The wrapper adds `continuePropagation`, which the handler uses to let
      // an unhandled key through to whatever is above.
      let handled = true;
      const marked = event as BaseEvent<KeyboardEvent>;
      Object.defineProperty(event, "continuePropagation", {
        configurable: true,
        value: () => {
          handled = false;
        },
      });
      try {
        onKeyDown(marked);
      } finally {
        delete (event as Partial<BaseEvent<KeyboardEvent>>).continuePropagation;
      }
      if (handled) event.stopPropagation();
    },
    onFocusIn: onFocus,
    onFocusOut: onBlur,
    onMouseDown: (event: MouseEvent) => {
      // A press on the scrollbar must not move focus into the collection.
      if (scrollElement() === targetElement(event)) event.preventDefault();
    },
    "data-collection": collectionId,
    tabIndex: () => {
      if (virtualFocus()) return undefined;
      return manager().focusedKey === null ? 0 : -1;
    },
  };

  return {
    collectionProps:
      access(options.disallowTypeAhead) === true ? handlers : mergeProps(typeSelectProps, handlers),
  };
}

// ---------------------------------------------------------------------------
// The two together
// ---------------------------------------------------------------------------

export interface SelectableListOptions extends Omit<
  SelectableCollectionOptions,
  "keyboardDelegate"
> {
  collection: Accessor<Collection<unknown>>;
  disabledKeys?: Accessor<Set<Key>>;
  keyboardDelegate?: KeyboardDelegate;
  layoutDelegate?: LayoutDelegate;
  orientation?: MaybeAccessor<Orientation | undefined>;
}

/** A selectable collection with the default list navigation. */
export function selectableList(options: SelectableListOptions): { listProps: DOMProps } {
  // `base` sensitivity, so typing "e" matches "É": a typeahead the user cannot
  // reach without an accented keyboard is no typeahead.
  const search = collator({ usage: "search", sensitivity: "base" });
  const locale = useLocale();

  const delegate =
    options.keyboardDelegate ??
    new ListKeyboardDelegate({
      collection: options.collection,
      ref: options.ref,
      disabledKeys: options.disabledKeys,
      disabledBehavior: () => options.selectionManager().disabledBehavior,
      collator: search,
      orientation: options.orientation,
      direction: () => locale().direction,
      layoutDelegate: options.layoutDelegate,
    });

  const { collectionProps } = selectableCollection({ ...options, keyboardDelegate: delegate });
  return { listProps: collectionProps };
}
