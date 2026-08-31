/**
 * Menus: a list of actions, opened from a trigger.
 *
 * A menu looks like a listbox and behaves differently in three ways that all
 * come from the same fact — it closes when you choose something.
 *
 * - Selection happens on pointer UP, not down. The press that opened the menu
 *   ends over the item that is now underneath it, and selecting on down would
 *   let one gesture open the menu and choose its first item.
 * - Escape closes the menu rather than clearing the selection. A menu whose
 *   Escape cleared checkboxes and left itself open would strand a keyboard
 *   user with no way out.
 * - Enter closes even a multi-select menu, where a click does not: keyboard
 *   users have Space for "check this and stay", so Enter is free to mean
 *   "this one, done".
 *
 * The role of an item is decided by the menu's selection mode, not by the
 * item: `menuitemradio` under single selection, `menuitemcheckbox` under
 * multiple, `menuitem` when there is nothing to select. Writing
 * `aria-checked` on a plain `menuitem` says every item is unchecked rather
 * than that checking is not the point.
 */

import {
  type Accessor,
  type Child,
  For,
  context,
  effect,
  getContext,
  getOwner,
  type Incoming,
  install,
  isServer,
  provide,
  signal,
} from "@barqjs/core";
import { tryCleanup } from "@barqjs/primitives/utils";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import type {
  FocusStrategy,
  ItemAccessors,
  Key,
  ListStateOptions,
  Node,
  SelectionMode,
} from "./collections.ts";
import { listState, type ListState } from "./collections.ts";
import { contains, focusWithoutScrolling, ownerWindow, targetElement } from "./dom.ts";
import { Popover } from "./dialog.tsx";
import { focusRing } from "./focus.ts";
import { hover } from "./interactions/hover.ts";
import { getInteractionModality, isFocusVisible } from "./interactions/modality.ts";
import { keyboard, type BaseEvent } from "./interactions/keyboard.ts";
import { longPressHandlers } from "./interactions/long-press.ts";
import type { ElementRef, PressEvent } from "./interactions/press.ts";
import { button, type ButtonOptions } from "./button.tsx";
import {
  overlayTrigger,
  overlayTriggerState,
  type OverlayTriggerState,
  type OverlayTriggerStateOptions,
  type Placement,
} from "./overlays.ts";
import { useLocale } from "./i18n.ts";
import { selectableItem, selectableList, type KeyboardDelegate } from "./selection.ts";
import {
  access,
  type DOMProps,
  filterDOMProps,
  fromProps,
  id,
  type MaybeAccessor,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";

// ---------------------------------------------------------------------------
// The menu
// ---------------------------------------------------------------------------

export interface MenuOptions {
  ref: ElementRef;
  /** @default true */
  shouldFocusWrap?: MaybeAccessor<boolean | undefined>;
  autoFocus?: MaybeAccessor<boolean | "first" | "last" | undefined>;
  /** Track focus with `aria-activedescendant`, for an autocomplete. */
  shouldUseVirtualFocus?: MaybeAccessor<boolean | undefined>;
  disallowTypeAhead?: MaybeAccessor<boolean | undefined>;
  isVirtualized?: MaybeAccessor<boolean | undefined>;
  keyboardDelegate?: KeyboardDelegate;
  /** The menu's own id, which every item id is derived from. */
  baseId?: MaybeAccessor<string | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  /** Called when an item is chosen and the menu should go away. */
  onClose?: () => void;
  onAction?: (key: Key) => void;
  /**
   * Chained BEFORE the collection's own key handling.
   *
   * A SUBMENU needs it: the key that closes it — the arrow pointing back at
   * its trigger, or Escape — is pressed inside the submenu and belongs to the
   * trigger, which is in the menu above.
   */
  onKeyDown?: (event: KeyboardEvent) => void;
}

export interface MenuResult {
  menuProps: DOMProps;
  /** The base every item id is derived from, shared with the items. */
  baseId: Accessor<string>;
}

export function menu(options: MenuOptions, state: ListState<unknown>): MenuResult {
  const baseId = id(options.baseId);

  const { listProps } = selectableList({
    ...options,
    selectionManager: state.selectionManager,
    collection: state.collection,
    disabledKeys: state.disabledKeys,
    shouldFocusWrap: () => access(options.shouldFocusWrap) ?? true,
    // The overlay's Escape is the one that matters; clearing the selection
    // first would consume the key and leave the menu open.
    escapeKeyBehavior: "none",
    // Following a link is the item's job, timed with the close.
    linkBehavior: "override",
  });

  return {
    baseId,
    menuProps: mergeProps(
      { onKeyDown: options.onKeyDown },
      filterDOMProps(options, { labelable: true }),
      listProps,
      {
        role: "menu",
        // Under virtual focus the menu never has DOM focus, so the item that
        // does is named here instead.
        "aria-activedescendant": () => {
          if (access(options.shouldUseVirtualFocus) !== true) return undefined;
          const focused = state.selectionManager().focusedKey;
          return focused === null ? undefined : menuItemIdFor(baseId(), focused);
        },
      },
    ),
  };
}

// ---------------------------------------------------------------------------
// An item
// ---------------------------------------------------------------------------

/**
 * The id an item renders under.
 *
 * `aria-activedescendant` names it before the item exists, so the id is
 * DERIVED from the key rather than generated per element. It is derived from
 * the menu's own id as well, because two menus offering the same key would
 * otherwise write the same id twice — the same shape `optionIdFor` uses in
 * `listbox.tsx`.
 */
export function menuItemIdFor(baseId: string, key: Key): string {
  return `${baseId}-item-${String(key)}`;
}

export interface MenuItemOptions {
  key: Key;
  ref: ElementRef;
  /** The menu's own id, which the item's is derived from. */
  baseId: MaybeAccessor<string>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isVirtualized?: MaybeAccessor<boolean | undefined>;
  shouldUseVirtualFocus?: MaybeAccessor<boolean | undefined>;
  /** Override when the menu closes. By default Enter and a single choice do. */
  shouldCloseOnSelect?: MaybeAccessor<boolean | undefined>;
  /**
   * Interaction handling on top of the item's own, chained after it.
   *
   * A submenu trigger IS a menu item, and opening on hover, on a virtual press
   * and on touch is three behaviours layered over the item's own rather than
   * instead of it. A second `press` or `hover` on the same element would be
   * two pressed states racing over one gesture.
   */
  onPressStart?: (event: PressEvent) => void;
  onPress?: (event: PressEvent) => void;
  onHoverChange?: (isHovered: boolean) => void;
  /** Chained BEFORE the collection's own, so a trigger's arrow key wins. */
  onKeyDown?: (event: KeyboardEvent) => void;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
  /** What this item opens, when it is a submenu trigger. */
  "aria-haspopup"?: MaybeAccessor<"menu" | "dialog" | undefined>;
  "aria-expanded"?: MaybeAccessor<boolean | undefined>;
  "aria-controls"?: MaybeAccessor<string | undefined>;
  onAction?: (key: Key) => void;
  onClose?: () => void;
}

export interface MenuItemResult {
  menuItemProps: DOMProps;
  /**
   * For an item whose name is one element among several.
   *
   * Nothing references these ids until the caller says so with
   * `aria-labelledby` and `aria-describedby`: an item that is just its text
   * is named by that text, and a reference to an element the caller never
   * rendered leaves it with no name at all.
   */
  labelProps: DOMProps;
  descriptionProps: DOMProps;
  /** For the element showing the item's keyboard shortcut, if any. */
  keyboardShortcutProps: DOMProps;
  isSelected: Accessor<boolean>;
  isFocused: Accessor<boolean>;
  isPressed: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
}

export function menuItem(options: MenuItemOptions, state: ListState<unknown>): MenuItemResult {
  const labelId = id();
  const descriptionId = id();
  const keyboardId = id();

  const manager = () => state.selectionManager();
  const isTrigger = (): boolean => access(options["aria-haspopup"]) !== undefined;
  const node = (): Node<unknown> | null => state.collection().getItem(options.key);

  /**
   * Whether choosing this item takes the menu away.
   *
   * From the keyboard, Enter means "this one" and closes whatever the mode;
   * Space is the one that checks an item and stays. From a pointer, only a
   * multi-select menu stays open, because there is no second gesture that
   * means "and I am done".
   */
  const shouldClose = (event: PressEvent): boolean => {
    const declared = access(options.shouldCloseOnSelect);
    if (declared !== undefined) return declared;
    if (manager().isLink(options.key)) return true;
    if (event.pointerType === "keyboard") {
      return event.key === "Enter" || manager().selectionMode === "none";
    }
    return manager().selectionMode !== "multiple";
  };

  /**
   * `shouldSelectOnPressUp` with `allowsDifferentPressOrigin` is what makes
   * this a menu rather than a listbox: the press may begin on the trigger and
   * end here. `linkBehavior: "none"` leaves a link alone so the close and the
   * navigation happen in that order rather than racing.
   */
  const item = selectableItem({
    key: options.key,
    ref: options.ref,
    id: () => menuItemIdFor(access(options.baseId), options.key),
    selectionManager: state.selectionManager,
    isDisabled: options.isDisabled,
    shouldUseVirtualFocus: options.shouldUseVirtualFocus,
    shouldSelectOnPressUp: true,
    allowsDifferentPressOrigin: true,
    linkBehavior: "none",
    onPressStart: options.onPressStart,
    onPress: (event) => {
      options.onPress?.(event);
      if (isTrigger() || item.isDisabled()) return;
      const itemAction = node()?.props?.onAction;
      if (typeof itemAction === "function") (itemAction as () => void)();
      options.onAction?.(options.key);
      if (shouldClose(event)) options.onClose?.();
    },
  });

  const { hoverProps } = hover({
    isDisabled: item.isDisabled,
    // Pointing at an item makes it the focused one, so arrowing on from where
    // the mouse left off continues rather than jumping back. Not while the
    // focus ring is showing: a mouse crossing the menu must not move a
    // keyboard user's place.
    onHoverStart: () => {
      if (isFocusVisible()) return;
      manager().setFocused(true);
      manager().setFocusedKey(options.key);
    },
    onHoverChange: options.onHoverChange,
  });

  const role = (): string => {
    if (isTrigger()) return "menuitem";
    const mode = manager().selectionMode;
    if (mode === "single") return "menuitemradio";
    if (mode === "multiple") return "menuitemcheckbox";
    return "menuitem";
  };

  return {
    isSelected: item.isSelected,
    isFocused: item.isFocused,
    isPressed: item.isPressed,
    isDisabled: item.isDisabled,
    labelProps: { id: labelId },
    descriptionProps: { id: descriptionId },
    keyboardShortcutProps: { id: keyboardId },
    menuItemProps: mergeProps({ onKeyDown: options.onKeyDown }, item.itemProps, hoverProps, {
      role,
      "aria-disabled": () => item.isDisabled() || undefined,
      "aria-label": () => access(options["aria-label"]) ?? node()?.["aria-label"],
      "aria-describedby": () => access(options["aria-describedby"]),
      "aria-checked": () =>
        manager().selectionMode !== "none" && !isTrigger() ? item.isSelected() : undefined,
      "aria-haspopup": () => access(options["aria-haspopup"]),
      "aria-expanded": () => access(options["aria-expanded"]),
      "aria-controls": () => access(options["aria-controls"]),
      "aria-posinset": () =>
        access(options.isVirtualized) === true ? (node()?.index ?? 0) + 1 : undefined,
      "aria-setsize": () =>
        access(options.isVirtualized) === true ? state.collection().size : undefined,
    }),
  };
}

// ---------------------------------------------------------------------------
// A section
// ---------------------------------------------------------------------------

export interface MenuSectionOptions {
  heading?: MaybeAccessor<unknown>;
  "aria-label"?: MaybeAccessor<string | undefined>;
}

export interface MenuSectionResult {
  itemProps: DOMProps;
  headingProps: DOMProps;
  groupProps: DOMProps;
}

/**
 * A group of items with a heading.
 *
 * ARIA has no heading inside a menu, so the heading is `role="presentation"`
 * and exists only to name the group. Left as a real heading it would be an
 * entry in the screen reader's heading list pointing at nothing navigable.
 */
export function menuSection(options: MenuSectionOptions): MenuSectionResult {
  const headingId = id();
  const hasHeading = (): boolean => {
    const heading = access(options.heading);
    return heading !== undefined && heading !== null && heading !== "";
  };

  return {
    itemProps: { role: "presentation" },
    headingProps: {
      id: () => (hasHeading() ? headingId() : undefined),
      role: "presentation",
    },
    groupProps: {
      role: "group",
      "aria-label": () => access(options["aria-label"]),
      "aria-labelledby": () => (hasHeading() ? headingId() : undefined),
    },
  };
}

// ---------------------------------------------------------------------------
// The trigger
// ---------------------------------------------------------------------------

export type MenuTriggerType = "press" | "longPress";

export interface MenuTriggerStateOptions extends OverlayTriggerStateOptions {}

export interface MenuTriggerState extends OverlayTriggerState {
  /** Which end the menu opens focused at, when it was opened from the keyboard. */
  focusStrategy: Accessor<FocusStrategy | null>;
  open: (focusStrategy?: FocusStrategy | null) => void;
  toggle: (focusStrategy?: FocusStrategy | null) => void;
}

/**
 * The state at the ROOT of a menu tree, which owns the submenu stack.
 *
 * Separate from {@link MenuTriggerState} because `menuTrigger` needs only the
 * opening and closing, and a `SelectState` — which is a menu trigger for a
 * listbox — has no submenus at all.
 */
export interface RootMenuTriggerState extends MenuTriggerState {
  /**
   * The trigger key of the open submenu at each level, outermost first.
   *
   * A STACK rather than a flag per trigger: only one submenu can be open at a
   * given depth, and opening one at depth 1 has to close whatever was open at
   * depth 2 and below. Holding that in the root state is what lets a trigger
   * three levels down know it has been closed by something it cannot see.
   */
  expandedKeys: Accessor<Key[]>;
  openSubmenu: (triggerKey: Key, level: number) => void;
  closeSubmenu: (triggerKey: Key, level: number) => void;
}

/** Whether the menu is open, and where focus lands when it opens. */
export function menuTriggerState(options: MenuTriggerStateOptions = {}): RootMenuTriggerState {
  const overlay = overlayTriggerState(options);
  const strategy = signal<FocusStrategy | null>(null);
  const expanded = signal<Key[]>([]);

  const close = (): void => {
    expanded.set([]);
    overlay.close();
  };

  return {
    ...overlay,
    close,
    focusStrategy: strategy,
    expandedKeys: expanded,
    openSubmenu: (triggerKey, level) => {
      if (level > expanded().length) return;
      expanded.set([...expanded().slice(0, level), triggerKey]);
    },
    closeSubmenu: (triggerKey, level) => {
      if (expanded()[level] !== triggerKey) return;
      expanded.set(expanded().slice(0, level));
    },
    open(focusStrategy: FocusStrategy | null = null) {
      strategy.set(focusStrategy);
      overlay.open();
    },
    toggle(focusStrategy: FocusStrategy | null = null) {
      strategy.set(focusStrategy);
      if (overlay.isOpen()) close();
      else overlay.open();
    },
  };
}

// ---------------------------------------------------------------------------
// A submenu
// ---------------------------------------------------------------------------

export interface SubmenuTriggerStateOptions {
  /** The key of the item that opens this submenu. */
  triggerKey: Key;
}

export interface SubmenuTriggerState {
  isOpen: Accessor<boolean>;
  focusStrategy: Accessor<FocusStrategy | null>;
  /** How deep this submenu sits: 0 for one opened from the root menu. */
  level: number;
  open: (focusStrategy?: FocusStrategy | null) => void;
  close: () => void;
  toggle: (focusStrategy?: FocusStrategy | null) => void;
  /** Close the whole tree, root included. */
  closeAll: () => void;
}

/**
 * One submenu's share of the root menu's stack.
 *
 * The level is read ONCE, at construction: it is how deep this trigger sits in
 * the markup, which does not change, whereas `expandedKeys` moves under it
 * constantly. Reading it live would make a trigger's level jump as its own
 * submenu opened.
 */
export function submenuTriggerState(
  options: SubmenuTriggerStateOptions,
  root: RootMenuTriggerState,
): SubmenuTriggerState {
  const level = root.expandedKeys().length;
  const strategy = signal<FocusStrategy | null>(null);
  const isOpen = (): boolean => root.expandedKeys()[level] === options.triggerKey;

  const open = (focusStrategy: FocusStrategy | null = null): void => {
    strategy.set(focusStrategy);
    root.openSubmenu(options.triggerKey, level);
  };

  const close = (): void => {
    strategy.set(null);
    root.closeSubmenu(options.triggerKey, level);
  };

  return {
    isOpen,
    focusStrategy: strategy,
    level,
    open,
    close,
    closeAll: root.close,
    toggle: (focusStrategy: FocusStrategy | null = null) => {
      if (isOpen()) close();
      else open(focusStrategy);
    },
  };
}

export interface MenuTriggerOptions {
  /** @default "menu" */
  type?: MaybeAccessor<"menu" | "listbox" | undefined>;
  /** @default "press" */
  trigger?: MaybeAccessor<MenuTriggerType | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
}

export interface MenuTriggerResult {
  /** Options for {@link button}, not props for an element. */
  menuTriggerProps: DOMProps;
  /** The props the menu itself needs: its id, its name, and where to focus. */
  menuProps: DOMProps;
}

/**
 * A button that opens a menu.
 *
 * The menu opens on pointer DOWN and closes on the press that follows over an
 * item, which is what every native menu does and what makes click-drag-release
 * work as one gesture. Touch is the exception: it opens on release, because a
 * menu appearing under a finger that is still down would immediately receive
 * that finger's move as a drag.
 */
export function menuTrigger(
  options: MenuTriggerOptions,
  state: MenuTriggerState,
): MenuTriggerResult {
  const triggerId = id();
  const trigger = (): MenuTriggerType => access(options.trigger) ?? "press";
  const isDisabled = (): boolean => access(options.isDisabled) === true;

  const { triggerProps, overlayProps } = overlayTrigger(
    { type: access(options.type) ?? "menu" },
    state,
  );
  // The press handling below replaces it: a menu opens on down, not on press.
  delete triggerProps.onPress;

  const openWithKey = (
    event: KeyboardEvent,
    strategy: FocusStrategy,
    forLongPress: boolean,
  ): boolean => {
    if (isDisabled()) return false;
    if (forLongPress !== (trigger() === "longPress")) return false;
    if (event.defaultPrevented) return false;
    state.toggle(strategy);
    return true;
  };

  const { keyboardProps } = keyboard({
    isDisabled: options.isDisabled,
    onKeyDown: (event) => {
      const alt = event.altKey;
      let handled = false;

      switch (event.key) {
        case "Enter":
        case " ":
          handled = openWithKey(event, "first", alt);
          break;
        case "ArrowDown":
          // Alt+Arrow opens a long-press menu too: it is the only key that
          // does, since the plain arrows there belong to whatever is behind.
          handled = alt
            ? openWithKey(event, "first", true) || openWithKey(event, "first", false)
            : openWithKey(event, "first", false);
          break;
        case "ArrowUp":
          handled = alt
            ? openWithKey(event, "last", true) || openWithKey(event, "last", false)
            : openWithKey(event, "last", false);
          break;
        default:
          break;
      }

      if (handled) event.preventDefault();
      else event.continuePropagation();
    },
  });

  const held = longPressHandlers({
    isDisabled: () => isDisabled() || trigger() !== "longPress",
    accessibilityDescription: "Long press to open the menu",
    onLongPressStart: () => state.close(),
    onLongPress: () => state.open("first"),
  });

  const interactionProps: DOMProps =
    trigger() === "longPress"
      ? { ...held.describedProps, onPressStart: held.onPressStart, onPressEnd: held.onPressEnd }
      : {
          preventFocusOnPress: true,
          onPressStart: (event: PressEvent) => {
            if (isDisabled() || event.pointerType === "touch" || event.pointerType === "keyboard") {
              return;
            }
            // Focus has to be on the trigger before the menu opens, or the
            // focus scope has nowhere to put it back when the menu closes.
            focusWithoutScrolling(event.target as HTMLElement);
            // A screen reader's activation has no pointer to follow, so the
            // first item is focused rather than the menu itself.
            state.open(event.pointerType === "virtual" ? "first" : null);
          },
          onPress: (event: PressEvent) => {
            if (isDisabled() || event.pointerType !== "touch") return;
            focusWithoutScrolling(event.target as HTMLElement);
            state.toggle();
          },
        };

  return {
    menuTriggerProps: mergeProps(triggerProps, interactionProps, keyboardProps, { id: triggerId }),
    menuProps: {
      ...overlayProps,
      "aria-labelledby": triggerId,
      autoFocus: () => {
        return state.focusStrategy() ?? true;
      },
      onClose: state.close,
    },
  };
}

// ---------------------------------------------------------------------------
// Moving the pointer to a submenu without losing it
// ---------------------------------------------------------------------------

export interface SafelyMouseToSubmenuOptions {
  /** The menu the trigger is in. */
  menuRef: ElementRef;
  submenuRef: ElementRef;
  isOpen: MaybeAccessor<boolean>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
}

/** How many moves away from the submenu are forgiven before giving up. */
const ALLOWED_INVALID_MOVEMENTS = 2;
const THROTTLE_TIME = 50;
const GIVE_UP_TIME = 1000;
/** 15°, so a hand that wobbles on the way still counts as heading there. */
const ANGLE_PADDING = Math.PI / 12;

/**
 * Let the pointer travel from a trigger to its submenu without closing it.
 *
 * The submenu is BESIDE the trigger, not under it, so the direct route to it
 * crosses other items of the parent menu — each of which would take the hover
 * and close the submenu the user was reaching for. The fix is to notice that
 * the pointer is heading INTO the submenu's rectangle and, while it is, turn
 * off pointer events on the parent menu so nothing it crosses reacts.
 *
 * "Heading into" is an angle test: the angle from the last pointer position to
 * the current one, against the angles to the submenu's top and bottom corners.
 * Two consecutive moves that fail it give up, because a user who has changed
 * their mind should not have to wait.
 */
export function safelyMouseToSubmenu(options: SafelyMouseToSubmenuOptions): void {
  if (isServer) return;

  let previous: { x: number; y: number } | null = null;
  let rect: DOMRect | null = null;
  let lastProcessed = 0;
  let side: "left" | "right" | null = null;
  let towards = ALLOWED_INVALID_MOVEMENTS;
  let giveUp: ReturnType<typeof setTimeout> | undefined;
  const blocked = signal(false);

  const reset = (): void => {
    blocked.set(false);
    towards = ALLOWED_INVALID_MOVEMENTS;
    previous = null;
    side = null;
  };

  // The parent menu stops answering the pointer while the user is on their way
  // across it. Restored on the way out, and on close, by the same effect.
  effect(() => {
    const menu_ = access(options.menuRef) as HTMLElement | null;
    if (menu_ === null) return undefined;
    menu_.style.pointerEvents = blocked() ? "none" : "";
    return () => {
      menu_.style.pointerEvents = "";
    };
  });

  effect(() => {
    const submenu = access(options.submenuRef) as HTMLElement | null;
    const parent = access(options.menuRef) as HTMLElement | null;

    if (
      access(options.isDisabled) === true ||
      submenu === null ||
      parent === null ||
      !access(options.isOpen) ||
      getInteractionModality() !== "pointer"
    ) {
      reset();
      return undefined;
    }

    rect = submenu.getBoundingClientRect();

    const onPointerMove = (event: PointerEvent): void => {
      if (event.pointerType === "touch" || event.pointerType === "pen") return;

      const now = Date.now();
      if (now - lastProcessed < THROTTLE_TIME) return;
      clearTimeout(giveUp);

      const x = event.clientX;
      const y = event.clientY;

      if (previous === null) {
        previous = { x, y };
        return;
      }
      if (rect === null) return;

      side ??= x > rect.right ? "left" : "right";

      const bounds = parent.getBoundingClientRect();
      if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) {
        reset();
        return;
      }

      const toSubmenu = side === "right" ? rect.left - previous.x : previous.x - rect.right;
      const angleTop = Math.atan2(previous.y - rect.top, toSubmenu) + ANGLE_PADDING;
      const angleBottom = Math.atan2(previous.y - rect.bottom, toSubmenu) - ANGLE_PADDING;
      const angle = Math.atan2(previous.y - y, side === "left" ? previous.x - x : x - previous.x);
      const heading = angle < angleTop && angle > angleBottom;

      towards = heading
        ? Math.min(towards + 1, ALLOWED_INVALID_MOVEMENTS)
        : Math.max(towards - 1, 0);
      blocked.set(towards >= ALLOWED_INVALID_MOVEMENTS);

      lastProcessed = now;
      previous = { x, y };

      // Heading there but no longer moving: the user has stopped somewhere in
      // the middle, and the item under them should take the hover after all.
      if (heading) {
        giveUp = setTimeout(() => {
          reset();
          setTimeout(() => {
            const under = document.elementFromPoint(x, y);
            if (under !== null && contains(parent, under)) {
              under.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
            }
          }, 100);
        }, GIVE_UP_TIME);
      }
    };

    const view = ownerWindow(parent);
    view.addEventListener("pointermove", onPointerMove as EventListener);

    return () => {
      view.removeEventListener("pointermove", onPointerMove as EventListener);
      clearTimeout(giveUp);
      towards = ALLOWED_INVALID_MOVEMENTS;
    };
  });
}

