/**
 * How wide each column of a table is, and what a resize does to the others.
 *
 * A column asks for a width in one of three ways: pixels (`120`), a share of
 * the table (`"25%"`), or a share of what is left over (`"2fr"`, and no width
 * at all means `"1fr"`). Pixels and percentages are static; the `fr` columns
 * divide the remainder by the CSS flexbox algorithm, with each column's
 * `minWidth` and `maxWidth` respected, so a table behaves the way a row of
 * flex items would and a design system can predict it. Widths come out whole:
 * a fractional pixel is rounded by the cascade that keeps the total exact, so
 * columns never overflow by the sum of their rounding.
 *
 * Resizing a column fixes everything to its LEFT at the pixel width it has now
 * and leaves everything to its right as it was declared. Dragging the third
 * column's edge therefore moves nothing before it, and the `fr` columns after
 * it keep their proportions while they absorb the difference.
 *
 * A column's `width` controls it: the state reports a resize through
 * `onResize` and the caller writes the width back. `defaultWidth` only starts
 * it, and the state keeps what the user dragged it to.
 */

import { type Accessor, createMemo, createSignal, untrack } from "@barqjs/core";
import type { Key, Node } from "./collections.ts";
import { access, type MaybeAccessor } from "./utils.ts";

/** Pixels, a percentage of the table (`"25%"`), or a share of the rest (`"2fr"`). */
export type ColumnSize = number | `${number}%` | `${number}fr`;
/** Pixels or a percentage of the table: what a minimum or maximum can be. */
export type ColumnStaticSize = number | `${number}%`;

/** What a column item may say about its width. */
export interface ColumnWidthProps {
  /** Controls the width. */
  width?: ColumnSize | null;
  /** Where the width starts, when nothing controls it. */
  defaultWidth?: ColumnSize | null;
  minWidth?: ColumnStaticSize | null;
  maxWidth?: ColumnStaticSize | null;
}

/** Whether a width is fixed: pixels or a percentage, rather than a share of the rest. */
function isStatic(width: number | string | null | undefined): boolean {
  return (
    width !== null &&
    width !== undefined &&
    (!Number.isNaN(Number(width)) || /^(\d+)(?=%$)/.test(String(width)))
  );
}

/** How many shares of the remaining space a width asks for. */
function parseFractionalUnit(width: number | string | null | undefined): number {
  if (width === null || width === undefined || width === "" || typeof width === "number") return 1;
  const match = /^(.+)(?=fr$)/.exec(width);
  if (match === null) {
    console.warn(
      `width: ${width} is not a supported format, width should be a number (ex. 150), percentage (ex. '50%') or fr unit (ex. '2fr')`,
      "defaulting to '1fr'",
    );
    return 1;
  }
  return Number.parseFloat(match[0]);
}

/** A static width in pixels, a percentage taken of the table's width. */
function parseStaticWidth(width: number | string, tableWidth: number): number {
  if (typeof width === "number") return width;
  const match = /^(\d+)(?=%$)/.exec(width);
  if (match === null) {
    throw new Error("Only percentages or numbers are supported for static column widths");
  }
  return tableWidth * (Number.parseFloat(match[0]) / 100);
}

function getMaxWidth(maxWidth: number | string | null | undefined, tableWidth: number): number {
  return maxWidth === null || maxWidth === undefined
    ? Number.MAX_SAFE_INTEGER
    : parseStaticWidth(maxWidth, tableWidth);
}

/** A share of the rest cannot be a minimum: it would need every other width first. */
function getMinWidth(minWidth: number | string | null | undefined, tableWidth: number): number {
  return minWidth === null || minWidth === undefined ? 0 : parseStaticWidth(minWidth, tableWidth);
}

/** One column, as the width calculation reads it: sizes as numbers or strings. */
export interface SizedColumn {
  key: Key;
  width?: number | string | null | undefined;
  defaultWidth?: number | string | null | undefined;
  minWidth?: number | string | null | undefined;
  maxWidth?: number | string | null | undefined;
}

interface FlexItem {
  frozen: boolean;
  baseSize: number;
  hypotheticalMainSize: number;
  min: number;
  max: number;
  flex: number;
  targetMainSize: number;
  violation: number;
}

/**
 * Every column's width, by the flex layout algorithm of CSS Flexbox 1, §9.7,
 * with every basis zero except a static width's, every grow and shrink factor
 * the column's `fr`, and one line.
 *
 * Quadratic in the worst case, as the spec's own loop is; a table has few
 * columns, and once a resize has fixed the ones to the left there are fewer
 * still to flex.
 */
