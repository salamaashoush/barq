import type { Demos } from "../../gallery/types.ts";
import AiChat from "./ai-chat.tsx";
import aiChat from "./ai-chat.tsx?raw";
import Calls from "./calls.tsx";
import calls from "./calls.tsx?raw";
import Conversation from "./conversation.tsx";
import conversation from "./conversation.tsx?raw";
import ConversationList from "./conversation-list.tsx";
import conversationList from "./conversation-list.tsx?raw";
import Emoji from "./emoji.tsx";
import emoji from "./emoji.tsx?raw";
import MessageHistory from "./message-history.tsx";
import messageHistory from "./message-history.tsx?raw";
import MessageItems from "./message-items.tsx";
import messageItems from "./message-items.tsx?raw";

export const demos: Demos = {
  conversation: { component: Conversation, code: conversation },
  "message-items": { component: MessageItems, code: messageItems },
  emoji: { component: Emoji, code: emoji },
  "conversation-list": { component: ConversationList, code: conversationList },
  "ai-chat": { component: AiChat, code: aiChat },
  calls: { component: Calls, code: calls },
  "message-history": { component: MessageHistory, code: messageHistory },
};
