import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

const container = ui({
  position: "relative",
  width: "100%",
  overflowX: "auto",
});

const table = ui({
  width: "100%",
  captionSide: "bottom",
  borderCollapse: "collapse",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
});

const header = ui({
  "& tr": {
    borderBottomStyle: "var(--ui-border-style)",
    borderBottomWidth: "1px",
  },
});

const body = ui({
  "& tr:last-child": {
    borderStyle: "var(--ui-border-style)",
    borderWidth: "0px",
  },
});

const footer = ui({
  borderTopStyle: "var(--ui-border-style)",
  borderTopWidth: "1px",
  backgroundColor: "var(--muted)",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
  "@supports (color: color-mix(in lab, red, red))": {
    backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
  },
  "& > tr:last-child": {
    borderBottomStyle: "var(--ui-border-style)",
    borderBottomWidth: "0px",
  },
});

const row = ui({
  borderBottomStyle: "var(--ui-border-style)",
  borderBottomWidth: "1px",
  "--ui-border-style": "solid",
  borderStyle: "solid",
  transitionProperty:
    "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --ui-gradient-from, --ui-gradient-via, --ui-gradient-to",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  "@media (hover: hover)": {
    ":hover": {
      backgroundColor: "var(--muted)",
    },
    "@supports (color: color-mix(in lab, red, red))": {
      ":hover": {
        backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
      },
    },
  },
  "[data-selected]": {
    backgroundColor: "var(--muted)",
  },
});

const head = ui({
  height: "calc(var(--spacing) * 10)",
  paddingInline: "calc(var(--spacing) * 2)",
  textAlign: "left",
  verticalAlign: "middle",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
  whiteSpace: "nowrap",
  color: "var(--foreground)",
  ':has([role="checkbox"])': {
    paddingRight: "0px",
  },
});

const cell = ui({
  padding: "calc(var(--spacing) * 2)",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
  ':has([role="checkbox"])': {
    paddingRight: "0px",
  },
});

const caption = ui({
  marginTop: "calc(var(--spacing) * 4)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  color: "var(--muted-foreground)",
});

/**
 * A plain HTML table, styled.
 *
 * Deliberately NOT `@barqjs/aria`'s `<Table>`, which is a grid: it has roving
 * focus, selection, sortable columns and a keyboard delegate, and it is the
 * right thing for a data grid and the wrong thing for a table of five invoices.
 * Reach for `@barqjs/aria/table` when you need those; this is the markup.
 */
export function Table(props: Incoming<UiProps>) {
  return (
    <div data-slot="table-container" class={container}>
      <table {...uiProps("table", table, props)}>{props.children}</table>
    </div>
  );
}

export function TableHeader(props: Incoming<UiProps>) {
  return <thead {...uiProps("table-header", header, props)}>{props.children}</thead>;
}

export function TableBody(props: Incoming<UiProps>) {
  return <tbody {...uiProps("table-body", body, props)}>{props.children}</tbody>;
}

export function TableFooter(props: Incoming<UiProps>) {
  return <tfoot {...uiProps("table-footer", footer, props)}>{props.children}</tfoot>;
}

export interface TableRowProps extends UiProps {
  /** Marks the row as chosen. The CSS reads `data-selected`. */
  isSelected?: boolean;
}

export function TableRow(props: Incoming<TableRowProps>) {
  return (
    <tr
      {...uiProps("table-row", row, props)}
      data-selected={props.isSelected?.() === true ? "" : undefined}
      aria-selected={props.isSelected?.() === true ? true : undefined}
    >
      {props.children}
    </tr>
  );
}

export interface TableHeadProps extends UiProps {
  colSpan?: number;
  scope?: "col" | "row" | "colgroup" | "rowgroup";
}

export function TableHead(props: Incoming<TableHeadProps>) {
  return (
    <th
      {...uiProps("table-head", head, props)}
      colSpan={props.colSpan?.()}
      scope={props.scope?.() ?? "col"}
    >
      {props.children}
    </th>
  );
}

export interface TableCellProps extends UiProps {
  colSpan?: number;
  rowSpan?: number;
}

export function TableCell(props: Incoming<TableCellProps>) {
  return (
    <td
      {...uiProps("table-cell", cell, props)}
      colSpan={props.colSpan?.()}
      rowSpan={props.rowSpan?.()}
    >
      {props.children}
    </td>
  );
}

/** The table's name. Placed at the bottom, which is where shadcn puts it. */
export function TableCaption(props: Incoming<UiProps>) {
  return <caption {...uiProps("table-caption", caption, props)}>{props.children}</caption>;
}
