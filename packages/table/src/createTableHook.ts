import {
  type JSXElement,
  cell as constant,
  createContext,
  provide,
  read,
  readSlot,
} from "@barqjs/core";
import { createColumnHelper as coreCreateColumnHelper } from "@tanstack/table-core";
import type {
  AccessorFn,
  AccessorFnColumnDef,
  AccessorKeyColumnDef,
  Cell,
  CellContext,
  CellData,
  Column,
  ColumnDef,
  ColumnHelper,
  DeepKeys,
  DeepValue,
  DisplayColumnDef,
  GroupColumnDef,
  Header,
  IdentifiedColumnDef,
  NoInfer,
  Row,
  RowData,
  Table,
  TableFeatures,
  TableOptions,
} from "@tanstack/table-core";

import {
  type BarqTable,
  type MaybeAccessor,
  createTable,
  mergeDescriptors,
} from "./createTable.ts";
import { FlexRender, renderSlots } from "./FlexRender.ts";

export type ComponentType<TProps> = (props: TProps) => JSXElement;

// `never` props: a registry holds components of unrelated props, and every
// component accepts being typed as one that is never called.
type Components = Record<string, ComponentType<never>>;

export type AppCellContext<
  TFeatures extends TableFeatures,
  TData extends RowData,
  TValue extends CellData,
  TCellComponents extends Components,
> = {
  cell: Cell<TFeatures, TData, TValue> & TCellComponents & { FlexRender: () => JSXElement };
  column: Column<TFeatures, TData, TValue>;
  getValue: CellContext<TFeatures, TData, TValue>["getValue"];
  renderValue: CellContext<TFeatures, TData, TValue>["renderValue"];
  row: Row<TFeatures, TData>;
  table: Table<TFeatures, TData>;
};

export type AppHeaderContext<
  TFeatures extends TableFeatures,
  TData extends RowData,
  TValue extends CellData,
  THeaderComponents extends Components,
> = {
  column: Column<TFeatures, TData, TValue>;
  header: Header<TFeatures, TData, TValue> & THeaderComponents & { FlexRender: () => JSXElement };
  table: Table<TFeatures, TData>;
};

export type AppColumnDefTemplate<TProps extends object> = string | ((props: TProps) => unknown);

export type AppColumnDefBase<
  TFeatures extends TableFeatures,
  TData extends RowData,
  TValue extends CellData,
  TCellComponents extends Components,
  THeaderComponents extends Components,
> = Omit<IdentifiedColumnDef<TFeatures, TData, TValue>, "cell" | "header" | "footer"> & {
  cell?: AppColumnDefTemplate<AppCellContext<TFeatures, TData, TValue, TCellComponents>>;
  header?: AppColumnDefTemplate<AppHeaderContext<TFeatures, TData, TValue, THeaderComponents>>;
  footer?: AppColumnDefTemplate<AppHeaderContext<TFeatures, TData, TValue, THeaderComponents>>;
};

export type AppDisplayColumnDef<
  TFeatures extends TableFeatures,
  TData extends RowData,
  TCellComponents extends Components,
  THeaderComponents extends Components,
> = Omit<DisplayColumnDef<TFeatures, TData>, "cell" | "header" | "footer"> & {
  cell?: AppColumnDefTemplate<AppCellContext<TFeatures, TData, unknown, TCellComponents>>;
  header?: AppColumnDefTemplate<AppHeaderContext<TFeatures, TData, unknown, THeaderComponents>>;
  footer?: AppColumnDefTemplate<AppHeaderContext<TFeatures, TData, unknown, THeaderComponents>>;
};

export type AppGroupColumnDef<
  TFeatures extends TableFeatures,
  TData extends RowData,
  TCellComponents extends Components,
  THeaderComponents extends Components,
> = Omit<GroupColumnDef<TFeatures, TData>, "cell" | "header" | "footer" | "columns"> & {
  cell?: AppColumnDefTemplate<AppCellContext<TFeatures, TData, unknown, TCellComponents>>;
  header?: AppColumnDefTemplate<AppHeaderContext<TFeatures, TData, unknown, THeaderComponents>>;
  footer?: AppColumnDefTemplate<AppHeaderContext<TFeatures, TData, unknown, THeaderComponents>>;
  columns?: ReadonlyArray<ColumnDef<TFeatures, TData>>;
};

