/**
 * Tabs: one list of choices, one panel showing what was chosen.
 *
 * The tab list is ONE Tab stop. Inside it the arrow keys move between tabs and
 * Tab leaves for the panel, which is the whole reason the pattern exists: a
 * dozen tabs must not be a dozen stops between the user and the content.
 *
 * Two decisions have visible consequences and no obvious default:
 *
 * - **Automatic or manual activation.** Automatic selects as focus moves,
 *   which is right when switching is instant. Manual waits for Enter or
 *   Space, and is right when a tab loads something: arrowing through five tabs
 *   under automatic activation starts five loads the user did not ask for.
 * - **Whether the panel is a Tab stop.** It is one only when it holds nothing
 *   focusable. With a form inside, Tab should reach the first field; with
 *   prose inside, Tab has to reach the panel or a keyboard user cannot scroll
 *   it.
 *
 * `aria-controls` on the tab and `aria-labelledby` on the panel are the same
 * relationship stated from both ends, and assistive technology uses both.
 */

import {
  type Accessor,
  type Child,
  effect,
  For,
  context,
  getContext,
  getOwner,
  type Incoming,
  install,
  isServer,
  Show,
  signal,
  untrack,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import type { Collection, ItemAccessors, Key, Node } from "./collections.ts";
import {
  buildCollection,
  singleSelectListState,
  type SingleSelectListState,
} from "./collections.ts";
import { focusableWalker } from "./focus.ts";
import { focusRing } from "./focus.ts";
import { hover } from "./interactions/hover.ts";
import type { ElementRef } from "./interactions/press.ts";
import { useLocale } from "./i18n.ts";
import {
  selectableCollection,
  selectableItem,
  type Direction,
  type KeyboardDelegate,
  type Orientation,
} from "./selection.ts";
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
// State
// ---------------------------------------------------------------------------

export interface TabListStateOptions<T> extends ItemAccessors<T> {
  items?: MaybeAccessor<Iterable<T> | undefined>;
  selectedKey?: MaybeAccessor<Key | null | undefined>;
  defaultSelectedKey?: MaybeAccessor<Key | null | undefined>;
  disabledKeys?: MaybeAccessor<Iterable<Key> | undefined>;
  /** The whole tab list is unavailable, but still shows what is selected. */
  isDisabled?: MaybeAccessor<boolean | undefined>;
  onSelectionChange?: (key: Key) => void;
}

export interface TabListState<T> extends SingleSelectListState<T> {
  isDisabled: Accessor<boolean>;
}

/**
 * A tab list always has a selection.
 *
 * "Nothing selected" is not a state a tabbed interface can be in: the panel
 * would be empty and no tab would be in the Tab order. So the first enabled
 * tab is selected when nothing else is, including after the selected tab is
 * removed.
 */
export function tabListState<T>(options: TabListStateOptions<T>): TabListState<T> {
  const firstEnabled = (collection: Collection<T>, disabled: Set<Key>): Key | null => {
    let key = collection.getFirstKey();
    const last = collection.getLastKey();
    while (
      key !== null &&
      (disabled.has(key) || collection.getItem(key)?.props?.isDisabled === true) &&
      key !== last
    ) {
      key = collection.getKeyAfter(key);
    }
    // Every tab disabled: the first reads better than the last.
    if (
      key !== null &&
      (disabled.has(key) || collection.getItem(key)?.props?.isDisabled === true)
    ) {
      return collection.getFirstKey();
    }
    return key;
  };

  // Worked out BEFORE the state exists, not repaired afterwards: a default is
  // not a choice, and putting it in through the setter would report a
  // selection change the user never made.
  const state = singleSelectListState<T>({
    ...options,
    defaultSelectedKey: (): Key | null => {
      const declared = access(options.defaultSelectedKey);
      if (declared !== undefined && declared !== null) return declared;
      const collection = buildCollection(access(options.items) ?? [], options);
      return firstEnabled(collection, new Set(access(options.disabledKeys) ?? []));
    },
    onSelectionChange: (key) => {
      if (key !== null) options.onSelectionChange?.(key);
    },
  });

  if (!isServer) {
    // The selected tab going away IS a change, so this one reports.
    effect(() => {
      const collection = state.collection();
      const selected = state.selectedKey();
      if (access(options.selectedKey) !== undefined && access(options.selectedKey) !== null) return;
      if (selected !== null && collection.getItem(selected) !== null) return;

      const next = firstEnabled(collection, state.disabledKeys());
      if (next !== null) state.setSelectedKey(next);
    });

    // The roving tabindex starts on the selected tab, so tabbing in reaches
    // what is showing rather than the first tab in the list.
    effect(() => {
      const manager = state.selectionManager();
      const selected = state.selectedKey();
      if (selected === null || manager.isFocused) return;
      if (manager.focusedKey === selected) return;
      manager.setFocusedKey(selected);
    });
  }

  return { ...state, isDisabled: () => access(options.isDisabled) === true };
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export interface TabsKeyboardDelegateOptions {
  collection: Accessor<Collection<unknown>>;
  disabledKeys?: Accessor<Set<Key>>;
  orientation?: MaybeAccessor<Orientation | undefined>;
  direction?: MaybeAccessor<Direction | undefined>;
}

/**
 * Navigation within a tab list: along the list, and wrapping.
 *
 * Left and right follow the WRITING direction whatever the orientation, so an
 * RTL user's Left moves to the next tab; up and down follow the list and are
 * never flipped. A vertical list answers nothing for left and right, and a
 * horizontal one nothing for up and down, so the arrows that mean nothing here
 * keep bubbling to whatever they do mean something to.
 */
export class TabsKeyboardDelegate implements KeyboardDelegate {
  #options: TabsKeyboardDelegateOptions;

  constructor(options: TabsKeyboardDelegateOptions) {
    this.#options = options;
  }

  get #collection(): Collection<unknown> {
    return this.#options.collection();
  }

  get #horizontal(): boolean {
    return (access(this.#options.orientation) ?? "horizontal") === "horizontal";
  }

  get #flipped(): boolean {
    return (access(this.#options.direction) ?? "ltr") === "rtl";
  }

  #isDisabled(key: Key): boolean {
    if (this.#options.disabledKeys?.().has(key) === true) return true;
    return this.#collection.getItem(key)?.props?.isDisabled === true;
  }

  getKeyLeftOf(key: Key): Key | null {
    return this.#flipped ? this.getKeyAfter(key) : this.getKeyBefore(key);
  }

  getKeyRightOf(key: Key): Key | null {
    return this.#flipped ? this.getKeyBefore(key) : this.getKeyAfter(key);
  }

  getKeyAbove(key: Key): Key | null {
    return this.#horizontal ? null : this.getKeyBefore(key);
  }

  getKeyBelow(key: Key): Key | null {
    return this.#horizontal ? null : this.getKeyAfter(key);
  }

  getFirstKey(): Key | null {
    const key = this.#collection.getFirstKey();
    if (key !== null && this.#isDisabled(key)) return this.getKeyAfter(key);
    return key;
  }

  getLastKey(): Key | null {
    const key = this.#collection.getLastKey();
    if (key !== null && this.#isDisabled(key)) return this.getKeyBefore(key);
    return key;
  }

  getKeyAfter(from: Key): Key | null {
    let key: Key | null = from;
    do {
      key = this.#collection.getKeyAfter(key);
      if (key === null) key = this.#collection.getFirstKey();
    } while (key !== null && this.#isDisabled(key) && key !== from);
    return key;
  }

  getKeyBefore(from: Key): Key | null {
    let key: Key | null = from;
    do {
      key = this.#collection.getKeyBefore(key);
      if (key === null) key = this.#collection.getLastKey();
    } while (key !== null && this.#isDisabled(key) && key !== from);
    return key;
  }
}

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

/**
 * The ids a tab and its panel point at each other with.
 *
 * Derived from the key rather than generated per element, because each end
 * names the other before the other exists.
 */
function partId(base: string, key: Key | null, part: "tab" | "tabpanel"): string {
  return `${base}-${part}-${key === null ? "none" : String(key)}`;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface TabListOptions {
  ref: ElementRef;
  /** @default "horizontal" */
  orientation?: MaybeAccessor<Orientation | undefined>;
  /** Select as focus moves, or wait for Enter. @default "automatic" */
  keyboardActivation?: MaybeAccessor<"automatic" | "manual" | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
}

export interface TabListResult {
  tabListProps: DOMProps;
  /** The base every tab and panel id in this group is derived from. */
  baseId: Accessor<string>;
}

export function tabList(options: TabListOptions, state: TabListState<unknown>): TabListResult {
  const locale = useLocale();
  const baseId = id();

  const delegate = new TabsKeyboardDelegate({
    collection: state.collection,
    disabledKeys: state.disabledKeys,
    orientation: options.orientation,
    direction: () => locale().direction,
  });

  const { collectionProps } = selectableCollection({
    ref: options.ref,
    selectionManager: state.selectionManager,
    keyboardDelegate: delegate,
    selectOnFocus: () => (access(options.keyboardActivation) ?? "automatic") === "automatic",
    disallowEmptySelection: true,
    scrollRef: options.ref,
    linkBehavior: "selection",
  });

  return {
    baseId,
    tabListProps: mergeProps(filterDOMProps(options, { labelable: true }), collectionProps, {
      role: "tablist",
      "aria-orientation": () => access(options.orientation) ?? "horizontal",
      // The tabs carry the roving tabindex; the list itself is never the stop.
      tabIndex: () => undefined,
    }),
  };
}

export interface TabOptions {
  key: Key;
  ref: ElementRef;
  baseId: MaybeAccessor<string>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  /** @default false, unless the tab is a link */
  shouldSelectOnPressUp?: MaybeAccessor<boolean | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
}

export interface TabResult {
  tabProps: DOMProps;
  isSelected: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
  isPressed: Accessor<boolean>;
  isFocused: Accessor<boolean>;
}

export function tab(options: TabOptions, state: TabListState<unknown>): TabResult {
  const node = (): Node<unknown> | null => state.collection().getItem(options.key);

  const isDisabled = (): boolean =>
    access(options.isDisabled) === true ||
    state.isDisabled() ||
    state.selectionManager().isDisabled(options.key);

  const item = selectableItem({
    key: options.key,
    ref: options.ref,
    id: () => partId(access(options.baseId), options.key, "tab"),
    selectionManager: state.selectionManager,
    isDisabled,
    // A tab that is a link navigates, and a browser navigates on release: a
    // press that began here and ended elsewhere is not a navigation.
    shouldSelectOnPressUp: () =>
      access(options.shouldSelectOnPressUp) ?? node()?.props?.href !== undefined,
    linkBehavior: "selection",
  });

  const isSelected = (): boolean => state.selectedKey() === options.key;

  return {
    isSelected,
    isDisabled,
    isPressed: item.isPressed,
    isFocused: item.isFocused,
    tabProps: mergeProps(item.itemProps, {
      role: "tab",
      "aria-selected": isSelected,
      "aria-disabled": () => isDisabled() || undefined,
      // Only the SELECTED tab controls a panel: the others control nothing
      // that is on the page, and pointing at an absent element is worse than
      // pointing at nothing.
      "aria-controls": () =>
        isSelected() ? partId(access(options.baseId), options.key, "tabpanel") : undefined,
      "aria-label": () => access(options["aria-label"]) ?? node()?.["aria-label"],
      // `disabled` would take the tab out of the Tab order and out of the
      // arrow-key walk, and a disabled tab still has to be reachable to be
      // announced as disabled.
      disabled: () => undefined,
    }),
  };
}

export interface TabPanelOptions {
  ref: ElementRef;
  baseId: MaybeAccessor<string>;
  /** Which tab's panel this is. @default the selected one */
  key?: MaybeAccessor<Key | null | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
}

export interface TabPanelResult {
  tabPanelProps: DOMProps;
}

export function tabPanel(options: TabPanelOptions, state: TabListState<unknown>): TabPanelResult {
  const key = (): Key | null => access(options.key) ?? state.selectedKey();
  const focusable = hasTabbableChild(options.ref, key);

  return {
    tabPanelProps: mergeProps(filterDOMProps(options, { labelable: true }), {
      role: "tabpanel",
      id: () => partId(access(options.baseId), key(), "tabpanel"),
      "aria-labelledby": () =>
        access(options["aria-label"]) === undefined
          ? partId(access(options.baseId), key(), "tab")
          : undefined,
      "aria-describedby": () => access(options["aria-describedby"]),
      // A panel with something focusable inside is not a stop of its own: Tab
      // from the tab list should reach the first field, not the container
      // around it. A panel of prose has nothing else to receive focus, and a
      // keyboard user needs somewhere to stand to scroll it.
      tabIndex: () => (focusable() ? undefined : 0),
    }),
  };
}

/**
 * Whether the element holds anything the browser would stop at.
 *
 * Answered after the children exist and again whenever they are replaced,
 * because the answer is about the content and the content is what changes.
 */
function hasTabbableChild(ref: ElementRef, key: () => Key | null): Accessor<boolean> {
  const found = signal(false);
  if (isServer) return found;

  effect(() => {
    // Read, so swapping the panel's contents re-asks.
    key();
    const element = access(ref) as Element | null;
    if (element === null) {
      found.set(false);
      return;
    }
    found.set(focusableWalker(element, { tabbable: true }).nextNode() !== null);
  });

  return found;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface TabsContextValue {
  state: TabListState<unknown>;
  baseId: Accessor<string>;
  orientation: Accessor<Orientation>;
  keyboardActivation: Accessor<"automatic" | "manual">;
}

const TabsContext = context<TabsContextValue | null>(null);
const TabNodeContext = context<Node<unknown> | null>(null);

export function useTabs(): TabsContextValue {
  const value = getContext(TabsContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a Tabs.");
  }
  return value;
}

/** The collection node the enclosing tab is for. */
export function useTabNode(): Node<unknown> {
  const node = getContext(TabNodeContext);
  if (node === null || node === undefined) {
    throw new Error("A Tab must be rendered inside a TabList's item callback.");
  }
  return node;
}

export interface TabsComponentProps<T> extends StyleProps, ItemAccessors<T> {
  /** The tabs, in order. */
  items: Iterable<T>;
  children?: Child;
  selectedKey?: Key;
  defaultSelectedKey?: Key;
  disabledKeys?: Iterable<Key>;
  isDisabled?: boolean;
  /** @default "horizontal" */
  orientation?: Orientation;
  /** @default "automatic" */
  keyboardActivation?: "automatic" | "manual";
  onSelectionChange?: (key: Key) => void;
}

/**
 * ```tsx
 * <Tabs items={sections()} onSelectionChange={(key) => open.set(key)}>
 *   <TabList aria-label="Sections">{(s) => <Tab>{s.name}</Tab>}</TabList>
 *   <TabPanel>{(s) => <p>{s.body}</p>}</TabPanel>
 * </Tabs>
 * ```
 *
 * One `<TabPanel>`, not one per tab: only the selected panel is ever on the
 * page, so the element is the same element throughout and its id and its
 * labelling follow the selection.
 */
export function Tabs<T>(props: Incoming<TabsComponentProps<T>>) {
  const options = fromProps(props as unknown as Incoming<Record<string, unknown>>);
  const state = tabListState<T>({
    ...(options as TabListStateOptions<T>),
    onSelectionChange: (key) => props.onSelectionChange?.()?.(key),
  });

  const baseId = id();
  const owner = getOwner();
  if (owner !== null) {
    const value: TabsContextValue = {
      state: state,
      baseId,
      orientation: () => props.orientation?.() ?? "horizontal",
      keyboardActivation: () => props.keyboardActivation?.() ?? "automatic",
    };
    install(owner, TabsContext, () => value);
  }

  const elementProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "data-orientation": () => props.orientation?.() ?? "horizontal",
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return <div {...elementProps}>{props.children}</div>;
}

export interface TabListComponentProps<T> extends StyleProps {
  /** How one tab renders. Return a `<Tab>`. */
  children: (item: T) => Child;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLDivElement>;
}

export function TabList<T>(props: Incoming<TabListComponentProps<T>>) {
  const domRef = makeRef<HTMLDivElement>();
  const tabs = useTabs();

  const { tabListProps } = tabList(
    {
      ref: domRef,
      orientation: tabs.orientation,
      keyboardActivation: tabs.keyboardActivation,
      "aria-label": () => props["aria-label"]?.(),
      "aria-labelledby": () => props["aria-labelledby"]?.(),
    },
    tabs.state,
  );

  const elementProps = mergeProps(
    tabListProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "data-orientation": tabs.orientation,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  const render = props.children as unknown as (scope: unknown, item: T) => Child;

  return (
    <div {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
      <For each={() => [...tabs.state.collection()]}>
        {(node: Node<unknown>) => {
          const rowOwner = getOwner();
          if (rowOwner !== null) install(rowOwner, TabNodeContext, () => node);
          return render(rowOwner, node.value as T);
        }}
      </For>
    </div>
  );
}

export interface TabComponentProps extends StyleProps {
  children?: Child;
  "aria-label"?: string;
  ref?: RefTarget<HTMLButtonElement>;
}

/**
 * One tab. Its key and disabled state come from the collection node the
 * enclosing {@link TabList} is rendering.
 */
export function Tab(props: Incoming<TabComponentProps>) {
  const domRef = makeRef<HTMLButtonElement>();
  const tabs = useTabs();
  const node = useTabNode();

  const { tabProps, isSelected, isDisabled, isPressed, isFocused } = tab(
    {
      key: node.key,
      ref: domRef,
      baseId: tabs.baseId,
      "aria-label": () => props["aria-label"]?.(),
      isDisabled: () => node.props?.isDisabled === true,
    },
    tabs.state,
  );

  const { hoverProps, isHovered } = hover({ isDisabled });
  const { focusProps, isFocusVisible } = focusRing();

  const elementProps = mergeProps(
    tabProps,
    hoverProps,
    focusProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      type: "button",
      "data-selected": isSelected,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-disabled": isDisabled,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <button {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
      {props.children}
    </button>
  );
}

export interface TabPanelComponentProps<T> extends StyleProps {
  /** What the selected tab shows. Given the selected item. */
  children: ((item: T) => Child) | Child;
  "aria-label"?: string;
  ref?: RefTarget<HTMLDivElement>;
}

export function TabPanel<T>(props: Incoming<TabPanelComponentProps<T>>) {
  const domRef = makeRef<HTMLDivElement>();
  const tabs = useTabs();

  const { tabPanelProps } = tabPanel(
    {
      ref: domRef,
      baseId: tabs.baseId,
      "aria-label": () => props["aria-label"]?.(),
    },
    tabs.state,
  );

  const elementProps = mergeProps(
    tabPanelProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  // The children are a Block, and a Block that closes over the selected item
  // has to be REBUILT when the selection changes rather than re-read. `Show`
  // keyed on the selected key is what rebuilds it, and only then: the panel
  // is one element throughout, and only its contents are swapped.
  const renderPanel = props.children as unknown as (scope: unknown, item: T | undefined) => Child;

  return (
    <div {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
      <Show when={tabs.state.selectedKey()} keyed>
        {(scope: unknown) => {
          const selected = untrack(() => tabs.state.selectedItem());
          return renderPanel(scope, selected === null ? undefined : (selected.value as T));
        }}
      </Show>
    </div>
  );
}
