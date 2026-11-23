/**
 * A table: rows and columns, navigated a CELL at a time.
 *
 * The difference from a grid list is where focus lives. A grid list has one
 * column, so a row is a place to stand; a table has many, and a screen reader
 * user reads it by moving across cells and hearing the column header with
 * each one. So the arrows move between cells in two dimensions, the column
 * headers are themselves focusable, and every cell carries `aria-colindex`.
 *
 * Three things a `<table>` of `<div>`s has to put back by hand:
 *
 * - **The row header.** One column identifies the row, and its cells are
 *   `role="rowheader"` rather than `gridcell`, so a screen reader announces
 *   "Budget, Modified, yesterday" instead of "column 3, yesterday".
 * - **Sorting.** `aria-sort` goes on the sorted column header and NOWHERE
 *   else: it names the one column the table is ordered by, and two of them is
 *   a contradiction.
 * - **The select-all checkbox** in the header, which is indeterminate when
 *   some but not all rows are selected — a state a plain checkbox has no way
 *   to be.
 */

import {
  cells,
  type Accessor,
  type Child,
  For,
  createMemo,
  createContext,
  createEffect,
  createRenderEffect,
  createSignal,
  getContext,
  getOwner,
  type Incoming,
  install,
  provide,
  Show,
  untrack,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import type {
  ItemAccessors,
  Key,
  LayoutDelegate,
  Node,
  SelectionBehavior,
  SelectionMode,
  SelectionValue,
} from "./collections.ts";
import { ListCollection } from "./collections.ts";
import {
  contentStyle,
  measureRow,
  rowStyle,
  useVirtualizer,
  type LayoutInfo,
  type VirtualizerValue,
} from "./virtualizer.tsx";
import {
  buildCollection,
  multipleSelectionState,
  SelectionManager,
  type Collection,
  type MultipleSelectionOptions,
  type MultipleSelectionState,
} from "./collections.ts";
import { button, type ButtonOptions } from "./button.tsx";
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
import {
  activeElement,
  contains,
  isScrollable,
  ownerDocument,
  PREVENT_FOCUS_ATTRIBUTE,
  targetElement,
} from "./dom.ts";
import { focusableWalker, focusRing } from "./focus.ts";
import {
  gridSelectionAnnouncement,
  type GridSelectionAnnouncementOptions,
  highlightSelectionDescription,
} from "./grid-selection.ts";
import { SelectionIndicatorProvider } from "./selection-indicator.tsx";
import { SharedElementTransition } from "./shared-element-transition.tsx";
import { collator, StringDictionary, stringFormatter, useLocale } from "./i18n.ts";
import { focusSafely } from "./interactions/focusable.ts";
import { hover } from "./interactions/hover.ts";
import { press, type ElementRef } from "./interactions/press.ts";
import { visuallyHidden } from "./live.ts";
import {
  DOMLayoutDelegate,
  ListKeyboardDelegate,
  selectableCollection,
  selectableItem,
  type Direction,
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

// ---------------------------------------------------------------------------
// The collection
// ---------------------------------------------------------------------------

/**
 * A cell's key, from its row's and its column's.
 *
 * A NUL between them, because a key is a string or a number and either may
 * contain any printable character: `"a-b" + "c"` and `"a" + "b-c"` are
 * different cells that a hyphen would give the same key.
 */
export function cellKeyFor(rowKey: Key, columnKey: Key): string {
  return `${String(rowKey)}\u0000${String(columnKey)}`;
}

export interface TableColumnProps {
  /** Let the user sort by this column. */
  allowsSorting?: boolean;
  /** This column's cells identify their row. */
  isRowHeader?: boolean;
  [key: string]: unknown;
}

export interface SortDescriptor {
  column: Key;
  direction: "ascending" | "descending";
}

/**
 * Rows and columns, presenting the ROWS as its items.
 *
 * Selection, "select all" and the focus repair all work in terms of what a
 * user selects, which is a row; the cells exist for `getItem` and for the
 * keyboard delegate, which walks them by index.
 */
/**
 * A cell's text, for typeahead.
 *
 * Anything that is not already a string or a number has no text a user could
 * type: `String({})` is "[object Object]", which matches nothing and reads as
 * garbage to a screen reader.
 */
function cellText(props: unknown, column: Key): string {
  const value = (props as Record<string, unknown> | undefined)?.[String(column)];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/** Where a row sits among its siblings, for a table whose rows nest. */
export interface TableRowPosition {
  /** Counting from 1, as `aria-posinset` does. */
  posinset: number;
  setsize: number;
  hasChildRows: boolean;
}

export interface TableCollectionOptions {
  /** Where the footer's rows start in `rows`. @default `rows.length` */
  footerStart?: number;
  /** Each visible row's place among its siblings, when the rows nest. */
  tree?: Map<Key, TableRowPosition>;
}

export class TableCollection<R, C> implements Collection<R> {
  readonly columns: Node<C>[];
  /** Every row that can be reached: the body's, expanded ones' children, then the footer's. */
  readonly rows: Node<R>[];
  readonly rowHeaderColumns: Node<C>[];
  readonly footerStart: number;
  #tree: Map<Key, TableRowPosition> | null;
  #rowIndex = new Map<Key, number>();
  #columnIndex = new Map<Key, number>();
  #cells = new Map<Key, { row: Node<R>; column: Node<C>; index: number }>();

  constructor(rows: Node<R>[], columns: Node<C>[], options: TableCollectionOptions = {}) {
    this.rows = rows;
    this.columns = columns;
    this.footerStart = Math.min(options.footerStart ?? rows.length, rows.length);
    this.#tree = options.tree ?? null;
    rows.forEach((row, at) => this.#rowIndex.set(row.key, at));
    columns.forEach((column, at) => this.#columnIndex.set(column.key, at));
    // Composed once rather than parsed on every lookup, so a key that happens
    // to contain the separator misses rather than resolving to the wrong cell.
    for (const row of rows) {
      columns.forEach((column, index) => {
        this.#cells.set(cellKeyFor(row.key, column.key), { row, column, index });
      });
    }

    const declared = columns.filter((column) => column.props?.isRowHeader === true);
    // Without one declared, the FIRST column identifies the row. A table with
    // no row header at all is one a screen reader reads as a wall of values.
    this.rowHeaderColumns = declared.length > 0 ? declared : columns.slice(0, 1);
  }

  get size(): number {
    return this.rows.length;
  }

  get bodyRows(): Node<R>[] {
    return this.rows.slice(0, this.footerStart);
  }

  get footerRows(): Node<R>[] {
    return this.rows.slice(this.footerStart);
  }

  /** Whether the rows nest, which is what makes the table a tree grid. */
  get isTree(): boolean {
    return this.#tree !== null;
  }

  rowPosition(key: Key): TableRowPosition | null {
    return this.#tree?.get(key) ?? null;
  }

  *[Symbol.iterator](): IterableIterator<Node<R>> {
    yield* this.rows;
  }

  *getKeys(): IterableIterator<Key> {
    for (const row of this.rows) yield row.key;
  }

  rowIndexOf(key: Key): number {
    return this.#rowIndex.get(key) ?? -1;
  }

  columnIndexOf(key: Key): number {
    return this.#columnIndex.get(key) ?? -1;
  }

  /**
   * The row and column a cell key names, or null if it names neither.
   *
   * Looked up rather than split: splitting gives back strings, and a row or
   * column keyed by a number would then name no cell at all.
   */
  parseCellKey(key: Key): { row: Node<R>; column: Node<C>; index: number } | null {
    return this.#cells.get(key) ?? null;
  }

  getItem(key: Key): Node<R> | null {
    const at = this.#rowIndex.get(key);
    if (at !== undefined) return this.rows[at] as Node<R>;

    const cell = this.parseCellKey(key);
    if (cell !== null) {
      return {
        type: "cell",
        key,
        value: cell.row.value,
        textValue: cellText(cell.row.props, cell.column.key),
        level: 1,
        index: cell.index,
        parentKey: cell.row.key,
        hasChildNodes: false,
        childNodes: [],
        props: cell.row.props,
      } as unknown as Node<R>;
    }

    const columnAt = this.#columnIndex.get(key);
    if (columnAt !== undefined) return this.columns[columnAt] as unknown as Node<R>;
    return null;
  }

  getKeyBefore(key: Key): Key | null {
    const at = this.#rowIndex.get(key);
    if (at === undefined || at === 0) return null;
    return (this.rows[at - 1] as Node<R>).key;
  }

  getKeyAfter(key: Key): Key | null {
    const at = this.#rowIndex.get(key);
    if (at === undefined || at >= this.rows.length - 1) return null;
    return (this.rows[at + 1] as Node<R>).key;
  }

  getFirstKey(): Key | null {
    return this.rows[0]?.key ?? null;
  }

  getLastKey(): Key | null {
    return this.rows[this.rows.length - 1]?.key ?? null;
  }

  getChildren(): Iterable<Node<R>> {
    return [];
  }

  at(index: number): Node<R> | null {
    return this.rows[index] ?? null;
  }
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export interface TableKeyboardDelegateOptions<R, C> {
  collection: Accessor<TableCollection<R, C>>;
  disabledKeys?: Accessor<Set<Key>>;
  direction?: MaybeAccessor<Direction | undefined>;
  collator?: Accessor<Intl.Collator>;
  /** The grid element, for deciding whether a page is a page at all. */
  ref?: ElementRef;
  /**
   * Where the rows are.
   *
   * The DOM when the table renders all of them. A VIRTUALISED table must pass
   * its layout instead, because Page Down has to reach a row that is not in
   * the document yet and no measurement of the document can find one.
   */
  layoutDelegate?: LayoutDelegate;
}

/**
 * Two-dimensional navigation over cells and column headers.
 *
 * Up from the first row reaches the COLUMN HEADER, which is how a keyboard
 * user sorts a table without a pointer. Left and right follow the writing
 * direction and stop at the ends rather than wrapping: wrapping from the last
 * column of one row to the first of the next reads as a jump nobody asked for.
 */
export class TableKeyboardDelegate<R, C> implements KeyboardDelegate {
  #options: TableKeyboardDelegateOptions<R, C>;

  #layout: LayoutDelegate;

  constructor(options: TableKeyboardDelegateOptions<R, C>) {
    this.#options = options;
    this.#layout =
      options.layoutDelegate ?? new DOMLayoutDelegate(options.ref ?? ((): null => null));
  }

  get #collection(): TableCollection<R, C> {
    return this.#options.collection();
  }

  get #rtl(): boolean {
    return (access(this.#options.direction) ?? "ltr") === "rtl";
  }

  #isDisabled(row: Node<R>): boolean {
    return this.#options.disabledKeys?.().has(row.key) === true || row.props?.isDisabled === true;
  }

  /** Where a key stands: a column header, or a cell at (row, column). */
  #locate(key: Key): { rowAt: number; columnAt: number } | null {
    const collection = this.#collection;
    const columnAt = collection.columnIndexOf(key);
    if (columnAt >= 0) return { rowAt: -1, columnAt };
    const cell = collection.parseCellKey(key);
    if (cell === null) return null;
    return { rowAt: collection.rowIndexOf(cell.row.key), columnAt: cell.index };
  }

  #cellAt(rowAt: number, columnAt: number): Key | null {
    const collection = this.#collection;
    if (rowAt < 0) return collection.columns[columnAt]?.key ?? null;
    const row = collection.rows[rowAt];
    const column = collection.columns[columnAt];
    if (row === undefined || column === undefined) return null;
    return cellKeyFor(row.key, column.key);
  }

  /** The next row in a direction that is not disabled. */
  #rowStep(from: number, by: 1 | -1): number | null {
    const collection = this.#collection;
    for (let at = from + by; at >= 0 && at < collection.rows.length; at += by) {
      const row = collection.rows[at];
      if (row !== undefined && !this.#isDisabled(row)) return at;
    }
    return null;
  }

  getKeyBelow(key: Key): Key | null {
    const at = this.#locate(key);
    if (at === null) return null;
    // From a column header, into the first row of that column.
    if (at.rowAt === -1) {
      const first = this.#rowStep(-1, 1);
      return first === null ? null : this.#cellAt(first, at.columnAt);
    }
    const next = this.#rowStep(at.rowAt, 1);
    return next === null ? null : this.#cellAt(next, at.columnAt);
  }

  getKeyAbove(key: Key): Key | null {
    const at = this.#locate(key);
    if (at === null || at.rowAt === -1) return null;
    const previous = this.#rowStep(at.rowAt, -1);
    // Off the top of the body: the column header, so sorting is reachable.
    if (previous === null) return this.#cellAt(-1, at.columnAt);
    return this.#cellAt(previous, at.columnAt);
  }

  #sideways(key: Key, by: 1 | -1): Key | null {
    const at = this.#locate(key);
    if (at === null) return null;
    const columnAt = at.columnAt + (this.#rtl ? -by : by);
    if (columnAt < 0 || columnAt >= this.#collection.columns.length) return null;
    return this.#cellAt(at.rowAt, columnAt);
  }

  getKeyRightOf(key: Key): Key | null {
    return this.#sideways(key, 1);
  }

  getKeyLeftOf(key: Key): Key | null {
    return this.#sideways(key, -1);
  }

  /**
   * As far as the arrows can go from here, in one direction.
   *
   * Not `getFirstKey`/`getLastKey`: those land in the first COLUMN, and a page
   * key must keep the column it started in. Walking with the arrow steps also
   * skips a disabled row exactly as an arrow key does.
   */
  #edge(key: Key, step: (from: Key) => Key | null): Key {
    let at = key;
    for (;;) {
      const next = step(at);
      if (next === null || next === at) return at;
      at = next;
    }
  }

  /**
   * A page up or down, measured in ROWS.
   *
   * The column is kept: Page Down from the third column lands on the third
   * column of a row a viewport away, which is what makes paging through a wide
   * table usable.
   */
  getKeyPageAbove(key: Key): Key | null {
    const container = access(this.#options.ref) as HTMLElement | null;
    const up = (from: Key): Key | null => this.getKeyAbove(from);

    let rect = this.#layout.getItemRect(key);
    // Nothing scrolls, or nothing can be measured: a page is the whole table.
    if (rect === null || (container !== null && !isScrollable(container))) {
      return this.#edge(key, up);
    }

    const visible = this.#layout.getVisibleRect();
    const top = Math.max(0, rect.y + rect.height - visible.height);
    let at: Key = key;

    while (rect !== null && rect.y > top) {
      const next = up(at);
      if (next === null) break;
      at = next;
      rect = this.#layout.getItemRect(at);
    }

    return at;
  }

  getKeyPageBelow(key: Key): Key | null {
    const container = access(this.#options.ref) as HTMLElement | null;
    const down = (from: Key): Key | null => this.getKeyBelow(from);

    let rect = this.#layout.getItemRect(key);
    if (rect === null || (container !== null && !isScrollable(container))) {
      return this.#edge(key, down);
    }

    const visible = this.#layout.getVisibleRect();
    const content = this.#layout.getContentSize();
    const bottom = Math.min(content.height, rect.y - rect.height + visible.height);
    let at: Key = key;

    while (rect !== null && rect.y < bottom) {
      const next = down(at);
      if (next === null) break;
      at = next;
      rect = this.#layout.getItemRect(at);
    }

    return at;
  }

  /**
   * Home: the start of the row focus is in. With `global` (Control or
   * Command held) or nowhere to start from, the first cell of the table.
   *
   * The writing direction does not enter into it: the first cell is the
   * first column, whichever side of the screen that column is drawn on.
   */
  getFirstKey(fromKey?: Key | null, global?: boolean): Key | null {
    const at = fromKey === undefined || fromKey === null ? null : this.#locate(fromKey);
    if (at !== null && global !== true) return this.#cellAt(at.rowAt, 0);
    const first = this.#rowStep(-1, 1);
    if (first === null) return null;
    return this.#cellAt(first, 0);
  }

  /** End: the end of the row focus is in, or with `global` the table's last cell. */
  getLastKey(fromKey?: Key | null, global?: boolean): Key | null {
    const at = fromKey === undefined || fromKey === null ? null : this.#locate(fromKey);
    const lastColumn = this.#collection.columns.length - 1;
    if (at !== null && global !== true) return this.#cellAt(at.rowAt, lastColumn);
    const last = this.#rowStep(this.#collection.rows.length, -1);
    if (last === null) return null;
    return this.#cellAt(last, fromKey === undefined || fromKey === null ? 0 : lastColumn);
  }

  getKeyForSearch(search: string, fromKey?: Key | null): Key | null {
    const compare = this.#options.collator?.();
    if (compare === undefined) return null;
    const collection = this.#collection;
    const at = fromKey === undefined || fromKey === null ? null : this.#locate(fromKey);
    const columnAt = at?.columnAt ?? 0;
    const start = at === null || at.rowAt < 0 ? 0 : at.rowAt + 1;

    for (let step = 0; step < collection.rows.length; step++) {
      const rowAt = (start + step) % collection.rows.length;
      const row = collection.rows[rowAt];
      if (row === undefined || this.#isDisabled(row)) continue;
      const text = row.textValue;
      if (compare.compare(text.slice(0, search.length), search) === 0) {
        return this.#cellAt(rowAt, columnAt);
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * Whether keys inside a cell move between cells or between the controls the
 * cell holds.
 *
 * `arrow` walks the arrows through a cell's controls on the way across the
 * row. `tab` leaves the arrows to the cells and lets Tab reach the controls
 * inside the focused one, so a text field in a cell keeps its own arrow keys.
 */
export type TableKeyboardNavigationBehavior = "arrow" | "tab";

export interface TableStateOptions<R, C> extends MultipleSelectionOptions {
  items?: MaybeAccessor<Iterable<R> | undefined>;
  columns?: MaybeAccessor<Iterable<C> | undefined>;
  /** The footer's rows, after the body's. */
  footerItems?: MaybeAccessor<Iterable<R> | undefined>;
  rowAccessors?: MaybeAccessor<ItemAccessors<R> | undefined>;
  columnAccessors?: MaybeAccessor<ItemAccessors<C> | undefined>;
  sortDescriptor?: MaybeAccessor<SortDescriptor | undefined>;
  /** Show a checkbox column. @default true where selection is possible */
  showSelectionCheckboxes?: MaybeAccessor<boolean | undefined>;
  onSortChange?: (descriptor: SortDescriptor) => void;
  /**
   * The column whose cells expand and collapse their row.
   *
   * Setting it makes a row's children (`item.children`, or `getChildren`)
   * rows of their own, shown while the row is expanded, and the table a tree
   * grid. Without it the rows are flat and children are ignored.
   */
  treeColumn?: MaybeAccessor<Key | undefined>;
  expandedKeys?: MaybeAccessor<Iterable<Key> | undefined>;
  defaultExpandedKeys?: MaybeAccessor<Iterable<Key> | undefined>;
  onExpandedChange?: (keys: Set<Key>) => void;
  /** @default "arrow" */
  keyboardNavigationBehavior?: MaybeAccessor<TableKeyboardNavigationBehavior | undefined>;
}

export interface TableState<R, C> {
  collection: Accessor<TableCollection<R, C>>;
  selectionManager: Accessor<SelectionManager>;
  disabledKeys: Accessor<Set<Key>>;
  sortDescriptor: Accessor<SortDescriptor | undefined>;
  showSelectionCheckboxes: Accessor<boolean>;
  /** Sort by a column, flipping the direction when it is already the one. */
  sort(column: Key): void;
  treeColumn?: Accessor<Key | null>;
  expandedKeys?: Accessor<Set<Key>>;
  /** Expand a collapsed row, or collapse an expanded one. */
  toggleKey?(key: Key): void;
  keyboardNavigationBehavior?: Accessor<TableKeyboardNavigationBehavior>;
}

/**
 * Move the roving focus off a row that is gone.
 *
 * The focused key is a CELL, and a cell names its row. When the row is
 * deleted nothing holds `tabindex="0"` any more while the grid itself still
 * says -1, because something inside is focused, and Tab can no longer reach
 * the table at all. The cell in the same column of the row that took its
 * place takes focus instead: the next row that survives, or the one before
 * when it was the last. With no rows left the key is cleared, which hands the
 * Tab stop back to the grid.
 */
function repairFocus<R, C>(
  collection: Accessor<TableCollection<R, C>>,
  selectionManager: Accessor<SelectionManager>,
  selection: MultipleSelectionState,
): void {
  let previous: TableCollection<R, C> | null = null;

  createRenderEffect(
    (): { current: TableCollection<R, C>; repair: boolean; next: Key | null } => {
      const current = collection();
      const focused = selection.focusedKey();
      if (focused === null || previous === null || current.getItem(focused) !== null) {
        return { current, repair: false, next: null };
      }

      const old = previous;
      const manager = selectionManager();
      const columnKey = (): Key | null => {
        const cell = old.parseCellKey(focused);
        const at = cell?.index ?? Math.max(0, old.columnIndexOf(focused));
        const kept = cell === null ? null : current.columnIndexOf(cell.column.key);
        const column =
          kept !== null && kept >= 0
            ? current.columns[kept]
            : current.columns[Math.min(at, current.columns.length - 1)];
        return column?.key ?? null;
      };

      // A column that went away: its neighbour in the header.
      if (old.columnIndexOf(focused) >= 0) {
        return { current, repair: true, next: columnKey() };
      }

      const rowKey = old.parseCellKey(focused)?.row.key ?? focused;
      const from = old.rowIndexOf(rowKey);
      const survives = (row: Node<R> | undefined): row is Node<R> =>
        row !== undefined && current.rowIndexOf(row.key) >= 0 && !manager.isDisabled(row.key);

      let row: Node<R> | undefined;
      for (let at = from + 1; at < old.rows.length && row === undefined; at++) {
        if (survives(old.rows[at])) row = old.rows[at];
      }
      for (let at = from - 1; at >= 0 && row === undefined; at--) {
        if (survives(old.rows[at])) row = old.rows[at];
      }

      const column = columnKey();
      const next = row === undefined || column === null ? null : cellKeyFor(row.key, column);
      return { current, repair: true, next };
    },
    ({ current, repair, next }) => {
      if (repair) selection.setFocusedKey(next);
      previous = current;
    },
  );
}

function namedText(item: unknown): string | null {
  const record = item as Record<string, unknown> | null | undefined;
  const text = record?.textValue ?? record?.label ?? record?.name ?? record?.title;
  return typeof text === "string" ? text : null;
}

export function tableState<R, C>(options: TableStateOptions<R, C>): TableState<R, C> {
  const selection = multipleSelectionState(options);

  const toSet = (keys: Iterable<Key> | undefined): Set<Key> | undefined =>
    keys === undefined ? undefined : new Set(keys);
  const [expandedKeys, setExpandedKeys] = controllable<Set<Key>>(
    () => toSet(access(options.expandedKeys)),
    () => toSet(access(options.defaultExpandedKeys)) ?? new Set(),
    options.onExpandedChange,
  );
  const treeColumn = (): Key | null => access(options.treeColumn) ?? null;

  // Built apart from the flattening, so expanding a row keeps every node it
  // already had: a list keyed by node would otherwise rebuild each row, and
  // the cell holding focus with it.
  const built = createMemo(() => {
    // Accessors are a value like any other prop, so a component hands them
    // over as a Cell around the object.
    const columns = [
      ...buildCollection(access(options.columns) ?? [], access(options.columnAccessors) ?? {}),
    ];
    const declared = columns.filter((column) => column.props?.isRowHeader === true);
    const headers = declared.length > 0 ? declared : columns.slice(0, 1);

    // A row has no text of its own to type: it is cells. Without a name on
    // the item, what a user can type is what the row header cells show, and
    // never `String(item)`, which is "[object Object]".
    const given = access(options.rowAccessors) ?? {};
    const getProps = callback(given.getProps);
    const rowAccessors: ItemAccessors<R> = {
      ...given,
      // A row with children is a row that nests, never a section. The
      // parameter is declared because `callback` reads a function of no
      // arguments as a Cell around one.
      getType: callback(given.getType) ?? ((_row: R): "item" => "item"),
      getTextValue:
        callback(given.getTextValue) ??
        ((item: R): string =>
          namedText(item) ??
          headers
            .map((column) => cellText(getProps?.(item) ?? item, column.key))
            .filter((text) => text !== "")
            .join(" ")),
    };

    return {
      columns,
      body: [...buildCollection(access(options.items) ?? [], rowAccessors)],
      footer: [...buildCollection(access(options.footerItems) ?? [], rowAccessors)],
    };
  });

  const collection = createMemo(() => {
    const { columns, body, footer } = built();
    const isTree = treeColumn() !== null;
    const expanded = isTree ? expandedKeys() : new Set<Key>();
    const tree = isTree ? new Map<Key, TableRowPosition>() : undefined;
    const rows: Node<R>[] = [];
    const visit = (siblings: Node<R>[]): void => {
      siblings.forEach((node, at) => {
        rows.push(node);
        tree?.set(node.key, {
          posinset: at + 1,
          setsize: siblings.length,
          hasChildRows: node.childNodes.length > 0,
        });
        if (expanded.has(node.key)) visit(node.childNodes);
      });
    };
    visit(body);

    const footerStart = rows.length;
    rows.push(...footer);

    return new TableCollection<R, C>(rows, columns, { footerStart, tree });
  });

  const selectionManager = createMemo(
    () => new SelectionManager(collection() as unknown as Collection<unknown>, selection),
  );

  repairFocus(collection, selectionManager, selection);

  return {
    collection,
    selectionManager,
    disabledKeys: selection.disabledKeys,
    treeColumn,
    expandedKeys,
    toggleKey: (key) => {
      const next = new Set(expandedKeys());
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setExpandedKeys(next);
    },
    keyboardNavigationBehavior: () => access(options.keyboardNavigationBehavior) ?? "arrow",
    sortDescriptor: () => access(options.sortDescriptor),
    showSelectionCheckboxes: () =>
      access(options.showSelectionCheckboxes) ?? selection.selectionMode() === "multiple",
    sort: (column) => {
      const current = access(options.sortDescriptor);
      // The same column again flips the direction; a different one starts
      // ascending, because that is what a first click on a column means.
      const direction =
        current?.column === column && current.direction === "ascending"
          ? "descending"
          : "ascending";
      options.onSortChange?.({ column, direction });
    },
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface TableOptions {
  ref: ElementRef;
  /** Where the rows are, when the DOM cannot answer because they are not in it. */
  layoutDelegate?: LayoutDelegate;
  isVirtualized?: MaybeAccessor<boolean | undefined>;
  disallowEmptySelection?: MaybeAccessor<boolean | undefined>;
  disallowTypeAhead?: MaybeAccessor<boolean | undefined>;
  keyboardDelegate?: KeyboardDelegate;
  /** Whether a row has an action, which a tap then performs instead of selecting. */
  hasAction?: MaybeAccessor<boolean | undefined>;
  /** What a row is called when its selection is announced. @default its text value */
  getRowText?: GridSelectionAnnouncementOptions["getRowText"];
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
}

export interface TableResult {
  gridProps: DOMProps;
  baseId: Accessor<string>;
}

export function table<R, C>(options: TableOptions, state: TableState<R, C>): TableResult {
  const baseId = id();
  const locale = useLocale();
  const search = collator({ usage: "search", sensitivity: "base" });

  const delegate =
    options.keyboardDelegate ??
    new TableKeyboardDelegate<R, C>({
      collection: state.collection,
      disabledKeys: state.disabledKeys,
      direction: () => locale().direction,
      collator: search,
      ref: options.ref,
      layoutDelegate: options.layoutDelegate,
    });

  const { collectionProps } = selectableCollection({
    ref: options.ref,
    selectionManager: state.selectionManager,
    keyboardDelegate: delegate,
    disallowEmptySelection: options.disallowEmptySelection,
    disallowTypeAhead: options.disallowTypeAhead,
    // The focused key is a CELL and a selected key is a ROW; selecting what
    // focus lands on would select cells.
    selectOnFocus: false,
  });

  const descriptionProps = highlightSelectionDescription({
    selectionManager: state.selectionManager,
    hasItemActions: options.hasAction,
  });
  gridSelectionAnnouncement({ getRowText: options.getRowText }, state);

  return {
    baseId,
    gridProps: mergeProps(
      filterDOMProps(options, { labelable: true }),
      collectionProps,
      descriptionProps,
      {
        role: () => (state.collection().isTree ? "treegrid" : "grid"),
        id: baseId,
        "aria-multiselectable": () =>
          state.selectionManager().selectionMode === "multiple" ? true : undefined,
        "aria-rowcount": () =>
          // The header row counts: a screen reader saying "row 1 of 8" for the
          // first body row of seven is off by the header it just read.
          access(options.isVirtualized) === true ? state.collection().size + 1 : undefined,
        "aria-colcount": () =>
          access(options.isVirtualized) === true ? state.collection().columns.length : undefined,
      },
    ),
  };
}

/**
 * Focus for something that is a PLACE, not a value.
 *
 * A cell and a column header both take focus and neither is ever selected, so
 * `selectableItem` is the wrong tool: the only way to tell it something is not
 * selectable is to call it disabled, and a disabled item also refuses the
 * roving focus — so its two effects then fight over who holds it and neither
 * lets go.
 *
 * Under `child` focus a place that holds controls passes focus on to them: a
 * cell holding a button is reached as the button, or the button could never
 * be reached from the keyboard at all. Which end of the cell is entered at
 * follows the direction focus arrived from.
 */
function focusPlace(
  key: Key,
  ref: ElementRef,
  manager: Accessor<SelectionManager>,
  focusMode: () => "cell" | "child" = () => "cell",
): { props: DOMProps; isFocused: Accessor<boolean> } {
  const isFocused = (): boolean => manager().isFocused && manager().focusedKey === key;

  const enter = (element: HTMLElement): void => {
    // Focus already on something inside is where the user put it.
    const active = activeElement(ownerDocument(element));
    if (active !== element && contains(element, active)) return;
    if (focusMode() === "child") {
      const walker = focusableWalker(element);
      const child = (
        manager().childFocusStrategy === "last" ? walker.last() : walker.nextNode()
      ) as HTMLElement | null;
      if (child !== null) {
        focusSafely(child);
        return;
      }
    }
    if (activeElement(ownerDocument(element)) !== element) focusSafely(element);
  };

  if (!isServer) {
    createEffect(
      () => {
        if (manager().focusedKey !== key || !manager().isFocused) return null;
        return { element: access(ref) as HTMLElement | null };
      },
      (focused) => {
        if (focused === null) return;
        const { element } = focused;
        if (element !== null) untrack(() => enter(element));
      },
    );
  }

  return {
    isFocused,
    props: {
      "data-key": String(key),
      // A roving tabindex over the whole grid: exactly one place is in the Tab
      // order, and the grid itself is the stop until something inside is.
      tabIndex: () => (manager().focusedKey === key ? 0 : -1),
      onFocus: (event: FocusEvent) => {
        const element = access(ref) as HTMLElement | null;
        if (element === null || targetElement(event) !== element) return;
        if (manager().focusedKey !== key) {
          manager().setFocusedKey(key);
          return;
        }
        // Already the focused place, so no effect will run: a press on the
        // cell's padding still lands on what the cell holds.
        if (focusMode() === "child") enter(element);
      },
      // A control inside took focus directly, by a press or by Tab: the place
      // holding it is where the roving focus is now, or the grid's own focus
      // handling would pull focus back to wherever it was before.
      onFocusIn: (event: FocusEvent) => {
        const element = access(ref) as HTMLElement | null;
        const target = targetElement(event);
        if (element === null || target === element || !contains(element, target)) return;
        if (manager().focusedKey !== key) manager().setFocusedKey(key);
      },
    },
  };
}

export interface TableColumnHeaderOptions {
  column: Node<unknown>;
  ref: ElementRef;
  baseId: MaybeAccessor<string>;
}

export interface TableColumnHeaderResult {
  columnHeaderProps: DOMProps;
  isFocused: Accessor<boolean>;
  isPressed: Accessor<boolean>;
  allowsSorting: Accessor<boolean>;
  sortDirection: Accessor<"ascending" | "descending" | undefined>;
}

export function tableColumnHeader<R, C>(
  options: TableColumnHeaderOptions,
  state: TableState<R, C>,
): TableColumnHeaderResult {
  const allowsSorting = (): boolean => options.column.props?.allowsSorting === true;

  const sortDirection = (): "ascending" | "descending" | undefined => {
    const descriptor = state.sortDescriptor();
    return descriptor?.column === options.column.key ? descriptor.direction : undefined;
  };

  const place = focusPlace(options.column.key, options.ref, state.selectionManager);
  const sortByColumn = (): void => {
    state.sort(options.column.key);
  };
  const { pressProps, isPressed } = press({
    ref: options.ref,
    isDisabled: () => !allowsSorting(),
    onPress: sortByColumn,
  });

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!allowsSorting()) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    state.sort(options.column.key);
  };

  return {
    allowsSorting,
    sortDirection,
    isFocused: place.isFocused,
    isPressed,
    columnHeaderProps: mergeProps(place.props, pressProps, {
      id: () => columnHeaderIdFor(access(options.baseId), options.column.key),
      role: "columnheader",
      onKeyDown,
      // On the SORTED column only. `aria-sort="none"` on the others says the
      // table is unsorted, which contradicts the one that says it is not.
      "aria-sort": sortDirection,
      "aria-colindex": () => state.collection().columnIndexOf(options.column.key) + 1,
    }),
  };
}

export interface TableRowOptions {
  row: Node<unknown>;
  ref: ElementRef;
  baseId: MaybeAccessor<string>;
  isVirtualized?: MaybeAccessor<boolean | undefined>;
  onAction?: (key: Key) => void;
  /** See `selectableItem`. @default `onAction !== undefined` */
  hasAction?: MaybeAccessor<boolean | undefined>;
  /** Select on pointer up rather than down, as a draggable row does. */
  shouldSelectOnPressUp?: MaybeAccessor<boolean | undefined>;
}

export interface TableRowResult {
  rowProps: DOMProps;
  /** Options for {@link button}, for the control that expands the row. */
  expandButtonProps: ButtonOptions & DOMProps;
  isSelected: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
  isPressed: Accessor<boolean>;
  isExpanded: Accessor<boolean>;
  hasChildRows: Accessor<boolean>;
}

const strings = new StringDictionary<"expand" | "collapse">({
  "ar-AE": { expand: "تمديد", collapse: "طي" },
  "bg-BG": { expand: "Разширяване", collapse: "Свиване" },
  "cs-CZ": { expand: "Roztáhnout", collapse: "Sbalit" },
  "da-DK": { expand: "Udvid", collapse: "Skjul" },
  "de-DE": { expand: "Erweitern", collapse: "Reduzieren" },
  "el-GR": { expand: "Ανάπτυξη", collapse: "Σύμπτυξη" },
  "en-US": { expand: "Expand", collapse: "Collapse" },
  "es-ES": { expand: "Ampliar", collapse: "Contraer" },
  "et-EE": { expand: "Laienda", collapse: "Ahenda" },
  "fi-FI": { expand: "Laajenna", collapse: "Pienennä" },
  "fr-FR": { expand: "Développer", collapse: "Réduire" },
  "he-IL": { expand: "הרחב", collapse: "כווץ" },
  "hr-HR": { expand: "Proširi", collapse: "Sažmi" },
  "hu-HU": { expand: "Kibontás", collapse: "Összecsukás" },
  "it-IT": { expand: "Espandi", collapse: "Comprimi" },
  "ja-JP": { expand: "展開", collapse: "折りたたむ" },
  "ko-KR": { expand: "펼치기", collapse: "접기" },
  "lt-LT": { expand: "Išskleisti", collapse: "Sutraukti" },
  "lv-LV": { expand: "Izvērst", collapse: "Sakļaut" },
  "nb-NO": { expand: "Utvid", collapse: "Skjul" },
  "nl-NL": { expand: "Uitvouwen", collapse: "Samenvouwen" },
  "pl-PL": { expand: "Rozwiń", collapse: "Zwiń" },
  "pt-BR": { expand: "Expandir", collapse: "Recolher" },
  "pt-PT": { expand: "Expandir", collapse: "Colapsar" },
  "ro-RO": { expand: "Extindeți", collapse: "Restrângeți" },
  "ru-RU": { expand: "Развернуть", collapse: "Свернуть" },
  "sk-SK": { expand: "Rozbaliť", collapse: "Zbaliť" },
  "sl-SI": { expand: "Razširi", collapse: "Strni" },
  "sr-SP": { expand: "Proširi", collapse: "Skupi" },
  "sv-SE": { expand: "Expandera", collapse: "Dölj" },
  "tr-TR": { expand: "Genişlet", collapse: "Daralt" },
  "uk-UA": { expand: "Розгорнути", collapse: "Згорнути" },
  "zh-CN": { expand: "扩展", collapse: "折叠" },
  "zh-TW": { expand: "展開", collapse: "收合" },
});

export function tableRow<R, C>(options: TableRowOptions, state: TableState<R, C>): TableRowResult {
  const manager = (): SelectionManager => state.selectionManager();
  const message = stringFormatter(strings);
  const key = options.row.key;
  const position = (): TableRowPosition | null => state.collection().rowPosition(key);
  const hasChildRows = (): boolean => position()?.hasChildRows === true;
  const isExpanded = (): boolean => hasChildRows() && state.expandedKeys?.().has(key) === true;

  const item = selectableItem({
    key,
    ref: options.ref,
    selectionManager: state.selectionManager,
    isDisabled: () => options.row.props?.isDisabled === true,
    hasAction: () => access(options.hasAction) ?? options.onAction !== undefined,
    onAction: () => options.onAction?.(key),
    shouldSelectOnPressUp: options.shouldSelectOnPressUp,
  });

  const rowHeaderIds = (): string =>
    state
      .collection()
      .rowHeaderColumns.map((column) => cellIdFor(access(options.baseId), key, column.key))
      .join(" ");

  const expandButtonId = id();

  return {
    isSelected: item.isSelected,
    isDisabled: item.isDisabled,
    isPressed: item.isPressed,
    isExpanded,
    hasChildRows,
    rowProps: mergeProps(item.itemProps, {
      role: "row",
      // The row itself is never the Tab stop: focus lives in a cell.
      tabIndex: () => undefined,
      "aria-selected": () => (manager().canSelectItem(key) ? item.isSelected() : undefined),
      "aria-disabled": () => item.isDisabled() || undefined,
      // A nested row's place is its level and its position among siblings,
      // which a flat row index would contradict.
      "aria-rowindex": () =>
        access(options.isVirtualized) === true && !state.collection().isTree
          ? state.collection().rowIndexOf(key) + 2
          : undefined,
      "aria-expanded": () => (hasChildRows() ? isExpanded() : undefined),
      "aria-level": () => (position() === null ? undefined : options.row.level + 1),
      "aria-posinset": () => position()?.posinset,
      "aria-setsize": () => position()?.setsize,
      "aria-labelledby": rowHeaderIds,
    }),
    expandButtonProps: {
      id: expandButtonId,
      isDisabled: item.isDisabled,
      excludeFromTabOrder: true,
      // The keyboard expands from the tree column's cell, so the button is a
      // pointer's alone and must not take focus away from that cell.
      preventFocusOnPress: true,
      [PREVENT_FOCUS_ATTRIBUTE]: true,
      "aria-label": () => message().format(isExpanded() ? "collapse" : "expand"),
      "aria-labelledby": () => `${expandButtonId()} ${rowHeaderIds()}`,
      onPress: () => {
        if (item.isDisabled()) return;
        state.toggleKey?.(key);
        const column = state.treeColumn?.() ?? state.collection().columns[0]?.key;
        if (column === undefined) return;
        manager().setFocused(true);
        manager().setFocusedKey(cellKeyFor(key, column));
      },
    },
  };
}

/** The id a cell renders under. */
export function cellIdFor(baseId: string, rowKey: Key, columnKey: Key): string {
  return `${baseId}-cell-${String(rowKey)}-${String(columnKey)}`;
}

/**
 * The id a column header renders under.
 *
 * Derived from the table's own id for the reason `cellIdFor` is: two tables
 * with a column of the same key would otherwise write the same id twice. A
 * header needs one at all so that anything naming a column — a resize handle,
 * a caller's own summary — has something to point at.
 */
export function columnHeaderIdFor(baseId: string, columnKey: Key): string {
  return `${baseId}-column-${String(columnKey)}`;
}

export interface TableCellOptions {
  row: Node<unknown>;
  column: Node<unknown>;
  ref: ElementRef;
  baseId: MaybeAccessor<string>;
  /**
   * Whether focusing the cell focuses the first control inside it.
   *
   * @default "child", or "cell" when the table navigates by Tab
   */
  focusMode?: MaybeAccessor<"cell" | "child" | undefined>;
}

export interface TableCellResult {
  gridCellProps: DOMProps;
  isFocused: Accessor<boolean>;
  isPressed: Accessor<boolean>;
}

/** Every focusable element inside `element`, in order. */
function focusablesIn(element: HTMLElement): HTMLElement[] {
  const walker = focusableWalker(element);
  const found: HTMLElement[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    found.push(node as HTMLElement);
  }
  return found;
}

export function tableCell<R, C>(
  options: TableCellOptions,
  state: TableState<R, C>,
): TableCellResult {
  const key = cellKeyFor(options.row.key, options.column.key);
  const locale = useLocale();
  const manager = (): SelectionManager => state.selectionManager();
  const behavior = (): TableKeyboardNavigationBehavior =>
    state.keyboardNavigationBehavior?.() ?? "arrow";
  const focusMode = (): "cell" | "child" =>
    access(options.focusMode) ?? (behavior() === "tab" ? "cell" : "child");

  const isRowHeader = (): boolean =>
    state.collection().rowHeaderColumns.some((column) => column.key === options.column.key);

  // Focus only. What a press on a cell MEANS is the row's business, and the
  // row has its own `selectableItem` for it.
  const place = focusPlace(key, options.ref, state.selectionManager, focusMode);

  const cellElement = (): HTMLElement | null => (access(options.ref) as HTMLElement | null) ?? null;

  /**
   * The expand and collapse keys, in the cell of the tree column.
   *
   * A tree grid row is opened with the arrow that points into it and closed
   * with the one pointing back out, and from a closed or childless row that
   * one goes up to the parent. Only then does the arrow move between cells.
   */
  const expansionKey = (event: KeyboardEvent): boolean => {
    if (state.treeColumn?.() !== options.column.key) return false;
    const position = state.collection().rowPosition(options.row.key);
    if (position === null || manager().isDisabled(options.row.key)) return false;

    const rtl = locale().direction === "rtl";
    const expand = rtl ? "ArrowLeft" : "ArrowRight";
    const collapse = rtl ? "ArrowRight" : "ArrowLeft";
    const expanded = state.expandedKeys?.().has(options.row.key) === true;

    if (event.key === expand && position.hasChildRows && !expanded) {
      state.toggleKey?.(options.row.key);
      return true;
    }
    if (event.key !== collapse) return false;
    if (position.hasChildRows && expanded) {
      state.toggleKey?.(options.row.key);
      return true;
    }
    const parent = options.row.parentKey;
    if (parent === undefined || state.collection().rowIndexOf(parent) < 0) return false;
    manager().setFocusedKey(cellKeyFor(parent, options.column.key));
    return true;
  };

  /**
   * Left and right walk the controls inside the cell before they leave it.
   *
   * Under `child` focus the cell itself is never stood on, so the walk ends
   * at its first control; under `cell` focus it goes back to the cell. At
   * either end the key is left to the grid, which moves to the next cell.
   */
  const onKeyDownCapture = (event: KeyboardEvent): void => {
    const element = cellElement();
    if (element === null || !contains(element, targetElement(event))) return;
    if (expansionKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (behavior() === "tab") return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    const forwards = (event.key === "ArrowRight") === (locale().direction !== "rtl");
    const controls = focusablesIn(element);
    const active = activeElement(ownerDocument(element));
    const at = active === element ? -1 : controls.indexOf(active as HTMLElement);

    let target: HTMLElement | null = null;
    if (forwards) target = controls[at + 1] ?? null;
    else if (at > 0) target = controls[at - 1] ?? null;
    else if (at === 0 && focusMode() === "cell") target = element;
    if (target === null) return;

    event.preventDefault();
    event.stopPropagation();
    focusSafely(target);
  };

  /**
   * With Tab navigation the keys typed into a control in the cell are the
   * control's: a text field's arrows move its caret and its letters are not a
   * typeahead. Tab itself stays inside the cell while there is somewhere in
   * it to go, and leaves the grid otherwise.
   */
  const onKeyDown = (event: KeyboardEvent): void => {
    if (behavior() !== "tab") return;
    const element = cellElement();
    const target = targetElement(event);
    if (element === null || !contains(element, target)) return;

    if (event.key !== "Tab") {
      if (target !== element) event.stopPropagation();
      return;
    }

    const active = activeElement(ownerDocument(element));
    if (event.shiftKey) {
      // Back to the cell, or to an earlier control in it.
      if (active !== element) event.stopPropagation();
      return;
    }
    const walker = focusableWalker(element, { tabbable: true });
    if (active !== null && contains(element, active)) walker.currentNode = active;
    if (walker.nextNode() !== null) event.stopPropagation();
  };

  return {
    isFocused: place.isFocused,
    isPressed: () => false,
    gridCellProps: mergeProps(place.props, {
      id: () => cellIdFor(access(options.baseId), options.row.key, options.column.key),
      role: () => (isRowHeader() ? "rowheader" : "gridcell"),
      "aria-colindex": () => state.collection().columnIndexOf(options.column.key) + 1,
      onKeyDownCapture,
      onKeyDown,
    }),
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface TableContextValue {
  state: TableState<unknown, unknown>;
  baseId: Accessor<string>;
  onAction: Accessor<((key: Key) => void) | undefined>;
  /** Set when the table is inside a `<Virtualizer>`. */
  virtual: VirtualizerValue | null;
  /** Where a `<TableFooter>` hands over its rows. */
  setFooterItems?: (items: Accessor<Iterable<unknown> | undefined>) => void;
  /** The table's drag and drop, when it was given `dragAndDropHooks`. */
  dragAndDrop?: CollectionDragAndDrop | undefined;
  /**
   * Whether the table was given drag hooks, for a caller deciding whether to
   * render a column for the `<DragButton>`. True while disabled too: the
   * column stays, and its buttons say they are disabled.
   */
  allowsDragging: Accessor<boolean>;
}

const TableContext = createContext<TableContextValue | null>(null);
const RowContext = createContext<Node<unknown> | null>(null);
const ColumnContext = createContext<Node<unknown> | null>(null);
const RowStateContext = createContext<TableRowResult | null>(null);

export function useTable(): TableContextValue {
  const value = getContext(TableContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a Table.");
  }
  return value;
}

export function useRow(): Node<unknown> {
  const node = getContext(RowContext);
  if (node === null || node === undefined) {
    throw new Error("A Cell must be rendered inside a Row.");
  }
  return node;
}

export function useColumn(): Node<unknown> {
  const node = getContext(ColumnContext);
  if (node === null || node === undefined) {
    throw new Error("This must be rendered inside a column callback.");
  }
  return node;
}

function TableProvider(props: { value: TableContextValue; children?: Child }) {
  return provide(
    TableContext,
    () => props.value,
    () => props.children as unknown,
  );
}

export interface TableComponentProps<R, C> extends StyleProps {
  /** The columns, left to right. */
  columns: Iterable<C>;
  /** The rows, top to bottom. */
  items: Iterable<R>;
  children?: Child;
  rowAccessors?: ItemAccessors<R>;
  columnAccessors?: ItemAccessors<C>;
  /** @default "none" */
  selectionMode?: SelectionMode;
  /** @default "toggle" */
  selectionBehavior?: SelectionBehavior;
  selectedKeys?: "all" | Iterable<Key>;
  defaultSelectedKeys?: "all" | Iterable<Key>;
  disabledKeys?: Iterable<Key>;
  disallowEmptySelection?: boolean;
  sortDescriptor?: SortDescriptor;
  /** See {@link TableKeyboardNavigationBehavior}. @default "arrow" */
  keyboardNavigationBehavior?: TableKeyboardNavigationBehavior;
  /** The column whose cells expand their row. See {@link TableStateOptions.treeColumn}. */
  treeColumn?: Key;
  expandedKeys?: Iterable<Key>;
  defaultExpandedKeys?: Iterable<Key>;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLDivElement>;
  onSelectionChange?: (keys: "all" | Set<Key>) => void;
  onSortChange?: (descriptor: SortDescriptor) => void;
  onAction?: (key: Key) => void;
  onExpandedChange?: (keys: Set<Key>) => void;
  /**
   * Drag and drop, from `dragAndDrop()`. A draggable row needs a cell holding
   * a `<DragButton>` for keyboard and screen reader users to drag it with.
   */
  dragAndDropHooks?: DragAndDropHooks;
}

/**
 * ```tsx
 * <Table aria-label="Files" columns={COLUMNS} items={files()}
 *        sortDescriptor={sort()} onSortChange={sort.set}>
 *   <TableHeader>{(column) => <Column>{column.name}</Column>}</TableHeader>
 *   <TableBody>
 *     {(file) => <Row>{(column) => <Cell>{file[column.id]}</Cell>}</Row>}
 *   </TableBody>
 * </Table>
 * ```
 */
export function Table<R, C>(props: TableComponentProps<R, C>) {
  const domRef = makeRef<HTMLDivElement>();
  const options = fromProps(cells(props) as unknown as Incoming<Record<string, unknown>>);

  // Boxed, because the footer hands over an accessor and a signal holding a
  // function would call it. `ownedWrite`: the footer writes from its body.
  const [footer, setFooter] = createSignal<{ read: Accessor<Iterable<unknown> | undefined> }>(
    { read: () => undefined },
    { ownedWrite: true },
  );

  const state = tableState<R, C>({
    ...(options as unknown as TableStateOptions<R, C>),
    footerItems: () => footer().read() as Iterable<R> | undefined,
    onSelectionChange: (keys: SelectionValue) => props.onSelectionChange?.(keys),
    onSortChange: (descriptor) => props.onSortChange?.(descriptor),
    onExpandedChange: (keys) => props.onExpandedChange?.(keys),
  });

  // Inside a `<Virtualizer>` the table renders a WINDOW of its rows, and the
  // layout — not the DOM — answers what is above, below and a page away. Only
  // the BODY is windowed: the header is one row and always on screen.
  const virtual = useVirtualizer();
  const dropping: { held?: CollectionDragAndDrop } = {};
  virtual?.attach(
    () => rowsOnly(state.collection()),
    domRef,
    () => state.selectionManager().focusedKey,
    () => dropping.held?.persistedKeys() ?? [],
  );

  const { gridProps, baseId } = table(
    {
      ...(options as unknown as TableOptions),
      ref: domRef,
      isVirtualized: () => virtual !== null,
      layoutDelegate: virtual?.layout,
      hasAction: () => props.onAction !== undefined,
    },
    state,
  );

  const dragAndDrop = tableDragAndDrop(props.dragAndDropHooks, state, domRef, virtual);
  dropping.held = dragAndDrop;
  const hasDragHooks = (): boolean => dragAndDrop?.dragState !== undefined;
  const allowsDragging = (): boolean =>
    hasDragHooks() && dragAndDrop?.dragState?.isDisabled() !== true;

  const value: TableContextValue = {
    state,
    baseId,
    onAction: () => props.onAction,
    virtual,
    setFooterItems: (items) => setFooter({ read: items }),
    dragAndDrop,
    allowsDragging: hasDragHooks,
  };

  const { focusProps, isFocused, isFocusVisible } = focusRing();

  const elementProps = mergeProps(
    gridProps,
    dragAndDrop?.collectionProps,
    focusProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      "data-empty": () => state.collection().size === 0,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-virtualized": () => virtual !== null,
      "data-drop-target": () => dragAndDrop?.isRootDropTarget() === true,
      "data-allows-dragging": allowsDragging,
      "data-testid": () => props["data-testid"],
      style: () => (virtual === null ? props.style : contentStyle(virtual.contentSize())),
    },
  );

  return (
    <TableProvider value={value}>
      <div {...elementProps} ref={mergeRefs(domRef.set, props.ref)}>
        <SharedElementTransition>{props.children}</SharedElementTransition>
      </div>
      {dragAndDrop?.preview}
    </TableProvider>
  );
}

/**
 * The body's rows, as the collection drag and drop works over.
 *
 * Neither the footer's rows nor the column headers are places to drop, and a
 * cell answers as itself so that a focused cell can be read as its row.
 */
class TableBodyRows<R, C> implements Collection<R> {
  #table: TableCollection<R, C>;

  constructor(rows: TableCollection<R, C>) {
    this.#table = rows;
  }

  #inBody(key: Key | undefined): boolean {
    if (key === undefined) return false;
    const at = this.#table.rowIndexOf(key);
    return at >= 0 && at < this.#table.footerStart;
  }

  get size(): number {
    return this.#table.footerStart;
  }

  *[Symbol.iterator](): IterableIterator<Node<R>> {
    yield* this.#table.bodyRows;
  }

  *getKeys(): IterableIterator<Key> {
    for (const row of this.#table.bodyRows) yield row.key;
  }

  getItem(key: Key): Node<R> | null {
    if (this.#inBody(key)) return this.#table.getItem(key);
    const cell = this.#table.parseCellKey(key);
    return cell !== null && this.#inBody(cell.row.key) ? this.#table.getItem(key) : null;
  }

  getKeyBefore(key: Key): Key | null {
    return this.#inBody(key) ? this.#table.getKeyBefore(key) : null;
  }

  getKeyAfter(key: Key): Key | null {
    if (!this.#inBody(key)) return null;
    const next = this.#table.getKeyAfter(key);
    return next !== null && this.#inBody(next) ? next : null;
  }

  getFirstKey(): Key | null {
    return this.#table.bodyRows[0]?.key ?? null;
  }

  getLastKey(): Key | null {
    return this.#table.bodyRows.at(-1)?.key ?? null;
  }

  getChildren(key: Key): Iterable<Node<R>> {
    return this.getItem(key)?.childNodes ?? [];
  }

  at(index: number): Node<R> | null {
    return index < this.#table.footerStart ? (this.#table.rows[index] ?? null) : null;
  }
}

const EXPAND_KEYS = { ltr: "ArrowRight", rtl: "ArrowLeft" } as const;
const COLLAPSE_KEYS = { ltr: "ArrowLeft", rtl: "ArrowRight" } as const;

/**
 * The table's drag and drop: over the body's rows, with a tree's reading of
 * the pointer for rows that nest, and focus after a drop given to a cell.
 */
function tableDragAndDrop(
  hooks: DragAndDropHooks | undefined,
  state: TableState<unknown, unknown>,
  domRef: Accessor<HTMLDivElement | null>,
  virtual: VirtualizerValue | null,
): CollectionDragAndDrop | undefined {
  if (hooks === undefined) return undefined;
  const layoutDelegate = virtual?.layout;
  const locale = useLocale();
  const direction = (): "ltr" | "rtl" => locale().direction;
  const body = createMemo(
    () => new TableBodyRows(state.collection()) as unknown as Collection<unknown>,
  );
  const expandedKeys = (): Set<Key> => state.expandedKeys?.() ?? new Set<Key>();
  const hasChildren = (key: Key): boolean => {
    const node = body().getItem(key);
    return node !== null && node.type === "item" && node.hasChildNodes;
  };

  // Rows do not take focus here, cells do: a row is focused as its cell in
  // the column focus was last in, or else its first.
  const focusKeyFor = (rowKey: Key): Key => {
    const collection = state.collection();
    const focused = state.selectionManager().focusedKey;
    const cell = focused === null ? null : collection.parseCellKey(focused);
    const column = cell?.column.key ?? collection.columns[0]?.key;
    return column === undefined ? rowKey : cellKeyFor(rowKey, column);
  };

  const result: CollectionDragAndDrop = collectionDragAndDrop({
    virtual,
    hooks,
    collection: body,
    selectionManager: state.selectionManager,
    ref: domRef,
    // A position next to a disabled row is still a place to drop.
    keyboardDelegate: new ListKeyboardDelegate({
      collection: body,
      ref: domRef,
      disabledBehavior: () => "selection",
      direction,
      layoutDelegate,
    }),
    direction,
    dropTargetDelegate: (base) =>
      new TreeDropTargetDelegate(base, { collection: body, expandedKeys }, direction),
    // Held over a collapsed row, the drag opens it; a screen reader user may
    // close it again the same way.
    onDropActivate: (event: DroppableCollectionActivateEvent) => {
      if (event.target.type !== "item" || state.toggleKey === undefined) return;
      const key = event.target.key;
      const expanded = expandedKeys().has(key);
      if (hasChildren(key) && (!expanded || hooks.isVirtualDragging?.() === true)) {
        state.toggleKey(key);
      }
    },
    onKeyDown: (event: KeyboardEvent) => {
      const target = result.dropState?.target() ?? null;
      if (target?.type !== "item" || target.dropPosition !== "on") return;
      if (!hasChildren(target.key) || state.toggleKey === undefined) return;
      const expanded = expandedKeys().has(target.key);
      if (event.key === EXPAND_KEYS[direction()] && !expanded) state.toggleKey(target.key);
      else if (event.key === COLLAPSE_KEYS[direction()] && expanded) state.toggleKey(target.key);
    },
    focusKeyFor,
  });

  if (result.dropState !== undefined) {
    provideDropIndicator({ render: (props) => <TableDropIndicator of={props} /> });
  }
  return result;
}

/** A drop indicator in a table: a row whose one cell spans every column. */
function TableDropIndicator(indicator: { of: Incoming<DropIndicatorProps> }) {
  const props = indicator.of;
  const grid = useTable();
  const { dragAndDropHooks, dropState } = useDragAndDropContext();
  if (dragAndDropHooks?.dropIndicator === undefined || dropState === undefined) {
    throw new Error("A DropIndicator must be rendered inside a droppable Table.");
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
  const level = (): number =>
    target.type === "item" ? (dropState.collection().getItem(target.key)?.level ?? 0) + 1 : 1;
  const isTree = (): boolean => grid.state.collection().isTree;

  return (
    <Show when={!isHidden()}>
      <div
        class={props.class?.() ?? props.className?.()}
        style={{
          "--table-row-level": String(level() + 1),
          ...props.style?.(),
          ...(target.type === "item" ? dropIndicatorStyle(virtual, target) : undefined),
        }}
        role="row"
        aria-level={isTree() ? level() : undefined}
        data-slot={props["data-slot"]?.() ?? "drop-indicator"}
        data-drop-target={isDropTarget()}
      >
        <div
          role="gridcell"
          aria-colspan={grid.state.collection().columns.length}
          style={{ "grid-column": "1 / -1", padding: "0" }}
        >
          <div {...visuallyHiddenProps} role="button" {...dropIndicatorProps} ref={buttonRef.set} />
          {props.children?.()}
        </div>
      </div>
    </Show>
  );
}

/** The target for a drop on the whole table, there for keyboard and screen reader drags. */
function TableRootDropIndicator() {
  const grid = useTable();
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
        style={{ height: "0" }}
      >
        <div
          role="gridcell"
          aria-colspan={grid.state.collection().columns.length}
          style={{ "grid-column": "1 / -1", padding: "0" }}
        >
          <div {...visuallyHiddenProps} role="button" {...dropIndicatorProps} ref={buttonRef.set} />
        </div>
      </div>
    </Show>
  );
}

export interface TableHeaderComponentProps<C> extends StyleProps {
  /** How one column header renders. Return a `<Column>`. */
  children: (column: C) => Child;
}

/** The header row group, holding one row of column headers. */
export function TableHeader<C>(props: TableHeaderComponentProps<C>) {
  const grid = useTable();
  const render = props.children;

  const elementProps = mergeProps(
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      role: "rowgroup",
      "data-testid": () => props["data-testid"],
    },
  );

  return (
    <div {...elementProps}>
      <div role="row" aria-rowindex={1}>
        <For each={() => grid.state.collection().columns}>
          {(column: Node<unknown>) => {
            const rowOwner = getOwner();
            if (rowOwner !== null) install(rowOwner, ColumnContext, () => column);
            return render(column.value as C);
          }}
        </For>
      </div>
    </div>
  );
}

export interface ColumnComponentProps extends StyleProps {
  children?: Child;
  ref?: RefTarget<HTMLDivElement>;
}

/** One column header. Sortable when its column says so. */
export function Column(props: ColumnComponentProps) {
  const domRef = makeRef<HTMLDivElement>();
  const grid = useTable();
  const column = useColumn();

  const { columnHeaderProps, isFocused, isPressed, allowsSorting, sortDirection } =
    tableColumnHeader({ column, ref: domRef, baseId: grid.baseId }, grid.state);

  const { hoverProps, isHovered } = hover({});
  const { focusProps, isFocusVisible } = focusRing();

  const elementProps = mergeProps(
    columnHeaderProps,
    hoverProps,
    focusProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      "data-sortable": allowsSorting,
      "data-allows-sorting": allowsSorting,
      "data-sort-direction": sortDirection,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-testid": () => props["data-testid"],
    },
  );

  return (
    <div {...elementProps} ref={mergeRefs(domRef.set, props.ref)}>
      {props.children}
    </div>
  );
}

export interface TableBodyComponentProps<R> extends StyleProps {
  /** How one row renders. Return a `<Row>`. */
  children: (item: R) => Child;
  /** Shown when there are no rows. */
  renderEmpty?: Child;
}

/** Rows of one part of the table, or the window of them the virtualiser says is on screen. */
function rowsOf(grid: TableContextValue, part: "body" | "footer"): Node<unknown>[] {
  const collection = grid.state.collection();
  const inPart = (row: Node<unknown>): boolean =>
    collection.rowIndexOf(row.key) < collection.footerStart === (part === "body");
  const virtual = grid.virtual;
  if (virtual === null) return part === "body" ? collection.bodyRows : collection.footerRows;
  return virtual
    .visible()
    .map((info: LayoutInfo) => collection.getItem(info.key))
    .filter((row: Node<unknown> | null): row is Node<unknown> => row !== null && inPart(row));
}

function renderRows(rows: () => Node<unknown>[], render: (item: never) => Child) {
  return (
    <For each={rows()}>
      {(row: Node<unknown>) => {
        const rowOwner = getOwner();
        if (rowOwner !== null) install(rowOwner, RowContext, () => row);
        return render(row.value as never);
      }}
    </For>
  );
}

/**
 * The body row group.
 *
 * With no rows, `renderEmpty` is shown in one cell spanning every column,
 * inside a row: a grid's children are rows and a row's are cells, and a
 * message set loose in the row group is content a screen reader skips.
 */
export function TableBody<R>(props: TableBodyComponentProps<R>) {
  const grid = useTable();
  const render = props.children;
  const isEmpty = (): boolean => grid.state.collection().bodyRows.length === 0;

  const droppable = grid.dragAndDrop?.dropState !== undefined;

  const elementProps = mergeProps(
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      role: "rowgroup",
      "data-empty": isEmpty,
      "data-drop-target": () => grid.dragAndDrop?.isRootDropTarget() === true,
      "data-testid": () => props["data-testid"],
    },
  );

  return (
    <div {...elementProps}>
      {droppable ? <TableRootDropIndicator /> : null}
      {renderRows(() => rowsOf(grid, "body"), render)}
      <Show when={isEmpty() && props.renderEmpty !== undefined}>
        <div role="row" aria-rowindex={grid.virtual === null ? undefined : 2}>
          <div
            role="gridcell"
            aria-colindex={1}
            aria-colspan={grid.state.collection().columns.length}
            style={{ "grid-column": "1 / -1" }}
          >
            {props.renderEmpty}
          </div>
        </div>
      </Show>
    </div>
  );
}

export interface TableFooterComponentProps<R> extends StyleProps {
  /** The footer's rows: a total, a summary. */
  items: Iterable<R>;
  /** How one row renders. Return a `<Row>`. */
  children: (item: R) => Child;
}

/**
 * The footer row group, after the body.
 *
 * Its rows are rows of the table like any other: the arrows move into them
 * from the last row of the body, so a total is read with its column header.
 *
 * ```tsx
 * <TableFooter items={[{ id: "total", name: "Total", size: "52 KB" }]}>
 *   {(total) => <Row>{(column) => <Cell>{total[column.id]}</Cell>}</Row>}
 * </TableFooter>
 * ```
 */
export function TableFooter<R>(props: TableFooterComponentProps<R>) {
  const grid = useTable();
  const render = props.children;
  grid.setFooterItems?.(() => props.items);

  const elementProps = mergeProps(
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      role: "rowgroup",
      "data-testid": () => props["data-testid"],
    },
  );

  return <div {...elementProps}>{renderRows(() => rowsOf(grid, "footer"), render)}</div>;
}

export interface RowComponentProps<C> extends StyleProps {
  /** How one cell of this row renders. Return a `<Cell>`. */
  children: (column: C) => Child;
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * Just the body rows, as a collection a layout can walk.
 *
 * A table's collection holds columns and rows together, and only the rows are
 * windowed: the header is one row and is always on screen.
 */
function rowsOnly(collection: TableCollection<unknown, unknown>): Collection<unknown> {
  return new ListCollection(collection.rows);
}

/** One row, holding a cell per column. */
export function Row<C>(props: RowComponentProps<C>) {
  const domRef = makeRef<HTMLDivElement>();
  const grid = useTable();
  const row = useRow();
  const dnd = rowDragAndDrop(grid, row.key);

  measureRow(grid.virtual, row.key, domRef);

  const rowState = tableRow(
    {
      row,
      ref: domRef,
      baseId: grid.baseId,
      isVirtualized: () => grid.virtual !== null,
      hasAction: () => grid.onAction() !== undefined,
      onAction: (key) => grid.onAction()?.(key),
      // Selecting on release lets a press that becomes a drag leave the
      // selection alone, unless only the drag button starts a drag.
      shouldSelectOnPressUp: () =>
        dnd?.collection.dragState !== undefined &&
        dnd.collection.hooks?.pointerDragSource !== "handle",
    },
    grid.state,
  );
  const { rowProps, isSelected, isDisabled, isPressed, isExpanded, hasChildRows } = rowState;

  const { hoverProps, isHovered } = hover({ isDisabled });
  const { focusProps: withinProps, isFocusVisible: isFocusVisibleWithin } = focusRing({
    within: true,
  });

  const elementProps = mergeProps(
    rowProps,
    hoverProps,
    withinProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      "data-selected": isSelected,
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-disabled": isDisabled,
      "data-focus-visible-within": isFocusVisibleWithin,
      "data-selection-mode": () => {
        const mode = grid.state.selectionManager().selectionMode;
        return mode === "none" ? undefined : mode;
      },
      "data-expanded": isExpanded,
      "data-has-child-items": hasChildRows,
      "data-level": () => (grid.state.collection().isTree ? row.level + 1 : undefined),
      "data-dragging": () => dnd?.collection.dragState?.isDragging(row.key) === true,
      "data-drop-target": () => dnd?.on?.indicator.isDropTarget() === true,
      "data-testid": () => props["data-testid"],
      // Positioned by the LAYOUT: the rows above it are not rendered, so
      // document flow has nothing to place it against.
      style: () => {
        const virtual = grid.virtual;
        if (virtual === null) return props.style;
        const info = virtual.layout.getLayoutInfo(row.key);
        return info === null ? props.style : rowStyle(info);
      },
    },
  );

  const render = props.children;

  const element = (
    <div {...mergeProps(elementProps, dnd?.itemProps)} ref={mergeRefs(domRef.set, props.ref)}>
      {provide(
        RowStateContext,
        () => rowState,
        () => (
          <SelectionIndicatorProvider isSelected={isSelected()}>
            <For each={() => grid.state.collection().columns}>
              {(column: Node<unknown>) => {
                const cellOwner = getOwner();
                if (cellOwner !== null) install(cellOwner, ColumnContext, () => column);
                return render(column.value as C);
              }}
            </For>
          </SelectionIndicatorProvider>
        ),
      )}
    </div>
  );
  if (dnd === null) return element;

  const { visuallyHiddenProps } = visuallyHidden();
  const on = dnd.on;

  return (
    <>
      <Show when={dnd.collection.shouldRenderIndicator(dnd.before)}>
        {dnd.collection.renderDropIndicator(dnd.before)}
      </Show>
      {on === null ? null : (
        <Show when={!on.indicator.isHidden()}>
          <div role="row" style={{ height: "0" }}>
            <div
              role="gridcell"
              aria-colspan={grid.state.collection().columns.length}
              style={{ "grid-column": "1 / -1", padding: "0" }}
            >
              <div
                role="button"
                {...visuallyHiddenProps}
                {...on.indicator.dropIndicatorProps}
                ref={on.ref.set}
              />
            </div>
          </div>
        </Show>
      )}
      {element}
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

interface RowDragAndDrop {
  collection: CollectionDragAndDrop;
  itemProps: DOMProps;
  before: ItemDropTarget;
  after: Accessor<ItemDropTarget[]>;
  /** The target for a drop ON the row: rows here take no focus, so it is a row of its own. */
  on: {
    indicator: ReturnType<NonNullable<DragAndDropHooks["dropIndicator"]>>;
    ref: ReturnType<typeof makeRef<HTMLDivElement>>;
  } | null;
}

/**
 * A body row's part in its table's drag and drop. Focus is on cells, so a
 * keyboard drag starts from a `<DragButton>` in one of them; a footer row
 * takes no part.
 */
function rowDragAndDrop(grid: TableContextValue, key: Key): RowDragAndDrop | null {
  const collection = grid.dragAndDrop;
  if (collection === undefined) return null;
  const everyRow = grid.state.collection();
  if (everyRow.rowIndexOf(key) >= everyRow.footerStart) return null;
  const { hooks, dragState, dropState } = collection;

  const draggable =
    dragState === undefined || hooks?.draggableItem === undefined
      ? null
      : hooks.draggableItem({ key, hasDragButton: true }, dragState);
  const dragButtonRef = makeRef<Element>();
  const slot = draggableItemSlotProps(draggable, hooks, dragButtonRef, dragButtonRef.set);
  if (draggable !== null) provideDragButton(slot.dragButton);

  let on: RowDragAndDrop["on"] = null;
  if (dropState !== undefined && hooks?.dropIndicator !== undefined) {
    const ref = makeRef<HTMLDivElement>();
    on = {
      ref,
      indicator: hooks.dropIndicator(
        { target: { type: "item", key, dropPosition: "on" } },
        dropState,
        ref,
      ),
    };
  }

  const after = createMemo(() => {
    const rows = dropState?.collection() ?? dragState?.collection();
    const node = rows?.getItem(key) ?? null;
    return rows === undefined || node === null ? [] : afterDropIndicatorTargets(rows, node);
  });

  return {
    collection,
    on,
    before: { type: "item", key, dropPosition: "before" },
    after,
    itemProps: slot.itemProps,
  };
}

export interface TableExpandButtonProps extends StyleProps {
  children?: Child;
  ref?: RefTarget<HTMLButtonElement>;
}

/**
 * The control that expands and collapses the enclosing row, for the cell of
 * the tree column. Named "Expand" or "Collapse" in the reader's language,
 * followed by the row's own name.
 *
 * It is for a pointer: from the keyboard the arrows expand and collapse while
 * the tree column's cell is focused, so the button stays out of the Tab order
 * and does not take focus when pressed.
 */
export function TableExpandButton(props: TableExpandButtonProps) {
  const domRef = makeRef<HTMLButtonElement>();
  const rowState = getContext(RowStateContext);
  if (rowState === null || rowState === undefined) {
    throw new Error("A TableExpandButton must be rendered inside a Row.");
  }
  const { buttonProps, isPressed } = button(rowState.expandButtonProps, domRef);
  const { hoverProps, isHovered } = hover({});

  const elementProps = mergeProps(
    buttonProps,
    {
      id: rowState.expandButtonProps.id,
      [PREVENT_FOCUS_ATTRIBUTE]: true,
      "aria-labelledby": rowState.expandButtonProps["aria-labelledby"],
    },
    hoverProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      type: "button",
      "data-expanded": rowState.isExpanded,
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-disabled": rowState.isDisabled,
      "data-testid": () => props["data-testid"],
    },
  );

  return (
    <button {...elementProps} ref={mergeRefs(domRef.set, props.ref)}>
      {props.children}
    </button>
  );
}

export interface CellComponentProps extends StyleProps {
  children?: Child;
  ref?: RefTarget<HTMLDivElement>;
}

/** One cell. `rowheader` when its column is the one that identifies the row. */
export function Cell(props: CellComponentProps) {
  const domRef = makeRef<HTMLDivElement>();
  const grid = useTable();
  const row = useRow();
  const column = useColumn();

  const { gridCellProps, isFocused } = tableCell(
    { row, column, ref: domRef, baseId: grid.baseId },
    grid.state,
  );

  const { focusProps, isFocusVisible } = focusRing();
  const { hoverProps, isHovered } = hover({});
  const rowState = getContext(RowStateContext) ?? null;
  const isTreeColumn = (): boolean => grid.state.treeColumn?.() === column.key;

  const elementProps = mergeProps(
    gridCellProps,
    focusProps,
    hoverProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-hovered": isHovered,
      "data-selected": () => rowState?.isSelected() === true,
      "data-disabled": () => rowState?.isDisabled() === true,
      "data-column-index": () => grid.state.collection().columnIndexOf(column.key),
      "data-tree-column": isTreeColumn,
      "data-expanded": () => isTreeColumn() && rowState?.isExpanded() === true,
      "data-has-child-items": () => isTreeColumn() && rowState?.hasChildRows() === true,
      "data-level": () => (grid.state.collection().isTree ? row.level + 1 : undefined),
      "data-testid": () => props["data-testid"],
    },
  );

  return (
    <div {...elementProps} ref={mergeRefs(domRef.set, props.ref)}>
      {props.children}
    </div>
  );
}
