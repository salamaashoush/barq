import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { type Collection, createCollection, eq } from "@barqjs/db";
import { cleanup, render } from "@barqjs/testing";

import { type MessageHistory, useMessageHistory } from "./message-history.ts";
import type { ChatMessage } from "./model.ts";

afterEach(() => cleanup());

// TanStack DB unrefs the handle its cleanup timer returns when that is an
// object, as Node's is; happy-dom's is an object without `unref`, and a
// browser's is a number.
const realTimeout = globalThis.setTimeout;
beforeAll(() => {
  globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
    const handle = realTimeout(...args) as unknown;
    if (typeof handle === "object" && handle !== null && !("unref" in handle)) {
      Object.assign(handle, { unref: () => handle });
    }
    return handle;
  }) as typeof setTimeout;
});
afterAll(() => {
  globalThis.setTimeout = realTimeout;
});

interface Row {
  id: string;
  channel: string;
  author: string;
  text: string;
  at: number;
}

const START = Date.UTC(2026, 4, 10, 8, 0);
function row(n: number, over: Partial<Row> = {}): Row {
  return {
    id: `m${String(n)}`,
    channel: "design",
    author: n % 2 === 0 ? "alex" : "sam",
    text: `Message ${String(n)}`,
    at: START + n * 60_000,
    ...over,
  };
}

async function settle(ms = 15): Promise<void> {
  flush();
  await new Promise((resolve) => setTimeout(resolve, ms));
  flush();
}

/** A collection a test fills and pushes into, as a server and a socket would. */
function messages(initial: Row[], persist: (row: Row) => Promise<void>) {
  let push: ((row: Row) => void) | undefined;
  const collection = createCollection<Row, string>({
    id: `messages-${String(Math.random())}`,
    getKey: (one) => one.id,
    sync: {
      sync: ({ begin, write, commit, markReady }) => {
        begin();
        for (const one of initial) write({ type: "insert", value: one });
        void commit();
        markReady();
        push = (one) => {
          begin();
          write({ type: "insert", value: one });
          void commit();
        };
      },
    },
    // A server that took the message, and the sync that brings it back.
    onInsert: async ({ transaction }) => {
      for (const mutation of transaction.mutations) {
        await persist(mutation.modified);
        push?.(mutation.modified);
      }
    },
  });
  return { collection, push: (one: Row) => push?.(one) };
}

function toMessage(one: Row): ChatMessage {
  return {
    id: one.id,
    author: { id: one.author, name: one.author },
    createdAt: new Date(one.at),
    body: one.text,
  };
}

interface MountExtra {
  write?: (one: Row) => void;
}

function mount(collection: Collection<Row, string>, extra: MountExtra = {}) {
  let history: MessageHistory<Row> | undefined;
  render(() => {
    history = useMessageHistory<Row>({
      collection,
      query: (q) =>
        q
          .from({ message: collection })
          .where(({ message }) => eq(message.channel, "design"))
          .orderBy(({ message }) => message.at, "desc"),
      toMessage,
      pageSize: 10,
      ...extra,
    });
    return null;
  });
  if (history === undefined) throw new Error("the hook did not run");
  return history;
}

function ids(history: MessageHistory<Row>): string[] {
  return history.messages().map((one) => one.id);
}

describe("useMessageHistory", () => {
  test("the newest page first, oldest first in order, and older pages on request", async () => {
    const { collection } = messages(
      [...Array.from({ length: 25 }, (_, n) => row(n)), row(99, { channel: "other" })],
      async () => {},
    );
    const history = mount(collection);
    await settle();
    expect(history.isReady()).toBe(true);
    expect(ids(history)).toEqual(Array.from({ length: 10 }, (_, n) => `m${String(n + 15)}`));
    expect(history.hasOlder()).toBe(true);
    history.loadOlder();
    await settle();
    expect(history.messages()).toHaveLength(20);
    expect(ids(history)[0]).toBe("m5");
    history.loadOlder();
    await settle();
    expect(history.messages()).toHaveLength(25);
    expect(history.hasOlder()).toBe(false);
  });

  test("a send shows at once as sending, then sent once the collection persists it", async () => {
    let release: (() => void) | undefined;
    const { collection } = messages([row(0)], () => new Promise((resolve) => (release = resolve)));
    const history = mount(collection);
    await settle();
    const sending = history.send(row(1, { author: "me", text: "Hello" }));
    await settle();
    expect(history.messages().at(-1)).toMatchObject({ id: "m1", body: "Hello", state: "pending" });
    release?.();
    await sending;
    await settle();
    expect(history.messages().at(-1)).toMatchObject({ id: "m1", body: "Hello" });
    expect(history.messages().at(-1)?.state).toBeUndefined();
  });

  test("a refused send stays in place with its reason; Retry sends it again, Discard drops it", async () => {
    let refuse = true;
    const { collection } = messages([row(0)], async () => {
      if (refuse) throw new Error("Offline");
    });
    const history = mount(collection);
    await settle();
    await history.send(row(1, { author: "me" }));
    await settle();
    expect(history.messages().at(-1)).toMatchObject({
      id: "m1",
      state: "failed",
      error: "Offline",
    });
    refuse = false;
    await history.retry("m1");
    await settle();
    expect(history.messages().at(-1)?.id).toBe("m1");
    expect(history.messages().at(-1)?.state).toBeUndefined();

    refuse = true;
    await history.send(row(2, { author: "me" }));
    await settle();
    expect(history.messages().at(-1)?.state).toBe("failed");
    history.discard("m2");
    await settle();
    expect(ids(history)).toEqual(["m0", "m1"]);
  });

  test("a message pushed from a server is appended, live", async () => {
    const { collection, push } = messages([row(0)], async () => {});
    const history = mount(collection, { write: push });
    await settle();
    history.receive(row(1, { text: "From the socket" }));
    await settle();
    expect(history.messages().at(-1)).toMatchObject({ id: "m1", body: "From the socket" });
    expect(() => mount(collection).receive(row(2))).toThrow("writeUpsert");
  });
});
