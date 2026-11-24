import { type Child, For, Show, createSignal, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { dateFormatter, useLocale } from "@barqjs/aria/i18n";
import { Bell } from "@barqjs/lucide/icons/bell";
import { Check } from "@barqjs/lucide/icons/check";
import { Circle } from "@barqjs/lucide/icons/circle";
import { eventSource } from "@barqjs/primitives/event-source";
import { websocket } from "@barqjs/primitives/websocket";
import { Button } from "@barqjs/ui/button";
import { Skeleton } from "@barqjs/ui/skeleton";
import { srOnly } from "@barqjs/ui/sr-only";
import { ToggleGroup, ToggleGroupItem } from "@barqjs/ui/toggle-group";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  edge,
  fg,
  focus,
  gap,
  glyph,
  interaction,
  layout,
  place,
  plainList,
  rounded,
  space,
  square,
  target,
  tone as tones,
  type,
} from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import type { NavIcon } from "./app-shell.tsx";
import type { Person } from "./avatar-stack.tsx";
import { EmptyState } from "./empty-state.tsx";
import { type Moment, RelativeTime } from "./format.tsx";
import { IconButton } from "./icon-button.tsx";
import { Indicator } from "./indicator.tsx";
import { useArcMessages } from "./messages.ts";
import { PersonAvatar } from "./person-avatar.tsx";
import { ResponsiveOverlay } from "./responsive-overlay.tsx";

/** Something to do about a notification from where it is listed: Accept, Join, Retry. */
export interface NotificationAction {
  id: string;
  label: string;
  tone?: "danger";
  onAction: (item: NotificationItem) => void;
}

export interface NotificationItem {
  id: string;
  /** What happened: "Alex mentioned you". */
  title: string;
  /** A line of what was said or changed. */
  body?: string;
  /** Who did it, drawn as their avatar. */
  actor?: Person;
  /** Drawn where there is no actor. */
  icon?: NavIcon;
  tone?: Tone;
  /** Where it happened: "in Design review", "Invoice 42". */
  source?: string;
  createdAt: Moment;
  read?: boolean;
  /** Where opening it goes. */
  href?: string;
  /** Groups it under this heading instead of its day. */
  group?: string;
  actions?: readonly NotificationAction[];
}

export const notificationsStyles = variants({
  slots: {
    root: arc(layout.column, gap[3], layout.minZero),
    header: arc(layout.row, layout.wrap, gap[2], layout.between),
    groups: arc(plainList, layout.column, gap[4]),
    group: arc(layout.column, gap[1]),
    heading: arc(type.meta, type.medium, layout.flush, { paddingInline: space.x2 }),
    list: arc(plainList, layout.column),
    item: arc(layout.relative, layout.row, gap[3], rounded.md, interaction.hover, {
      alignItems: "flex-start",
      padding: space.x2,
    }),
    media: arc(
      layout.noShrink,
      layout.inlineCentre,
      square.x8,
      rounded.full,
      bg.tone,
      fg.tone,
      glyph.md,
    ),
    main: arc(layout.column, gap[0.5], layout.minZero, layout.grow),
    title: arc(type.label, layout.clamp2),
    link: arc(type.navLink, fg.inherit, focus.visible, rounded.xs, place.afterLayer, {
      "::after": { inset: "0" },
    }),
    body: arc(type.meta, layout.clamp2),
    meta: arc(layout.row, layout.wrap, gap[1.5], type.caption, fg.muted, type.numeric),
    actions: arc(layout.row, layout.wrap, gap[1.5], layout.relative, { zIndex: "1" }),
    toggle: arc(layout.relative, layout.noShrink, { zIndex: "1" }),
    unread: arc(layout.noShrink, { marginBlockStart: space.x1_5 }),
    footer: arc(layout.row, layout.wrap, gap[2], layout.between, edge.top, {
      paddingBlockStart: space.x2,
    }),
    more: arc(layout.centre),
    skeleton: arc({ height: space.x12 }),
    bell: arc(target.size),
  },
  variants: {
    read: { true: {}, false: { title: type.strong } },
  },
  defaults: { read: true },
});

type Slots = ReturnType<typeof notificationsStyles>;

export type NotificationFilter = "all" | "unread";

