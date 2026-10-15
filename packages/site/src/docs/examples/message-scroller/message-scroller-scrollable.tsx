import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Bubble,
  BubbleContent,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Message,
  MessageContent,
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScrollerScrollable,
} from "@barqjs/ui";

import type { ChatMessage } from "../../chat/chat.ts";

const messages: ChatMessage[] = Array.from({ length: 12 }, (_, index) => ({
  id: `scrollable-${index + 1}`,
  role: index % 2 === 0 ? "user" : "assistant",
  text:
    index % 2 === 0
      ? `Review scroll checkpoint ${index + 1}.`
      : `Checkpoint ${index + 1} is synced. The scrollable hook updates as the viewport moves.\n\nWhen the reader is at the first message, the footer should only point them down. Once they move into the middle of the transcript, it should explain that both directions are available.\n\nAt the latest message, the footer should switch again and only point them back up.`,
}));

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

const paragraphs = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
`;

const paragraph = css`
  white-space: pre-wrap;
`;

const split = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

const status = css`
  justify-content: center;
  border-top: 1px solid var(--border);
  text-align: center;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

function scrollStatus(edges: { start: boolean; end: boolean }): string {
  if (edges.start && edges.end) return "You can scroll both ways.";
  if (edges.end) return "You are at the top. You can only scroll down.";
  if (edges.start) return "You are at the bottom. You can only scroll up.";
  return "All messages fit in the viewport.";
}

function ScrollStateFooter() {
  const scrollable = useMessageScrollerScrollable();
  return <CardFooter class={status}>{scrollStatus(scrollable())}</CardFooter>;
}

export default function MessageScrollerScrollable() {
  return (
    <div class={shell}>
      <Card class={card}>
        <CardHeader class={header}>
          <CardTitle>Scroll Status</CardTitle>
          <CardDescription>
            Where the reader can go scroll to based on current scroll position.
          </CardDescription>
        </CardHeader>
        <MessageScrollerProvider defaultScrollPosition="start">
          <CardContent class={body}>
            <MessageScroller class={fill}>
              <MessageScrollerViewport>
                <MessageScrollerContent class={log}>
                  <For each={messages}>
                    {(message: ChatMessage) => (
                      <MessageScrollerItem
                        messageId={message.id}
                        scrollAnchor={message.role === "user"}
                      >
                        <Message align={message.role === "user" ? "end" : "start"}>
                          <MessageContent>
                            <Bubble variant={message.role === "user" ? "muted" : "ghost"}>
                              <BubbleContent class={paragraphs}>
                                <For each={split(message.text)}>
                                  {(text: string) => <p class={paragraph}>{text}</p>}
                                </For>
                              </BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    )}
                  </For>
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </CardContent>
          <ScrollStateFooter />
        </MessageScrollerProvider>
      </Card>
      <div class={caption}>Scroll the transcript to see the footer update.</div>
    </div>
  );
}
