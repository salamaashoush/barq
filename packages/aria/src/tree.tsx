/**
 * A tree: nested rows that expand and collapse.
 *
 * It is a `treegrid` rather than a `tree` because a row may hold its own
 * controls (an expand button, a checkbox, a menu), and a `treeitem` may not
 * contain interactive content. The navigation is a grid list's with one more
 * axis:
 *
 * - **Up and down move between the rows that are showing.** A collapsed
 *   row's descendants are still in the collection, so a selection or a route
 *   can name them, but the keyboard and typeahead never land on them.
 * - **Right expands, then moves into the row.** On a row that is collapsed and
 *   has children the first press opens it; after that Right walks the row's own
 *   controls, as in a grid list. Left is the mirror: it collapses an open row,
 *   and on a closed one or a leaf it moves to the parent. Both flip in a
 *   right-to-left layout.
 *
 * The rows are rendered flat, each a sibling of the next, with `aria-level`,
 * `aria-posinset` and `aria-setsize` saying where each one sits. Nesting the
 * elements would make a row's subtree part of its accessible name.
 *
 * ```tsx
 * <Tree aria-label="Files" items={files()} defaultExpandedKeys={["documents"]}>
 *   {(file) => (
 *     <TreeItem>
 *       <TreeItemContent>
 *         {(row) => (
 *           <>
 *             <Show when={row.hasChildItems()}>
 *               <TreeItemExpandButton>{row.isExpanded() ? "v" : ">"}</TreeItemExpandButton>
 *             </Show>
 *             {file.name}
 *           </>
 *         )}
 *       </TreeItemContent>
 *     </TreeItem>
 *   )}
 * </Tree>
 * ```
 *
 * An item's `children` are its child rows, read through `getChildren`. An item
 * whose `getType` answers `"section"` is a group at the root with a header;
 * one that answers `"loader"` is where a `<TreeLoadMoreItem>` goes.
 */

