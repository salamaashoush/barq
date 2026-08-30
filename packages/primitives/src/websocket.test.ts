import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { flush, root, signal } from "@barqjs/core";
import { websocket } from "./websocket.ts";

/** Every socket the code under test opened, drivable from the outside. */
interface Fake {
  url: string;
  sent: unknown[];
  readyState: number;
  closedWith?: number;
  open(): void;
  deliver(data: unknown): void;
  drop(code: number): void;
}

let sockets: Fake[] = [];
const real = globalThis.WebSocket;

beforeEach(() => {
  sockets = [];

  // A real EventTarget, because the primitive binds with `addEventListener`.
  // A fake carrying `onopen`/`onmessage` properties would pass while the code
  // it is testing listened to nothing.
  class FakeSocket extends EventTarget implements Fake {
    static OPEN = 1;
    url: string;
    sent: unknown[] = [];
    readyState = 0;
    closedWith?: number;

    constructor(url: string) {
      super();
      this.url = url;
      sockets.push(this);
    }
    send(data: unknown) {
      this.sent.push(data);
    }
    close(code = 1000) {
      this.closedWith = code;
      this.drop(code);
    }
    open() {
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    }
    deliver(data: unknown) {
      const event = new Event("message") as Event & { data: unknown };
      event.data = data;
      this.dispatchEvent(event);
    }
    drop(code: number) {
      this.readyState = 3;
      const event = new Event("close") as Event & { code: number };
      event.code = code;
      this.dispatchEvent(event);
    }
  }
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  (globalThis.WebSocket as unknown as { OPEN: number }).OPEN = 1;
});

afterEach(() => {
  globalThis.WebSocket = real;
});

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("websocket", () => {
  test("connects, reports state and publishes messages", () => {
    const dispose = root((d) => {
      const socket = websocket("wss://example.test/feed");
      expect(socket.state()).toBe("connecting");
      expect(sockets).toHaveLength(1);

      sockets[0]!.open();
      expect(socket.state()).toBe("open");

      sockets[0]!.deliver("hello");
      expect(socket.message()).toBe("hello");
      return d;
    });
    dispose();
  });

  test("buffers what is sent before the socket opens, in order", () => {
    const dispose = root((d) => {
      const socket = websocket("wss://example.test/feed");
      socket.send("first");
      socket.send("second");
      expect(sockets[0]!.sent).toEqual([]);

      sockets[0]!.open();
      expect(sockets[0]!.sent).toEqual(["first", "second"]);

      socket.send("third");
      expect(sockets[0]!.sent).toEqual(["first", "second", "third"]);
      return d;
    });
    dispose();
  });

  test("reconnects after an unclean close, with backoff", async () => {
    const dispose = root((d) => {
      const socket = websocket("wss://example.test/feed", { backoff: 10 });
      sockets[0]!.open();
      sockets[0]!.drop(1006);
      expect(socket.state()).toBe("closed");
      expect(socket.attempts()).toBe(1);
      return [d, socket] as const;
    });

    await sleep(40);
    expect(sockets.length, "no second socket was opened").toBeGreaterThan(1);
    dispose[0]();
  });

  test("a clean close is final", async () => {
    const dispose = root((d) => {
      const socket = websocket("wss://example.test/feed", { backoff: 10 });
      sockets[0]!.open();
      sockets[0]!.drop(1000);
      return [d, socket] as const;
    });
    await sleep(40);
    expect(sockets, "a clean close was retried").toHaveLength(1);
    dispose[0]();
  });

  test("close() stops the socket and never reconnects", async () => {
    const dispose = root((d) => {
      const socket = websocket("wss://example.test/feed", { backoff: 10 });
      sockets[0]!.open();
      socket.close();
      expect(sockets[0]!.closedWith).toBe(1000);
      return d;
    });
    await sleep(40);
    expect(sockets).toHaveLength(1);
    dispose();
  });

  test("honours a reconnect limit across CONSECUTIVE failures", async () => {
    const dispose = root((d) => {
      websocket("wss://example.test/feed", { backoff: 5, reconnect: 2 });
      return d;
    });

    // Dropped without ever opening, so nothing resets the count.
    for (let i = 0; i < 5; i++) {
      sockets[sockets.length - 1]!.drop(1006);
      await sleep(30);
    }
    // The first connection plus two retries, and then it gives up.
    expect(sockets).toHaveLength(3);
    dispose();
  });

  test("a successful connection restores the retry budget", async () => {
    const dispose = root((d) => {
      websocket("wss://example.test/feed", { backoff: 5, reconnect: 1 });
      return d;
    });

    sockets[0]!.drop(1006);
    await sleep(25);
    expect(sockets).toHaveLength(2);

    // This one opens, which is what resets the count.
    sockets[1]!.open();
    sockets[1]!.drop(1006);
    await sleep(25);
    expect(sockets, "an opened connection did not restore the budget").toHaveLength(3);
    dispose();
  });

  test("immediate false waits for open()", () => {
    const dispose = root((d) => {
      const socket = websocket("wss://example.test/feed", { immediate: false });
      expect(sockets).toHaveLength(0);
      expect(socket.state()).toBe("closed");
      socket.open();
      expect(sockets).toHaveLength(1);
      return d;
    });
    dispose();
  });

  test("a reactive url is read when connecting", () => {
    const room = signal("alpha");
    const dispose = root((d) => {
      const socket = websocket(() => `wss://example.test/${room()}`, { immediate: false });
      room.set("beta");
      flush();
      socket.open();
      expect(sockets[0]!.url).toBe("wss://example.test/beta");
      return d;
    });
    dispose();
  });

  test("closes with its owner", () => {
    const dispose = root((d) => {
      websocket("wss://example.test/feed");
      sockets[0]!.open();
      return d;
    });
    dispose();
    expect(sockets[0]!.closedWith).toBe(1000);
  });

  test("sends a heartbeat while open", async () => {
    const dispose = root((d) => {
      websocket("wss://example.test/feed", { heartbeat: { every: 10, message: "ping" } });
      sockets[0]!.open();
      return d;
    });
    await sleep(35);
    expect(sockets[0]!.sent.filter((m) => m === "ping").length).toBeGreaterThan(0);
    dispose();
  });
});
