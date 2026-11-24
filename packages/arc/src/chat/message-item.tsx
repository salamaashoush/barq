import {
  type Child,
  For,
  Show,
  createEffect,
  createSignal,
  createUniqueId,
  untrack,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import { announce } from "@barqjs/aria/live";
import { longPress } from "@barqjs/aria/interactions";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import { FileText } from "@barqjs/lucide/icons/file-text";
import { MessageSquare } from "@barqjs/lucide/icons/message-square";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { Pin } from "@barqjs/lucide/icons/pin";
import { SmilePlus } from "@barqjs/lucide/icons/smile-plus";
import { writeClipboard } from "@barqjs/primitives/clipboard";
import { ref as makeRef } from "@barqjs/primitives/refs";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@barqjs/ui/attachment";
import { Bubble, BubbleContent } from "@barqjs/ui/bubble";
import { Button } from "@barqjs/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { Message, MessageAvatar, MessageContent, MessageHeader } from "@barqjs/ui/message";
import { srOnly } from "@barqjs/ui/sr-only";
import { tokens } from "@barqjs/ui/theme/tokens";
import type { RenderPart } from "@barqjs/ui/slot";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts, rendered } from "../lib/parts.ts";
import {
  control,
  fg,
  focus,
  gap,
  interaction,
  layout,
  place,
  rounded,
  space,
  surface,
  target,
  type,
} from "../style/index.ts";
import { AvatarStack } from "../components/avatar-stack.tsx";
import { confirm } from "../components/confirm.tsx";

import { Bytes, FormattedDate, RelativeTime } from "../components/format.tsx";
import { Gallery } from "../components/gallery.tsx";
import { IconButton } from "../components/icon-button.tsx";
import { MediaPlayer } from "../components/media-player.tsx";
import { useArcMessages } from "../components/messages.ts";
import { PersonAvatar } from "../components/person-avatar.tsx";
import { QUICK_REACTIONS, ReactionBar } from "../components/reactions.tsx";
import { ResponsiveOverlay } from "../components/responsive-overlay.tsx";
import { Toolbar } from "../components/toolbar.tsx";
import { RichTextRenderer } from "../editor/renderer.tsx";
import { EmojiButton } from "./emoji-button.tsx";
import type { ChatAttachment, ChatMessage, MessageHandlers } from "./model.ts";

export const messageItemStyles = variants({
  slots: {
    root: arc(layout.relative, rounded.md, interaction.hover, focus.inset, place.paddedLine, {
      outlineStyle: "none",
      "&:focus-within": { backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)" },
    }),
    message: arc({}),
    avatar: arc({ backgroundColor: "transparent" }),
    gutter: arc(type.caption, fg.muted, type.numeric, layout.centre, {
      inlineSize: space.x8,
      opacity: "0",
      "[data-slot=message-item]:is(:hover, :focus-within) &": { opacity: "1" },
    }),
    header: arc(layout.row, layout.wrap, gap[2], { paddingInline: "0px" }),
    author: arc(type.label, fg.default),
    time: arc(type.caption, fg.muted),
    edited: arc(type.caption, fg.muted),
    pinned: arc(layout.inlineRow, gap[1], type.caption, fg.muted),
    body: arc(type.body, type.written),
    attachments: arc(layout.column, gap[2], { maxInlineSize: "32rem" }),
    file: arc({}),
    reactions: arc({}),
    thread: arc(
      control.bare,
      layout.row,
      gap[2],
      rounded.md,
      type.meta,
      focus.visible,
      target.size,
      {
        alignSelf: "flex-start",
        paddingInline: space.x1_5,
        "@media (hover: hover)": { ":hover": { backgroundColor: tokens.muted } },
      },
    ),
    threadCount: arc(fg.link, type.medium),
    state: arc(layout.row, layout.wrap, gap[2], type.caption, fg.muted),
    error: arc(fg.danger),
    actions: arc(surface.elevated, rounded.md, place.passive, interaction.reveal, {
      insetBlockStart: `calc(${space.x4} * -1)`,
      insetInlineEnd: space.x3,
      zIndex: "1",
      ":is(:hover, :focus-within) > &, &[data-open]": { pointerEvents: "auto" },
    }),
    sheet: arc(layout.column, gap[1]),
    quick: arc(layout.row, layout.between, { paddingBlockEnd: space.x2 }),
  },
  variants: {
    state: {
      sent: {},
      pending: { body: arc({ opacity: "0.6" }) },
      failed: {},
    },
  },
  defaults: { state: "sent" },
});

