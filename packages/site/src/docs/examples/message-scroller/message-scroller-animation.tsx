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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  srOnly,
} from "@barqjs/ui";

import { createChat, useChat, type ChatMessage } from "../../chat/chat.ts";
import { MessageAnimated } from "../../chat/message-animated.tsx";
import { MESSAGE_ANIMATIONS, type MessageAnimation } from "../../chat/message-animations.ts";

const script = createChat()
  .user("Can user messages pop in like iMessage without breaking anchoring?")
  .sleep(1000)
  .assistant(
    "Yes. Animate the user row with transform and opacity, and let the assistant response stream normally below it.\n\nThat keeps the row measurement predictable while still giving the newly sent bubble a more tactile entrance.",
  )
  .user("What makes the animation feel more like iMessage?")
  .sleep(1000)
  .assistant(
    "Use a quick spring from the trailing edge: a little scale, a small upward move, and no layout animation.\n\nThe bubble feels tactile, but the measured row stays predictable, so anchoring and auto-scroll do not have to fight a changing layout.",
  )
  .user("Can I switch between presets while testing the same thread?")
  .sleep(1000)
  .assistant(
    "Yes. Keep the conversation in place while you change the preset, then send the next message to compare the new entrance against the same context.\n\nThat makes it easier to judge the difference between a subtle fade, a snappy pop, and a more dramatic 3D tilt without rebuilding the scenario each time.",
  );

const initialMessages = script.get(0);
const transport = script.transport({ delayMs: 15 });

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
  border-top: 1px solid var(--border);
`;

const end = css`
  margin-inline-start: auto;
`;

export default function MessageScrollerAnimation() {
  const chat = useChat({ chat: script, messages: initialMessages, transport });
  const [presetId, setPresetId] = createSignal<MessageAnimation["id"]>("fade");
  const next = (): ChatMessage | undefined => script.next(chat.messages());
  const isBusy = (): boolean => chat.status() === "submitted" || chat.status() === "streaming";
  const preset = (): MessageAnimation =>
    MESSAGE_ANIMATIONS.find((animation) => animation.id === presetId()) ?? MESSAGE_ANIMATIONS[0];

  return (
    <div class={shell}>
      <Card class={card}>
        <CardHeader class={header}>
          <CardTitle>Animation</CardTitle>
          <CardDescription>
            Choose how user messages are animated when they are added to the conversation.
          </CardDescription>
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Reset animated messages"
              disabled={chat.messages().length === 0 || isBusy()}
              onPress={() => chat.setMessages(initialMessages)}
            >
              <RotateCw />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent class={body}>
          <Show
            when={chat.messages().length > 0}
            fallback={
              <Empty class={fill}>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MessageCircleDashed />
                  </EmptyMedia>
                  <EmptyTitle>No Messages Yet</EmptyTitle>
                  <EmptyDescription>
                    Click the button below to send the first message.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            }
          >
            <MessageScrollerProvider>
              <MessageScroller class={fill}>
                <MessageScrollerViewport>
                  <MessageScrollerContent aria-busy={isBusy()} class={log}>
                    <For each={chat.messages()}>
                      {(message: ChatMessage) => (
                        <MessageAnimated
                          message={message}
                          animation={preset()}
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
          <Select
            value={presetId()}
            onValueChange={(value: string) => setPresetId(value as MessageAnimation["id"])}
          >
            <SelectTrigger aria-label="Animation preset">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" side="top" position="popper">
              <SelectGroup>
                <For each={MESSAGE_ANIMATIONS}>
                  {(animation: MessageAnimation) => (
                    <SelectItem value={animation.id}>{animation.name}</SelectItem>
                  )}
                </For>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="icon"
            class={end}
            disabled={next() === undefined || isBusy()}
            onPress={() => {
              const message = next();
              if (message === undefined || isBusy()) return;
              void chat.sendMessage(message);
            }}
          >
            <ArrowUp />
            <span class={srOnly}>Send Message</span>
          </Button>
        </CardFooter>
      </Card>
      <div class={caption}>Select an animation then click send to see it in action.</div>
    </div>
  );
}
