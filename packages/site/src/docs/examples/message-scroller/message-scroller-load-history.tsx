import { For, createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { RotateCw } from "@barqjs/lucide/icons/rotate-cw";
import {
  Bubble,
  BubbleContent,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Marker,
  MarkerContent,
  Message,
  MessageContent,
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  toast,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@barqjs/ui";

import { createChat, type ChatMessage } from "../../chat/chat.ts";

const script = createChat()
  .user("Can you summarize the incident channel?")
  .assistant(
    "The first alert was a delayed export job. It started backing up around 09:42 UTC and triggered the warning once the retry queue crossed the threshold.\n\nNo customer-facing checkout paths were affected, but exports for larger workspaces were running about 12 minutes behind.",
  )
  .user("Was checkout affected?")
  .assistant(
    "No checkout errors were reported. Payment authorization, order creation, and confirmation emails stayed inside their normal latency bands.\n\nThe only elevated metric was export queue depth, which maps to analytics downloads instead of checkout.",
  )
  .user("What changed in the last deploy?")
  .assistant(
    "Only the export queue worker changed. The deploy moved large CSV jobs onto the shared retry policy, which made each failed attempt hold a worker slot longer than before.\n\nThe app deploy did not include checkout, pricing, or billing API changes.",
  )
  .user("Do we need to roll back?")
  .assistant(
    "Not yet. Queue depth is recovering after we reduced retry concurrency, and the oldest pending job is now under five minutes old.\n\nKeep rollback ready if the queue starts climbing again, but the current trend points toward recovery.",
  )
  .user("Keep watching for customer-visible issues.")
  .assistant(
    "I will watch the queue and support tags for another 15 minutes. I am tracking export failures, delayed download requests, and any support thread that mentions missing reports.\n\nIf those stay quiet through the next batch window, we can close this as an internal degradation.",
  );

const history = script.get();
const INITIAL_VISIBLE_COUNT = 5;

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
  flex-direction: column;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  border-top: 1px solid var(--border);
`;

const full = css`
  width: 100%;
`;

const hint = css`
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--muted-foreground);
`;

export default function MessageScrollerLoadHistory() {
  const [visibleCount, setVisibleCount] = createSignal(INITIAL_VISIBLE_COUNT);
  const visibleMessages = (): ChatMessage[] => history.slice(-visibleCount());
  const canLoadHistory = (): boolean => visibleCount() < history.length;

  return (
    <MessageScrollerProvider>
      <div class={shell}>
        <Card class={card}>
          <CardHeader class={header}>
            <CardTitle>Load History</CardTitle>
            <CardDescription>Prepended messages keep your place.</CardDescription>
            <CardAction>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Reset loaded messages"
                    onPress={() => setVisibleCount(INITIAL_VISIBLE_COUNT)}
                    disabled={visibleCount() === INITIAL_VISIBLE_COUNT}
                  >
                    <RotateCw />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reset</p>
                </TooltipContent>
              </Tooltip>
            </CardAction>
          </CardHeader>
          <CardContent class={body}>
            <MessageScroller class={fill}>
              <MessageScrollerViewport>
                <MessageScrollerContent class={log}>
                  <For each={visibleMessages()}>
                    {(message: ChatMessage) => (
                      <MessageScrollerItem messageId={message.id} scrollAnchor={false}>
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
                  <MessageScrollerItem scrollAnchor={false}>
                    <Marker variant="separator">
                      <MarkerContent>End of Conversation</MarkerContent>
                    </Marker>
                  </MessageScrollerItem>
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </CardContent>
          <CardFooter class={footer}>
            <Button
              type="button"
              disabled={!canLoadHistory()}
              onPress={() => {
                setVisibleCount(history.length);
                toast("History loaded", { description: "Scroll up to see earlier messages." });
              }}
              class={full}
              variant="secondary"
            >
              {canLoadHistory() ? "Load History" : "History Loaded"}
            </Button>
            <p class={hint}>Restore earlier messages while keeping your place.</p>
          </CardFooter>
        </Card>
        <div class={caption}>Click Load History to load the entire conversation</div>
      </div>
    </MessageScrollerProvider>
  );
}
