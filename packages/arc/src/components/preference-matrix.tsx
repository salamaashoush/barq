import { type Child, For, Show, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Checkbox } from "@barqjs/ui/checkbox";
import { on } from "@barqjs/ui/conditions";
import { Select, SelectItem } from "@barqjs/ui/select";

import { arcLayer as arc } from "../layer.ts";
import { type FieldValueProps, bindField } from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, edge, fg, gap, layout, place, plainList, space, type } from "../style/index.ts";
import type { FieldOption } from "./form.tsx";
import { useArcMessages } from "./messages.ts";

/** On a wide container a cell of the table; on a narrow one, the flex line it composes with. */
const tableCell = arc({
  [on.cqMd]: { display: "table-cell", paddingBlock: space.x3 },
  verticalAlign: "middle",
});

export const preferenceMatrixStyles = variants({
  slots: {
    root: arc(layout.column, gap[3], layout.container, layout.minZero),
    table: arc(place.block, type.body, {
      borderCollapse: "collapse",
      [on.cqMd]: { display: "table" },
    }),
    head: arc({ display: { default: "none", [on.cqMd]: "table-header-group" } }),
    columnHeader: arc(type.label, fg.muted, place.padded, {
      textAlign: "center",
      "&:first-child": { textAlign: "start", paddingInlineStart: "0" },
    }),
    group: arc({ display: { default: "block", [on.cqMd]: "table-row-group" } }),
    row: arc(edge.top, layout.column, gap[1.5], {
      paddingBlock: space.x3,
      [on.cqMd]: { display: "table-row", paddingBlock: "0" },
    }),
    groupRow: arc(bg.muted),
    rowHeader: arc(layout.column, gap[0.5], tableCell, {
      paddingInlineEnd: space.x3,
      textAlign: "start",
      fontWeight: "inherit",
    }),
    rowLabel: arc(type.label),
    groupLabel: arc(type.subheading),
    rowDescription: arc(type.meta, { display: "block" }),
    cell: arc(layout.row, gap[2], tableCell, {
      [on.cqMd]: { paddingInline: space.x3 },
      textAlign: "center",
      "&:empty": { display: { default: "none", [on.cqMd]: "table-cell" } },
    }),
    cellLabel: arc(type.sm, layout.grow, { textAlign: "start", [on.cqMd]: { display: "none" } }),
    select: arc({ minWidth: "8rem" }),
    notes: arc(plainList, layout.column, gap[1], type.meta),
    locked: arc({}),
  },
});

type Slots = ReturnType<typeof preferenceMatrixStyles>;

/** Where a notice can go: email, push, in the app. */
export interface PreferenceChannel {
  id: string;
  label: string;
  /** A choice per cell in place of on and off: "Off", "At once", "Daily digest". */
  options?: readonly FieldOption[];
  /**
   * Why it cannot be used yet: "Allow notifications in this browser first".
   * Its cells can be turned off but not on.
   */
  unavailable?: string;
}

/** One kind of notice. */
export interface PreferenceKind {
  id: string;
  label: string;
  description?: Child;
  /** The channels it can go to. @default every channel */
  channels?: readonly string[];
  /** Why it cannot be changed: "Urgent notices always reach you". */
  locked?: string;
}

export interface PreferenceGroup {
  id: string;
  label: string;
  description?: Child;
  kinds: readonly PreferenceKind[];
}

/** On or off, or the chosen option's value. */
export type PreferenceValue = boolean | string;

/** By kind, then by channel. */
export type Preferences = Readonly<Record<string, Readonly<Record<string, PreferenceValue>>>>;

export interface PreferenceMatrixProps extends Customisable<Slots>, FieldValueProps<Preferences> {
  /** Names the table. */
  label: string;
  channels: readonly PreferenceChannel[];
  groups: readonly PreferenceGroup[];
  /** A row per group of several kinds that sets every kind in it at once. @default true */
  groupDefaults?: boolean;
  isDisabled?: boolean;
}

