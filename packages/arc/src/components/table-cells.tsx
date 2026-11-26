import { type Child, For, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { listFormatter, numberFormatter } from "@barqjs/aria/i18n";
import { Button } from "@barqjs/ui/button";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, layout, plainList, truncate, type } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";
import { ResponsiveOverlay } from "./responsive-overlay.tsx";

export const cellWithNoteStyles = variants({
  slots: {
    root: arc(layout.column, layout.minZero, { display: "grid" }),
    value: arc(truncate, type.medium),
    note: arc(truncate, type.meta, fg.muted),
  },
});

type NoteSlots = ReturnType<typeof cellWithNoteStyles>;

export interface CellWithNoteProps extends Customisable<NoteSlots> {
  /** What the row is, in the cell's own weight. */
  children: Child;
  /** Free text about it, such as why it was done, on one muted line under it. */
  note?: string | null;
}

/**
 * A cell's subject with a note under it, so a reason reads beside what it is
 * about rather than in a narrow column of its own. A long note is cut with an
 * ellipsis and shown whole on hover; the whole of it stays in the page, so a
 * screen reader reads it all.
 *
 * ```tsx
 * { accessorKey: "grade", header: "Grade", cell: (c) => <CellWithNote note={c.row.original.comment}>{c.getValue()}</CellWithNote> }
 * ```
 */
export function CellWithNote(props: CellWithNoteProps) {
  function cls(): NoteSlots {
    return parts(cellWithNoteStyles(), props.classes);
  }
  function note(): string | undefined {
    return props.note === null || props.note === undefined || props.note === ""
      ? undefined
      : props.note;
  }
  return (
    <span class={arc(cls().root, props.class, props.className)} data-slot="cell-with-note">
      <span class={cls().value} data-slot="cell-with-note-value">
        {props.children}
      </span>
      <Show when={note() !== undefined}>
        <span class={cls().note} data-slot="cell-with-note-note" dir="auto" title={note()}>
          {note()}
        </span>
      </Show>
    </span>
  );
}

export const overflowListStyles = variants({
  slots: {
    root: arc(layout.inlineRow, layout.minZero, layout.wrap, gap[1.5]),
    item: arc(layout.minZero),
    more: arc(type.numeric, { height: "auto", paddingInline: "0px", minWidth: "0px" }),
    list: arc(plainList, layout.column, gap[1.5]),
    entry: arc({ overflowWrap: "anywhere" }),
  },
});

type OverflowSlots = ReturnType<typeof overflowListStyles>;

export interface OverflowListProps<T> extends Customisable<OverflowSlots> {
  items: readonly T[];
  /** Names the whole list, in the overlay that shows it all: "Used by". */
  label: string;
  /** How one item reads: its text, or a link. @default `String(item)` */
  render?: (item: T) => Child;
  /** One item's words, for the sentence of the `text` variant. @default `String(item)` */
  getText?: (item: T) => string;
  /** How many show before the rest fold. @default 2, and 3 for `text` */
  max?: number;
  /**
   * `count`: the first items, then "+3". `text`: one sentence, "a, b and
   * 3 more", joined as the locale joins a list. @default "count"
   */
  variant?: "count" | "text";
  /** Shown for none. @default nothing */
  empty?: Child;
}

/**
 * The first few of a list in a cell, and the rest one press away: "+3" or
 * "and 3 more" is a button that opens the whole list, as a popover beside it
 * on a wide screen and a sheet under a finger, so the keyboard and a touch
 * screen reach every item and not just a mouse's hover.
 *
 * ```tsx
 * <OverflowList label="Used by" items={file.usedBy} render={(check) => <TextLink to={check.href}>{check.name}</TextLink>} getText={(check) => check.name} />
 * ```
 */
export function OverflowList<T>(props: OverflowListProps<T>) {
  const messages = useArcMessages();
  const list = listFormatter({ type: "conjunction" });
  const signed = numberFormatter({ signDisplay: "always" });
  function cls(): OverflowSlots {
    return parts(overflowListStyles(), props.classes);
  }
  function text(item: T): string {
    return props.getText?.(item) ?? String(item);
  }
  function draw(item: T): Child {
    return props.render?.(item) ?? text(item);
  }
  function max(): number {
    return Math.max(1, props.max ?? (props.variant === "text" ? 3 : 2));
  }
  function shown(): readonly T[] {
    return props.items.slice(0, max());
  }
  function rest(): number {
    return Math.max(0, props.items.length - max());
  }
  function fullName(): string {
    return `${props.label}: ${list().format(props.items.map(text))}`;
  }

  function more() {
    return (
      <ResponsiveOverlay
        heading={props.label}
        desktop="popover"
        trigger={
          <Button
            variant="link"
            size="sm"
            class={cls().more}
            data-slot="overflow-list-more"
            aria-label={`${messages().moreCount(rest())}, ${fullName()}`}
          >
            {props.variant === "text" ? messages().moreCount(rest()) : signed().format(rest())}
          </Button>
        }
      >
        <ul class={cls().list} data-slot="overflow-list-all">
          <For each={() => props.items}>
            {(item: T) => (
              <li class={cls().entry} data-slot="overflow-list-entry">
                {draw(item)}
              </li>
            )}
          </For>
        </ul>
      </ResponsiveOverlay>
    );
  }

  /** The `text` sentence in the locale's order, the "3 more" in it a button. */
  function sentence() {
    const MORE = "\u0000";
    function pieces(): (string | null)[] {
      const words = shown().map(text);
      return list()
        .formatToParts(rest() > 0 ? [...words, MORE] : words)
        .map((part) => (part.value === MORE ? null : part.value));
    }
    return (
      <span class={cls().item} data-slot="overflow-list-text">
        {pieces().map((piece) => (piece === null ? more() : piece))}
      </span>
    );
  }

  return (
    <Show when={props.items.length > 0} fallback={props.empty}>
      <span class={arc(cls().root, props.class, props.className)} data-slot="overflow-list">
        <Show
          when={props.variant === "text"}
          fallback={
            <>
              <For each={shown}>
                {(item: T) => (
                  <span class={cls().item} data-slot="overflow-list-item">
                    {draw(item)}
                  </span>
                )}
              </For>
              <Show when={rest() > 0}>{more()}</Show>
            </>
          }
        >
          {sentence()}
        </Show>
      </span>
    </Show>
  );
}