export function calculateColumnSizes(
  availableWidth: number,
  columns: SizedColumn[],
  changedColumns: Map<Key, number | string | null | undefined>,
  getDefaultWidth?: (index: number) => number | string | null | undefined,
  getDefaultMinWidth?: (index: number) => number | string | null | undefined,
): number[] {
  const originalWidth = availableWidth;
  const flooredWidth = Math.floor(availableWidth);
  const hasFractionalWidth = availableWidth - flooredWidth > 0;
  const width = flooredWidth;
  let hasNonFrozenItems = false;

  const items: FlexItem[] = columns.map((column, index) => {
    const changed = changedColumns.get(column.key);
    const size =
      changed ?? column.width ?? column.defaultWidth ?? getDefaultWidth?.(index) ?? "1fr";
    let frozen = false;
    let baseSize = 0;
    let flex = 0;
    let targetMainSize = 0;
    if (isStatic(size)) {
      baseSize = parseStaticWidth(size, width);
      frozen = true;
    } else {
      flex = parseFractionalUnit(size);
      if (flex <= 0) frozen = true;
    }

    const min = getMinWidth(column.minWidth ?? getDefaultMinWidth?.(index) ?? 0, width);
    const max = getMaxWidth(column.maxWidth, width);
    const hypotheticalMainSize = Math.max(min, Math.min(baseSize, max));

    // §9.7.1 and 9.7.2: the basis is zero, so every item grows.
    if (frozen) {
      targetMainSize = hypotheticalMainSize;
    } else if (baseSize > hypotheticalMainSize) {
      frozen = true;
      targetMainSize = hypotheticalMainSize;
    }
    // §9.7.3
    if (!frozen) hasNonFrozenItems = true;

    return {
      frozen,
      baseSize,
      hypotheticalMainSize,
      min,
      max,
      flex,
      targetMainSize,
      violation: 0,
    };
  });

  // §9.7.4
  while (hasNonFrozenItems) {
    // b: the free space left once the frozen items and the bases are placed.
    let usedWidth = 0;
    let flexFactors = 0;
    for (const item of items) {
      if (item.frozen) {
        usedWidth += item.targetMainSize;
      } else {
        usedWidth += item.baseSize;
        flexFactors += item.flex;
      }
    }
    const remainingFreeSpace = width - usedWidth;

    // c: shared out in proportion to the factors.
    if (remainingFreeSpace > 0) {
      for (const item of items) {
        if (!item.frozen) {
          item.targetMainSize = item.baseSize + (item.flex / flexFactors) * remainingFreeSpace;
        }
      }
    }

    // d: clamped to each item's minimum and maximum.
    let totalViolation = 0;
    for (const item of items) {
      item.violation = 0;
      if (!item.frozen) {
        const unclamped = item.targetMainSize;
        item.targetMainSize = Math.max(item.min, Math.min(unclamped, item.max));
        item.violation = item.targetMainSize - unclamped;
        totalViolation += item.violation;
      }
    }

    // e: freeze everything when nothing was clamped, otherwise the items
    // clamped in the direction the total went.
    hasNonFrozenItems = false;
    for (const item of items) {
      if (totalViolation === 0 || Math.sign(totalViolation) === Math.sign(item.violation)) {
        item.frozen = true;
      } else if (!item.frozen) {
        hasNonFrozenItems = true;
      }
    }
  }

  const sizes = cascadeRounding(items);

  // The sub-pixel remainder of the table's width goes to the last column, so
  // the columns sum to exactly the width they were given.
  if (hasFractionalWidth && sizes.length > 0) {
    const fraction = originalWidth.toString().split(".")[1];
    const last = sizes.length - 1;
    sizes[last] = Number(`${String(sizes[last])}.${fraction ?? "0"}`);
  }

  return sizes;
}

/** Whole numbers with the same sum as the floats they round. */
function cascadeRounding(items: FlexItem[]): number[] {
  let floatTotal = 0;
  let intTotal = 0;
  const rounded: number[] = [];
  for (const item of items) {
    const integer = Math.round(item.targetMainSize + floatTotal) - intTotal;
    floatTotal += item.targetMainSize;
    intTotal += integer;
    rounded.push(integer);
  }
  return rounded;
}

/** A column, as the layout reads it. */
export type ColumnNode = Pick<Node<unknown>, "key" | "props">;

/** What the layout reads of a table's collection. */
export interface ColumnCollection {
  readonly columns: readonly ColumnNode[];
}

