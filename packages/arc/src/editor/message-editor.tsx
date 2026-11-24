import { untrack } from "@barqjs/core";
import { $createLineBreakNode, $createParagraphNode, $createTextNode, $getRoot } from "lexical";

import type { EmojiSource } from "../chat/emoji-data.ts";
import type { ChatMessage } from "../chat/model.ts";
import { useArcMessages } from "../components/messages.ts";
import { ChatComposer, type ChatComposerProps, type ComposedMessage } from "./chat-composer.tsx";
import type { MentionSource } from "./typeahead.tsx";

export interface MessageEditorProps extends Pick<
  ChatComposerProps,
  "class" | "className" | "classes"
> {
  /** The message being edited: its rich `content`, or its plain `body`. */
  message: ChatMessage;
  /** Saves the change. A promise holds the editor until it settles; a rejection keeps it open. */
  onSave: (message: ChatMessage, edited: ComposedMessage) => void | Promise<unknown>;
  /** Leaves the edit with nothing saved: Cancel, or Escape. */
  onCancel: () => void;
  /** Names the text box. @default arc's "Editing message" */
  label?: string;
  mentions?: MentionSource;
  emojiSource?: EmojiSource;
  maxLength?: number;
}

/**
 * A sent message edited in place: `ChatComposer` in its edit mode, opened
 * on the message's own content, for `MessageItem`'s `editor` or a list's
 * `renderEditor`.
 *
 * ```tsx
 * <MessageList
 *   messages={messages()}
 *   onEdit={(message) => setEditing(message.id)}
 *   editingId={editing()}
 *   renderEditor={(message) => (
 *     <MessageEditor
 *       message={message}
 *       onSave={(message, edited) => api.edit(message.id, edited.value).then(() => setEditing(undefined))}
 *       onCancel={() => setEditing(undefined)}
 *     />
 *   )}
 * />
 * ```
 *
 * Enter saves and Escape cancels, as the line above the box says; the caret
 * starts at the end, and focus goes back to the message once the edit ends.
 */
export function MessageEditor(props: MessageEditorProps) {
  const messages = useArcMessages();
  const opening = untrack(() => props.message);
  const plain =
    opening.content === undefined
      ? () => {
          const paragraph = $createParagraphNode();
          (opening.body ?? "").split("\n").forEach((line, at) => {
            if (at > 0) paragraph.append($createLineBreakNode());
            if (line !== "") paragraph.append($createTextNode(line));
          });
          $getRoot().append(paragraph);
        }
      : undefined;
  return (
    <ChatComposer
      class={props.class}
      className={props.className}
      classes={props.classes}
      mode="edit"
      label={props.label ?? messages().editingMessage}
      defaultValue={opening.content}
      initialContent={plain}
      mentions={props.mentions}
      emojiSource={props.emojiSource}
      maxLength={props.maxLength}
      onSend={(edited: ComposedMessage) => props.onSave(props.message, edited)}
      onCancel={() => props.onCancel()}
    />
  );
}
