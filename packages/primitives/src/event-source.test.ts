import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createRoot, createSignal, flush } from "@barqjs/core";
import { eventSource } from "./event-source.ts";

/** Every stream the code under test opened, drivable from the outside. */
interface Fake {
  url: string;
  withCredentials: boolean;
  readyState: number;
  closed: boolean;
  open(): void;
  emit(type: string, data: string, id?: string): void;
  drop(): void;
  fail(): void;
}

let streams: Fake[] = [];
const real = globalThis.EventSource;

interface SourceInit {
  withCredentials?: boolean;
}

beforeEach(() => {
  streams = [];
  class FakeSource extends EventTarget implements Fake {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;
    url: string;
    withCredentials: boolean;
    readyState = 0;
    closed = false;

    constructor(url: string, init?: SourceInit) {
      super();
      this.url = url;
      this.withCredentials = init?.withCredentials === true;
      streams.push(this);
    }
    close() {
      this.closed = true;
      this.readyState = 2;
    }
    open() {
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
      flush();
    }
    emit(type: string, data: string, id = "") {
      this.dispatchEvent(new MessageEvent(type, { data, lastEventId: id }));
      flush();
    }
    /** A dropped connection the browser retries by itself. */
    drop() {
      this.readyState = 0;
      this.dispatchEvent(new Event("error"));
      flush();
    }
    /** An answer that is not a stream: the browser gives up. */
    fail() {
      this.readyState = 2;
      this.dispatchEvent(new Event("error"));
      flush();
    }
  }
  globalThis.EventSource = FakeSource as unknown as typeof EventSource;
});

afterEach(() => {
  globalThis.EventSource = real;
});

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

interface IdMessage {
  id: number;
}

describe("eventSource", () => {
  test("connects, reports state, and publishes unnamed events", () => {
    const [dispose, events] = createRoot(
      (d) => [d, eventSource("/events", { withCredentials: true })] as const,
    );
    flush();
    expect(events.state()).toBe("connecting");
    expect(streams[0]!.withCredentials).toBe(true);
    streams[0]!.open();
    expect(events.state()).toBe("open");
    streams[0]!.emit("message", "hello", "7");
    expect(events.message()).toEqual({ type: "message", data: "hello", lastEventId: "7" });
    dispose();
  });

  test("hands named events to their handlers, parsed, skipping what does not parse", () => {
    const seen: unknown[] = [];
    const [dispose, events] = createRoot(
      (d) => [d, eventSource<IdMessage>("/events", { parse: JSON.parse })] as const,
    );
    const stop = events.on("run.completed", (event) => seen.push(event.data));
    streams[0]!.open();
    streams[0]!.emit("run.completed", '{"id":1}');
    streams[0]!.emit("run.completed", "not json");
    streams[0]!.emit("other", '{"id":2}');
    stop();
    streams[0]!.emit("run.completed", '{"id":3}');
    expect(seen).toEqual([{ id: 1 }]);
    expect(events.message()).toBeUndefined();
    dispose();
  });

  test("leaves a dropped connection to the browser's own retry", () => {
    const [dispose, events] = createRoot((d) => [d, eventSource("/events")] as const);
    streams[0]!.open();
    streams[0]!.drop();
    expect(events.state()).toBe("connecting");
    expect(streams).toHaveLength(1);
    streams[0]!.open();
    expect(events.state()).toBe("open");
    dispose();
  });

  test("connects again with backoff once the browser gives up, keeping its handlers", async () => {
    const seen: string[] = [];
    const [dispose, events] = createRoot(
      (d) => [d, eventSource("/events", { backoff: 5 })] as const,
    );
    events.on("tick", (event) => seen.push(event.data));
    streams[0]!.fail();
    expect(events.state()).toBe("closed");
    expect(events.attempts()).toBe(1);
    await sleep(15);
    expect(streams).toHaveLength(2);
    streams[1]!.open();
    expect(events.attempts()).toBe(0);
    streams[1]!.emit("tick", "a");
    expect(seen).toEqual(["a"]);
    dispose();
  });

  test("honours a reconnect limit", async () => {
    const [dispose] = createRoot((d) => [d, eventSource("/events", { reconnect: 1, backoff: 1 })]);
    streams[0]!.fail();
    await sleep(10);
    streams[1]!.fail();
    await sleep(10);
    expect(streams).toHaveLength(2);
    dispose();
  });

  test("a reactive url moves the stream to the new address", () => {
    const [org, setOrg] = createSignal("acme");
    const [dispose, events] = createRoot(
      (d) => [d, eventSource(() => `/orgs/${org()}/events`)] as const,
    );
    flush();
    streams[0]!.open();
    setOrg("example");
    flush();
    expect(streams[0]!.closed).toBe(true);
    expect(streams[1]!.url).toBe("/orgs/example/events");
    streams[0]!.emit("message", "late");
    expect(events.message()).toBeUndefined();
    dispose();
  });

  test("close() is final, and the owner closes it too", async () => {
    const [dispose, events] = createRoot(
      (d) => [d, eventSource("/events", { backoff: 1 })] as const,
    );
    events.close();
    expect(streams[0]!.closed).toBe(true);
    expect(events.state()).toBe("closed");
    await sleep(5);
    expect(streams).toHaveLength(1);

    events.open();
    expect(streams).toHaveLength(2);
    dispose();
    expect(streams[1]!.closed).toBe(true);
  });

  test("immediate false waits for open()", () => {
    const [dispose, events] = createRoot(
      (d) => [d, eventSource("/events", { immediate: false })] as const,
    );
    expect(streams).toHaveLength(0);
    events.open();
    expect(streams).toHaveLength(1);
    dispose();
  });
});
