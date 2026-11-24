import {
  type Child,
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  untrack,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import { ListCollection, type Key, type Node } from "@barqjs/aria/collections";
import { dateFormatter, useLocale } from "@barqjs/aria/i18n";
import { announce } from "@barqjs/aria/live";
import { type LayoutInfo, listLayout, measureRow, virtualizer } from "@barqjs/aria/virtualizer";
import { ArrowDown } from "@barqjs/lucide/icons/arrow-down";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { Button } from "@barqjs/ui/button";
import { Spinner } from "@barqjs/ui/spinner";
import { tokens } from "@barqjs/ui/theme/tokens";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  edge,
  fg,
  focus,
  gap,
  layout,
  place,
  space,
  surface,
  type,
  zIndex,
} from "../style/index.ts";
import { EmptyState } from "../components/empty-state.tsx";
import { dayKey } from "../components/format.tsx";
import { useArcMessages } from "../components/messages.ts";
import { MessageItem } from "./message-item.tsx";
import { type ChatMessage, type MessageHandlers, time } from "./model.ts";

export const messageListStyles = variants({
  slots: {
    root: arc(layout.relative, layout.column, layout.minZeroBlock, place.fill),
    viewport: arc(layout.grow, layout.minZeroBlock, focus.outline, {
      overflowY: "auto",
      overscrollBehavior: "contain",
      // The list keeps the row being read in place itself, from its layout;
      // the browser's own anchoring would move it a second time.
      overflowAnchor: "none",
    }),
    // A short conversation sits at the bottom, where the next message arrives.
    stack: arc(layout.column, layout.end, { minBlockSize: "100%" }),
    rows: arc(layout.relative, layout.noShrink, { inlineSize: "100%" }),
    row: arc({ position: "absolute", insetInline: "0" }),
    separator: arc(layout.row, gap[3], type.meta, type.medium, {
      paddingBlock: space.x2,
      paddingInline: space.x3,
      "::before, ::after": {
        content: '""',
        flex: "1",
        borderBlockStart: `1px solid ${tokens.border}`,
      },
    }),
    unread: arc(layout.row, gap[2], type.caption, type.strong, fg.danger, {
      paddingInline: space.x3,
      paddingBlock: space.x1,
      "::after": {
        content: '""',
        flex: "1",
        borderBlockStart: `1px solid ${tokens.destructive}`,
      },
    }),
    loading: arc(layout.row, layout.centre, gap[2], type.meta, {
      position: "absolute",
      insetBlockStart: space.x2,
      insetInline: "0",
      zIndex: zIndex.sticky,
      pointerEvents: "none",
    }),
    start: arc(type.meta, layout.centre, { paddingBlock: space.x4 }),
    jump: arc(surface.elevated, edge.all, {
      position: "absolute",
      insetBlockEnd: space.x4,
      insetInlineEnd: space.x4,
      zIndex: zIndex.sticky,
    }),
  },
});

type Slots = ReturnType<typeof messageListStyles>;

/** What a list's caller can ask of it from outside. */
export interface MessageListApi {
  /** Go to the newest message and follow new ones again. */
  scrollToLatest: () => void;
  /** Bring a message into view and move focus to it. `false` when it is not in the list. */
  scrollToMessage: (id: string) => boolean;
}

export interface MessageListProps extends MessageHandlers, Customisable<Slots> {
  /** The conversation, oldest first. */
  messages: readonly ChatMessage[];
  /** Names the list. @default arc's "Messages" */
  "aria-label"?: string;
  /** The first message the reader has not seen: the New line sits above it and the list opens there. */
  unreadFrom?: string;
  /** Older messages remain to be loaded above. */
  hasOlder?: boolean;
  isLoadingOlder?: boolean;
  /** Asked as the top comes within a screen. */
  onLoadOlder?: () => void;
  /** Whether the newest message is in view, for marking the conversation read. */
  onAtLatestChange?: (atLatest: boolean) => void;
  /** A message within this long of its author's previous one joins its run. @default 5 minutes */
  groupWithin?: number;
  /** A row's height before it has been measured, in px. @default 64 */
  estimatedRowHeight?: number;
  /** @default "plain" */
  appearance?: "plain" | "bubble";
  /** One message, in place of `MessageItem`; spread `item` onto the article it draws. */
  renderMessage?: (message: ChatMessage, item: RenderedMessage) => Child;
  /** Shown when there are no messages and none older. */
  empty?: Child;
  /** Hands over the list's commands. */
  controller?: (api: MessageListApi) => void;
  id?: string;
}

