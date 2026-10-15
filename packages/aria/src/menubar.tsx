/**
 * A menubar: a row of menus that is ONE widget rather than several.
 *
 * What separates it from a row of menu buttons is all here:
 *
 * - **One Tab stop.** The triggers share a roving `tabindex`, so Tab enters the
 *   bar once and leaves it once, and the horizontal arrows, Home, End and a
 *   typed letter move between the triggers.
 * - **One menu open, and the bar owns which.** Each menu's open state is a
 *   reading of the bar's `value`, so opening one is closing the other and
 *   there is never a frame with two.
 * - **While a menu is open the horizontal arrows change WHICH menu is open.**
 *   From a trigger, and from any depth inside a menu: the arrow belongs to the
 *   bar unless the item under it has a submenu to open, or the submenu it is in
 *   is the thing the arrow closes.
 * - **Pointing at a trigger opens its menu only while another is open.** A bar
 *   that opened on hover alone would open under a pointer on its way somewhere
 *   else.
 * - **Closing gives focus back to the trigger, and says so.** The menu's own
 *   focus scope restores to whatever had focus when it opened, which after a
 *   switch between menus is an item of a menu that no longer exists.
 *
 * The menus inside are ordinary `<Menu>`s. A `<MenubarMenu>` is a menu trigger
 * whose state is the bar's, and nothing below it knows the difference.
 */

