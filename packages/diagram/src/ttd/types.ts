import type { Child } from "@barqjs/core";

/** A message as the text-to-diagram backend reads it. Excalidraw's `LLMMessage`. */
export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

/** What `onTextSubmit` is asked: the conversation so far, a way to stream, and to be stopped. */
export interface TextSubmitRequest {
  messages: LLMMessage[];
  /** A piece of the reply as it streams in. */
  onChunk?: (chunk: string) => void;
  /** The stream has started. */
  onStreamCreated?: () => void;
  signal?: AbortSignal;
}

/** The error a backend reports, with the HTTP status when it has one (429 is a rate limit). */
export interface TextSubmitError {
  name?: string;
  message: string;
  status?: number;
}

/** What `onTextSubmit` resolves to: the whole reply (a Mermaid definition) or an error. */
export type TextSubmitResult = {
  rateLimit?: number | null;
  rateLimitRemaining?: number | null;
} & (
  | { generatedResponse: string; error: null }
  | { error: TextSubmitError; generatedResponse?: null }
);

export interface ChatMessage {
  id: string;
  timestamp: Date;
  type: "user" | "assistant" | "warning";
  content?: string;
  isGenerating?: boolean;
  error?: string;
  errorType?: "parse" | "network" | "other";
  warningType?: "messageLimitExceeded" | "rateLimitExceeded";
  lastAttemptAt?: number;
}

export interface ChatHistory {
  id: string;
  messages: ChatMessage[];
  currentPrompt: string;
}

export interface SavedChat {
  id: string;
  title: string;
  messages: ChatMessage[];
  currentPrompt: string;
  timestamp: number;
}

export type SavedChats = SavedChat[];

/** Where the app keeps the text-to-diagram chats. Excalidraw's `TTDPersistenceAdapter`. */
export interface TTDPersistenceAdapter {
  loadChats(): Promise<SavedChats>;
  saveChats(chats: SavedChats): Promise<void>;
}

export interface WelcomeScreenProps {
  rateLimits: RateLimits | null;
}

/**
 * The app's text-to-diagram backend: Excalidraw's `<TTDDialog>` props. The
 * editor sends nothing anywhere itself; without this, the text-to-diagram
 * entries are not offered.
 */
export interface TextToDiagramOptions {
  onTextSubmit: (request: TextSubmitRequest) => Promise<TextSubmitResult>;
  /** Keeps the chats between sessions; they last as long as the editor without one. */
  persistenceAdapter?: TTDPersistenceAdapter;
  /** What an empty chat shows instead of the default greeting; `undefined` keeps it. */
  renderWelcomeScreen?: (props: WelcomeScreenProps) => Child | undefined;
  /** What a warning in the chat says instead of the default; `undefined` keeps it. */
  renderWarning?: (chatMessage: ChatMessage) => Child | undefined;
}

export interface RateLimits {
  rateLimit: number;
  rateLimitRemaining: number;
}
