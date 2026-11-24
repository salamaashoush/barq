import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "chat",
  title: "Chat",
  description:
    "A message list with a long history, threads, conversations, emoji, an AI panel and calls.",
  examples: [
    {
      id: "conversation",
      title: "Conversation",
      description:
        "Nine days of #design, several hundred messages with pictures, files, reactions, threads, edits, a sending and a failed one. Messages sent here reach every other tab on this page through a websocket room, and so does typing.",
      covers: ["MessageList", "ChatComposer", "ThreadPanel", "TypingIndicator", "MessageListApi"],
    },
    {
      id: "message-items",
      title: "Message states",
      description:
        "One message at a time, plain or as bubbles: reactions, edited and pinned, attachments, a thread, sending and failed.",
      covers: ["MessageItem", "MessageAttachments", "ReactionBar"],
    },
    {
      id: "emoji",
      title: "Emoji picker and button",
      description: "The picker inline, and the button that opens it, in English and in Arabic.",
      covers: ["EmojiPicker", "EmojiButton", "arabicEmoji"],
    },
    {
      id: "conversation-list",
      title: "Conversation list",
      description:
        "Channels and direct messages in folding groups: unread and mention counts, muted, private, drafts and presence.",
      covers: ["ConversationList"],
    },
    {
      id: "ai-chat",
      title: "AI chat panel",
      description:
        "A reply streamed a few characters at a time after a tool call, with sources, a change to approve, Stop and Regenerate.",
      covers: ["AIChatPanel", "AIMessage", "AIToolCall"],
    },
    {
      id: "calls",
      title: "Calls",
      description:
        "A call stage of test-card video and avatars, its controls and devices (asked for only when you press Use my devices), the banner, an incoming call and a call window over the page.",
      covers: [
        "CallStage",
        "ParticipantTile",
        "CallControls",
        "CallBanner",
        "IncomingCall",
        "CallWindow",
        "useMediaDevices",
      ],
    },
    {
      id: "message-history",
      title: "Message history",
      description:
        "A conversation over a TanStack DB collection: pages loaded as you scroll up, sends shown at once and kept with Retry when refused.",
      covers: ["useMessageHistory", "MessageList"],
    },
  ],
};
