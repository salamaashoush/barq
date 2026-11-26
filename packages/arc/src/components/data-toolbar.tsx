import { type Child, For, Show, untrack } from "@barqjs/core";
import type { DateRange } from "@barqjs/aria/calendar";
import { variants } from "@barqjs/css";
import { controllable } from "@barqjs/aria/utils";
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
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@barqjs/ui/input-group";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { type Bound, bound, useSearchParam, withoutParams } from "../lib/search-state.ts";
import {
  edge,
  fg,
  gap,
  glyph,
  layout,
  rounded,
  space,
  square,
  truncate,
  type,
} from "../style/index.ts";
import { on } from "@barqjs/ui/conditions";
import { Chip } from "./chip.tsx";
import {
  type DataToolbarChip,
  type DataToolbarDateRangeFilter,
  type DataToolbarFilter,
  type DataToolbarFilterOption,
  type DataToolbarOptionsFilter,
  type DataToolbarToggleFilter,
  DateRangeChip,
  FilterSheet,
  type FilterValue,
  OptionsChip,
  ToggleChip,
  intervalOf,
  isActive,
  parseInterval,
} from "./data-toolbar-filters.tsx";
import { useArcMessages } from "./messages.ts";

export interface DataToolbarSearch {
  /** Names the field for a screen reader. */
  label: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /**
   * Kept in this search parameter, so the search has a link and survives a
   * reload. Each keystroke shows at once and the address takes the text once
   * typing pauses; Clear or a saved view rewriting the address replaces it.
   */
  param?: string;
  /** How long typing pauses before the address takes it, in milliseconds. @default 250 */
  debounce?: number;
}

export type {
  DataToolbarChip,
  DataToolbarDateRangeFilter,
  DataToolbarFilter,
  DataToolbarFilterOption,
  DataToolbarOptionsFilter,
  DataToolbarToggleFilter,
};

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

export interface DataToolbarProps extends Customisable<Slots> {
  search?: DataToolbarSearch;
  /**
   * A chip each: a facet of options (`kind: "options"`, the default), an
   * on-or-off toggle (`"toggle"`) or a span of days (`"date-range"`). Below
   * the `md` step they fold into a Filters sheet.
   */
  filters?: readonly DataToolbarFilter[];
  /** Filters carried in from elsewhere, `key: value`, each removable with `onRemove`. */
  chips?: readonly DataToolbarChip[];
  /**
   * What the list covers, after the filters: a day stepper, a week. Part of
   * the address like a filter, but not one Clear empties, and it stays in the
   * row on a phone.
   */
  period?: Child;
  /** The columns the view options can show or hide. */
  columns?: readonly DataToolbarColumn[];
  columnVisibility?: ColumnVisibilityState;
  onColumnVisibilityChange?: (visibility: ColumnVisibilityState) => void;
  /** While rows are selected, their count and actions take the filters' place. */
  selection?: DataToolbarSelection;
  /** At the end: an export, a button that creates. */
  actions?: Child;
  labels?: DataToolbarLabels;
}

export const dataToolbarStyles = variants({
  slots: {
    root: arc(layout.row, layout.wrap, gap[2], { paddingBlockEnd: space.x3 }),
    start: arc(layout.row, layout.wrap, layout.minZero, gap[2], { flex: "1 1 auto" }),
    filters: arc(layout.row, layout.wrap, layout.minZero, gap[2], {
      [on.belowMd]: { display: "none" },
    }),
    sheet: arc({ [on.md]: { display: "none" } }),
    group: arc(layout.column, gap[1], { border: "0px", padding: "0px", margin: "0px" }),
    choice: arc(layout.row, gap[3], type.sm, { minHeight: space.x10 }),
    choiceLabel: arc(layout.row, layout.grow, layout.minZero, gap[2]),
    toggleRow: arc(layout.row, layout.between, gap[3], type.sm, { minHeight: space.x10 }),
    period: arc(layout.row, layout.wrap, layout.minZero, gap[2]),
    chips: arc(layout.row, layout.wrap, layout.minZero, gap[1.5]),
    chip: arc(layout.inlineCentre, layout.noShrink, edge.all, rounded.sm, square.x4),
    optionIcon: arc(layout.inlineCentre, fg.muted, glyph.sm),
    menu: arc(layout.row, { padding: "0px", width: "auto" }),
    presets: arc(layout.column, gap[0.5], { padding: space.x2, width: "9rem" }),
    calendar: arc(edge.start),
    end: arc(layout.row, layout.noShrink, layout.pushEnd, gap[2]),
    search: arc({ width: "min(100%, 16rem)" }),
    filter: arc({ borderStyle: "dashed", '[data-active="true"]': { borderStyle: "solid" } }),
    chosen: arc(truncate, edge.start, type.normal, {
      maxWidth: "12rem",
      paddingInlineStart: space.x2,
    }),
    optionCount: arc(layout.pushEnd, fg.muted, type.numeric, { paddingInlineStart: space.x4 }),
    selected: arc(type.medium, type.numeric),
    clear: arc({}),
    view: arc({}),
  },
});