export type AppColumnHelper<
  TFeatures extends TableFeatures,
  TData extends RowData,
  TCellComponents extends Components,
  THeaderComponents extends Components,
> = {
  accessor: <
    TAccessor extends AccessorFn<TData> | DeepKeys<TData>,
    TValue extends (TAccessor extends AccessorFn<TData, infer TReturn>
      ? TReturn
      : TAccessor extends DeepKeys<TData>
        ? DeepValue<TData, TAccessor>
        : never),
  >(
    accessor: TAccessor,
    column: TAccessor extends AccessorFn<TData>
      ? AppColumnDefBase<TFeatures, TData, TValue, TCellComponents, THeaderComponents> & {
          id: string;
        }
      : AppColumnDefBase<TFeatures, TData, TValue, TCellComponents, THeaderComponents>,
  ) => TAccessor extends AccessorFn<TData>
    ? AccessorFnColumnDef<TFeatures, TData, TValue>
    : AccessorKeyColumnDef<TFeatures, TData, TValue>;

  columns: ColumnHelper<TFeatures, TData>["columns"];

  display: (
    column: AppDisplayColumnDef<TFeatures, TData, TCellComponents, THeaderComponents>,
  ) => DisplayColumnDef<TFeatures, TData>;

  group: (
    column: AppGroupColumnDef<TFeatures, TData, TCellComponents, THeaderComponents>,
  ) => GroupColumnDef<TFeatures, TData>;
};

/**
 * `TRow` is inferred from the default options that take a row, such as
 * `getRowId: (row: Person) => row.id`, and bounds the row type of every table
 * the hook makes. With no such option it is `RowData` and bounds nothing.
 */
export type CreateTableHookOptions<
  TFeatures extends TableFeatures,
  TTableComponents extends Components,
  TCellComponents extends Components,
  THeaderComponents extends Components,
  TRow extends RowData = RowData,
> = Omit<TableOptions<TFeatures, TRow>, "columns" | "data" | "store" | "state" | "initialState"> & {
  /** Reached as `table.Name` on a table made by `createAppTable`. */
  tableComponents?: TTableComponents;
  /** Reached as `cell.Name` inside `AppCell` and in a column's `cell` template. */
  cellComponents?: TCellComponents;
  /** Reached as `header.Name` inside `AppHeader`/`AppFooter` and in a column's templates. */
  headerComponents?: THeaderComponents;
};

export interface AppTableProps {
  children: JSXElement;
}

export interface AppCellProps<
  TFeatures extends TableFeatures,
  TData extends RowData,
  TValue extends CellData,
  TCellComponents extends Components,
> {
  cell: Cell<TFeatures, TData, TValue>;
  children: (
    cell: Cell<TFeatures, TData, TValue> & TCellComponents & { FlexRender: () => JSXElement },
  ) => JSXElement;
}

export interface AppHeaderProps<
  TFeatures extends TableFeatures,
  TData extends RowData,
  TValue extends CellData,
  THeaderComponents extends Components,
> {
  header: Header<TFeatures, TData, TValue>;
  children: (
    header: Header<TFeatures, TData, TValue> & THeaderComponents & { FlexRender: () => JSXElement },
  ) => JSXElement;
}

export interface AppCellComponent<
  TFeatures extends TableFeatures,
  TData extends RowData,
  TCellComponents extends Components,
> {
  <TValue extends CellData = CellData>(
    props: AppCellProps<TFeatures, TData, TValue, TCellComponents>,
  ): JSXElement;
}

export interface AppHeaderComponent<
  TFeatures extends TableFeatures,
  TData extends RowData,
  THeaderComponents extends Components,
> {
  <TValue extends CellData = CellData>(
    props: AppHeaderProps<TFeatures, TData, TValue, THeaderComponents>,
  ): JSXElement;
}

export type AppTableComponent = (props: AppTableProps) => JSXElement;

