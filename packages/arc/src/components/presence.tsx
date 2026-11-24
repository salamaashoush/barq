import {
  type Accessor,
  type Child,
  Show,
  createContext,
  createSignal,
  getOwner,
  install,
  onCleanup,
  untrack,
  useContext,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import { dateFormatter } from "@barqjs/aria/i18n";
import { websocket } from "@barqjs/primitives/websocket";
import { AvatarBadge } from "@barqjs/ui/avatar";
import { tokens } from "@barqjs/ui/theme/tokens";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, layout, place, tone as tones, type } from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import type { Moment } from "./format.tsx";
import { type ArcMessages, useArcMessages } from "./messages.ts";
import { statusVariants } from "./status.tsx";

/** Whether someone is there: online, away, not to be disturbed, or gone. */
export type Presence = "online" | "away" | "dnd" | "offline";

/** What someone says about themselves: an emoji, a line, and when it lapses. */
export interface CustomStatus {
  emoji?: string;
  text?: string;
  /** After this the status is no longer shown. */
  expiresAt?: Moment;
}

export const PRESENCE_TONE: Record<Presence, Tone> = {
  online: "success",
  away: "warning",
  dnd: "danger",
  offline: "neutral",
};

/** A presence in arc's words. */
export function presenceLabel(messages: ArcMessages, presence: Presence): string {
  if (presence === "online") return messages.online;
  if (presence === "away") return messages.away;
  if (presence === "dnd") return messages.doNotDisturb;
  return messages.offline;
}

const time = (moment: Moment): number =>
  moment instanceof Date ? moment.getTime() : new Date(moment).getTime();

/** Whether a status still holds at `now`. */
export function statusHolds(status: CustomStatus | undefined, now: Moment = Date.now()): boolean {
  if (status === undefined) return false;
  if (status.emoji === undefined && (status.text ?? "") === "") return false;
  return status.expiresAt === undefined || time(status.expiresAt) > time(now);
}

/**
 * The shapes differ as well as the colours, so a presence is never told by
 * colour alone: away has a hole in it, do-not-disturb a bar across, and
 * offline is a ring.
 */
const mark = arc(place.afterLayer, {
  "::after": { backgroundColor: tokens.background, borderRadius: "inherit" },
});

export const presenceStyles = variants({
  slots: {
    root: arc(layout.inlineRow, gap[1.5], type.label, layout.minZero),
    dot: arc(statusVariants().dot),
    label: arc(layout.nowrap),
    status: arc(layout.inlineRow, gap[1], fg.muted, type.meta, layout.minZero),
    emoji: arc(layout.noShrink),
    text: arc(layout.clip, layout.nowrap, layout.minZero),
    until: arc(type.numeric, layout.nowrap),
  },
  variants: {
    presence: {
      online: { dot: tones.success },
      away: { dot: arc(tones.warning, mark, { "::after": { inset: "30%" } }) },
      dnd: { dot: arc(tones.danger, mark, { "::after": { inset: "42% 20%" } }) },
      offline: { dot: arc(tones.neutral, mark, { "::after": { inset: "2px" } }) },
    },
  },
  defaults: { presence: "offline" },
});

type Slots = ReturnType<typeof presenceStyles>;

export interface PresenceDotProps extends Customisable<Slots> {
  presence: Presence;
  /** Pinned to the bottom corner at the reading end, over an avatar, as ui's avatar badge. */
  anchored?: boolean;
  /**
   * What a screen reader hears. `false` where the words are already beside
   * it. @default the presence in arc's words
   */
  label?: string | false;
}

/**
 * Someone's presence as a dot, in a tone and a shape: on its own beside a
 * name, or `anchored` over the corner of an avatar.
 *
 * ```tsx
 * <PersonAvatar person={alex}><PresenceDot presence="away" anchored /></PersonAvatar>
 * ```
 */
export function PresenceDot(props: PresenceDotProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(presenceStyles({ presence: props.presence }), props.classes);
  const label = (): string | undefined =>
    props.label === false ? undefined : (props.label ?? presenceLabel(messages(), props.presence));
  const attributes = () => ({
    class: arc(cls().dot, props.class, props.className),
    "data-slot": "presence-dot",
    "data-presence": props.presence,
    role: label() === undefined ? undefined : "img",
    "aria-label": label(),
    "aria-hidden": label() === undefined ? (true as const) : undefined,
  });
  return (
    <Show when={props.anchored === true} fallback={<span {...attributes()} />}>
      <AvatarBadge {...attributes()} />
    </Show>
  );
}

