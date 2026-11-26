import { type Accessor, type Child, For, Show, flush, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { announce } from "@barqjs/aria/live";
import { ArrowDown } from "@barqjs/lucide/icons/arrow-down";
import { ArrowUp } from "@barqjs/lucide/icons/arrow-up";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";
import { getBy } from "@barqjs/form";
import { Button } from "@barqjs/ui/button";

import { arcLayer as arc } from "../layer.ts";
import {
  type ArcFieldProps,
  type FieldSlots,
  type FieldValueProps,
  Frame,
  arrayFieldOf,
  bindField,
  fieldStyles,
  useArcFormContext,
} from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, layout, plainList, type } from "../style/index.ts";
import { IconButton } from "./icon-button.tsx";
import { useArcMessages } from "./messages.ts";

/** One row of a `RepeaterField`, as its children read it. */
export interface RepeaterRow<T> {
  /** Its place, from 0. */
  index: number;
  value: Accessor<T>;
  /** The name of one of its fields on the form: `row.name("key")` is `headers[2].key`. */
  name: (key?: string) => string;
  /** Replaces the row's value, for rows that are not a form's. */
  update: (next: T) => void;
}

export const repeaterFieldStyles = variants({
  slots: {
    list: arc(plainList, layout.column, gap[3]),
    row: arc(layout.row, gap[2], { alignItems: "flex-end" }),
    fields: arc(layout.grow, layout.minZero, gap[3], {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 10rem), 1fr))",
    }),
    actions: arc(layout.row, layout.noShrink, gap[1]),
    add: arc({ alignSelf: "flex-start" }),
    empty: arc(type.body, fg.muted),
  },
});

type Slots = ReturnType<typeof repeaterFieldStyles> & FieldSlots;

export interface RepeaterFieldProps<T>
  extends Omit<ArcFieldProps, "classes">, FieldValueProps<readonly T[]>, Customisable<Slots> {
  /** A new row's value. */
  newRow: () => T;
  /** One row's fields. */
  children: (row: RepeaterRow<T>) => Child;
  /** Rows it keeps at least; their remove buttons go quiet at this many. @default 0 */
  min?: number;
  /** Rows it holds at most; Add goes quiet at this many. */
  max?: number;
  /** Each row gets buttons that move it up and down. @default false */
  reorderable?: boolean;
  /** Names a row for its buttons: "Header 2", "Ada". @default the label and the row's number */
  rowLabel?: (row: T, index: number) => string;
  /** @default the provider's `addRow`, "Add row" */
  addLabel?: string;
  /** What an empty list says. */
  emptyLabel?: Child;
}

/**
 * Rows of the same fields, added and removed by the reader: request
 * headers, a question's options, a family's contacts, a grade scale's bands.
 *
 * ```tsx
 * <form.AppField name="headers" mode="array">
 *   {(field) => (
 *     <field.RepeaterField label="Headers" newRow={() => ({ key: "", value: "" })} reorderable>
 *       {(row) => (
 *         <form.AppField name={row.name("key")}>{(cell) => <cell.TextField label="Name" />}</form.AppField>
 *       )}
 *     </field.RepeaterField>
 *   )}
 * </form.AppField>
 * ```
 *
 * In a form the rows move through the array field's own push, remove and
 * move, so each row's errors move with it. Every button is named after its
 * row, a new row takes focus, and a removed one hands focus to the row that
 * took its place, or to Add.
 */