export type AppBarqTable<
  TFeatures extends TableFeatures,
  TData extends RowData,
  TTableComponents extends Components,
  TCellComponents extends Components,
  THeaderComponents extends Components,
> = BarqTable<TFeatures, TData> &
  NoInfer<TTableComponents> & {
    /** Provides the table to `useTableContext` below it. */
    AppTable: AppTableComponent;
    /** Provides the cell to `useCellContext` and hands it over with the cell components on it. */
    AppCell: AppCellComponent<TFeatures, TData, NoInfer<TCellComponents>>;
    /** Provides the header to `useHeaderContext` and hands it over with the header components on it. */
    AppHeader: AppHeaderComponent<TFeatures, TData, NoInfer<THeaderComponents>>;
    /** `AppHeader`, with `FlexRender` rendering the column's footer template. */
    AppFooter: AppHeaderComponent<TFeatures, TData, NoInfer<THeaderComponents>>;
    FlexRender: typeof FlexRender;
  };

export interface CreateTableHookResult<
  TFeatures extends TableFeatures,
  TTableComponents extends Components,
  TCellComponents extends Components,
  THeaderComponents extends Components,
  TRow extends RowData = RowData,
> {
  appFeatures: TFeatures;
  createAppColumnHelper: <TData extends TRow>() => AppColumnHelper<
    TFeatures,
    TData,
    TCellComponents,
    THeaderComponents
  >;
  createAppTable: <TData extends TRow>(
    tableOptions: MaybeAccessor<Omit<TableOptions<TFeatures, TData>, "features">>,
  ) => AppBarqTable<TFeatures, TData, TTableComponents, TCellComponents, THeaderComponents>;
  useTableContext: <TData extends TRow = TRow>() => AppBarqTable<
    TFeatures,
    TData,
    TTableComponents,
    TCellComponents,
    THeaderComponents
  >;
  useCellContext: <TValue extends CellData = CellData>() => Cell<TFeatures, RowData, TValue> &
    TCellComponents & { FlexRender: () => JSXElement };
  useHeaderContext: <TValue extends CellData = CellData>() => Header<TFeatures, RowData, TValue> &
    THeaderComponents & { FlexRender: () => JSXElement };
}

/**
 * Binds features, default options and component registries once, and returns
 * the table factory, column helper and context readers typed against them.
 */
export function createTableHook<
  TFeatures extends TableFeatures,
  const TTableComponents extends Components,
  const TCellComponents extends Components,
  const THeaderComponents extends Components,
  TRow extends RowData = RowData,
