import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Bubble,
  BubbleContent,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Message,
  MessageContent,
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "@barqjs/ui";

import { createChat, type ChatMessage } from "../../chat/chat.ts";

const script = createChat()
  .user(
    "We're seeing activation dip after workspace creation. Can you help me find the likely step?",
    { id: "command-activation" },
  )
  .assistant(
    "The sharpest drop is between creating the workspace and inviting the first teammate.\n\nWorkspace creation is still healthy, but the invite step is where users pause. That suggests the product is asking for collaboration before the user has enough confidence in the workspace.",
  )
  .user("What should I compare before we change the onboarding flow?", { id: "command-compare" })
  .assistant(
    "Compare three cohorts:\n\n1. Users who choose a template before inviting teammates.\n2. Users who start from a blank workspace.\n3. Users who skip invites and return within 24 hours.\n\nIf template users invite faster, the fix is probably better first-run guidance rather than a louder invite prompt.",
  )
  .user("Can you turn that into an experiment?", { id: "command-experiment" })
  .assistant(
    "Yes. Create a variant that shows a short checklist after workspace creation:\n\n- Pick a template.\n- Add one project detail.\n- Invite a teammate when the workspace has context.\n\nMeasure first invite completion, 24-hour return rate, and whether teams create a second project.",
  )
  .user("What's the risk if we delay the invite prompt?", { id: "command-risk" })
  .assistant(
    "The main risk is reducing team creation for accounts that already know who they want to invite.\n\nTo protect that path, keep the invite action visible in the header and only change the primary empty-state guidance. That gives confident teams a direct route without forcing uncertain users through the invite step too early.",
  );

const messages = script.get();
const userMessages = messages.filter((message) => message.role === "user");

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

const menu = css`
  width: calc(var(--spacing) * 64);
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

function CommandMenu() {
  const { scrollToMessage } = useMessageScroller();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button type="button" variant="secondary">
          Jump to...
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" class={menu}>
        <DropdownMenuLabel>Conversations</DropdownMenuLabel>
        <For each={userMessages}>
          {(message: ChatMessage) => (
            <DropdownMenuItem
              onSelect={() => {
                scrollToMessage(message.id, { align: "start", behavior: "smooth" });
              }}
            >
              <span class={clamp}>{trimmed(message)}</span>
            </DropdownMenuItem>
          )}
        </For>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function MessageScrollerCommands() {
  return (
    <MessageScrollerProvider defaultScrollPosition="end">
      <div class={shell}>
        <Card class={card}>
          <CardHeader class={header}>
            <CardTitle>Commands</CardTitle>
            <CardDescription>Drive the transcript from outside.</CardDescription>
            <CardAction>
              <CommandMenu />
            </CardAction>
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
        <div class={caption}>Use the controls to jump to any message in the conversation.</div>
      </div>
    </MessageScrollerProvider>
  );
}
