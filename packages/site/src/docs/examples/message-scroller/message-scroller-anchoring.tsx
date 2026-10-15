import { For, Show, createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ArrowUp } from "@barqjs/lucide/icons/arrow-up";
import { MessageCircleDashed } from "@barqjs/lucide/icons/message-circle-dashed";
import { RotateCw } from "@barqjs/lucide/icons/rotate-cw";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
  srOnly,
  ToggleGroup,
  ToggleGroupItem,
} from "@barqjs/ui";

import type { ChatMessage } from "../../chat/chat.ts";
import { MessageAnimated } from "../../chat/message-animated.tsx";

type AnchorRole = "user" | "assistant";

const scriptedMessages: ChatMessage[] = [
  {
    id: "anchor-1-user",
    role: "user",
    text: "Can you show me how anchoring behaves when a new prompt starts the turn?",
  },
  {
    id: "anchor-1-assistant",
    role: "assistant",
    text: "Append the user prompt first, then append the assistant response. With User selected, the prompt settles near the top and the assistant response fills in below it.",
  },
  {
    id: "anchor-2-user",
    role: "user",
    text: "What changes when assistant messages are the anchor?",
  },
  {
    id: "anchor-2-assistant",
    role: "assistant",
    text: "Now each assistant response is the item `MessageScroller` keeps in view. This is useful when the reply is the moment you want readers to land on after each turn.",
  },
  {
    id: "anchor-3-user",
    role: "user",
    text: "Can I switch roles and keep adding turns?",
  },
  {
    id: "anchor-3-assistant",
    role: "assistant",
    text: "Yes. The next appended message with the selected role becomes the anchor, so you can compare user and assistant anchoring without resetting the demo.",
  },
];

const shell = css`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
`;

const card = css`
  margin-inline: auto;
  height: 35rem;
  width: 100%;
  max-width: 24rem;
  gap: 0;
`;

const header = css`
  gap: calc(var(--spacing) * 1);
  border-bottom: 1px solid var(--border);
`;

const body = css`
  min-height: 0;
  flex: 1;
  overflow: hidden;
  padding: 0;
`;

const fill = css`
  height: 100%;
`;

const log = css`
  padding: var(--card-spacing);
`;

const caption = css`
  margin-inline: auto;
  max-width: 24rem;
  padding-inline: calc(var(--spacing) * 0.5);
  text-align: center;
  font-size: 0.75rem;
  line-height: 1rem;
  text-wrap: balance;
  color: var(--muted-foreground);
`;

const footer = css`
  gap: calc(var(--spacing) * 2);
`;

const end = css`
  margin-inline-start: auto;
`;

export default function MessageScrollerAnchoring() {
  const [anchorRole, setAnchorRole] = createSignal<AnchorRole>("user");
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [messageIndex, setMessageIndex] = createSignal(0);
  const nextMessage = (): ChatMessage | undefined => scriptedMessages[messageIndex()];

  const reset = (): void => {
    setMessages([]);
    setMessageIndex(0);
  };

  return (
    <div class={shell}>
      <Card class={card}>
        <CardHeader class={header}>
          <CardTitle>Anchoring Turns</CardTitle>
          <CardDescription>Choose which role settles near the top edge.</CardDescription>
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Reset anchored turns"
              disabled={messages().length === 0}
              onPress={reset}
            >
              <RotateCw />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent class={body}>
          <Show
            when={messages().length > 0}
            fallback={
              <Empty class={fill}>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MessageCircleDashed />
                  </EmptyMedia>
                  <EmptyTitle>No anchored messages yet</EmptyTitle>
                  <EmptyDescription>
                    Send the first message to see the selected role anchor.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            }
          >
            <MessageScrollerProvider>
              <MessageScroller class={fill}>
                <MessageScrollerViewport>
                  <MessageScrollerContent class={log}>
                    <For each={messages()}>
                      {(message: ChatMessage) => (
                        <MessageAnimated
                          message={message}
                          scrollAnchor={message.role === anchorRole()}
                          userVariant="muted"
                          assistantVariant="ghost"
                        />
                      )}
                    </For>
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            </MessageScrollerProvider>
          </Show>
        </CardContent>
        <CardFooter class={footer}>
          <ToggleGroup
            type="single"
            aria-label="Select scroll anchor role"
            value={anchorRole()}
            onValueChange={(value: string | string[]) => {
              if (value === "user" || value === "assistant") {
                setAnchorRole(value);
                reset();
              }
            }}
          >
            <ToggleGroupItem value="user" aria-label="Anchor user messages">
              User
            </ToggleGroupItem>
            <ToggleGroupItem value="assistant" aria-label="Anchor assistant messages">
              Assistant
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            type="button"
            size="icon"
            class={end}
            disabled={nextMessage() === undefined}
            onPress={() => {
              const message = nextMessage();
              if (message === undefined) return;
              setMessages([...messages(), message]);
              setMessageIndex(messageIndex() + 1);
            }}
          >
            <ArrowUp />
            <span class={srOnly}>Send Message</span>
          </Button>
        </CardFooter>
      </Card>
      <div class={caption}>
        Toggle the anchor role, then send messages to compare where turns settle.
      </div>
    </div>
  );
}