>({
  tableComponents,
  cellComponents,
  headerComponents,
  ...defaultTableOptions
}: CreateTableHookOptions<
  TFeatures,
  TTableComponents,
  TCellComponents,
  THeaderComponents,
  TRow
>): CreateTableHookResult<TFeatures, TTableComponents, TCellComponents, THeaderComponents, TRow> {
  // Typed on the way out: a table is invariant in its row type, so no one
  // context type holds the table of every `createAppTable` call.
  const TableContext = createContext<unknown>(undefined, "barq-table");
  const CellContext = createContext<unknown>(undefined, "barq-table-cell");
  const HeaderContext = createContext<unknown>(undefined, "barq-table-header");

  function createAppColumnHelper<TData extends TRow>(): AppColumnHelper<
    TFeatures,
    TData,
    TCellComponents,
    THeaderComponents
  > {
    return coreCreateColumnHelper<TFeatures, TData>() as AppColumnHelper<
      TFeatures,
      TData,
      TCellComponents,
      THeaderComponents
    >;
  }

  function useTableContext<TData extends TRow = TRow>(): AppBarqTable<
    TFeatures,
    TData,
    TTableComponents,
    TCellComponents,
    THeaderComponents
  > {
    try {
      return read(TableContext)() as AppBarqTable<
        TFeatures,
        TData,
        TTableComponents,
        TCellComponents,
        THeaderComponents
      >;
    } catch (cause) {
      throw new Error(
        "`useTableContext` must be used within an `AppTable` component. " +
          "Make sure your component is wrapped with `<table.AppTable>...</table.AppTable>`.",
        { cause },
      );
    }
  }

  function useCellContext<TValue extends CellData = CellData>(): Cell<TFeatures, RowData, TValue> &
    TCellComponents & { FlexRender: () => JSXElement } {
    try {
      return read(CellContext)() as Cell<TFeatures, RowData, TValue> &
        TCellComponents & { FlexRender: () => JSXElement };
    } catch (cause) {
      throw new Error(
        "`useCellContext` must be used within an `AppCell` component. " +
          "Make sure your component is wrapped with `<table.AppCell cell={cell}>...</table.AppCell>`.",
        { cause },
      );
    }
  }

  function useHeaderContext<TValue extends CellData = CellData>(): Header<
    TFeatures,
    RowData,
    TValue
  > &
    THeaderComponents & { FlexRender: () => JSXElement } {
    try {
      return read(HeaderContext)() as Header<TFeatures, RowData, TValue> &
        THeaderComponents & { FlexRender: () => JSXElement };
    } catch (cause) {
      throw new Error(
        "`useHeaderContext` must be used within an `AppHeader` or `AppFooter` component.",
        { cause },
      );
    }
  }

  const CellFlexRender = (): JSXElement => renderSlots({ cell: constant(useCellContext()) });
  const HeaderFlexRender = (): JSXElement => renderSlots({ header: constant(useHeaderContext()) });
  const FooterFlexRender = (): JSXElement => renderSlots({ footer: constant(useHeaderContext()) });

  function createAppTable<TData extends TRow>(
    tableOptions: MaybeAccessor<Omit<TableOptions<TFeatures, TData>, "features">>,
  ): AppBarqTable<TFeatures, TData, TTableComponents, TCellComponents, THeaderComponents> {
    const withDefaults = (options: object): TableOptions<TFeatures, TData> =>
      mergeDescriptors(defaultTableOptions, options) as TableOptions<TFeatures, TData>;

    const table = createTable<TFeatures, TData>(
      typeof tableOptions === "function"
        ? () => withDefaults(tableOptions())
        : withDefaults(tableOptions),
    );

    const AppTable = (props: { children?: unknown }): unknown =>
      provide(TableContext, constant(table), () => {
        const children = props.children;
        return typeof children === "function" ? (children as () => unknown)() : children;
      });

    const AppCell = (props: {
      cell: () => Cell<TFeatures, TData>;
      children: AppCellProps<TFeatures, TData, CellData, TCellComponents>["children"];
    }): unknown => {
      const extended = Object.assign(
        readSlot(props.cell, "AppCell.cell") as Cell<TFeatures, TData>,
        { FlexRender: CellFlexRender, ...cellComponents },
      ) as Cell<TFeatures, TData> & TCellComponents & { FlexRender: () => JSXElement };
      return provide(CellContext, constant(extended), () => props.children(extended));
    };

    const headerSlot =
      (origin: string, Render: () => JSXElement) =>
      (props: {
        header: () => Header<TFeatures, TData>;
        children: AppHeaderProps<TFeatures, TData, CellData, THeaderComponents>["children"];
      }): unknown => {
        const extended = Object.assign(readSlot(props.header, origin) as Header<TFeatures, TData>, {
          FlexRender: Render,
          ...headerComponents,
        }) as Header<TFeatures, TData> & THeaderComponents & { FlexRender: () => JSXElement };
        return provide(HeaderContext, constant(extended), () => props.children(extended));
      };

    return Object.assign(table, {
      AppTable,
      AppCell,
      AppHeader: headerSlot("AppHeader.header", HeaderFlexRender),
      AppFooter: headerSlot("AppFooter.header", FooterFlexRender),
      FlexRender,
      ...tableComponents,
    }) as unknown as AppBarqTable<
      TFeatures,
      TData,
      TTableComponents,
      TCellComponents,
      THeaderComponents
    >;
  }

  return {
    appFeatures: defaultTableOptions.features,
    createAppColumnHelper,
    createAppTable,
    useTableContext,
    useCellContext,
    useHeaderContext,
  };
}
