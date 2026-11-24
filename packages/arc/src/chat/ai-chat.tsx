import { type Child, For, Match, Show, Switch, createSignal, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { ArrowUp } from "@barqjs/lucide/icons/arrow-up";
import { Check } from "@barqjs/lucide/icons/check";
import { CircleAlert } from "@barqjs/lucide/icons/circle-alert";
import { Hand } from "@barqjs/lucide/icons/hand";
import { RotateCcw } from "@barqjs/lucide/icons/rotate-ccw";
import { Square } from "@barqjs/lucide/icons/square";
import { Wrench } from "@barqjs/lucide/icons/wrench";
import { X } from "@barqjs/lucide/icons/x";
import { Button } from "@barqjs/ui/button";
import { Message, MessageContent } from "@barqjs/ui/message";
import { Bubble, BubbleContent } from "@barqjs/ui/bubble";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerViewport,
} from "@barqjs/ui/message-scroller";
import { shimmer } from "@barqjs/ui/shimmer";
import { Spinner } from "@barqjs/ui/spinner";
import { Textarea } from "@barqjs/ui/textarea";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  edge,
  fg,
  gap,
  glyph,
  layout,
  place,
  plainList,
  rounded,
  space,
  surface,
  tone as tones,
  type,
} from "../style/index.ts";
import { CopyButton } from "../components/copy-button.tsx";
import { IconButton } from "../components/icon-button.tsx";
import { useArcMessages } from "../components/messages.ts";
import { RichTextRenderer } from "../editor/renderer.tsx";
import { MessageAttachments } from "./message-item.tsx";
import type { ChatAttachment } from "./model.ts";

/** Where a tool the assistant called is. */
export type AIToolState =
  | "running"
  | "done"
  | "error"
  | "awaiting-approval"
  | "approved"
  | "rejected";

/** A tool the assistant called, or proposes to, in the transcript. */
export interface AIToolCall {
  id: string;
  /** What the tool is called, as the reader would say it: "search the docs". */
  name: string;
  state: AIToolState;
  /** What it was given, shown on request. */
  input?: unknown;
  /** What it answered, or a summary of the change it proposes. */
  output?: Child;
  error?: string;
}

/** Where something the assistant said came from. */
export interface AICitation {
  title: string;
  href: string;
  snippet?: string;
}

export type AIPart = { type: "text"; text: string } | { type: "tool"; call: AIToolCall };

export interface AIMessage {
  id: string;
  role: "user" | "assistant";
  /** In order: markdown text and tool calls, as the reply arrives. */
  parts: readonly AIPart[];
  /** @default "done" */
  status?: "streaming" | "done" | "error" | "stopped";
  error?: string;
  citations?: readonly AICitation[];
  attachments?: readonly ChatAttachment[];
}

export const aiChatStyles = variants({
  slots: {
    root: arc(layout.column, layout.minZeroBlock, place.fill, gap[2]),
    transcript: arc(layout.grow, layout.minZeroBlock),
    content: arc({ paddingInline: space.x3, paddingBlock: space.x3 }),
    message: arc({}),
    text: arc({}),
    tool: arc(surface.bordered, rounded.md, layout.column, gap[1.5], {
      padding: space.x2,
      maxInlineSize: "100%",
    }),
    toolHeader: arc(layout.row, gap[2], type.label, glyph.md, fg.tone),
    toolDetails: arc(type.meta, {
      "& pre": { overflowX: "auto", whiteSpace: "pre-wrap" },
    }),
    toolActions: arc(layout.row, gap[2]),
    status: arc(layout.row, gap[2], type.meta),
    error: arc(layout.row, gap[1.5], type.meta, fg.danger, glyph.sm),
    sources: arc(layout.column, gap[1], type.meta),
    sourceList: arc(plainList, layout.column, gap[0.5], { counterReset: "source" }),
    actions: arc(layout.row, gap[1]),
    empty: arc(layout.column, layout.centre, gap[3], type.meta, { minBlockSize: "100%" }),
    suggestions: arc(plainList, layout.row, layout.wrap, layout.centre, gap[2]),
    composer: arc(layout.row, gap[2], edge.top, {
      alignItems: "flex-end",
      paddingBlockStart: space.x2,
    }),
    input: arc(layout.grow, layout.minZero, { maxBlockSize: "12rem" }),
  },
});

