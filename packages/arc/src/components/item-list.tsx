import { type Child, Show, createMemo, flush, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { Key, Node } from "@barqjs/aria/collections";
import { DragButton, DropIndicator, dragAndDrop } from "@barqjs/aria/drag-and-drop";
import {
  GridList,
  GridListHeader,
  GridListItem,
  GridListLoadMoreItem,
  GridListSection,
} from "@barqjs/aria/gridlist";
import { dateFormatter } from "@barqjs/aria/i18n";
import { announce } from "@barqjs/aria/live";
import { Virtualizer, listLayout } from "@barqjs/aria/virtualizer";
import { ArrowDown } from "@barqjs/lucide/icons/arrow-down";
import { ArrowUp } from "@barqjs/lucide/icons/arrow-up";
import { GripVertical } from "@barqjs/lucide/icons/grip-vertical";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  type ItemMediaVariant,
  ItemTitle,
  type ItemSize,
  type ItemVariant,
} from "@barqjs/ui/item";
import { Button } from "@barqjs/ui/button";
import { Spinner } from "@barqjs/ui/spinner";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  control,
  edge,
  fg,
  focus,
  gap,
  glyph,
  interaction,
  layout,
  motion,
  place,
  rounded,
  space,
  surface,
  target,
  type,
} from "../style/index.ts";
import { IconButton } from "./icon-button.tsx";
import { useArcMessages } from "./messages.ts";

export const listStyles = variants({
  slots: {
    root: arc(layout.column, layout.minZero, focus.outline),
    row: arc(
      focus.inset,
      motion.colours,
      interaction.hover,
      interaction.selected,
      interaction.disabled,
      {
        outlineStyle: "none",
        "[data-selection-mode]:not([data-selection-mode=none])": { cursor: "pointer" },
      },
    ),
    item: arc({}),
    media: arc({}),
    content: arc(layout.minZero),
    title: arc(layout.minZero),
    description: arc({}),
    meta: arc(type.meta, type.numeric, layout.noShrink, layout.nowrap),
    actions: arc({}),
    loader: arc(layout.row, layout.centre, gap[2], type.meta, fg.muted),
    section: arc(layout.column),
    heading: arc(
      layout.sticky,
      surface.sunken,
      type.label,
      fg.muted,
      edge.bottom,
      place.paddedStrip,
      {
        top: "0px",
        zIndex: "1",
      },
    ),
    more: arc(layout.row, layout.centre, { paddingBlock: space.x3 }),
    sortable: arc(layout.row, gap[1], interaction.dragging),
    cell: arc(layout.grow, layout.minZero),
    drag: arc(
      control.bare,
      layout.inlineCentre,
      layout.noShrink,
      fg.muted,
      glyph.sm,
      target.size,
      interaction.draggable,
    ),
    move: arc(layout.row, layout.noShrink, gap[0.5]),
    indicator: arc(rounded.full, interaction.dropLine),
  },
  variants: {
    divided: {
      true: { row: arc(edge.bottom, { "&:last-child": { borderBlockEndWidth: "0" } }) },
      false: {},
    },
  },
  defaults: { divided: true },
});

type Slots = ReturnType<typeof listStyles>;

const LOADER = Symbol("loader");
const GROUP = Symbol("group");

interface Group<T> {
  [GROUP]: true;
  section: ListSection;
  children: T[];
}

type Row<T> = T | Group<T> | typeof LOADER;

function isGroup<T>(item: Row<T>): item is Group<T> {
  return typeof item === "object" && item !== null && GROUP in item;
}

/** The heading a row is listed under: a day, a month, a status. */
export interface ListSection {
  id: string;
  label: Child;
}

/** Where rows were put: beside another row. */
export interface ListDropTarget {
  key: Key;
  position: "before" | "after";
}

/** Rows moved by a drag, a drag button's keys or a move button. `reorderItems` applies it. */
export interface ListReorderEvent {
  keys: Key[];
  target: ListDropTarget;
}

export interface ListVirtual {
  rowHeight: number;
  height: string;
}

