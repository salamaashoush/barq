import { type Child, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { edge, gap, layout, place, space, type } from "../style/index.ts";
import type { Person } from "../components/avatar-stack.tsx";
import { useArcMessages } from "../components/messages.ts";
import { MessageItem } from "./message-item.tsx";
import { MessageList, messageListStyles } from "./message-list.tsx";
import type { ChatMessage, MessageHandlers } from "./model.ts";
import { TypingIndicator } from "./typing-indicator.tsx";

export const threadPanelStyles = variants({
  slots: {
    root: arc(layout.column, layout.minZeroBlock, place.fill, gap[1]),
    context: arc(type.meta, { paddingInline: space.x3 }),
    parent: arc(layout.noShrink),
    divider: arc(messageListStyles().separator),
    replies: arc(layout.grow, layout.minZeroBlock, layout.column),
    typing: arc({ paddingInline: space.x3 }),
    composer: arc(layout.noShrink, edge.top, { paddingBlockStart: space.x2 }),
  },
});

type Slots = ReturnType<typeof threadPanelStyles>;

export interface ThreadPanelProps extends MessageHandlers, Customisable<Slots> {
  /** The message the thread hangs off. */
  parent: ChatMessage;
  /** Its replies, oldest first. */
  replies: readonly ChatMessage[];
  /** Where the thread is, above the parent: "in #design". */
  context?: Child;
  /** Who is typing a reply. */
  typing?: readonly Pick<Person, "name">[];
  /** The reply composer, at the foot. In a `DockedPanel` it may go in the panel's `footer` instead. */
  composer?: Child;
  hasOlder?: boolean;
  isLoadingOlder?: boolean;
  onLoadOlder?: () => void;
  unreadFrom?: string;
  /** @default "plain" */
  appearance?: "plain" | "bubble";
}

/**
 * A message's thread: the message itself, a line counting the replies, the
 * replies as a `MessageList`, who is typing and a composer.
 *
 * ```tsx
 * <DockedPanels
 *   active={thread() === null ? null : "thread"}
 *   onActiveChange={(id) => id === null && closeThread()}
 *   panels={[{
 *     id: "thread",
 *     label: "Thread",
 *     content: () => <ThreadPanel parent={parent()} replies={replies()} currentUserId={me.id} />,
 *     footer: () => <ChatComposer onSend={reply} />,
 *   }]}
 * >
 *   <MessageList … onReply={(message) => openThread(message.id)} />
 * </DockedPanels>
 * ```
 *
 * In `DockedPanels` it docks beside the conversation on a wide screen and is
 * a sheet over it on a phone, with the panel's heading, close button and
 * Escape. The replies keep everything `MessageList` does: their place as
 * older ones load, the newest followed, the keyboard and the announcements.
 */
export function ThreadPanel(props: ThreadPanelProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(threadPanelStyles(), props.classes);
  }
  function parent(): ChatMessage {
    return { ...props.parent, thread: undefined };
  }
  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="thread-panel">
      <Show when={props.context !== undefined}>
        <p class={cls().context} data-slot="thread-panel-context">
          {props.context}
        </p>
      </Show>
      <div class={cls().parent} data-slot="thread-panel-parent">
        <MessageItem {...props} message={parent()} class={undefined} classes={undefined} />
      </div>
      <Show when={props.replies.length > 0}>
        <div class={cls().divider} data-slot="thread-panel-divider" role="separator">
          {messages().replyCount(props.replies.length)}
        </div>
      </Show>
      <div class={cls().replies} data-slot="thread-panel-replies">
        <Show when={props.replies.length > 0 || props.hasOlder === true}>
          <MessageList
            {...props}
            class={undefined}
            classes={undefined}
            aria-label={messages().replyCount(props.replies.length)}
            messages={props.replies}
            onReply={undefined}
            onOpenThread={undefined}
          />
        </Show>
      </div>
      <Show when={(props.typing?.length ?? 0) > 0}>
        <TypingIndicator class={cls().typing} people={props.typing ?? []} />
      </Show>
      <Show when={props.composer !== undefined}>
        <div class={cls().composer} data-slot="thread-panel-composer">
          {props.composer}
        </div>
      </Show>
    </div>
  );
}
