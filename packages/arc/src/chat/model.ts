import type { Child } from "@barqjs/core";

import type { Person } from "../components/avatar-stack.tsx";
import type { Moment } from "../components/format.tsx";
import type { Reaction } from "../components/reactions.tsx";
import type { DocumentValue } from "../editor/document.ts";
import type { EmojiSource } from "./emoji-data.ts";

/** Someone who writes in a conversation. */
export interface ChatPerson extends Person {
  id: string;
}

/** A file sent with a message. */
export interface ChatAttachment {
  id: string;
  /** How it is drawn: in the picture grid, in a player, or as a file card. */
  kind: "image" | "video" | "audio" | "file";
  name: string;
  url: string;
  /** In bytes. */
  size?: number;
  mimeType?: string;
  /** A smaller picture for the grid, or a video's poster. */
  thumbnail?: string;
  /** What an image shows. @default its `name` */
  alt?: string;
}

/** The replies under a message. */
export interface ThreadSummary {
  count: number;
  /** Who replied, most recent first. */
  participants: readonly Person[];
  lastReplyAt?: Moment;
}

/** Where a message is on its way: sent, still going, or refused. */
export type DeliveryState = "sent" | "pending" | "failed";

export interface ChatMessage {
  id: string;
  author: ChatPerson;
  createdAt: Moment;
  editedAt?: Moment;
  /** Plain text, written as it is with its line breaks. */
  body?: string;
  /** Rich content, what `RichTextEditor` and `ChatComposer` store, drawn by `RichTextRenderer`. */
  content?: DocumentValue;
  attachments?: readonly ChatAttachment[];
  reactions?: readonly Reaction[];
  thread?: ThreadSummary;
  /** @default "sent" */
  state?: DeliveryState;
  pinned?: boolean;
  /** Why it was refused, shown beside Retry. */
  error?: string;
}

/** What a list of messages hands every item: the reader, and what each can do. */
export interface MessageHandlers {
  /** The reader: their own messages can be edited and deleted. */
  currentUserId?: string;
  /** Whether the reader may edit and delete a message. @default their own */
  canModify?: (message: ChatMessage) => boolean;
  /** A message's body drawn by the app. @default its `content` through `RichTextRenderer`, or its `body` as text */
  renderBody?: (message: ChatMessage) => Child;
  onReact?: (message: ChatMessage, emoji: string, add: boolean) => void;
  onReply?: (message: ChatMessage) => void;
  onEdit?: (message: ChatMessage) => void;
  /** The message being edited, whose body `renderEditor` replaces. */
  editingId?: string;
  /** The editor drawn in place of the body of the message being edited: `MessageEditor`, from `@barqjs/arc/editor`. */
  renderEditor?: (message: ChatMessage) => Child;
  onDelete?: (message: ChatMessage) => void;
  onPin?: (message: ChatMessage, pinned: boolean) => void;
  /** The address of a message, which Copy link puts on the clipboard. */
  linkTo?: (message: ChatMessage) => string;
  /** A thread summary was pressed. @default `onReply` */
  onOpenThread?: (message: ChatMessage) => void;
  onRetry?: (message: ChatMessage) => void;
  onDiscard?: (message: ChatMessage) => void;
  /** Where the add-reaction picker's emoji come from. @default English, from emojibase */
  emojiSource?: EmojiSource;
  /** The moment times are measured from on the server and while hydrating. */
  now?: Moment;
  /** The zone times are written in. @default the reader's */
  timeZone?: string;
}

export const time = (moment: Moment): number =>
  moment instanceof Date ? moment.getTime() : new Date(moment).getTime();