/** Where a column's width options are read from: its collection node's props. */
function widthProps(column: ColumnNode): ColumnWidthProps {
  return column.props ?? {};
}

export interface TableColumnLayoutOptions {
  /** A column's width when it declares none. @default "1fr" */
  getDefaultWidth?: (column: ColumnNode) => ColumnSize | null | undefined;
  /** A column's minimum when it declares none. @default 75 */
  getDefaultMinWidth?: (column: ColumnNode) => ColumnSize | null | undefined;
}

/** The width calculation over a table's columns, with the widths it last produced. */
export class TableColumnLayout {
  getDefaultWidth: (column: ColumnNode) => ColumnSize | null | undefined;
  getDefaultMinWidth: (column: ColumnNode) => ColumnSize | null | undefined;
  columnWidths: Map<Key, number> = new Map();
  columnMinWidths: Map<Key, number> = new Map();
  columnMaxWidths: Map<Key, number> = new Map();

  constructor(options: TableColumnLayoutOptions = {}) {
    this.getDefaultWidth = options.getDefaultWidth ?? ((): ColumnSize => "1fr");
    this.getDefaultMinWidth = options.getDefaultMinWidth ?? ((): ColumnSize => 75);
  }

  /** The columns whose `width` controls them, and the rest. */
  splitColumnsIntoControlledAndUncontrolled(
    columns: readonly ColumnNode[],
  ): [Map<Key, ColumnNode>, Map<Key, ColumnNode>] {
    const controlled = new Map<Key, ColumnNode>();
    const uncontrolled = new Map<Key, ColumnNode>();
    for (const column of columns) {
      const width = widthProps(column).width;
      if (width !== null && width !== undefined) controlled.set(column.key, column);
      else uncontrolled.set(column.key, column);
    }
    return [controlled, uncontrolled];
  }

  /** The declared or dragged width of every column, in column order. */
  recombineColumns(
    columns: readonly ColumnNode[],
    uncontrolledWidths: Map<Key, ColumnSize | null | undefined>,
    uncontrolledColumns: Map<Key, ColumnNode>,
  ): Map<Key, ColumnSize | null | undefined> {
    return new Map(
      columns.map((column) => [
        column.key,
        uncontrolledColumns.has(column.key)
          ? uncontrolledWidths.get(column.key)
          : widthProps(column).width,
      ]),
    );
  }

  /** Where the uncontrolled columns start: their `defaultWidth`, or the default. */
  getInitialUncontrolledWidths(
    uncontrolledColumns: Map<Key, ColumnNode>,
  ): Map<Key, ColumnSize | null | undefined> {
    return new Map(
      [...uncontrolledColumns].map(([key, column]) => [
        key,
        widthProps(column).defaultWidth ?? this.getDefaultWidth(column) ?? "1fr",
      ]),
    );
  }

  getColumnWidth(key: Key): number {
    return this.columnWidths.get(key) ?? 0;
  }

  getColumnMinWidth(key: Key): number {
    return this.columnMinWidths.get(key) ?? 0;
  }

  getColumnMaxWidth(key: Key): number {
    return this.columnMaxWidths.get(key) ?? 0;
  }

  /**
   * Every column's width after `key` is resized to `width`: the columns to
   * its left fixed at their current pixels, the ones to its right as declared.
   */
  resizeColumnWidth(
    collection: ColumnCollection,
    uncontrolledWidths: Map<Key, ColumnSize | null | undefined>,
    key: Key,
    width: number,
  ): Map<Key, ColumnSize> {
    const columns = collection.columns;
    const previous = this.columnWidths;
    let freeze = true;
    const next = new Map<Key, ColumnSize>();
    const clamped = Math.max(
      this.getColumnMinWidth(key),
      Math.min(this.getColumnMaxWidth(key), Math.floor(width)),
    );

    for (const column of columns) {
      if (column.key === key) {
        next.set(column.key, clamped);
        freeze = false;
      } else if (freeze) {
        next.set(column.key, previous.get(column.key) ?? 0);
      } else {
        const declared = widthProps(column).width ?? uncontrolledWidths.get(column.key);
        if (declared !== null && declared !== undefined) next.set(column.key, declared);
      }
    }
    return next;
  }

