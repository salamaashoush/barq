/**
 * `TTDStreamFetch` and `parseSSEStream`: a text-to-diagram backend speaking
 * server-sent events, as excalidraw.com's does.
 */

import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { TTDStreamFetch, parseSSEStream, type StreamChunk } from "./stream-fetch.ts";

const sse = (
  events: readonly (StreamChunk | "[DONE]")[],
  split = 7,
): ReadableStream<Uint8Array> => {
  const text = events
    .map((event) => `data: ${event === "[DONE]" ? event : JSON.stringify(event)}\n\n`)
    .join("");
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      // in pieces that cut events in two, as a network does
      for (let index = 0; index < bytes.length; index += split) {
        controller.enqueue(bytes.slice(index, index + split));
      }
      controller.close();
    },
  });
};

let fetchSpy: { mockRestore(): void; mock: { calls: unknown[][] } } | null = null;
afterEach(() => {
  fetchSpy?.mockRestore();
  fetchSpy = null;
});

const respond = (response: Response) => {
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    (async () => response) as unknown as typeof fetch,
  );
};

describe("parseSSEStream", () => {
  test("yields each data payload, across chunk boundaries", async () => {
    const reader = sse([{ type: "content", delta: "a" }, "[DONE]"], 3).getReader();
    const payloads: string[] = [];
    for await (const data of parseSSEStream(reader)) payloads.push(data);
    expect(payloads).toEqual([JSON.stringify({ type: "content", delta: "a" }), "[DONE]"]);
  });
});

describe("TTDStreamFetch", () => {
  test("streams the content, posts the messages and reads the rate limits", async () => {
    respond(
      new Response(
        sse([
          { type: "content", delta: "flowchart LR\n" },
          { type: "content", delta: "  A --> B" },
          { type: "done", finishReason: "stop" },
          "[DONE]",
        ]),
        { headers: { "X-Ratelimit-Limit": "10", "X-Ratelimit-Remaining": "7" } },
      ),
    );
    const chunks: string[] = [];
    let created = false;
    const result = await TTDStreamFetch({
      url: "https://example.com/ttd",
      messages: [{ role: "user", content: "two boxes" }],
      onChunk: (chunk) => chunks.push(chunk),
      onStreamCreated: () => (created = true),
    });
    expect(result).toEqual({
      generatedResponse: "flowchart LR\n  A --> B",
      error: null,
      rateLimit: 10,
      rateLimitRemaining: 7,
    });
    expect(chunks).toEqual(["flowchart LR\n", "  A --> B"]);
    expect(created).toBe(true);
    const [url, init] = fetchSpy!.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.com/ttd");
    expect(JSON.parse(init.body as string)).toEqual({
      messages: [{ role: "user", content: "two boxes" }],
    });
  });

  test("a 429 is the rate limit, another failure its text", async () => {
    respond(new Response("slow down", { status: 429 }));
    const limited = await TTDStreamFetch({ url: "https://example.com/ttd", messages: [] });
    expect(limited.error?.status).toBe(429);
    respond(new Response("broken", { status: 503 }));
    const failed = await TTDStreamFetch({ url: "https://example.com/ttd", messages: [] });
    expect(failed.error).toMatchObject({ message: "broken", status: 500 });
  });

  test("an error event, or nothing streamed, is an error", async () => {
    respond(new Response(sse([{ type: "error", error: { message: "model down" } }])));
    const errored = await TTDStreamFetch({ url: "https://example.com/ttd", messages: [] });
    expect(errored.error?.message).toBe("model down");
    respond(new Response(sse(["[DONE]"])));
    const empty = await TTDStreamFetch({ url: "https://example.com/ttd", messages: [] });
    expect(empty.error?.message).toBe("Generation failed...");
  });

  test("an abort is a 499", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async () => {
      throw new DOMException("aborted", "AbortError");
    }) as unknown as typeof fetch);
    const result = await TTDStreamFetch({ url: "https://example.com/ttd", messages: [] });
    expect(result.error).toMatchObject({ message: "Request aborted", status: 499 });
  });
});
