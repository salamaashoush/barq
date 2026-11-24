import { type Child, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { Key, Node } from "@barqjs/aria/collections";
import { GridList, GridListItem, GridListLoadMoreItem } from "@barqjs/aria/gridlist";
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
import { Spinner } from "@barqjs/ui/spinner";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { edge, fg, focus, gap, interaction, layout, motion, type } from "../style/index.ts";
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
  virtual?: { rowHeight: number; height: string };
  /** Asked for as the end comes into view. */
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  /** Shown when there are no items. */
  empty?: Child;
  id?: string;
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
  const cls = (): Slots => parts(listStyles({ divided: props.divided !== false }), props.classes);
  const keyOf = (item: T): Key => props.getKey?.(item) ?? ((item as { id?: Key }).id as Key);
  const rows = (): readonly (T | typeof LOADER)[] =>
    props.onLoadMore === undefined ? props.items : [...props.items, LOADER];

  const list = () => (
    <GridList<T | typeof LOADER>
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="list"
      aria-label={props["aria-label"]}
      items={rows()}
      getKey={(item: T | typeof LOADER) => (item === LOADER ? "__loader" : keyOf(item))}
      getTextValue={(item: T | typeof LOADER) => {
        if (item === LOADER) return "";
        const own = props.getTextValue?.(item);
        if (own !== undefined) return own;
        const record = item as { label?: unknown; name?: unknown; title?: unknown };
        const text = record.label ?? record.name ?? record.title;
        return typeof text === "string" ? text : "";
      }}
      getType={(item: T | typeof LOADER): Node<unknown>["type"] =>
        item === LOADER ? "loader" : "item"
      }
      selectionMode={props.selectionMode}
      selectedKeys={props.selectedKeys}
      defaultSelectedKeys={props.defaultSelectedKeys}
      onSelectionChange={(keys: "all" | Set<Key>) => props.onSelectionChange?.(keys)}
      disabledKeys={props.disabledKeys}
      onAction={props.onAction === undefined ? undefined : (key: Key) => props.onAction?.(key)}
      style={
        props.virtual === undefined ? undefined : { height: props.virtual.height, overflow: "auto" }
      }
      renderEmptyState={() => props.empty}
    >
      {(item: T | typeof LOADER) =>
        item === LOADER ? (
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

  return (
    <Show when={props.virtual !== undefined} fallback={list()}>
      <Virtualizer layout={listLayout({ rowHeight: props.virtual?.rowHeight ?? 48 })}>
        {list()}
      </Virtualizer>
    </Show>
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
  const cls = (): Slots => parts(listStyles(), props.classes);
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
