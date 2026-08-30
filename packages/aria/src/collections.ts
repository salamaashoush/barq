/**
 * The collection: what a listbox, menu, select, tab list or tree is a view of.
 *
 * A widget cannot answer "what is after this item" from the DOM. The next
 * option may be in another section, may be disabled and therefore skipped, may
 * not be rendered at all because the list is virtualised, and in a tree may be
 * a child rather than a sibling. So the structure is modelled separately from
 * what is rendered, and the rendering follows it.
 *
 * This is DATA-DRIVEN, where react-aria's equivalent is built by rendering the
 * children and collecting what they declare. A framework whose components run
 * once and whose children are lazy Blocks makes that dance unnecessary: the
 * items are already a value, so the collection is derived from them directly
 * and rebuilt only when they change.
 *
 * ```tsx
 * const state = listState({
 *   items: () => fruits(),
 *   selectionMode: "multiple",
 *   onSelectionChange: (keys) => selected.set(keys),
 * });
 * ```
 */

import { type Accessor, computed, signal } from "@barqjs/core";
import { access, callback, controllable, type MaybeAccessor } from "./utils.ts";

/** What identifies an item. */
export type Key = string | number;

export type SelectionMode = "none" | "single" | "multiple";

/**
 * How a pointer press changes the selection.
 *
 * `toggle` adds and removes, as a list of checkboxes does. `replace` selects
 * only what was pressed unless a modifier is held, as a file manager does.
 */
export type SelectionBehavior = "toggle" | "replace";

/** Whether a disabled key is merely unselectable, or inert entirely. */
export type DisabledBehavior = "selection" | "all";

/** Which end of a newly focused item's children should take focus. */
export type FocusStrategy = "first" | "last";

export interface Node<T> {
  type: "item" | "section" | "separator" | "loader";
  key: Key;
  /** The value the item was built from. */
  value: T | null;
  /** What a typeahead matches against, and what a screen reader reads. */
  textValue: string;
  "aria-label"?: string | undefined;
  /** Nesting depth, for a tree. */
  level: number;
  /** Position among its siblings, counting items only. */
  index: number;
  parentKey?: Key | undefined;
  prevKey?: Key | undefined;
  nextKey?: Key | undefined;
  hasChildNodes: boolean;
  childNodes: Node<T>[];
  /** Per-item options: `isDisabled`, `href`, and anything a widget adds. */
  props: Record<string, unknown>;
}

export interface Collection<T> extends Iterable<Node<T>> {
  /** How many items and sections there are. */
  readonly size: number;
  getKeys(): Iterable<Key>;
  getItem(key: Key): Node<T> | null;
  getKeyBefore(key: Key): Key | null;
  getKeyAfter(key: Key): Key | null;
  getFirstKey(): Key | null;
  getLastKey(): Key | null;
  getChildren(key: Key): Iterable<Node<T>>;
  at(index: number): Node<T> | null;
}

/**
 * A flat collection, with sections one level deep.
 *
 * Keys are linked in document order across section boundaries, which is what
 * makes Down from the last item of one section reach the first of the next.
 */
export class ListCollection<T> implements Collection<T> {
  #keyMap = new Map<Key, Node<T>>();
  #iterable: Iterable<Node<T>>;
  #firstKey: Key | null = null;
  #lastKey: Key | null = null;
  #size = 0;

  constructor(nodes: Iterable<Node<T>>) {
    this.#iterable = nodes;

    const visit = (node: Node<T>): void => {
      this.#keyMap.set(node.key, node);
      if (node.type === "section") {
        for (const child of node.childNodes) visit(child);
      }
    };
    for (const node of nodes) visit(node);

    let previous: Node<T> | null = null;
    let index = 0;
    for (const [key, node] of this.#keyMap) {
      if (previous !== null) {
        previous.nextKey = key;
        node.prevKey = previous.key;
      } else {
        this.#firstKey = key;
        node.prevKey = undefined;
      }

      if (node.type === "item") node.index = index++;
      // Loaders and separators do not count towards emptiness.
      if (node.type === "section" || node.type === "item") this.#size++;

      previous = node;
      previous.nextKey = undefined;
    }

    this.#lastKey = previous?.key ?? null;
  }

  *[Symbol.iterator](): IterableIterator<Node<T>> {
    yield* this.#iterable;
  }

  get size(): number {
    return this.#size;
  }