import {
  cells,
  type Accessor,
  type Child,
  For,
  createContext,
  createEffect,
  createMemo,
  createRenderEffect,
  createSignal,
  getContext,
  getOwner,
  type Incoming,
  install,
  onCleanup,
  provide,
  Show,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { button, type ButtonOptions } from "./button.tsx";
import { Checkbox } from "./checkbox.tsx";
import {
  buildCollection,
  type Collection,
  type DisabledBehavior,
  type ItemAccessors,
  type Key,
  type LayoutDelegate,
  multipleSelectionState,
  type MultipleSelectionOptions,
  type Node,
  type Rect,
  SelectionManager,
  type SelectionBehavior,
  type SelectionMode,
  type Size,
} from "./collections.ts";
import {
  activeElement,
  contains,
  ownerDocument,
  PREVENT_FOCUS_ATTRIBUTE,
  scrollIntoViewport,
  scrollParents,
  targetElement,
} from "./dom.ts";
import {
  afterDropIndicatorTargets,
  type DroppableCollectionActivateEvent,
  type ItemDropTarget,
  TreeDropTargetDelegate,
} from "./dnd/index.ts";
import {
  type CollectionDragAndDrop,
  collectionDragAndDrop,
  type DragAndDropHooks,
  draggableItemSlotProps,
  type DropIndicatorProps,
  provideDragButton,
  provideDropIndicator,
  useDragAndDropContext,
  dropIndicatorStyle,
} from "./drag-and-drop.tsx";
import { focusableWalker, focusRing } from "./focus.ts";
import { rowIdFor, type KeyboardNavigationBehavior } from "./gridlist.tsx";
import { gridSelectionAnnouncement, highlightSelectionDescription } from "./grid-selection.ts";
import { StringDictionary, stringFormatter, useLocale } from "./i18n.ts";
import { focused } from "./interactions/focus-events.ts";
import { focusSafely } from "./interactions/focusable.ts";
import { hover, type HoverEvent } from "./interactions/hover.ts";
import { isFocusVisible as focusIsVisible } from "./interactions/modality.ts";
import { router } from "./interactions/open-link.ts";
import type { ElementRef, PressEvent } from "./interactions/press.ts";
import { visuallyHidden } from "./live.ts";
import {
  loaderRowStyle,
  loadMoreSentinel,
  loadMoreSentinelStyle,
  reportLoading,
} from "./load-more.ts";
import {
  ListKeyboardDelegate,
  selectableItem,
  selectableList,
  type KeyboardDelegate,
} from "./selection.ts";
import {
  access,
  callback,
  controllable,
  type DOMProps,
  filterDOMProps,
  fromProps,
  id,
  type MaybeAccessor,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";
import {
  contentStyle,
  measureRow,
  rowStyle,
  useVirtualizer,
  type LayoutInfo,
  type VirtualizerValue,
} from "./virtualizer.tsx";

// ---------------------------------------------------------------------------
// The collection
// ---------------------------------------------------------------------------

interface TreeStructure<T> {
  roots: Node<T>[];
  keyMap: Map<Key, Node<T>>;
  setSizes: Map<Key, number>;
  itemCount: number;
}

/**
 * Re-link the nodes `buildCollection` made into a tree.
 *
 * A list collection links its nodes in document order and numbers its items
 * across the whole list; a tree needs both per sibling group. A section adds
 * no level: its rows sit at the level of the section itself, as React Aria
 * reports them.
 */
function structure<T>(roots: Node<T>[]): TreeStructure<T> {
  const keyMap = new Map<Key, Node<T>>();
  const setSizes = new Map<Key, number>();
  let itemCount = 0;

  function link(siblings: Node<T>[], level: number, parentKey: Key | undefined): void {
    const size = siblings.filter((node) => node.type === "item").length;
    let index = 0;
    let previous: Node<T> | null = null;
    for (const node of siblings) {
      keyMap.set(node.key, node);
      node.level = level;
      node.parentKey = parentKey;
      node.prevKey = previous?.key;
      node.nextKey = undefined;
      if (previous !== null) previous.nextKey = node.key;
      node.index = index;
      if (node.type === "item") {
        index++;
        itemCount++;
        setSizes.set(node.key, size);
      }
      link(node.childNodes, node.type === "section" ? level : level + 1, node.key);
      previous = node;
    }
  }
  link(roots, 0, undefined);

  return { roots, keyMap, setSizes, itemCount };
}

/**
 * A tree, read through which of its rows are expanded.
 *
 * Every node is in it, so `getItem` answers for a row inside a collapsed
 * parent. The navigation (`getKeyAfter`, `getKeyBefore`, the ends, the
 * iterator) only walks the rows that are showing, which is what keeps the
 * keyboard, typeahead and "select all" off the hidden ones.
 */
export class TreeCollection<T> implements Collection<T> {
  #tree: TreeStructure<T>;
  #expandedKeys: Set<Key>;
  #visible: Key[] | null = null;

  constructor(shape: TreeStructure<T>, expandedKeys: Set<Key>) {
    this.#tree = shape;
    this.#expandedKeys = expandedKeys;
  }

  /** The same nodes, opened differently. */
  withExpandedKeys(expandedKeys: Set<Key>): TreeCollection<T> {
    return new TreeCollection(this.#tree, expandedKeys);
  }

  get expandedKeys(): Set<Key> {
    return this.#expandedKeys;
  }

  /** The top-level nodes: rows, sections and loaders. */
  get rootNodes(): Node<T>[] {
    return this.#tree.roots;
  }

  /** How many items, expanded or not. Sections and loaders do not count. */
  get size(): number {
    return this.#tree.itemCount;
  }

  /** The showing nodes in order; a section is followed by its next sibling, not its rows. */
  *[Symbol.iterator](): IterableIterator<Node<T>> {
    let key = this.getFirstKey();
    while (key !== null) {
      const node = this.getItem(key);
      if (node === null) return;
      yield node;
      key = node.type === "section" ? (node.nextKey ?? null) : this.getKeyAfter(key);
    }
  }

  getKeys(): IterableIterator<Key> {
    return this.#tree.keyMap.keys();
  }

  getItem(key: Key): Node<T> | null {
    return this.#tree.keyMap.get(key) ?? null;
  }

  #opens(node: Node<T>): boolean {
    return node.type !== "item" || this.#expandedKeys.has(node.key);
  }

  getKeyAfter(key: Key): Key | null {
    let node = this.getItem(key);
    if (node === null) return null;
    const first = node.childNodes[0];
    if (this.#opens(node) && first !== undefined) return first.key;

    while (node !== null) {
      if (node.nextKey !== undefined) return node.nextKey;
      node = node.parentKey === undefined ? null : this.getItem(node.parentKey);
    }
    return null;
  }

  getKeyBefore(key: Key): Key | null {
    const node = this.getItem(key);
    if (node === null) return null;
    if (node.prevKey === undefined) return node.parentKey ?? null;
    return this.#deepestShowing(this.getItem(node.prevKey));
  }

  #deepestShowing(start: Node<T> | null): Key | null {
    let node = start;
    while (node !== null && this.#opens(node)) {
      const last = node.childNodes.at(-1);
      if (last === undefined) break;
      node = last;
    }
    return node?.key ?? null;
  }

  getFirstKey(): Key | null {
    return this.#tree.roots[0]?.key ?? null;
  }

  getLastKey(): Key | null {
    return this.#deepestShowing(this.#tree.roots.at(-1) ?? null);
  }

  /**
   * A section's showing rows, all levels of them; any other node's direct
   * children. That is the shape a layout walks: a section is a heading
   * followed by its rows, and a row is not a container.
   */
  getChildren(key: Key): Iterable<Node<T>> {
    const parent = this.getItem(key);
    if (parent === null) return [];
    if (parent.type !== "section") return parent.childNodes;

    const rows: Node<T>[] = [];
    let at = parent.childNodes[0]?.key ?? null;
    while (at !== null && at !== parent.nextKey) {
      const node = this.getItem(at);
      if (node === null) break;
      rows.push(node);
      at = this.getKeyAfter(at);
    }
    return rows;
  }

  at(index: number): Node<T> | null {
    const key = this.#showing()[index];
    return key === undefined ? null : this.getItem(key);
  }

  #showing(): Key[] {
    if (this.#visible !== null) return this.#visible;
    const keys: Key[] = [];
    let key = this.getFirstKey();
    while (key !== null) {
      keys.push(key);
      key = this.getKeyAfter(key);
    }
    this.#visible = keys;
    return keys;
  }

  /** Whether every ancestor of the node is expanded. */
  isShowing(key: Key): boolean {
    let node = this.getItem(key);
    if (node === null) return false;
    while (node.parentKey !== undefined) {
      const parent = this.getItem(node.parentKey);
      if (parent === null) return false;
      if (parent.type === "item" && !this.#expandedKeys.has(parent.key)) return false;
      node = parent;
    }
    return true;
  }

  /** The nearest node that is rendered: the key itself, or its highest collapsed ancestor. */
  closestShowingKey(key: Key): Key {
    let target = key;
    let node = this.getItem(key);
    while (node !== null && node.parentKey !== undefined) {
      const parent = this.getItem(node.parentKey);
      if (parent !== null && parent.type === "item" && !this.#expandedKeys.has(parent.key)) {
        target = parent.key;
      }
      node = parent;
    }
    return target;
  }

  /** How many item siblings a row has, itself included. */
  setSizeOf(key: Key): number {
    return this.#tree.setSizes.get(key) ?? 0;
  }

  /** The row's position among the showing rows, counting from 1. Loaders are not rows. */
  rowIndexOf(key: Key): number {
    const rows = this.#showing().filter((at) => this.getItem(at)?.type === "item");
    return rows.indexOf(key) + 1;
  }

  /** How many rows are showing, loaders left out. */
  get rowCount(): number {
    return this.#showing().filter((at) => this.getItem(at)?.type === "item").length;
  }

  /** The visible rows between two keys, in order, whichever comes first. */
  keyRange(from: Key, to: Key): Key[] {
    const keys = this.#showing();
    const a = keys.indexOf(from);
    const b = keys.indexOf(to);
    if (a === -1 || b === -1) return [];
    return keys
      .slice(Math.min(a, b), Math.max(a, b) + 1)
      .filter((key) => this.getItem(key)?.type === "item");
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface TreeStateOptions<T> extends MultipleSelectionOptions, ItemAccessors<T> {
  items?: MaybeAccessor<Iterable<T> | undefined>;
  expandedKeys?: MaybeAccessor<Iterable<Key> | undefined>;
  defaultExpandedKeys?: MaybeAccessor<Iterable<Key> | undefined>;
  onExpandedChange?: (keys: Set<Key>) => void;
  /** Where rows are, for a virtualised tree. */
  layoutDelegate?: LayoutDelegate;
}

export interface TreeState<T> {
  collection: Accessor<TreeCollection<T>>;
  selectionManager: Accessor<SelectionManager>;
  disabledKeys: Accessor<Set<Key>>;
  expandedKeys: Accessor<Set<Key>>;
  toggleKey(key: Key): void;
  setExpandedKeys(keys: Set<Key>): void;
}

/**
 * The geometry-free delegate the selection manager orders ranges through.
 *
 * `SelectionManager` decides which end of a range comes first by comparing
 * sibling indexes, which is wrong between two rows at different depths. It
 * asks `getKeyRange` when there is one, and this one answers in rendered order
 * either way round. It has no geometry, so it says so.
 */
function rangeDelegate<T>(collection: Accessor<TreeCollection<T>>): LayoutDelegate {
  return {
    getItemRect: (): Rect | null => null,
    getContentSize: (): Size => ({ width: 0, height: 0 }),
    getVisibleRect: (): Rect => ({ x: 0, y: 0, width: 0, height: 0 }),
    getKeyRange: (from, to) => collection().keyRange(from, to),
  };
}

interface TreeRepair<T> {
  current: TreeCollection<T>;
  repair: boolean;
  next: Key | null;
}

/**
 * Expansion, selection and roving focus over a tree of items.
 *
 * The focused key is repaired when the row it names stops being rendered:
 * removed, it moves to the next row that survives, as a list's does; hidden
 * under a collapsed parent, it moves up to that parent.
 */
export function treeState<T>(options: TreeStateOptions<T>): TreeState<T> {
  const selection = multipleSelectionState(options);

  const [expandedKeys, setExpandedKeys] = controllable<Set<Key>>(
    () => {
      const given = access(options.expandedKeys);
      return given === undefined ? undefined : new Set(given);
    },
    () => new Set(access(options.defaultExpandedKeys) ?? []),
    options.onExpandedChange,
  );

  const accessors: ItemAccessors<T> = {
    getKey: options.getKey,
    getTextValue: options.getTextValue,
    getChildren: options.getChildren,
    getProps: options.getProps,
    getType: (item: T) => callback(options.getType)?.(item) ?? "item",
  };

  const shape = createMemo(() =>
    structure([...buildCollection(access(options.items) ?? [], accessors)]),
  );
  const collection = createMemo(() => new TreeCollection(shape(), expandedKeys()));

  const ranges = rangeDelegate(collection);
  const selectionManager = createMemo(
    () =>
      new SelectionManager(collection() as Collection<unknown>, selection, {
        layoutDelegate: options.layoutDelegate ?? ranges,
      }),
  );

  let previous: TreeCollection<T> | null = null;
  createRenderEffect(
    (): TreeRepair<T> => {
      const current = collection();
      const focusedKey = selection.focusedKey();
      if (focusedKey === null || previous === null) {
        return { current, repair: false, next: null };
      }

      if (current.getItem(focusedKey) !== null) {
        if (current.isShowing(focusedKey)) return { current, repair: false, next: null };
        return { current, repair: true, next: current.closestShowingKey(focusedKey) };
      }

      const manager = selectionManager();
      function usable(key: Key): boolean {
        const node = current.getItem(key);
        return node !== null && node.type === "item" && current.isShowing(key);
      }
      let next: Key | null = null;
      for (let key = previous.getKeyAfter(focusedKey); key !== null && next === null;) {
        if (usable(key) && !manager.isDisabled(key)) next = key;
        key = previous.getKeyAfter(key);
      }
      for (let key = previous.getKeyBefore(focusedKey); key !== null && next === null;) {
        if (usable(key) && !manager.isDisabled(key)) next = key;
        key = previous.getKeyBefore(key);
      }
      return { current, repair: true, next };
    },
    ({ current, repair, next }) => {
      if (repair) selection.setFocusedKey(next);
      previous = current;
    },
  );

  return {
    collection,
    selectionManager,
    disabledKeys: selection.disabledKeys,
    expandedKeys,
    setExpandedKeys,
    toggleKey(key) {
      setExpandedKeys((open) => {
        const next = new Set(open);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
  };
}

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

export interface TreeOptions {
  ref: ElementRef;
  autoFocus?: MaybeAccessor<boolean | "first" | "last" | undefined>;
  disallowTypeAhead?: MaybeAccessor<boolean | undefined>;
  disallowEmptySelection?: MaybeAccessor<boolean | undefined>;
  isVirtualized?: MaybeAccessor<boolean | undefined>;
  /** @default "clearSelection" */
  escapeKeyBehavior?: MaybeAccessor<"clearSelection" | "none" | undefined>;
  keyboardDelegate?: KeyboardDelegate;
  layoutDelegate?: LayoutDelegate;
  /** Whether the empty state holds something Tab stops at, so the tree itself need not. */
  emptyStateIsTabbable?: MaybeAccessor<boolean | undefined>;
  /** Whether a row has an action, which a tap then performs instead of selecting. */
  hasAction?: MaybeAccessor<boolean | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
}

export interface TreeResult {
  gridProps: DOMProps;
  /** The base every row id is derived from. */
  baseId: Accessor<string>;
}

export function tree(options: TreeOptions, state: TreeState<unknown>): TreeResult {
  const baseId = id();
  function isEmpty(): boolean {
    return state.collection().size === 0;
  }

  const { listProps } = selectableList({
    ...options,
    selectionManager: state.selectionManager,
    collection: state.collection,
    disabledKeys: state.disabledKeys,
    selectOnFocus: () => state.selectionManager().selectionBehavior === "replace",
    allowsTabNavigation: isEmpty,
    disallowSelectAll: isEmpty,
    linkBehavior: "action",
  });

  const descriptionProps = highlightSelectionDescription({
    selectionManager: state.selectionManager,
    hasItemActions: options.hasAction,
  });
  gridSelectionAnnouncement({}, state);

  return {
    baseId,
    gridProps: mergeProps(
      filterDOMProps(options, { labelable: true }),
      listProps,
      descriptionProps,
      {
        role: "treegrid",
        id: baseId,
        "aria-multiselectable": () =>
          state.selectionManager().selectionMode === "multiple" ? true : undefined,
        // Empty, the tree is still a Tab stop so a keyboard user can land on it
        // and hear that it is empty, unless the empty state has its own stop.
        tabIndex: () => {
          if (!isEmpty()) return access(listProps.tabIndex as MaybeAccessor<number>);
          return access(options.emptyStateIsTabbable) === true ? -1 : 0;
        },
        "aria-rowcount": () =>
          access(options.isVirtualized) === true ? state.collection().rowCount : undefined,
        "aria-colcount": () => (access(options.isVirtualized) === true ? 1 : undefined),
      },
    ),
  };
}

// ---------------------------------------------------------------------------
// A row
// ---------------------------------------------------------------------------

const strings = new StringDictionary<"expand" | "collapse" | "select">({
  "ar-AE": { expand: "تمديد", collapse: "طي", select: "تحديد" },
  "bg-BG": { expand: "Разширяване", collapse: "Свиване", select: "Изберете" },
  "cs-CZ": { expand: "Roztáhnout", collapse: "Sbalit", select: "Vybrat" },
  "da-DK": { expand: "Udvid", collapse: "Skjul", select: "Vælg" },
  "de-DE": { expand: "Erweitern", collapse: "Reduzieren", select: "Auswählen" },
  "el-GR": { expand: "Ανάπτυξη", collapse: "Σύμπτυξη", select: "Επιλογή" },
  "en-US": { expand: "Expand", collapse: "Collapse", select: "Select" },
  "es-ES": { expand: "Expandir", collapse: "Contraer", select: "Seleccionar" },
  "et-EE": { expand: "Laienda", collapse: "Ahenda", select: "Vali" },
  "fi-FI": { expand: "Laajenna", collapse: "Pienennä", select: "Valitse" },
  "fr-FR": { expand: "Développer", collapse: "Réduire", select: "Sélectionner" },
  "he-IL": { expand: "הרחב", collapse: "כווץ", select: "בחר" },
  "hr-HR": { expand: "Proširi", collapse: "Sažmi", select: "Odaberite" },
  "hu-HU": { expand: "Kibontás", collapse: "Összecsukás", select: "Kijelölés" },
  "it-IT": { expand: "Espandi", collapse: "Comprimi", select: "Seleziona" },
  "ja-JP": { expand: "展開", collapse: "折りたたむ", select: "選択" },
  "ko-KR": { expand: "펼치기", collapse: "접기", select: "선택" },
  "lt-LT": { expand: "Išskleisti", collapse: "Sutraukti", select: "Pasirinkti" },
  "lv-LV": { expand: "Izvērst", collapse: "Sakļaut", select: "Atlasīt" },
  "nb-NO": { expand: "Utvid", collapse: "Skjul", select: "Velg" },
  "nl-NL": { expand: "Uitvouwen", collapse: "Samenvouwen", select: "Selecteren" },
  "pl-PL": { expand: "Rozwiń", collapse: "Zwiń", select: "Zaznacz" },
  "pt-BR": { expand: "Expandir", collapse: "Recolher", select: "Selecionar" },
  "pt-PT": { expand: "Expandir", collapse: "Colapsar", select: "Selecionar" },
  "ro-RO": { expand: "Extindeți", collapse: "Restrângeți", select: "Selectare" },
  "ru-RU": { expand: "Развернуть", collapse: "Свернуть", select: "Выбрать" },
  "sk-SK": { expand: "Rozbaliť", collapse: "Zbaliť", select: "Vybrať" },
  "sl-SI": { expand: "Razširi", collapse: "Strni", select: "Izberite" },
  "sr-SP": { expand: "Proširi", collapse: "Skupi", select: "Izaberite" },
  "sv-SE": { expand: "Expandera", collapse: "Dölj", select: "Markera" },
  "tr-TR": { expand: "Genişlet", collapse: "Daralt", select: "Seç" },
  "uk-UA": { expand: "Розгорнути", collapse: "Згорнути", select: "Вибрати" },
  "zh-CN": { expand: "扩展", collapse: "折叠", select: "选择" },
  "zh-TW": { expand: "展開", collapse: "收合", select: "選取" },
});

export type TreeFocusMode = "row" | "child";

export interface TreeItemOptions {
  key: Key;
  ref: ElementRef;
  baseId: MaybeAccessor<string>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  isVirtualized?: MaybeAccessor<boolean | undefined>;
  shouldSelectOnPressUp?: MaybeAccessor<boolean | undefined>;
  /** Expandable even before its children have been loaded. */
  hasChildItems?: MaybeAccessor<boolean | undefined>;
  /**
   * Whether focus arriving on the row moves on to its first tabbable child.
   * @default "row"
   */
  focusMode?: MaybeAccessor<TreeFocusMode | undefined>;
  /**
   * Whether the arrow keys still move between rows, expand and collapse while
   * focus is on a control inside the row, under `"tab"` navigation.
   */
  allowsArrowNavigation?: MaybeAccessor<boolean | undefined>;
  /** @default "arrow" */
  keyboardNavigationBehavior?: MaybeAccessor<KeyboardNavigationBehavior | undefined>;
  /** Whether the tree has an `onAction`. Read live: the handler is a prop. */
  hasAction?: MaybeAccessor<boolean | undefined>;
  onAction?: (key: Key) => void;
  onPressStart?: (event: PressEvent) => void;
  onPressEnd?: (event: PressEvent) => void;
  onPressUp?: (event: PressEvent) => void;
  onPress?: (event: PressEvent) => void;
  onPressChange?: (isPressed: boolean) => void;
}

export interface TreeCheckboxProps {
  id: Accessor<string>;
  "aria-label": Accessor<string>;
  "aria-labelledby": Accessor<string>;
  isSelected: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
  onChange: () => void;
}

export interface TreeItemResult {
  rowProps: DOMProps;
  gridCellProps: DOMProps;
  descriptionProps: DOMProps;
  /** For the button that expands and collapses the row; see {@link TreeItemExpandButton}. */
  expandButtonProps: ButtonOptions & DOMProps;
  /** For a checkbox that selects the row; see {@link TreeItemSelectionCheckbox}. */
  checkboxProps: TreeCheckboxProps;
  /** Report that a description is rendered, for the row's name to include it. Returns the undo. */
  registerDescription(): () => void;
  isSelected: Accessor<boolean>;
  isFocused: Accessor<boolean>;
  isPressed: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
  allowsSelection: Accessor<boolean>;
  hasAction: Accessor<boolean>;
  isExpanded: Accessor<boolean>;
  hasChildItems: Accessor<boolean>;
  /** Counting from 1, as `aria-level` does. */
  level: Accessor<number>;
}

export function treeItem(options: TreeItemOptions, state: TreeState<unknown>): TreeItemResult {
  const locale = useLocale();
  const message = stringFormatter(strings);
  const key = options.key;
  function manager(): SelectionManager {
    return state.selectionManager();
  }
  // The collection is rebuilt by every expansion; the node only when the items change.
  const node = createMemo(() => state.collection().getItem(key));
  function rowId(): string {
    return rowIdFor(access(options.baseId), key);
  }
  function behavior(): KeyboardNavigationBehavior {
    return access(options.keyboardNavigationBehavior) ?? "arrow";
  }
  function focusMode(): TreeFocusMode {
    return access(options.focusMode) ?? "row";
  }
  function allowsArrows(): boolean {
    return access(options.allowsArrowNavigation) === true;
  }
  function row(): HTMLElement | null {
    return (access(options.ref) as HTMLElement | null) ?? null;
  }

  const hasChildItems = createMemo(
    () =>
      access(options.hasChildItems) === true ||
      node()?.props?.hasChildItems === true ||
      (node()?.childNodes.length ?? 0) > 0,
  );
  const isExpanded = createMemo(() => hasChildItems() && state.expandedKeys().has(key));
  function treeHasAction(): boolean {
    return access(options.hasAction) ?? options.onAction !== undefined;
  }
  function ownAction(): unknown {
    return node()?.props?.onAction;
  }

  // With nothing else for a press to do, pressing a parent row opens it.
  function togglesOnAction(): boolean {
    return (
      !treeHasAction() &&
      !manager().isLink(key) &&
      manager().selectionMode === "none" &&
      hasChildItems()
    );
  }

  const item = selectableItem({
    key,
    ref: options.ref,
    id: rowId,
    selectionManager: state.selectionManager,
    shouldSelectOnPressUp: options.shouldSelectOnPressUp,
    hasAction: () => treeHasAction() || typeof ownAction() === "function" || togglesOnAction(),
    onAction: () => {
      const own = ownAction();
      if (typeof own === "function") (own as () => void)();
      if (treeHasAction()) options.onAction?.(key);
      else if (togglesOnAction()) state.toggleKey(key);
    },
    onPressStart: options.onPressStart,
    onPressEnd: options.onPressEnd,
    onPressUp: options.onPressUp,
    onPress: options.onPress,
    onPressChange: options.onPressChange,
  });

  // Written by a description from its own component body, when it mounts.
  const [descriptions, setDescriptions] = createSignal(0, { ownedWrite: true });
  const descriptionId = id();

  /** Expand, collapse or step to the parent, if the key asks for one of those. */
  function handleExpansionKeys(event: KeyboardEvent, active: Element, element: Element): boolean {
    if (!allowsArrows() && active !== element) return false;
    if (manager().focusedKey !== key) return false;
    const rtl = locale().direction === "rtl";
    const expandKey = rtl ? "ArrowLeft" : "ArrowRight";
    const collapseKey = rtl ? "ArrowRight" : "ArrowLeft";
    const expanded = state.expandedKeys().has(key);

    if (event.key === expandKey && hasChildItems() && !expanded) {
      state.toggleKey(key);
      event.stopPropagation();
      return true;
    }
    if (event.key !== collapseKey) return false;
    if (hasChildItems() && expanded) {
      state.toggleKey(key);
      event.stopPropagation();
      return true;
    }
    const parentKey = node()?.parentKey;
    if (
      !expanded &&
      parentKey !== undefined &&
      state.collection().getItem(parentKey)?.type === "item"
    ) {
      manager().setFocusedKey(parentKey);
      event.stopPropagation();
      return true;
    }
    return false;
  }

  function lastFocusable(element: HTMLElement): HTMLElement | null {
    const walker = focusableWalker(element);
    walker.currentNode = element;
    return walker.last() as HTMLElement | null;
  }

  /**
   * Captured, not bubbled: a control inside the row would otherwise see the
   * arrow keys first, a menu button taking Down and a text field taking Left.
   */
  function onKeyDownCapture(event: KeyboardEvent): void {
    if (behavior() !== "arrow" && !allowsArrows()) return;
    const element = row();
    if (element === null || !contains(element, targetElement(event))) return;
    const active = activeElement(ownerDocument(element));
    if (active === null) return;

    if (handleExpansionKeys(event, active, element)) return;

    const rtl = locale().direction === "rtl";
    const inwards = rtl ? "ArrowLeft" : "ArrowRight";
    const outwards = rtl ? "ArrowRight" : "ArrowLeft";

    if (event.key === inwards || event.key === outwards) {
      if (behavior() !== "arrow") return;
      event.preventDefault();
      event.stopPropagation();

      const walker = focusableWalker(element);
      walker.currentNode = active;
      const next = (
        event.key === inwards ? walker.nextNode() : walker.previousNode()
      ) as HTMLElement | null;
      if (next !== null) {
        focusSafely(next);
        return;
      }
      // Off the end of the row: forwards lands back on the row itself,
      // backwards wraps to the last control.
      if (event.key === inwards) {
        standOnRow = true;
        focusSafely(element);
        return;
      }
      const last = lastFocusable(element);
      if (last !== null) focusSafely(last);
      return;
    }

    if ((event.key === "ArrowUp" || event.key === "ArrowDown") && !event.altKey) {
      // The collection's handler is on the tree, and this row is about to stop
      // the event before a child sees it, so it is sent again from the parent.
      event.preventDefault();
      event.stopPropagation();
      element.parentElement?.dispatchEvent(
        new KeyboardEvent(event.type, {
          key: event.key,
          code: event.code,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      );
    }
  }

  /** Answers whether it stopped the event, so the row's own press does not see it. */
  function onKeyDown(event: KeyboardEvent): boolean {
    const element = row();
    if (element === null || !contains(element, targetElement(event))) return false;
    const active = activeElement(ownerDocument(element));
    if (active === null || behavior() !== "tab") return false;

    // Under Tab navigation a key typed into a control in the row is the
    // control's: it must not move rows, select, or start a typeahead. Tab
    // still goes up, so the tree can let focus out.
    if (targetElement(event) !== element && event.key !== "Tab") {
      event.stopPropagation();
      return true;
    }
    if (handleExpansionKeys(event, active, element)) return true;

    if (event.key === "Tab") {
      const walker = focusableWalker(element, { tabbable: true });
      walker.currentNode = active;
      const next = event.shiftKey ? walker.previousNode() : walker.nextNode();
      if (next !== null) {
        event.stopPropagation();
        return true;
      }
    }
    return false;
  }

  function focusFirstChild(element: HTMLElement): boolean {
    const walker = focusableWalker(element, { tabbable: true });
    const first = walker.nextNode() as HTMLElement | null;
    if (first === null) return false;
    focusSafely(first);
    scrollIntoViewport(first, { containingElement: scrollParents(element)[0] ?? null });
    return true;
  }

  // Set when the arrow keys walk off the end of the row back onto it, which
  // is the one way onto a child-focused row that must not move on again.
  let standOnRow = false;

  function onFocusIn(event: FocusEvent): void {
    const element = row();
    if (element === null) return;
    if (targetElement(event) !== element) {
      // A control inside the row was focused by pointer: the row is where the
      // arrow keys now work from. From the keyboard the focused row already is.
      if (!focusIsVisible()) manager().setFocusedKey(key);
      return;
    }
    const stay = standOnRow;
    standOnRow = false;
    if (focusMode() !== "child" || stay) return;
    // Arriving from its own child is `selectableItem` focusing the row it
    // knows about; the child is the row's stand-in, so focus goes back.
    focusFirstChild(element);
  }

  const navigate = router();
  function linkData(name: string): () => unknown {
    return () => {
      const props = node()?.props;
      if (props?.href === undefined || !item.hasAction()) return undefined;
      return name === "href" ? navigate.href(props.href as string) : props[name];
    };
  }

  function parentLevelSize(): number {
    return state.collection().setSizeOf(key);
  }

  const rowProps = mergeProps(item.itemProps, {
    role: "row",
    id: rowId,
    onKeyDownCapture,
    onFocusIn,
    "data-href": linkData("href"),
    "data-target": linkData("target"),
    "data-rel": linkData("rel"),
    "data-download": linkData("download"),
    "data-ping": linkData("ping"),
    "data-referrer-policy": linkData("referrerPolicy"),
    "aria-label": () =>
      access(options["aria-label"]) ??
      (node()?.["aria-label"] || undefined) ??
      (node()?.textValue || undefined),
    "aria-labelledby": () => {
      const named =
        access(options["aria-label"]) !== undefined ||
        Boolean(node()?.["aria-label"]) ||
        Boolean(node()?.textValue);
      return descriptions() > 0 && named ? `${rowId()} ${descriptionId()}` : undefined;
    },
    "aria-selected": () => (manager().canSelectItem(key) ? item.isSelected() : undefined),
    "aria-disabled": () => manager().isDisabled(key) || undefined,
    "aria-expanded": () => (hasChildItems() ? isExpanded() : undefined),
    "aria-level": () => (node()?.level ?? 0) + 1,
    "aria-posinset": () => (node()?.index ?? 0) + 1,
    "aria-setsize": parentLevelSize,
    "aria-rowindex": () =>
      access(options.isVirtualized) === true ? state.collection().rowIndexOf(key) : undefined,
    // Focus that the row hands on to a child must not be taken back.
    tabIndex: () => {
      if (focusMode() === "child" && allowsArrows() && behavior() === "tab") return -1;
      return access(item.itemProps.tabIndex as MaybeAccessor<number | undefined>);
    },
  });

  const pressKeyDown = rowProps.onKeyDown as ((event: KeyboardEvent) => void) | undefined;
  rowProps.onKeyDown = (event: KeyboardEvent): void => {
    if (!onKeyDown(event)) pressKeyDown?.(event);
  };

  const expandButtonId = id();
  const checkboxId = id();

  return {
    rowProps,
    gridCellProps: { role: "gridcell", "aria-colindex": 1 },
    descriptionProps: { id: descriptionId },
    expandButtonProps: {
      id: expandButtonId,
      onPress: () => {
        if (item.isDisabled()) return;
        state.toggleKey(key);
        manager().setFocused(true);
        manager().setFocusedKey(key);
      },
      excludeFromTabOrder: true,
      preventFocusOnPress: true,
      [PREVENT_FOCUS_ATTRIBUTE]: true,
      "aria-label": () => message().format(isExpanded() ? "collapse" : "expand"),
      "aria-labelledby": () => `${expandButtonId()} ${rowId()}`,
    },
    checkboxProps: {
      id: checkboxId,
      "aria-label": () => message().format("select"),
      "aria-labelledby": () => `${checkboxId()} ${rowId()}`,
      isSelected: item.isSelected,
      isDisabled: () => !manager().canSelectItem(key),
      onChange: () => manager().toggleSelection(key),
    },
    registerDescription: () => {
      setDescriptions((count) => count + 1);
      return () => setDescriptions((count) => count - 1);
    },
    isSelected: item.isSelected,
    isFocused: item.isFocused,
    isPressed: item.isPressed,
    isDisabled: item.isDisabled,
    allowsSelection: item.allowsSelection,
    hasAction: item.hasAction,
    isExpanded,
    hasChildItems,
    level: () => (node()?.level ?? 0) + 1,
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface TreeContextValue {
  state: TreeState<unknown>;
  baseId: Accessor<string>;
  render: (item: unknown) => Child;
  virtual: VirtualizerValue | null;
  keyboardNavigationBehavior: Accessor<KeyboardNavigationBehavior>;
  shouldSelectOnPressUp: Accessor<boolean | undefined>;
  onAction: Accessor<((key: Key) => void) | undefined>;
  /** The tree's drag and drop, when it was given `dragAndDropHooks`. */
  dragAndDrop?: CollectionDragAndDrop | undefined;
}

const TreeContext = createContext<TreeContextValue | null>(null);
const TreeNodeContext = createContext<Node<unknown> | null>(null);

/** The tree the component being built is inside. */
export function useTree(): TreeContextValue {
  const value = getContext(TreeContext);
  if (value === null || value === undefined) {
    throw new Error("A TreeItem must be rendered inside a Tree.");
  }
  return value;
}

/** The collection node the row being built is for. */
export function useTreeNode(): Node<unknown> {
  const node = getContext(TreeNodeContext);
  if (node === null || node === undefined) {
    throw new Error("A TreeItem must be rendered inside a Tree's item callback.");
  }
  return node;
}

/** What a tree hands to its empty state. Every field follows the tree. */
export interface TreeRenderState {
  isFocused: Accessor<boolean>;
  isFocusVisible: Accessor<boolean>;
  selectionMode: Accessor<SelectionMode>;
  /** Whether a drop would land on the tree itself. */
  isDropTarget: Accessor<boolean>;
  /** Whether its rows can be dragged. */
  allowsDragging: Accessor<boolean>;
  state: TreeState<unknown>;
}

export interface TreeComponentProps<T> extends StyleProps, ItemAccessors<T> {
  /** The top-level items. Each one's children are read with `getChildren`. */
  items: Iterable<T>;
  /** How one item renders: a `<TreeItem>`, a `<TreeSection>` or a `<TreeLoadMoreItem>`. */
  children: (item: T) => Child;
  /** @default "none" */
  selectionMode?: SelectionMode;
  /** @default "toggle" */
  selectionBehavior?: SelectionBehavior;
  selectedKeys?: "all" | Iterable<Key>;
  defaultSelectedKeys?: "all" | Iterable<Key>;
  disabledKeys?: Iterable<Key>;
  /** Whether `disabledKeys` stops everything, or only selection. @default "all" */
  disabledBehavior?: DisabledBehavior;
  disallowEmptySelection?: boolean;
  expandedKeys?: Iterable<Key>;
  defaultExpandedKeys?: Iterable<Key>;
  autoFocus?: boolean | "first" | "last";
  /** @default "arrow" */
  keyboardNavigationBehavior?: KeyboardNavigationBehavior;
  /** @default "clearSelection" */
  escapeKeyBehavior?: "clearSelection" | "none";
  shouldSelectOnPressUp?: boolean;
  /** What to show when there are no items. */
  renderEmptyState?: (tree: TreeRenderState) => Child;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  ref?: RefTarget<HTMLDivElement>;
  onSelectionChange?: (keys: "all" | Set<Key>) => void;
  onExpandedChange?: (keys: Set<Key>) => void;
  onAction?: (key: Key) => void;
  /**
   * Drag and drop, from `dragAndDrop()`. A draggable row needs a
   * `<DragButton>` for keyboard and screen reader users to drag it with.
   */
  dragAndDropHooks?: DragAndDropHooks;
}

const NO_ROWS: Node<unknown>[] = [];

interface TreeRowProps {
  node: Node<unknown>;
}

/** A row followed, while it is expanded, by its descendants. */
function TreeRow(props: TreeRowProps) {
  const root = useTree();
  const node = props.node;
  const owner = getOwner();
  if (owner !== null) install(owner, TreeNodeContext, () => node);
  const drawn = root.render(node.value);
  if (node.type !== "item" || root.virtual !== null) return <>{drawn}</>;
  return (
    <>
      {drawn}
      <TreeRows nodes={root.state.expandedKeys().has(node.key) ? node.childNodes : NO_ROWS} />
    </>
  );
}

interface TreeRowsProps {
  nodes: Node<unknown>[];
}

function TreeRows(props: TreeRowsProps) {
  return <For each={props.nodes}>{(node: Node<unknown>) => <TreeRow node={node} />}</For>;
}

interface HeldDragAndDrop {
  held?: CollectionDragAndDrop;
}

/**
 * ```tsx
 * <Tree aria-label="Files" items={files()} selectionMode="multiple">
 *   {(file) => (
 *     <TreeItem>
 *       <TreeItemContent>{file.name}</TreeItemContent>
 *     </TreeItem>
 *   )}
 * </Tree>
 * ```
 *
 * Expansion is `expandedKeys` or `defaultExpandedKeys`, reported through
 * `onExpandedChange`. A row with no selection, action or link to perform
 * expands when pressed.
 */
export function Tree<T>(props: TreeComponentProps<T>) {
  const domRef = makeRef<HTMLDivElement>();
  const options = fromProps(cells(props) as unknown as Incoming<Record<string, unknown>>);
  const virtual = useVirtualizer();

  const state = treeState<T>({
    ...(options as TreeStateOptions<T>),
    layoutDelegate: virtual?.layout,
    onSelectionChange: (keys) => props.onSelectionChange?.(keys),
    onExpandedChange: (keys) => props.onExpandedChange?.(keys),
  });
  const anyState = state as unknown as TreeState<unknown>;

  const dropping: HeldDragAndDrop = {};
  virtual?.attach(
    state.collection,
    domRef,
    () => state.selectionManager().focusedKey,
    () => dropping.held?.persistedKeys() ?? [],
  );

  function isEmpty(): boolean {
    return state.collection().size === 0;
  }
  const [emptyStateIsTabbable, setEmptyStateIsTabbable] = createSignal(false);
  if (!isServer) {
    createEffect(
      () => [isEmpty(), domRef()] as const,
      ([empty, element]) => {
        setEmptyStateIsTabbable(
          empty &&
            element !== null &&
            focusableWalker(element, { tabbable: true }).nextNode() !== null,
        );
      },
    );
  }

  const { gridProps, baseId } = tree(
    {
      ...(options as unknown as TreeOptions),
      ref: domRef,
      isVirtualized: () => virtual !== null,
      layoutDelegate: virtual?.layout,
      emptyStateIsTabbable,
      hasAction: () => props.onAction !== undefined,
    },
    anyState,
  );

  const { focusProps, isFocused, isFocusVisible } = focusRing();
  function selectionMode(): SelectionMode {
    return state.selectionManager().selectionMode;
  }
  const dragAndDrop = treeDragAndDrop(props.dragAndDropHooks, anyState, domRef, virtual);
  dropping.held = dragAndDrop;
  function isDropTarget(): boolean {
    return dragAndDrop?.isRootDropTarget() === true;
  }
  function allowsDragging(): boolean {
    return dragAndDrop?.dragState !== undefined && !dragAndDrop.dragState.isDisabled();
  }

  const value: TreeContextValue = {
    state: anyState,
    baseId,
    render: props.children as unknown as (item: unknown) => Child,
    virtual,
    keyboardNavigationBehavior: () => props.keyboardNavigationBehavior ?? "arrow",
    shouldSelectOnPressUp: () => props.shouldSelectOnPressUp,
    onAction: () => props.onAction,
    dragAndDrop,
  };

  const elementProps = mergeProps(
    gridProps,
    dragAndDrop?.collectionProps,
    focusProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      "data-empty": isEmpty,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-selection-mode": () => (selectionMode() === "none" ? undefined : selectionMode()),
      "data-virtualized": () => virtual !== null,
      "data-drop-target": isDropTarget,
      "data-allows-dragging": allowsDragging,
      style: () => (virtual === null ? props.style : contentStyle(virtual.contentSize())),
    },
  );

  function windowed(): Node<unknown>[] {
    if (virtual === null) return NO_ROWS;
    const collection = state.collection();
    return virtual
      .visible()
      .map((info: LayoutInfo) => collection.getItem(info.key) as Node<unknown> | null)
      .filter((node: Node<unknown> | null): node is Node<unknown> => node !== null);
  }

  const renderState: TreeRenderState = {
    isFocused,
    isFocusVisible,
    selectionMode,
    isDropTarget,
    allowsDragging,
    state: anyState,
  };
  const renderEmptyState = callback(cells(props).renderEmptyState);

  return provide(
    TreeContext,
    () => value,
    () => (
      <>
        <div {...elementProps} ref={mergeRefs(domRef.set, props.ref)}>
          {dragAndDrop?.dropState === undefined ? null : <TreeRootDropIndicator />}
          {virtual === null ? (
            <TreeRows nodes={state.collection().rootNodes as Node<unknown>[]} />
          ) : (
            <TreeRows nodes={windowed()} />
          )}
          {() =>
            isEmpty() && renderEmptyState !== undefined ? (
              <div role="row" aria-level={1}>
                <div role="gridcell">{renderEmptyState(renderState)}</div>
              </div>
            ) : null
          }
        </div>
        {dragAndDrop?.preview}
      </>
    ),
  );
}

const EXPAND_KEYS = { ltr: "ArrowRight", rtl: "ArrowLeft" } as const;
const COLLAPSE_KEYS = { ltr: "ArrowLeft", rtl: "ArrowRight" } as const;

/**
 * The tree's drag and drop: the flat machinery, with a tree's reading of the
 * pointer, and expansion as the answer to holding a drag over a row.
 */
function treeDragAndDrop(
  hooks: DragAndDropHooks | undefined,
  state: TreeState<unknown>,
  domRef: Accessor<HTMLDivElement | null>,
  virtual: VirtualizerValue | null,
): CollectionDragAndDrop | undefined {
  if (hooks === undefined) return undefined;
  const layoutDelegate = virtual?.layout;
  const locale = useLocale();
  function direction(): "ltr" | "rtl" {
    return locale().direction;
  }
  const collection = state.collection as Accessor<Collection<unknown>>;
  function hasChildren(key: Key): boolean {
    const node = state.collection().getItem(key);
    return node !== null && (node.hasChildNodes || node.props?.hasChildItems === true);
  }

  const result: CollectionDragAndDrop = collectionDragAndDrop({
    virtual,
    hooks,
    collection,
    selectionManager: state.selectionManager,
    ref: domRef,
    // A position next to a disabled row is still a place to drop.
    keyboardDelegate: new ListKeyboardDelegate({
      collection,
      ref: domRef,
      disabledBehavior: () => "selection",
      direction,
      layoutDelegate,
    }),
    direction,
    dropTargetDelegate: (base) =>
      new TreeDropTargetDelegate(base, { collection, expandedKeys: state.expandedKeys }, direction),
    // Held over a collapsed row, the drag opens it. A screen reader user,
    // who cannot see the rows, may close it again the same way.
    onDropActivate: (event: DroppableCollectionActivateEvent) => {
      if (event.target.type !== "item") return;
      const key = event.target.key;
      const expanded = state.expandedKeys().has(key);
      if (hasChildren(key) && (!expanded || hooks.isVirtualDragging?.() === true)) {
        state.toggleKey(key);
      }
    },
    onKeyDown: (event: KeyboardEvent) => {
      const target = result.dropState?.target() ?? null;
      if (target?.type !== "item" || target.dropPosition !== "on") return;
      if (!hasChildren(target.key)) return;
      const expanded = state.expandedKeys().has(target.key);
      if (event.key === EXPAND_KEYS[direction()] && !expanded) state.toggleKey(target.key);
      else if (event.key === COLLAPSE_KEYS[direction()] && expanded) state.toggleKey(target.key);
    },
  });

  if (result.dropState !== undefined) {
    provideDropIndicator({ render: (props) => <TreeDropIndicator of={props} /> });
  }
  return result;
}

interface DropIndicatorSlot {
  of: Incoming<DropIndicatorProps>;
}

/** A drop indicator in a tree: a row at the level of the row it is beside. */
function TreeDropIndicator(indicator: DropIndicatorSlot) {
  const props = indicator.of;
  const { dragAndDropHooks, dropState } = useDragAndDropContext();
  if (dragAndDropHooks?.dropIndicator === undefined || dropState === undefined) {
    throw new Error("A DropIndicator must be rendered inside a droppable Tree.");
  }

  const target = props.target();
  const buttonRef = makeRef<HTMLDivElement>();
  const virtual = useVirtualizer();
  const { visuallyHiddenProps } = visuallyHidden();
  const { dropIndicatorProps, isDropTarget, isHidden } = dragAndDropHooks.dropIndicator(
    { target },
    dropState,
    buttonRef,
  );
  const level: () => number = () =>
    target.type === "item" ? (dropState.collection().getItem(target.key)?.level ?? 0) + 1 : 1;

  return (
    <Show when={!isHidden()}>
      <div
        class={props.class?.() ?? props.className?.()}
        style={{
          position: "relative",
          "--tree-item-level": String(level()),
          ...props.style?.(),
          ...(target.type === "item" ? dropIndicatorStyle(virtual, target) : undefined),
        }}
        role="row"
        aria-level={level()}
        data-slot={props["data-slot"]?.() ?? "drop-indicator"}
        data-drop-target={isDropTarget()}
      >
        <div role="gridcell">
          <div {...visuallyHiddenProps} role="button" {...dropIndicatorProps} ref={buttonRef.set} />
          {props.children?.()}
        </div>
      </div>
    </Show>
  );
}

/** The target for a drop on the whole tree, there for keyboard and screen reader drags. */
function TreeRootDropIndicator() {
  const { dragAndDropHooks, dropState } = useDragAndDropContext();
  if (dragAndDropHooks?.dropIndicator === undefined || dropState === undefined) return null;

  const buttonRef = makeRef<HTMLDivElement>();
  const { visuallyHiddenProps } = visuallyHidden();
  const { dropIndicatorProps, isDropTarget } = dragAndDropHooks.dropIndicator(
    { target: { type: "root" } },
    dropState,
    buttonRef,
  );
  const ariaHidden = dropIndicatorProps["aria-hidden"] as Accessor<string | undefined>;

  return (
    <Show when={isDropTarget() || ariaHidden() === undefined}>
      <div
        role="row"
        aria-hidden={ariaHidden() === "true" ? true : undefined}
        style={{ position: "absolute" }}
      >
        <div role="gridcell">
          <div {...visuallyHiddenProps} role="button" {...dropIndicatorProps} ref={buttonRef.set} />
        </div>
      </div>
    </Show>
  );
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** What a row hands to the elements drawn inside it. Every field follows the row. */
export interface TreeItemRenderState {
  id: Key;
  level: Accessor<number>;
  isExpanded: Accessor<boolean>;
  hasChildItems: Accessor<boolean>;
  isSelected: Accessor<boolean>;
  isFocused: Accessor<boolean>;
  isFocusVisible: Accessor<boolean>;
  isFocusVisibleWithin: Accessor<boolean>;
  isPressed: Accessor<boolean>;
  isHovered: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
  allowsSelection: Accessor<boolean>;
  hasAction: Accessor<boolean>;
  selectionMode: Accessor<SelectionMode>;
  selectionBehavior: Accessor<SelectionBehavior>;
  /** Whether the tree's rows can be dragged. */
  allowsDragging: Accessor<boolean>;
  isDragging: Accessor<boolean>;
  /** Whether a drop would land on this row. */
  isDropTarget: Accessor<boolean>;
  state: TreeState<unknown>;
}

interface TreeItemContextValue {
  render: TreeItemRenderState;
  item: TreeItemResult;
}

const TreeItemContext = createContext<TreeItemContextValue | null>(null);

/** The row the part being built is inside. */
export function useTreeItem(): TreeItemContextValue {
  const value = getContext(TreeItemContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a TreeItem.");
  }
  return value;
}

export interface TreeItemComponentProps extends StyleProps {
  children?: Child;
  "aria-label"?: string;
  /** Expandable even before its children have loaded. */
  hasChildItems?: boolean;
  /** @default "row" */
  focusMode?: TreeFocusMode;
  /** Let the arrow keys work from a control inside the row under `"tab"` navigation. */
  allowsArrowNavigation?: boolean;
  ref?: RefTarget<HTMLDivElement>;
  /** Performed on this row, as well as the tree's own `onAction`. */
  onAction?: () => void;
  onPress?: (event: PressEvent) => void;
  onPressStart?: (event: PressEvent) => void;
  onPressEnd?: (event: PressEvent) => void;
  onPressUp?: (event: PressEvent) => void;
  onPressChange?: (isPressed: boolean) => void;
  onHoverStart?: (event: HoverEvent) => void;
  onHoverEnd?: (event: HoverEvent) => void;
  onHoverChange?: (isHovered: boolean) => void;
  onFocusChange?: (isFocused: boolean) => void;
}

/**
 * One row, holding one cell. Its key, value, level and disabled state come
 * from the collection node the {@link Tree} is rendering.
 *
 * `--tree-item-level` is set on it, counting from 1, for indentation.
 */
export function TreeItem(props: TreeItemComponentProps) {
  const domRef = makeRef<HTMLDivElement>();
  const root = useTree();
  const node = useTreeNode();
  const options = fromProps(cells(props));
  function focusMode(): TreeFocusMode {
    return props.focusMode ?? "row";
  }
  const dnd = treeRowDragAndDrop(root, node.key);

  measureRow(root.virtual, node.key, domRef);

  const item = treeItem(
    {
      key: node.key,
      ref: domRef,
      baseId: root.baseId,
      "aria-label": () => props["aria-label"],
      isVirtualized: () => root.virtual !== null,
      // Selecting on release lets a press that becomes a drag leave the
      // selection alone, unless only the drag button starts a drag.
      shouldSelectOnPressUp: () =>
        root.shouldSelectOnPressUp() === true ||
        (dnd?.collection.dragState !== undefined &&
          dnd.collection.hooks?.pointerDragSource !== "handle") ||
        undefined,
      hasChildItems: () => props.hasChildItems,
      focusMode,
      allowsArrowNavigation: () => props.allowsArrowNavigation,
      keyboardNavigationBehavior: root.keyboardNavigationBehavior,
      hasAction: () => root.onAction() !== undefined || props.onAction !== undefined,
      onAction: (key) => {
        props.onAction?.();
        root.onAction()?.(key);
      },
      onPress: options.onPress,
      onPressStart: options.onPressStart,
      onPressEnd: options.onPressEnd,
      onPressUp: options.onPressUp,
      onPressChange: options.onPressChange,
    },
    root.state,
  );

  const { hoverProps, isHovered } = hover({
    isDisabled: () => !item.allowsSelection() && !item.hasAction() && dnd?.isDraggable() !== true,
    onHoverStart: options.onHoverStart,
    onHoverEnd: options.onHoverEnd,
    onHoverChange: options.onHoverChange,
  });
  const { focusProps: focusEventProps } = focused({ onFocusChange: options.onFocusChange });
  const { focusProps, isFocusVisible } = focusRing();
  const { focusProps: withinProps, isFocusVisible: isFocusVisibleWithin } = focusRing({
    within: true,
  });

  // A row that hands its focus to a child shows its ring while that child has
  // it: the child is standing in for the row, not one of its controls.
  const [standInFocused, setStandInFocused] = createSignal(false);
  // Read from the document rather than the event: the row's own focus
  // handler may already have moved focus on to the child by now.
  function trackStandIn(): void {
    const element = domRef();
    if (element === null || focusMode() !== "child") return;
    const first = focusableWalker(element, { tabbable: true }).nextNode();
    setStandInFocused(activeElement(ownerDocument(element)) === first);
  }
  function rowFocusVisible(): boolean {
    return (
      isFocusVisible() || (focusMode() === "child" && isFocusVisibleWithin() && standInFocused())
    );
  }

  // Memos: the selection manager is rebuilt by every expansion, and a part
  // drawn on one of these would otherwise be rebuilt with it.
  const selectionMode = createMemo(() => root.state.selectionManager().selectionMode);
  const selectionBehavior = createMemo(() => root.state.selectionManager().selectionBehavior);

  const render: TreeItemRenderState = {
    id: node.key,
    level: item.level,
    isExpanded: item.isExpanded,
    hasChildItems: item.hasChildItems,
    isSelected: item.isSelected,
    isFocused: item.isFocused,
    isFocusVisible: rowFocusVisible,
    isFocusVisibleWithin,
    isPressed: item.isPressed,
    isHovered,
    isDisabled: item.isDisabled,
    allowsSelection: item.allowsSelection,
    hasAction: item.hasAction,
    selectionMode,
    selectionBehavior,
    allowsDragging: () => dnd?.collection.dragState !== undefined,
    isDragging: () => dnd?.collection.dragState?.isDragging(node.key) === true,
    isDropTarget: () => dnd?.on?.indicator.isDropTarget() === true,
    state: root.state,
  };
  const context: TreeItemContextValue = { render, item };

  const elementProps = mergeProps(
    item.rowProps,
    hoverProps,
    focusProps,
    focusEventProps,
    withinProps,
    { onFocusIn: trackStandIn },
    filterDOMProps(options, { global: true, id: false }),
    styleProps(cells(props)),
    {
      "data-expanded": () => item.hasChildItems() && item.isExpanded(),
      "data-has-child-items": item.hasChildItems,
      "data-level": () => String(item.level()),
      "data-selected": item.isSelected,
      "data-disabled": item.isDisabled,
      "data-hovered": isHovered,
      "data-focused": item.isFocused,
      "data-focus-visible": rowFocusVisible,
      "data-pressed": item.isPressed,
      "data-selection-mode": () => (selectionMode() === "none" ? undefined : selectionMode()),
      "data-allows-dragging": render.allowsDragging,
      "data-dragging": render.isDragging,
      "data-drop-target": render.isDropTarget,
      style: () => {
        const level = { "--tree-item-level": String(item.level()) };
        if (root.virtual !== null) {
          const info = root.virtual.layout.getLayoutInfo(node.key);
          if (info !== null) return { ...rowStyle(info), ...level };
        }
        return { ...level, ...props.style };
      },
    },
  );

  // Built where it is placed, after the drop targets before it: a hydrating
  // element claims the server's next node as it is built.
  function row() {
    return (
      <div {...mergeProps(elementProps, dnd?.itemProps)} ref={mergeRefs(domRef.set, props.ref)}>
        <div {...item.gridCellProps}>
          {provide(
            TreeItemContext,
            () => context,
            () => props.children as unknown,
          )}
        </div>
      </div>
    );
  }
  if (dnd === null) return row();

  const { visuallyHiddenProps } = visuallyHidden();
  const on = dnd.on;
  const rowId = item.rowProps.id as Accessor<string>;
  const activateId = id();

  return (
    <>
      <Show when={dnd.collection.shouldRenderIndicator(dnd.before)}>
        {dnd.collection.renderDropIndicator(dnd.before)}
      </Show>
      {on === null ? null : (
        <Show when={!on.indicator.isHidden()}>
          <div
            role="row"
            aria-level={item.level()}
            aria-expanded={item.hasChildItems() ? item.isExpanded() : undefined}
            aria-label={(on.indicator.dropIndicatorProps["aria-label"] as Accessor<string>)()}
          >
            <div role="gridcell" aria-colindex={1} style={{ display: "contents" }}>
              <div
                role="button"
                {...visuallyHiddenProps}
                {...on.indicator.dropIndicatorProps}
                ref={on.ref.set}
              />
              {/* For a touch screen reader, which cannot reach the row's own expand button mid-drag. */}
              <Show when={item.hasChildItems()}>
                <div
                  role="button"
                  {...visuallyHiddenProps}
                  id={activateId()}
                  aria-label={(item.expandButtonProps["aria-label"] as Accessor<string>)()}
                  aria-labelledby={`${activateId()} ${rowId()}`}
                  tabIndex={-1}
                  ref={on.activateRef.set}
                />
              </Show>
            </div>
          </div>
        </Show>
      )}
      {row()}
      <For each={dnd.after()}>
        {(target: ItemDropTarget) => (
          <Show when={dnd.collection.shouldRenderIndicator(target)}>
            {dnd.collection.renderDropIndicator(target)}
          </Show>
        )}
      </For>
    </>
  );
}

interface TreeRowDropIndicator {
  indicator: ReturnType<NonNullable<DragAndDropHooks["dropIndicator"]>>;
  ref: ReturnType<typeof makeRef<HTMLDivElement>>;
  activateRef: ReturnType<typeof makeRef<HTMLDivElement>>;
}

interface TreeRowDragAndDrop {
  collection: CollectionDragAndDrop;
  itemProps: DOMProps;
  isDraggable: Accessor<boolean>;
  before: ItemDropTarget;
  after: Accessor<ItemDropTarget[]>;
  /** The target for a drop ON the row, apart from the row's own controls. */
  on: TreeRowDropIndicator | null;
}

/**
 * A row's part in its tree's drag and drop. A row holds controls, so a
 * `<DragButton>` inside it starts a keyboard drag rather than Enter on the row.
 */
function treeRowDragAndDrop(root: TreeContextValue, key: Key): TreeRowDragAndDrop | null {
  const collection = root.dragAndDrop;
  if (collection === undefined) return null;
  const { hooks, dragState, dropState } = collection;

  const draggable =
    dragState === undefined || hooks?.draggableItem === undefined
      ? null
      : hooks.draggableItem({ key, hasDragButton: true }, dragState);
  const dragButtonRef = makeRef<Element>();
  const slot = draggableItemSlotProps(draggable, hooks, dragButtonRef, dragButtonRef.set);
  if (draggable !== null) provideDragButton(slot.dragButton);

  let on: TreeRowDragAndDrop["on"] = null;
  if (dropState !== undefined && hooks?.dropIndicator !== undefined) {
    const ref = makeRef<HTMLDivElement>();
    const activateRef = makeRef<HTMLDivElement>();
    on = {
      ref,
      activateRef,
      indicator: hooks.dropIndicator(
        { target: { type: "item", key, dropPosition: "on" }, activateButtonRef: activateRef },
        dropState,
        ref,
      ),
    };
  }

  const after = createMemo(() => {
    const items = root.state.collection() as Collection<unknown>;
    const node = items.getItem(key);
    return node === null ? [] : afterDropIndicatorTargets(items, node);
  });

  return {
    collection,
    on,
    before: { type: "item", key, dropPosition: "before" },
    after,
    isDraggable: () =>
      dragState !== undefined &&
      !(dragState.isDisabled() || root.state.selectionManager().isDisabled(key)),
    itemProps: slot.itemProps,
  };
}

export interface TreeItemContentProps {
  /** The row's content, or a function of the row's state that returns it. */
  children?: Child | ((row: TreeItemRenderState) => Child);
}

/**
 * The content of a row, with the row's state for whatever is drawn in it.
 *
 * ```tsx
 * <TreeItemContent>
 *   {(row) => <span data-level={row.level()}>{file.name}</span>}
 * </TreeItemContent>
 * ```
 */
export function TreeItemContent(props: TreeItemContentProps) {
  const row = useTreeItem();
  const children = props.children;
  if (typeof children === "function" && children.length > 0) {
    return <>{(children as (state: TreeItemRenderState) => Child)(row.render)}</>;
  }
  return <>{children}</>;
}

export interface TreeItemExpandButtonProps extends StyleProps {
  children?: Child;
  ref?: RefTarget<HTMLButtonElement>;
}

/**
 * The button that expands and collapses its row.
 *
 * It is not a Tab stop and does not take focus when pressed: the row keeps
 * focus, and Right and Left do the same from the keyboard. It is there for a
 * pointer, and for a screen reader's touch exploration, which is why it is
 * named "Expand" or "Collapse" followed by the row's own name.
 */
export function TreeItemExpandButton(props: TreeItemExpandButtonProps) {
  const domRef = makeRef<HTMLButtonElement>();
  const row = useTreeItem();
  const { buttonProps, isPressed } = button(
    { ...(fromProps(cells(props)) as ButtonOptions), ...row.item.expandButtonProps },
    domRef,
  );
  const { hoverProps, isHovered } = hover({});
  const { onClick: _, ...forwarded } = filterDOMProps(fromProps(cells(props)), { global: true });

  const elementProps = mergeProps(
    buttonProps,
    {
      id: row.item.expandButtonProps.id,
      [PREVENT_FOCUS_ATTRIBUTE]: true,
      "aria-labelledby": row.item.expandButtonProps["aria-labelledby"],
    },
    hoverProps,
    forwarded,
    styleProps(cells(props)),
    {
      "data-expanded": row.render.isExpanded,
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-disabled": row.render.isDisabled,
    },
  );

  return (
    <button {...elementProps} ref={mergeRefs(domRef.set, props.ref)}>
      {props.children}
    </button>
  );
}

export interface TreeItemDescriptionProps extends StyleProps {
  children?: Child;
}

/** Secondary text in a row, read after the row's name. */
export function TreeItemDescription(props: TreeItemDescriptionProps) {
  const row = useTreeItem();
  onCleanup(row.item.registerDescription());
  const elementProps = mergeProps(
    filterDOMProps(fromProps(cells(props)), { global: true, id: false }),
    styleProps(cells(props)),
    row.item.descriptionProps,
  );
  return <span {...elementProps}>{props.children}</span>;
}

export interface TreeItemSelectionCheckboxProps extends StyleProps {
  /** What is drawn inside the checkbox. */
  children?: Child;
}

/**
 * A checkbox that selects its row, named "Select" followed by the row's name.
 *
 * A press on it is the checkbox's, not the row's, so under `"replace"`
 * selection it adds to the selection rather than replacing it.
 */
export function TreeItemSelectionCheckbox(props: TreeItemSelectionCheckboxProps) {
  const row = useTreeItem();
  const box = row.item.checkboxProps;
  return (
    <Checkbox
      id={box.id()}
      aria-label={box["aria-label"]()}
      aria-labelledby={box["aria-labelledby"]()}
      isSelected={box.isSelected()}
      isDisabled={box.isDisabled()}
      onChange={() => box.onChange()}
      class={props.class}
      style={props.style}
    >
      {props.children}
    </Checkbox>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

interface TreeSectionContextValue {
  headingId: Accessor<string>;
  hasHeader: Accessor<boolean>;
  registerHeader(): () => void;
}

const TreeSectionContext = createContext<TreeSectionContextValue | null>(null);

export interface TreeSectionProps extends StyleProps {
  /** A `<TreeHeader>`. The section's rows are rendered after it. */
  children?: Child;
  "aria-label"?: string;
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * A group of top-level rows, named by its `<TreeHeader>` or its `aria-label`.
 *
 * Its rows count their level and position from the section, not the tree.
 * Inside a `<Virtualizer>` the rows are a window positioned by the layout, so
 * they are siblings of the section rather than its children, and the section
 * holds only its header, placed where the layout put it.
 */
export function TreeSection(props: TreeSectionProps) {
  const root = useTree();
  const node = useTreeNode();
  const headingId = id();
  // Written by a header from its own component body, when it mounts.
  const [headers, setHeaders] = createSignal(0, { ownedWrite: true });
  const section: TreeSectionContextValue = {
    headingId,
    hasHeader: () => headers() > 0,
    registerHeader: () => {
      setHeaders((count) => count + 1);
      return () => setHeaders((count) => count - 1);
    },
  };

  const elementProps = mergeProps(
    filterDOMProps(fromProps(cells(props)), { global: true, id: false }),
    styleProps(cells(props)),
    {
      role: "rowgroup",
      "aria-label": () => props["aria-label"],
      "aria-labelledby": () =>
        props["aria-label"] === undefined && section.hasHeader() ? headingId() : undefined,
      style: () => {
        const info = root.virtual?.layout.getLayoutInfo(node.key) ?? null;
        return info === null ? props.style : rowStyle(info);
      },
    },
  );

  return (
    <div {...elementProps} ref={mergeRefs(props.ref)}>
      {provide(
        TreeSectionContext,
        () => section,
        () => (
          <>
            {props.children}
            {root.virtual === null ? <TreeRows nodes={node.childNodes} /> : null}
          </>
        ),
      )}
    </div>
  );
}

export interface TreeHeaderProps extends StyleProps {
  children?: Child;
  ref?: RefTarget<HTMLDivElement>;
}

/** The header row of a {@link TreeSection}. Not focusable: it names the group. */
export function TreeHeader(props: TreeHeaderProps) {
  const section = getContext(TreeSectionContext);
  if (section === null || section === undefined) {
    throw new Error("A TreeHeader must be rendered inside a TreeSection.");
  }
  onCleanup(section.registerHeader());
  const elementProps = mergeProps(
    filterDOMProps(fromProps(cells(props)), { global: true, id: false }),
    styleProps(cells(props)),
    { role: "row" },
  );
  return (
    <div {...elementProps} ref={mergeRefs(props.ref)}>
      <div role="rowheader" id={section.headingId()}>
        {props.children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading more
// ---------------------------------------------------------------------------

export interface TreeLoadMoreItemProps extends StyleProps {
  /** What shows while loading: a spinner, a line of text. */
  children?: Child;
  /** Whether the loading row is shown. The sentinel is there either way. */
  isLoading?: boolean;
  onLoadMore?: () => void;
  /** @default 1 */
  scrollOffset?: number;
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * Where more rows will appear, rendered for an item whose `getType` is
 * `"loader"`, at the root or as the last child of a row.
 *
 * The sentinel that asks for the next page is always rendered; the row is
 * rendered while `isLoading`. The row is not a stop for the keyboard and does
 * not count towards its siblings' `aria-setsize`.
 */
export function TreeLoadMoreItem(props: TreeLoadMoreItemProps) {
  const root = useTree();
  const node = useTreeNode();
  const sentinel = makeRef<HTMLDivElement>();
  const options = fromProps(cells(props));
  function level(): number {
    return node.level + 1;
  }
  function isLoading(): boolean {
    return props.isLoading === true && props.children !== undefined;
  }

  loadMoreSentinel(
    {
      collection: root.state.collection,
      onLoadMore: options.onLoadMore,
      scrollOffset: () => props.scrollOffset,
    },
    sentinel,
  );
  reportLoading(root.virtual, node.key, isLoading);

  const elementProps = mergeProps(
    filterDOMProps(options, { global: true, id: false }),
    styleProps(cells(props)),
    {
      role: "row",
      "aria-level": level,
      "data-level": () => String(level()),
      style: () => loaderRowStyle(root.virtual, node.key, props.style),
    },
  );

  return (
    <>
      {/* Zero-sized and inert, so it takes no room and nothing can reach it. */}
      <div style={loadMoreSentinelStyle(root.virtual, node.key)} inert>
        <div
          data-load-more-sentinel=""
          style={{ position: "absolute", width: "1px", height: "1px" }}
          ref={sentinel.set}
        />
      </div>
      {() =>
        isLoading() ? (
          <div {...elementProps} ref={mergeRefs(props.ref)}>
            <div role="gridcell" aria-colindex={1}>
              {props.children}
            </div>
          </div>
        ) : null
      }
    </>
  );
}
