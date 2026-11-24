import { type Child, For, Show, createUniqueId, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { controllable } from "@barqjs/aria/utils";
import { BellOff } from "@barqjs/lucide/icons/bell-off";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { Hash } from "@barqjs/lucide/icons/hash";
import { Lock } from "@barqjs/lucide/icons/lock";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Users } from "@barqjs/lucide/icons/users";
import { persisted } from "@barqjs/primitives/storage";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@barqjs/ui/sidebar";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { control, fg, focus, gap, glyph, layout, motion, target, type } from "../style/index.ts";
import type { NavIcon } from "../components/app-shell.tsx";
import type { Person } from "../components/avatar-stack.tsx";
import { Indicator } from "../components/indicator.tsx";
import { useArcMessages } from "../components/messages.ts";
import { PersonAvatar } from "../components/person-avatar.tsx";
import { PresenceDot } from "../components/presence.tsx";

/** A channel, a direct message or a group conversation in the list. */
export interface Conversation {
  id: string;
  name: string;
  /** @default "channel" */
  kind?: "channel" | "direct" | "group";
  /** A channel only its members see. */
  private?: boolean;
  /** Who a direct message is with: their avatar and presence stand for it. */
  person?: Person;
  /** Drawn in place of the kind's own mark. */
  icon?: NavIcon;
  /** Messages the reader has not seen. */
  unread?: number;
  /** Of those, the ones that mention the reader. */
  mentions?: number;
  /** Not notifying the reader: drawn quiet, its unread not counted aloud. */
  muted?: boolean;
  /** The reader has an unsent draft in it. */
  draft?: boolean;
  /** Where opening it goes. */
  href?: string;
}

export interface GroupAction {
  label: string;
  onPress: () => void;
}

export interface ConversationGroup {
  id: string;
  label: string;
  conversations: readonly Conversation[];
  /** A button beside the heading: New channel, New message. */
  action?: GroupAction;
}

export const conversationListStyles = variants({
  slots: {
    root: arc(layout.column, layout.minZero),
    group: arc({}),
    heading: arc(control.bare, layout.row, gap[1], layout.fill, focus.visible, glyph.sm, {
      textAlign: "start",
      "&[aria-expanded=false] > svg": { rotate: "-90deg" },
      "&[aria-expanded=false]:dir(rtl) > svg": { rotate: "90deg" },
    }),
    chevron: arc(motion.transform),
    item: arc({}),
    // A finger's 44px in a page or a sheet, where nothing else sizes the row.
    button: arc(target.size, { "&[data-unread]": { fontWeight: "var(--font-weight-semibold)" } }),
    name: arc(layout.clip, layout.nowrap, layout.minZero, layout.grow),
    avatar: arc(layout.inlineCentre, layout.relative, layout.noShrink),
    marks: arc(layout.inlineRow, gap[1], fg.muted, glyph.sm, layout.noShrink),
    badge: arc(type.numeric),
  },
  variants: {
    muted: { true: { button: arc(fg.muted) }, false: {} },
  },
  defaults: { muted: false },
});

type Slots = ReturnType<typeof conversationListStyles>;

export interface ConversationListProps extends Customisable<Slots> {
  groups: readonly ConversationGroup[];
  /** The conversation open now, marked as the current page. */
  activeId?: string;
  /** A conversation chosen, with no `href` or along with one. */
  onSelect?: (conversation: Conversation) => void;
  /** The ids of the folded groups. */
  collapsed?: readonly string[];
  defaultCollapsed?: readonly string[];
  onCollapsedChange?: (collapsed: string[]) => void;
  /** Remember the folded groups in `localStorage` under this name. */
  storageKey?: string;
  /** Names the list. @default arc's "Conversations" */
  "aria-label"?: string;
}

/**
 * The reader's channels and direct messages, in groups that fold, for
 * `AppShell`'s `sidebar` slot or anywhere else: a page, a sheet, a phone's
 * whole screen.
 *
 * ```tsx
 * <AppShell navigation={NAV} sidebar={
 *   <ConversationList
 *     activeId={params().id}
 *     groups={[
 *       { id: "channels", label: "Channels", conversations: channels(),
 *         action: { label: "New channel", onPress: create } },
 *       { id: "direct", label: "Direct messages", conversations: dms() },
 *     ]}
 *   />
 * }>
 * ```
 *
 * Built from ui's sidebar menu, so in a sidebar it sits as the sidebar's
 * own navigation does, collapses to icons with it and is its sheet on a
 * phone; outside one it is the same list standing alone, each row a
 * finger's height under a coarse pointer.
 * A channel shows `#` or a lock, a direct message the person's avatar and
 * presence. One with unread messages is bold with its count, mentions in
 * the danger tone; a muted one is quiet and counts only its mentions; a
 * draft is marked. A screen reader hears each of those after the name. A
 * group's heading is a button that folds it, remembered under `storageKey`.
 */