  /** Lay the columns out across `tableWidth`, and keep the result. */
  buildColumnWidths(
    tableWidth: number,
    collection: ColumnCollection,
    widths: Map<Key, ColumnSize | null | undefined>,
  ): Map<Key, number> {
    const columns = collection.columns;
    this.columnWidths = new Map();
    this.columnMinWidths = new Map();
    this.columnMaxWidths = new Map();

    const sizes = calculateColumnSizes(
      tableWidth,
      columns.map((column) => ({ ...widthProps(column), key: column.key })),
      widths,
      (index) => this.getDefaultWidth(columns[index] as ColumnNode),
      (index) => this.getDefaultMinWidth(columns[index] as ColumnNode),
    );

    sizes.forEach((width, index) => {
      const column = columns[index] as ColumnNode;
      const props = widthProps(column);
      this.columnWidths.set(column.key, width);
      this.columnMinWidths.set(
        column.key,
        getMinWidth(props.minWidth ?? this.getDefaultMinWidth(column), tableWidth),
      );
      this.columnMaxWidths.set(column.key, getMaxWidth(props.maxWidth, tableWidth));
    });
    return this.columnWidths;
  }
}

export interface TableColumnResizeStateOptions extends TableColumnLayoutOptions {
  /** The width the columns are laid out across: the table's, or its scrolling viewport's. */
  tableWidth: MaybeAccessor<number>;
}

export interface TableColumnResizeState<S = unknown> {
  /** Resize a column. Answers every column's width as `onResize` reports it. */
  updateResizedColumns(key: Key, width: number): Map<Key, ColumnSize>;
  startResize(key: Key): void;
  endResize(): void;
  getColumnWidth(key: Key): number;
  getColumnMinWidth(key: Key): number;
  getColumnMaxWidth(key: Key): number;
  /** The column being resized, if any. */
  resizingColumn: Accessor<Key | null>;
  /** Every column's width in pixels, in column order. */
  columnWidths: Accessor<Map<Key, number>>;
  /** The table the widths are for. */
  tableState: S;
}

export interface ColumnResizeStateOptions {
  collection: Accessor<ColumnSource>;
}

export interface ColumnSource {
  readonly columns: readonly Node<unknown>[];
}

/**
 * Column widths for a table that lets its columns be resized.
 *
 * The table's columns are collection nodes whose props carry each one's
 * `width`, `defaultWidth`, `minWidth` and `maxWidth`.
 */
export function tableColumnResizeState<S extends ColumnResizeStateOptions>(
  options: TableColumnResizeStateOptions,
  state: S,
): TableColumnResizeState<S> {
  const layout = new TableColumnLayout(options);
  function columns(): Node<unknown>[] {
    return [...state.collection().columns];
  }
  const [resizingColumn, setResizingColumn] = createSignal<Key | null>(null);

  const split = createMemo(() => layout.splitColumnsIntoControlledAndUncontrolled(columns()));

  // What the uncontrolled columns were dragged to. A column added or taken
  // away starts them over from their defaults, as a fresh table would.
  function keysOf(nodes: Node<unknown>[]): string {
    return nodes.map((node) => String(node.key)).join("\u0000");
  }
  let lastKeys = keysOf(untrack(columns));
  let dragged: Map<Key, ColumnSize | null | undefined> | null = null;
  const [draggedVersion, setDraggedVersion] = createSignal(0);
  const uncontrolledWidths = createMemo((): Map<Key, ColumnSize | null | undefined> => {
    draggedVersion();
    const keys = keysOf(columns());
    if (keys !== lastKeys) {
      lastKeys = keys;
      dragged = null;
    }
    return dragged ?? layout.getInitialUncontrolledWidths(split()[1]);
  });

  const widths = createMemo(() =>
    layout.recombineColumns(columns(), uncontrolledWidths(), split()[1]),
  );

  const columnWidths = createMemo(
    () =>
      new Map(layout.buildColumnWidths(access(options.tableWidth), state.collection(), widths())),
  );

  return {
    tableState: state,
    resizingColumn,
    columnWidths,
    startResize: (key) => setResizingColumn(key),
    endResize: () => setResizingColumn(null),
    updateResizedColumns: (key, width) => {
      columnWidths();
      const sizes = layout.resizeColumnWidth(state.collection(), uncontrolledWidths(), key, width);
      const kept = new Map<Key, ColumnSize | null | undefined>(
        [...split()[1].keys()].map((each) => [each, sizes.get(each)]),
      );
      kept.set(key, width);
      dragged = kept;
      setDraggedVersion((version) => version + 1);
      return sizes;
    },
    getColumnWidth: (key) => columnWidths().get(key) ?? 0,
    getColumnMinWidth: (key) => {
      columnWidths();
      return layout.getColumnMinWidth(key);
    },
    getColumnMaxWidth: (key) => {
      columnWidths();
      return layout.getColumnMaxWidth(key);
    },
  };
}
