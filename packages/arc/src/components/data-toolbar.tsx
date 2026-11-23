import { type Child, For, Show, createSignal, untrack } from "@barqjs/core";
import { CirclePlus } from "@barqjs/lucide/icons/circle-plus";
import { Search } from "@barqjs/lucide/icons/search";
import { Settings2 } from "@barqjs/lucide/icons/settings-2";
import { X } from "@barqjs/lucide/icons/x";
import { useSearchParams } from "@barqjs/router";
import type { ColumnVisibilityState } from "@barqjs/table";
import { Button } from "@barqjs/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@barqjs/ui/input-group";

import { arcLayer as arc } from "../layer.ts";

export interface DataToolbarSearch {
  /** Names the field for a screen reader. */
  label: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Kept in this search parameter, so the search has a link and survives a reload. */
  param?: string;
}

export interface DataToolbarFilterOption {
  value: string;
  label: string;
  /** How many rows it would leave, shown beside it. */
  count?: number;
}

export interface DataToolbarFilter {
  id: string;
  /** The chip's name: "Status". */
  label: string;
  options: readonly DataToolbarFilterOption[];
  value?: readonly string[];
  defaultValue?: readonly string[];
  onChange?: (value: string[]) => void;
  /** Kept in this search parameter, its values joined by commas. */
  param?: string;
  /** One value at a time, for choices that exclude each other. @default true */
  multiple?: boolean;
}

export interface DataToolbarColumn {
  id: string;
  label: string;
}

export interface DataToolbarSelection {
  count: number;
  onClear: () => void;
  /** What can be done to the selected rows. */
  actions?: Child;
}

export interface DataToolbarLabels {
  /** Names the toolbar's search landmark. @default "Filters" */
  toolbar?: string;
  /** @default "Clear filters" */
  clear?: string;
  /** @default "View" */
  view?: string;
  /** @default "Columns" */
  columns?: string;
  /** @default "3 selected" */
  selected?: (count: number) => string;
  /** @default "Clear selection" */
  clearSelection?: string;
}

export interface DataToolbarProps {
  search?: DataToolbarSearch;
  filters?: readonly DataToolbarFilter[];
  /** The columns the view options can show or hide. */
  columns?: readonly DataToolbarColumn[];
  columnVisibility?: ColumnVisibilityState;
  onColumnVisibilityChange?: (visibility: ColumnVisibilityState) => void;
  /** While rows are selected, their count and actions take the filters' place. */
  selection?: DataToolbarSelection;
  /** At the end: an export, a button that creates. */
  actions?: Child;
  labels?: DataToolbarLabels;
  class?: string;
}

const root = arc({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  paddingBlockEnd: "calc(var(--spacing) * 3)",
});

const start = arc({
  display: "flex",
  minWidth: "0px",
  flex: "1 1 auto",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
});

const end = arc({
  display: "flex",
  flexShrink: "0",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  marginInlineStart: "auto",
});

const searchBox = arc({
  width: "min(100%, 16rem)",
});

const chip = arc({
  borderStyle: "dashed",
  '[data-active="true"]': {
    borderStyle: "solid",
  },
});

const chosen = arc({
  maxWidth: "12rem",
  overflow: "hidden",
  textOverflow: "ellipsis",
  borderInlineStartWidth: "1px",
  borderInlineStartStyle: "solid",
  borderColor: "var(--border)",
  paddingInlineStart: "calc(var(--spacing) * 2)",
  fontWeight: "var(--font-weight-normal)",
});

const optionCount = arc({
  marginInlineStart: "auto",
  paddingInlineStart: "calc(var(--spacing) * 4)",
  color: "var(--muted-foreground)",
  fontVariantNumeric: "tabular-nums",
});

const selectedText = arc({
  fontWeight: "var(--font-weight-medium)",
  fontVariantNumeric: "tabular-nums",
});

/** A value that is the caller's, the toolbar's own, or a search parameter's. */
interface Bound<T> {
  read: () => T;
  write: (next: T) => void;
  /** The search parameter it lives in, when it does. */
  param: string | undefined;
}

type Url = ReturnType<typeof useSearchParams>;

function bound<T>(
  url: Url | undefined,
  param: string | undefined,
  given: () => T | undefined,
  initial: T,
  parse: (raw: string | null) => T,
  format: (value: T) => string,
  notify: (value: T) => void,
): Bound<T> {
  const [own, setOwn] = createSignal<{ value: T }>({ value: initial });
  return {
    param: url === undefined ? undefined : param,
    read: () => {
      if (url !== undefined && param !== undefined) return parse(url[0]().get(param));
      return given() ?? own().value;
    },
    write: (next) => {
      if (url !== undefined && param !== undefined) {
        url[1]((current) => {
          const kept: Record<string, string> = {};
          for (const [key, value] of current) kept[key] = value;
          kept[param] = format(next);
          return kept;
        });
      } else if (given() === undefined) {
        setOwn({ value: next });
      }
      notify(next);
    },
  };
}