export interface ListProps<T> extends Customisable<Slots> {
  items: readonly T[];
  /** @default `item.id` */
  getKey?: (item: T) => Key;
  /** What type-ahead matches. @default `item.label ?? item.name ?? item.title` */
  getTextValue?: (item: T) => string;
  /** One row's content: a `<ListItem>`. */
  children: (item: T) => Child;
  /** Names the list. One of this and `aria-labelledby` is needed. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** @default "none" */
  selectionMode?: "none" | "single" | "multiple";
  /**
   * `replace` makes a press or an arrow key choose the row, so selection
   * follows focus; `toggle` adds and removes. @default "toggle"
   */
  selectionBehavior?: "toggle" | "replace";
  /** Never leave nothing selected: Escape and a press on the chosen row keep it. */
  disallowEmptySelection?: boolean;
  selectedKeys?: "all" | Iterable<Key>;
  defaultSelectedKeys?: "all" | Iterable<Key>;
  onSelectionChange?: (keys: "all" | Set<Key>) => void;
  disabledKeys?: Iterable<Key>;
  /** Enter, or a press on a row with no selection: open it. */
  onAction?: (key: Key) => void;
  /** A rule under each row. @default true */
  divided?: boolean;
  /** Draw only the rows on screen, each this many pixels tall, in a box `height` tall. */
  virtual?: ListVirtual;
  /**
   * The heading each row is listed under. Rows in a row under the same
   * heading are one section, named by it; the keyboard walks across sections
   * as one list and never stops on a heading. `useDateSections` groups by day
   * or month.
   */
  section?: (item: T) => ListSection;
  /** Asked for as the end comes into view, or with `loadMore="button"` when pressed. */
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  /** `button` asks for more with a Show more button under the list. @default "scroll" */
  loadMore?: "scroll" | "button";
  /** @default the provider's `showMore`, "Show more" */
  loadMoreLabel?: string;
  /** Shown when there are no items. */
  empty?: Child;
  /**
   * Rows reorder: a drag by pointer or touch from the row's handle, which
   * scrolls the list near its edges, or from the keyboard through the handle.
   * `reorderItems` applies the event to the items.
   */
  onReorder?: (event: ListReorderEvent) => void;
  /** With `onReorder`, buttons at each row's end that move it up and down. @default false */
  moveButtons?: boolean;
  /**
   * `tab` keeps every key typed into a control in a row for that control, and
   * only Tab goes on, which rows holding text fields want. @default "arrow"
   */
  keyboardNavigationBehavior?: "arrow" | "tab";
  id?: string;
}

interface MaybeKeyed {
  id?: Key;
}

interface TextFields {
  label?: unknown;
  name?: unknown;
  title?: unknown;
}

/**
 * Rows of things to scan, open and select: messages, files, people, runs.
 *
 * ```tsx
 * <List aria-label="Files" items={files()} selectionMode="multiple" onAction={open}>
 *   {(file) => (
 *     <ListItem
 *       title={file.name}
 *       description={file.path}
 *       media={<FileIcon />}
 *       meta={<Bytes value={file.size} />}
 *       actions={<IconButton label="Delete" onPress={() => remove(file.id)}><Trash2 /></IconButton>}
 *     />
 *   )}
 * </List>
 * ```
 *
 * On `@barqjs/aria`'s grid list: one Tab stop, the arrows moving between rows
 * and into a row's controls, type-ahead, selection with Space or a press, and
 * Enter for `onAction`. Each row is ui's `Item`. `virtual` draws only the rows
 * on screen through aria's virtualizer; `onLoadMore` asks for more as the end
 * comes into view and shows a loading row while `isLoadingMore`.
 */
