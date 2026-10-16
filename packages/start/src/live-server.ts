/**
 * The server half of `live`: a call at the live address answered as server-sent
 * events, for as long as the answer stands.
 *
 * A frame is rendered again each time an async source it reads moves, and each
 * new rendering that differs from the last goes out as one event carrying the
 * frame's markup. Any other answer goes out a value per event. An answer whose
 * every source has ended says so with a `complete` event; a body that ends
 * without one is a connection that died, which the page's loop reconnects.
 *
 * Each event's id is the digest of what it carried. A reconnect names the last
 * one it applied in `Last-Event-ID`, and an answer that still matches it is not
 * sent again.
 */

import { SharedSources, shareSources, unshareSources } from "@barqjs/core/internal";
import { encodeWire } from "@barqjs/server/codec";

import { type ServerFrame, frameMarkup } from "./frames-server.ts";
import { isFrame } from "./frames.ts";

/** The `x-barq-rpc` value a live answer carries. */
export const RPC_LIVE = "live";

/** How often an idle connection says it is still there, against proxies that time one out. */
const HEARTBEAT_MS = 20_000;

function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let at = 0; at < text.length; at++) {
    hash ^= text.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function isIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function"
  );
}

/**
 * One event: its kind, an id, and data that is JSON and so carries no line
 * break of its own. A frame's markup is `frame`, a value the default kind.
 */
function event(kind: "frame" | "message", id: string, data: string): string {
  return `${kind === "frame" ? "event: frame\n" : ""}id: ${id}\ndata: ${data}\n\n`;
}

/** The answer to a call at the live address. */
export function liveResponse(result: unknown, request: Request): Response {
  const encoder = new TextEncoder();
  const last = request.headers.get("last-event-id");
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let ended = false;
  const stops: (() => void)[] = [];
  const end = (complete: boolean): void => {
    if (ended) return;
    ended = true;
    for (const stop of stops) stop();
    if (controller === null) return;
    try {
      if (complete) controller.enqueue(encoder.encode("event: complete\ndata: \n\n"));
      controller.close();
    } catch {
      // The reader has gone.
    }
  };
  const send = (text: string): void => {
    if (ended || controller === null) return;
    try {
      controller.enqueue(encoder.encode(text));
    } catch {
      end(false);
    }
  };
  let sentId = last;
  const emit = (data: string, kind: "frame" | "message" = "message"): void => {
    const id = digest(data);
    if (id === sentId) return;
    sentId = id;
    send(event(kind, id, data));
  };

  const start = (): void => {
    const heartbeat = setInterval(() => send(": still here\n\n"), HEARTBEAT_MS);
    (heartbeat as { unref?: () => void }).unref?.();
    stops.push(() => clearInterval(heartbeat));
    const abort = (): void => end(false);
    request.signal.addEventListener("abort", abort, { once: true });
    stops.push(() => request.signal.removeEventListener("abort", abort));
    if (isFrame(result)) void frames(result as ServerFrame);
    else if (isIterable(result)) void values(result);
    else {
      emit(JSON.stringify(encodeWire(result)));
      end(true);
    }
  };

  const frames = async (frame: ServerFrame): Promise<void> => {
    const shared = new SharedSources();
    stops.push(() => shared.close());
    let rendering = false;
    let again = false;
    const render = async (): Promise<void> => {
      if (rendering) {
        again = true;
        return;
      }
      rendering = true;
      try {
        for (;;) {
          again = false;
          const session = Symbol("live-frame");
          shared.begin();
          shareSources(session, shared);
          let markup: string;
          try {
            markup = await frameMarkup(frame, { session });
          } finally {
            unshareSources(session);
          }
          shared.sweep();
          if (ended) return;
          emit(JSON.stringify(markup), "frame");
          if (!again) break;
        }
      } catch (error) {
        console.error(
          "[barq] A live frame failed to render, so its connection ends and the page reconnects. The error:",
          error,
        );
        end(false);
        return;
      } finally {
        rendering = false;
      }
      if (shared.settled) end(true);
    };
    shared.onChange(() => void render());
    await render();
  };

  const values = async (source: AsyncIterable<unknown>): Promise<void> => {
    const iterator = source[Symbol.asyncIterator]();
    stops.push(() => void iterator.return?.());
    try {
      for (;;) {
        const step = await iterator.next();
        if (ended) return;
        if (step.done === true) break;
        emit(JSON.stringify(encodeWire(step.value)));
      }
      end(true);
    } catch (error) {
      console.error(
        "[barq] A live answer failed while streaming, so its connection ends and the page reconnects. The error:",
        error,
      );
      end(false);
    }
  };

  const body = new ReadableStream<Uint8Array>({
    start(given) {
      controller = given;
      start();
    },
    cancel() {
      end(false);
    },
  });
  const answer = new Response(body);
  answer.headers.set("content-type", "text/event-stream; charset=utf-8");
  answer.headers.set("cache-control", "no-store");
  answer.headers.set("x-accel-buffering", "no");
  answer.headers.set("x-barq-rpc", RPC_LIVE);
  return answer;
}