const splitValues = (raw: string | null): string[] =>
  raw === null || raw === "" ? [] : raw.split(",");

/**
 * The row above a list: a search, a chip per filter, the view options, and
 * what can be done to the selected rows.
 *
 * ```tsx
 * <DataToolbar
 *   search={{ label: "Search invoices", param: "q" }}
 *   filters={[{ id: "status", label: "Status", param: "status", options: STATUSES }]}
 *   columns={[{ id: "customer", label: "Customer" }]}
 *   columnVisibility={visibility()}
 *   onColumnVisibilityChange={setVisibility}
 *   actions={<Button onPress={create}>New invoice</Button>}
 * />
 * ```
 *
 * The search and each filter are the caller's (`value`), the toolbar's own,
 * or a search parameter's (`param`), so a filtered list has a link and the
 * back button returns to it. A filter is a dashed chip until it narrows the
 * list, then a solid one naming what it holds.
 */
export function DataToolbar(props: DataToolbarProps) {
  const labels = (): DataToolbarLabels => props.labels ?? {};
  const wantsUrl = untrack(
    () =>
      props.search?.param !== undefined ||
      (props.filters ?? []).some((filter) => filter.param !== undefined),
  );
  const url = wantsUrl ? useSearchParams() : undefined;

  const search = bound<string>(
    url,
    untrack(() => props.search?.param),
    () => props.search?.value,
    untrack(() => props.search?.defaultValue) ?? "",
    (raw) => raw ?? "",
    (value) => value,
    (value) => props.search?.onChange?.(value),
  );

  const filters = new Map<string, Bound<string[]>>();
  for (const filter of untrack(() => props.filters) ?? []) {
    filters.set(
      filter.id,
      bound<string[]>(
        url,
        filter.param,
        () => props.filters?.find((one) => one.id === filter.id)?.value as string[] | undefined,
        [...(filter.defaultValue ?? [])],
        splitValues,
        (value) => value.join(","),
        (value) => props.filters?.find((one) => one.id === filter.id)?.onChange?.(value),
      ),
    );
  }

  const valueOf = (filter: DataToolbarFilter): string[] => filters.get(filter.id)?.read() ?? [];

  const isFiltered = (): boolean =>
    search.read() !== "" || (props.filters ?? []).some((filter) => valueOf(filter).length > 0);

  // One navigation for every parameter: two in a row would each start from
  // the URL as it was, and the second would put back what the first removed.
  const clear = (): void => {
    const removed = new Set<string>();
    const empty = (held: Bound<string> | Bound<string[]>, notify: () => void): void => {
      if (held.param === undefined) notify();
      else removed.add(held.param);
    };
    if (search.read() !== "") empty(search, () => search.write(""));
    for (const filter of props.filters ?? []) {
      const held = filters.get(filter.id);
      if (held !== undefined && valueOf(filter).length > 0) empty(held, () => held.write([]));
    }
    if (url !== undefined && removed.size > 0) {
      url[1]((current) => {
        const kept: Record<string, string> = {};
        for (const [key, value] of current) if (!removed.has(key)) kept[key] = value;
        return kept;
      });
      if (search.param !== undefined && removed.has(search.param)) props.search?.onChange?.("");
      for (const filter of props.filters ?? []) {
        if (filter.param !== undefined && removed.has(filter.param)) filter.onChange?.([]);
      }
    }
  };

  const [ownVisibility, setOwnVisibility] = createSignal<ColumnVisibilityState>({});
  const visibility = (): ColumnVisibilityState => props.columnVisibility ?? ownVisibility();
  const setVisible = (id: string, visible: boolean): void => {
    const next = { ...visibility(), [id]: visible };
    if (props.columnVisibility === undefined) setOwnVisibility(next);
    props.onColumnVisibilityChange?.(next);
  };

  const selecting = (): boolean => (props.selection?.count ?? 0) > 0;

  return (
    <div
      role="search"
      aria-label={labels().toolbar ?? "Filters"}
      class={arc(root, props.class)}
      data-slot="data-toolbar"
    >
      <div class={start} data-slot="data-toolbar-start">
        <Show
          when={!selecting()}
          fallback={
            <>
              <span class={selectedText} role="status" data-slot="data-toolbar-selected">
                {(labels().selected ?? ((n: number) => `${String(n)} selected`))(
                  props.selection?.count ?? 0,
                )}
              </span>
              {props.selection?.actions}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={labels().clearSelection ?? "Clear selection"}
                onPress={() => props.selection?.onClear()}
              >
                <X aria-hidden="true" />
              </Button>
            </>
          }
        >
          <Show when={props.search !== undefined}>
            <InputGroup class={searchBox} data-slot="data-toolbar-search">
              <InputGroupAddon>
                <Search aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                aria-label={props.search?.label}
                placeholder={props.search?.placeholder}
                value={search.read()}
                onInput={(event: Event) =>
                  search.write((event.currentTarget as HTMLInputElement).value)
                }
              />
            </InputGroup>
          </Show>
          <For each={() => props.filters ?? []}>
            {(filter: DataToolbarFilter) => (
              <FilterChip
                filter={filter}
                value={valueOf(filter)}
                onChange={(next) => filters.get(filter.id)?.write(next)}
              />
            )}
          </For>
          <Show when={isFiltered()}>
            <Button variant="ghost" size="sm" onPress={clear} data-slot="data-toolbar-clear">
              {labels().clear ?? "Clear filters"}
            </Button>
          </Show>
        </Show>
      </div>
      <div class={end} data-slot="data-toolbar-end">
        <Show when={(props.columns ?? []).length > 0}>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="outline" size="sm" data-slot="data-toolbar-view">
                <Settings2 aria-hidden="true" />
                {labels().view ?? "View"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              aria-label={labels().columns ?? "Columns"}
              shouldCloseOnSelect={false}
            >
              <DropdownMenuLabel>{labels().columns ?? "Columns"}</DropdownMenuLabel>
              <For each={() => props.columns ?? []}>
                {(column: DataToolbarColumn) => (
                  <DropdownMenuCheckboxItem
                    checked={visibility()[column.id] !== false}
                    onCheckedChange={(checked: boolean) => setVisible(column.id, checked)}
                  >
                    {column.label}
                  </DropdownMenuCheckboxItem>
                )}
              </For>
            </DropdownMenuContent>
          </DropdownMenu>
        </Show>
        {props.actions}
      </div>
    </div>
  );
}

interface FilterChipProps {
  filter: DataToolbarFilter;
  value: string[];
  onChange: (value: string[]) => void;
}

function FilterChip(props: FilterChipProps) {
  const filter = props.filter;
  const multiple = filter.multiple !== false;
  const active = (): boolean => props.value.length > 0;
  const summary = (): string => {
    const names = filter.options
      .filter((option) => props.value.includes(option.value))
      .map((option) => option.label);
    return names.length > 2 ? `${String(names.length)} selected` : names.join(", ");
  };
  const toggle = (value: string, checked: boolean): void => {
    const rest = props.value.filter((each) => each !== value);
    props.onChange(checked ? [...rest, value] : rest);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button
          variant="outline"
          size="sm"
          class={chip}
          data-slot="data-toolbar-filter"
          data-active={active() ? "true" : "false"}
        >
          <CirclePlus aria-hidden="true" />
          {filter.label}
          <Show when={active()}>
            <span class={chosen}>{summary()}</span>
          </Show>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" aria-label={filter.label} shouldCloseOnSelect={!multiple}>
        <Show
          when={multiple}
          fallback={
            <DropdownMenuRadioGroup
              value={props.value[0] ?? ""}
              onValueChange={(value: string) => props.onChange(value === "" ? [] : [value])}
            >
              <For each={() => filter.options}>
                {(option: DataToolbarFilterOption) => (
                  <DropdownMenuRadioItem value={option.value}>
                    {option.label}
                    <OptionCount count={option.count} />
                  </DropdownMenuRadioItem>
                )}
              </For>
            </DropdownMenuRadioGroup>
          }
        >
          <For each={() => filter.options}>
            {(option: DataToolbarFilterOption) => (
              <DropdownMenuCheckboxItem
                checked={props.value.includes(option.value)}
                onCheckedChange={(checked: boolean) => toggle(option.value, checked)}
              >
                {option.label}
                <OptionCount count={option.count} />
              </DropdownMenuCheckboxItem>
            )}
          </For>
        </Show>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OptionCount(props: { count?: number }) {
  return (
    <Show when={props.count !== undefined}>
      <span class={optionCount} data-slot="data-toolbar-option-count">
        {String(props.count)}
      </span>
    </Show>
  );
}
