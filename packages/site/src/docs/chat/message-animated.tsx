import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Bubble,
  BubbleContent,
  Message,
  MessageContent,
  MessageScrollerItem,
  type BubbleVariant,
} from "@barqjs/ui";

import type { ChatMessage } from "./chat.ts";
import { MESSAGE_ANIMATIONS, type MessageAnimation } from "./message-animations.ts";

const paragraphs = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
`;

const paragraph = css`
  white-space: pre-wrap;
`;

const still = css`
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export interface MessageAnimatedProps {
  message: ChatMessage;
  scrollAnchor?: boolean;
  animation?: MessageAnimation;
  userVariant?: BubbleVariant;
  assistantVariant?: BubbleVariant;
}

/** A chat row: the bubble, its paragraphs, and an entrance for the user's own. */
export function MessageAnimated(props: MessageAnimatedProps) {
  function isUser(): boolean {
    return props.message.role === "user";
  }
  function parts(): string[] {
    return props.message.text
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return (
    <MessageScrollerItem
      messageId={props.message.id}
      scrollAnchor={props.scrollAnchor ?? isUser()}
      class={isUser() ? `${(props.animation ?? MESSAGE_ANIMATIONS[1]).class} ${still}` : undefined}
    >
      <Message align={isUser() ? "end" : "start"}>
        <MessageContent>
          <Bubble
            variant={
              isUser() ? (props.userVariant ?? "muted") : (props.assistantVariant ?? "ghost")
            }
          >
            <BubbleContent class={paragraphs}>
              <For each={parts()}>{(text: string) => <p class={paragraph}>{text}</p>}</For>
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
}
