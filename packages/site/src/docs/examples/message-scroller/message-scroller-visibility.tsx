import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Bubble,
  BubbleContent,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Message,
  MessageContent,
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerVisibility,
} from "@barqjs/ui";

import { createChat, type ChatMessage } from "../../chat/chat.ts";

const script = createChat()
  .user("Review the incident handoff and tell me what to read first.", { id: "vis-brief" })
  .assistant(
    "Start with the summary and the impact section. The regression affected the upload queue, but the recovery path completed for every queued job.",
  )
  .user("What was the customer impact?", { id: "vis-impact" })
  .assistant(
    "Impact was limited to delayed processing.\n\nNo records were dropped, and the reconciliation worker confirmed each retry batch. Support saw confusion from two customers, but there were no checkout or billing errors.",
  )
  .user("What actions are open?", { id: "vis-actions" })
  .assistant(
    "Keep the retry window enabled until the next deploy, then add a queue-depth alert as the long-term fix.\n\nThe alert should fire on sustained queue growth, not a single short spike.",
  )
  .user("Give me the follow-up checklist.", { id: "vis-checklist" })
  .assistant(
    "After that, compare the queue recovery graph with the deploy timeline so the handoff shows exactly when processing returned to baseline. That makes it easier for support and engineering to answer the same customer questions without re-reading the whole incident thread.\n\nI would also add a short owner note beside each follow-up item. The checklist is small, but ownership keeps the retry-window decision, alert tuning, and support macro from drifting into separate follow-up conversations.\n\nKeep the retry window enabled until the next deploy, then add a queue-depth alert as the long-term fix.\n\nThe alert should fire on sustained queue growth, not a single short spike.",
  );

const messages = script.get();
const userMessages = messages.filter((message) => message.role === "user");

const shell = css`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
`;

const stage = css`
  position: relative;
  margin-inline: auto;
  width: 100%;
  max-width: 24rem;
`;

const card = css`
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

const rail = css`
  position: absolute;
  top: 50%;
  inset-inline-end: calc(var(--spacing) * -12);
  transform: translateY(-50%);
`;

const outlineButton = css`
  display: flex;
  height: calc(var(--spacing) * 9);
  width: calc(var(--spacing) * 9);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(var(--spacing) * 1);
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  transition: color 150ms;
  outline: none;

  &:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent);
  }
`;

const tick = css`
  height: calc(var(--spacing) * 0.5);
  width: calc(var(--spacing) * 4);
  border-radius: 9999px;
  background-color: color-mix(in oklab, var(--muted-foreground) 40%, transparent);

  &[data-current="true"] {
    background-color: var(--foreground);
  }
`;

const panel = css`
  display: flex;
  width: calc(var(--spacing) * 64);
  flex-direction: column;
  gap: calc(var(--spacing) * 1);
  border-radius: var(--radius-2xl);
  padding: calc(var(--spacing) * 1);
`;

const entry = css`
  display: flex;
  min-height: calc(var(--spacing) * 7);
  align-items: center;
  border: 0;
  border-radius: var(--radius-xl);
  background: transparent;
  padding: calc(var(--spacing) * 1.5) calc(var(--spacing) * 2);
  text-align: start;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: inherit;
  transition:
    color 150ms,
    background-color 150ms;
  outline: none;

  &:hover,
  &:focus-visible,
  &[aria-current] {
    background-color: var(--accent);
    color: var(--accent-foreground);
  }
`;

const clamp = css`
  display: -webkit-box;
  min-width: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
`;

const trimmed = (message: ChatMessage): string =>
  message.text.length > 42 ? `${message.text.slice(0, 39)}...` : message.text;

function TranscriptOutline() {
  const { scrollToMessage } = useMessageScroller();
  const visibility = useMessageScrollerVisibility();
  const current = (): string | null => visibility().currentAnchorId;

  return (
    <HoverCard openDelay={0} closeDelay={0}>
      <HoverCardTrigger
        render={(trigger) => (
          <button
            {...trigger.props}
            ref={trigger.ref}
            type="button"
            aria-label="Open transcript outline"
            class={outlineButton}
          >
            <For each={userMessages}>
              {(message: ChatMessage) => (
                <span class={tick} data-current={message.id === current() ? "true" : "false"} />
              )}
            </For>
          </button>
        )}
      />
      <HoverCardContent align="center" side="left" sideOffset={-28} class={panel}>
        <For each={userMessages}>
          {(message: ChatMessage) => (
            <button
              type="button"
              class={entry}
              aria-current={current() === message.id ? "location" : undefined}
              onClick={() => {
                scrollToMessage(message.id, { align: "start", behavior: "smooth" });
              }}
            >
              <span class={clamp}>{trimmed(message)}</span>
            </button>
          )}
        </For>
      </HoverCardContent>
    </HoverCard>
  );
}

export default function MessageScrollerVisibility() {
  return (
    <MessageScrollerProvider scrollMargin={12}>
      <div class={shell}>
        <div class={stage}>
          <Card class={card}>
            <CardHeader class={header}>
              <CardTitle>Transcript Outline</CardTitle>
              <CardDescription>Track the current anchored turn.</CardDescription>
            </CardHeader>
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
          </Card>
          <div class={rail}>
            <TranscriptOutline />
          </div>
        </div>
        <div class={caption}>Open the outline to jump between anchored turns as you read.</div>
      </div>
    </MessageScrollerProvider>
  );
}
