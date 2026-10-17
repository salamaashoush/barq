/**
 * A set of toggle buttons that is one control.
 *
 * Two halves, and they are separable on purpose.
 *
 * - **What is pressed.** `single` keeps at most one and `multiple` any number.
 *   A single group is NOT a radio group: pressing the pressed item releases it,
 *   which a radio cannot do, so the items stay `aria-pressed` buttons rather
 *   than becoming `role="radio"` and promising a choice that cannot be undone.
 * - **Where Tab lands.** One item is in the tab order and the arrows move among
 *   the rest, the bargain a toolbar makes. The stop is the item focus was last
 *   on; before that, the first pressed item, so Tab returns to what is chosen;
 *   before that, the first one that is not disabled.
 *
 *   Inside a toolbar the group gives that up. The toolbar is already one tab
 *   stop with arrows of its own, and two handlers on one key would move focus
 *   twice or trap it in the group.
 *
 * The order the arrows walk is the DOCUMENT's, read when a key arrives. The
 * order items registered in is only the answer until the elements exist, which
 * is what a server render and the first paint need.
 */

import { type Accessor, createSignal, createEffect } from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { tryCleanup } from "@barqjs/primitives/utils";
import { contains, focusWithoutScrolling, targetElement } from "./dom.ts";
import { type ReadingDirection, useDirection } from "./i18n.ts";
import type { ElementRef } from "./interactions/press.ts";
import type { Orientation } from "./selection.ts";
import {
  access,
  controllable,
  type DOMProps,
  filterDOMProps,
  type MaybeAccessor,
  mergeProps,
} from "./utils.ts";

export type ToggleGroupSelectionMode = "single" | "multiple";

export interface ToggleGroupStateOptions {
  /** @default "single" */
  selectionMode?: MaybeAccessor<ToggleGroupSelectionMode | undefined>;
  selectedKeys?: MaybeAccessor<readonly string[] | undefined>;
  defaultSelectedKeys?: MaybeAccessor<readonly string[] | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  /**
   * One tab stop for the whole group. Off, every item is a stop of its own and
   * the arrows are left alone, which is what a group inside a toolbar wants:
   * the toolbar is already roving.
   *
   * @default true
   */
  rovingFocus?: MaybeAccessor<boolean | undefined>;
  onSelectionChange?: (keys: string[]) => void;
}

export interface ToggleGroupItemRecord {
  element: Accessor<Element | null>;
  isDisabled: Accessor<boolean>;
}

export interface ToggleGroupState {
  selectionMode: Accessor<ToggleGroupSelectionMode>;
  selectedKeys: Accessor<readonly string[]>;
  isSelected(key: string): boolean;
  setSelected(key: string, isSelected: boolean): void;
  toggle(key: string): void;
  isDisabled: Accessor<boolean>;
  isRoving: Accessor<boolean>;
  /** Told by the group's element whether something outside it is roving already. */
  setYielding(isYielding: boolean): void;
  /** The one item in the tab order, or `null` when none can be. */
  tabStop: Accessor<string | null>;
  setFocusedKey(key: string | null): void;
  /** Adds an item, and returns what removes it. */
  register(key: string, record: ToggleGroupItemRecord): () => void;
  /** The key whose element holds `target`, if one does. */
  keyOf(target: Element | null): string | null;
  /** Every item that can take focus, in document order. */
  focusableItems(): HTMLElement[];
}

