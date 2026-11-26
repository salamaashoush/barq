import { type Child, For, Show, createSignal, createUniqueId } from "@barqjs/core";
import type { DateRange } from "@barqjs/aria/calendar";
import { type CalendarDate, getLocalTimeZone, parseDate, today } from "@barqjs/aria/date";
import { dateFormatter } from "@barqjs/aria/i18n";
import { Calendar as CalendarIcon } from "@barqjs/lucide/icons/calendar";
import { Check } from "@barqjs/lucide/icons/check";
import { CirclePlus } from "@barqjs/lucide/icons/circle-plus";
import { ListFilter } from "@barqjs/lucide/icons/list-filter";
import { X } from "@barqjs/lucide/icons/x";
import { Button } from "@barqjs/ui/button";
import { RangeCalendar } from "@barqjs/ui/calendar";
import { Checkbox } from "@barqjs/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@barqjs/ui/command";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@barqjs/ui/popover";
import { RadioGroup, RadioGroupItem } from "@barqjs/ui/radio-group";
import { srOnly } from "@barqjs/ui/sr-only";
import { Switch } from "@barqjs/ui/switch";
import { Toggle } from "@barqjs/ui/toggle";

import type { DateRangePreset } from "./date-range-field.tsx";
import { DateRangeField, commonRangePresets } from "./date-range-field.tsx";
import type { NavIcon } from "./app-shell.tsx";
import { useArcMessages } from "./messages.ts";
import { ResponsiveOverlay } from "./responsive-overlay.tsx";

export type { DateRange, DateRangePreset };

export interface DataToolbarFilterOption {
  value: string;
  label: string;
  /** How many rows it would leave, shown beside it. */
  count?: number;
  /** Before the label, `aria-hidden`: a kind's icon. */
  icon?: NavIcon;
  /** The heading it is listed under. */
  group?: string;
}

/** A facet: one or several of its options. */
export interface DataToolbarOptionsFilter {
  kind?: "options";
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
  /** A field that narrows the options as you type. @default more than seven options */
  searchable?: boolean;
}

/** On or off: "Started by me". */
export interface DataToolbarToggleFilter {
  kind: "toggle";
  id: string;
  label: string;
  icon?: NavIcon;
  value?: boolean;
  defaultValue?: boolean;
  onChange?: (on: boolean) => void;
  /** Kept in this search parameter as `1` while on. */
  param?: string;
}

/** A span of days, inclusive, from presets or two months of a calendar. */
export interface DataToolbarDateRangeFilter {
  kind: "date-range";
  id: string;
  /** @default "Date" */
  label: string;
  value?: DateRange | null;
  defaultValue?: DateRange | null;
  onChange?: (value: DateRange | null) => void;
  /** Kept in this search parameter as an ISO interval, `2026-03-01/2026-03-07`. */
  param?: string;
  /** @default today and the last 7, 30 and 90 days */
  presets?: readonly DateRangePreset[];
  /** The last day that can be chosen. @default today */
  maxValue?: CalendarDate | null;
}

export type DataToolbarFilter =
  | DataToolbarOptionsFilter
  | DataToolbarToggleFilter
  | DataToolbarDateRangeFilter;

/** A filter carried in from elsewhere, as `key: value`, which a press may remove. */
export interface DataToolbarChip {
  id: string;
  label: string;
  value: string;
  onRemove?: () => void;
}

/** What one filter holds, whatever its kind. */
export type FilterValue = string[] | boolean | DateRange | null;

/** The classes the chips take from the toolbar. */
export interface FilterClasses {
  filter: string;
  chosen: string;
  optionCount: string;
  optionIcon: string;
  menu: string;
  presets: string;
  calendar: string;
  chip: string;
}

export function isActive(value: FilterValue): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== false;
}

export function intervalOf(range: DateRange | null): string {
  return range === null ? "" : `${range.start.toString()}/${range.end.toString()}`;
}

export function parseInterval(raw: string | null): DateRange | null {
  if (raw === null) return null;
  const [start, end] = raw.split("/");
  if (start === undefined || end === undefined) return null;
  try {
    const from = parseDate(start);
    const to = parseDate(end);
    return from.compare(to) <= 0 ? { start: from, end: to } : { start: to, end: from };
  } catch {
    return null;
  }
}

interface OptionMarkProps {
  option: DataToolbarFilterOption;
  classes: FilterClasses;
}

