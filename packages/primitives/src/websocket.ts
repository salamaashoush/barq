import { type Accessor, isServer, createSignal } from "@barqjs/core";
import { type Clear, type MaybeAccessor, access, tryCleanup } from "./utils.ts";

export type SocketState = "closed" | "connecting" | "open" | "closing";

/** What `WebSocket.send` accepts, named once so the queue cannot drift from it. */
export type Sendable = Parameters<WebSocket["send"]>[0];

export interface SocketOptions {
  protocols?: string | readonly string[];
  /** Connect on creation. On by default. */
  immediate?: boolean;
  /**
   * Reconnect after an unclean close. `false` to never, a number for how many
   * attempts, `true` for forever. Defaults to `true`.
   *
   * A clean close — `code` 1000, or `close()` from this side — is never
   * retried: it is what "I am done" looks like on the wire, and reconnecting
   * through it is how a logout loop starts.
   *
   * The count is CONSECUTIVE failures: a connection that opens resets it, so a
   * socket that drops once an hour keeps its full budget each time rather than
   * spending it over the life of the page and then going quiet forever.
   */
  reconnect?: boolean | number;
  /** First backoff step in milliseconds. Doubles, capped at 30s. Defaults to 500. */
  backoff?: number;
  /**
   * Send a keepalive every N milliseconds while open. Off by default.
   * A proxy that drops idle sockets is the usual reason to want one.
   */
  heartbeat?: { every: number; message?: Sendable };
}

export interface Socket<T = string> {
  state: Accessor<SocketState>;
  /** The last message received, as it arrived. */
  message: Accessor<T | undefined>;
  /** How many times this socket has reconnected. */
  attempts: Accessor<number>;
  /**
   * Queue or send. Anything sent while the socket is not open is BUFFERED and
   * flushed on connect, because the alternative — throwing, or dropping it — is
   * what makes callers write their own queue.
   */
  send: (data: Sendable) => void;
  open: Clear;
  /** Close cleanly. This will not reconnect. */
  close: (code?: number, reason?: string) => void;
  /** The live socket, for the rare thing this wrapper does not cover. */
  raw: Accessor<WebSocket | null>;
}

const CLEAN = 1000;
const MAX_BACKOFF = 30_000;

/**
 * A WebSocket that reconnects, buffers what you send while it is down, and
 * closes with the scope that opened it.
 *
 * The URL may be an accessor: changing it closes the old socket and opens a new
 * one, which is what a room or a channel id needs.
 */
export function websocket<T = string>(
  url: MaybeAccessor<string>,
  options?: SocketOptions,
): Socket<T> {
  // `open` and `close` are the caller's to call, a component body included,
  // and the socket is opened from one unless `immediate` is off.
  const [state, setState] = createSignal<SocketState>("closed", { ownedWrite: true });
  const [message, setMessage] = createSignal<T | undefined>(undefined, { equals: false });
  const [attempts, setAttempts] = createSignal(0);
  const [raw, setRaw] = createSignal<WebSocket | null>(null, { ownedWrite: true });

  const retries = options?.reconnect ?? true;
  const step = options?.backoff ?? 500;
  const queue: Sendable[] = [];

  let socket: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let beat: ReturnType<typeof setInterval> | undefined;
  let closedByUs = false;
  let disposed = false;
  // The count the retry policy decides on. `attempts` publishes it, and a
  // write is not readable back until the next flush.
  let tries = 0;

  const stopBeat = (): void => {
    if (beat === undefined) return;
    clearInterval(beat);
    beat = undefined;
  };

  const allowed = (): boolean => {
    if (retries === false || closedByUs || disposed) return false;
    if (retries === true) return true;
    return tries < retries;
  };

  const connect = (): void => {
    if (isServer || disposed || socket !== null) return;
    closedByUs = false;
    setState("connecting");

    const next = new WebSocket(access(url), options?.protocols as string[] | undefined);
    socket = next;
    setRaw(next);

    next.addEventListener("open", () => {
      setState("open");
      tries = 0;
      setAttempts(0);
      // Everything written while it was down, in the order it was written.
      while (queue.length > 0) next.send(queue.shift() as Sendable);
      if (options?.heartbeat !== undefined) {
        beat = setInterval(
          () => next.send(options.heartbeat?.message ?? ""),
          options.heartbeat.every,
        );
      }
    });

    next.addEventListener("message", (event: MessageEvent) => setMessage(() => event.data as T));

    next.addEventListener("close", (event: CloseEvent) => {
      stopBeat();
      socket = null;
      setRaw(null);
      setState("closed");
      if (event.code === CLEAN || !allowed()) return;
      const wait = Math.min(MAX_BACKOFF, step * 2 ** tries);
      tries++;
      setAttempts(tries);
      retryTimer = setTimeout(connect, wait);
    });
  };

  const close = (code = CLEAN, reason?: string): void => {
    closedByUs = true;
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
    stopBeat();
    const open = socket;
    socket = null;
    if (open === null) {
      setState("closed");
      return;
    }
    setState("closing");
    open.close(code, reason);
  };

  tryCleanup(() => {
    disposed = true;
    close();
  });

  if (options?.immediate !== false) connect();

  return {
    state,
    message,
    attempts,
    send(data) {
      if (socket !== null && socket.readyState === WebSocket.OPEN) socket.send(data);
      else queue.push(data);
    },
    open: connect,
    close,
    raw,
  };
}
