import { type Child, For, Show, createMemo, createSignal, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { filter } from "@barqjs/aria/i18n";
import { announce } from "@barqjs/aria/live";
import { Search } from "@barqjs/lucide/icons/search";
import { Checkbox } from "@barqjs/ui/checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@barqjs/ui/input-group";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import {
  type ArcFieldProps,
  type FieldSlots,
  type FieldValueProps,
  Frame,
  bindField,
  fieldStyles,
  withOwnErrors,
} from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  edge,
  fg,
  gap,
  glyph,
  interaction,
  layout,
  plainList,
  rounded,
  space,
  target,
  tone,
  truncate,
  type,
} from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

/** One row of a `ChecklistField`. */
export interface ChecklistOption {
  value: string;
  label: Child;
  /** What the search reads. @default the label, when it is text */
  textValue?: string;
  /** Before the label: a kind's icon, an avatar. */
  icon?: Child;
  /** At the row's end: a count, an owner, a badge. */
  meta?: Child;
  isDisabled?: boolean;
}

/** An input group laid into the panel's edge, drawing only the rule between it and the rows. */
const flush = arc(edge.none, { borderRadius: "0px", boxShadow: "none" });

export const checklistFieldStyles = variants({
  slots: {
    panel: arc(edge.all, rounded.md, layout.column, layout.minZero, { overflow: "hidden" }),
    search: arc(flush, edge.bottom),
    list: arc(plainList, layout.column, layout.scrollBlock, {
      maxHeight: "var(--checklist-height, 12rem)",
      "& > li:first-child": { borderBlockStartWidth: "0px" },
    }),
    item: arc(edge.top),
    row: arc(
      layout.row,
      gap[3],
      target.size,
      interaction.hover,
      interaction.pressable,
      interaction.disabled,
      {
        minBlockSize: space.x11,
        paddingInline: space.x3,
        "[data-disabled]": { cursor: "default" },
      },
    ),
    control: arc(layout.noShrink),
    icon: arc(layout.inlineCentre, layout.noShrink, fg.muted, glyph.md),
    label: arc(layout.grow, layout.minZero, truncate, type.sm),
    meta: arc(layout.noShrink, type.meta),
    empty: arc(type.meta, { padding: space.x3 }),
    add: arc(flush, edge.top),
    summary: arc(type.meta),
    warning: arc(type.meta, tone.warning, fg.tone),
  },
});

type ChecklistSlots = ReturnType<typeof checklistFieldStyles> & FieldSlots;

export interface ChecklistFieldProps
  extends
    Omit<ArcFieldProps, "classes">,
    FieldValueProps<readonly string[]>,
    Customisable<ChecklistSlots> {
  options: readonly ChecklistOption[];
  /** A search over the rows. `true` always; a number, from that many rows on. @default 8 */
  searchable?: boolean | number;
  /** @default the provider's `search`, "Search" */
  searchPlaceholder?: string;
  /** The tallest the list gets before it scrolls. @default "12rem" */
  maxHeight?: string;
  /**
   * A field under the list for an entry the options do not have, which is
   * added ticked: a host, an address. Answers why one is refused, or nothing.
   */
  onAdd?: (text: string) => string | undefined;
  /** @default the provider's `add`, "Add" */
  addLabel?: string;
  addPlaceholder?: string;
  /** A line under the panel: what is chosen, said as a sentence. */
  summary?: Child;
  /** A line under the panel in a warning tone, in place of the summary. */
  warning?: Child;
  /** What an empty list says. @default the provider's `nothingHere` */
  emptyLabel?: Child;
  /** Options there are but the reader cannot see, said under the list. */
  hiddenCount?: number;
  /** Shows only the chosen rows, with nothing to change. */
  isReadOnly?: boolean;
}

function textOf(option: ChecklistOption): string {
  return option.textValue ?? (typeof option.label === "string" ? option.label : option.value);
}

/**
 * A bordered list of checkbox rows inside a form: the projects a location
 * serves, the checks a status page shows, the tenants an app may reach.
 *
 * ```tsx
 * <ChecklistField label="Projects" options={PROJECTS} summary={`${chosen().length} chosen`} />
 * ```
 *
 * Each row is its checkbox, its label and what it carries at its end, and
 * the whole row is the press target. A long list gets a search above it and
 * scrolls at `maxHeight`; what the search leaves is counted for a screen
 * reader. `onAdd` puts a field under the list for an entry the options do
 * not have. Held as the chosen values in the rows' order, the added ones
 * after.
 */
