import type { ComponentDoc, Demo } from "../../registry.ts";
import DataTableBasic from "./data-table-basic.tsx";
import dataTableBasic from "./data-table-basic.tsx?raw";
import DataTableCellFormatting from "./data-table-cell-formatting.tsx";
import dataTableCellFormatting from "./data-table-cell-formatting.tsx?raw";
import DataTableDemo from "./data-table-demo.tsx";
import DataTableRtl from "./data-table-rtl.tsx";
import dataTableRtl from "./data-table-rtl.tsx?raw";
import dataTableDemo from "./data-table-demo.tsx?raw";
import DataTableFiltering from "./data-table-filtering.tsx";
import dataTableFiltering from "./data-table-filtering.tsx?raw";
import DataTablePagination from "./data-table-pagination.tsx";
import dataTablePagination from "./data-table-pagination.tsx?raw";
import DataTableRowActions from "./data-table-row-actions.tsx";
import dataTableRowActions from "./data-table-row-actions.tsx?raw";
import DataTableRowSelection from "./data-table-row-selection.tsx";
import dataTableRowSelection from "./data-table-row-selection.tsx?raw";
import DataTableSorting from "./data-table-sorting.tsx";
import dataTableSorting from "./data-table-sorting.tsx?raw";
import DataTableVisibility from "./data-table-visibility.tsx";
import dataTableVisibility from "./data-table-visibility.tsx?raw";

export const demos: readonly Demo[] = [
  {
    align: "start",
    size: "auto",
    code: dataTableDemo,
    component: DataTableDemo,
  },
  {
    title: "Basic Table",
    note: "Define the columns, hand them to `createTable` with the data, and render the header groups and the row model with the `Table` parts and `FlexRender`.",
    align: "start",
    size: "auto",
    code: dataTableBasic,
    component: DataTableBasic,
  },
  {
    title: "Cell Formatting",
    note: "A column's `cell` formats what it shows. The amount is right-aligned and formatted as a dollar amount.",
    align: "start",
    size: "auto",
    code: dataTableCellFormatting,
    component: DataTableCellFormatting,
  },
  {
    title: "Row Actions",
    note: "A display column with a `DropdownMenu` in its cell. The row is in reach through `row.original`.",
    align: "start",
    size: "auto",
    code: dataTableRowActions,
    component: DataTableRowActions,
  },
  {
    title: "Pagination",
    note: "Add `rowPaginationFeature` and the paginated row model, then drive the page with `table.previousPage()` and `table.nextPage()`.",
    align: "start",
    size: "auto",
    code: dataTablePagination,
    component: DataTablePagination,
  },
  {
    title: "Sorting",
    note: "Add `rowSortingFeature` and the sorted row model, and make the email header a button that calls `column.toggleSorting()`.",
    align: "start",
    size: "auto",
    code: dataTableSorting,
    component: DataTableSorting,
  },
  {
    title: "Filtering",
    note: "Add `columnFilteringFeature` and the filtered row model, and bind an `Input` to the email column's filter value.",
    align: "start",
    size: "auto",
    code: dataTableFiltering,
    component: DataTableFiltering,
  },
  {
    title: "Visibility",
    note: "Add `columnVisibilityFeature` and list the columns that can hide as checkbox items in a `DropdownMenu`.",
    align: "start",
    size: "auto",
    code: dataTableVisibility,
    component: DataTableVisibility,
  },
  {
    title: "Row Selection",
    note: "Add `rowSelectionFeature` and a select column with a `Checkbox` in its header and in each cell.",
    align: "start",
    size: "auto",
    code: dataTableRowSelection,
    component: DataTableRowSelection,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own. The menus are portalled out of that element, so each content part takes `dir` as well.",
    rtl: true,
    size: "auto",
    code: dataTableRtl,
    component: DataTableRtl,
  },
];

export const doc: ComponentDoc = {
  slug: "data-table",
  title: "Data Table",
  description:
    "Tables with sorting, filtering, pagination, row selection and column visibility, on @barqjs/table.",
  add: "table",
  usage: [
    'import { FlexRender, createTable, tableFeatures } from "@barqjs/table";',
    "",
    "const features = tableFeatures({});",
    "",
    "const table = createTable({ features, data, columns });",
  ].join("\n"),
  demos,
};
