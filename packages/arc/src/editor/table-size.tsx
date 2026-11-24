import { For, createSignal, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLocale } from "@barqjs/aria/i18n";

import { useArcMessages } from "../components/messages.ts";
import { ResponsiveOverlay } from "../components/responsive-overlay.tsx";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, edge, focus, gap, layout, motion, rounded, space, type } from "../style/index.ts";

export const tableSizeStyles = variants({
  slots: {
    root: arc(layout.column, gap[2], { alignItems: "center" }),
    grid: arc(gap[0.5], {
      display: "grid",
      gridTemplateColumns: "repeat(var(--arc-table-columns), 1fr)",
    }),
    cell: arc(edge.all, rounded.xs, bg.page, focus.visible, motion.colours, {
      inlineSize: space.x6,
      blockSize: space.x6,
      padding: "0px",
      "&[data-within]": { backgroundColor: "color-mix(in oklab, var(--primary) 30%, transparent)" },
    }),
    size: arc(type.meta, type.numeric),
  },
});

type Slots = ReturnType<typeof tableSizeStyles>;

export interface TableSize {
  rows: number;
  columns: number;
}

export interface TableSizePickerProps extends Customisable<Slots> {
  /** A size was chosen. */
  onPick: (rows: number, columns: number) => void;
  /** @default 8 */
  maxRows?: number;
  /** @default 8 */
  maxColumns?: number;
  /** The size it starts at. @default 3 by 3 */
  defaultSize?: TableSize;
}

interface GridCell {
  row: number;
  column: number;
}

/**
 * A grid of cells to pick a table's size from: the cells up to the one
 * under the pointer or the focus light up, and choosing it picks that many
 * rows and columns.
 *
 * One Tab stop: the arrows grow and shrink the size along the reading
 * direction and Enter picks it, each size said as it changes. A finger
 * picks with a tap.
 */
export function TableSizePicker(props: TableSizePickerProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  function cls(): Slots {
    return parts(tableSizeStyles(), props.classes);
  }
  function rows(): number {
    return props.maxRows ?? 8;
  }
  function columns(): number {
    return props.maxColumns ?? 8;
  }
  const start = untrack(() => props.defaultSize) ?? { rows: 3, columns: 3 };
  const [size, setSize] = createSignal(start, { ownedWrite: true });
  function cells(): GridCell[] {
    return Array.from({ length: rows() * columns() }, (_, at) => ({
      row: Math.floor(at / columns()) + 1,
      column: (at % columns()) + 1,
    }));
  }
  function cellId(row: number, column: number): string {
    return `table-size-${String(row)}-${String(column)}`;
  }

  function focusCell(row: number, column: number, from: HTMLElement): void {
    setSize({ rows: row, columns: column });
    const grid = from.closest('[data-slot="table-size-grid"]');
    grid?.querySelector<HTMLElement>(`[data-cell="${cellId(row, column)}"]`)?.focus();
  }

  function onKeyDown(event: KeyboardEvent): void {
    const now = size();
    const forward = locale().direction === "rtl" ? -1 : 1;
    let next: TableSize | null = null;
    switch (event.key) {
      case "ArrowRight":
        next = { rows: now.rows, columns: now.columns + forward };
        break;
      case "ArrowLeft":
        next = { rows: now.rows, columns: now.columns - forward };
        break;
      case "ArrowDown":
        next = { rows: now.rows + 1, columns: now.columns };
        break;
      case "ArrowUp":
        next = { rows: now.rows - 1, columns: now.columns };
        break;
      default:
        return;
    }
    event.preventDefault();
    focusCell(
      Math.max(1, Math.min(rows(), next.rows)),
      Math.max(1, Math.min(columns(), next.columns)),
      event.currentTarget as HTMLElement,
    );
  }

  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="table-size">
      <div
        class={cls().grid}
        data-slot="table-size-grid"
        role="group"
        aria-label={messages().chooseTableSize}
        style={{ "--arc-table-columns": String(columns()) }}
      >
        <For each={cells}>
          {(cell: GridCell) => (
            <button
              type="button"
              class={cls().cell}
              data-slot="table-size-cell"
              data-cell={cellId(cell.row, cell.column)}
              data-within={
                cell.row <= size().rows && cell.column <= size().columns ? "" : undefined
              }
              tabIndex={cell.row === size().rows && cell.column === size().columns ? 0 : -1}
              aria-label={messages().tableSize(cell.row, cell.column)}
              onPointerEnter={() => setSize({ rows: cell.row, columns: cell.column })}
              onFocus={() => setSize({ rows: cell.row, columns: cell.column })}
              onKeyDown={onKeyDown}
              onClick={() => props.onPick(cell.row, cell.column)}
            />
          )}
        </For>
      </div>
      <span class={cls().size} data-slot="table-size-label" aria-live="polite">
        {messages().tableSize(size().rows, size().columns)}
      </span>
    </div>
  );
}

export interface TableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (rows: number, columns: number) => void;
}

/** The table size picker in a popover, or a sheet under a finger, for the Insert menu and `/`. */
export function TableDialog(props: TableDialogProps) {
  const messages = useArcMessages();
  return (
    <ResponsiveOverlay
      heading={messages().table}
      open={props.open}
      onOpenChange={props.onOpenChange}
    >
      <TableSizePicker
        onPick={(rows, columns) => {
          props.onOpenChange(false);
          props.onPick(rows, columns);
        }}
      />
    </ResponsiveOverlay>
  );
}