/** What a list hands a `renderMessage`. */
export interface RenderedMessage {
  grouped: boolean;
  tabIndex: number;
  id: string;
  "aria-posinset": number;
  "aria-setsize": number;
}

interface DayRow {
  kind: "day";
  key: string;
  label: string;
}

interface MessageRow {
  kind: "message";
  key: string;
  message: ChatMessage;
  grouped: boolean;
  position: number;
}

type Row = DayRow | { kind: "unread"; key: string } | MessageRow;

const HANDLER_KEYS = [
  "currentUserId",
  "canModify",
  "renderBody",
  "onReact",
  "onReply",
  "onEdit",
  "onDelete",
  "onPin",
  "linkTo",
  "onOpenThread",
  "onRetry",
  "onDiscard",
  "emojiSource",
  "now",
  "timeZone",
] as const satisfies readonly (keyof MessageHandlers)[];

const FIVE_MINUTES = 5 * 60 * 1000;
/** How near the end still counts as at it, in px. */
const TOLERANCE = 8;

function node(row: Row): Node<Row> {
  return {
    type: "item",
    key: row.key,
    value: row,
    textValue: "",
    level: 0,
    index: 0,
    hasChildNodes: false,
    childNodes: [],
    props: {},
  };
}

/**
 * A conversation that opens at its newest message and stays there while new
 * ones arrive, draws only the rows on screen, and loads older ones above
 * without the row being read moving.
 *
 * ```tsx
 * <MessageList
 *   aria-label="#design"
 *   messages={messages()}
 *   unreadFrom={firstUnread()}
 *   hasOlder={cursor() !== null}
 *   isLoadingOlder={loading()}
 *   onLoadOlder={loadOlder}
 *   currentUserId={me.id}
 *   onReact={react}
 *   onReply={(message) => openThread(message.id)}
 * />
 * ```
 *
 * The rows are laid out by `@barqjs/aria`'s list layout and virtualizer and
 * measured as they render, so a row of any height is placed exactly. Whatever
 * the layout does, more rows above, a row growing as its image loads, the
 * window resizing, the list keeps its place: at the newest message if it was
 * there, and otherwise with the first row on screen where it was. Away from
 * the end, Jump to latest counts what has arrived since.
 *
 * Messages are a feed of articles grouped per author into runs, with a line
 * per day and a New line above the first unread. A message is one Tab stop:
 * the arrows and Page Up and Page Down move between messages, Home and End
 * go to the first loaded and the newest, Tab goes into a message's controls
 * and Escape comes back out. A new message from someone else is announced
 * politely; an older one loaded above, or one already there, is not.
 */