type Slots = ReturnType<typeof messageItemStyles>;

export interface MessageItemProps extends MessageHandlers, Customisable<Slots> {
  message: ChatMessage;
  /** A run's later message: no avatar or name, its time beside it on hover. */
  grouped?: boolean;
  /** `bubble` draws the reader's own on the reading end, in a bubble. @default "plain" */
  appearance?: "plain" | "bubble";
  /**
   * In place of the body while the message is edited: `MessageEditor`, from
   * `@barqjs/arc/editor`. @default `renderEditor`'s, while `editingId` is this message
   */
  editor?: Child;
  /** The emoji offered at the top of the long-press sheet. @default 👍 ❤️ 🎉 😄 👀 */
  quickReactions?: readonly string[];
  /** Another element for the body, handed its attributes and the content. */
  renders?: { body?: RenderPart<Child> };
  /** Set by a list that moves focus between messages. */
  tabIndex?: number;
  id?: string;
  "aria-posinset"?: number;
  "aria-setsize"?: number;
}

/**
 * One message in a conversation: the author's avatar, name and time, the
 * body, its attachments, its reactions and its thread, with the actions a
 * hover, focus or long press brings up. Rich `content` is drawn by
 * `RichTextRenderer` from `@barqjs/arc/editor`.
 *
 * ```tsx
 * <MessageItem
 *   message={message}
 *   currentUserId={me.id}
 *   onReact={(message, emoji, add) => react(message.id, emoji, add)}
 *   onReply={(message) => openThread(message.id)}
 *   onDelete={(message) => remove(message.id)}
 * />
 * ```
 *
 * An article named by its author and time, on ui's `Message`. Pictures sit
 * in a `Gallery` that opens the `Lightbox`, audio and video play in
 * `MediaPlayer`, and other files are ui's `Attachment` cards that download.
 * The actions are a toolbar Tab enters once: add a reaction from the
 * `EmojiPicker`, reply in a thread, edit, and a menu to copy the link, pin
 * and delete (asked first). Under a finger a long press opens the same
 * actions in a sheet. A message still sending is dimmed and says so; one
 * refused says why with Retry and Discard.
 */