function OptionMark(props: OptionMarkProps) {
  const Icon = props.option.icon;
  return (
    <>
      {Icon === undefined ? null : (
        <span class={props.classes.optionIcon} aria-hidden="true">
          <Icon />
        </span>
      )}
      {props.option.label}
      <Show when={props.option.count !== undefined}>
        <span class={props.classes.optionCount} data-slot="data-toolbar-option-count">
          {String(props.option.count)}
        </span>
      </Show>
    </>
  );
}

interface ChipTriggerProps {
  label: string;
  icon: Child;
  summary: string | undefined;
  classes: FilterClasses;
}

/** A dashed chip naming the filter until it narrows the list, then a solid one saying how. */
function chipTrigger(props: ChipTriggerProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      class={props.classes.filter}
      data-slot="data-toolbar-filter"
      data-active={props.summary === undefined ? "false" : "true"}
      aria-label={props.summary === undefined ? undefined : `${props.label}: ${props.summary}`}
    >
      {props.icon}
      {props.label}
      <Show when={props.summary !== undefined}>
        <span class={props.classes.chosen} data-slot="data-toolbar-chosen">
          {props.summary}
        </span>
      </Show>
    </Button>
  );
}

export interface OptionsChipProps {
  filter: DataToolbarOptionsFilter;
  value: string[];
  onChange: (value: string[]) => void;
  classes: FilterClasses;
  summarise: (count: number) => string;
}

function summaryOf(props: OptionsChipProps): string | undefined {
  const names = props.filter.options
    .filter((option) => props.value.includes(option.value))
    .map((option) => option.label);
  if (names.length === 0) return undefined;
  return names.length > 2 ? props.summarise(names.length) : names.join(", ");
}

/** A facet's chip: a menu of its options, or a searchable list when there are many. */
export function OptionsChip(props: OptionsChipProps) {
  const filter = props.filter;
  const multiple = filter.multiple !== false;
  function toggle(value: string, checked: boolean): void {
    const rest = props.value.filter((each) => each !== value);
    props.onChange(checked ? [...rest, value] : rest);
  }
  function searchable(): boolean {
    return filter.searchable ?? filter.options.length > 7;
  }
  function trigger() {
    return chipTrigger({
      label: filter.label,
      icon: <CirclePlus aria-hidden="true" />,
      summary: summaryOf(props),
      classes: props.classes,
    });
  }

  function menu() {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger>{trigger()}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          aria-label={filter.label}
          shouldCloseOnSelect={!multiple}
        >
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
                      <OptionMark option={option} classes={props.classes} />
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
                  <OptionMark option={option} classes={props.classes} />
                </DropdownMenuCheckboxItem>
              )}
            </For>
          </Show>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Show when={searchable()} fallback={menu()}>
      <SearchableOptions {...props} trigger={trigger()} />
    </Show>
  );
}

interface SearchableOptionsProps extends OptionsChipProps {
  trigger: Child;
}