export function ChecklistField(props: ChecklistFieldProps) {
  const messages = useArcMessages();
  const of = bindField<readonly string[]>(props, []);
  const match = filter({ sensitivity: "base" });
  const [query, setQuery] = createSignal("");
  const [draft, setDraft] = createSignal("");
  const [refused, setRefused] = createSignal<string[]>([]);
  function cls(): ChecklistSlots {
    return parts({ ...fieldStyles(), ...checklistFieldStyles() }, props.classes);
  }
  function chosen(): readonly string[] {
    return of.value() ?? [];
  }
  const rows = createMemo((): readonly ChecklistOption[] => {
    const known = props.options;
    const added = chosen()
      .filter((value) => !known.some((option) => option.value === value))
      .map((value) => ({ value, label: value }));
    return added.length === 0 ? known : [...known, ...added];
  });
  function searchable(): boolean {
    const given = props.searchable ?? 8;
    return typeof given === "number" ? rows().length >= given : given;
  }
  const shown = createMemo((): readonly ChecklistOption[] => {
    if (props.isReadOnly === true) return rows().filter((row) => chosen().includes(row.value));
    const text = query().trim();
    if (text === "") return rows();
    return rows().filter((row) => match.contains(textOf(row), text));
  });
  function inOrder(values: readonly string[]): string[] {
    return rows()
      .map((row) => row.value)
      .filter((value) => values.includes(value));
  }
  function toggle(value: string, on: boolean): void {
    const held = untrack(chosen);
    of.change(inOrder(on ? [...held, value] : held.filter((one) => one !== value)));
    of.blur();
  }
  function add(): void {
    const text = untrack(draft).trim();
    if (text === "") return;
    const held = untrack(chosen);
    const reason = held.includes(text)
      ? messages().duplicateTag(text)
      : untrack(() => props.onAdd)?.(text);
    if (reason !== undefined) {
      setRefused([reason]);
      return;
    }
    setRefused([]);
    setDraft("");
    of.change([...held, text]);
    announce(messages().added(text), "polite");
  }
  const wiring = withOwnErrors(of, refused);

  return (
    <Frame
      of={wiring}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="checklist-field"
    >
      <div
        class={cls().panel}
        data-slot="checklist-field-panel"
        style={
          props.maxHeight === undefined ? undefined : { "--checklist-height": props.maxHeight }
        }
      >
        <Show when={searchable() && props.isReadOnly !== true}>
          <InputGroup class={cls().search} data-slot="checklist-field-search">
            <InputGroupAddon aria-hidden="true">
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={query()}
              placeholder={props.searchPlaceholder ?? messages().search}
              aria-label={props.searchPlaceholder ?? messages().search}
              onInput={(event: Event) => setQuery((event.currentTarget as HTMLInputElement).value)}
            />
          </InputGroup>
          <span class={srOnly} role="status">
            {query().trim() === "" ? "" : messages().resultCount(shown().length)}
          </span>
        </Show>
        <Show
          when={shown().length > 0}
          fallback={
            <p class={cls().empty} data-slot="checklist-field-empty">
              {rows().length === 0 || props.isReadOnly === true
                ? (props.emptyLabel ?? messages().nothingHere)
                : messages().noMatches}
            </p>
          }
        >
          <ul
            class={cls().list}
            data-slot="checklist-field-list"
            role="group"
            aria-labelledby={of.ids.label}
            aria-describedby={wiring.describedBy(props.description !== undefined)}
          >
            <For each={shown()}>
              {(row: ChecklistOption) => (
                <li class={cls().item}>
                  <label
                    class={cls().row}
                    data-slot="checklist-field-row"
                    data-disabled={row.isDisabled === true ? "" : undefined}
                  >
                    <Show when={props.isReadOnly !== true}>
                      <Checkbox
                        class={cls().control}
                        name={of.name()}
                        value={row.value}
                        isSelected={chosen().includes(row.value)}
                        isDisabled={props.isDisabled === true || row.isDisabled === true}
                        onChange={(on: boolean) => toggle(row.value, on)}
                      />
                    </Show>
                    <Show when={row.icon !== undefined}>
                      <span class={cls().icon} data-slot="checklist-field-icon" aria-hidden="true">
                        {row.icon}
                      </span>
                    </Show>
                    <span class={cls().label} data-slot="checklist-field-label">
                      {row.label}
                    </span>
                    <Show when={row.meta !== undefined}>
                      <span class={cls().meta} data-slot="checklist-field-meta">
                        {row.meta}
                      </span>
                    </Show>
                  </label>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={props.onAdd !== undefined && props.isReadOnly !== true}>
          <InputGroup class={cls().add} data-slot="checklist-field-add">
            <InputGroupInput
              value={draft()}
              placeholder={props.addPlaceholder}
              aria-label={props.addPlaceholder ?? props.addLabel ?? messages().add}
              aria-invalid={refused().length > 0 ? true : undefined}
              aria-describedby={refused().length > 0 ? wiring.ids.error : undefined}
              disabled={props.isDisabled}
              onInput={(event: Event) => {
                setDraft((event.currentTarget as HTMLInputElement).value);
                if (untrack(refused).length > 0) setRefused([]);
              }}
              onKeyDown={(event: KeyboardEvent) => {
                if (event.key !== "Enter" || event.isComposing) return;
                event.preventDefault();
                add();
              }}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="sm" isDisabled={props.isDisabled} onPress={add}>
                {props.addLabel ?? messages().add}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Show>
      </div>
      <Show when={(props.hiddenCount ?? 0) > 0}>
        <p class={cls().summary} data-slot="checklist-field-hidden">
          {messages().hiddenOptions(props.hiddenCount ?? 0)}
        </p>
      </Show>
      <Show
        when={props.warning !== undefined}
        fallback={
          <Show when={props.summary !== undefined}>
            <p class={cls().summary} data-slot="checklist-field-summary">
              {props.summary}
            </p>
          </Show>
        }
      >
        <p class={cls().warning} data-slot="checklist-field-warning">
          {props.warning}
        </p>
      </Show>
    </Frame>
  );
}
