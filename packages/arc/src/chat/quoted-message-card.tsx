import { type Child, Show, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Button as AriaButton } from "@barqjs/aria/button";
import { Link as AriaLink } from "@barqjs/aria/link";
import { Skeleton } from "@barqjs/ui/skeleton";

import type { Person } from "../components/avatar-stack.tsx";
import { FormattedDate, type Moment } from "../components/format.tsx";
import { PersonAvatar } from "../components/person-avatar.tsx";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  control,
  edge,
  fg,
  gap,
  interaction,
  layout,
  motion,
  space,
  surface,
  type,
} from "../style/index.ts";

/** Where the message was sent: a channel, a conversation, a thread. */
export interface MessageSource {
  /** `"#design"`, `"Ana Lima"`. */
  label: Child;
  /** Opens the conversation. */
  href?: string;
  /** Icon before the label: a hash, a lock. Decorative. */
  icon?: Child;
}

export const quotedMessageCardStyles = variants({
  slots: {
    root: arc(
      surface.card,
      layout.relative,
      layout.column,
      layout.minZero,
      gap[2],
      motion.colours,
      { padding: space.x3 },
    ),
    top: arc(layout.row, layout.between, layout.minZero, gap[2]),
    source: arc(layout.inlineRow, layout.minZero, gap[1], type.meta, {
      "& > svg": { inlineSize: space.x3, blockSize: space.x3, flexShrink: "0" },
    }),
    sourceLink: arc(fg.muted, interaction.hoverText, layout.relative, {
      zIndex: "1",
      textDecorationLine: "none",
    }),
    actions: arc(layout.row, layout.relative, gap[1], { zIndex: "1", marginInlineStart: "auto" }),
    author: arc(layout.row, layout.minZero, gap[2]),
    who: arc(layout.column, layout.minZero),
    name: arc(type.label, layout.flush),
    time: arc(type.meta),
    open: control.stretched,
    snippet: arc(type.body, layout.clamp3, {
      overflowWrap: "anywhere",
      paddingInlineStart: space.x10,
    }),
    note: arc(type.sm, fg.muted, edge.start, {
      marginInlineStart: space.x10,
      paddingInlineStart: space.x3,
      fontStyle: "italic",
      borderInlineStartWidth: "2px",
    }),
    footer: arc(type.meta, edge.top, { paddingBlockStart: space.x2 }),
    skeletonLine: arc({ blockSize: space.x4, inlineSize: "80%" }),
    skeletonShort: arc({ blockSize: space.x3, inlineSize: "30%" }),
  },
  variants: {
    interactive: { true: { root: interaction.hoverEdge }, false: {} },
  },
  defaults: { interactive: false },
});

export type QuotedMessageCardSlots = ReturnType<typeof quotedMessageCardStyles>;

export interface QuotedMessageCardProps extends Customisable<QuotedMessageCardSlots> {
  author: Person;
  /** When it was sent. */
  sentAt: Moment;
  /** The message, cut to three lines. */
  children?: Child;
  /** Where it was sent, a link of its own above the card's. */
  source?: MessageSource;
  /** A line the reader kept with it, quoted under it. */
  note?: Child;
  /** Under it, after a rule: `"Pinned by Ana"`, `"Saved on 3 March"`. */
  footer?: Child;
  /** Remove, unpin, a menu: controls of their own above the card's. */
  actions?: Child;
  /** Opens the message in its conversation: the whole card is the link. */
  href?: string;
  /** Opens the message in place: the whole card is the button. */
  onOpen?: () => void;
  /** The words naming the card's link or button. @default the author and the time */
  openLabel?: string;
  /** The zone the time is written in. @default the reader's */
  timeZone?: string;
  /** Shapes in place of the message while it loads. */
  loading?: boolean;
  id?: string;
}

/**
 * A message quoted out of its conversation: a pinned message, a saved one,
 * a search result. Who sent it and when, where, the first three lines, and
 * a note kept with it.
 *
 * ```tsx
 * <QuotedMessageCard author={ana} sentAt={message.at} source={{ label: "#design", href: "/c/design" }}
 *   href={`/c/design/${message.id}`} actions={<IconButton label="Remove">…</IconButton>}
 *   footer="Pinned by Salama">{message.text}</QuotedMessageCard>
 * ```
 *
 * An article named by its author. With `href` or `onOpen` the whole card
 * opens the message (its author's name the link's words) while the source
 * and the actions stay controls of their own.
 */
export function QuotedMessageCard(props: QuotedMessageCardProps) {
  const nameId = createUniqueId();
  function cls(): QuotedMessageCardSlots {
    return parts(
      quotedMessageCardStyles({
        interactive: props.href !== undefined || props.onOpen !== undefined,
      }),
      props.classes,
    );
  }
  function name(): Child {
    if (props.href !== undefined) {
      return (
        <AriaLink
          class={cls().open}
          data-slot="quoted-message-open"
          href={props.href}
          aria-label={props.openLabel}
        >
          {props.author.name}
        </AriaLink>
      );
    }
    if (props.onOpen !== undefined) {
      return (
        <AriaButton
          class={cls().open}
          data-slot="quoted-message-open"
          aria-label={props.openLabel}
          onPress={() => props.onOpen?.()}
        >
          {props.author.name}
        </AriaButton>
      );
    }
    return props.author.name;
  }
  return (
    <article
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="quoted-message-card"
      aria-labelledby={nameId}
      aria-busy={props.loading === true ? "true" : undefined}
    >
      <Show when={props.source !== undefined || props.actions !== undefined}>
        <div class={cls().top} data-slot="quoted-message-top">
          <Show when={props.source}>
            {(source: () => MessageSource) => (
              <span class={cls().source} data-slot="quoted-message-source">
                <Show when={source().icon !== undefined}>
                  <span aria-hidden="true">{source().icon}</span>
                </Show>
                <Show when={source().href !== undefined} fallback={source().label}>
                  <a class={cls().sourceLink} href={source().href}>
                    {source().label}
                  </a>
                </Show>
              </span>
            )}
          </Show>
          <Show when={props.actions !== undefined}>
            <div class={cls().actions} data-slot="quoted-message-actions">
              {props.actions}
            </div>
          </Show>
        </div>
      </Show>
      <div class={cls().author} data-slot="quoted-message-author">
        <PersonAvatar person={props.author} size="sm" />
        <div class={cls().who}>
          <p class={cls().name} id={nameId} data-slot="quoted-message-name">
            {name()}
          </p>
          <FormattedDate
            class={cls().time}
            value={props.sentAt}
            options={{ dateStyle: "medium", timeStyle: "short" }}
            timeZone={props.timeZone}
          />
        </div>
      </div>
      <Show
        when={props.loading !== true}
        fallback={
          <>
            <Skeleton class={cls().skeletonLine} />
            <Skeleton class={cls().skeletonShort} />
          </>
        }
      >
        <p class={arc(cls().snippet, layout.flush)} data-slot="quoted-message-snippet">
          {props.children}
        </p>
      </Show>
      <Show when={props.note !== undefined}>
        <blockquote class={arc(cls().note, layout.flush)} data-slot="quoted-message-note">
          {props.note}
        </blockquote>
      </Show>
      <Show when={props.footer !== undefined}>
        <div class={cls().footer} data-slot="quoted-message-footer">
          {props.footer}
        </div>
      </Show>
    </article>
  );
}