export interface NotificationFeedProps extends Customisable<Slots> {
  items: readonly NotificationItem[];
  /** Names the feed. @default arc's "Notifications" */
  "aria-label"?: string;
  /** How the items are grouped under headings: by their day, their `source`, or not at all. @default "day" */
  groupBy?: "day" | "source" | "none";
  /** The moment "today" is measured from on the server and while hydrating. */
  now?: Moment;
  /** The zone a day is read in. @default the reader's */
  timeZone?: string;
  filter?: NotificationFilter;
  /** @default "all" */
  defaultFilter?: NotificationFilter;
  onFilterChange?: (filter: NotificationFilter) => void;
  /** Mark some read, or unread again. */
  onMarkRead?: (ids: string[], read: boolean) => void;
  onMarkAllRead?: () => void;
  /** Opening one: it is marked read first. */
  onOpen?: (item: NotificationItem) => void;
  isLoading?: boolean;
  /** Adds Load more at the end. */
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  empty?: Child;
}

interface Group {
  key: string;
  label: string;
  items: NotificationItem[];
}

function dayKey(moment: Moment, zone: string | undefined): string {
  const date = moment instanceof Date ? moment : new Date(moment);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * The notifications themselves, as a page or inside `NotificationCenter`:
 * grouped by day or by source, each with its actor, what happened, where and
 * when, read and unread, its own actions, and Mark all as read.
 */
export function NotificationFeed(props: NotificationFeedProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const day = dateFormatter({ dateStyle: "medium", timeZone: untrack(() => props.timeZone) });
  const cls = (): Slots => parts(notificationsStyles(), props.classes);
  const [ownFilter, setOwnFilter] = createSignal<NotificationFilter>(
    untrack(() => props.defaultFilter) ?? "all",
  );
  const filter = (): NotificationFilter => props.filter ?? ownFilter();
  const unread = (): number => props.items.filter((item) => item.read !== true).length;
  const shown = (): NotificationItem[] =>
    props.items.filter((item) => filter() === "all" || item.read !== true);

  const groups = (): Group[] => {
    const by = props.groupBy ?? "day";
    const now = props.now === undefined ? new Date() : new Date(props.now);
    const today = dayKey(now, props.timeZone);
    const yesterday = dayKey(new Date(now.getTime() - 86_400_000), props.timeZone);
    const out = new Map<string, Group>();
    for (const item of shown()) {
      let key = "";
      let label = "";
      if (item.group !== undefined) {
        key = `group:${item.group}`;
        label = item.group;
      } else if (by === "source") {
        key = `source:${item.source ?? ""}`;
        label = item.source ?? messages().other;
      } else if (by === "day") {
        key = dayKey(item.createdAt, props.timeZone);
        label =
          key === today
            ? messages().today
            : key === yesterday
              ? messages().yesterday
              : day().format(new Date(item.createdAt));
      }
      const held = out.get(key) ?? { key, label, items: [] };
      held.items.push(item);
      out.set(key, held);
    }
    return [...out.values()];
  };

  const choose = (next: NotificationFilter): void => {
    if (props.filter === undefined) setOwnFilter(next);
    props.onFilterChange?.(next);
  };

  const open = (item: NotificationItem): void => {
    if (item.read !== true) props.onMarkRead?.([item.id], true);
    props.onOpen?.(item);
  };

  return (
    <section
      class={arc(cls().root, props.class, props.className)}
      data-slot="notification-feed"
      aria-label={props["aria-label"] ?? messages().notifications}
      aria-busy={props.isLoading === true ? "true" : undefined}
      lang={locale().locale}
    >
      <div class={cls().header} data-slot="notification-feed-header">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label={messages().filters}
          value={filter()}
          onValueChange={(value: string | string[]) => {
            if (value === "all" || value === "unread") choose(value);
          }}
        >
          <ToggleGroupItem value="all">{messages().allNotifications}</ToggleGroupItem>
          <ToggleGroupItem value="unread">
            {`${messages().unreadNotifications} ${String(unread())}`}
          </ToggleGroupItem>
        </ToggleGroup>
        <Show when={props.onMarkAllRead !== undefined}>
          <Button
            variant="ghost"
            size="sm"
            data-slot="notification-feed-mark-all"
            isDisabled={unread() === 0}
            onPress={() => props.onMarkAllRead?.()}
          >
            <Check aria-hidden="true" />
            {messages().markAllRead}
          </Button>
        </Show>
      </div>
      <Show
        when={props.isLoading !== true}
        fallback={
          <ul class={cls().list} aria-label={messages().loadingMore}>
            <For each={[0, 1, 2]}>
              {() => (
                <li>
                  <Skeleton class={cls().skeleton} />
                </li>
              )}
            </For>
          </ul>
        }
      >
        <Show
          when={shown().length > 0}
          fallback={
            props.empty ?? (
              <EmptyState
                icon={<Bell />}
                heading={
                  filter() === "unread" ? messages().allCaughtUp : messages().noNotifications
                }
              />
            )
          }
        >
          <ul class={cls().groups} data-slot="notification-feed-groups">
            <For each={groups()}>
              {(group: Group) => (
                <li class={cls().group} data-slot="notification-feed-group">
                  <Show when={group.label !== ""}>
                    <h3 class={cls().heading} data-slot="notification-feed-heading">
                      {group.label}
                    </h3>
                  </Show>
                  <ul class={cls().list} aria-label={group.label === "" ? undefined : group.label}>
                    <For each={group.items}>
                      {(item: NotificationItem) => (
                        <Notification
                          item={item}
                          classes={props.classes}
                          now={props.now}
                          canMark={props.onMarkRead !== undefined}
                          onOpen={() => open(item)}
                          onMark={(read) => props.onMarkRead?.([item.id], read)}
                        />
                      )}
                    </For>
                  </ul>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={props.onLoadMore !== undefined}>
          <div class={cls().more}>
            <Button
              variant="outline"
              size="sm"
              isPending={props.isLoadingMore}
              onPress={() => props.onLoadMore?.()}
            >
              {messages().loadMore}
            </Button>
          </div>
        </Show>
      </Show>
    </section>
  );
}

function Notification(props: {
  item: NotificationItem;
  classes: Partial<Slots> | undefined;
  now: Moment | undefined;
  canMark: boolean;
  onOpen: () => void;
  onMark: (read: boolean) => void;
}) {
  const messages = useArcMessages();
  const item = (): NotificationItem => props.item;
  const read = (): boolean => item().read === true;
  const cls = (): Slots => parts(notificationsStyles({ read: read() }), props.classes);
  const Icon = item().icon ?? Bell;
  return (
    <li
      class={cls().item}
      data-slot="notification"
      data-read={read() ? "" : undefined}
      aria-label={read() ? undefined : messages().unreadItem(item().title)}
    >
      <Show
        when={item().actor !== undefined}
        fallback={
          <span class={arc(tones[item().tone ?? "neutral"], cls().media)} aria-hidden="true">
            <Icon />
          </span>
        }
      >
        <PersonAvatar person={item().actor ?? { name: "" }} class={cls().media} />
      </Show>
      <div class={cls().main} data-slot="notification-main">
        <span class={cls().title} data-slot="notification-title">
          <Show when={item().href !== undefined || props.canMark} fallback={item().title}>
            <a
              class={cls().link}
              href={item().href ?? "#"}
              onClick={(event: MouseEvent) => {
                if (item().href === undefined) event.preventDefault();
                props.onOpen();
              }}
            >
              {item().title}
            </a>
          </Show>
        </span>
        <Show when={item().body !== undefined}>
          <span class={cls().body} data-slot="notification-body">
            {item().body}
          </span>
        </Show>
        <span class={cls().meta} data-slot="notification-meta">
          <RelativeTime value={item().createdAt} now={props.now} />
          <Show when={item().source !== undefined}>
            <span aria-hidden="true">·</span>
            <span>{item().source}</span>
          </Show>
        </span>
        <Show when={(item().actions?.length ?? 0) > 0}>
          <div class={cls().actions} data-slot="notification-actions">
            <For each={item().actions ?? []}>
              {(action: NotificationAction) => (
                <Button
                  size="xs"
                  variant={action.tone === "danger" ? "destructive" : "outline"}
                  onPress={() => action.onAction(item())}
                >
                  {action.label}
                </Button>
              )}
            </For>
          </div>
        </Show>
      </div>
      <Show when={props.canMark}>
        <IconButton
          class={cls().toggle}
          label={read() ? messages().markUnread : messages().markRead}
          variant="ghost"
          size="sm"
          tooltip={false}
          onPress={() => props.onMark(!read())}
        >
          {read() ? <Circle aria-hidden="true" /> : <Check aria-hidden="true" />}
        </IconButton>
      </Show>
      <Show when={!read()}>
        <Indicator dot tone="info" size="sm" class={cls().unread} />
        <span class={srOnly}>{messages().unread}</span>
      </Show>
    </li>
  );
}

export interface NotificationCenterProps extends Omit<NotificationFeedProps, "aria-label"> {
  /** @default arc's "Notifications" */
  heading?: string;
  /** A link to every notification, at the panel's foot. */
  allHref?: string;
  /** A link to the reader's notification settings. */
  preferencesHref?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * The bell in an app's top bar: the unread count on it, and the feed in a
 * popover beside it, or a sheet from the bottom on a phone.
 *
 * ```tsx
 * const feed = useNotifications({ initial: data(), stream: { url: "/api/notifications/stream" } });
 *
 * <NotificationCenter
 *   items={feed.items()}
 *   onMarkRead={(ids, read) => { feed.markRead(ids, read); void api.mark(ids, read); }}
 *   onMarkAllRead={() => { feed.markAllRead(); void api.markAll(); }}
 *   allHref="/notifications"
 * />
 * ```
 */
export function NotificationCenter(props: NotificationCenterProps) {
  const messages = useArcMessages();
  const unread = (): number => props.items.filter((item) => item.read !== true).length;
  const heading = (): string => props.heading ?? messages().notifications;
  return (
    <ResponsiveOverlay
      heading={heading()}
      desktop="popover"
      open={props.open}
      defaultOpen={props.defaultOpen}
      onOpenChange={props.onOpenChange}
      trigger={
        <IconButton
          class={parts(notificationsStyles(), props.classes).bell}
          label={unread() > 0 ? messages().notificationsUnread(unread()) : heading()}
          variant="ghost"
          tooltip={false}
        >
          <Indicator count={unread()} tone="danger" size="sm" label="">
            <Bell aria-hidden="true" />
          </Indicator>
        </IconButton>
      }
      footer={
        props.allHref === undefined && props.preferencesHref === undefined ? undefined : (
          <div class={parts(notificationsStyles(), props.classes).footer}>
            <Show when={props.allHref !== undefined}>
              <Button variant="link" size="sm" href={props.allHref}>
                {messages().viewAll}
              </Button>
            </Show>
            <Show when={props.preferencesHref !== undefined}>
              <Button variant="link" size="sm" href={props.preferencesHref}>
                {messages().notificationSettings}
              </Button>
            </Show>
          </div>
        )
      }
    >
      <NotificationFeed {...props} aria-label={heading()} />
    </ResponsiveOverlay>
  );
}

export type NotificationStream =
  | { kind?: "sse"; url: string; event?: string; withCredentials?: boolean }
  | { kind: "websocket"; url: string };

export interface UseNotificationsOptions {
  initial?: readonly NotificationItem[];
  /** Where new notifications arrive, each message one notification as JSON (or `parse`'s). */
  stream?: NotificationStream;
  parse?: (data: string) => NotificationItem | undefined;
  /** At most this many kept, the oldest dropped. @default 200 */
  max?: number;
}

export interface NotificationsFeed {
  items: () => readonly NotificationItem[];
  unread: () => number;
  /** Adds at the top, replacing one with the same id. */
  append: (item: NotificationItem) => void;
  markRead: (ids: readonly string[], read?: boolean) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  replace: (items: readonly NotificationItem[]) => void;
  /** The stream's connection: `"open"`, `"connecting"` or `"closed"`. */
  connection: () => string;
}

/**
 * A notification list that new ones are appended to as they arrive, through
 * `eventSource` or `websocket` from `@barqjs/primitives`, every message in
 * order, with read and unread held here until the server's list replaces it.
 */
export function useNotifications(options: UseNotificationsOptions = {}): NotificationsFeed {
  const max = options.max ?? 200;
  const [items, setItems] = createSignal<readonly NotificationItem[]>(options.initial ?? [], {
    ownedWrite: true,
  });
  // Appends read the list as it stands, not as of the last flush, so two
  // messages in one tick both land.
  let held: readonly NotificationItem[] = options.initial ?? [];
  const write = (next: readonly NotificationItem[]): void => {
    held = next.slice(0, max);
    setItems(held);
  };
  const append = (item: NotificationItem): void => {
    write([item, ...held.filter((one) => one.id !== item.id)]);
  };
  const parse =
    options.parse ??
    ((data: string): NotificationItem | undefined => {
      try {
        return JSON.parse(data) as NotificationItem;
      } catch {
        return undefined;
      }
    });
  const take = (data: string): void => {
    const item = parse(data);
    if (item !== undefined) append(item);
  };

  let connection: () => string = () => "closed";
  const stream = options.stream;
  if (stream !== undefined) {
    if (stream.kind === "websocket") {
      const socket = websocket(stream.url);
      socket.onMessage(take);
      connection = socket.state;
    } else {
      const source = eventSource(stream.url, { withCredentials: stream.withCredentials });
      source.on(stream.event ?? "message", (event) => take(event.data));
      connection = source.state;
    }
  }

  return {
    items,
    unread: () => items().filter((item) => item.read !== true).length,
    append,
    markRead: (ids, read = true) => {
      const wanted = new Set(ids);
      write(held.map((item) => (wanted.has(item.id) ? { ...item, read } : item)));
    },
    markAllRead: () => write(held.map((item) => ({ ...item, read: true }))),
    remove: (id) => write(held.filter((item) => item.id !== id)),
    replace: (next) => write([...next]),
    connection: () => connection(),
  };
}
