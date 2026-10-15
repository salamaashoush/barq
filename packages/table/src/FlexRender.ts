import { type JSXElement, createMemo, untrack } from "@barqjs/core";
import type { Cell, CellData, Header, RowData, TableFeatures } from "@tanstack/table-core";

/**
 * Renders a column template with its context: a function is called with the
 * context, anything else is rendered as it is.
 *
 * The template runs untracked, as a component body does. What it reads while
 * building is read once; a hole inside the markup it returns (or a function it
 * returns) is what stays live.
 */
export function flexRender<TProps>(
  Comp: ((props: TProps) => JSXElement) | JSXElement | undefined,
  props: TProps,
): JSXElement {
  if (Comp === null || Comp === undefined) return null;
  if (typeof Comp === "function") return untrack(() => Comp(props));
  return Comp;
}

export type FlexRenderProps<
  TFeatures extends TableFeatures,
  TData extends RowData,
  TValue extends CellData = CellData,
> =
  | { cell: Cell<TFeatures, TData, TValue>; header?: never; footer?: never }
  | { header: Header<TFeatures, TData, TValue>; cell?: never; footer?: never }
  | { footer: Header<TFeatures, TData, TValue>; cell?: never; header?: never };

/** What a call site's props arrive as: each one a read. */
export type FlexRenderSlots<
  TFeatures extends TableFeatures,
  TData extends RowData,
  TValue extends CellData,
> = {
  cell?: () => Cell<TFeatures, TData, TValue> | undefined;
  header?: () => Header<TFeatures, TData, TValue> | undefined;
  footer?: () => Header<TFeatures, TData, TValue> | undefined;
};

type GroupingCell = { getIsAggregated: () => boolean; getIsPlaceholder: () => boolean };

const NORMAL = 0;
const AGGREGATED = 1;
const PLACEHOLDER = 2;

export function renderSlots<
  TFeatures extends TableFeatures,
  TData extends RowData,
  TValue extends CellData,
>(props: FlexRenderSlots<TFeatures, TData, TValue>): JSXElement {
  const readCell = props.cell;
  // Its own memo so a grouping change that leaves the mode where it was does
  // not rebuild the cell's markup.
  const mode =
    readCell === undefined
      ? undefined
      : createMemo(() => {
          // Both methods exist only with the grouping feature registered.
          const cell: Partial<GroupingCell> | undefined = readCell();
          if (cell === undefined) return NORMAL;
          if (cell.getIsAggregated?.() === true) return AGGREGATED;
          if (cell.getIsPlaceholder?.() === true) return PLACEHOLDER;
          return NORMAL;
        });

  const content = createMemo((): JSXElement => {
    const cell = readCell?.();
    if (cell) {
      const current = mode?.() ?? NORMAL;
      if (current === PLACEHOLDER) return null;
      const def = cell.column.columnDef as typeof cell.column.columnDef & {
        aggregatedCell?: typeof cell.column.columnDef.cell;
      };
      const template = current === AGGREGATED ? (def.aggregatedCell ?? def.cell) : def.cell;
      return flexRender(template as never, cell.getContext());
    }

    const header = props.header?.();
    if (header) {
      return flexRender(header.column.columnDef.header as never, header.getContext());
    }

    const footer = props.footer?.();
    if (footer) {
      return flexRender(footer.column.columnDef.footer as never, footer.getContext());
    }

    return null;
  });

  // A function child is a live hole; `JSXElement` has no member that says so.
  return content as unknown as JSXElement;
}

/**
 * `<FlexRender cell={cell} />`, `<FlexRender header={header} />` or
 * `<FlexRender footer={footer} />`: the column's template for that position.
 *
 * With the grouping feature registered a cell renders `aggregatedCell` while it
 * is aggregated and nothing while it is a placeholder, and switches when the
 * grouping changes.
 */
export const FlexRender = renderSlots as unknown as <
  TFeatures extends TableFeatures,
  TData extends RowData,
  TValue extends CellData = CellData,
>(
  props: FlexRenderProps<TFeatures, TData, TValue>,
) => JSXElement;
