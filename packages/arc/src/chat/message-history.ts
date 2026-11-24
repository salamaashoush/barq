import { type Accessor, createMemo, createSignal } from "@barqjs/core";
import {
  type Collection,
  type Context,
  type InitialQueryBuilder,
  type QueryBuilder,
  useLiveInfiniteQuery,
} from "@barqjs/db";

import type { ChatMessage } from "./model.ts";

type Key = string | number;

/** What a collection that a server pushes into can be written with. */
interface Writable<Row> {
  writeUpsert?: (row: Partial<Row>) => unknown;
}

export interface MessageHistoryOptions<Row extends object> {
  /**
   * Where the messages are kept. A send is an optimistic `insert`, so the
   * collection persists it in its `onInsert`.
   */
  collection: Collection<Row, string, Writable<Row>> | Collection<Row, number, Writable<Row>>;
  /**
   * The conversation's messages, the newest first: `q.from({ message:
   * messages }).where(...).orderBy(({ message }) => message.createdAt,
   * "desc")`. A signal it reads starts the history again.
   */
  query: (q: InitialQueryBuilder) => QueryBuilder<Context>;
  /** A row as the list draws it. */
  toMessage: (row: Row) => ChatMessage;
  /** The row's key, which is the message's id. @default the collection's `getKey` */
  getKey?: (row: Row) => Key;
  /** Messages per page. @default 50 */
  pageSize?: number;
  /**
   * Puts a message pushed from a server (a websocket, a server-sent event)
   * into the collection as synced data. @default the collection's
   * `utils.writeUpsert`, which a query collection has
   */
  write?: (row: Row) => void;
  /** Says why a send was refused, beside Retry. @default the error's message */
  describeError?: (error: unknown) => string;
}

/** A conversation's history, page by page, with sending and what the server pushes. */
export interface MessageHistory<Row extends object> {
  /** Oldest first, sends still on their way and refused ones in place. */
  messages: Accessor<ChatMessage[]>;
  hasOlder: Accessor<boolean>;
  isLoadingOlder: Accessor<boolean>;
  isReady: Accessor<boolean>;
  loadOlder: () => void;
  /**
   * Shows the message at once, dimmed as sending, and persists it through
   * the collection. A refusal keeps it in place with Retry and Discard.
   */
  send: (row: Row) => Promise<void>;
  retry: (id: string) => Promise<void>;
  discard: (id: string) => void;
  /** A message a server pushed: appended, or replacing the row of the same key. */
  receive: (row: Row) => void;
}

interface Refused<Row> {
  row: Row;
  error: string;
}

function time(message: ChatMessage): number {
  return new Date(message.createdAt).getTime();
}

/**
 * A conversation's message history over a TanStack DB collection, through
 * `@barqjs/db`'s live infinite query: the newest page first and older pages
 * as the list asks, every loaded row live.
 *
 * ```tsx
 * const history = useMessageHistory({
 *   collection: messages,
 *   query: (q) =>
 *     q.from({ message: messages })
 *       .where(({ message }) => eq(message.channelId, props.channelId))
 *       .orderBy(({ message }) => message.createdAt, "desc"),
 *   toMessage: (row) => ({ id: row.id, author: people.get(row.authorId), createdAt: row.createdAt, body: row.text }),
 * });
 * socket.on("message", (row) => history.receive(row));
 *
 * <MessageList
 *   aria-label="#design"
 *   messages={history.messages()}
 *   hasOlder={history.hasOlder()}
 *   isLoadingOlder={history.isLoadingOlder()}
 *   onLoadOlder={history.loadOlder}
 *   onRetry={(message) => history.retry(message.id)}
 *   onDiscard={(message) => history.discard(message.id)}
 * />
 * ```
 *
 * A send is an optimistic insert: the message shows at once as sending,
 * becomes sent once the collection's `onInsert` settles, and stays in place
 * as refused, with Retry and Discard, if it throws. What a server pushes is
 * written into the collection as synced data, so a send's own echo lands on
 * the same row rather than beside it. A server render writes the first page
 * and the browser takes it over, as every `@barqjs/db` query does.
 */
export function useMessageHistory<Row extends object>(
  options: MessageHistoryOptions<Row>,
): MessageHistory<Row> {
  function keyOf(row: Row): Key {
    return options.getKey?.(row) ?? options.collection.config.getKey(row);
  }
  const feed = useLiveInfiniteQuery(options.query, () => ({ pageSize: options.pageSize ?? 50 }));
  const [pending, setPending] = createSignal<ReadonlySet<Key>>(new Set());
  const [refused, setRefused] = createSignal<ReadonlyMap<Key, Refused<Row>>>(new Map());

  async function persist(row: Row): Promise<void> {
    const key = keyOf(row);
    setPending((now) => new Set(now).add(key));
    try {
      await options.collection.insert(row).when("settled");
    } catch (error) {
      const said =
        options.describeError?.(error) ?? (error instanceof Error ? error.message : String(error));
      setRefused((now) => new Map(now).set(key, { row, error: said }));
    } finally {
      setPending((now) => {
        const next = new Set(now);
        next.delete(key);
        return next;
      });
    }
  }

  function forget(id: string): Refused<Row> | undefined {
    const held = [...refused().entries()].find(([key]) => String(key) === id);
    if (held === undefined) return undefined;
    setRefused((now) => {
      const next = new Map(now);
      next.delete(held[0]);
      return next;
    });
    return held[1];
  }

  const messages = createMemo((): ChatMessage[] => {
    const waiting = pending();
    const out: ChatMessage[] = [];
    const seen = new Set<string>();
    for (const row of feed.data as Row[]) {
      const message = options.toMessage(row);
      seen.add(message.id);
      out.push(waiting.has(keyOf(row)) ? { ...message, state: "pending" } : message);
    }
    for (const { row, error } of refused().values()) {
      const message = options.toMessage(row);
      if (seen.has(message.id)) continue;
      out.push({ ...message, state: "failed", error });
    }
    // The query is newest first; the list reads oldest first.
    return out.toSorted((a, b) => time(a) - time(b));
  });

  function receive(row: Row): void {
    if (options.write !== undefined) {
      options.write(row);
      return;
    }
    const write = options.collection.utils.writeUpsert;
    if (write === undefined) {
      throw new TypeError(
        "useMessageHistory: the collection has no utils.writeUpsert; pass `write` to put a pushed message into it.",
      );
    }
    void write(row);
  }

  function loadOlder(): void {
    if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
  }
  async function retry(id: string): Promise<void> {
    const held = forget(id);
    if (held !== undefined) await persist(held.row);
  }
  function discard(id: string): void {
    forget(id);
  }

  return {
    messages,
    hasOlder: () => feed.hasNextPage,
    isLoadingOlder: () => feed.isFetchingNextPage,
    isReady: () => feed.isReady,
    loadOlder,
    send: persist,
    retry,
    discard,
    receive,
  };
}