export interface SubmenuTriggerOptions {
  /** The menu the trigger item is in. */
  parentMenuRef: ElementRef;
  submenuRef: ElementRef;
  /**
   * The id the trigger ITEM already renders under.
   *
   * Not generated here: a menu item's id is derived from its key so that
   * `aria-activedescendant` can name it before it exists, and a second id
   * generated for the same element would leave `aria-labelledby` on the
   * submenu pointing at nothing.
   */
  triggerId: MaybeAccessor<string>;
  /** @default "menu" */
  type?: MaybeAccessor<"menu" | "dialog" | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  /** How long a hover must last before the submenu opens. @default 200 */
  delay?: MaybeAccessor<number | undefined>;
  shouldUseVirtualFocus?: MaybeAccessor<boolean | undefined>;
}

export interface SubmenuTriggerResult {
  /** Options for {@link menuItem}, not props for an element. */
  submenuTriggerProps: DOMProps;
  /** Options for the submenu's own {@link menu}. */
  submenuProps: DOMProps;
  /** Options for the {@link Popover} the submenu is rendered in. */
  popoverProps: DOMProps;
}

/**
 * An item that opens a menu beside itself.
 *
 * The direction keys are mirrored for RTL, and the one that OPENS is the one
 * pointing at where the submenu will appear. Escape and the closing arrow both
 * put focus back on the trigger, because a submenu that closes leaving focus
 * nowhere strands a keyboard user.
 */