import {
  type Accessor,
  type Child,
  createContext,
  createEffect,
  createSignal,
  createTrackedEffect,
  createUniqueId,
  flush,
  getContext,
  type Incoming,
  onCleanup,
  onSettled,
  provide,
  untrack,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";

import { button, type ButtonOptions } from "./button.tsx";
import type { FocusStrategy } from "./collections.ts";
import { focusWithoutScrolling, ownerDocument, targetElement } from "./dom.ts";
import { focusRing } from "./focus.ts";
import { useLocale } from "./i18n.ts";
import { hover } from "./interactions/hover.ts";
import {
  menuTrigger,
  menuTriggerState,
  provideMenuTrigger,
  type MenuTriggerValue,
  type RootMenuTriggerState,
} from "./menu.tsx";
import {
  access,
  controllable,
  type DOMProps,
  filterDOMProps,
  fromProps,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";

/** How long a typed prefix is remembered before the next key starts a new one. */
const TYPEAHEAD_RESET = 500;

interface MenubarEntry {
  value: string;
  state: RootMenuTriggerState;
  trigger: Accessor<HTMLElement | null>;
  isDisabled: Accessor<boolean>;
}

type Step = "next" | "previous" | "first" | "last";

interface MenubarValue {
  /** The `value` of the open menu, or `""` when none is. */
  value: Accessor<string>;
  setValue: (value: string) => void;
  /** The menu whose trigger is in the Tab order. */
  tabStop: Accessor<string | null>;
  setTabStop: (value: string) => void;
  direction: Accessor<"ltr" | "rtl">;
  register: (entry: MenubarEntry) => void;
  /** The menu `step` away from `from`, skipping disabled ones. */
  towards: (from: string, step: Step) => MenubarEntry | null;
  /** The next menu after `from` whose trigger starts with what has been typed. */
  matching: (from: string, character: string) => MenubarEntry | null;
  /** Close whatever is open and open `value` in its place. */
  switchTo: (value: string, focusStrategy: FocusStrategy | null) => void;
}

const MenubarContext = createContext<MenubarValue | null>(null);

function useMenubar(): MenubarValue {
  const bar = getContext(MenubarContext);
  if (bar === null || bar === undefined) {
    throw new Error("A MenubarMenu must be rendered inside a Menubar.");
  }
  return bar;
}

interface MenubarMenuValue {
  value: string;
  trigger: MenuTriggerValue;
  setDisabled: (isDisabled: boolean) => void;
}

const MenubarMenuContext = createContext<MenubarMenuValue | null>(null);

function byDocument(a: MenubarEntry, b: MenubarEntry): number {
  const first = a.trigger();
  const second = b.trigger();
  if (first === null || second === null) return 0;
  const relation = first.compareDocumentPosition(second);
  if ((relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) return -1;
  if ((relation & Node.DOCUMENT_POSITION_PRECEDING) !== 0) return 1;
  return 0;
}

export interface MenubarComponentProps extends StyleProps {
  children?: Child;
  /** The `value` of the open `<MenubarMenu>`, or `""` for none. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Whether the arrows go round from the last trigger to the first. @default true */
  loop?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * ```tsx
 * <Menubar aria-label="Application">
 *   <MenubarMenu>
 *     <MenubarTrigger>File</MenubarTrigger>
 *     <Menu>
 *       <MenuItem onAction={() => open()}>Open</MenuItem>
 *     </Menu>
 *   </MenubarMenu>
 *   <MenubarMenu>
 *     <MenubarTrigger>Edit</MenubarTrigger>
 *     <Menu>
 *       <MenuItem onAction={() => undo()}>Undo</MenuItem>
 *     </Menu>
 *   </MenubarMenu>
 * </Menubar>
 * ```
 */
export function Menubar(props: Incoming<MenubarComponentProps>) {
  const locale = useLocale();
  const entries = new Map<string, MenubarEntry>();
  const [registered, setRegistered] = createSignal(0, { ownedWrite: true });
  const [focused, setFocused] = createSignal<string | null>(null);

  const [value, setValue] = controllable<string>(
    () => props.value?.(),
    () => props.defaultValue?.() ?? "",
    (next) => props.onValueChange?.()?.(next),
  );

  const ordered = (): MenubarEntry[] =>
    [...entries.values()].toSorted(byDocument).filter((entry) => !entry.isDisabled());

  let typed = "";
  let forget: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(forget));

  // A menu's focus scope restores to what had focus when it opened. After a
  // switch that can be an item of the menu before, which is gone, so when the
  // last menu closes its trigger is named outright. Only if focus fell to
  // nothing: a press elsewhere that took focus keeps it.
  let switching = false;
  let wasOpen = "";
  createTrackedEffect(() => {
    const open = value();
    const closed = wasOpen;
    wasOpen = open;
    if (open !== "" || closed === "" || switching) return;
    const trigger = entries.get(closed)?.trigger() ?? null;
    if (trigger === null) return;
    requestAnimationFrame(() => {
      if (value() !== "" || !trigger.isConnected) return;
      const doc = ownerDocument(trigger);
      const active = doc.activeElement;
      if (active === null || active === doc.body || !active.isConnected) {
        focusWithoutScrolling(trigger);
      }
    });
  });

  const bar: MenubarValue = {
    value,
    setValue,
    direction: () => locale().direction,
    setTabStop: setFocused,
    tabStop: () => {
      registered();
      const held = focused();
      if (held !== null && entries.get(held)?.isDisabled() === false) return held;
      for (const entry of entries.values()) {
        if (!entry.isDisabled()) return entry.value;
      }
      return null;
    },
    register: (entry) => {
      entries.set(entry.value, entry);
      setRegistered((count) => count + 1);
      onCleanup(() => {
        entries.delete(entry.value);
        setRegistered((count) => count + 1);
      });
    },
    towards: (from, step) => {
      const all = ordered();
      if (all.length === 0) return null;
      if (step === "first") return all[0] ?? null;
      if (step === "last") return all[all.length - 1] ?? null;
      const at = all.findIndex((entry) => entry.value === from);
      const to = at + (step === "next" ? 1 : -1);
      if (to >= 0 && to < all.length) return all[to] ?? null;
      if (props.loop?.() === false) return null;
      return all[(to + all.length) % all.length] ?? null;
    },
    matching: (from, character) => {
      clearTimeout(forget);
      forget = setTimeout(() => {
        typed = "";
      }, TYPEAHEAD_RESET);
      typed += character.toLowerCase();

      const all = ordered();
      const at = all.findIndex((entry) => entry.value === from);
      // One letter typed again steps to the next match; a longer prefix may
      // still be the trigger the user is already on.
      const rotated = [...all.slice(at + 1), ...all.slice(0, at + 1)];
      const candidates = typed.length === 1 ? rotated : [...rotated.slice(-1), ...rotated];
      return (
        candidates.find((entry) =>
          (entry.trigger()?.textContent ?? "").trim().toLowerCase().startsWith(typed),
        ) ?? null
      );
    },
    switchTo: (to, focusStrategy) => {
      const next = entries.get(to);
      if (next === undefined || next.isDisabled()) return;
      const current = entries.get(value());
      if (current !== undefined && current !== next) {
        switching = true;
        current.state.close();
        // The open menu holds focus inside itself until it is gone, and would
        // take it straight back from the trigger focused below.
        flush();
        switching = false;
      }
      // Before the menu opens, so that is where its focus scope restores to.
      const trigger = next.trigger();
      if (trigger !== null) focusWithoutScrolling(trigger);
      next.state.open(focusStrategy);
    },
  };

  const elementProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      role: "menubar",
      "aria-label": () => props["aria-label"]?.(),
      "aria-labelledby": () => props["aria-labelledby"]?.(),
      "data-orientation": "horizontal",
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <div {...elementProps} ref={mergeRefs(props.ref?.())}>
      {provide(
        MenubarContext,
        () => bar,
        () => props.children as unknown,
      )}
    </div>
  );
}

export interface MenubarMenuComponentProps {
  /** What the bar's `value` is while this menu is open. Generated when left out. */
  value?: string;
  /**
   * Hold this one menu open or shut. The bar's `value` is the usual way to say
   * which menu is open; this is for a caller that only cares about one of them.
   */
  isOpen?: boolean;
  /** Start open, when the bar itself names no menu. */
  defaultOpen?: boolean;
  /**
   * Told when this menu opens or closes, however that came about: its own
   * trigger, a neighbour taking over, or the bar's `value` changing.
   */
  onOpenChange?: (isOpen: boolean) => void;
  children?: Child;
}

/** One menu of the bar: a `<MenubarTrigger>` and the `<Menu>` it opens. */
export function MenubarMenu(props: Incoming<MenubarMenuComponentProps>) {
  const bar = useMenubar();
  const value = props.value?.() ?? createUniqueId();
  const triggerRef = makeRef<HTMLElement>();
  const [isDisabled, setDisabled] = createSignal(false, { ownedWrite: true });

  const held = (): boolean | undefined => props.isOpen?.();
  const isCurrent = (): boolean => bar.value() === value;

  const state = menuTriggerState({
    isOpen: () => held() ?? isCurrent(),
    onOpenChange: (isOpen) => {
      // A held menu only asks: whoever holds it answers by changing `isOpen`.
      if (held() !== undefined) {
        props.onOpenChange?.()?.(isOpen);
        return;
      }
      if (isOpen) bar.setValue(value);
      else if (bar.value() === value) bar.setValue("");
    },
  });

  bar.register({ value, state, trigger: triggerRef, isDisabled });

  // After the tree has settled, because a component body may not write state.
  // Starting open is not a change, so it is not reported as one.
  let isDefaulting = false;
  if (untrack(() => props.defaultOpen?.()) === true) {
    onSettled(() => {
      if (untrack(bar.value) !== "") return;
      isDefaulting = true;
      bar.setValue(value);
    });
  }

  // The bar is what the arrow keys and the neighbours read, so a menu held
  // open from outside has to be the bar's open menu as well.
  createEffect(held, (isHeld) => {
    if (isHeld === true) bar.setValue(value);
    else if (isHeld === false && untrack(bar.value) === value) bar.setValue("");
  });

  createEffect(isCurrent, (now, before) => {
    if (before === undefined || before === now) return;
    if (isDefaulting) {
      isDefaulting = false;
      return;
    }
    untrack(() => props.onOpenChange?.())?.(now);
  });

  // Another menu taking over closes this one from outside, without going
  // through `close`, so the submenus it had open are forgotten here.
  createTrackedEffect(() => {
    if (bar.value() !== value && state.expandedKeys().length > 0) state.close();
  });

  const { menuTriggerProps, menuProps } = menuTrigger({ isDisabled }, state);

  const nextKey = (): string => (bar.direction() === "rtl" ? "ArrowLeft" : "ArrowRight");

  const trigger: MenuTriggerValue = {
    state,
    triggerRef,
    menuTriggerProps,
    menuProps,
    anchorRect: () => null,
    placement: "bottom start",
    offset: 8,
    onMenuKeyDown: (event, isSubmenu) => {
      if (event.defaultPrevented) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const forwards = event.key === nextKey();
      const item = targetElement(event)?.closest('[role^="menuitem"]') ?? null;
      // The arrow pointing at a submenu opens it, and the one pointing back at
      // a submenu's trigger closes it. Neither is the bar's.
      if (
        forwards &&
        item !== null &&
        item.hasAttribute("aria-haspopup") &&
        item.getAttribute("aria-disabled") !== "true"
      ) {
        return;
      }
      if (!forwards && isSubmenu) return;

      const to = bar.towards(value, forwards ? "next" : "previous");
      if (to === null || to.value === value) return;
      event.preventDefault();
      event.stopPropagation();
      bar.switchTo(to.value, "first");
    },
  };

  const menu: MenubarMenuValue = { value, trigger, setDisabled };

  return provide(
    MenubarMenuContext,
    () => menu,
    () => provideMenuTrigger(trigger, () => props.children),
  );
}

export interface MenubarTriggerOptions extends ButtonOptions {}

export interface MenubarTriggerResult {
  /** For the trigger's element: the ARIA, the roving `tabindex`, the handlers. */
  triggerProps: DOMProps;
  /**
   * For the same element. The menu is anchored to it and returns focus to it.
   *
   * Method syntax for the reason `TriggerSlot.ref` gives: the ref behind it is
   * an `HTMLElement`'s, and whoever takes this hands it their own element.
   */
  ref(this: void, element: Element | null): void;
  isOpen: Accessor<boolean>;
}

/**
 * The trigger of the enclosing {@link MenubarMenu}, for an element of the
 * caller's own.
 *
 * A `menuitem` of the bar, which is what makes a screen reader announce the
 * row as one menubar of N items rather than N unrelated buttons.
 */
export function menubarTrigger(options: MenubarTriggerOptions = {}): MenubarTriggerResult {
  const bar = useMenubar();
  const menu = getContext(MenubarMenuContext);
  if (menu === null || menu === undefined) {
    throw new Error("A MenubarTrigger must be rendered inside a MenubarMenu.");
  }
  const { value, trigger } = menu;
  const isDisabled = (): boolean => access(options.isDisabled) === true;

  createTrackedEffect(() => {
    menu.setDisabled(isDisabled());
  });

  /** With a menu open the arrows carry it along; with none they only move focus. */
  const focusOrSwitch = (to: MenubarEntry): void => {
    if (bar.value() !== "") {
      bar.switchTo(to.value, null);
      return;
    }
    const element = to.trigger();
    if (element !== null) focusWithoutScrolling(element);
  };

  const moveTo = (step: Step): boolean => {
    const to = bar.towards(value, step);
    if (to === null) return false;
    focusOrSwitch(to);
    return true;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    // Enter, Space and the vertical arrows are the menu trigger's, and it has
    // already taken them.
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const rtl = bar.direction() === "rtl";
    let handled = false;

    switch (event.key) {
      case "ArrowRight":
        handled = moveTo(rtl ? "previous" : "next");
        break;
      case "ArrowLeft":
        handled = moveTo(rtl ? "next" : "previous");
        break;
      case "Home":
        handled = moveTo("first");
        break;
      case "End":
        handled = moveTo("last");
        break;
      case "Escape":
        if (trigger.state.isOpen()) {
          trigger.state.close();
          handled = true;
        }
        break;
      default:
        if (event.key.length === 1 && event.key !== " ") {
          const to = bar.matching(value, event.key);
          if (to !== null) {
            focusOrSwitch(to);
            handled = true;
          }
        }
        break;
    }

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const buttonOptions: ButtonOptions = mergeProps({ ...options }, trigger.menuTriggerProps, {
    onKeyDown,
  });
  const { buttonProps, isPressed } = button(buttonOptions, trigger.triggerRef);

  const { hoverProps, isHovered } = hover({
    isDisabled,
    onHoverStart: () => {
      const open = bar.value();
      if (open !== "" && open !== value) bar.switchTo(value, null);
    },
  });
  const { focusProps, isFocused, isFocusVisible: showsRing } = focusRing();

  return {
    ref: trigger.triggerRef.set,
    isOpen: trigger.state.isOpen,
    triggerProps: mergeProps(
      buttonProps,
      { id: trigger.menuTriggerProps.id },
      hoverProps,
      focusProps,
      {
        role: "menuitem",
        // Roving: the bar is one Tab stop, and this is it or it is not.
        tabIndex: () => (bar.tabStop() === value ? 0 : -1),
        onFocus: () => bar.setTabStop(value),
        "data-pressed": isPressed,
        "data-hovered": isHovered,
        "data-focused": isFocused,
        "data-highlighted": isFocused,
        "data-focus-visible": showsRing,
        "data-disabled": isDisabled,
        "data-open": () => trigger.state.isOpen(),
        "data-state": () => (trigger.state.isOpen() ? "open" : "closed"),
      },
    ),
  };
}

export interface MenubarTriggerComponentProps extends StyleProps {
  children?: Child;
  isDisabled?: boolean;
  "aria-label"?: string;
  ref?: RefTarget<HTMLButtonElement>;
}

/** The button in the bar that opens the enclosing {@link MenubarMenu}. */
export function MenubarTrigger(props: Incoming<MenubarTriggerComponentProps>) {
  const options = fromProps(props);
  const { triggerProps, ref } = menubarTrigger(options);

  const elementProps = mergeProps(
    triggerProps,
    filterDOMProps(options, { global: true }),
    styleProps(props),
    { "data-testid": () => props["data-testid"]?.() },
  );

  return (
    <button {...elementProps} ref={mergeRefs(ref, props.ref?.())}>
      {props.children}
    </button>
  );
}