  getKeys(): IterableIterator<Key> {
    return this.#keyMap.keys();
  }

  getItem(key: Key): Node<T> | null {
    return this.#keyMap.get(key) ?? null;
  }

  getKeyBefore(key: Key): Key | null {
    return this.#keyMap.get(key)?.prevKey ?? null;
  }

  getKeyAfter(key: Key): Key | null {
    return this.#keyMap.get(key)?.nextKey ?? null;
  }

  getFirstKey(): Key | null {
    return this.#firstKey;
  }

  getLastKey(): Key | null {
    return this.#lastKey;
  }

  getChildren(key: Key): Iterable<Node<T>> {
    return this.#keyMap.get(key)?.childNodes ?? [];
  }

  at(index: number): Node<T> | null {
    const keys = [...this.getKeys()];
    const key = keys[index];
    return key === undefined ? null : this.getItem(key);
  }

  /** A collection of only the items whose text matches. */
  filter(match: (textValue: string, node: Node<T>) => boolean): ListCollection<T> {
    const kept: Node<T>[] = [];
    for (const node of this.#iterable) {
      if (node.type === "section") {
        const children = node.childNodes.filter((child) => match(child.textValue, child));
        if (children.length > 0) kept.push({ ...node, childNodes: children });
      } else if (node.type !== "item" || match(node.textValue, node)) {
        kept.push({ ...node });
      }
    }
    return new ListCollection(kept);
  }
}

// ---------------------------------------------------------------------------
// Building a collection from items
// ---------------------------------------------------------------------------

/** How to read one item. Every accessor has a conventional default. */
export interface ItemAccessors<T> {
  /** @default `item.id ?? item.key` */
  getKey?: (item: T, index: number) => Key;
  /** @default `item.textValue ?? item.label ?? item.name ?? String(item)` */
  getTextValue?: (item: T) => string;
  /** The children of a section or a tree node. @default `item.children` */
  getChildren?: (item: T) => Iterable<T> | undefined;
  /** @default `"section"` when the item has children, `"item"` otherwise */
  getType?: (item: T) => Node<T>["type"];
  /** Extra per-item options: `isDisabled`, `href`. @default the item itself */
  getProps?: (item: T) => Record<string, unknown>;
}

function defaultKey(item: unknown, index: number): Key {
  const record = item as Record<string, unknown>;
  const id = record?.id ?? record?.key;
  if (typeof id === "string" || typeof id === "number") return id;
  return index;
}

function defaultTextValue(item: unknown): string {
  const record = item as Record<string, unknown>;
  const text = record?.textValue ?? record?.label ?? record?.name ?? record?.title;
  return typeof text === "string" ? text : String(item);
}

function defaultChildren<T>(item: T): Iterable<T> | undefined {
  const children = (item as unknown as Record<string, unknown>)?.children;
  return Array.isArray(children) ? (children as T[]) : undefined;
}

/**
 * A collection from a list of values.
 *
 * An item with children becomes a section (or a tree node); everything else is
 * an item. `level` and `parentKey` come out of the nesting, so a keyboard
 * delegate can move between siblings and into children without the caller
 * describing the shape twice.
 */
export function buildCollection<T>(
  items: Iterable<T>,
  accessors: ItemAccessors<T> = {},
): ListCollection<T> {
  // Every accessor may arrive as a Cell around the callback; see `callback`.
  const getKey = callback(accessors.getKey) ?? defaultKey;
  const getTextValue = callback(accessors.getTextValue) ?? defaultTextValue;
  const getChildren = callback(accessors.getChildren) ?? defaultChildren;
  const getType = callback(accessors.getType);
  const getProps = callback(accessors.getProps);

  const build = (source: Iterable<T>, level: number, parentKey: Key | undefined): Node<T>[] => {
    const nodes: Node<T>[] = [];
    let index = 0;

    for (const item of source) {
      const key = getKey(item, index);
      const children = getChildren(item);
      const childNodes = children === undefined ? [] : build(children, level + 1, key);
      const props =
        getProps === undefined ? ((item ?? {}) as Record<string, unknown>) : getProps(item);
      const type = getType?.(item) ?? (childNodes.length > 0 ? "section" : "item");

      nodes.push({
        type,
        key,
        value: item,
        textValue: getTextValue(item),
        "aria-label": props["aria-label"] as string | undefined,
        level,
        index,
        parentKey,
        hasChildNodes: childNodes.length > 0,
        childNodes,
        props,
      });
      index++;
    }

    return nodes;
  };

  return new ListCollection(build(items, 0, undefined));
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * The selected keys, plus where a range selection started and ended.
 *
 * Shift-clicking needs both: the anchor is where the range began, and the
 * current key is where it reached, so extending it again can un-select what
 * the previous extension covered.
 */
export class Selection extends Set<Key> {
  anchorKey: Key | null;
  currentKey: Key | null;

  constructor(keys?: Iterable<Key> | Selection, anchorKey?: Key | null, currentKey?: Key | null) {
    super(keys);
    if (keys instanceof Selection) {
      this.anchorKey = anchorKey ?? keys.anchorKey;
      this.currentKey = currentKey ?? keys.currentKey;
    } else {
      this.anchorKey = anchorKey ?? null;
      this.currentKey = currentKey ?? null;
    }
  }
}

/** Every item, without listing them: what "select all" means. */
export type SelectionValue = "all" | Selection;

function sameSet(a: Set<Key>, b: Set<Key>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a) if (!b.has(key)) return false;
  return true;
}