export interface PresenceStatusProps extends Customisable<Slots> {
  presence: Presence;
  status?: CustomStatus;
  /** The moment an expiry is measured from on the server and while hydrating. */
  now?: Moment;
  /** The zone the expiry's time is written in. @default the reader's */
  timeZone?: string;
  /** Leave the presence's word out, the dot and the status alone. */
  compact?: boolean;
  id?: string;
}

/**
 * Someone's presence in a dot and a word, and the status they set: its emoji,
 * its line and the time it lapses, gone once it has.
 *
 * ```tsx
 * <PresenceStatus presence="dnd" status={{ emoji: "🎧", text: "Focusing", expiresAt: fivePm }} />
 * ```
 */
export function PresenceStatus(props: PresenceStatusProps) {
  const messages = useArcMessages();
  const clock = dateFormatter({ timeStyle: "short", timeZone: untrack(() => props.timeZone) });
  const [tick, setTick] = createSignal(0, { ownedWrite: true });
  // The status goes away by itself at its expiry, with no prop changing.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const now = (): number => {
    tick();
    return props.now === undefined ? Date.now() : time(props.now);
  };
  const holds = (): boolean => {
    const status = props.status;
    const live = statusHolds(status, now());
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (live && status?.expiresAt !== undefined && typeof window !== "undefined") {
      const wait = time(status.expiresAt) - Date.now();
      if (wait > 0 && wait < 2_147_483_647) timer = setTimeout(() => setTick((n) => n + 1), wait);
    }
    return live;
  };
  onCleanup(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
  const cls = (): Slots => parts(presenceStyles({ presence: props.presence }), props.classes);
  const word = (): string => presenceLabel(messages(), props.presence);
  return (
    <span
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="presence-status"
      data-presence={props.presence}
    >
      <PresenceDot
        presence={props.presence}
        classes={props.classes}
        label={props.compact === true ? word() : false}
      />
      <Show when={props.compact !== true}>
        <span class={cls().label} data-slot="presence-status-label">
          {word()}
        </span>
      </Show>
      <Show when={holds()}>
        <span class={cls().status} data-slot="presence-status-custom">
          <Show when={props.status?.emoji !== undefined}>
            <span class={cls().emoji} data-slot="presence-status-emoji">
              {props.status?.emoji}
            </span>
          </Show>
          <Show when={(props.status?.text ?? "") !== ""}>
            <span class={cls().text} data-slot="presence-status-text">
              {props.status?.text}
            </span>
          </Show>
          <Show when={props.status?.expiresAt !== undefined}>
            <span class={cls().until} data-slot="presence-status-until">
              {messages().statusUntil(clock().format(new Date(time(props.status?.expiresAt ?? 0))))}
            </span>
          </Show>
        </span>
      </Show>
    </span>
  );
}

/** One person's presence as a source reports it. */
export interface PresenceEntry {
  presence: Presence;
  status?: CustomStatus;
}

/**
 * What a presence source sends: a person's presence changed, or they started
 * or stopped typing somewhere.
 */
export type PresenceEvent =
  | ({ type: "presence"; userId: string } & PresenceEntry)
  | { type: "typing"; userId: string; conversationId: string; typing: boolean };

export interface PresenceStoreOptions {
  initial?: Readonly<Record<string, PresenceEntry>>;
  /** A socket that sends one {@link PresenceEvent} per message, as JSON or `parse`'s. */
  url?: string;
  parse?: (data: string) => PresenceEvent | undefined;
  /** How long a typing report holds before it is taken as stopped, in ms. @default 6000 */
  typingTimeout?: number;
}

export interface PresenceStore {
  /** One person's presence, `offline` when nothing has been heard. */
  of: (userId: string) => PresenceEntry;
  /** Who is typing in a conversation, in the order they started. */
  typing: (conversationId: string) => readonly string[];
  /** Apply an event, as one from the socket is applied. */
  apply: (event: PresenceEvent) => void;
  /** The socket's state: `"open"`, `"connecting"` or `"closed"`. */
  connection: Accessor<string>;
}

const OFFLINE: PresenceEntry = { presence: "offline" };

