import { type Child, createSignal, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { announce } from "@barqjs/aria/live";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Button } from "@barqjs/ui/button";

import { arcLayer as arc } from "../layer.ts";
import {
  type ArcFieldProps,
  type FieldSlots,
  type FieldValueProps,
  Frame,
  bindField,
  fieldStyles,
} from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import { gap, layout } from "../style/index.ts";
import type { DataTableRowAction } from "./data-table-parts.tsx";
import { DataTable, type DataTableCard, type DataTableColumn } from "./data-table.tsx";
import { useArcForm } from "./form.tsx";
import { FormSheet } from "./form-sheet.tsx";
import { useArcMessages } from "./messages.ts";

export const collectionFieldStyles = variants({
  slots: {
    body: arc(layout.column, gap[3]),
    table: arc({}),
    add: arc({ alignSelf: "flex-start" }),
    sheet: arc({}),
  },
});

type Slots = ReturnType<typeof collectionFieldStyles> & FieldSlots;

type RecordValues = Record<string, unknown>;

/** The form a sheet edits one record with: arc's, holding the record's values. */
function recordForm(start: () => RecordValues, commit: (values: RecordValues) => void) {
  return useArcForm(() => ({
    defaultValues: untrack(start),
    onSubmit: ({ value }) => commit(value),
  }));
}

/** The form a `CollectionField`'s sheet edits one record with: arc's, with its fields. */
export type CollectionRecordForm = ReturnType<typeof recordForm>;

export interface CollectionFieldProps<T extends object>
  extends Omit<ArcFieldProps, "classes">, FieldValueProps<readonly T[]>, Customisable<Slots> {
  /** The table's columns, as `DataTable` takes them. */
  columns: readonly DataTableColumn<T>[];
  /** What the sheet starts a new record from. */
  newRecord: () => T;
  /** The sheet's fields, on the form it edits the record with. */
  editor: (form: CollectionRecordForm) => Child;
  /** Names a record in its row's actions and announcements: "Tuition", "Period 3". */
  recordLabel: (record: T) => string;
  /** On a phone each record is a card. @default the first column as its title */
  card?: DataTableCard<T>;
  /** The sheet's heading. @default the provider's `addRecord` or `editRecord` */
  heading?: (isNew: boolean) => Child;
  /** @default "md" */
  sheetSize?: "sm" | "md" | "lg" | "xl";
  /** Records it holds at most; Add goes quiet at this many. */
  max?: number;
  /** @default the provider's `addRow`, "Add row" */
  addLabel?: string;
  /** What an empty table says. */
  emptyLabel?: Child;
}

/**
 * Records that belong to the one being edited, edited inside its form: a
 * programme's fees, a bell schedule's periods, a grade scale's bands.
 *
 * ```tsx
 * <form.AppField name="fees">
 *   {() => (
 *     <CollectionField
 *       label="Fees"
 *       columns={FEE_COLUMNS}
 *       newRecord={() => ({ name: "", amount: 0 })}
 *       recordLabel={(fee) => fee.name}
 *       editor={(sheet) => (
 *         <sheet.AppField name="name">{(f) => <f.TextField label="Name" />}</sheet.AppField>
 *       )}
 *     />
 *   )}
 * </form.AppField>
 * ```
 *
 * The records are a table, cards on a phone, each with Edit and Remove;
 * Add and Edit open a sheet holding a form of its own, validated on its own,
 * whose Save writes the record into the array. Closing the sheet with
 * changes asks first, as every `FormSheet` does. Inside `form.AppField` it
 * holds that field's array, as every arc field does; it is not one of
 * `field.*`, because its sheet is an arc form itself.
 */
export function CollectionField<T extends object>(props: CollectionFieldProps<T>) {
  const messages = useArcMessages();
  const of = bindField<readonly T[]>(props, []);
  const [editing, setEditing] = createSignal<number | null>(null);
  const [open, setOpen] = createSignal(false);
  const sheet = recordForm(
    () => props.newRecord() as RecordValues,
    (values) => commit(values as T),
  );
  function cls(): Slots {
    return parts({ ...fieldStyles(), ...collectionFieldStyles() }, props.classes);
  }
  function records(): readonly T[] {
    return of.value() ?? [];
  }
  function commit(record: T): void {
    const at = untrack(editing);
    const held = untrack(records);
    of.change(
      at === null ? [...held, record] : held.map((one, index) => (index === at ? record : one)),
    );
    of.blur();
    announce(
      at === null ? untrack(messages).rowAdded(props.recordLabel(record)) : untrack(messages).saved,
      "polite",
    );
  }
  function edit(index: number | null): void {
    const held = untrack(records);
    const record = index === null ? untrack(() => props.newRecord()) : held[index];
    if (record === undefined) return;
    setEditing(index);
    sheet.reset(record as RecordValues);
    setOpen(true);
  }
  function remove(index: number): void {
    const held = untrack(records);
    const record = held[index];
    if (record === undefined) return;
    of.change(held.filter((_, at) => at !== index));
    of.blur();
    announce(untrack(messages).rowRemoved(props.recordLabel(record)), "polite");
  }
  function actions(record: T): readonly DataTableRowAction[] {
    const index = records().indexOf(record);
    const named = props.recordLabel(record);
    return [
      {
        label: messages().editRecordOf(named),
        inline: true,
        isDisabled: props.isDisabled,
        onAction: () => edit(index),
      },
      {
        label: messages().removeRowOf(named),
        tone: "danger",
        isDisabled: props.isDisabled,
        onAction: () => remove(index),
      },
    ];
  }
  function heading(): Child {
    const isNew = editing() === null;
    return props.heading?.(isNew) ?? (isNew ? messages().addRecord : messages().editRecord);
  }
  function canAdd(): boolean {
    return props.isDisabled !== true && (props.max === undefined || records().length < props.max);
  }
  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="collection-field"
    >
      <div class={cls().body} data-slot="collection-field-body">
        <DataTable
          class={cls().table}
          label={typeof props.label === "string" ? props.label : messages().records}
          columns={props.columns}
          data={records()}
          getRowId={(record: T) => String(records().indexOf(record))}
          rowActions={actions}
          card={props.card}
          empty={props.emptyLabel}
          density="compact"
        />
        <Button
          variant="outline"
          size="sm"
          class={cls().add}
          data-slot="collection-field-add"
          isDisabled={!canAdd()}
          onPress={() => edit(null)}
        >
          <Plus aria-hidden="true" />
          {props.addLabel ?? messages().addRow}
        </Button>
      </div>
      <FormSheet
        form={sheet}
        class={cls().sheet}
        heading={heading()}
        size={props.sheetSize}
        open={open()}
        onOpenChange={setOpen}
      >
        {props.editor(sheet)}
      </FormSheet>
    </Frame>
  );
}