type Slots = ReturnType<typeof aiChatStyles>;

export interface AIChatPanelProps extends Customisable<Slots> {
  messages: readonly AIMessage[];
  /** Names the panel. @default arc's "Assistant" */
  "aria-label"?: string;
  /** The reader sent a message, from the composer or a suggestion. */
  onSend: (text: string) => void;
  /** Stop the reply being written. Shown in place of Send while a reply streams. */
  onStop?: () => void;
  /** Write the last reply again. */
  onRegenerate?: (message: AIMessage) => void;
  onApprove?: (call: AIToolCall, message: AIMessage) => void;
  onReject?: (call: AIToolCall, message: AIMessage) => void;
  /** Offered while the conversation is empty. */
  suggestions?: readonly string[];
  /** Above the suggestions while the conversation is empty. */
  empty?: Child;
  /** In place of the built-in composer: `ChatComposer` from `@barqjs/arc/editor`. */
  composer?: Child;
  /** @default arc's "Message the assistant" */
  placeholder?: string;
}

/**
 * A conversation with an assistant, in a page or a `DockedPanel`: the reply
 * written out as markdown while it streams, the tools it calls as it calls
 * them, proposed changes to approve or reject, sources, Stop, Regenerate and
 * a copy of each reply.
 *
 * ```tsx
 * <AIChatPanel
 *   messages={chat.messages()}
 *   onSend={chat.send}
 *   onStop={chat.stop}
 *   onRegenerate={chat.regenerate}
 *   onApprove={(call) => chat.approve(call.id)}
 *   onReject={(call) => chat.reject(call.id)}
 *   suggestions={["Summarise this page", "What changed this week?"]}
 * />
 * ```
 *
 * The transcript is ui's `MessageScroller`: it follows the reply as it grows
 * until the reader scrolls up, and its log is busy while a reply streams so
 * a screen reader hears it once it is finished. Text is drawn by
 * `RichTextRenderer` from markdown, block by block as it arrives. Enter
 * sends and Shift+Enter starts a new line.
 */