function toSelection(
  value: "all" | Iterable<Key> | null | undefined,
  fallback?: Selection,
): SelectionValue | undefined {
  if (value === null || value === undefined) return fallback;
  return value === "all" ? "all" : new Selection(value);
}

export interface MultipleSelectionOptions {
  selectionMode?: MaybeAccessor<SelectionMode | undefined>;
  selectionBehavior?: MaybeAccessor<SelectionBehavior | undefined>;
  disallowEmptySelection?: MaybeAccessor<boolean | undefined>;
  selectedKeys?: MaybeAccessor<"all" | Iterable<Key> | undefined>;
  defaultSelectedKeys?: MaybeAccessor<"all" | Iterable<Key> | undefined>;
  disabledKeys?: MaybeAccessor<Iterable<Key> | undefined>;
  disabledBehavior?: MaybeAccessor<DisabledBehavior | undefined>;
  /** Report a selection change even when the set is unchanged. */
  allowDuplicateSelectionEvents?: boolean;
  onSelectionChange?: (keys: SelectionValue) => void;
}

export interface MultipleSelectionState {
  selectionMode: Accessor<SelectionMode>;
  selectionBehavior: Accessor<SelectionBehavior>;
  setSelectionBehavior(behavior: SelectionBehavior): void;
  disallowEmptySelection: Accessor<boolean>;
  selectedKeys: Accessor<SelectionValue>;
  setSelectedKeys(keys: SelectionValue): void;
  disabledKeys: Accessor<Set<Key>>;
  disabledBehavior: Accessor<DisabledBehavior>;
  isFocused: Accessor<boolean>;
  setFocused(focused: boolean): void;
  focusedKey: Accessor<Key | null>;
  childFocusStrategy: Accessor<FocusStrategy | null>;
  setFocusedKey(key: Key | null, child?: FocusStrategy): void;
}

