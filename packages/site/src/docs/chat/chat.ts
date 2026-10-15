/**
 * A scripted conversation for the message scroller examples, in place of a
 * model behind a transport.
 *
 * The script is a list of turns written with `.user()`, `.sleep()` and
 * `.assistant()`. `useChat` plays it: sending the next user message appends it,
 * waits for the sleep written before the reply, then streams the reply a word
 * at a time, which is what makes the scroller's anchoring and following visible.
 */

import { createSignal, onCleanup, type Accessor } from "@barqjs/core";

export interface ChatMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
}

export type ChatStatus = "ready" | "submitted" | "streaming";

export interface ChatTransport {
  readonly delayMs: number;
}

export interface ScriptedChat {
  user(text: string, options?: { id?: string }): ScriptedChat;
  assistant(text: string, options?: { id?: string }): ScriptedChat;
  sleep(ms: number): ScriptedChat;
  /** Every message, or the first `exchanges` user turns with their replies. */
  get(exchanges?: number): ChatMessage[];
  /** The user message that follows `messages`, if the script has one. */
  next(messages: readonly ChatMessage[]): ChatMessage | undefined;
  transport(options: ChatTransport): ChatTransport;
  /** The reply that follows a user message, and how long to wait before it. */
  replyTo(message: ChatMessage): { reply: ChatMessage; wait: number } | undefined;
}

export function createChat(): ScriptedChat {
  const script: ChatMessage[] = [];
  const waits = new Map<string, number>();
  let pause = 0;

  const chat: ScriptedChat = {
    user(text, options) {
      script.push({ id: options?.id ?? `message-${script.length + 1}`, role: "user", text });
      return chat;
    },
    assistant(text, options) {
      const id = options?.id ?? `message-${script.length + 1}`;
      script.push({ id, role: "assistant", text });
      waits.set(id, pause);
      pause = 0;
      return chat;
    },
    sleep(ms) {
      pause = ms;
      return chat;
    },
    get(exchanges) {
      if (exchanges === undefined) return [...script];
      let users = 0;
      const end = script.findIndex((message) => message.role === "user" && users++ === exchanges);
      return script.slice(0, end === -1 ? script.length : end);
    },
    next(messages) {
      const candidate = script[messages.length];
      return candidate?.role === "user" ? candidate : undefined;
    },
    transport(options) {
      return options;
    },
    replyTo(message) {
      const at = script.indexOf(message);
      const reply = script[at + 1];
      if (at === -1 || reply === undefined || reply.role !== "assistant") return undefined;
      return { reply, wait: waits.get(reply.id) ?? 0 };
    },
  };
  return chat;
}

export interface UseChat {
  readonly messages: Accessor<readonly ChatMessage[]>;
  readonly status: Accessor<ChatStatus>;
  readonly sendMessage: (message: ChatMessage) => Promise<void>;
  readonly setMessages: (messages: readonly ChatMessage[]) => void;
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export function useChat(options: {
  chat: ScriptedChat;
  messages: readonly ChatMessage[];
  transport: ChatTransport;
}): UseChat {
  const [messages, setList] = createSignal<readonly ChatMessage[]>(options.messages);
  const [status, setStatus] = createSignal<ChatStatus>("ready");
  // A reset or an unmount while a reply is streaming abandons that reply.
  let generation = 0;
  onCleanup(() => {
    generation++;
  });

  const setMessages = (next: readonly ChatMessage[]): void => {
    generation++;
    setList(next);
    setStatus("ready");
  };

  const sendMessage = async (message: ChatMessage): Promise<void> => {
    const run = ++generation;
    setList([...messages(), message]);
    setStatus("submitted");
    const turn = options.chat.replyTo(message);
    if (turn === undefined) {
      setStatus("ready");
      return;
    }
    await wait(turn.wait);
    if (run !== generation) return;
    // One row for the whole reply, whose text grows: a new message object per
    // word would be a new row per word.
    const [text, setText] = createSignal("");
    const live: ChatMessage = {
      id: turn.reply.id,
      role: "assistant",
      get text() {
        return text();
      },
    };
    setList([...messages(), live]);
    setStatus("streaming");
    const words = turn.reply.text.split(/(?<=\s)/);
    for (let count = 1; count <= words.length; count++) {
      setText(words.slice(0, count).join(""));
      await wait(options.transport.delayMs);
      if (run !== generation) return;
    }
    setStatus("ready");
  };

  return { messages, status, sendMessage, setMessages };
}
