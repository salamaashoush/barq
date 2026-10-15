import { For, Show, createSignal, onCleanup, onSettled, type Incoming } from "@barqjs/core";
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
  Tabs,
  TabsList,
  TabsTrigger,
  useMessageScroller,
} from "@barqjs/ui";

import type { ChatMessage } from "../../chat/chat.ts";

type Position = "start" | "end" | "last-anchor";

const messages: ChatMessage[] = [
  {
    id: "open-1",
    role: "user",
    text: "This is the first message the user sent in the conversation.",
  },
  {
    id: "open-2",
    role: "assistant",
    text: "Workspace creation rose 8%, but first invite completion only rose 2%.",
  },
  {
    id: "open-3",
    role: "user",
    text: "This is the last message the user sent in the conversation.",
  },
  {
    id: "open-4",
    role: "assistant",
    text: "Start with the invite step. Teams are creating workspaces but waiting to add collaborators.\n\nRecommended follow-up:\n\n1. Compare invite drop-off by account size.\n2. Check whether users who skip invites still return within 24 hours.\n3. Review the empty-state copy on the first project screen.\n4. Segment activation by template, since template users may not need invites right away.\n\nIf that pattern holds, the next experiment should make collaboration useful earlier instead of prompting for invites harder.",
  },
];

const positions: { value: Position; label: string }[] = [
  { value: "start", label: "start" },
  { value: "end", label: "end" },
  { value: "last-anchor", label: "last-anchor" },
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

const footer = css`
  align-items: center;
  justify-content: center;
  border-top: 1px solid var(--border);
`;

const full = css`
  width: 100%;
`;

function OpeningPositionScroller(props: Incoming<{ position: Position }>) {
  const { scrollToEnd, scrollToMessage, scrollToStart } = useMessageScroller();
  let frame = 0;
  onSettled(() => {
    frame = requestAnimationFrame(() => {
      const position = props.position();
      if (position === "start") {
        scrollToStart({ behavior: "auto" });
        return;
      }
      if (position === "end") {
        scrollToEnd({ behavior: "auto" });
        return;
      }
      scrollToMessage("open-3", { align: "start", behavior: "auto", scrollMargin: 64 });
    });
  });
  onCleanup(() => {
    if (frame !== 0) cancelAnimationFrame(frame);
  });

  return (
    <MessageScroller class={fill}>
      <MessageScrollerViewport>
        <MessageScrollerContent class={log}>
          <For each={messages}>
            {(message: ChatMessage) => (
              <MessageScrollerItem messageId={message.id} scrollAnchor={message.role === "user"}>
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
  );
}

export default function MessageScrollerOpeningPosition() {
  const [position, setPosition] = createSignal<Position>("last-anchor");

  return (
    <div class={shell}>
      <Card class={card}>
        <CardHeader class={header}>
          <CardTitle>Opening Position</CardTitle>
          <CardDescription>Choose where a saved transcript opens.</CardDescription>
        </CardHeader>
        <CardContent class={body}>
          <Show when={position()} keyed>
            {(current: Position) => (
              <MessageScrollerProvider>
                <OpeningPositionScroller position={current} />
              </MessageScrollerProvider>
            )}
          </Show>
        </CardContent>
        <CardFooter class={footer}>
          <Tabs
            value={position()}
            onValueChange={(value: string) => {
              if (value === "start" || value === "end" || value === "last-anchor") {
                setPosition(value);
              }
            }}
            class={full}
          >
            <TabsList class={full}>
              <For each={positions}>
                {(option: (typeof positions)[number]) => (
                  <TabsTrigger value={option.value}>{option.label}</TabsTrigger>
                )}
              </For>
            </TabsList>
          </Tabs>
        </CardFooter>
      </Card>
      <div class={caption}>
        Toggle the defaultScrollPosition to see where the transcript starts when you open the thread
      </div>
    </div>
  );
}
