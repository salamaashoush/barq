import { For, Show, createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ArrowUp } from "@barqjs/lucide/icons/arrow-up";
import { Globe } from "@barqjs/lucide/icons/globe";
import { Image } from "@barqjs/lucide/icons/image";
import { Paperclip } from "@barqjs/lucide/icons/paperclip";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Telescope } from "@barqjs/lucide/icons/telescope";
import { RotateCw } from "@barqjs/lucide/icons/rotate-cw";
import {
  Button,
  Slider,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
  srOnly,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@barqjs/ui";

import { createChat, useChat, type ChatMessage } from "../../chat/chat.ts";
import { MessageAnimated } from "../../chat/message-animated.tsx";

const script = createChat()
  .user(
    "I'm building a chat for our app and the scroll behavior is driving me nuts. Every time the AI streams a reply, the whole thread jumps around.",
  )
  .sleep(1000)
  .assistant(
    "That's the classic streaming scroll problem. Wrap your message list in `MessageScroller` and turn on `autoScroll` — the viewport pins to the bottom as tokens arrive, so users always see the latest text land in place.\n\nThe important part: it only auto-scrolls while the reader is already at the bottom. The moment they scroll up to read something earlier, auto-scroll backs off and their position is preserved. You get smooth streaming without fighting the user's intent.",
  )
  .user(
    "Okay, but when someone sends a new message the view still feels jarring — like the whole conversation reloads from the top.",
  )
  .sleep(1000)
  .assistant(
    "MessageScrollerItem fixes that with turn anchoring. Set `scrollAnchor` on the turn that should settle near the top instead of blindly snapping to the document bottom.\n\nIt also leaves a small peek of the previous exchange visible above the anchor, so context isn't lost. The reply starts in view without that disorienting jump you get from a plain overflow container.",
  )
  .user(
    "And if they've scrolled up to re-read an older answer? I don't want to yank them back down.",
  )
  .sleep(1000)
  .assistant(
    "You won't. Auto-scroll only runs when the viewport is already pinned to the bottom, so scrolling up is a deliberate opt-out — their place in the thread stays put even as new tokens keep arriving below.\n\nWhen there is content they haven't seen yet, `MessageScrollerButton` appears at the bottom of the viewport. One tap jumps them back to the newest message and re-engages auto-scroll. Same pattern as Slack or iMessage: quiet when you're caught up, helpful when you're not.",
  )
  .user("Last one — does this work with assistive tech?")
  .sleep(1000)
  .assistant(
    '`MessageScrollerContent` sets `role="log"` and `aria-relevant="additions"` by default, so screen readers announce new messages as they stream in.\n\nThe scroll button is a real `<button>` with an sr-only label, and it\'s removed from the tab order when you\'re already at the bottom — no ghost focus stops.',
  );

const DEFAULT_PEEK = 64;

const initialMessages = script.get(2);
const transport = script.transport({ delayMs: 35 });

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
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
`;

const form = css`
  width: 100%;
`;

const preview = css`
  height: calc(var(--spacing) * 14);
  width: 100%;
  padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 3);
`;

const queued = css`
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  opacity: 0.6;

  &[data-status="ready"] {
    opacity: 1;
  }
`;

const muted = css`
  color: var(--muted-foreground);
`;

const tools = css`
  padding-top: calc(var(--spacing) * 1);
`;

const menu = css`
  width: calc(var(--spacing) * 44);
`;

const peekControl = css`
  display: flex;
  width: calc(var(--spacing) * 28);
  align-items: center;
  gap: calc(var(--spacing) * 2);
`;

const peekValue = css`
  font-size: 0.75rem;
  line-height: 1rem;
  font-variant-numeric: tabular-nums;
  color: var(--muted-foreground);
`;

const end = css`
  margin-inline-start: auto;
`;

export default function MessageScrollerPreviousContext() {
  const chat = useChat({ chat: script, messages: initialMessages, transport });
  const [peek, setPeek] = createSignal(DEFAULT_PEEK);
  const next = (): ChatMessage | undefined => script.next(chat.messages());
  const isBusy = (): boolean => chat.status() === "submitted" || chat.status() === "streaming";

  return (
    <MessageScrollerProvider scrollMargin={24} scrollPreviousItemPeek={peek()}>
      <div class={shell}>
        <Card class={card}>
          <CardHeader class={header}>
            <CardTitle>Keeping Context Visible</CardTitle>
            <CardDescription>New turns keep part of the previous reply in view.</CardDescription>
            <CardAction>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Reset context example"
                    onPress={() => {
                      chat.setMessages(initialMessages);
                      setPeek(DEFAULT_PEEK);
                    }}
                    disabled={isBusy()}
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
                <MessageScrollerContent aria-busy={isBusy()} class={log}>
                  <For each={chat.messages()}>
                    {(message: ChatMessage) => (
                      <MessageAnimated message={message} scrollAnchor={message.role === "user"} />
                    )}
                  </For>
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </CardContent>
          <CardFooter class={footer}>
            <form
              class={form}
              onSubmit={(event: SubmitEvent) => {
                event.preventDefault();
                const message = next();
                if (message === undefined || isBusy()) return;
                void chat.sendMessage(message);
              }}
            >
              <InputGroup>
                <div class={preview}>
                  <span class={queued} data-status={chat.status()}>
                    <Show
                      when={next()}
                      fallback={<span class={muted}>No messages queued. Reset the context.</span>}
                    >
                      {(message: () => ChatMessage) => message().text}
                    </Show>
                  </span>
                </div>
                <InputGroupAddon align="block-end" class={tools}>
                  <DropdownMenu>
                    <DropdownMenuTrigger>
                      <InputGroupButton
                        aria-label="Add files"
                        type="button"
                        size="icon-sm"
                        variant="outline"
                      >
                        <Plus />
                      </InputGroupButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="top" class={menu}>
                      <DropdownMenuItem>
                        <Paperclip />
                        Add Photos & Files
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <Image />
                        Create Image
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Telescope />
                        Deep Research
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Globe />
                        Web Search
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div class={peekControl}>
                    <span class={peekValue}>{peek()}px</span>
                    <Slider
                      aria-label="Previous context peek"
                      value={[peek()]}
                      min={64}
                      max={128}
                      step={1}
                      disabled={isBusy()}
                      onValueChange={(value: number[]) => setPeek(value[0] ?? DEFAULT_PEEK)}
                    />
                  </div>
                  <InputGroupButton
                    type="submit"
                    variant="default"
                    size="icon-sm"
                    disabled={next() === undefined || isBusy()}
                    class={end}
                  >
                    <ArrowUp />
                    <span class={srOnly}>Send</span>
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </form>
          </CardFooter>
        </Card>
        <div class={caption}>Adjust the slider and send. Observe the previous message peek</div>
      </div>
    </MessageScrollerProvider>
  );
}
