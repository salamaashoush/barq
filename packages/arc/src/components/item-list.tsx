import { type Child, Show, createMemo } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { Key, Node } from "@barqjs/aria/collections";
import {
  GridList,
  GridListHeader,
  GridListItem,
  GridListLoadMoreItem,
  GridListSection,
} from "@barqjs/aria/gridlist";
import { dateFormatter } from "@barqjs/aria/i18n";
import { Virtualizer, listLayout } from "@barqjs/aria/virtualizer";
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
  edge,
  fg,
  focus,
  gap,
  interaction,
  layout,
  motion,
  place,
  space,
  surface,
  type,
} from "../style/index.ts";
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
  /** Names the list. */
  "aria-label": string;
  /** @default "none" */
  selectionMode?: "none" | "single" | "multiple";
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

  function list() {
    return (
      <GridList<Row<T>>
        class={arc(cls().root, props.class, props.className)}
        id={props.id}
        data-slot="list"
        aria-label={props["aria-label"]}
        items={rows()}
        getKey={(item: Row<T>) => {
          if (item === LOADER) return "__loader";
          if (isGroup(item)) return `__section-${item.section.id}`;
          return keyOf(item);
        }}
        getChildren={(item: Row<T>) => (isGroup(item) ? item.children : undefined)}
        getTextValue={(item: Row<T>) => {
          if (item === LOADER || isGroup(item)) return "";
          const own = props.getTextValue?.(item);
          if (own !== undefined) return own;
          const record = item as TextFields;
          const text = record.label ?? record.name ?? record.title;
          return typeof text === "string" ? text : "";
        }}
        getType={(item: Row<T>): Node<unknown>["type"] =>
          item === LOADER ? "loader" : isGroup(item) ? "section" : "item"
        }
        selectionMode={props.selectionMode}
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
            >
              {props.children(item)}
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
