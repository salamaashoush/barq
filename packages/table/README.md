# @barqjs/table

[TanStack Table](https://tanstack.com/table) for barq: `createTable`, `FlexRender`
and `createTableHook` over `@tanstack/table-core` 9. The API follows
`@tanstack/solid-table`, with the differences listed below.

Table state, row models and column APIs are tracked reads. Call one inside JSX,
`createMemo` or an effect and that computation follows the slice it read: a
header that reads `column.getIsSorted()` updates when sorting changes and is
left alone when the page index does.

## Install

```sh
bun add @barqjs/table
```

`@barqjs/core` is a peer dependency. `@tanstack/table-core` and
`@tanstack/store` come with the package, and everything table-core exports is
re-exported from `@barqjs/table`, so an application imports from one place.

## Example

```tsx
import { For, createSignal } from "@barqjs/core";
import {
  type Cell,
  type ColumnDef,
  type Header,
  type HeaderGroup,
  type Row,
  type SortingState,
  FlexRender,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  createTable,
  filterFns,
  globalFilteringFeature,
  columnFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from "@barqjs/table";

type Person = { id: string; name: string; email: string; age: number };

const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns,
  sortFns,
});

type Features = typeof features;

const columns: Array<ColumnDef<Features, Person>> = [
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "email",
    header: "Email",
    cell: (context) => (
      <a href={`mailto:${context.getValue<string>()}`}>{context.getValue<string>()}</a>
    ),
  },
  { accessorKey: "age", header: "Age", footer: "years" },
];

const people: Person[] = [
  { id: "1", name: "salama", email: "salama@example.com", age: 30 },
  { id: "2", name: "ada", email: "ada@example.com", age: 40 },
];

export function People() {
  const [sorting, setSorting] = createSignal<SortingState>([]);

  const table = createTable(() => ({
    features,
    columns,
    data: people,
    getRowId: (row: Person) => row.id,
    state: { sorting: sorting() },
    onSortingChange: setSorting,
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
  }));

  return (
    <div>
      <input
        placeholder="Search"
        onInput={(event) => table.setGlobalFilter(event.currentTarget.value)}
      />
      <table>
        <thead>
          <For each={table.getHeaderGroups()}>
            {(group: HeaderGroup<Features, Person>) => (
              <tr>
                <For each={group.headers}>
                  {(header: Header<Features, Person>) => (
                    <th onClick={header.column.getToggleSortingHandler()}>
                      <FlexRender header={header} />
                      {header.column.getIsSorted() || ""}
                    </th>
                  )}
                </For>
              </tr>
            )}
          </For>
        </thead>
        <tbody>
          <For each={table.getRowModel().rows}>
            {(row: Row<Features, Person>) => (
              <tr>
                <For each={row.getAllCells()}>
                  {(cell: Cell<Features, Person>) => (
                    <td>
                      <FlexRender cell={cell} />
                    </td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <button
        type="button"
        disabled={!table.getCanPreviousPage()}
        onClick={() => table.previousPage()}
      >
        Previous
      </button>
      <span>{`${table.atoms.pagination.get().pageIndex + 1} of ${table.getPageCount()}`}</span>
      <button type="button" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
        Next
      </button>
    </div>
  );
}
```

`<For>` keys by identity unless told otherwise, and table-core keeps a row
object for as long as the data it came from, so a sort, a filter or a page
change moves the `<tr>` elements that stay and builds only the ones that arrive.
When `data` is replaced wholesale, key by id to keep the rows across it:
`<For each={table.getRowModel().rows} keyed={(row) => row.id}>` with
`{(row) => <tr>{row().original.name}</tr>}`.

## API

- `createTable(options)` returns the table-core `Table` plus `table.FlexRender`.
  `options` is an accessor (`() => ({ data: rows(), state: { sorting: sorting() } })`),
  re-applied when anything it reads changes, or a plain options object. A
  getter on an options object (`get data() { return rows() }`) is read live.
  The table belongs to the owner it is created under and releases its
  subscriptions when that owner is disposed.
- `<FlexRender cell={cell} />`, `<FlexRender header={header} />`,
  `<FlexRender footer={footer} />` render the column's template for that
  position. With the grouping feature registered, an aggregated cell renders
  `aggregatedCell` and a placeholder cell renders nothing.
- `flexRender(template, context)` is the function form, for
  `{flexRender(cell.column.columnDef.cell, cell.getContext())}`.
- `createTableHook({ features, tableComponents, cellComponents, headerComponents, ...defaults })`
  returns `createAppTable`, `createAppColumnHelper`, `useTableContext`,
  `useCellContext`, `useHeaderContext` and `appFeatures`. A table made by
  `createAppTable` adds `AppTable`, `AppCell`, `AppHeader`, `AppFooter` and the
  registered table components; inside `AppCell` and `AppHeader` the cell or
  header carries `FlexRender` and the registered components.
- Everything `@tanstack/table-core` exports: `tableFeatures`, `stockFeatures`,
  each feature (`rowSortingFeature`, `columnFilteringFeature`, ...), each row
  model factory (`createSortedRowModel`, `createFilteredRowModel`,
  `createPaginatedRowModel`, `createGroupedRowModel`, `createExpandedRowModel`,
  `createFacetedRowModel`, `createFacetedUniqueValues`,
  `createFacetedMinMaxValues`), the `sortFns`, `filterFns` and `aggregationFns`
  registries, `createColumnHelper`, and the types.
- `options.atoms` takes atoms made with `createAtom` from `@tanstack/store`, at
  the version this package depends on: an atom from a second copy of the store
  is not tracked.
- Sub-entries, as in the Solid adapter: `@barqjs/table/static-functions`,
  `@barqjs/table/flex-render`, `@barqjs/table/experimental-worker-plugin`.

Every table option, feature and row model is TanStack's: see the
[TanStack Table documentation](https://tanstack.com/table/latest).

## Templates

A template function is called once per cell, untracked, like a component body.
What it returns is what stays live: markup with reactive holes, or a function.

```tsx
const columns: Array<ColumnDef<Features, Person>> = [
  { accessorKey: "name", cell: (context) => <Avatar name={context.getValue<string>()} /> },
  { accessorKey: "age", cell: (context) => () => `${context.getValue<number>()} ${unit()}` },
];
```

## Reading state in JSX

The barq compiler wraps a JSX expression that contains a call or a member read,
so table APIs and the state getters all update where they are rendered:

```tsx
<span>{table.getPageCount()}</span>
<span>{table.atoms.pagination.get().pageIndex}</span>
<span>{table.store.state.pagination.pageIndex}</span>
```

An array literal built inline for `each` is a value evaluated once, so wrap it:
`<For each={() => [...column.getFacetedUniqueValues().entries()]}>`.

## Writes and controlled state

Table state lives in TanStack Store atoms, so a write is readable on the next
line: `table.setPageSize(20)` followed by `table.getPageCount()` sees the new
size. The DOM follows at the next `flush()`, which barq schedules on a
microtask.

A controlled slice (`state` plus `onSortingChange`) held in a barq signal
follows the signal: `table.setSorting(next)` calls the handler, the signal
write is staged, and `table.atoms.sorting.get()` shows it after the flush.

## Differences from `@tanstack/solid-table`

- Options are an accessor first. The Solid shape, an object with getters, is
  also accepted.
- Table atoms are TanStack Store atoms with a barq version signal beside each,
  not framework signals. An external atom passed through `options.atoms` is
  read directly instead of being wrapped and synced both ways.
- `table.Subscribe`, deprecated in the Solid adapter, is not provided. Read
  `table.atoms` or any table API in a tracking scope.
- `createTableHook` takes a fifth type parameter, `TRow`, inferred from default
  options that take a row (`getRowId: (row: Person) => row.id`). It bounds the
  row type of `createAppTable` and `createAppColumnHelper`. Upstream types those
  defaults against `any`.
- `useCellContext()` and `useHeaderContext()` type their row as `RowData`,
  where upstream has `any`.
- `AppTableComponent` takes no type parameter.
