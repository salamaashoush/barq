import { type Accessor, createRenderEffect, createSignal } from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { type Clear, type MaybeAccessor, access, tryCleanup } from "./utils.ts";

export type EventSourceState = "closed" | "connecting" | "open";

export interface EventSourceOptions<T = string> {
  /** Send cookies on a cross-origin stream. */
  withCredentials?: boolean;
  /** Connect on creation. On by default. */
  immediate?: boolean;
  /** Turn each event's `data` into what handlers and `message` receive. The text as it arrived by default. */
  parse?: (data: string) => T;
  /**
   * Connect again after the browser gives up. `false` to never, a number for
   * how many attempts, `true` for forever. Defaults to `true`.
   *
   * The browser already reconnects through a dropped connection by itself,
   * honouring the stream's `retry:` field. It gives up for good on an answer
   * that is not a stream (a 4xx or 5xx, the wrong content type), and that is
   * the case this covers, with backoff, because a server restarting behind a
   * proxy answers 502 for a moment and then is fine.
   */
  reconnect?: boolean | number;
  /** First backoff step in milliseconds. Doubles, capped at 30s. Defaults to 1000. */
  backoff?: number;
}

/** One event as a handler or `message` sees it. */
export interface StreamEvent<T> {
  /** The event's name: `message` for an unnamed one. */
  type: string;
  data: T;
  /** The stream's last event id, which the browser sends back on reconnect. */
  lastEventId: string;
}

export interface Source<T = string> {
  state: Accessor<EventSourceState>;
  /** The last unnamed (`message`) event. Named events reach `on` handlers. */
  message: Accessor<StreamEvent<T> | undefined>;
  /** How many times this source has connected again after the browser gave up. */
  attempts: Accessor<number>;
  /**
   * Hear one named event, on this connection and every later one. Returns a
   * function that stops listening. An event whose `data` the parser refuses
   * is skipped.
   */
  on: (type: string, handler: (event: StreamEvent<T>) => void) => Clear;
  open: Clear;
  /** Close for good. This will not reconnect. */
  close: () => void;
  /** The live `EventSource`, for the rare thing this wrapper does not cover. */
  raw: Accessor<EventSource | null>;
}

const MAX_BACKOFF = 30_000;

/**
 * A server-sent event stream that survives its server going away, reports
 * whether it is live, and closes with the scope that opened it.
 *
 * ```ts
 * const events = eventSource(() => `/api/orgs/${org()}/events`, { parse: JSON.parse });
 * events.on("run.completed", ({ data }) => invalidate(data.check));
 * ```
 *
 * The URL may be an accessor: changing it closes the stream and opens one at
 * the new address. On the server nothing connects and `state` stays `closed`.
 */
export function eventSource<T = string>(
  url: MaybeAccessor<string>,
  options?: EventSourceOptions<T>,
): Source<T> {
  const [state, setState] = createSignal<EventSourceState>("closed", { ownedWrite: true });
  const [message, setMessage] = createSignal<StreamEvent<T> | undefined>(undefined, {
    equals: false,
  });
  const [attempts, setAttempts] = createSignal(0);
  const [raw, setRaw] = createSignal<EventSource | null>(null, { ownedWrite: true });

  const retries = options?.reconnect ?? true;
  const step = options?.backoff ?? 1000;
  const parse = options?.parse ?? ((data: string) => data as T);
  const handlers = new Map<string, Set<(event: StreamEvent<T>) => void>>();
  const bound = new Set<string>();

  let source: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let closedByUs = false;
  let disposed = false;
  let tries = 0;

  function read(event: MessageEvent<string>): StreamEvent<T> | undefined {
    try {
      return { type: event.type, data: parse(event.data), lastEventId: event.lastEventId };
    } catch {
      return undefined;
    }
  }

  function deliver(event: Event): void {
    if (event.target !== source) return;
    const received = read(event as MessageEvent<string>);
    if (received === undefined) return;
    for (const handler of handlers.get(event.type) ?? []) handler(received);
  }

  function bind(target: EventSource, type: string): void {
    if (type !== "message") target.addEventListener(type, deliver);
  }

  function allowed(): boolean {
    if (retries === false || closedByUs || disposed) return false;
    if (retries === true) return true;
    return tries < retries;
  }

  function connect(): void {
    if (isServer || disposed || source !== null) return;
    closedByUs = false;
    setState("connecting");

    const next = new EventSource(access(url), { withCredentials: options?.withCredentials });
    source = next;
    setRaw(next);
    for (const type of bound) bind(next, type);

    next.addEventListener("open", () => {
      if (source !== next) return;
      tries = 0;
      setAttempts(0);
      setState("open");
    });

    next.addEventListener("message", (event: MessageEvent<string>) => {
      if (source !== next) return;
      const received = read(event);
      if (received === undefined) return;
      setMessage(() => received);
      for (const handler of handlers.get("message") ?? []) handler(received);
    });

    next.addEventListener("error", () => {
      if (source !== next) return;
      // Still CONNECTING: the browser is retrying a dropped connection itself.
      if (next.readyState !== EventSource.CLOSED) {
        setState("connecting");
        return;
      }
      source = null;
      setRaw(null);
      setState("closed");
      if (!allowed()) return;
      const wait = Math.min(MAX_BACKOFF, step * 2 ** tries);
      tries++;
      setAttempts(tries);
      retryTimer = setTimeout(connect, wait);
    });
  }

  function close(): void {
    closedByUs = true;
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
    const open = source;
    source = null;
    setRaw(null);
    setState("closed");
    open?.close();
  }

  tryCleanup(() => {
    disposed = true;
    close();
  });

  if (typeof url === "function" && !isServer) {
    let current: string | undefined;
    createRenderEffect(url, (next) => {
      const previous = current;
      current = next;
      if (previous === undefined || previous === next || source === null) return;
      close();
      connect();
    });
  }

  if (options?.immediate !== false) connect();

  return {
    state,
    message,
    attempts,
    on(type, handler) {
      let set = handlers.get(type);
      if (set === undefined) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler);
      if (!bound.has(type)) {
        bound.add(type);
        if (source !== null) bind(source, type);
      }
      return () => {
        set.delete(handler);
      };
    },
    open: connect,
    close,
    raw,
  };
}