export function RepeaterField<T>(props: RepeaterFieldProps<T>) {
  const messages = useArcMessages();
  const of = bindField<readonly T[]>(props, []);
  const array = arrayFieldOf(of);
  let list: HTMLElement | undefined;
  let adder: HTMLButtonElement | undefined;
  function cls(): Slots {
    return parts({ ...fieldStyles(), ...repeaterFieldStyles() }, props.classes);
  }
  function rows(): readonly T[] {
    return of.value() ?? [];
  }
  // An array field wakes for rows added, removed or moved, not for an edit
  // inside one; a row named by what was typed into it reads the values.
  const live: Accessor<readonly T[]> =
    array === undefined
      ? rows
      : useArcFormContext().useSelector(
          (state) =>
            (getBy(state.values, untrack(array).name as string) as readonly T[] | undefined) ?? [],
        );
  function label(index: number): string {
    const row = live()[index];
    if (row !== undefined && props.rowLabel !== undefined) return props.rowLabel(row, index);
    return messages().rowOf(index + 1);
  }
  function focusRow(index: number): void {
    flush();
    const row = list?.querySelectorAll<HTMLElement>('[data-slot="repeater-row"]')[index];
    const target = row?.querySelector<HTMLElement>("input, select, textarea, button, [tabindex]");
    (target ?? adder)?.focus();
  }
  function add(): void {
    const next = untrack(() => props.newRow)();
    if (array === undefined) of.change([...untrack(rows), next]);
    else untrack(array).pushValue(next);
    const index = untrack(rows).length - 1;
    announce(
      untrack(() => messages().rowAdded(label(index))),
      "polite",
    );
    focusRow(index);
  }
  function remove(index: number): void {
    const named = untrack(() => label(index));
    if (array === undefined) of.change(untrack(rows).filter((_, at) => at !== index));
    else untrack(array).removeValue(index);
    announce(untrack(messages).rowRemoved(named), "polite");
    focusRow(Math.min(index, untrack(rows).length - 1));
  }
  function move(index: number, to: number): void {
    if (array === undefined) {
      const next = [...untrack(rows)];
      const [moved] = next.splice(index, 1);
      if (moved !== undefined) next.splice(to, 0, moved);
      of.change(next);
    } else {
      untrack(array).moveValue(index, to);
    }
    announce(
      untrack(() => messages().rowMoved(label(to), to + 1, rows().length)),
      "polite",
    );
    flush();
    const row = list?.querySelectorAll<HTMLElement>('[data-slot="repeater-row"]')[to];
    row
      ?.querySelector<HTMLElement>(`[data-slot="repeater-${to > index ? "down" : "up"}"]`)
      ?.focus();
  }
  function update(index: number, next: T): void {
    of.change(untrack(rows).map((row, at) => (at === index ? next : row)));
  }
  function canRemove(): boolean {
    return props.isDisabled !== true && rows().length > (props.min ?? 0);
  }
  function canAdd(): boolean {
    return props.isDisabled !== true && (props.max === undefined || rows().length < props.max);
  }

  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="repeater-field"
    >
      <Show
        when={rows().length > 0}
        fallback={
          <Show when={props.emptyLabel !== undefined}>
            <p class={cls().empty} data-slot="repeater-empty">
              {props.emptyLabel}
            </p>
          </Show>
        }
      >
        <ol
          class={cls().list}
          data-slot="repeater-list"
          aria-labelledby={of.ids.label}
          aria-describedby={of.describedBy(props.description !== undefined)}
          ref={(element: HTMLElement) => {
            list = element;
          }}
        >
          <For each={rows()} keyed={false}>
            {(value: Accessor<T>, index: number) => (
              <li class={cls().row} data-slot="repeater-row">
                <div class={cls().fields} data-slot="repeater-fields">
                  {props.children({
                    index,
                    value,
                    name: (key?: string) =>
                      key === undefined
                        ? `${of.name() ?? ""}[${String(index)}]`
                        : `${of.name() ?? ""}[${String(index)}].${key}`,
                    update: (next: T) => update(index, next),
                  })}
                </div>
                <div class={cls().actions} data-slot="repeater-actions">
                  <Show when={props.reorderable === true}>
                    <IconButton
                      label={messages().moveRowUpOf(label(index))}
                      size="sm"
                      slot="repeater-up"
                      isDisabled={props.isDisabled === true || index === 0}
                      onPress={() => move(index, index - 1)}
                    >
                      <ArrowUp />
                    </IconButton>
                    <IconButton
                      label={messages().moveRowDownOf(label(index))}
                      size="sm"
                      slot="repeater-down"
                      isDisabled={props.isDisabled === true || index === rows().length - 1}
                      onPress={() => move(index, index + 1)}
                    >
                      <ArrowDown />
                    </IconButton>
                  </Show>
                  <IconButton
                    label={messages().removeRowOf(label(index))}
                    size="sm"
                    slot="repeater-remove"
                    isDisabled={!canRemove()}
                    onPress={() => remove(index)}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              </li>
            )}
          </For>
        </ol>
      </Show>
      <Button
        variant="outline"
        size="sm"
        class={cls().add}
        data-slot="repeater-add"
        isDisabled={!canAdd()}
        ref={(element: HTMLButtonElement) => {
          adder = element;
        }}
        onPress={add}
      >
        <Plus aria-hidden="true" />
        {props.addLabel ?? messages().addRow}
      </Button>
    </Frame>
  );
}