export function List<T>(props: ListProps<T>) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(listStyles({ divided: props.divided !== false }), props.classes);
  }
  function keyOf(item: T): Key {
    return props.getKey?.(item) ?? ((item as MaybeKeyed).id as Key);
  }
  function textOf(item: T): string {
    const own = props.getTextValue?.(item);
    if (own !== undefined) return own;
    const record = item as TextFields;
    const text = record.label ?? record.name ?? record.title;
    return typeof text === "string" ? text : "";
  }
  function nameOf(item: T): string {
    return textOf(item) || String(keyOf(item));
  }
  function scrolls(): boolean {
    return props.onLoadMore !== undefined && props.loadMore !== "button";
  }
  const sections = createMemo((): Group<T>[] | undefined => {
    const sectionOf = props.section;
    if (sectionOf === undefined) return undefined;
    const groups: Group<T>[] = [];
    for (const item of props.items) {
      const section = sectionOf(item);
      const last = groups.at(-1);
      if (last !== undefined && last.section.id === section.id) last.children.push(item);
      else groups.push({ [GROUP]: true, section, children: [item] });
    }
    return groups;
  });
  function rows(): readonly Row<T>[] {
    const shown: readonly Row<T>[] = sections() ?? props.items;
    return scrolls() ? [...shown, LOADER] : shown;
  }

  const reorder = dragAndDrop<Row<T>>({
    getItems: (keys) =>
      [...keys].map((key) => {
        const item = props.items.find((one) => keyOf(one) === key);
        return { "text/plain": item === undefined ? String(key) : nameOf(item) };
      }),
    pointerDragSource: "handle",
    renderDropIndicator: (where) => (
      <DropIndicator target={where} class={cls().indicator} data-slot="list-drop-indicator" />
    ),
    onReorder: (event) => {
      if (event.target.dropPosition === "on") return;
      props.onReorder?.({
        keys: [...event.keys],
        target: {
          key: event.target.key,
          position: event.target.dropPosition === "after" ? "after" : "before",
        },
      });
    },
  });
  function sortable(): boolean {
    return props.onReorder !== undefined;
  }
  let root: HTMLElement | undefined;
  function move(item: T, by: -1 | 1): void {
    const items = untrack(() => props.items);
    const at = items.indexOf(item);
    const beside = items[at + by];
    if (beside === undefined) return;
    const key = keyOf(item);
    untrack(() => props.onReorder)?.({
      keys: [key],
      target: { key: keyOf(beside), position: by < 0 ? "before" : "after" },
    });
    announce(
      untrack(() => messages().rowMoved(nameOf(item), at + by + 1, items.length)),
      "polite",
    );
    flush();
    const shown = root?.querySelectorAll<HTMLElement>('[data-slot="list-row"]');
    const moved = [...(shown ?? [])].find((one) => one.getAttribute("data-key") === String(key));
    const order = by < 0 ? ["up", "down"] : ["down", "up"];
    const button = order
      .map((way) =>
        moved?.querySelector<HTMLElement>(`[data-slot="list-move-${way}"]:not([disabled])`),
      )
      .find((one) => one !== null && one !== undefined);
    (button ?? moved?.querySelector<HTMLElement>('[data-slot="list-drag"]'))?.focus();
  }
  function row(item: T) {
    function items(): readonly T[] {
      return props.items;
    }
    return (
      <Show when={sortable()} fallback={props.children(item)}>
        <div class={cls().sortable} data-slot="list-sortable">
          <DragButton class={cls().drag} data-slot="list-drag">
            <GripVertical aria-hidden="true" />
          </DragButton>
          <div class={cls().cell} data-slot="list-cell">
            {props.children(item)}
          </div>
          <Show when={props.moveButtons === true}>
            <div class={cls().move} data-slot="list-move">
              <IconButton
                label={messages().moveRowUpOf(nameOf(item))}
                size="sm"
                slot="list-move-up"
                isDisabled={items()[0] === item}
                onPress={() => move(item, -1)}
              >
                <ArrowUp />
              </IconButton>
              <IconButton
                label={messages().moveRowDownOf(nameOf(item))}
                size="sm"
                slot="list-move-down"
                isDisabled={items().at(-1) === item}
                onPress={() => move(item, 1)}
              >
                <ArrowDown />
              </IconButton>
            </div>
          </Show>
        </div>
      </Show>
    );
  }

  function list() {
    return (
      <GridList<Row<T>>
        class={arc(cls().root, props.class, props.className)}
        id={props.id}
        data-slot="list"
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"]}
        items={rows()}
        getKey={(item: Row<T>) => {
          if (item === LOADER) return "__loader";
          if (isGroup(item)) return `__section-${item.section.id}`;
          return keyOf(item);
        }}
        getChildren={(item: Row<T>) => (isGroup(item) ? item.children : undefined)}
        getTextValue={(item: Row<T>) => (item === LOADER || isGroup(item) ? "" : textOf(item))}
        getType={(item: Row<T>): Node<unknown>["type"] =>
          item === LOADER ? "loader" : isGroup(item) ? "section" : "item"
        }
        selectionMode={props.selectionMode}
        selectionBehavior={props.selectionBehavior ?? "toggle"}
        disallowEmptySelection={props.disallowEmptySelection === true}
        selectedKeys={props.selectedKeys}
        defaultSelectedKeys={props.defaultSelectedKeys}
        onSelectionChange={(keys: "all" | Set<Key>) => props.onSelectionChange?.(keys)}
        disabledKeys={props.disabledKeys}
        onAction={props.onAction === undefined ? undefined : (key: Key) => props.onAction?.(key)}
        style={
          props.virtual === undefined
            ? undefined
            : { height: props.virtual.height, overflow: "auto" }
        }
        renderEmptyState={() => props.empty}
        dragAndDropHooks={sortable() ? reorder.dragAndDropHooks : undefined}
        keyboardNavigationBehavior={props.keyboardNavigationBehavior}
        ref={(element: HTMLElement) => {
          root = element;
        }}
      >
        {(item: Row<T>) =>
          isGroup(item) ? (
            <GridListSection class={cls().section} data-slot="list-section">
              <GridListHeader class={cls().heading} data-slot="list-heading">
                {item.section.label}
              </GridListHeader>
            </GridListSection>
          ) : item === LOADER ? (
            <GridListLoadMoreItem
              class={cls().loader}
              data-slot="list-loader"
              isLoading={props.isLoadingMore}
              onLoadMore={() => props.onLoadMore?.()}
            >
              <Spinner />
              {messages().loadingMore}
            </GridListLoadMoreItem>
          ) : (
            <GridListItem
              class={cls().row}
              data-slot="list-row"
              data-selection-mode={props.selectionMode ?? "none"}
              data-key={String(keyOf(item))}
            >
              {row(item)}
            </GridListItem>
          )
        }
      </GridList>
    );
  }

  function more() {
    return (
      <Show when={props.onLoadMore !== undefined && props.loadMore === "button"}>
        <div class={cls().more} data-slot="list-more">
          <Button
            variant="outline"
            size="sm"
            isPending={props.isLoadingMore === true}
            onPress={() => props.onLoadMore?.()}
          >
            {props.loadMoreLabel ?? messages().showMore}
          </Button>
        </div>
      </Show>
    );
  }

  return (
    <>
      <Show when={props.virtual !== undefined} fallback={list()}>
        <Virtualizer layout={listLayout({ rowHeight: props.virtual?.rowHeight ?? 48 })}>
          {list()}
        </Virtualizer>
      </Show>
      {more()}
    </>
  );
}