/**
 * Presence and typing for everyone in a workspace, kept from a socket through
 * `websocket` from `@barqjs/primitives`, each typing report lapsing by itself
 * when the next one does not come.
 */
export function createPresenceStore(options: PresenceStoreOptions = {}): PresenceStore {
  const [entries, setEntries] = createSignal<Readonly<Record<string, PresenceEntry>>>(
    options.initial ?? {},
    { ownedWrite: true },
  );
  const [typists, setTypists] = createSignal<Readonly<Record<string, readonly string[]>>>(
    {},
    { ownedWrite: true },
  );
  // Read as they stand rather than as of the last flush, so two events in one
  // tick both land.
  let held = options.initial ?? {};
  let typing: Readonly<Record<string, readonly string[]>> = {};
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const timeout = options.typingTimeout ?? 6000;

  const setTyping = (conversationId: string, userId: string, on: boolean): void => {
    const key = `${conversationId}\u0000${userId}`;
    const pending = timers.get(key);
    if (pending !== undefined) clearTimeout(pending);
    timers.delete(key);
    const now = typing[conversationId] ?? [];
    const next = on
      ? now.includes(userId)
        ? now
        : [...now, userId]
      : now.filter((one) => one !== userId);
    if (on) {
      timers.set(
        key,
        setTimeout(() => setTyping(conversationId, userId, false), timeout),
      );
    }
    if (next === now) return;
    typing = { ...typing, [conversationId]: next };
    setTypists(typing);
  };

  const apply = (event: PresenceEvent): void => {
    if (event.type === "typing") {
      setTyping(event.conversationId, event.userId, event.typing);
      return;
    }
    const entry: PresenceEntry =
      event.status === undefined
        ? { presence: event.presence }
        : { presence: event.presence, status: event.status };
    held = { ...held, [event.userId]: entry };
    setEntries(held);
    // Someone who went offline has stopped typing everywhere.
    if (event.presence === "offline") {
      for (const conversationId of Object.keys(typing)) {
        setTyping(conversationId, event.userId, false);
      }
    }
  };

  const parse =
    options.parse ??
    ((data: string): PresenceEvent | undefined => {
      try {
        return JSON.parse(data) as PresenceEvent;
      } catch {
        return undefined;
      }
    });

  let connection: Accessor<string> = () => "closed";
  if (options.url !== undefined) {
    const socket = websocket(options.url);
    socket.onMessage((data: string) => {
      const event = parse(data);
      if (event !== undefined) apply(event);
    });
    connection = socket.state;
  }

  if (getOwner() !== null) {
    onCleanup(() => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    });
  }

  return {
    of: (userId) => entries()[userId] ?? OFFLINE,
    typing: (conversationId) => typists()[conversationId] ?? [],
    apply,
    connection: () => connection(),
  };
}

const PresenceContext = createContext<PresenceStore | null>(null, "Presence");

export interface PresenceProviderProps extends PresenceStoreOptions {
  /** A store made elsewhere, shared rather than opening a socket of its own. */
  store?: PresenceStore;
  children?: Child;
}

/**
 * Presence for everything below: one store, one socket, read with
 * `usePresence(userId)` and `useTyping(conversationId)`.
 *
 * ```tsx
 * <PresenceProvider url="wss://example.com/presence">
 *   <ConversationList … />
 * </PresenceProvider>
 * ```
 */
export function PresenceProvider(props: PresenceProviderProps) {
  const store = untrack(() => props.store) ?? createPresenceStore(untrack(() => ({ ...props })));
  const owner = getOwner();
  if (owner !== null) install(owner, PresenceContext, () => store);
  return <>{props.children}</>;
}

/** The enclosing provider's store, or `null` outside one. */
export function usePresenceStore(): PresenceStore | null {
  return useContext(PresenceContext)();
}

/** One person's presence from the enclosing `PresenceProvider`, offline outside one. */
export function usePresence(userId: () => string): Accessor<PresenceEntry> {
  const held = useContext(PresenceContext);
  return () => held()?.of(userId()) ?? OFFLINE;
}

/** Who is typing in a conversation, from the enclosing `PresenceProvider`. */
export function useTyping(conversationId: () => string): Accessor<readonly string[]> {
  const held = useContext(PresenceContext);
  return () => held()?.typing(conversationId()) ?? [];
}