/**
 * How a reader hears of each kind of notice, channel by channel: a table of
 * kinds by channels, a checkbox in each cell, or a choice where a channel
 * has options (at once, daily digest, off).
 *
 * ```tsx
 * <PreferenceMatrix
 *   label="Notifications"
 *   channels={[{ id: "email", label: "Email" }, { id: "push", label: "Push", unavailable: "Allow notifications in this browser first." }]}
 *   groups={[{ id: "work", label: "Work", kinds: [{ id: "mention", label: "Mentions" }, { id: "assigned", label: "Assigned to you" }] }]}
 *   defaultValue={{ mention: { email: true, push: false } }}
 * />
 * ```
 *
 * Each group of several kinds opens with a row that sets them all, mixed
 * while they differ. A channel that cannot be used yet says why under the
 * table, and its cells only turn off; a locked kind says why it is fixed.
 * Every control is named by its kind and channel, so it reads alone. On a
 * narrow container each kind stacks its channels, each with its name. It is
 * a field: inside `form.AppField` it is the form's.
 */
export function PreferenceMatrix(props: PreferenceMatrixProps) {
  const messages = useArcMessages();
  const id = createUniqueId();
  const of = bindField<Preferences>(props, {});
  function cls(): Slots {
    return parts(preferenceMatrixStyles(), props.classes);
  }
  function offers(kind: PreferenceKind, channelId: string): boolean {
    return kind.channels === undefined || kind.channels.includes(channelId);
  }
  function valueOf(kindId: string, channelId: string): PreferenceValue | undefined {
    return of.value()[kindId]?.[channelId];
  }
  function isOn(value: PreferenceValue | undefined): boolean {
    return value === true;
  }
  function set(kindIds: readonly string[], channelId: string, value: PreferenceValue): void {
    const next: Record<string, Record<string, PreferenceValue>> = { ...of.value() };
    for (const kindId of kindIds) next[kindId] = { ...next[kindId], [channelId]: value };
    of.change(next);
    of.blur();
  }
  function noteId(channelId: string): string {
    return `${id}-${channelId}-note`;
  }
  function changeable(kinds: readonly PreferenceKind[], channelId: string): PreferenceKind[] {
    return kinds.filter((kind) => kind.locked === undefined && offers(kind, channelId));
  }
  function options(entry: PreferenceChannel, current: PreferenceValue | undefined): FieldOption[] {
    const listed = [...(entry.options ?? [])];
    if (typeof current === "string" && !listed.some((option) => option.value === current)) {
      listed.push({ value: current, label: current });
    }
    return listed;
  }
  function blocked(entry: PreferenceChannel, current: PreferenceValue | undefined): boolean {
    if (props.isDisabled === true) return true;
    if (entry.unavailable === undefined) return false;
    return entry.options === undefined ? !isOn(current) : true;
  }
  function showGroupRow(group: PreferenceGroup): boolean {
    return props.groupDefaults !== false && group.kinds.length > 1;
  }

  function control(
    entry: PreferenceChannel,
    name: string,
    kinds: readonly PreferenceKind[],
    current: () => PreferenceValue | undefined,
    mixed: () => boolean,
  ) {
    const describedBy = entry.unavailable === undefined ? undefined : noteId(entry.id);
    function targets(): string[] {
      return kinds.map((kind) => kind.id);
    }
    return (
      <Show
        when={entry.options !== undefined}
        fallback={
          <Checkbox
            aria-label={name}
            aria-describedby={describedBy}
            isSelected={isOn(current())}
            isIndeterminate={mixed()}
            isDisabled={blocked(entry, current()) || kinds.length === 0}
            onChange={(next: boolean) => set(targets(), entry.id, next)}
            data-slot="preference-matrix-checkbox"
          />
        }
      >
        <Select
          items={options(entry, current()).map((option) => ({ id: option.value, ...option }))}
          value={typeof current() === "string" ? (current() as string) : undefined}
          placeholder={mixed() ? messages().mixed : messages().selectPlaceholder}
          aria-label={name}
          aria-describedby={describedBy}
          isDisabled={blocked(entry, current()) || kinds.length === 0}
          size="sm"
          class={cls().select}
          onValueChange={(value: string) => set(targets(), entry.id, value)}
        >
          {(option: FieldOption) => <SelectItem>{option.label}</SelectItem>}
        </Select>
      </Show>
    );
  }

  function groupCell(group: PreferenceGroup, entry: PreferenceChannel) {
    function kinds(): PreferenceKind[] {
      return changeable(group.kinds, entry.id);
    }
    function values(): (PreferenceValue | undefined)[] {
      return kinds().map((kind) => valueOf(kind.id, entry.id));
    }
    function same(): PreferenceValue | undefined {
      const all = values();
      if (entry.options === undefined) return all.length > 0 && all.every(isOn);
      return all.length > 0 && all.every((one) => one === all[0]) ? all[0] : undefined;
    }
    function mixed(): boolean {
      const all = values();
      if (entry.options === undefined) return all.some(isOn) && !all.every(isOn);
      return all.some((one) => one !== all[0]);
    }
    return (
      <td class={cls().cell} data-slot="preference-matrix-cell">
        <span class={cls().cellLabel} aria-hidden="true">
          {entry.label}
        </span>
        {control(entry, messages().preferenceAll(group.label, entry.label), kinds(), same, mixed)}
      </td>
    );
  }

  function kindCell(kind: PreferenceKind, entry: PreferenceChannel) {
    return (
      <td class={cls().cell} data-slot="preference-matrix-cell">
        <Show when={offers(kind, entry.id)}>
          <span class={cls().cellLabel} aria-hidden="true">
            {entry.label}
          </span>
          {control(
            entry,
            messages().preferenceCell(kind.label, entry.label),
            kind.locked === undefined ? [kind] : [],
            () => valueOf(kind.id, entry.id),
            () => false,
          )}
        </Show>
      </td>
    );
  }

  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="preference-matrix">
      <table class={cls().table} aria-label={props.label}>
        <thead class={cls().head}>
          <tr>
            <th scope="col" class={cls().columnHeader}>
              {messages().notificationKind}
            </th>
            <For each={props.channels}>
              {(entry: PreferenceChannel) => (
                <th scope="col" class={cls().columnHeader}>
                  {entry.label}
                </th>
              )}
            </For>
          </tr>
        </thead>
        <For each={props.groups}>
          {(group: PreferenceGroup) => (
            <tbody class={cls().group} data-slot="preference-matrix-group">
              <tr
                class={arc(cls().row, showGroupRow(group) ? cls().groupRow : undefined)}
                data-group=""
              >
                <th scope={showGroupRow(group) ? "row" : "rowgroup"} class={cls().rowHeader}>
                  <span class={cls().groupLabel}>{group.label}</span>
                  <Show when={group.description !== undefined}>
                    <span class={cls().rowDescription}>{group.description}</span>
                  </Show>
                </th>
                <Show
                  when={showGroupRow(group)}
                  fallback={<td class={cls().cell} colSpan={props.channels.length} />}
                >
                  <For each={props.channels}>
                    {(entry: PreferenceChannel) => groupCell(group, entry)}
                  </For>
                </Show>
              </tr>
              <For each={group.kinds}>
                {(kind: PreferenceKind) => (
                  <tr class={cls().row} data-slot="preference-matrix-row">
                    <th scope="row" class={cls().rowHeader}>
                      <span class={cls().rowLabel}>{kind.label}</span>
                      <Show when={kind.description !== undefined}>
                        <span class={cls().rowDescription}>{kind.description}</span>
                      </Show>
                      <Show when={kind.locked !== undefined}>
                        <span
                          class={arc(cls().rowDescription, cls().locked)}
                          data-slot="preference-matrix-locked"
                        >
                          {kind.locked}
                        </span>
                      </Show>
                    </th>
                    <For each={props.channels}>
                      {(entry: PreferenceChannel) => kindCell(kind, entry)}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          )}
        </For>
      </table>
      <Show when={props.channels.some((entry) => entry.unavailable !== undefined)}>
        <ul class={cls().notes} data-slot="preference-matrix-notes">
          <For each={props.channels.filter((entry) => entry.unavailable !== undefined)}>
            {(entry: PreferenceChannel) => (
              <li id={noteId(entry.id)}>{`${entry.label}: ${entry.unavailable ?? ""}`}</li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
