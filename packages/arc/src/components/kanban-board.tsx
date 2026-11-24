import { type Child, For, Show, createSignal, createUniqueId, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { Key } from "@barqjs/aria/collections";
import { isTextDropItem } from "@barqjs/aria/dnd";
import { DragButton, DropIndicator, dragAndDrop } from "@barqjs/aria/drag-and-drop";
import { GridList, GridListItem } from "@barqjs/aria/gridlist";
import { numberFormatter } from "@barqjs/aria/i18n";
import { Virtualizer, listLayout } from "@barqjs/aria/virtualizer";
import { ChevronsLeftRight } from "@barqjs/lucide/icons/chevrons-left-right";
import { ChevronsRightLeft } from "@barqjs/lucide/icons/chevrons-right-left";
import { GripVertical } from "@barqjs/lucide/icons/grip-vertical";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Button } from "@barqjs/ui/button";
import { tokens } from "@barqjs/ui/theme/tokens";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  control,
  fg,
  focus,
  gap,
  glyph,
  interaction,
  layout,
  plainList,
  rounded,
  space,
  surface,
  target,
  tone,
  type,
} from "../style/index.ts";
import { IconButton } from "./icon-button.tsx";
import { useArcMessages } from "./messages.ts";

export interface KanbanColumn<T> {
  id: string;
  title: string;
  items: readonly T[];
  /** How many cards it should hold at most: its count turns to a warning past it. */
  limit?: number;
}

export interface KanbanMoveTarget {
  key: Key;
  position: "before" | "after";
}

/** Where cards went: the column they left, the one they joined, and beside which card. */
export interface KanbanMoveEvent {
  keys: Key[];
  from: string;
  to: string;
  /** The card they were put beside, or `null` for the end of the column. */
  target: KanbanMoveTarget | null;
}

export const kanbanBoardStyles = variants({
  slots: {
    // Relative, so the words hidden for a screen reader in a column scroll
    // with it rather than widening the page beside a board that overflows.
    root: arc(layout.row, layout.relative, gap[3], focus.outline, {
      alignItems: "flex-start",
      overflowX: "auto",
      scrollSnapType: "x mandatory",
      paddingBlockEnd: space.x2,
    }),
    column: arc(layout.column, layout.noShrink, rounded.lg, bg.muted, gap[2], {
      width: "min(18rem, 85vw)",
      maxHeight: "100%",
      scrollSnapAlign: "start",
      padding: space.x2,
    }),
    header: arc(layout.row, gap[2], { paddingInline: space.x1 }),
    title: arc(type.label, layout.flush, layout.grow, layout.minZero, layout.clip, layout.nowrap),
    count: arc(type.caption, type.numeric, fg.muted, rounded.full, { paddingInline: space.x1_5 }),
    list: arc(plainList, layout.column, gap[2], focus.outline, rounded.md, {
      minHeight: space.x16,
      overflowY: "auto",
      "[data-drop-target]": { outline: `2px dashed ${tokens.ring}` },
    }),
    card: arc(surface.card, layout.row, gap[1], focus.inset, interaction.dragging, {
      alignItems: "flex-start",
      padding: space.x1,
      outlineStyle: "none",
    }),
    content: arc(layout.grow, layout.minZero),
    drag: arc(control.bare, layout.inlineCentre, layout.noShrink, fg.muted, glyph.sm, target.size, {
      cursor: "grab",
    }),
    indicator: arc(rounded.full, {
      height: "2px",
      "[data-drop-target]": { backgroundColor: tokens.ring },
    }),
    empty: arc(type.meta, layout.centre, { minHeight: space.x12 }),
    add: arc({ justifyContent: "flex-start" }),
  },
  variants: {
    over: { true: { count: arc(tone.warning, bg.tone, fg.tone) }, false: {} },
    collapsed: {
      true: {
        column: arc({ width: "auto" }),
        title: arc({ writingMode: "vertical-rl" }),
        header: arc(layout.column),
      },
      false: {},
    },
  },
  defaults: { over: false, collapsed: false },
});