export function MessageList(props: MessageListProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const base = createUniqueId();
  const day = dateFormatter({ dateStyle: "full", timeZone: untrack(() => props.timeZone) });
  const cls = (): Slots => parts(messageListStyles(), props.classes);
  const viewport = makeRef<HTMLDivElement>();
  const layoutFor = listLayout({
    estimatedRowHeight: untrack(() => props.estimatedRowHeight) ?? 64,
  });
  const rowId = (key: Key): string => `${base}-${String(key)}`;

  const rows = createMemo((): Row[] => {
    const out: Row[] = [];
    const now = props.now === undefined ? new Date() : new Date(time(props.now));
    const today = dayKey(now, props.timeZone);
    const yesterday = dayKey(new Date(now.getTime() - 86_400_000), props.timeZone);
    const within = props.groupWithin ?? FIVE_MINUTES;
    let previous: ChatMessage | undefined;
    let previousDay = "";
    let position = 0;
    for (const message of props.messages) {
      const key = dayKey(message.createdAt, props.timeZone);
      let broken = false;
      if (key !== previousDay) {
        const label =
          key === today
            ? messages().today
            : key === yesterday
              ? messages().yesterday
              : day().format(new Date(time(message.createdAt)));
        out.push({ kind: "day", key: `day:${key}`, label });
        previousDay = key;
        broken = true;
      }
      if (message.id === props.unreadFrom) {
        out.push({ kind: "unread", key: "unread" });
        broken = true;
      }
      const grouped =
        !broken &&
        previous !== undefined &&
        previous.author.id === message.author.id &&
        (previous.state ?? "sent") === "sent" &&
        time(message.createdAt) - time(previous.createdAt) <= within;
      position += 1;
      out.push({ kind: "message", key: message.id, message, grouped, position });
      previous = message;
    }
    return out;
  });
  const collection = createMemo(() => new ListCollection<unknown>(rows().map(node)));
  const messageKeys = createMemo(() =>
    rows()
      .filter((row) => row.kind === "message")
      .map((row) => row.key),
  );

  // The message that holds the list's one Tab stop, and the one focus is on
  // its way to while its row is still being drawn.
  const [focused, setFocused] = createSignal<Key | null>(null, { ownedWrite: true });
  let pendingFocus: Key | null = null;
  const tabKey = (): Key | null => {
    const held = focused();
    if (held !== null && collection().getItem(held) !== null) return held;
    return messageKeys().at(-1) ?? null;
  };

  const virtual = virtualizer({
    layout: layoutFor,
    collection,
    ref: viewport,
    overscan: 1,
    persistedKeys: () => {
      const key = tabKey();
      return key === null ? [] : [key];
    },
  });
  const measuring = { shouldMeasure: () => true, measure: virtual.measure };
  const height = (): number => virtual.contentSize().height;
  const viewportHeight = createMemo(() => virtual.visibleRect().height);

  // Where the reader is, kept here rather than in signals: a scroll measures
  // and decides in the same tick, before a write would be published.
  let pinned = true;
  let anchor: { key: Key; offset: number } | null = null;
  let opened = false;
  let requested = false;
  const [atLatest, setAtLatest] = createSignal(true, { ownedWrite: true });
  const [unseen, setUnseen] = createSignal(0, { ownedWrite: true });

  const bottomOf = (element: HTMLElement): number => Math.max(0, height() - element.clientHeight);

  const publish = (next: boolean): void => {
    if (untrack(atLatest) === next) return;
    setAtLatest(next);
    if (next) setUnseen(0);
    props.onAtLatestChange?.(next);
  };

  /** The first row on screen and how far below the top it sits. */
  const capture = (element: HTMLElement): void => {
    const top = element.scrollTop;
    let found: LayoutInfo | null = null;
    for (const info of virtual.visible()) {
      if (info.rect.y + info.rect.height <= top) continue;
      if (found === null || info.rect.y < found.rect.y) found = info;
    }
    anchor = found === null ? null : { key: found.key, offset: found.rect.y - top };
  };

  const maybeLoadOlder = (element: HTMLElement): void => {
    if (props.hasOlder !== true || props.isLoadingOlder === true || requested) return;
    if (element.scrollTop > element.clientHeight) return;
    requested = true;
    props.onLoadOlder?.();
  };

  /** Put the list back where the reader was, after the layout moved under them. */
  const restore = (): void => {
    const element = viewport();
    if (element === null) return;
    if (!opened && rows().length > 0) {
      opened = true;
      const marker = layoutFor.getLayoutInfo("unread");
      if (marker !== null && marker.rect.y < bottomOf(element)) {
        pinned = false;
        anchor = { key: "unread", offset: 0 };
      }
    }
    if (pinned || anchor === null) {
      element.scrollTop = bottomOf(element);
    } else {
      const info = layoutFor.getLayoutInfo(anchor.key);
      if (info !== null) element.scrollTop = Math.max(0, info.rect.y - anchor.offset);
    }
    if (element.scrollTop >= bottomOf(element) - TOLERANCE) pinned = true;
    publish(pinned);
    maybeLoadOlder(element);
  };

  const onScroll = (): void => {
    const element = viewport();
    if (element === null) return;
    pinned = element.scrollTop >= bottomOf(element) - TOLERANCE;
    capture(element);
    publish(pinned);
    maybeLoadOlder(element);
  };

  if (!isServer) {
    createEffect(
      () => [height(), viewportHeight(), collection()] as const,
      () => restore(),
    );
  }

  // Older pages arriving let the list ask again; a new message at the end is
  // counted while the reader is away from it, and one from someone else is
  // announced.
  let first = untrack(() => props.messages[0]?.id);
  let last = untrack(() => props.messages.at(-1)?.id);
  createEffect(
    () => props.messages,
    (list) => {
      if (list[0]?.id !== first) requested = false;
      first = list[0]?.id;
      const from = last === undefined ? list.length : list.findIndex((one) => one.id === last) + 1;
      const added = from > 0 ? list.slice(from) : [];
      last = list.at(-1)?.id;
      if (added.length === 0) return;
      const others = added.filter((one) => one.author.id !== props.currentUserId);
      if (!pinned) setUnseen((count) => count + added.length);
      for (const one of others) {
        const text = one.body ?? messages().messageWithAttachments(one.attachments?.length ?? 0);
        announce(messages().newMessageFrom(one.author.name, text), "polite");
      }
    },
  );
  createEffect(
    () => props.isLoadingOlder === true,
    (loading) => {
      if (!loading) requested = false;
    },
  );

  // Focus follows a key press to its row once the row has been drawn.
  createEffect(
    () => [focused(), virtual.visible()] as const,
    ([key]) => {
      if (key === null || pendingFocus !== key) return;
      const element = document.getElementById(rowId(key));
      if (element === null) return;
      pendingFocus = null;
      element.focus();
    },
  );

  const reveal = (key: Key): void => {
    const element = viewport();
    const info = layoutFor.getLayoutInfo(key);
    if (element === null || info === null) return;
    const top = info.rect.y;
    const bottom = top + info.rect.height;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (bottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = bottom - element.clientHeight;
    }
    pinned = element.scrollTop >= bottomOf(element) - TOLERANCE;
    anchor = { key, offset: top - element.scrollTop };
    publish(pinned);
  };

  const focusMessage = (key: Key): void => {
    pendingFocus = key;
    setFocused(key);
    reveal(key);
    const element = document.getElementById(rowId(key));
    if (element !== null) {
      pendingFocus = null;
      element.focus();
    }
  };

  const scrollToLatest = (): void => {
    const element = viewport();
    pinned = true;
    anchor = null;
    if (element !== null) element.scrollTop = bottomOf(element);
    publish(true);
  };

  props.controller?.({
    scrollToLatest,
    scrollToMessage: (id) => {
      if (layoutFor.getLayoutInfo(id) === null) return false;
      focusMessage(id);
      return true;
    },
  });

  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement;
    const article = target.closest<HTMLElement>('[data-slot="message-list-row"]');
    const key = article?.dataset.key;
    if (key === undefined) return;
    if (event.key === "Escape" && target.dataset.slot !== "message-item") {
      if (event.defaultPrevented) return;
      event.preventDefault();
      focusMessage(key);
      return;
    }
    if (target.dataset.slot !== "message-item") return;
    const keys = messageKeys();
    const at = keys.indexOf(key);
    const page = Math.max(
      1,
      Math.floor((viewport()?.clientHeight ?? 0) / (props.estimatedRowHeight ?? 64)),
    );
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = at + 1;
        break;
      case "ArrowUp":
        next = at - 1;
        break;
      case "PageDown":
        next = at + page;
        break;
      case "PageUp":
        next = at - page;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = keys.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const clamped = Math.max(0, Math.min(keys.length - 1, next));
    const chosen = keys[clamped];
    if (chosen === undefined) return;
    if (event.key === "End") scrollToLatest();
    focusMessage(chosen);
  };

  onCleanup(() => {
    pendingFocus = null;
  });

  const label = (): string => props["aria-label"] ?? messages().messageList;
  const handlers: MessageHandlers = {};
  for (const name of HANDLER_KEYS) {
    Object.defineProperty(handlers, name, { enumerable: true, get: () => props[name] });
  }
  const placed = createMemo(
    () => new Map<Key, LayoutInfo>(virtual.visible().map((info) => [info.key, info])),
  );

  return (
    <section
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="message-list"
      aria-label={label()}
      lang={locale().locale}
    >
      <Show when={props.isLoadingOlder === true}>
        <div class={cls().loading} data-slot="message-list-loading" role="status">
          <Spinner />
          {messages().loadingOlder}
        </div>
      </Show>
      <div
        ref={viewport.set}
        class={cls().viewport}
        data-slot="message-list-viewport"
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        onFocusIn={(event: FocusEvent) => {
          const key = (event.target as HTMLElement).closest<HTMLElement>(
            '[data-slot="message-list-row"]',
          )?.dataset.key;
          if (key !== undefined && key !== untrack(focused)) setFocused(key);
        }}
      >
        <Show
          when={props.messages.length > 0 || props.hasOlder === true}
          fallback={props.empty ?? <EmptyState heading={messages().noMessages} />}
        >
          <div class={cls().stack} data-slot="message-list-stack">
            <Show when={props.hasOlder !== true}>
              <p class={cls().start} data-slot="message-list-start">
                {messages().conversationStart}
              </p>
            </Show>
            <div
              class={cls().rows}
              data-slot="message-list-rows"
              role="feed"
              aria-label={label()}
              aria-busy={props.isLoadingOlder === true ? "true" : "false"}
              style={{ height: `${String(height())}px` }}
            >
              <For each={() => virtual.visible().map((info) => info.key)}>
                {(key: Key) => {
                  const row = (): Row | undefined =>
                    collection().getItem(key)?.value as Row | undefined;
                  const element = makeRef<HTMLDivElement>();
                  measureRow(measuring, key, element);
                  return (
                    <div
                      ref={element.set}
                      class={cls().row}
                      data-slot="message-list-row"
                      data-key={String(key)}
                      data-kind={row()?.kind}
                      style={{ top: `${String(placed().get(key)?.rect.y ?? 0)}px` }}
                    >
                      <Switch>
                        <Match when={row()?.kind === "day"}>
                          <div
                            class={cls().separator}
                            data-slot="message-list-day"
                            aria-hidden="true"
                          >
                            {(row() as DayRow).label}
                          </div>
                        </Match>
                        <Match when={row()?.kind === "unread"}>
                          <div
                            class={cls().unread}
                            data-slot="message-list-unread"
                            aria-hidden="true"
                          >
                            {messages().newMessagesMarker}
                          </div>
                        </Match>
                        <Match when={row()?.kind === "message"}>
                          <MessageRow
                            row={row() as MessageRow}
                            handlers={handlers}
                            appearance={props.appearance}
                            renderMessage={props.renderMessage}
                            id={rowId(key)}
                            tabbable={tabKey() === key}
                            setSize={props.hasOlder === true ? -1 : messageKeys().length}
                          />
                        </Match>
                      </Switch>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>
      </div>
      <Show when={!atLatest()}>
        <Button
          class={cls().jump}
          data-slot="message-list-jump"
          variant="secondary"
          size="sm"
          onPress={scrollToLatest}
        >
          <ArrowDown aria-hidden="true" />
          {unseen() > 0 ? messages().newMessagesCount(unseen()) : messages().jumpToLatest}
        </Button>
      </Show>
    </section>
  );
}

function MessageRow(props: {
  row: MessageRow;
  handlers: MessageHandlers;
  appearance: "plain" | "bubble" | undefined;
  renderMessage: MessageListProps["renderMessage"];
  id: string;
  tabbable: boolean;
  setSize: number;
}) {
  const item = (): RenderedMessage => ({
    grouped: props.row.grouped,
    tabIndex: props.tabbable ? 0 : -1,
    id: props.id,
    "aria-posinset": props.row.position,
    "aria-setsize": props.setSize,
  });
  return (
    <Show
      when={props.renderMessage === undefined}
      fallback={props.renderMessage?.(props.row.message, item())}
    >
      <MessageItem
        {...props.handlers}
        message={props.row.message}
        grouped={props.row.grouped}
        appearance={props.appearance}
        id={props.id}
        tabIndex={item().tabIndex}
        aria-posinset={props.row.position}
        aria-setsize={props.setSize}
      />
    </Show>
  );
}
