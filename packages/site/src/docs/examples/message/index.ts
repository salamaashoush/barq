import type { Demo } from "../../registry.ts";
import MessageDemo from "./message-demo.tsx";
import messageDemo from "./message-demo.tsx?raw";
import MessageAvatar from "./message-avatar.tsx";
import messageAvatar from "./message-avatar.tsx?raw";
import MessageGroup from "./message-group.tsx";
import messageGroup from "./message-group.tsx?raw";
import MessageHeaderFooter from "./message-header-footer.tsx";
import messageHeaderFooter from "./message-header-footer.tsx?raw";
import MessageActions from "./message-actions.tsx";
import messageActions from "./message-actions.tsx?raw";
import MessageAttachment from "./message-attachment.tsx";
import messageAttachment from "./message-attachment.tsx?raw";

export const demos: readonly Demo[] = [
  {
    size: "auto",
    code: messageDemo,
    component: MessageDemo,
  },
  {
    title: "Avatar",
    note: 'Use `MessageAvatar` to render an avatar next to the message. Set `align="end"` on the message to align the avatar to the end of the message.',
    size: "auto",
    code: messageAvatar,
    component: MessageAvatar,
  },
  {
    title: "Group",
    note: "Use `MessageGroup` to stack consecutive messages from the same sender. Render an empty `MessageAvatar` on the earlier messages to keep them aligned with the avatar on the last one.",
    size: "auto",
    code: messageGroup,
    component: MessageGroup,
  },
  {
    title: "Header and Footer",
    note: "Use `MessageHeader` for a sender name and `MessageFooter` for metadata such as a delivery or read status.",
    size: "auto",
    code: messageHeaderFooter,
    component: MessageHeaderFooter,
  },
  {
    title: "Actions",
    note: "Place message-level actions in `MessageFooter`, such as copy, retry, or feedback buttons.",
    size: "auto",
    code: messageActions,
    component: MessageActions,
  },
  {
    title: "Attachment",
    size: "auto",
    code: messageAttachment,
    component: MessageAttachment,
  },
];