function inDocumentOrder(a: Element, b: Element): number {
  const position = a.compareDocumentPosition(b);
  if ((position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) return -1;
  if ((position & Node.DOCUMENT_POSITION_PRECEDING) !== 0) return 1;
  return 0;
}

export function toggleGroupState(options: ToggleGroupStateOptions = {}): ToggleGroupState {
  const selectionMode = (): ToggleGroupSelectionMode => access(options.selectionMode) ?? "single";
  const isDisabled = (): boolean => access(options.isDisabled) === true;
  const [isYielding, setYielding] = createSignal(false);
  const isRoving = (): boolean => access(options.rovingFocus) !== false && !isYielding();

  const [selectedKeys, setSelectedKeys] = controllable<readonly string[]>(
    () => access(options.selectedKeys),
    () => access(options.defaultSelectedKeys) ?? [],
    (keys) => options.onSelectionChange?.([...keys]),
  );

  const records = new Map<string, ToggleGroupItemRecord>();
  // Kept beside the signal that announces it: a write is staged until the next
  // flush, and a server render reads the order as each item is built.
  //
  // `ownedWrite`: an item registers from its own component body, which is the
  // only place it knows its value.
  let keys: readonly string[] = [];
  const [version, bump] = createSignal(0, { equals: false, ownedWrite: true });
  const order = (): readonly string[] => {
    version();
    return keys;
  };
  const setOrder = (next: readonly string[]): void => {
    keys = next;
    bump(0);
  };
  const [focusedKey, setFocusedKey] = createSignal<string | null>(null);

  const usable = (key: string): boolean => records.get(key)?.isDisabled() !== true;

  if (!isServer) {
    createEffect(
      () => {
        const current = order();
        return { current, elements: current.map((key) => records.get(key)?.element() ?? null) };
      },
      ({ current, elements }) => {
        const placed: { key: string; element: Element }[] = [];
        for (const [index, key] of current.entries()) {
          const element = elements[index] ?? null;
          // Not all built yet, or not in one tree yet: the registration order
          // stands until they are, and each ref landing runs this again.
          if (element === null || !element.isConnected) return;
          placed.push({ key, element });
        }
        const sorted = placed
          .toSorted((a, b) => inDocumentOrder(a.element, b.element))
          .map((each) => each.key);
        if (sorted.some((key, index) => key !== current[index])) setOrder(sorted);
      },
    );
  }

  const setSelected = (key: string, next: boolean): void => {
    if (isDisabled()) return;
    const held = selectedKeys();
    const has = held.includes(key);
    if (has === next) return;
    if (!next) setSelectedKeys(held.filter((each) => each !== key));
    else if (selectionMode() === "multiple") setSelectedKeys([...held, key]);
    else setSelectedKeys([key]);
  };

  return {
    selectionMode,
    selectedKeys,
    isSelected: (key) => selectedKeys().includes(key),
    setSelected,
    toggle: (key) => setSelected(key, !selectedKeys().includes(key)),
    isDisabled,
    isRoving,
    setYielding,
    tabStop() {
      const current = order();
      if (isDisabled()) return null;
      const focused = focusedKey();
      if (focused !== null && current.includes(focused) && usable(focused)) return focused;
      const selected = selectedKeys();
      return (
        current.find((key) => selected.includes(key) && usable(key)) ??
        current.find((key) => usable(key)) ??
        null
      );
    },
    setFocusedKey,
    register(key, record) {
      records.set(key, record);
      if (!keys.includes(key)) setOrder([...keys, key]);
      return () => {
        if (records.get(key) !== record) return;
        records.delete(key);
        setOrder(keys.filter((each) => each !== key));
      };
    },
    keyOf(target) {
      if (target === null) return null;
      for (const [key, record] of records) {
        if (contains(record.element(), target)) return key;
      }
      return null;
    },
    focusableItems() {
      const elements: HTMLElement[] = [];
      for (const [key, record] of records) {
        const element = record.element();
        if (element instanceof HTMLElement && usable(key) && !isDisabled()) elements.push(element);
      }
      return elements.toSorted(inDocumentOrder);
    },
  };
}

export interface ToggleGroupOptions {
  /** The group's element. With it, a group inside a toolbar leaves the arrows to the toolbar. */
  ref?: ElementRef;
  /**
   * Which arrows move focus. Unset, all four do: a group that has not said
   * which way it runs should not make the user guess.
   */
  orientation?: MaybeAccessor<Orientation | undefined>;
  /** Overrides the direction in scope, which is what flips left and right. */
  direction?: MaybeAccessor<ReadingDirection | undefined>;
  /** Whether focus goes round from the last item to the first. @default true */
  loop?: MaybeAccessor<boolean | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
}

export interface ToggleGroupResult {
  groupProps: DOMProps;
}

type Intent = "first" | "last" | "previous" | "next";

/**
 * The group's element: its role, its name, and the keys that move focus.
 *
 * ```tsx
 * const state = toggleGroupState({ selectionMode: "multiple" });
 * const { groupProps } = toggleGroup({ "aria-label": "Formatting" }, state);
 * <div {...groupProps}>…</div>
 * ```
 */
export function toggleGroup(
  options: ToggleGroupOptions,
  state: ToggleGroupState,
): ToggleGroupResult {
  const scoped = useDirection();
  const direction = (): ReadingDirection => access(options.direction) ?? scoped();

  if (!isServer && options.ref !== undefined) {
    const { ref } = options;
    createEffect(
      () => access(ref),
      (element) => {
        const outer = element?.parentElement?.closest('[role="toolbar"]');
        state.setYielding(outer !== null && outer !== undefined);
      },
    );
  }

  const intentOf = (key: string): Intent | null => {
    if (key === "Home") return "first";
    if (key === "End") return "last";
    const orientation = access(options.orientation);
    if (orientation !== "horizontal") {
      if (key === "ArrowUp") return "previous";
      if (key === "ArrowDown") return "next";
    }
    if (orientation !== "vertical") {
      // Left and right follow the WRITING direction; up and down never do.
      const back = direction() === "rtl" ? "ArrowRight" : "ArrowLeft";
      const on = direction() === "rtl" ? "ArrowLeft" : "ArrowRight";
      if (key === back) return "previous";
      if (key === on) return "next";
    }
    return null;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!state.isRoving()) return;
    // With a modifier these are the browser's or the page's: Alt+Left is back.
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    // A key from something an item CONTAINS or opened is not the group's.
    const from = state.keyOf(targetElement(event));
    if (from === null) return;
    const intent = intentOf(event.key);
    if (intent === null) return;

    const items = state.focusableItems();
    if (items.length === 0) return;
    const at = items.findIndex((each) => contains(each, targetElement(event)));
    const wrap = access(options.loop) !== false;
    const last = items.length - 1;

    let to: number;
    if (intent === "first") to = 0;
    else if (intent === "last") to = last;
    else if (intent === "next") to = at >= last ? (wrap ? 0 : last) : at + 1;
    else to = at <= 0 ? (wrap ? last : 0) : at - 1;

    // An outer toolbar must not move focus a second time for one key.
    event.stopPropagation();
    event.preventDefault();
    const target = items[to];
    if (target !== undefined && to !== at) focusWithoutScrolling(target);
  };

  const onFocusIn = (event: FocusEvent): void => {
    const key = state.keyOf(targetElement(event));
    if (key !== null) state.setFocusedKey(key);
  };

  return {
    groupProps: mergeProps(filterDOMProps(options, { labelable: true }), {
      role: "group",
      dir: () => access(options.direction),
      "aria-disabled": () => state.isDisabled() || undefined,
      onKeyDown,
      onFocusIn,
    }),
  };
}