type Slots = ReturnType<typeof kanbanBoardStyles>;

export interface KanbanVirtual {
  cardHeight: number;
  height: string;
}

export interface KanbanBoardProps<T> extends Customisable<Slots> {
  columns: readonly KanbanColumn<T>[];
  /** Names the board. */
  "aria-label": string;
  /** A card's content: a `ListItem`, usually. */
  children: (item: T) => Child;
  /** @default `item.id` */
  getKey?: (item: T) => Key;
  /** What type-ahead and the drag announcements read. @default `item.title ?? item.name` */
  getTextValue?: (item: T) => string;
  /** Cards dropped in a column or moved within one. `applyKanbanMove` applies it to the columns. */
  onMove?: (event: KanbanMoveEvent) => void;
  /** Adds an Add card button to the foot of each column. */
  onAddCard?: (column: string) => void;
  /** Opening a card: Enter, or a press. */
  onAction?: (key: Key) => void;
  /** Refuse a drop into a column already at its `limit`. @default false */
  strictLimits?: boolean;
  collapsed?: readonly string[];
  defaultCollapsed?: readonly string[];
  onCollapsedChange?: (collapsed: string[]) => void;
  /** Draw only the cards on screen, each about this many pixels tall, in columns `height` tall. */
  virtual?: KanbanVirtual;
}

/**
 * Columns of cards that move between them: tasks by status, leads by stage.
 *
 * ```tsx
 * <KanbanBoard
 *   aria-label="Tasks"
 *   columns={columns()}
 *   onMove={(event) => setColumns(applyKanbanMove(columns(), event))}
 *   onAddCard={(column) => create(column)}
 * >
 *   {(task) => <ListItem title={task.title} meta={<AvatarStack people={task.people} size="sm" />} />}
 * </KanbanBoard>
 * ```
 *
 * Each column is `@barqjs/aria`'s grid list with its drag and drop: a card
 * drags by pointer or touch, or from its drag button by keyboard (Enter picks
 * it up, Tab and the arrows choose where, Enter drops), within its column or
 * into another, announced as it goes. A column counts its cards against its
 * `limit` and turns to a warning past it, folds to a strip, and takes new
 * cards. The columns scroll sideways, snapping one at a time on a phone.
 */
export function KanbanBoard<T>(props: KanbanBoardProps<T>) {
  function cls(): Slots {
    return parts(kanbanBoardStyles(), props.classes);
  }
  const kind = `application/x-arc-kanban-${createUniqueId()}`;
  const [ownCollapsed, setOwnCollapsed] = createSignal<readonly string[]>(
    untrack(() => props.defaultCollapsed) ?? [],
  );
  function collapsed(): readonly string[] {
    return props.collapsed ?? ownCollapsed();
  }
  function fold(id: string): void {
    const next = collapsed().includes(id)
      ? collapsed().filter((one) => one !== id)
      : [...collapsed(), id];
    if (props.collapsed === undefined) setOwnCollapsed(next);
    props.onCollapsedChange?.(next);
  }
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      data-slot="kanban-board"
      role="region"
      aria-label={props["aria-label"]}
    >
      <For each={props.columns}>
        {(column: KanbanColumn<T>) => (
          <Column
            board={props}
            column={column}
            kind={kind}
            collapsed={collapsed().includes(column.id)}
            onFold={() => fold(column.id)}
          />
        )}
      </For>
    </div>
  );
}

interface ColumnProps<T> {
  board: KanbanBoardProps<T>;
  column: KanbanColumn<T>;
  kind: string;
  collapsed: boolean;
  onFold: () => void;
}

interface MaybeKeyed {
  id?: Key;
}

interface TextFields {
  title?: unknown;
  name?: unknown;
  label?: unknown;
}

