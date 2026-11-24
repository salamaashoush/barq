import { randomId } from "@excalidraw/common";

import type {
  ChatHistory,
  ChatMessage,
  LLMMessage,
  RateLimits,
  SavedChat,
  TextToDiagramOptions,
} from "./types.ts";

const MIN_PROMPT_LENGTH = 3;
const MAX_PROMPT_LENGTH = 10000;
const SAVED_CHATS = 10;
/** The earlier messages sent with a prompt, as Excalidraw sends. */
const CONTEXT_MESSAGES = 3;

type Strings = {
  promptTooShort: (min: number) => string;
  promptTooLong: (max: number) => string;
  requestFailed: string;
  generationFailed: string;
  mermaidParseError: string;
};

const lastIndexOf = <T>(items: readonly T[], test: (item: T) => boolean): number => {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (item !== undefined && test(item)) return index;
  }
  return -1;
};

const updateAssistant = (history: ChatHistory, patch: Partial<ChatMessage>): ChatHistory => {
  const index = lastIndexOf(history.messages, (message) => message.type === "assistant");
  const last = history.messages[index];
  if (!last) return history;
  const messages = history.messages.slice();
  messages[index] = { ...last, ...patch };
  return { ...history, messages };
};

const addMessages = (
  history: ChatHistory,
  added: readonly Omit<ChatMessage, "id" | "timestamp">[],
): ChatHistory => ({
  ...history,
  messages: [
    ...history.messages,
    ...added.map((message) => ({ ...message, id: randomId(), timestamp: new Date() })),
  ],
});

export const getLastAssistantMessage = (history: ChatHistory): ChatMessage | undefined =>
  history.messages[lastIndexOf(history.messages, (message) => message.type === "assistant")];

const messagesForLLM = (history: ChatHistory): LLMMessage[] =>
  history.messages.flatMap((message) =>
    message.content && (message.type === "user" || message.type === "assistant")
      ? [{ role: message.type, content: message.content }]
      : [],
  );

const chatTitle = (text: string): string => {
  const trimmed = text.trim();
  return trimmed.length <= 50 ? trimmed : `${trimmed.slice(0, 47)}...`;
};

const emptyChat = (): ChatHistory => ({ id: randomId(), messages: [], currentPrompt: "" });

/**
 * Excalidraw's text-to-diagram chat, without its UI: a prompt goes to the
 * app's `onTextSubmit` with the last few messages, the reply streams into
 * the assistant's message, and a reply that is not valid Mermaid is marked
 * so it can be repaired. Chats are kept, ten at most, through the app's
 * persistence adapter.
 */
export class TextToDiagramSession {
  public history: ChatHistory = emptyChat();
  public error: Error | null = null;
  public rateLimits: RateLimits | null = null;
  public savedChats: SavedChat[] = [];
  private abortController: AbortController | null = null;
  private chatsLoaded = false;

  public constructor(
    private readonly options: TextToDiagramOptions,
    /** Throws for a definition Mermaid cannot read. */
    private readonly validate: (definition: string) => Promise<void>,
    private readonly strings: Strings,
    private readonly onChange: () => void,
  ) {}

  public get isGenerating(): boolean {
    return getLastAssistantMessage(this.history)?.isGenerating === true;
  }

  private set(
    patch: Partial<Pick<TextToDiagramSession, "history" | "error" | "rateLimits">>,
  ): void {
    Object.assign(this, patch);
    this.onChange();
  }

  public setPrompt(prompt: string): void {
    this.set({ history: { ...this.history, currentPrompt: prompt } });
  }

  public async loadChats(): Promise<void> {
    const adapter = this.options.persistenceAdapter;
    if (this.chatsLoaded || !adapter) return;
    this.chatsLoaded = true;
    try {
      this.savedChats = await adapter.loadChats();
    } catch (error) {
      console.warn("DiagramEditor: the text-to-diagram chats did not load", error);
      this.savedChats = [];
    }
    this.onChange();
  }

