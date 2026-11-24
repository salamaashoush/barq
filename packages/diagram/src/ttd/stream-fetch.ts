import { RequestError } from "../errors.ts";

import type { LLMMessage, TextSubmitResult } from "./types.ts";

interface RateLimitInfo {
  rateLimit?: number;
  rateLimitRemaining?: number;
}

/** What `TTDStreamFetch` posts to and how it reports. */
export interface StreamingOptions {
  url: string;
  messages: readonly LLMMessage[];
  onChunk?: (chunk: string) => void;
  /** Reads `X-Ratelimit-Limit` and `X-Ratelimit-Remaining`. @default true */
  extractRateLimits?: boolean;
  signal?: AbortSignal;
  onStreamCreated?: () => void;
}

/** One server-sent event of a text-to-diagram stream. */
export type StreamChunk =
  | { type: "content"; delta: string }
  | {
      type: "done";
      finishReason: "stop" | "length" | "content_filter" | "tool_calls" | null;
    }
  | { type: "error"; error: { message: string; status?: number } };

const extractRateLimitHeaders = (headers: Headers): RateLimitInfo => {
  const rateLimit = headers.get("X-Ratelimit-Limit");
  const rateLimitRemaining = headers.get("X-Ratelimit-Remaining");
  return {
    rateLimit: rateLimit ? Number.parseInt(rateLimit, 10) : undefined,
    rateLimitRemaining: rateLimitRemaining ? Number.parseInt(rateLimitRemaining, 10) : undefined,
  };
};

/** The `data:` payloads of a server-sent event stream, as they arrive. */
export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          yield trimmed.slice(6);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const errorName = (error: unknown): string | undefined =>
  error instanceof Error ? error.name : undefined;

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

/**
 * Excalidraw's `TTDStreamFetch`: posts the conversation to a backend that
 * answers with server-sent `StreamChunk`s, streams the content to `onChunk`,
 * and resolves to what `onTextSubmit` returns, rate limits included.
 */
export async function TTDStreamFetch(options: StreamingOptions): Promise<TextSubmitResult> {
  const { url, messages, onChunk, onStreamCreated, extractRateLimits = true, signal } = options;
  try {
    let fullResponse = "";
    let rateLimitInfo: RateLimitInfo = {};
    let error: RequestError | null = null;

    const response = await fetch(url, {
      method: "POST",
      headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal,
    });
    if (extractRateLimits) {
      rateLimitInfo = extractRateLimitHeaders(response.headers);
    }
    if (!response.ok) {
      if (response.status === 429) {
        return {
          ...rateLimitInfo,
          error: new RequestError({ message: "Rate limit exceeded", status: 429 }),
        };
      }
      const text = await response.text();
      throw new RequestError({ message: text || "Generation failed...", status: response.status });
    }
    const reader = response.body?.getReader();
    if (!reader) {
      throw new RequestError({ message: "Couldn't get reader from response body", status: 500 });
    }
    onStreamCreated?.();

    try {
      for await (const data of parseSSEStream(reader)) {
        if (data === "[DONE]") {
          break;
        }
        let chunk: StreamChunk | null;
        try {
          chunk = JSON.parse(data) as StreamChunk | null;
        } catch (parseError) {
          console.warn("Failed to parse SSE data:", data, parseError);
          continue;
        }
        if (chunk === null) {
          break;
        }
        if (chunk.type === "content" && chunk.delta) {
          fullResponse += chunk.delta;
          onChunk?.(chunk.delta);
        } else if (chunk.type === "error") {
          error = new RequestError({ message: chunk.error.message, status: 500 });
        }
      }
    } catch (streamError) {
      error =
        errorName(streamError) === "AbortError"
          ? new RequestError({ message: "Request aborted", status: 499 })
          : new RequestError({
              message: errorMessage(streamError, "Streaming error"),
              status: 500,
            });
    }

    if (error) {
      return { ...rateLimitInfo, error };
    }
    if (!fullResponse) {
      return {
        ...rateLimitInfo,
        error: new RequestError({ message: "Generation failed...", status: response.status }),
      };
    }
    return { generatedResponse: fullResponse, error: null, ...rateLimitInfo };
  } catch (fetchError) {
    if (errorName(fetchError) === "AbortError") {
      return { error: new RequestError({ message: "Request aborted", status: 499 }) };
    }
    return {
      error: new RequestError({ message: errorMessage(fetchError, "Request failed"), status: 500 }),
    };
  }
}