export function AIChatPanel(props: AIChatPanelProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(aiChatStyles(), props.classes);
  const streaming = (): boolean => props.messages.some((one) => one.status === "streaming");
  const lastAssistant = (): AIMessage | undefined =>
    props.messages.findLast((one) => one.role === "assistant");
  return (
    <section
      class={arc(cls().root, props.class, props.className)}
      data-slot="ai-chat"
      aria-label={props["aria-label"] ?? messages().assistant}
    >
      <Show
        when={props.messages.length > 0}
        fallback={
          <div class={arc(cls().transcript, cls().empty)} data-slot="ai-chat-empty">
            {props.empty}
            <Show when={(props.suggestions?.length ?? 0) > 0}>
              <ul class={cls().suggestions} aria-label={messages().suggestions}>
                <For each={props.suggestions ?? []}>
                  {(suggestion: string) => (
                    <li>
                      <Button
                        variant="outline"
                        size="sm"
                        data-slot="ai-chat-suggestion"
                        onPress={() => props.onSend(suggestion)}
                      >
                        {suggestion}
                      </Button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        }
      >
        <MessageScroller class={cls().transcript} data-slot="ai-chat-transcript">
          <MessageScrollerViewport aria-label={props["aria-label"] ?? messages().assistant}>
            <MessageScrollerContent class={cls().content} aria-busy={streaming()}>
              <For each={() => props.messages}>
                {(message: AIMessage) => (
                  <MessageScrollerItem
                    messageId={message.id}
                    scrollAnchor={message.role === "user"}
                  >
                    <Turn
                      message={message}
                      classes={cls()}
                      last={lastAssistant()?.id === message.id}
                      handlers={props}
                    />
                  </MessageScrollerItem>
                )}
              </For>
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton label={messages().jumpToLatest} />
        </MessageScroller>
      </Show>
      <Show when={props.composer === undefined} fallback={props.composer}>
        <Composer
          classes={cls()}
          streaming={streaming()}
          placeholder={props.placeholder}
          onSend={(text) => props.onSend(text)}
          onStop={props.onStop}
        />
      </Show>
    </section>
  );
}

function textOf(message: AIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n\n");
}

function Turn(props: {
  message: AIMessage;
  classes: Slots;
  last: boolean;
  handlers: AIChatPanelProps;
}) {
  const messages = useArcMessages();
  const message = (): AIMessage => props.message;
  const mine = (): boolean => message().role === "user";
  const streaming = (): boolean => message().status === "streaming";
  return (
    <article
      class={props.classes.message}
      data-slot="ai-chat-message"
      data-role={message().role}
      data-status={message().status ?? "done"}
      aria-label={mine() ? messages().you : messages().assistant}
    >
      <Message align={mine() ? "end" : "start"}>
        <MessageContent>
          <Show when={(message().attachments?.length ?? 0) > 0}>
            <MessageAttachments attachments={message().attachments ?? []} />
          </Show>
          <For each={() => message().parts}>
            {(part: AIPart) => (
              <Switch>
                <Match when={part.type === "text" && mine()}>
                  <Bubble align="end" variant="secondary">
                    <BubbleContent
                      class={arc(props.classes.text, type.written)}
                      data-slot="ai-chat-text"
                    >
                      {(part as { text: string }).text}
                    </BubbleContent>
                  </Bubble>
                </Match>
                <Match when={part.type === "text"}>
                  <div class={props.classes.text} data-slot="ai-chat-text">
                    <RichTextRenderer markdown={(part as { text: string }).text} size="sm" />
                  </div>
                </Match>
                <Match when={part.type === "tool"}>
                  <ToolCall
                    call={(part as { call: AIToolCall }).call}
                    message={message()}
                    classes={props.classes}
                    handlers={props.handlers}
                  />
                </Match>
              </Switch>
            )}
          </For>
          <Show when={streaming() && textOf(message()) === ""}>
            <p
              class={arc(props.classes.status, shimmer)}
              data-slot="ai-chat-generating"
              role="status"
            >
              {messages().generating}
            </p>
          </Show>
          <Show when={message().status === "error"}>
            <p class={props.classes.error} data-slot="ai-chat-error" role="alert">
              <CircleAlert aria-hidden="true" />
              {message().error ?? messages().replyFailed}
            </p>
          </Show>
          <Show when={message().status === "stopped"}>
            <p class={props.classes.status} data-slot="ai-chat-stopped">
              {messages().stoppedGenerating}
            </p>
          </Show>
          <Show when={(message().citations?.length ?? 0) > 0}>
            <section
              class={props.classes.sources}
              data-slot="ai-chat-sources"
              aria-label={messages().sources}
            >
              <span class={type.label}>{messages().sources}</span>
              <ol class={props.classes.sourceList}>
                <For each={() => message().citations ?? []}>
                  {(citation: AICitation) => (
                    <li>
                      <a href={citation.href} title={citation.snippet}>
                        {citation.title}
                      </a>
                    </li>
                  )}
                </For>
              </ol>
            </section>
          </Show>
          <Show when={!mine() && !streaming()}>
            <div class={props.classes.actions} data-slot="ai-chat-actions">
              <CopyButton value={textOf(message())} />
              <Show when={props.last && props.handlers.onRegenerate !== undefined}>
                <IconButton
                  label={messages().regenerate}
                  variant="ghost"
                  size="sm"
                  tooltip={false}
                  onPress={() => props.handlers.onRegenerate?.(message())}
                >
                  <RotateCcw aria-hidden="true" />
                </IconButton>
              </Show>
            </div>
          </Show>
        </MessageContent>
      </Message>
    </article>
  );
}

const TOOL_TONE: Record<AIToolState, "info" | "success" | "danger" | "warning" | "neutral"> = {
  running: "info",
  done: "success",
  error: "danger",
  "awaiting-approval": "warning",
  approved: "success",
  rejected: "neutral",
};

function ToolCall(props: {
  call: AIToolCall;
  message: AIMessage;
  classes: Slots;
  handlers: AIChatPanelProps;
}) {
  const messages = useArcMessages();
  const detailsId = createUniqueId();
  const [open, setOpen] = createSignal(false);
  const call = (): AIToolCall => props.call;
  const input = (): string | undefined => {
    const given = call().input;
    if (given === undefined) return undefined;
    return typeof given === "string" ? given : JSON.stringify(given, null, 2);
  };
  const hasDetails = (): boolean => input() !== undefined || call().output !== undefined;
  return (
    <div
      class={arc(tones[TOOL_TONE[call().state]], props.classes.tool)}
      data-slot="ai-chat-tool"
      data-state={call().state}
      role="group"
      aria-label={messages().toolState(call().name, call().state)}
    >
      <div class={props.classes.toolHeader} data-slot="ai-chat-tool-header">
        <Switch fallback={<Wrench aria-hidden="true" />}>
          <Match when={call().state === "running"}>
            <Spinner />
          </Match>
          <Match when={call().state === "done" || call().state === "approved"}>
            <Check aria-hidden="true" />
          </Match>
          <Match when={call().state === "error"}>
            <CircleAlert aria-hidden="true" />
          </Match>
          <Match when={call().state === "awaiting-approval"}>
            <Hand aria-hidden="true" />
          </Match>
          <Match when={call().state === "rejected"}>
            <X aria-hidden="true" />
          </Match>
        </Switch>
        <span role="status">{messages().toolState(call().name, call().state)}</span>
        <Show when={hasDetails()}>
          <Button
            variant="link"
            size="xs"
            aria-expanded={open()}
            aria-controls={detailsId}
            onPress={() => {
              setOpen(!open());
            }}
          >
            {open() ? messages().showLess : messages().showMore}
          </Button>
        </Show>
      </div>
      <div
        id={detailsId}
        class={props.classes.toolDetails}
        hidden={!open()}
        data-slot="ai-chat-tool-details"
      >
        <Show when={input() !== undefined}>
          <p>{messages().toolInput}</p>
          <pre>
            <code>{input()}</code>
          </pre>
        </Show>
        <Show when={call().output !== undefined}>
          <p>{messages().toolOutput}</p>
          <div>{call().output}</div>
        </Show>
      </div>
      <Show when={call().error !== undefined}>
        <p class={props.classes.error}>{call().error}</p>
      </Show>
      <Show when={call().state === "awaiting-approval"}>
        <div class={props.classes.toolActions} data-slot="ai-chat-tool-actions">
          <Button size="sm" onPress={() => props.handlers.onApprove?.(call(), props.message)}>
            {messages().approve}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onPress={() => props.handlers.onReject?.(call(), props.message)}
          >
            {messages().reject}
          </Button>
        </div>
      </Show>
    </div>
  );
}

function Composer(props: {
  classes: Slots;
  streaming: boolean;
  placeholder: string | undefined;
  onSend: (text: string) => void;
  onStop: (() => void) | undefined;
}) {
  const messages = useArcMessages();
  const [text, setText] = createSignal("");
  const send = (): void => {
    const value = text().trim();
    if (value === "" || props.streaming) return;
    props.onSend(value);
    setText("");
  };
  return (
    <form
      class={props.classes.composer}
      data-slot="ai-chat-composer"
      onSubmit={(event: SubmitEvent) => {
        event.preventDefault();
        send();
      }}
    >
      <Textarea
        class={props.classes.input}
        aria-label={messages().messageAssistant}
        placeholder={props.placeholder ?? messages().messageAssistant}
        rows={1}
        value={text()}
        onInput={(event: Event) => setText((event.currentTarget as HTMLTextAreaElement).value)}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
          event.preventDefault();
          send();
        }}
      />
      <Show
        when={props.streaming && props.onStop !== undefined}
        fallback={
          <IconButton
            label={messages().send}
            tooltip={false}
            isDisabled={text().trim() === "" || props.streaming}
            onPress={send}
          >
            <ArrowUp aria-hidden="true" />
          </IconButton>
        }
      >
        <IconButton
          label={messages().stopGenerating}
          variant="secondary"
          tooltip={false}
          onPress={() => props.onStop?.()}
        >
          <Square aria-hidden="true" />
        </IconButton>
      </Show>
    </form>
  );
}
