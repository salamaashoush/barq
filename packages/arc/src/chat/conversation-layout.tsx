import { type Child, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { type Breakpoint, on } from "@barqjs/ui/conditions";
import { type RenderPart } from "@barqjs/ui/slot";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts, rendered } from "../lib/parts.ts";
import { edge, fg, gap, glyph, layout, place, space, truncate, type } from "../style/index.ts";
import { type DockedPanel, DockedPanels } from "../components/docked-panels.tsx";

export const conversationLayoutStyles = variants({
  slots: {
    root: arc({}),
    main: arc(layout.column, layout.minZeroBlock, { overflow: "hidden" }),
    header: arc(layout.row, layout.noShrink, edge.bottom, gap[3], place.paddedBar, {
      minHeight: space.x14,
    }),
    identity: arc(layout.row, layout.grow, layout.minZero, gap[2]),
    icon: arc(layout.inlineCentre, layout.noShrink, glyph.md, fg.muted),
    text: arc(layout.column, layout.minZero),
    titleRow: arc(layout.row, layout.minZero, gap[2]),
    heading: arc(type.heading, truncate, layout.minZero),
    // From nothing, so the name keeps its width and only the topic gives way.
    topic: arc(type.sm, fg.muted, truncate, layout.minZero, edge.start, {
      flex: "1 1 0",
      paddingInlineStart: space.x2,
      [on.belowSm]: { display: "none" },
    }),
    subtitle: arc(type.meta, truncate),
    actions: arc(layout.row, layout.noShrink, gap[1]),
    tabs: arc(layout.noShrink, edge.bottom, { paddingInline: space.x4 }),
    banner: arc(layout.noShrink),
    body: arc(layout.column, layout.grow, layout.minZeroBlock, place.fill),
    dock: arc(layout.column, layout.noShrink, gap[1], {
      paddingInline: space.x4,
      paddingBlockEnd: "max(calc(var(--spacing) * 3), env(safe-area-inset-bottom))",
    }),
    typing: arc({ minHeight: space.x5 }),
  },
});

type Slots = ReturnType<typeof conversationLayoutStyles>;

export interface ConversationLayoutRenders {
  heading?: RenderPart<Child>;
}

export interface ConversationLayoutProps extends Customisable<Slots> {
  /** The conversation's name, its `<h1>`: a channel, a person, a group. */
  heading: Child;
  /** Before the name: the channel's kind (`#`, a lock) or the person's avatar. */
  icon?: Child;
  /** After the name, cut to one line: what the channel is for. */
  topic?: Child;
  /** Under the name: "Active now", "3 members", a local time. */
  subtitle?: Child;
  /** At the end of the header: members, call, details, a More menu. `DockedPanelToggle`s work here. */
  actions?: Child;
  /** Under the header: the conversation's own tabs, such as messages and files. */
  tabs?: Child;
  /** Above the messages: a call in progress, a pinned notice, an archived conversation. */
  banner?: Child;
  /** The messages: a `MessageList`, or its loading or empty state. */
  children?: Child;
  /** Just above the composer: a `TypingIndicator`, its line kept so the composer does not jump. */
  typing?: Child;
  /** Docked at the foot: the composer, or why one cannot write here. */
  composer?: Child;
  /** Panels beside the conversation: a thread, its members, its details. */
  panels?: readonly DockedPanel[];
  /** The open panel's id, or `null` for none. */
  activePanel?: string | null;
  defaultActivePanel?: string | null;
  onActivePanelChange?: (active: string | null) => void;
  /** Remember the panel's width under this name. */
  storageKey?: string;
  /** Below this step, or under a finger, a panel is a sheet over the conversation. @default "lg" */
  breakpoint?: Breakpoint;
  /** Another element for the name: an `<h2>` where the page already has an `<h1>`. */
  renders?: ConversationLayoutRenders;
}

/**
 * A conversation's page: who or what it is with its actions, the messages
 * filling the height between, the composer docked at the foot, and a panel
 * beside it for a thread, its members or its details.
 *
 * ```tsx
 * <ConversationLayout
 *   heading="design"
 *   icon={<Hash />}
 *   topic="Reviews, critiques and the Friday demo"
 *   actions={<DockedPanelToggle panel="members" />}
 *   panels={[
 *     { id: "thread", label: "Thread", content: () => <ThreadPanel … /> },
 *     { id: "members", label: "Members", count: 12, content: () => <Members /> },
 *   ]}
 *   activePanel={panel()}
 *   onActivePanelChange={setPanel}
 *   typing={<TypingIndicator people={typing()} />}
 *   composer={<ChatComposer … />}
 * >
 *   <MessageList … />
 * </ConversationLayout>
 * ```
 *
 * The panels are `DockedPanels`: the conversation makes room for one, its
 * edge moves, and below `breakpoint` it is a sheet. The header sits inside
 * the conversation's column, so a panel runs the full height beside it.
 */
export function ConversationLayout(props: ConversationLayoutProps) {
  function cls(): Slots {
    return parts(conversationLayoutStyles(), props.classes);
  }
  const heading = props.renders?.heading;
  return (
    <DockedPanels
      class={arc(cls().root, props.class, props.className)}
      classes={{ main: cls().main }}
      panels={props.panels ?? []}
      active={props.activePanel}
      defaultActive={props.defaultActivePanel}
      onActiveChange={(active: string | null) => props.onActivePanelChange?.(active)}
      storageKey={props.storageKey}
      breakpoint={props.breakpoint}
    >
      <div class={cls().header} data-slot="conversation-header">
        <div class={cls().identity} data-slot="conversation-identity">
          <Show when={props.icon !== undefined}>
            <span class={cls().icon} data-slot="conversation-icon" aria-hidden="true">
              {props.icon}
            </span>
          </Show>
          <div class={cls().text} data-slot="conversation-text">
            <div class={cls().titleRow} data-slot="conversation-title-row">
              {heading === undefined ? (
                <h1 class={cls().heading} data-slot="conversation-heading">
                  {props.heading}
                </h1>
              ) : (
                rendered(
                  heading,
                  { class: cls().heading, "data-slot": "conversation-heading" },
                  props.heading,
                )
              )}
              <Show when={props.topic !== undefined}>
                <span class={cls().topic} data-slot="conversation-topic">
                  {props.topic}
                </span>
              </Show>
            </div>
            <Show when={props.subtitle !== undefined}>
              <span class={cls().subtitle} data-slot="conversation-subtitle">
                {props.subtitle}
              </span>
            </Show>
          </div>
        </div>
        <Show when={props.actions !== undefined}>
          <div class={cls().actions} data-slot="conversation-actions">
            {props.actions}
          </div>
        </Show>
      </div>
      <Show when={props.tabs !== undefined}>
        <div class={cls().tabs} data-slot="conversation-tabs">
          {props.tabs}
        </div>
      </Show>
      <Show when={props.banner !== undefined}>
        <div class={cls().banner} data-slot="conversation-banner">
          {props.banner}
        </div>
      </Show>
      <div class={cls().body} data-slot="conversation-body">
        {props.children}
      </div>
      <Show when={props.typing !== undefined || props.composer !== undefined}>
        <div class={cls().dock} data-slot="conversation-dock">
          <Show when={props.typing !== undefined}>
            <div class={cls().typing} data-slot="conversation-typing">
              {props.typing}
            </div>
          </Show>
          {props.composer}
        </div>
      </Show>
    </DockedPanels>
  );
}