/** Every IANA time zone, twelve months: a list to type into rather than scroll. */
function SearchableOptions(props: SearchableOptionsProps) {
  const messages = useArcMessages();
  const [open, setOpen] = createSignal(false);
  const multiple = props.filter.multiple !== false;
  function pick(value: string): void {
    if (!multiple) {
      props.onChange(props.value.includes(value) ? [] : [value]);
      setOpen(false);
      return;
    }
    props.onChange(
      props.value.includes(value)
        ? props.value.filter((each) => each !== value)
        : [...props.value, value],
    );
  }
  return (
    <Popover isOpen={open()} onOpenChange={setOpen}>
      <PopoverTrigger>{props.trigger}</PopoverTrigger>
      <PopoverContent placement="bottom start" class={props.classes.menu}>
        <Command label={props.filter.label}>
          <CommandInput placeholder={messages().searchOptions(props.filter.label)} />
          <CommandList>
            <CommandEmpty>{messages().noMatches}</CommandEmpty>
            <CommandGroup>
              <For each={() => props.filter.options}>
                {(option: DataToolbarFilterOption) => (
                  <CommandItem
                    value={option.label}
                    data-slot="data-toolbar-option"
                    data-checked={props.value.includes(option.value) ? "" : undefined}
                    onSelect={() => pick(option.value)}
                  >
                    <span aria-hidden="true" class={props.classes.chip}>
                      <Show when={props.value.includes(option.value)}>
                        <Check />
                      </Show>
                    </span>
                    <OptionMark option={option} classes={props.classes} />
                    <Show when={props.value.includes(option.value)}>
                      <span class={srOnly}>{messages().selected(1)}</span>
                    </Show>
                  </CommandItem>
                )}
              </For>
            </CommandGroup>
            <Show when={props.value.length > 0}>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem value={messages().clearFilter} onSelect={() => props.onChange([])}>
                  {messages().clearFilter}
                </CommandItem>
              </CommandGroup>
            </Show>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export interface ToggleChipProps {
  filter: DataToolbarToggleFilter;
  value: boolean;
  onChange: (on: boolean) => void;
  classes: FilterClasses;
}

/** A filter that is on or off, pressed while on. */
export function ToggleChip(props: ToggleChipProps) {
  const Icon = props.filter.icon;
  return (
    <Toggle
      variant="outline"
      size="sm"
      class={props.classes.filter}
      data-slot="data-toolbar-toggle"
      data-active={props.value ? "true" : "false"}
      isSelected={props.value}
      onChange={(on: boolean) => props.onChange(on)}
    >
      {Icon === undefined ? null : <Icon />}
      {props.filter.label}
    </Toggle>
  );
}

const DAY: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

export interface DateRangeChipProps {
  filter: DataToolbarDateRangeFilter;
  value: DateRange | null;
  onChange: (range: DateRange | null) => void;
  classes: FilterClasses;
}

function presetRange(preset: DateRangePreset): DateRange {
  if (typeof preset.value !== "number") return preset.value;
  const end = today(getLocalTimeZone());
  return { start: end.subtract({ days: Math.max(0, preset.value - 1) }), end };
}

/** A span of days: presets for the usual questions, two months for any other. */
export function DateRangeChip(props: DateRangeChipProps) {
  const messages = useArcMessages();
  const format = dateFormatter(DAY);
  const [open, setOpen] = createSignal(false);
  function presets(): readonly DateRangePreset[] {
    return props.filter.presets ?? commonRangePresets(messages());
  }
  function day(date: CalendarDate): string {
    return format().format(date.toDate(getLocalTimeZone()));
  }
  function summary(): string | undefined {
    const range = props.value;
    if (range === null) return undefined;
    const preset = presets().find((one) => {
      const span = presetRange(one);
      return span.start.compare(range.start) === 0 && span.end.compare(range.end) === 0;
    });
    if (preset !== undefined) return preset.label;
    return range.start.compare(range.end) === 0
      ? day(range.start)
      : `${day(range.start)} – ${day(range.end)}`;
  }
  function choose(range: DateRange | null): void {
    props.onChange(range);
    setOpen(false);
  }
  return (
    <Popover isOpen={open()} onOpenChange={setOpen}>
      <PopoverTrigger>
        {chipTrigger({
          label: props.filter.label,
          icon: <CalendarIcon aria-hidden="true" />,
          summary: summary(),
          classes: props.classes,
        })}
      </PopoverTrigger>
      <PopoverContent placement="bottom start" class={props.classes.menu}>
        <div class={props.classes.presets} data-slot="data-toolbar-presets">
          <For each={presets}>
            {(preset: DateRangePreset) => (
              <Button variant="ghost" size="sm" onPress={() => choose(presetRange(preset))}>
                {preset.label}
              </Button>
            )}
          </For>
          <Show when={props.value !== null}>
            <Button variant="ghost" size="sm" onPress={() => choose(null)}>
              <X aria-hidden="true" />
              {messages().anyTime}
            </Button>
          </Show>
        </div>
        <div class={props.classes.calendar} data-slot="data-toolbar-calendar">
          <RangeCalendar
            aria-label={props.filter.label}
            value={props.value}
            numberOfMonths={2}
            maxValue={
              props.filter.maxValue === undefined
                ? today(getLocalTimeZone())
                : props.filter.maxValue
            }
            onChange={(range: DateRange | null) => choose(range)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export interface SheetClasses extends FilterClasses {
  sheet: string;
  group: string;
  choice: string;
  choiceLabel: string;
  toggleRow: string;
}

export interface FilterSheetProps {
  filters: readonly DataToolbarFilter[];
  valueOf: (filter: DataToolbarFilter) => FilterValue;
  onChange: (filter: DataToolbarFilter, value: FilterValue) => void;
  onClear?: () => void;
  classes: SheetClasses;
}

/** The filters as a phone holds them: one button with how many are set, a sheet of every filter. */
export function FilterSheet(props: FilterSheetProps) {
  const messages = useArcMessages();
  const [open, setOpen] = createSignal(false);
  function active(): number {
    return props.filters.filter((filter) => isActive(props.valueOf(filter))).length;
  }
  return (
    <ResponsiveOverlay
      heading={messages().filters}
      open={open()}
      onOpenChange={setOpen}
      trigger={
        <Button
          variant="outline"
          size="sm"
          class={props.classes.sheet}
          data-slot="data-toolbar-sheet-trigger"
          aria-label={
            active() > 0
              ? `${messages().filters}, ${messages().filtersApplied(active())}`
              : messages().filters
          }
        >
          <ListFilter aria-hidden="true" />
          {messages().filters}
          <Show when={active() > 0}>
            <span class={props.classes.optionCount} aria-hidden="true">
              {String(active())}
            </span>
          </Show>
        </Button>
      }
      footer={
        <>
          <Show when={active() > 0 && props.onClear !== undefined}>
            <Button variant="ghost" onPress={() => props.onClear?.()}>
              {messages().clearFilters}
            </Button>
          </Show>
          <Button onPress={() => setOpen(false)}>{messages().done}</Button>
        </>
      }
    >
      <For each={() => props.filters}>
        {(filter: DataToolbarFilter) => (
          <SheetFilter
            filter={filter}
            value={props.valueOf(filter)}
            onChange={(value) => props.onChange(filter, value)}
            classes={props.classes}
          />
        )}
      </For>
    </ResponsiveOverlay>
  );
}

interface SheetFilterProps {
  filter: DataToolbarFilter;
  value: FilterValue;
  onChange: (value: FilterValue) => void;
  classes: FilterSheetProps["classes"];
}

interface OptionGroup {
  group: string | undefined;
  options: DataToolbarFilterOption[];
}

function grouped(options: readonly DataToolbarFilterOption[]): OptionGroup[] {
  const groups: OptionGroup[] = [];
  for (const option of options) {
    const last = groups.at(-1);
    if (last !== undefined && last.group === option.group) last.options.push(option);
    else groups.push({ group: option.group, options: [option] });
  }
  return groups;
}

function SheetFilter(props: SheetFilterProps) {
  const filter = props.filter;
  const id = createUniqueId();
  if (filter.kind === "toggle") {
    return (
      <div class={props.classes.toggleRow} data-slot="data-toolbar-sheet-toggle">
        <label for={id} class={props.classes.choiceLabel}>
          {filter.label}
        </label>
        <Switch
          id={id}
          isSelected={props.value === true}
          onChange={(on: boolean) => props.onChange(on)}
        />
      </div>
    );
  }
  if (filter.kind === "date-range") {
    return (
      <DateRangeField
        label={filter.label}
        presets={filter.presets ?? "common"}
        numberOfMonths={1}
        maxValue={filter.maxValue === undefined ? today(getLocalTimeZone()) : filter.maxValue}
        value={(props.value as DateRange | null) ?? null}
        onChange={(range) => props.onChange(range)}
      />
    );
  }
  function values(): string[] {
    return Array.isArray(props.value) ? props.value : [];
  }
  if (filter.multiple === false) {
    return (
      <fieldset class={props.classes.group} data-slot="data-toolbar-sheet-group">
        <legend id={id}>{filter.label}</legend>
        <RadioGroup
          aria-labelledby={id}
          value={values()[0] ?? ""}
          onValueChange={(next: string) => props.onChange(next === "" ? [] : [next])}
        >
          <For each={() => filter.options}>
            {(option: DataToolbarFilterOption) => {
              const optionId = createUniqueId();
              return (
                <span class={props.classes.choice}>
                  <RadioGroupItem id={optionId} value={option.value} />
                  <label for={optionId} class={props.classes.choiceLabel}>
                    <OptionMark option={option} classes={props.classes} />
                  </label>
                </span>
              );
            }}
          </For>
        </RadioGroup>
      </fieldset>
    );
  }
  return (
    <fieldset class={props.classes.group} data-slot="data-toolbar-sheet-group">
      <legend>{filter.label}</legend>
      <For each={() => grouped(filter.options)}>
        {(group: OptionGroup) => (
          <div role={group.group === undefined ? undefined : "group"} aria-label={group.group}>
            <Show when={group.group !== undefined}>
              <span class={props.classes.optionCount} aria-hidden="true">
                {group.group}
              </span>
            </Show>
            <For each={() => group.options}>
              {(option: DataToolbarFilterOption) => {
                const optionId = createUniqueId();
                return (
                  <span class={props.classes.choice}>
                    <Checkbox
                      id={optionId}
                      isSelected={values().includes(option.value)}
                      onChange={(on: boolean) => {
                        const rest = values().filter((each) => each !== option.value);
                        props.onChange(on ? [...rest, option.value] : rest);
                      }}
                    />
                    <label for={optionId} class={props.classes.choiceLabel}>
                      <OptionMark option={option} classes={props.classes} />
                    </label>
                  </span>
                );
              }}
            </For>
          </div>
        )}
      </For>
    </fieldset>
  );
}