interface DropBeside {
  key: Key;
  dropPosition: string;
}

interface DraggedCards {
  keys: Key[];
  from: string;
}

interface TextDragItem {
  getText: (type: string) => Promise<string>;
}

interface DraggedCard {
  key: Key;
  from: string;
}

function Column<T>(props: ColumnProps<T>) {
  const messages = useArcMessages();
  const format = numberFormatter();
  const headingId = createUniqueId();
  function count(): number {
    return props.column.items.length;
  }
  function over(): boolean {
    return props.column.limit !== undefined && count() > props.column.limit;
  }
  function full(): boolean {
    return props.column.limit !== undefined && count() >= props.column.limit;
  }
  function cls(): Slots {
    return parts(
      kanbanBoardStyles({ over: over(), collapsed: props.collapsed }),
      props.board.classes,
    );
  }
  function keyOf(item: T): Key {
    return props.board.getKey?.(item) ?? ((item as MaybeKeyed).id as Key);
  }
  function textOf(item: T): string {
    const own = props.board.getTextValue?.(item);
    if (own !== undefined) return own;
    const record = item as TextFields;
    const text = record.title ?? record.name ?? record.label;
    return typeof text === "string" ? text : String(keyOf(item));
  }
  function id(): string {
    return props.column.id;
  }
  function move(event: KanbanMoveEvent): void {
    props.board.onMove?.(event);
  }
  function placed(beside: DropBeside): KanbanMoveEvent["target"] {
    return {
      key: beside.key,
      position: beside.dropPosition === "after" ? "after" : "before",
    };
  }
  async function read(items: readonly unknown[]): Promise<DraggedCards> {
    const keys: Key[] = [];
    let from = "";
    for (const item of items) {
      if (!isTextDropItem(item as never)) continue;
      const raw = await (item as TextDragItem).getText(props.kind);
      const parsed = JSON.parse(raw) as DraggedCard;
      keys.push(parsed.key);
      from = parsed.from;
    }
    return { keys, from };
  }

  const { dragAndDropHooks } = dragAndDrop<T>({
    getItems: (keys) =>
      [...keys].map((key) => {
        const item = props.column.items.find((one) => keyOf(one) === key);
        return {
          [props.kind]: JSON.stringify({ key, from: id() }),
          "text/plain": item === undefined ? String(key) : textOf(item),
        };
      }),
    acceptedDragTypes: [props.kind],
    shouldAcceptItemDrop: () => false,
    getDropOperation: () => (props.board.strictLimits === true && full() ? "cancel" : "move"),
    renderDropIndicator: (where) => (
      <DropIndicator target={where} class={cls().indicator} data-slot="kanban-drop-indicator" />
    ),
    onReorder: (event) => {
      if (event.target.dropPosition === "on") return;
      move({ keys: [...event.keys], from: id(), to: id(), target: placed(event.target) });
    },
    onInsert: async (event) => {
      if (event.target.dropPosition === "on") return;
      const { keys, from } = await read(event.items);
      move({ keys, from, to: id(), target: placed(event.target) });
    },
    onRootDrop: async (event) => {
      const { keys, from } = await read(event.items);
      move({ keys, from, to: id(), target: null });
    },
  });

  function counted(): string {
    return props.column.limit === undefined
      ? format().format(count())
      : `${format().format(count())} / ${format().format(props.column.limit)}`;
  }

  function list() {
    return (
      <GridList<T>
        class={cls().list}
        data-slot="kanban-list"
        aria-labelledby={headingId}
        items={props.column.items}
        getKey={keyOf}
        getTextValue={textOf}
        dragAndDropHooks={dragAndDropHooks}
        onAction={
          props.board.onAction === undefined ? undefined : (key: Key) => props.board.onAction?.(key)
        }
        style={
          props.board.virtual === undefined
            ? undefined
            : { height: props.board.virtual.height, overflow: "auto" }
        }
        renderEmptyState={(_state: unknown) => (
          <div class={cls().empty} data-slot="kanban-empty">
            {messages().noCards}
          </div>
        )}
      >
        {(item: T) => (
          <GridListItem class={cls().card} data-slot="kanban-card">
            <DragButton class={cls().drag} data-slot="kanban-drag">
              <GripVertical aria-hidden="true" />
            </DragButton>
            <div class={cls().content} data-slot="kanban-card-content">
              {props.board.children(item)}
            </div>
          </GridListItem>
        )}
      </GridList>
    );
  }

  return (
    <section
      class={cls().column}
      data-slot="kanban-column"
      data-column={id()}
      data-collapsed={props.collapsed ? "" : undefined}
      data-over={over() ? "" : undefined}
      aria-labelledby={headingId}
    >
      <div class={cls().header} data-slot="kanban-column-header">
        <h3 id={headingId} class={cls().title} data-slot="kanban-column-title">
          {props.column.title}
        </h3>
        <span class={cls().count} data-slot="kanban-column-count" aria-hidden="true">
          {counted()}
        </span>
        <span class={srOnly}>
          {props.column.limit === undefined
            ? messages().cardCount(count())
            : messages().cardCountOfLimit(count(), props.column.limit)}
          {over() ? `, ${messages().overLimit}` : ""}
        </span>
        <IconButton
          label={
            props.collapsed
              ? messages().expandColumn(props.column.title)
              : messages().collapseColumn(props.column.title)
          }
          variant="ghost"
          size="sm"
          tooltip={false}
          aria-expanded={!props.collapsed}
          onPress={() => props.onFold()}
        >
          {props.collapsed ? (
            <ChevronsLeftRight aria-hidden="true" />
          ) : (
            <ChevronsRightLeft aria-hidden="true" />
          )}
        </IconButton>
      </div>
      <Show when={!props.collapsed}>
        <Show when={props.board.virtual !== undefined} fallback={list()}>
          <Virtualizer layout={listLayout({ rowHeight: props.board.virtual?.cardHeight ?? 64 })}>
            {list()}
          </Virtualizer>
        </Show>
        <Show when={props.board.onAddCard !== undefined}>
          <Button
            variant="ghost"
            size="sm"
            class={cls().add}
            data-slot="kanban-add"
            onPress={() => props.board.onAddCard?.(id())}
          >
            <Plus aria-hidden="true" />
            {messages().addCard}
            <span class={srOnly}>{messages().toColumn(props.column.title)}</span>
          </Button>
        </Show>
      </Show>
    </section>
  );
}