export function submenuTrigger(
  options: SubmenuTriggerOptions,
  state: SubmenuTriggerState,
  ref: ElementRef,
): SubmenuTriggerResult {
  const overlayId = id();
  const locale = useLocale();
  const type = (): "menu" | "dialog" => access(options.type) ?? "menu";
  const isDisabled = (): boolean => access(options.isDisabled) === true;

  let opening: ReturnType<typeof setTimeout> | undefined;
  const cancelOpen = (): void => {
    clearTimeout(opening);
    opening = undefined;
  };

  const openNow = (focusStrategy: FocusStrategy | null = null): void => {
    cancelOpen();
    state.open(focusStrategy);
  };

  const closeNow = (): void => {
    cancelOpen();
    state.close();
  };

  /**
   * Put focus back on the trigger, AFTER the submenu has gone.
   *
   * Not in the same turn as the close: the submenu's focus scope is still
   * containing focus at that instant and pulls it straight back onto the item
   * the user was standing on. A frame later the scope is disposed and the
   * trigger is the right place for focus to be.
   */
  const restoreFocus = (): void => {
    if (access(options.shouldUseVirtualFocus) === true) return;
    const element = access(ref) as HTMLElement | null;
    if (element === null) return;
    requestAnimationFrame(() => {
      if (element.isConnected) focusWithoutScrolling(element);
    });
  };

  tryCleanup(cancelOpen);

  /** The key that opens the submenu, which is the one pointing at it. */
  const openKey = (): string => (locale().direction === "rtl" ? "ArrowLeft" : "ArrowRight");
  const closeKey = (): string => (locale().direction === "rtl" ? "ArrowRight" : "ArrowLeft");

  // On the SUBMENU, for getting back out of it.
  const onSubmenuKeyDown = (event: BaseEvent<KeyboardEvent>): void => {
    if (event.key !== closeKey() && event.key !== "Escape") {
      event.continuePropagation();
      return;
    }
    const submenu = access(options.submenuRef) as Element | null;
    const target = targetElement(event);
    if (submenu === null || target === null || !contains(submenu, target)) {
      event.continuePropagation();
      return;
    }
    closeNow();
    restoreFocus();
  };

  // On the TRIGGER, for getting into it.
  const onTriggerKeyDown = (event: BaseEvent<KeyboardEvent>): void => {
    if (isDisabled()) {
      event.continuePropagation();
      return;
    }
    if (event.key === openKey()) {
      if (!state.isOpen()) openNow("first");
      return;
    }
    if (event.key === closeKey() && state.isOpen()) {
      closeNow();
      restoreFocus();
      return;
    }
    event.continuePropagation();
  };

  const { keyboardProps: triggerKeyboardProps } = keyboard({ onKeyDown: onTriggerKeyDown });
  const { keyboardProps: submenuKeyboardProps } = keyboard({ onKeyDown: onSubmenuKeyDown });

  safelyMouseToSubmenu({
    menuRef: options.parentMenuRef,
    submenuRef: options.submenuRef,
    isOpen: state.isOpen,
    isDisabled: options.isDisabled,
  });

  // Focus landing on a DIFFERENT item of the parent menu closes this submenu.
  // Without it, arrowing past an open trigger leaves its submenu behind.
  //
  // The submenu itself is EXCLUDED, and not as a nicety: it renders inside the
  // trigger item, so it is a DOM descendant of the parent menu, and its own
  // autofocus would otherwise close it the moment it opened.
  effect(() => {
    const parent = access(options.parentMenuRef) as Element | null;
    if (parent === null) return undefined;

    const onFocusIn = (event: FocusEvent): void => {
      if (!state.isOpen()) return;
      const target = targetElement(event);
      if (target === null || target === access(ref)) return;
      const submenu = access(options.submenuRef) as Element | null;
      if (submenu !== null && contains(submenu, target)) return;
      if (contains(parent, target)) closeNow();
    };

    parent.addEventListener("focusin", onFocusIn as EventListener);
    return () => parent.removeEventListener("focusin", onFocusIn as EventListener);
  });

  return {
    submenuTriggerProps: mergeProps(triggerKeyboardProps, {
      "aria-haspopup": () => (isDisabled() ? undefined : type()),
      "aria-expanded": () => state.isOpen(),
      "aria-controls": () => (state.isOpen() ? overlayId() : undefined),
      onPressStart: (event: PressEvent) => {
        // A screen reader or a keyboard has no pointer to follow, so the first
        // item is focused rather than the submenu itself.
        if (isDisabled()) return;
        if (event.pointerType === "virtual" || event.pointerType === "keyboard") openNow("first");
      },
      onPress: (event: PressEvent) => {
        if (isDisabled()) return;
        if (event.pointerType === "touch" || event.pointerType === "mouse") openNow();
      },
      onHoverChange: (isHovered: boolean) => {
        if (isDisabled()) return;
        if (!isHovered) {
          cancelOpen();
          return;
        }
        if (state.isOpen() || opening !== undefined) return;
        opening = setTimeout(
          () => {
            opening = undefined;
            state.open();
          },
          access(options.delay) ?? 200,
        );
      },
    }),
    submenuProps: mergeProps(type() === "menu" ? submenuKeyboardProps : {}, {
      id: overlayId,
      "aria-labelledby": () => access(options.triggerId),
      ...(type() === "menu"
        ? { onClose: state.closeAll, autoFocus: () => state.focusStrategy() ?? undefined }
        : {}),
    }),
    popoverProps: {
      // A submenu does not hide the page from assistive technology: the menu
      // behind it is still the thing the user is in.
      isModal: false,
      placement: () => (locale().direction === "rtl" ? "left start" : "right start"),
    },
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface MenuContextValue {
  state: ListState<unknown>;
  /** The menu's own id, which every item id is derived from. */
  baseId: Accessor<string>;
  /** The `<ul>`, for a submenu's safe triangle and its focus watching. */
  menuRef: ElementRef;
  /**
   * The state at the ROOT of this menu tree, shared by every level.
   *
   * A submenu three deep is opened and closed through the same stack as one
   * beside the trigger, so the root is threaded down rather than re-derived.
   */
  root: RootMenuTriggerState;
  shouldUseVirtualFocus: Accessor<boolean | undefined>;
  onAction: Accessor<((key: Key) => void) | undefined>;
  onClose: Accessor<(() => void) | undefined>;
}

const MenuContext = context<MenuContextValue | null>(null);
const MenuNodeContext = context<Node<unknown> | null>(null);

export function useMenu(): MenuContextValue {
  const value = getContext(MenuContext);
  if (value === null || value === undefined) {
    throw new Error("A MenuItem must be rendered inside a Menu.");
  }
  return value;
}

/** The enclosing menu, or `null` when this is the outermost one. */
function useEnclosingMenu(): MenuContextValue | null {
  return getContext(MenuContext) ?? null;
}

/** The collection node the row being built is for. */
export function provideMenuNode(node: Node<unknown>): void {
  const owner = getOwner();
  if (owner !== null) install(owner, MenuNodeContext, () => node);
}

/** The collection node the enclosing row is for. */
export function useMenuNode(): Node<unknown> {
  const node = getContext(MenuNodeContext);
  if (node === null || node === undefined) {
    throw new Error("A MenuItem must be rendered inside its Menu's item callback.");
  }
  return node;
}

export interface MenuTriggerValue {
  state: RootMenuTriggerState;
  triggerRef: ReturnType<typeof makeRef<HTMLButtonElement>>;
  menuTriggerProps: DOMProps;
  menuProps: DOMProps;
}

const MenuTriggerContext = context<MenuTriggerValue | null>(null);

/** The enclosing {@link MenuTrigger}, if there is one. */
export function useMenuTrigger(): MenuTriggerValue | null {
  return getContext(MenuTriggerContext) ?? null;
}

export interface SubmenuTriggerValue {
  state: SubmenuTriggerState;
  /**
   * The `baseId` of the menu the TRIGGER is in.
   *
   * Everything inside a `<SubmenuTrigger>` sees this context, the submenu's own
   * items included, and without this every one of them would think it was the
   * trigger: `aria-haspopup` on all of them, and a press that opens rather than
   * chooses. Identity of the accessor is enough, since each menu makes one.
   */
  parentBaseId: Accessor<string>;
  /** The key of the item that opens the submenu. */
  triggerKey: Key;
  /** Written by the `<MenuItem>` inside, read by the safe triangle. */
  triggerRef: ReturnType<typeof makeRef<HTMLLIElement>>;
  /** Written by the `<Menu>` inside. */
  submenuRef: ReturnType<typeof makeRef<HTMLUListElement>>;
  /** Options for {@link menuItem}, not props for an element. */
  submenuTriggerProps: DOMProps;
  /** Options for the submenu's own {@link menu}. */
  submenuProps: DOMProps;
  popoverProps: DOMProps;
}

const SubmenuTriggerContext = context<SubmenuTriggerValue | null>(null);

/** The enclosing {@link SubmenuTrigger}, if there is one. */
export function useSubmenuTrigger(): SubmenuTriggerValue | null {
  return getContext(SubmenuTriggerContext) ?? null;
}

export interface SubmenuTriggerComponentProps {
  /** A `<MenuItem>` and the `<Menu>` it opens, in that order. */
  children?: Child;
  isDisabled?: boolean;
  /** How long a hover must last before the submenu opens. @default 200 */
  delay?: number;
}

/**
 * A menu item and the menu it opens beside itself.
 *
 * ```tsx
 * <Menu items={actions()}>
 *   {(action) =>
 *     action.children === undefined ? (
 *       <MenuItem>{action.name}</MenuItem>
 *     ) : (
 *       <SubmenuTrigger>
 *         <MenuItem>{action.name}</MenuItem>
 *         <Menu items={action.children}>{(child) => <MenuItem>{child.name}</MenuItem>}</Menu>
 *       </SubmenuTrigger>
 *     )
 *   }
 * </Menu>
 * ```
 *
 * The two children find each other through this component's context rather
 * than by position, so the `<MenuItem>` can be wrapped or decorated without
 * the submenu losing its trigger.
 */
export function SubmenuTrigger(props: Incoming<SubmenuTriggerComponentProps>) {
  const triggerRef = makeRef<HTMLLIElement>();
  const submenuRef = makeRef<HTMLUListElement>();
  const list = useMenu();
  const node = useMenuNode();

  const state = submenuTriggerState({ triggerKey: node.key }, list.root);

  const { submenuTriggerProps, submenuProps, popoverProps } = submenuTrigger(
    {
      parentMenuRef: list.menuRef,
      submenuRef,
      triggerId: () => menuItemIdFor(list.baseId(), node.key),
      isDisabled: () => props.isDisabled?.() === true || node.props?.isDisabled === true,
      delay: () => props.delay?.(),
      shouldUseVirtualFocus: list.shouldUseVirtualFocus,
    },
    state,
    triggerRef,
  );

  const value: SubmenuTriggerValue = {
    state,
    parentBaseId: list.baseId,
    triggerKey: node.key,
    triggerRef,
    submenuRef,
    submenuTriggerProps,
    submenuProps,
    popoverProps,
  };

  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;

  // `provide`, not `install`, for the reason `MenuTrigger` gives: two submenu
  // triggers in one menu both run their bodies before either one's children
  // are built.
  return provide(
    owner,
    SubmenuTriggerContext,
    () => value,
    () => props.children as unknown,
  ) as never;
}

export interface MenuTriggerComponentProps {
  children?: Child;
  isOpen?: boolean;
  defaultOpen?: boolean;
  /** @default "press" */
  trigger?: MenuTriggerType;
  isDisabled?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * A trigger and its menu, sharing one piece of state.
 *
 * ```tsx
 * <MenuTrigger>
 *   <MenuButton>Actions</MenuButton>
 *   <Menu items={actions()} onAction={(key) => run(key)}>
 *     {(action) => <MenuItem>{action.name}</MenuItem>}
 *   </Menu>
 * </MenuTrigger>
 * ```
 *
 * The `<Menu>` inside puts itself in a popover anchored to the button and
 * renders only while open, so neither has to be told about the other.
 */
export function MenuTrigger(props: Incoming<MenuTriggerComponentProps>) {
  const triggerRef = makeRef<HTMLButtonElement>();
  const options = fromProps(props);
  const state = menuTriggerState(options);

  const { menuTriggerProps, menuProps } = menuTrigger(options, state);

  const value: MenuTriggerValue = { state, triggerRef, menuTriggerProps, menuProps };
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;

  // `provide`, not `install`: a component gets no scope of its own, so
  // installing on the ambient owner writes where its SIBLINGS read. Two menu
  // triggers beside each other both run their bodies before either one's
  // children are built, and every child of both then sees the second one.
  return provide(
    owner,
    MenuTriggerContext,
    () => value,
    () => props.children as unknown,
  ) as never;
}

export interface MenuButtonComponentProps extends StyleProps {
  children?: Child;
  isDisabled?: boolean;
  "aria-label"?: string;
  ref?: RefTarget<HTMLButtonElement>;
}

/** The button an enclosing {@link MenuTrigger} opens its menu from. */
export function MenuButton(props: Incoming<MenuButtonComponentProps>) {
  const menuTriggerValue = useMenuTrigger();
  if (menuTriggerValue === null) {
    throw new Error("A MenuButton must be rendered inside a MenuTrigger.");
  }

  const options = fromProps(props);
  const { buttonProps, isPressed } = button(
    { ...(options as ButtonOptions), ...menuTriggerValue.menuTriggerProps },
    menuTriggerValue.triggerRef,
  );

  const { hoverProps, isHovered } = hover({ isDisabled: options.isDisabled });
  const { focusProps, isFocused, isFocusVisible: showsRing } = focusRing();

  const elementProps = mergeProps(
    buttonProps,
    { id: menuTriggerValue.menuTriggerProps.id },
    hoverProps,
    focusProps,
    filterDOMProps(options, { global: true }),
    styleProps(props),
    {
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-focused": isFocused,
      "data-focus-visible": showsRing,
      "data-disabled": () => props.isDisabled?.() === true,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <button {...elementProps} ref={mergeRefs(menuTriggerValue.triggerRef.set, props.ref?.())}>
      {props.children}
    </button>
  );
}

export interface MenuComponentProps<T> extends StyleProps, ItemAccessors<T> {
  /** The values to render, in order. */
  items: Iterable<T>;
  /** How one value renders. Return a `<MenuItem>` or a `<MenuSection>`. */
  children: (item: T) => Child;
  /** @default "none" */
  selectionMode?: SelectionMode;
  selectedKeys?: "all" | Iterable<Key>;
  defaultSelectedKeys?: "all" | Iterable<Key>;
  disabledKeys?: Iterable<Key>;
  disallowEmptySelection?: boolean;
  /** @default true */
  shouldFocusWrap?: boolean;
  autoFocus?: boolean | "first" | "last";
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** Where the popover goes, when inside a {@link MenuTrigger}. @default "bottom start" */
  placement?: Placement;
  offset?: number;
  ref?: RefTarget<HTMLUListElement>;
  onSelectionChange?: (keys: "all" | Set<Key>) => void;
  onAction?: (key: Key) => void;
  onClose?: () => void;
}

/**
 * ```tsx
 * <Menu items={actions()} onAction={(key) => run(key)}>
 *   {(action) => <MenuItem>{action.name}</MenuItem>}
 * </Menu>
 * ```
 *
 * The items are DATA, as they are for a listbox: a component whose body runs
 * once has no reason to render them twice, once to discover them and once to
 * show them.
 */
export function Menu<T>(props: Incoming<MenuComponentProps<T>>) {
  const enclosing = useSubmenuTrigger();
  const parent = useEnclosingMenu();
  // The submenu of the trigger this menu sits in, rather than of a trigger
  // further up: a menu nested inside a submenu's own items is not it.
  const submenu =
    enclosing !== null && parent !== null && enclosing.parentBaseId === parent.baseId
      ? enclosing
      : null;

  // A submenu is anchored to its trigger ITEM and sits beside it, and it is
  // checked first: a submenu is also inside the root `<MenuTrigger>`, whose
  // popover is already open and holding the menu this one opens from.
  if (submenu !== null) {
    return (
      <Popover
        triggerRef={submenu.triggerRef}
        isOpen={submenu.state.isOpen()}
        onOpenChange={(isOpen: boolean) => {
          if (!isOpen) submenu.state.close();
        }}
        placement={
          props.placement?.() ?? access(submenu.popoverProps.placement as MaybeAccessor<Placement>)
        }
        offset={props.offset?.() ?? 0}
        isNested
      >
        <MenuList of={props} trigger={null} />
      </Popover>
    );
  }

  const trigger = useMenuTrigger();

  if (trigger === null) return <MenuList of={props} trigger={null} />;

  // The list is written inside the popover rather than built and handed to it,
  // so it is a Block: nothing is constructed until the menu opens, and the
  // autofocus reads the focus strategy the opening keypress set.
  return (
    <Popover
      triggerRef={trigger.triggerRef}
      isOpen={trigger.state.isOpen()}
      onOpenChange={trigger.state.setOpen}
      placement={props.placement?.() ?? "bottom start"}
      offset={props.offset?.() ?? 8}
    >
      <MenuList of={props} trigger={trigger} />
    </Popover>
  );
}

interface MenuListProps<T> {
  /** The `<Menu>`'s own props, still as Cells. */
  of: Incoming<MenuComponentProps<T>>;
  trigger: MenuTriggerValue | null;
}

function MenuList<T>(listProps: Incoming<MenuListProps<T>>) {
  const domRef = makeRef<HTMLUListElement>();
  const props = listProps.of();
  const options = fromProps(props as unknown as Incoming<Record<string, unknown>>);
  const trigger = listProps.trigger();
  const enclosing = useEnclosingMenu();
  const trigger_ = useSubmenuTrigger();
  // The same guard `<Menu>` applies: a menu nested inside a submenu's items is
  // not that submenu.
  const submenu =
    trigger_ !== null && enclosing !== null && trigger_.parentBaseId === enclosing.baseId
      ? trigger_
      : null;

  // One root for the whole tree. A menu with no trigger above it is its own
  // root, so a submenu still works inside a menu rendered inline.
  const root = enclosing?.root ?? trigger?.state ?? menuTriggerState();

  const state = listState<T>({
    ...(options as ListStateOptions<T>),
    onSelectionChange: (keys) => props.onSelectionChange?.()?.(keys),
  });

  const close = (): void => {
    props.onClose?.()?.();
    if (submenu !== null) submenu.state.closeAll();
    trigger?.state.close();
  };

  const { menuProps, baseId } = menu(
    {
      ...(options as unknown as MenuOptions),
      ...(submenu === null ? {} : (submenu.submenuProps as Record<string, never>)),
      ref: domRef,
      // A submenu with no label of its own is named by the ITEM that opens it,
      // which is what a screen reader announces on the way in.
      "aria-labelledby": () =>
        props["aria-labelledby"]?.() ??
        (props["aria-label"]?.() !== undefined
          ? undefined
          : (access(
              (submenu?.submenuProps["aria-labelledby"] ??
                trigger?.menuProps["aria-labelledby"]) as MaybeAccessor<string | undefined>,
            ) ?? undefined)),
      autoFocus: () =>
        props.autoFocus?.() ??
        (submenu === null
          ? trigger === null
            ? undefined
            : access(trigger.menuProps.autoFocus as MaybeAccessor<boolean | "first" | "last">)
          : (submenu.state.focusStrategy() ?? undefined)),
      onClose: close,
    },
    state,
  );

  const owner = getOwner();
  if (owner !== null) {
    const value: MenuContextValue = {
      state: state,
      baseId,
      menuRef: domRef,
      root,
      shouldUseVirtualFocus: () => undefined,
      onAction: () => props.onAction?.(),
      onClose: () => close,
    };
    install(owner, MenuContext, () => value);
  }

  const elementProps = mergeProps(
    menuProps,
    filterDOMProps(options, { global: true }),
    styleProps(props),
    {
      id: () =>
        access(
          (submenu?.submenuProps.id ?? trigger?.menuProps.id) as MaybeAccessor<string | undefined>,
        ),
      "data-testid": () => props["data-testid"]?.(),
      "data-empty": () => state.collection().size === 0,
    },
  );

  const render = props.children as unknown as (scope: unknown, item: T) => Child;

  return (
    <ul {...elementProps} ref={mergeRefs(domRef.set, submenu?.submenuRef.set, props.ref?.())}>
      <For each={() => [...state.collection()]}>
        {(node: Node<T>) => {
          provideMenuNode(node);
          return render(getOwner(), node.value as T);
        }}
      </For>
    </ul>
  );
}

export interface MenuItemComponentProps extends StyleProps {
  children?: Child;
  "aria-label"?: string;
  /** Override when the menu closes on this item. */
  shouldCloseOnSelect?: boolean;
  ref?: RefTarget<HTMLLIElement>;
}

/**
 * One item. Its key, value and disabled state come from the collection node
 * the enclosing {@link Menu} is rendering, so nothing is repeated here.
 */
export function MenuItem(props: Incoming<MenuItemComponentProps>) {
  const domRef = makeRef<HTMLLIElement>();
  const list = useMenu();
  const node = useMenuNode();
  // Inside a `<SubmenuTrigger>` this item IS the trigger, and takes its
  // handlers and its `aria-haspopup` on top of an ordinary item's. The
  // submenu's OWN items are inside that same context and are not.
  const enclosing = useSubmenuTrigger();
  const submenu =
    enclosing !== null &&
    enclosing.parentBaseId === list.baseId &&
    enclosing.triggerKey === node.key
      ? enclosing
      : null;
  const opens = submenu?.submenuTriggerProps ?? {};

  const { menuItemProps, isSelected, isFocused, isPressed, isDisabled } = menuItem(
    {
      key: node.key,
      ref: domRef,
      baseId: list.baseId,
      "aria-label": () => props["aria-label"]?.(),
      isDisabled: () => node.props?.isDisabled === true,
      shouldCloseOnSelect: () => props.shouldCloseOnSelect?.(),
      shouldUseVirtualFocus: list.shouldUseVirtualFocus,
      onAction: (key) => list.onAction()?.(key),
      onClose: () => list.onClose()?.(),
      ...(opens as unknown as Record<string, never>),
    },
    list.state,
  );

  const { hoverProps, isHovered } = hover({ isDisabled });
  const { focusProps, isFocusVisible: showsRing } = focusRing();

  const elementProps = mergeProps(
    menuItemProps,
    hoverProps,
    focusProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "data-selected": isSelected,
      "data-focused": isFocused,
      "data-focus-visible": showsRing,
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-disabled": isDisabled,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <li {...elementProps} ref={mergeRefs(domRef.set, submenu?.triggerRef.set, props.ref?.())}>
      {props.children}
    </li>
  );
}

export interface MenuSectionComponentProps<T> extends StyleProps {
  heading?: Child;
  "aria-label"?: string;
  /** How one child of this section renders. */
  children: (item: T) => Child;
}

/**
 * A group of items inside a menu, taken from the section node the enclosing
 * {@link Menu} is rendering.
 *
 * ```tsx
 * <Menu items={grouped()}>
 *   {(entry) =>
 *     entry.children === undefined ? (
 *       <MenuItem>{entry.name}</MenuItem>
 *     ) : (
 *       <MenuSection heading={entry.name}>
 *         {(child) => <MenuItem>{child.name}</MenuItem>}
 *       </MenuSection>
 *     )
 *   }
 * </Menu>
 * ```
 */
export function MenuSection<T>(props: Incoming<MenuSectionComponentProps<T>>) {
  const node = useMenuNode();

  const { itemProps, headingProps, groupProps } = menuSection({
    heading: () => props.heading?.(),
    "aria-label": () => props["aria-label"]?.(),
  });

  const render = props.children as unknown as (scope: unknown, item: T) => Child;

  return (
    <li {...itemProps}>
      <span {...headingProps}>{props.heading}</span>
      <ul {...mergeProps(groupProps, styleProps(props))}>
        <For each={() => [...node.childNodes]}>
          {(child: Node<unknown>) => {
            provideMenuNode(child);
            return render(getOwner(), child.value as T);
          }}
        </For>
      </ul>
    </li>
  );
}