type Slots = ReturnType<typeof dataToolbarStyles>;

function splitValues(raw: string | null): string[] {
  return raw === null || raw === "" ? [] : raw.split(",");
}

/** The value a filter of this kind holds when nothing is chosen. */
function blank(filter: DataToolbarFilter): FilterValue {
  if (filter.kind === "toggle") return false;
  if (filter.kind === "date-range") return null;
  return [];
}

function initial(filter: DataToolbarFilter): FilterValue {
  if (filter.kind === "toggle") return filter.defaultValue ?? false;
  if (filter.kind === "date-range") return filter.defaultValue ?? null;
  return [...(filter.defaultValue ?? [])];
}

function parseFor(filter: DataToolbarFilter): (raw: string | null) => FilterValue {
  if (filter.kind === "toggle") return (raw) => raw === "1" || raw === "true";
  if (filter.kind === "date-range") return parseInterval;
  return splitValues;
}

function formatFor(filter: DataToolbarFilter): (value: FilterValue) => string {
  if (filter.kind === "toggle") return (value) => (value === true ? "1" : "");
  if (filter.kind === "date-range") return (value) => intervalOf(value as DateRange | null);
  return (value) => (value as string[]).join(",");
}

/**
 * The row above a list: a search, a chip per filter, the view options, and
 * what can be done to the selected rows.
 *
 * ```tsx
 * <DataToolbar
 *   search={{ label: "Search invoices", param: "q" }}
 *   filters={[
 *     { id: "status", label: "Status", param: "status", options: STATUSES },
 *     { kind: "toggle", id: "mine", label: "Started by me", param: "mine" },
 *     { kind: "date-range", id: "issued", label: "Issued", param: "issued" },
 *   ]}
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
 * list, then a solid one naming what it holds. A facet of more than seven
 * options takes a field to type into. Below the `md` step the filters fold
 * into one Filters button that opens them in a sheet.
 */