export function MessageItem(props: MessageItemProps) {
  const messages = useArcMessages();
  const nameId = createUniqueId();
  const timeId = createUniqueId();
  const message = (): ChatMessage => props.message;
  const state = (): "sent" | "pending" | "failed" => message().state ?? "sent";
  const cls = (): Slots => parts(messageItemStyles({ state: state() }), props.classes);
  const own = (): boolean =>
    props.canModify?.(message()) ??
    (props.currentUserId !== undefined && props.currentUserId === message().author.id);
  const settled = (): boolean => state() === "sent";
  const canEdit = (): boolean => own() && settled() && props.onEdit !== undefined;
  const canDelete = (): boolean => own() && settled() && props.onDelete !== undefined;
  const bubble = (): boolean => props.appearance === "bubble";
  const align = (): "start" | "end" => (bubble() && own() ? "end" : "start");
  const [picking, setPicking] = createSignal(false);
  const [menu, setMenu] = createSignal(false);
  const [sheet, setSheet] = createSignal(false);

  const react = (emoji: string, add: boolean): void => props.onReact?.(message(), emoji, add);
  const remove = async (): Promise<void> => {
    const sure = await confirm({
      title: messages().deleteMessageHeading,
      description: messages().deleteMessageDescription,
      tone: "danger",
      confirmLabel: messages().delete,
    });
    if (sure) props.onDelete?.(message());
  };
  const copyLink = async (): Promise<void> => {
    const link = props.linkTo?.(message());
    if (link === undefined) return;
    await writeClipboard(link);
    announce(messages().copied, "polite");
  };
  const openThread = (): void => (props.onOpenThread ?? props.onReply)?.(message());
  const hasMenu = (): boolean =>
    settled() && (props.linkTo !== undefined || props.onPin !== undefined || canDelete());
  const hasActions = (): boolean =>
    settled() &&
    (props.onReact !== undefined || props.onReply !== undefined || canEdit() || hasMenu());

  const { longPressProps } = longPress({
    pointerType: "touch",
    isDisabled: () => !hasActions(),
    accessibilityDescription: () => messages().moreActions,
    onLongPress: () => setSheet(true),
  });

  const editing = (): boolean =>
    props.editor !== undefined ||
    (props.renderEditor !== undefined && props.editingId === message().id);
  const article = makeRef<HTMLElement>();
  // Leaving the editor, by saving or by Escape, hands focus back to the
  // message rather than dropping it to the page.
  createEffect(editing, (now, was) => {
    const element = untrack(article);
    if (was !== true || now || element === null) return;
    const active = element.ownerDocument.activeElement;
    if (active === null || active === element.ownerDocument.body || element.contains(active)) {
      element.focus();
    }
  });

  const body = (): Child => {
    if (props.editor !== undefined) return props.editor;
    if (editing()) return props.renderEditor?.(message());
    const stored = message().content;
    const content =
      props.renderBody?.(message()) ??
      (stored === undefined ? message().body : <RichTextRenderer value={stored} size="sm" />);
    if (content === undefined || content === "") return null;
    const attributes = { class: cls().body, "data-slot": "message-item-body" };
    if (props.renders?.body !== undefined) return rendered(props.renders.body, attributes, content);
    return bubble() ? (
      <Bubble align={align()} variant={own() ? "default" : "muted"}>
        <BubbleContent class={cls().body} data-slot="message-item-body">
          {content}
        </BubbleContent>
      </Bubble>
    ) : (
      <div class={cls().body} data-slot="message-item-body">
        {content}
      </div>
    );
  };

  return (
    <article
      ref={article.set}
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="message-item"
      data-message-id={message().id}
      data-grouped={props.grouped === true ? "" : undefined}
      data-state={state()}
      data-editing={editing() ? "" : undefined}
      data-own={own() ? "" : undefined}
      aria-labelledby={`${nameId} ${timeId}`}
      aria-busy={state() === "pending" ? "true" : undefined}
      aria-posinset={props["aria-posinset"]}
      aria-setsize={props["aria-setsize"]}
      tabIndex={props.tabIndex}
      {...longPressProps}
    >
      <Message class={cls().message} align={align()}>
        <MessageAvatar class={cls().avatar} data-slot="message-item-avatar">
          <Show
            when={props.grouped !== true}
            fallback={
              <span class={cls().gutter} aria-hidden="true">
                <FormattedDate
                  value={message().createdAt}
                  timeZone={props.timeZone}
                  options={{ timeStyle: "short" }}
                />
              </span>
            }
          >
            <PersonAvatar person={message().author} size="default" />
          </Show>
        </MessageAvatar>
        <MessageContent>
          <MessageHeader
            class={arc(cls().header, props.grouped === true ? srOnly : undefined)}
            data-slot="message-item-header"
          >
            <span id={nameId} class={cls().author} data-slot="message-item-author">
              {message().author.name}
            </span>
            <span id={timeId} class={cls().time} data-slot="message-item-time">
              <FormattedDate
                value={message().createdAt}
                timeZone={props.timeZone}
                options={{ dateStyle: "medium", timeStyle: "short" }}
              />
            </span>
            <Show when={message().editedAt !== undefined}>
              <span class={cls().edited} data-slot="message-item-edited">
                {messages().edited}
              </span>
            </Show>
            <Show when={message().pinned === true}>
              <span class={cls().pinned} data-slot="message-item-pinned">
                <Pin aria-hidden="true" size={12} />
                {messages().pinned}
              </span>
            </Show>
          </MessageHeader>
          {body()}
          <Show when={(message().attachments?.length ?? 0) > 0}>
            <MessageAttachments
              attachments={message().attachments ?? []}
              classes={cls()}
              label={messages().attachments}
            />
          </Show>
          <Show
            when={
              settled() && ((message().reactions?.length ?? 0) > 0 || props.onReact !== undefined)
            }
          >
            <ReactionBar
              class={cls().reactions}
              slot="message-item-reactions"
              reactions={message().reactions ?? []}
              onReact={props.onReact === undefined ? undefined : react}
              picker={(pick) => (
                <EmojiButton
                  label={messages().addReaction}
                  source={props.emojiSource}
                  onSelect={pick}
                  size="xs"
                >
                  <SmilePlus aria-hidden="true" />
                </EmojiButton>
              )}
            />
          </Show>
          <Show when={(message().thread?.count ?? 0) > 0}>
            <button
              type="button"
              class={cls().thread}
              data-slot="message-item-thread"
              onClick={openThread}
            >
              <AvatarStack
                people={message().thread?.participants ?? []}
                max={3}
                size="sm"
                aria-label=""
              />
              <span class={cls().threadCount}>
                {messages().replyCount(message().thread?.count ?? 0)}
              </span>
              <Show when={message().thread?.lastReplyAt !== undefined}>
                <span>
                  {`${messages().lastReply} `}
                  <RelativeTime value={message().thread?.lastReplyAt ?? 0} now={props.now} />
                </span>
              </Show>
            </button>
          </Show>
          <Show when={state() !== "sent"}>
            <div class={cls().state} data-slot="message-item-state" role="status">
              <Show when={state() === "failed"} fallback={messages().sending}>
                <span class={cls().error}>{message().error ?? messages().notSent}</span>
                <Show when={props.onRetry !== undefined}>
                  <Button variant="outline" size="xs" onPress={() => props.onRetry?.(message())}>
                    {messages().retry}
                  </Button>
                </Show>
                <Show when={props.onDiscard !== undefined}>
                  <Button variant="ghost" size="xs" onPress={() => props.onDiscard?.(message())}>
                    {messages().discard}
                  </Button>
                </Show>
              </Show>
            </div>
          </Show>
        </MessageContent>
      </Message>
      <Show when={hasActions() && !editing()}>
        <div
          class={cls().actions}
          data-slot="message-item-actions"
          data-open={picking() || menu() ? "" : undefined}
        >
          <Toolbar aria-label={messages().messageActions(message().author.name)}>
            <Show when={props.onReact !== undefined}>
              <EmojiButton
                label={messages().addReaction}
                source={props.emojiSource}
                open={picking()}
                onOpenChange={setPicking}
                onSelect={(emoji) => {
                  const held = message().reactions?.find((one) => one.emoji === emoji);
                  if (held?.reacted !== true) react(emoji, true);
                }}
              >
                <SmilePlus aria-hidden="true" />
              </EmojiButton>
            </Show>
            <Show when={props.onReply !== undefined}>
              <IconButton
                label={messages().replyInThread}
                variant="ghost"
                size="sm"
                tooltip={false}
                onPress={() => props.onReply?.(message())}
              >
                <MessageSquare aria-hidden="true" />
              </IconButton>
            </Show>
            <Show when={canEdit()}>
              <IconButton
                label={messages().editMessage}
                variant="ghost"
                size="sm"
                tooltip={false}
                onPress={() => props.onEdit?.(message())}
              >
                <Pencil aria-hidden="true" />
              </IconButton>
            </Show>
            <Show when={hasMenu()}>
              <DropdownMenu isOpen={menu()} onOpenChange={setMenu}>
                <DropdownMenuTrigger>
                  <IconButton
                    label={messages().moreActions}
                    variant="ghost"
                    size="sm"
                    tooltip={false}
                  >
                    <Ellipsis aria-hidden="true" />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent aria-label={messages().moreActions}>
                  <Show when={props.linkTo !== undefined}>
                    <DropdownMenuItem id="copy-link" onAction={() => void copyLink()}>
                      {messages().copyLink}
                    </DropdownMenuItem>
                  </Show>
                  <Show when={props.onPin !== undefined}>
                    <DropdownMenuItem
                      id="pin"
                      onAction={() => props.onPin?.(message(), message().pinned !== true)}
                    >
                      {message().pinned === true ? messages().unpinMessage : messages().pinMessage}
                    </DropdownMenuItem>
                  </Show>
                  <Show when={canDelete()}>
                    <DropdownMenuItem
                      id="delete"
                      variant="destructive"
                      onAction={() => void remove()}
                    >
                      {messages().deleteMessage}
                    </DropdownMenuItem>
                  </Show>
                </DropdownMenuContent>
              </DropdownMenu>
            </Show>
          </Toolbar>
        </div>
      </Show>
      <ResponsiveOverlay
        heading={messages().messageActions(message().author.name)}
        open={sheet()}
        onOpenChange={setSheet}
      >
        <div class={cls().sheet} data-slot="message-item-sheet">
          <Show when={props.onReact !== undefined}>
            <div class={cls().quick} role="group" aria-label={messages().addReaction}>
              <For each={props.quickReactions ?? QUICK_REACTIONS}>
                {(emoji: string) => (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={emoji}
                    onPress={() => {
                      setSheet(false);
                      const held = message().reactions?.find((one) => one.emoji === emoji);
                      if (held?.reacted !== true) react(emoji, true);
                    }}
                  >
                    {emoji}
                  </Button>
                )}
              </For>
            </div>
          </Show>
          <Show when={props.onReply !== undefined}>
            <Button
              variant="ghost"
              onPress={() => {
                setSheet(false);
                props.onReply?.(message());
              }}
            >
              <MessageSquare aria-hidden="true" />
              {messages().replyInThread}
            </Button>
          </Show>
          <Show when={canEdit()}>
            <Button
              variant="ghost"
              onPress={() => {
                setSheet(false);
                props.onEdit?.(message());
              }}
            >
              <Pencil aria-hidden="true" />
              {messages().editMessage}
            </Button>
          </Show>
          <Show when={props.linkTo !== undefined}>
            <Button
              variant="ghost"
              onPress={() => {
                setSheet(false);
                void copyLink();
              }}
            >
              {messages().copyLink}
            </Button>
          </Show>
          <Show when={props.onPin !== undefined}>
            <Button
              variant="ghost"
              onPress={() => {
                setSheet(false);
                props.onPin?.(message(), message().pinned !== true);
              }}
            >
              <Pin aria-hidden="true" />
              {message().pinned === true ? messages().unpinMessage : messages().pinMessage}
            </Button>
          </Show>
          <Show when={canDelete()}>
            <Button
              variant="destructive"
              onPress={() => {
                setSheet(false);
                void remove();
              }}
            >
              {messages().deleteMessage}
            </Button>
          </Show>
        </div>
      </ResponsiveOverlay>
    </article>
  );
}