/** Selection and roving focus, as signals. */
export function multipleSelectionState(
  options: MultipleSelectionOptions = {},
): MultipleSelectionState {
  const isFocused = signal(false);
  const focusedKey = signal<Key | null>(null);
  const childFocusStrategy = signal<FocusStrategy | null>(null);

  const [selectedKeys, setSelectedKeys] = controllable<SelectionValue>(
    () => toSelection(access(options.selectedKeys)),
    () => toSelection(access(options.defaultSelectedKeys), new Selection()) as SelectionValue,
    options.onSelectionChange,
  );

  // The behaviour can be changed at runtime: a long press on touch enters
  // selection mode, which turns a `replace` list into a `toggle` one until the
  // selection empties again.
  const behaviorOverride = signal<SelectionBehavior | null>(null);

  const selectionBehavior = computed<SelectionBehavior>(() => {
    const declared = access(options.selectionBehavior) ?? "toggle";
    const override = behaviorOverride();
    if (override === null) return declared;
    // Back to what the caller asked for once nothing is selected.
    const current = selectedKeys();
    if (
      declared === "replace" &&
      override === "toggle" &&
      current !== "all" &&
      current.size === 0
    ) {
      return declared;
    }
    return override;
  });

  const disabledKeys = computed(() => {
    const declared = access(options.disabledKeys);
    return declared === undefined ? new Set<Key>() : new Set<Key>(declared);
  });

  return {
    selectionMode: () => access(options.selectionMode) ?? "none",
    selectionBehavior,
    setSelectionBehavior: (behavior) => behaviorOverride.set(behavior),
    disallowEmptySelection: () => access(options.disallowEmptySelection) === true,
    selectedKeys,
    setSelectedKeys(keys) {
      const current = selectedKeys();
      const changed =
        options.allowDuplicateSelectionEvents === true ||
        keys === "all" ||
        current === "all" ||
        !sameSet(keys, current);
      if (changed) setSelectedKeys(keys);
    },
    disabledKeys,
    disabledBehavior: () => access(options.disabledBehavior) ?? "all",
    isFocused,
    setFocused: (focused) => isFocused.set(focused),
    focusedKey,
    childFocusStrategy,
    setFocusedKey(key, child = "first") {
      focusedKey.set(key);
      childFocusStrategy.set(child);
    },
  };
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Where items are, for the navigation and virtualisation that need geometry.
 *
 * It lives here rather than beside `DOMLayoutDelegate` in `selection.ts`
 * because `SelectionManager` takes one and `selection.ts` already imports this
 * module; declaring a narrower twin there is what put two `LayoutDelegate`s in
 * the barrel.
 */
export interface LayoutDelegate {
  getItemRect(key: Key): Rect | null;
  getContentSize(): Size;
  getVisibleRect(): Rect;
  getKeyRange?(from: Key, to: Key): Key[];
  getKeyLeftOf?(key: Key): Key | null;
  getKeyRightOf?(key: Key): Key | null;
}

interface SelectionManagerOptions {
  allowsCellSelection?: boolean;
  layoutDelegate?: LayoutDelegate;
  /** The unfiltered collection, so "select all" covers hidden items too. */
  fullCollection?: Collection<unknown>;
}

/**
 * Reading and changing the selection.
 *
 * Every method here knows the collection, which is what separates it from a
 * `Set<Key>`: extending a selection needs the key order, selecting all needs
 * to know which items are selectable, and toggling a cell has to walk up to
 * the row that owns it.
 */
export class SelectionManager {
  collection: Collection<unknown>;

  #state: MultipleSelectionState;
  #allowsCellSelection: boolean;
  #layoutDelegate: LayoutDelegate | null;
  #fullCollection: Collection<unknown> | null;

  constructor(
    collection: Collection<unknown>,
    state: MultipleSelectionState,
    options: SelectionManagerOptions = {},
  ) {
    this.collection = collection;
    this.#state = state;
    this.#allowsCellSelection = options.allowsCellSelection ?? false;
    this.#layoutDelegate = options.layoutDelegate ?? null;
    this.#fullCollection = options.fullCollection ?? null;
  }

  get selectionMode(): SelectionMode {
    return this.#state.selectionMode();
  }

  get disallowEmptySelection(): boolean {
    return this.#state.disallowEmptySelection();
  }

  get selectionBehavior(): SelectionBehavior {
    return this.#state.selectionBehavior();
  }

  setSelectionBehavior(behavior: SelectionBehavior): void {
    this.#state.setSelectionBehavior(behavior);
  }

  get isFocused(): boolean {
    return this.#state.isFocused();
  }

  setFocused(focused: boolean): void {
    this.#state.setFocused(focused);
  }

  get focusedKey(): Key | null {
    return this.#state.focusedKey();
  }

  get childFocusStrategy(): FocusStrategy | null {
    return this.#state.childFocusStrategy();
  }

  setFocusedKey(key: Key | null, child?: FocusStrategy): void {
    if (key === null || this.collection.getItem(key) !== null) {
      this.#state.setFocusedKey(key, child);
    }
  }

  /** The selected keys, with "all" materialised. */
  get selectedKeys(): Set<Key> {
    const raw = this.#state.selectedKeys();
    return raw === "all" ? new Set(this.#selectAllKeys()) : raw;
  }

  /** The selection as stored: "all", or the set. */
  get rawSelection(): SelectionValue {
    return this.#state.selectedKeys();
  }

  isSelected(key: Key): boolean {
    if (this.selectionMode === "none") return false;
    const mapped = this.#itemKey(key);
    if (mapped === null) return false;
    const raw = this.#state.selectedKeys();
    return raw === "all" ? this.canSelectItem(mapped) : raw.has(mapped);
  }

  get isEmpty(): boolean {
    const raw = this.#state.selectedKeys();
    return raw !== "all" && raw.size === 0;
  }

  get isSelectAll(): boolean {
    if (this.isEmpty) return false;
    const raw = this.#state.selectedKeys();
    if (raw === "all") return true;
    return this.#selectAllKeys().every((key) => raw.has(key));
  }

  get firstSelectedKey(): Key | null {
    let first: Node<unknown> | null = null;
    for (const key of this.#state.selectedKeys() === "all" ? [] : this.selectedKeys) {
      const item = this.collection.getItem(key);
      if (item !== null && (first === null || this.#order(item, first) < 0)) first = item;
    }
    return first?.key ?? null;
  }

  get lastSelectedKey(): Key | null {
    let last: Node<unknown> | null = null;
    for (const key of this.#state.selectedKeys() === "all" ? [] : this.selectedKeys) {
      const item = this.collection.getItem(key);
      if (item !== null && (last === null || this.#order(item, last) > 0)) last = item;
    }
    return last?.key ?? null;
  }

  get disabledKeys(): Set<Key> {
    return this.#state.disabledKeys();
  }

  get disabledBehavior(): DisabledBehavior {
    return this.#state.disabledBehavior();
  }

  #order(a: Node<unknown>, b: Node<unknown>): number {
    if (a.parentKey === b.parentKey) return a.index - b.index;
    // Different parents: compare the sections instead.
    const parentA = a.parentKey === undefined ? null : this.collection.getItem(a.parentKey);
    const parentB = b.parentKey === undefined ? null : this.collection.getItem(b.parentKey);
    return (parentA?.index ?? a.index) - (parentB?.index ?? b.index);
  }

  extendSelection(to: Key): void {
    if (this.selectionMode === "none") return;
    if (this.selectionMode === "single") {
      this.replaceSelection(to);
      return;
    }

    const mapped = this.#itemKey(to);
    if (mapped === null) return;

    const raw = this.#state.selectedKeys();
    let next: Selection;

    if (raw === "all") {
      next = new Selection([mapped], mapped, mapped);
    } else {
      const anchor = raw.anchorKey ?? mapped;
      next = new Selection(raw, anchor, mapped);
      // Un-select what the previous extension covered, then select the new
      // range: dragging back over a range has to shrink it.
      for (const key of this.#keyRange(anchor, raw.currentKey ?? mapped)) next.delete(key);
      for (const key of this.#keyRange(mapped, anchor)) {
        if (this.canSelectItem(key)) next.add(key);
      }
    }

    this.#state.setSelectedKeys(next);
  }

  #keyRange(from: Key, to: Key): Key[] {
    const fromItem = this.collection.getItem(from);
    const toItem = this.collection.getItem(to);
    if (fromItem === null || toItem === null) return [];
    return this.#order(fromItem, toItem) <= 0
      ? this.#keyRangeForward(from, to)
      : this.#keyRangeForward(to, from);
  }

  #keyRangeForward(from: Key, to: Key): Key[] {
    if (this.#layoutDelegate?.getKeyRange !== undefined) {
      return this.#layoutDelegate.getKeyRange(from, to);
    }

    const keys: Key[] = [];
    let key: Key | null = from;
    while (key !== null) {
      const item = this.collection.getItem(key);
      if (item !== null && (item.type === "item" || this.#allowsCellSelection)) keys.push(key);
      if (key === to) return keys;
      key = this.collection.getKeyAfter(key);
    }
    return [];
  }

  /** The key that is actually selectable: an item, walking up from a cell. */
  #itemKey(key: Key): Key | null {
    let item = this.collection.getItem(key);
    if (item === null) return key;
    while (item !== null && item.type !== "item" && item.parentKey !== undefined) {
      item = this.collection.getItem(item.parentKey);
    }
    return item !== null && item.type === "item" ? item.key : null;
  }

  toggleSelection(key: Key): void {
    if (this.selectionMode === "none") return;
    if (this.selectionMode === "single" && !this.isSelected(key)) {
      this.replaceSelection(key);
      return;
    }

    const mapped = this.#itemKey(key);
    if (mapped === null) return;

    const raw = this.#state.selectedKeys();
    const next = new Selection(raw === "all" ? this.#selectAllKeys() : raw);
    if (next.has(mapped)) {
      next.delete(mapped);
    } else if (this.canSelectItem(mapped)) {
      next.add(mapped);
      next.anchorKey = mapped;
      next.currentKey = mapped;
    }

    if (this.disallowEmptySelection && next.size === 0) return;
    this.#state.setSelectedKeys(next);
  }

  replaceSelection(key: Key): void {
    if (this.selectionMode === "none") return;
    const mapped = this.#itemKey(key);
    if (mapped === null) return;

    this.#state.setSelectedKeys(
      this.canSelectItem(mapped) ? new Selection([mapped], mapped, mapped) : new Selection(),
    );
  }

  setSelectedKeys(keys: Iterable<Key>): void {
    if (this.selectionMode === "none") return;

    const next = new Selection();
    for (const key of keys) {
      const mapped = this.#itemKey(key);
      if (mapped === null) continue;
      next.add(mapped);
      if (this.selectionMode === "single") break;
    }
    this.#state.setSelectedKeys(next);
  }

  #selectAllKeys(): Key[] {
    // The unfiltered collection when there is one, so an "all" selection
    // survives a filter being applied and removed.
    const collection = this.#fullCollection ?? this.collection;
    const keys: Key[] = [];

    const walk = (start: Key | null): void => {
      let key = start;
      while (key !== null) {
        if (this.#canSelectIn(key, collection)) {
          const item = collection.getItem(key);
          if (item?.type === "item") keys.push(key);
          if (item?.hasChildNodes === true && (this.#allowsCellSelection || item.type !== "item")) {
            walk(item.childNodes[0]?.key ?? null);
          }
        }
        key = collection.getKeyAfter(key);
      }
    };

    walk(collection.getFirstKey());
    return keys;
  }

  selectAll(): void {
    if (!this.isSelectAll && this.selectionMode === "multiple") this.#state.setSelectedKeys("all");
  }

  clearSelection(): void {
    const raw = this.#state.selectedKeys();
    if (!this.disallowEmptySelection && (raw === "all" || raw.size > 0)) {
      this.#state.setSelectedKeys(new Selection());
    }
  }

  toggleSelectAll(): void {
    if (this.isSelectAll) this.clearSelection();
    else this.selectAll();
  }

  /**
   * What a press on an item means.
   *
   * Touch and a virtual cursor always toggle: neither has a modifier key, so
   * `replace` would make multiple selection impossible for them.
   */
  select(key: Key, event?: { pointerType?: string }): void {
    if (this.selectionMode === "none") return;

    if (this.selectionMode === "single") {
      if (this.isSelected(key) && !this.disallowEmptySelection) this.toggleSelection(key);
      else this.replaceSelection(key);
      return;
    }

    if (
      this.selectionBehavior === "toggle" ||
      event?.pointerType === "touch" ||
      event?.pointerType === "virtual"
    ) {
      this.toggleSelection(key);
      return;
    }

    this.replaceSelection(key);
  }

  isSelectionEqual(other: Set<Key>): boolean {
    const raw = this.#state.selectedKeys();
    if ((other as unknown) === raw) return true;
    return sameSet(other, this.selectedKeys);
  }

  canSelectItem(key: Key): boolean {
    return this.#canSelectIn(key, this.collection);
  }

  #canSelectIn(key: Key, collection: Collection<unknown>): boolean {
    if (this.selectionMode === "none" || this.#state.disabledKeys().has(key)) return false;
    const item = collection.getItem(key);
    if (item === null) return false;
    if (item.props?.isDisabled === true) return false;
    return true;
  }

  /** Whether the item responds to anything at all, not merely to selection. */
  isDisabled(key: Key): boolean {
    const item = this.collection.getItem(key);
    return (
      this.disabledBehavior === "all" &&
      (this.#state.disabledKeys().has(key) || item?.props?.isDisabled === true) &&
      item?.props?.disabledBehavior !== "selection"
    );
  }

  isLink(key: Key): boolean {
    return this.collection.getItem(key)?.props?.href !== undefined;
  }

  getItemProps(key: Key): Record<string, unknown> | undefined {
    return this.collection.getItem(key)?.props;
  }

  /** The same selection, over a different (usually filtered) collection. */
  withCollection(collection: Collection<unknown>): SelectionManager {
    return new SelectionManager(collection, this.#state, {
      allowsCellSelection: this.#allowsCellSelection,
      layoutDelegate: this.#layoutDelegate ?? undefined,
      fullCollection: this.#fullCollection ?? this.collection,
    });
  }
}

// ---------------------------------------------------------------------------
// List state
// ---------------------------------------------------------------------------

export interface ListStateOptions<T> extends MultipleSelectionOptions, ItemAccessors<T> {
  items?: MaybeAccessor<Iterable<T> | undefined>;
  /** Narrow the collection, for an autocomplete. */
  filter?: (nodes: Iterable<Node<T>>) => Iterable<Node<T>>;
  layoutDelegate?: LayoutDelegate;
}

export interface ListState<T> {
  collection: Accessor<ListCollection<T>>;
  selectionManager: Accessor<SelectionManager>;
  disabledKeys: Accessor<Set<Key>>;
}

/**
 * A collection and its selection, kept in step.
 *
 * The focused key is repaired when the item it names disappears: a list whose
 * focused row is deleted must move focus to the next row that still exists,
 * forwards if there is one and backwards otherwise, or the user is left with
 * an arrow key that does nothing.
 */
export function listState<T>(options: ListStateOptions<T>): ListState<T> {
  const selection = multipleSelectionState(options);

  const collection = computed(() => {
    const items = access(options.items) ?? [];
    const built = buildCollection(items, options);
    if (options.filter === undefined) return built;
    return new ListCollection(options.filter(built));
  });

  const selectionManager = computed(
    () =>
      new SelectionManager(collection() as Collection<unknown>, selection, {
        layoutDelegate: options.layoutDelegate,
      }),
  );

  let previous: ListCollection<T> | null = null;
  const repaired = computed(() => {
    const current = collection();
    const focused = selection.focusedKey();

    if (focused !== null && current.getItem(focused) === null && previous !== null) {
      const manager = selectionManager();
      let next: Key | null = null;

      // Forwards through the OLD collection, for the first key that survives.
      let key = previous.getKeyAfter(focused);
      while (key !== null && next === null) {
        const node = current.getItem(key);
        if (node !== null && node.type === "item" && !manager.isDisabled(key)) next = key;
        key = previous.getKeyAfter(key);
      }

      if (next === null) {
        key = previous.getKeyBefore(focused);
        while (key !== null && next === null) {
          const node = current.getItem(key);
          if (node !== null && node.type === "item" && !manager.isDisabled(key)) next = key;
          key = previous.getKeyBefore(key);
        }
      }

      selection.setFocusedKey(next);
    }

    previous = current;
    return current;
  });

  return {
    collection: repaired,
    selectionManager,
    disabledKeys: selection.disabledKeys,
  };
}

export interface SingleSelectListOptions<T> extends Omit<
  ListStateOptions<T>,
  "selectedKeys" | "defaultSelectedKeys" | "onSelectionChange"
> {
  selectedKey?: MaybeAccessor<Key | null | undefined>;
  defaultSelectedKey?: MaybeAccessor<Key | null | undefined>;
  onSelectionChange?: (key: Key | null) => void;
}

export interface SingleSelectListState<T> extends ListState<T> {
  selectedKey: Accessor<Key | null>;
  setSelectedKey(key: Key | null): void;
  selectedItem: Accessor<Node<T> | null>;
}

/** A collection where exactly one item is selected: a select, a tab list. */
export function singleSelectListState<T>(
  options: SingleSelectListOptions<T>,
): SingleSelectListState<T> {
  const [selectedKey, setSelectedKey] = controllable<Key | null>(
    () => access(options.selectedKey),
    () => access(options.defaultSelectedKey) ?? null,
    options.onSelectionChange,
  );

  const state = listState<T>({
    ...options,
    selectionMode: "single",
    disallowEmptySelection: true,
    allowDuplicateSelectionEvents: true,
    selectedKeys: () => {
      const key = selectedKey();
      return key === null ? [] : [key];
    },
    onSelectionChange: (keys) => {
      if (keys === "all") return;
      const key = keys.values().next().value ?? null;
      // Reported even when unchanged: pressing the already-selected tab is an
      // event a caller may want, and `controllable` swallows a no-op set.
      if (key === selectedKey()) options.onSelectionChange?.(key);
      setSelectedKey(key);
    },
  });

  return {
    ...state,
    selectedKey,
    setSelectedKey,
    selectedItem: () => {
      const key = selectedKey();
      return key === null ? null : state.collection().getItem(key);
    },
  };
}