export function DataToolbar(props: DataToolbarProps) {
  const messages = useArcMessages();
  function labels(): Required<DataToolbarLabels> {
    return {
      toolbar: messages().filters,
      clear: messages().clearFilters,
      view: messages().view,
      columns: messages().columns,
      selected: messages().selected,
      clearSelection: messages().clearSelection,
      ...props.labels,
    };
  }
  function cls(): Slots {
    return parts(dataToolbarStyles(), props.classes);
  }
  const wantsUrl = untrack(
    () =>
      props.search?.param !== undefined ||
      (props.filters ?? []).some((filter) => filter.param !== undefined),
  );
  const url = wantsUrl ? useSearchParams() : undefined;

  const searchParam = untrack(() => props.search?.param);
  const search: Bound<string> =
    searchParam === undefined
      ? bound<string>(
          undefined,
          undefined,
          () => props.search?.value,
          untrack(() => props.search?.defaultValue) ?? "",
          (raw) => raw ?? "",
          (value) => value,
          (value) => props.search?.onChange?.(value),
        )
      : linked(searchParam, untrack(() => props.search?.debounce) ?? 250);

  function linked(param: string, wait: number): Bound<string> {
    const held = useSearchParam<string>(param, { defaultValue: "", debounce: wait });
    return {
      param,
      read: held.value,
      write: (next) => {
        held.setValue(next);
        props.search?.onChange?.(next);
      },
    };
  }

  const filters = new Map<string, Bound<FilterValue>>();
  for (const filter of untrack(() => props.filters) ?? []) {
    function given(): FilterValue | undefined {
      const now = props.filters?.find((one) => one.id === filter.id);
      if (now === undefined || now.value === undefined) return undefined;
      return Array.isArray(now.value) ? [...now.value] : (now.value as FilterValue);
    }
    filters.set(
      filter.id,
      bound<FilterValue>(
        url,
        filter.param,
        given,
        initial(filter),
        parseFor(filter),
        formatFor(filter),
        (value) => notify(filter.id, value),
      ),
    );
  }

  function notify(id: string, value: FilterValue): void {
    const filter = props.filters?.find((one) => one.id === id);
    if (filter === undefined) return;
    if (filter.kind === "toggle") filter.onChange?.(value === true);
    else if (filter.kind === "date-range") filter.onChange?.(value as DateRange | null);
    else filter.onChange?.(value as string[]);
  }

  function valueOf(filter: DataToolbarFilter): FilterValue {
    return filters.get(filter.id)?.read() ?? blank(filter);
  }
  function write(filter: DataToolbarFilter, value: FilterValue): void {
    filters.get(filter.id)?.write(value);
  }

  function isFiltered(): boolean {
    return (
      search.read() !== "" || (props.filters ?? []).some((filter) => isActive(valueOf(filter)))
    );
  }

  // One navigation for every parameter: two in a row would each start from
  // the URL as it was, and the second would put back what the first removed.
  function clear(): void {
    const removed = new Set<string>();
    if (search.read() !== "") {
      if (search.param === undefined) search.write("");
      else {
        removed.add(search.param);
        props.search?.onChange?.("");
      }
    }
    for (const filter of props.filters ?? []) {
      const held = filters.get(filter.id);
      if (held === undefined || !isActive(valueOf(filter))) continue;
      if (held.param === undefined) held.write(blank(filter));
      else {
        removed.add(held.param);
        notify(filter.id, blank(filter));
      }
    }
    if (url !== undefined && removed.size > 0) {
      url[1]((current) => withoutParams(current, removed));
    }
  }

  function filterChip(filter: DataToolbarFilter) {
    if (filter.kind === "toggle") {
      return (
        <ToggleChip
          filter={filter}
          value={valueOf(filter) === true}
          onChange={(pressed) => write(filter, pressed)}
          classes={cls()}
        />
      );
    }
    if (filter.kind === "date-range") {
      return (
        <DateRangeChip
          filter={filter}
          value={valueOf(filter) as DateRange | null}
          onChange={(range) => write(filter, range)}
          classes={cls()}
        />
      );
    }
    return (
      <OptionsChip
        filter={filter}
        value={valueOf(filter) as string[]}
        onChange={(value) => write(filter, value)}
        classes={cls()}
        summarise={labels().selected}
      />
    );
  }

  const [visibility, setVisibility] = controllable<ColumnVisibilityState>(
    () => props.columnVisibility,
    {},
    (next) => props.onColumnVisibilityChange?.(next),
  );
  function setVisible(id: string, visible: boolean): void {
    setVisibility((current) => ({ ...current, [id]: visible }));
  }

  function selecting(): boolean {
    return (props.selection?.count ?? 0) > 0;
  }

  return (
    <div
      role="search"
      aria-label={labels().toolbar}
      class={arc(cls().root, props.class, props.className)}
      data-slot="data-toolbar"
    >
      <div class={cls().start} data-slot="data-toolbar-start">
        <Show
          when={!selecting()}
          fallback={
            <>
              <span class={cls().selected} role="status" data-slot="data-toolbar-selected">
                {labels().selected(props.selection?.count ?? 0)}
              </span>
              {props.selection?.actions}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={labels().clearSelection}
                onPress={() => props.selection?.onClear()}
              >
                <X aria-hidden="true" />
              </Button>
            </>
          }
        >
          <Show when={props.search !== undefined}>
            <InputGroup class={cls().search} data-slot="data-toolbar-search">
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
          <Show when={(props.filters ?? []).length > 0}>
            <div class={cls().filters} data-slot="data-toolbar-filters">
              <For each={() => props.filters ?? []}>
                {(filter: DataToolbarFilter) => filterChip(filter)}
              </For>
            </div>
            <FilterSheet
              filters={props.filters ?? []}
              valueOf={valueOf}
              onChange={write}
              onClear={clear}
              classes={cls()}
            />
          </Show>
          <Show when={(props.chips ?? []).length > 0}>
            <div class={cls().chips} data-slot="data-toolbar-chips">
              <For each={() => props.chips ?? []}>
                {(chip: DataToolbarChip) => (
                  <Chip size="sm" onRemove={chip.onRemove}>
                    {`${chip.label}: ${chip.value}`}
                  </Chip>
                )}
              </For>
            </div>
          </Show>
          <Show when={props.period !== undefined}>
            <div class={cls().period} data-slot="data-toolbar-period">
              {props.period}
            </div>
          </Show>
          <Show when={isFiltered()}>
            <Button
              variant="ghost"
              size="sm"
              onPress={clear}
              class={cls().clear}
              data-slot="data-toolbar-clear"
            >
              {labels().clear}
            </Button>
          </Show>
        </Show>
      </div>
      <div class={cls().end} data-slot="data-toolbar-end">
        <Show when={(props.columns ?? []).length > 0}>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="outline" size="sm" class={cls().view} data-slot="data-toolbar-view">
                <Settings2 aria-hidden="true" />
                {labels().view}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              aria-label={labels().columns}
              shouldCloseOnSelect={false}
            >
              <DropdownMenuLabel>{labels().columns}</DropdownMenuLabel>
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