interface Keyed {
  id: Key;
}

/**
 * The columns after a `KanbanMoveEvent`: the cards taken out of the column
 * they left and put into the one they joined, beside the target or at its end.
 */
export function applyKanbanMove<T>(
  columns: readonly KanbanColumn<T>[],
  event: KanbanMoveEvent,
  getKey: (item: T) => Key = (item) => (item as Keyed).id,
): KanbanColumn<T>[] {
  const moving = new Set(event.keys);
  const taken: T[] = [];
  const left = columns.map((column) => {
    if (column.id !== event.from && column.id !== event.to) return column;
    const kept: T[] = [];
    for (const item of column.items) {
      if (moving.has(getKey(item))) taken.push(item);
      else kept.push(item);
    }
    return { ...column, items: kept };
  });
  const order = event.keys.map((key) => taken.find((item) => getKey(item) === key));
  const cards = order.filter((item): item is T => item !== undefined);
  return left.map((column) => {
    if (column.id !== event.to) return column;
    const items = [...column.items];
    const at =
      event.target === null
        ? items.length
        : items.findIndex((item) => getKey(item) === event.target?.key) +
          (event.target.position === "after" ? 1 : 0);
    items.splice(at < 0 ? items.length : at, 0, ...cards);
    return { ...column, items };
  });
}