export function ConversationList(props: ConversationListProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(conversationListStyles(), props.classes);
  }
  const key = untrack(() => props.storageKey);
  const remembered =
    key === undefined ? undefined : persisted<string[]>(`arc-conversations:${key}`, []);
  const [folded, setFolded] = controllable<readonly string[]>(
    () => props.collapsed,
    () => remembered?.[0]() ?? untrack(() => props.defaultCollapsed) ?? [],
    (next) => {
      remembered?.[1]([...next]);
      props.onCollapsedChange?.([...next]);
    },
  );
  function toggle(id: string): void {
    const now = folded();
    setFolded(now.includes(id) ? now.filter((one) => one !== id) : [...now, id]);
  }
  return (
    <nav
      class={arc(cls().root, props.class, props.className)}
      data-slot="conversation-list"
      aria-label={props["aria-label"] ?? messages().conversations}
    >
      <For each={props.groups}>
        {(group: ConversationGroup) => {
          const contentId = createUniqueId();
          function open(): boolean {
            return !folded().includes(group.id);
          }
          return (
            <SidebarGroup class={cls().group} data-slot="conversation-list-group">
              <SidebarGroupLabel>
                <button
                  type="button"
                  class={cls().heading}
                  data-slot="conversation-list-heading"
                  aria-expanded={open() ? "true" : "false"}
                  aria-controls={contentId}
                  onClick={() => toggle(group.id)}
                >
                  <ChevronDown class={cls().chevron} aria-hidden="true" />
                  {group.label}
                </button>
              </SidebarGroupLabel>
              <Show when={group.action !== undefined}>
                <SidebarGroupAction
                  aria-label={group.action?.label}
                  title={group.action?.label}
                  onClick={() => group.action?.onPress()}
                >
                  <Plus aria-hidden="true" />
                </SidebarGroupAction>
              </Show>
              <SidebarGroupContent id={contentId} hidden={!open()}>
                <SidebarMenu aria-label={group.label}>
                  <For each={group.conversations}>
                    {(conversation: Conversation) => (
                      <Entry
                        conversation={conversation}
                        active={props.activeId === conversation.id}
                        classes={props.classes}
                        onSelect={props.onSelect}
                      />
                    )}
                  </For>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        }}
      </For>
    </nav>
  );
}

interface EntryProps {
  conversation: Conversation;
  active: boolean;
  classes: ConversationListProps["classes"];
  onSelect: ((conversation: Conversation) => void) | undefined;
}

function Entry(props: EntryProps) {
  const messages = useArcMessages();
  function conversation(): Conversation {
    return props.conversation;
  }
  function muted(): boolean {
    return conversation().muted === true;
  }
  function cls(): Slots {
    return parts(conversationListStyles({ muted: muted() }), props.classes);
  }
  function unread(): number {
    return conversation().unread ?? 0;
  }
  function mentions(): number {
    return conversation().mentions ?? 0;
  }
  function bold(): boolean {
    return unread() > 0 && !muted();
  }
  function count(): number {
    return mentions() > 0 ? mentions() : muted() ? 0 : unread();
  }
  function details(): string {
    const out: string[] = [];
    if (conversation().private === true) out.push(messages().privateConversation);
    if (mentions() > 0) out.push(messages().mentionCount(mentions()));
    if (unread() > 0 && !muted()) out.push(messages().unreadCount(unread()));
    if (muted()) out.push(messages().muted);
    if (conversation().draft === true) out.push(messages().draft);
    return out.length === 0 ? "" : `, ${out.join(", ")}`;
  }
  function mark(): Child {
    const own = conversation().icon;
    if (own !== undefined) {
      const Icon = own;
      return <Icon />;
    }
    const kind = conversation().kind ?? "channel";
    const person = conversation().person;
    if (kind === "direct" && person !== undefined) {
      return (
        <PersonAvatar
          person={person}
          size="sm"
          class={cls().avatar}
          slot="conversation-list-avatar"
        >
          <Show when={person.presence !== undefined}>
            <PresenceDot presence={person.presence ?? "offline"} anchored label={false} />
          </Show>
        </PersonAvatar>
      );
    }
    if (kind === "group") return <Users aria-hidden="true" />;
    return conversation().private === true ? (
      <Lock aria-hidden="true" />
    ) : (
      <Hash aria-hidden="true" />
    );
  }
  return (
    <SidebarMenuItem class={cls().item} data-slot="conversation-list-item">
      <SidebarMenuButton
        class={cls().button}
        data-slot="conversation-list-button"
        data-unread={bold() ? "" : undefined}
        data-muted={muted() ? "" : undefined}
        href={conversation().href}
        isActive={props.active}
        tooltip={conversation().name}
        aria-current={props.active ? "page" : undefined}
        onClick={() => props.onSelect?.(conversation())}
      >
        <span class={cls().avatar} aria-hidden="true">
          {mark()}
        </span>
        <span class={cls().name} data-slot="conversation-list-name">
          {conversation().name}
        </span>
        <span class={srOnly}>{details()}</span>
        <span class={cls().marks} aria-hidden="true">
          <Show when={conversation().draft === true}>
            <Pencil data-slot="conversation-list-draft" />
          </Show>
          <Show when={muted()}>
            <BellOff data-slot="conversation-list-muted" />
          </Show>
        </span>
      </SidebarMenuButton>
      <Show when={count() > 0}>
        <SidebarMenuBadge class={cls().badge} aria-hidden="true">
          <Indicator
            count={count()}
            tone={mentions() > 0 ? "danger" : "neutral"}
            variant={mentions() > 0 ? "solid" : "subtle"}
            size="sm"
            label=""
          />
        </SidebarMenuBadge>
      </Show>
    </SidebarMenuItem>
  );
}