  /** Sends a prompt; a repair sends it again into the last reply instead of a new one. */
  public async generate(prompt: string, isRepairFlow = false): Promise<void> {
    if (prompt.length < MIN_PROMPT_LENGTH) {
      this.set({ error: new Error(this.strings.promptTooShort(MIN_PROMPT_LENGTH)) });
      return;
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      this.set({ error: new Error(this.strings.promptTooLong(MAX_PROMPT_LENGTH)) });
      return;
    }
    if (this.rateLimits?.rateLimitRemaining === 0) return;

    this.abortController?.abort();
    const abortController = new AbortController();
    this.abortController = abortController;
    const context = messagesForLLM(this.history).slice(-CONTEXT_MESSAGES);

    if (isRepairFlow) {
      this.set({
        error: null,
        history: updateAssistant(this.history, {
          isGenerating: true,
          content: "",
          error: undefined,
          errorType: undefined,
        }),
      });
    } else {
      this.set({
        error: null,
        history: addMessages({ ...this.history, currentPrompt: "" }, [
          { type: "user", content: prompt },
          { type: "assistant", content: "", isGenerating: true },
        ]),
      });
    }

    try {
      const result = await this.options.onTextSubmit({
        messages: [...context, { role: "user", content: prompt }],
        signal: abortController.signal,
        onStreamCreated: () => {
          if (isRepairFlow) {
            this.set({ history: updateAssistant(this.history, { content: "", error: "" }) });
          }
        },
        onChunk: (chunk) => {
          const last = getLastAssistantMessage(this.history);
          this.set({
            history: updateAssistant(this.history, { content: (last?.content ?? "") + chunk }),
          });
        },
      });

      let history = updateAssistant(this.history, { isGenerating: false });
      const { rateLimit, rateLimitRemaining } = result;
      const rateLimits =
        typeof rateLimit === "number" && typeof rateLimitRemaining === "number"
          ? { rateLimit, rateLimitRemaining }
          : this.rateLimits;

      const error = result.error;
      if (error?.status === 429 || rateLimitRemaining === 0) {
        if (error?.status === 429) {
          const index = lastIndexOf(history.messages, (message) => message.type === "assistant");
          history = { ...history, messages: history.messages.filter((_, at) => at !== index) };
        }
        history = addMessages(
          {
            ...history,
            messages: history.messages.filter((message) => message.type !== "warning"),
          },
          [
            {
              type: "warning",
              warningType: rateLimitRemaining === 0 ? "messageLimitExceeded" : "rateLimitExceeded",
            },
          ],
        );
      }
      this.set({ history, rateLimits });

      if (error) {
        if (
          error.name === "AbortError" ||
          error.message === "Aborted" ||
          abortController.signal.aborted
        ) {
          return;
        }
        const failure = new Error(error.message || this.strings.requestFailed);
        this.set({
          error: failure,
          history:
            error.status === 429
              ? this.history
              : updateAssistant(this.history, {
                  isGenerating: false,
                  error: failure.message,
                  errorType: "network",
                }),
        });
        return;
      }

      try {
        await this.validate(result.generatedResponse);
      } catch (parseError) {
        const failure = new Error(
          parseError instanceof Error && parseError.message
            ? parseError.message
            : this.strings.mermaidParseError,
        );
        this.set({
          error: failure,
          history: updateAssistant(this.history, {
            isGenerating: false,
            error: failure.message,
            errorType: "parse",
          }),
        });
      }
    } catch (thrown) {
      const failure = new Error(
        thrown instanceof Error && thrown.message ? thrown.message : this.strings.generationFailed,
      );
      this.set({
        error: failure,
        history: updateAssistant(this.history, {
          isGenerating: false,
          error: failure.message,
          errorType: "other",
        }),
      });
    } finally {
      if (this.abortController === abortController) this.abortController = null;
      await this.saveCurrentChat();
    }
  }

