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
import { withoutRequestEvent } from "@barqjs/server/storage";

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

type Emit = (data: string, kind: "frame" | "message") => void;

/**
 * Drive a live answer: each rendering of a frame, or each value of an
 * iterable, through `emit` until it ends, then `finish(complete)`. Returns
 * what stops it early.
 */
function produce(result: unknown, emit: Emit, finish: (complete: boolean) => void): () => void {
  let ended = false;
  const stops: (() => void)[] = [];
  function end(complete: boolean): void {
    if (ended) return;
    ended = true;
    for (const stop of stops) stop();
    finish(complete);
  }

  async function frames(frame: ServerFrame): Promise<void> {
    const shared = new SharedSources();
    stops.push(() => shared.close());
    let rendering = false;
    let again = false;
    async function render(): Promise<void> {
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
    }
    shared.onChange(() => void render());
    await render();
  }

  async function values(source: AsyncIterable<unknown>): Promise<void> {
    const iterator = source[Symbol.asyncIterator]();
    stops.push(() => void iterator.return?.());
    try {
      for (;;) {
        const step = await iterator.next();
        if (ended) return;
        if (step.done === true) break;
        emit(JSON.stringify(encodeWire(step.value)), "message");
      }
      end(true);
    } catch (error) {
      console.error(
        "[barq] A live answer failed while streaming, so its connection ends and the page reconnects. The error:",
        error,
      );
      end(false);
    }
  }

  if (isFrame(result)) void frames(result as ServerFrame);
  else if (isIterable(result)) void values(result);
  else {
    emit(JSON.stringify(encodeWire(result)), "message");
    end(true);
  }
  return () => {
    if (ended) return;
    ended = true;
    for (const stop of stops) stop();
  };
}

interface Connection {
  readonly emit: Emit;
  readonly end: (complete: boolean) => void;
}

/**
 * One server-sent event stream. `attach` is handed the connection when the
 * stream starts and answers with what to run when it ends, either way.
 */
function connection(request: Request, attach: (connection: Connection) => () => void): Response {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let ended = false;
  const stops: (() => void)[] = [];
  function end(complete: boolean): void {
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
  }
  function send(text: string): void {
    if (ended || controller === null) return;
    try {
      controller.enqueue(encoder.encode(text));
    } catch {
      end(false);
    }
  }
  let sentId = request.headers.get("last-event-id");
  const emit: Emit = (data, kind) => {
    const id = digest(data);
    if (id === sentId) return;
    sentId = id;
    send(event(kind, id, data));
  };

  const body = new ReadableStream<Uint8Array>({
    start(given) {
      controller = given;
      const heartbeat = setInterval(() => send(": still here\n\n"), HEARTBEAT_MS);
      (heartbeat as Unrefable).unref?.();
      stops.push(() => clearInterval(heartbeat));
      function abort(): void {
        return end(false);
      }
      request.signal.addEventListener("abort", abort, { once: true });
      stops.push(() => request.signal.removeEventListener("abort", abort));
      stops.push(attach({ emit, end }));
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

/** The answer to a call at the live address. */
export function liveResponse(result: unknown, request: Request): Response {
  return connection(request, (to) => produce(result, to.emit, to.end));
}

interface LatestAnswer {
  readonly data: string;
  readonly kind: "frame" | "message";
}

interface Unrefable {
  unref?: () => void;
}

interface Closable {
  return?: () => unknown;
}

interface Broadcast {
  readonly connections: Set<Connection>;
  latest: LatestAnswer | null;
  ended: boolean;
  stop: () => void;
}

/** The running shared answers, by function and arguments. */
const BROADCASTS = new Map<string, Broadcast>();

/**
 * A joiner's own answer, closed without reading it. Only an answer that is
 * already an iterator, a generator object, holds anything: an iterable nobody
 * has asked for an iterator has started nothing, and asking would start it.
 */
function closeUnread(result: unknown): void {
  const iterator = result as Closable | null;
  if (typeof iterator?.return !== "function") return;
  try {
    const closing = iterator.return();
    if (closing instanceof Promise) void closing.catch(() => {});
  } catch {
    // Nothing read it, and nothing will.
  }
}

/**
 * The answer to a live call to a `broadcast` function: one rendering per
 * `key`, every connection asking the same thing a reader of it. The first call
 * starts it, outside its own request, and each later one joins it with the
 * latest event and closes its own answer unread. It stops when its last
 * connection goes.
 */
export function broadcastResponse(key: string, result: unknown, request: Request): Response {
  let shared = BROADCASTS.get(key);
  if (shared !== undefined && !shared.ended) {
    closeUnread(result);
  } else {
    const started: Broadcast = {
      connections: new Set(),
      latest: null,
      ended: false,
      stop: () => {},
    };
    BROADCASTS.set(key, started);
    started.stop = withoutRequestEvent(() =>
      produce(
        result,
        (data, kind) => {
          started.latest = { data, kind };
          for (const each of started.connections) each.emit(data, kind);
        },
        (complete) => {
          started.ended = true;
          if (BROADCASTS.get(key) === started) BROADCASTS.delete(key);
          for (const each of started.connections) each.end(complete);
        },
      ),
    );
    shared = started;
  }
  const joined = shared;
  return connection(request, (to) => {
    joined.connections.add(to);
    if (joined.latest !== null) to.emit(joined.latest.data, joined.latest.kind);
    if (joined.ended) to.end(true);
    return () => {
      joined.connections.delete(to);
      if (joined.connections.size > 0 || joined.ended) return;
      joined.ended = true;
      if (BROADCASTS.get(key) === joined) BROADCASTS.delete(key);
      joined.stop();
    };
  });
}