export interface ToggleGroupItemOptions {
  /** What this item contributes to the group's value. */
  value: MaybeAccessor<string>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  ref: ElementRef;
}

export interface ToggleGroupItemResult {
  /** For a `toggleButton` or a `<ToggleButton>`: its state belongs to the group. */
  isSelected: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
  excludeFromTabOrder: Accessor<boolean>;
  onChange(isSelected: boolean): void;
}

/**
 * One item's half: what a toggle button has to be told to belong to a group.
 *
 * ```tsx
 * const domRef = ref<HTMLButtonElement>();
 * const item = toggleGroupItem({ value: "bold", ref: domRef }, state);
 * <ToggleButton {...item} ref={domRef.set}>Bold</ToggleButton>
 * ```
 */
export function toggleGroupItem(
  options: ToggleGroupItemOptions,
  state: ToggleGroupState,
): ToggleGroupItemResult {
  const value = (): string => access(options.value);
  const isDisabled = (): boolean => state.isDisabled() || access(options.isDisabled) === true;

  // While the component is built rather than in an effect: a server render
  // runs no effects, and its markup has to name the tab stop too.
  tryCleanup(
    state.register(value(), {
      element: () => access(options.ref) ?? null,
      isDisabled: () => access(options.isDisabled) === true,
    }),
  );

  return {
    isSelected: () => state.isSelected(value()),
    isDisabled,
    excludeFromTabOrder: () => state.isRoving() && state.tabStop() !== value(),
    onChange: (next) => state.setSelected(value(), next),
  };
}
