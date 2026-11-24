import { Show, createEffect, createSignal } from "@barqjs/core";
import { Button, Grid, Inline, Status, Text, toast } from "@barqjs/arc";
import {
  type ChatAttachment,
  type ChatMessage,
  MessageList,
  type MessageListApi,
  ThreadPanel,
  TypingIndicator,
} from "@barqjs/arc/chat";
import { ChatComposer, type ComposedMessage } from "@barqjs/arc/editor";
import { layout, space, surface } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";

import { ME, designHistory, threadReplies } from "../../data/chat.ts";
import { mentionPeople, uploadImage } from "../../data/directory.ts";
import { type Room, joinRoom } from "../../data/room.ts";

const demo = layer("demo");
const pane = demo(surface.card, layout.column, layout.clip, { height: "34rem" });
const list = demo(layout.grow, layout.minZeroBlock);
const footer = demo(layout.column, { padding: space.x2, gap: space.x1 });

type Broadcast = { kind: "message"; message: ChatMessage } | { kind: "typing" };

const attachmentsOf = (sent: ComposedMessage): ChatAttachment[] =>
  sent.attachments.map((item) => ({
    id: item.id,
    kind: item.file.type.startsWith("image/") ? "image" : "file",
    name: item.file.name,
    url: typeof item.result === "string" ? item.result : (item.preview ?? ""),
    size: item.file.size,
    mimeType: item.file.type,
  }));

export default function Conversation() {
  const [messages, setMessages] = createSignal<readonly ChatMessage[]>(designHistory(Date.now()));
  const [thread, setThread] = createSignal<ChatMessage | null>(null);
  const [replies, setReplies] = createSignal<readonly ChatMessage[]>([]);
  const [typing, setTyping] = createSignal<readonly string[]>([]);
  const [peers, setPeers] = createSignal(0);
  let room: Room<Broadcast> | undefined;
  let latest: MessageListApi | undefined;
  const lapses = new Map<string, ReturnType<typeof setTimeout>>();
  let lastTyped = 0;

  createEffect(
    () => true,
    () => {
      room = joinRoom<Broadcast>("gallery-design", {
        message: (body, from) => {
          if (body.kind === "message") {
            setMessages([
              ...messages(),
              {
                ...body.message,
                author: { id: from, name: `${body.message.author.name} (another tab)` },
              },
            ]);
            setTyping(typing().filter((one) => one !== from));
            return;
          }
          if (!typing().includes(from)) setTyping([...typing(), from]);
          clearTimeout(lapses.get(from));
          lapses.set(
            from,
            setTimeout(() => setTyping(typing().filter((one) => one !== from)), 3000),
          );
        },
        peers: (ids) => setPeers(ids.length - 1),
      });
      return () => room?.close();
    },
  );

  const update = (id: string, change: (message: ChatMessage) => ChatMessage | null): void => {
    setMessages(messages().flatMap((one) => (one.id === id ? (change(one) ?? []) : [one])));
  };

  const send = (sent: ComposedMessage): void => {
    const message: ChatMessage = {
      id: `mine-${Date.now()}`,
      author: ME,
      createdAt: new Date().toISOString(),
      content: sent.value,
      attachments: attachmentsOf(sent),
    };
    setMessages([...messages(), message]);
    room?.send({ kind: "message", message });
    latest?.scrollToLatest();
  };

  return (
    <Grid columns={{ base: 1, cqLg: thread() === null ? 1 : 2 }} gap={4}>
      <div class={pane}>
        <div class={list}>
          <MessageList
            aria-label="#design"
            messages={messages()}
            unreadFrom="design-352"
            currentUserId={ME.id}
            controller={(api) => {
              latest = api;
            }}
            onReact={(message, emoji, add) =>
              update(message.id, (one) => {
                const others = (one.reactions ?? []).filter((reaction) => reaction.emoji !== emoji);
                const count =
                  (one.reactions?.find((reaction) => reaction.emoji === emoji)?.count ?? 0) +
                  (add ? 1 : -1);
                return {
                  ...one,
                  reactions: count > 0 ? [...others, { emoji, count, reacted: add }] : others,
                };
              })
            }
            onReply={(message) => {
              setThread(message);
              setReplies(message.thread === undefined ? [] : threadReplies(message));
            }}
            onDelete={(message) => update(message.id, () => null)}
            onPin={(message, pinned) => update(message.id, (one) => ({ ...one, pinned }))}
            onRetry={(message) =>
              update(message.id, (one) => ({ ...one, state: "sent", error: undefined }))
            }
            onDiscard={(message) => update(message.id, () => null)}
            linkTo={(message) => `/chat#${message.id}`}
          />
        </div>
        <div
          class={footer}
          onKeyDown={() => {
            if (Date.now() - lastTyped < 1500) return;
            lastTyped = Date.now();
            room?.send({ kind: "typing" }, true);
          }}
        >
          <TypingIndicator people={typing().map(() => ({ name: "Salama (another tab)" }))} />
          <ChatComposer
            label="Message #design"
            placeholder="Message #design"
            mentions={mentionPeople}
            upload={uploadImage}
            onSend={send}
          />
          <Inline gap={2} align="center">
            <Status tone={peers() > 0 ? "success" : "neutral"}>
              {peers() > 0
                ? `${peers()} other tab${peers() === 1 ? "" : "s"} in the room`
                : "Open a second tab to chat"}
            </Status>
          </Inline>
        </div>
      </div>
      <Show when={thread()}>
        {(parent) => (
          <div class={pane}>
            <ThreadPanel
              parent={parent()}
              replies={replies()}
              currentUserId={ME.id}
              context={
                <Inline justify="between" align="center">
                  <Text size="xs" color="muted">
                    In #design
                  </Text>
                  <Button variant="ghost" size="sm" onPress={() => setThread(null)}>
                    Close thread
                  </Button>
                </Inline>
              }
              composer={
                <ChatComposer
                  label="Reply in thread"
                  placeholder="Reply"
                  mentions={mentionPeople}
                  onSend={(sent) => {
                    setReplies([
                      ...replies(),
                      {
                        id: `reply-${Date.now()}`,
                        author: ME,
                        createdAt: new Date().toISOString(),
                        content: sent.value,
                      },
                    ]);
                    update(parent().id, (one) => ({
                      ...one,
                      thread: {
                        count: (one.thread?.count ?? 0) + 1,
                        participants: [ME],
                        lastReplyAt: new Date().toISOString(),
                      },
                    }));
                    toast("Reply sent");
                  }}
                />
              }
            />
          </div>
        )}
      </Show>
    </Grid>
  );
}