export interface ListItemProps extends Customisable<Slots> {
  title: Child;
  description?: Child;
  /** At the start: an avatar, an icon, a thumbnail. */
  media?: Child;
  /** @default "icon" when `media` is given */
  mediaVariant?: ItemMediaVariant;
  /** At the end, quiet: a time, a size, a count. */
  meta?: Child;
  /** At the end: buttons that stay their own controls. */
  actions?: Child;
  /** @default "default" */
  variant?: ItemVariant;
  /** @default "sm" */
  size?: ItemSize;
}

/** One row of a `List`: ui's `Item` with its media, title, description, meta and actions. */
export function ListItem(props: ListItemProps) {
  function cls(): Slots {
    return parts(listStyles(), props.classes);
  }
  return (
    <Item
      class={arc(cls().item, props.class, props.className)}
      data-slot="list-item"
      variant={props.variant}
      size={props.size ?? "sm"}
    >
      <Show when={props.media !== undefined}>
        <ItemMedia
          class={cls().media}
          data-slot="list-item-media"
          variant={props.mediaVariant ?? "icon"}
        >
          {props.media}
        </ItemMedia>
      </Show>
      <ItemContent class={cls().content} data-slot="list-item-content">
        <ItemTitle class={cls().title} data-slot="list-item-title">
          {props.title}
        </ItemTitle>
        <Show when={props.description !== undefined}>
          <ItemDescription class={cls().description} data-slot="list-item-description">
            {props.description}
          </ItemDescription>
        </Show>
      </ItemContent>
      <Show when={props.meta !== undefined}>
        <span class={cls().meta} data-slot="list-item-meta">
          {props.meta}
        </span>
      </Show>
      <Show when={props.actions !== undefined}>
        <ItemActions class={cls().actions} data-slot="list-item-actions">
          {props.actions}
        </ItemActions>
      </Show>
    </Item>
  );
}