  /** Stops a generation without telling anyone, as the dialog goes. */
  public dispose(): void {
    this.abortController?.abort();
  }

  public abort(): void {
    this.abortController?.abort();
    if (this.isGenerating) {
      this.set({ history: updateAssistant(this.history, { isGenerating: false }) });
    }
  }

  /** Asks the backend to fix the reply Mermaid could not read. */
  public repair(message: ChatMessage): Promise<void> {
    const definition = message.content ?? "";
    if (!definition) return Promise.resolve();
    return this.generate(
      `Fix the error in this Mermaid diagram. The diagram is:\n\n\`\`\`mermaid\n${definition}\n\`\`\`\n\nThe exception/error is: ${message.error ?? ""}\n\nPlease fix the Mermaid syntax and regenerate a valid diagram.`,
      true,
    );
  }

  /** Sends the prompt that led to `message` again. */
  public retry(message: ChatMessage): Promise<void> {
    const index = this.history.messages.findIndex((each) => each.id === message.id);
    const previous = this.history.messages[index - 1];
    if (index < 1 || previous?.type !== "user" || typeof previous.content !== "string") {
      return Promise.resolve();
    }
    this.set({ history: updateAssistant(this.history, { lastAttemptAt: Date.now() }) });
    return this.generate(previous.content, true);
  }

  /** Removes a reply and the prompt it answered. */
  public deleteMessage(messageId: string): void {
    const index = this.history.messages.findIndex(
      (message) => message.id === messageId && message.type === "assistant",
    );
    if (index < 0) return;
    this.set({
      history: {
        ...this.history,
        messages: this.history.messages.slice(0, Math.max(0, index - 1)),
      },
    });
  }

  public async newChat(): Promise<void> {
    await this.saveCurrentChat();
    this.set({ history: emptyChat(), error: null });
  }

  public restoreChat(chat: SavedChat): void {
    const history: ChatHistory = {
      id: chat.id,
      currentPrompt: "",
      messages: chat.messages.map((message) => ({
        ...message,
        timestamp:
          message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp),
      })),
    };
    const lastError = getLastAssistantMessage(history)?.error;
    this.set({ history, error: lastError ? new Error(lastError) : null });
  }

  public async deleteChat(chatId: string): Promise<void> {
    this.savedChats = this.savedChats.filter((chat) => chat.id !== chatId);
    await this.persist();
    if (chatId === this.history.id) {
      const [next] = this.savedChats;
      if (next) {
        this.restoreChat(next);
      } else {
        this.set({ history: emptyChat(), error: null });
      }
    } else {
      this.onChange();
    }
  }

  private async saveCurrentChat(): Promise<void> {
    const { history } = this;
    const firstPrompt = history.messages.find((message) => message.type === "user")?.content;
    if (typeof firstPrompt !== "string") return;
    const existing = this.savedChats.find((chat) => chat.id === history.id);
    const changed =
      !existing ||
      existing.messages.length !== history.messages.length ||
      existing.messages.some(
        (message, index) =>
          message.id !== history.messages[index]?.id ||
          message.content !== history.messages[index]?.content,
      );
    const saved: SavedChat = {
      id: history.id,
      title: chatTitle(firstPrompt),
      messages: history.messages.filter(
        (message) => message.type === "user" || message.type === "assistant",
      ),
      currentPrompt: history.currentPrompt,
      timestamp: changed ? Date.now() : (existing?.timestamp ?? Date.now()),
    };
    this.savedChats = [...this.savedChats.filter((chat) => chat.id !== history.id), saved]
      .toSorted((a, b) => b.timestamp - a.timestamp)
      .slice(0, SAVED_CHATS);
    this.onChange();
    await this.persist();
  }

  private async persist(): Promise<void> {
    try {
      await this.options.persistenceAdapter?.saveChats(this.savedChats);
    } catch (error) {
      console.warn("DiagramEditor: the text-to-diagram chats did not save", error);
    }
  }
}