/**
 * The files sent with a message: pictures in a `Gallery` that opens the
 * `Lightbox`, audio and video in `MediaPlayer`, the rest as cards that
 * download.
 */
export function MessageAttachments(props: {
  attachments: readonly ChatAttachment[];
  classes?: Slots;
  label?: string;
}) {
  const own = (): Slots => props.classes ?? messageItemStyles();
  const messages = useArcMessages();
  const images = () => props.attachments.filter((one) => one.kind === "image");
  const players = () =>
    props.attachments.filter((one) => one.kind === "video" || one.kind === "audio");
  const files = () => props.attachments.filter((one) => one.kind === "file");
  return (
    <div
      class={own().attachments}
      data-slot="message-item-attachments"
      role="group"
      aria-label={props.label ?? messages().attachments}
    >
      <Show when={images().length > 0}>
        <Gallery
          aria-label={props.label ?? messages().attachments}
          minItemWidth="7rem"
          images={images().map((one) => ({
            src: one.url,
            thumbnail: one.thumbnail,
            alt: one.alt ?? one.name,
          }))}
        />
      </Show>
      <For each={players}>
        {(one: ChatAttachment) => (
          <MediaPlayer
            kind={one.kind === "audio" ? "audio" : "video"}
            title={one.name}
            src={one.mimeType === undefined ? one.url : [{ src: one.url, type: one.mimeType }]}
            poster={one.thumbnail}
          />
        )}
      </For>
      <For each={files}>
        {(one: ChatAttachment) => (
          <Attachment class={own().file} data-slot="message-item-file">
            <AttachmentMedia>
              <FileText aria-hidden="true" />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>
                <a
                  href={one.url}
                  download={one.name}
                  aria-label={messages().downloadFile(one.name)}
                >
                  {one.name}
                </a>
              </AttachmentTitle>
              <Show when={one.size !== undefined}>
                <AttachmentDescription>
                  <Bytes value={one.size ?? 0} />
                </AttachmentDescription>
              </Show>
            </AttachmentContent>
          </Attachment>
        )}
      </For>
    </div>
  );
}