export interface DateSectionOptions {
  /** @default "day" */
  by?: "day" | "month";
  /** The zone whose calendar the days fall in. @default the reader's */
  timeZone?: string;
  /** What today is, so the server and the page agree. @default now */
  now?: Date | string | number;
}

const KEY_DAY: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };

/**
 * A `section` for a `List` that groups its rows by day or by month, in a
 * given zone: "Today", "Yesterday", "Monday 3 March", or "March 2026".
 *
 * ```tsx
 * const byDay = useDateSections({ timeZone: "Europe/Berlin" });
 * <List aria-label="Work due" items={work()} section={(item) => byDay(item.due)}>…</List>
 * ```
 */
export function useDateSections(
  options: DateSectionOptions = {},
): (value: Date | string | number) => ListSection {
  const messages = useArcMessages();
  const by = options.by ?? "day";
  const zone = options.timeZone;
  const keyFormat = new Intl.DateTimeFormat("en-CA", { ...KEY_DAY, timeZone: zone });
  const month = dateFormatter({ month: "long", year: "numeric", timeZone: zone });
  const day = dateFormatter({ weekday: "long", day: "numeric", month: "long", timeZone: zone });
  const dayWithYear = dateFormatter({
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: zone,
  });
  function keyOf(date: Date): string {
    const key = keyFormat.format(date);
    return by === "month" ? key.slice(0, 7) : key;
  }
  return (value) => {
    const date = new Date(value);
    const key = keyOf(date);
    if (by === "month") return { id: key, label: month().format(date) };
    const now = new Date(options.now ?? Date.now());
    const today = keyFormat.format(now);
    const yesterday = keyFormat.format(new Date(now.getTime() - 86_400_000));
    if (key === today) return { id: key, label: messages().today };
    if (key === yesterday) return { id: key, label: messages().yesterday };
    const sameYear = key.slice(0, 4) === today.slice(0, 4);
    return { id: key, label: (sameYear ? day() : dayWithYear()).format(date) };
  };
}

/**
 * The items in their order after a `ListReorderEvent`: the moved ones, in
 * the order they were, taken out and put back beside the target.
 *
 * ```tsx
 * <List items={steps()} onReorder={(event) => setSteps(reorderItems(steps(), event))}>…</List>
 * ```
 */
export function reorderItems<T>(
  items: readonly T[],
  event: ListReorderEvent,
  getKey: (item: T) => Key = (item) => (item as MaybeKeyed).id as Key,
): T[] {
  const moving = new Set(event.keys);
  const moved = items.filter((item) => moving.has(getKey(item)));
  const kept = items.filter((item) => !moving.has(getKey(item)));
  const beside = kept.findIndex((item) => getKey(item) === event.target.key);
  const at = beside < 0 ? kept.length : beside + (event.target.position === "after" ? 1 : 0);
  kept.splice(at, 0, ...moved);
  return kept;
}
