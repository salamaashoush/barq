import { describe, expect, test } from "bun:test";
import { createRoot, flush, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import {
  PresenceDot,
  PresenceProvider,
  PresenceStatus,
  createPresenceStore,
  statusHolds,
  usePresence,
  useTyping,
} from "./presence.tsx";

const NOW = new Date("2026-05-10T12:00:00Z");

function count(name: string): number {
  return document.querySelectorAll(`[data-slot="${name}"]`).length;
}

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

describe("PresenceDot", () => {
  test("is an image named by the presence, in a shape of its own as well as a tone", async () => {
    render(() => (
      <p>
        <PresenceDot presence="online" />
        <PresenceDot presence="away" />
        <PresenceDot presence="dnd" />
        <PresenceDot presence="offline" />
      </p>
    ));
    expect(screen.getAllByRole("img").map((one) => one.getAttribute("aria-label"))).toEqual([
      "Online",
      "Away",
      "Do not disturb",
      "Offline",
    ]);
    const dots = [...document.querySelectorAll('[data-slot="presence-dot"]')];
    // Each presence draws its own class set: not told by colour alone.
    expect(new Set(dots.map((one) => one.className)).size).toBe(4);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("is hidden where its words are already beside it", () => {
    render(() => <PresenceDot presence="away" label={false} />);
    expect(slot("presence-dot").getAttribute("aria-hidden")).toBe("true");
    expect(slot("presence-dot").hasAttribute("role")).toBe(false);
  });
});

describe("PresenceStatus", () => {
  test("says the presence and the status, with the time it lapses", async () => {
    render(() => (
      <PresenceStatus
        presence="dnd"
        now={NOW}
        timeZone="UTC"
        status={{ emoji: "🎧", text: "Focusing", expiresAt: new Date("2026-05-10T17:00:00Z") }}
      />
    ));
    expect(slot("presence-status").textContent).toContain("Do not disturb");
    expect(slot("presence-status-emoji").textContent).toBe("🎧");
    expect(slot("presence-status-text").textContent).toBe("Focusing");
    expect(slot("presence-status-until").textContent).toBe("until 5:00 PM");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("leaves out a status that has lapsed", () => {
    render(() => (
      <PresenceStatus
        presence="online"
        now={NOW}
        status={{ text: "Lunch", expiresAt: new Date("2026-05-10T11:00:00Z") }}
      />
    ));
    expect(count("presence-status-custom")).toBe(0);
    expect(statusHolds({ text: "Lunch" }, NOW)).toBe(true);
    expect(statusHolds({}, NOW)).toBe(false);
  });

  test("takes the status away by itself when it lapses", async () => {
    const status = { text: "Back soon", expiresAt: new Date(Date.now() + 30) };
    render(() => <PresenceStatus presence="online" status={status} />);
    expect(slot("presence-status-text").textContent).toBe("Back soon");
    await new Promise((resolve) => setTimeout(resolve, 60));
    await settle();
    expect(count("presence-status-text")).toBe(0);
  });

  test("compact names the dot and drops the word", () => {
    render(() => <PresenceStatus presence="away" compact />);
    expect(screen.getByRole("img", { name: "Away" })).toBeDefined();
    expect(count("presence-status-label")).toBe(0);
  });

  test("runs right to left in the locale's digits, and takes a class per part", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <PresenceStatus
          presence="online"
          now={NOW}
          timeZone="UTC"
          status={{ text: "x", expiresAt: new Date("2026-05-10T17:00:00Z") }}
          class="mine"
          classes={{ root: "r", dot: "d", label: "l", status: "s", text: "t", until: "u" }}
        />
      </Arabic>
    ));
    expect(slot("presence-status-until").textContent).toMatch(/[٠-٩]/u);
    const pairs = [
      ["presence-status", "r"],
      ["presence-dot", "d"],
      ["presence-status-label", "l"],
      ["presence-status-custom", "s"],
      ["presence-status-text", "t"],
      ["presence-status-until", "u"],
    ] as const;
    for (const [name, cls] of pairs) expect(slot(name).classList.contains(cls)).toBe(true);
    expect(slot("presence-status").classList.contains("mine")).toBe(true);
  });

  test("a server's markup is hydrated in place", async () => {
    const result = await hydrates(`
      import { PresenceStatus } from "<arc>";
      export function Page() {
        return (
          <PresenceStatus
            presence="away"
            now={new Date("2026-05-10T12:00:00Z")}
            timeZone="UTC"
            status={{ emoji: "🍜", text: "Lunch", expiresAt: new Date("2026-05-10T13:00:00Z") }}
          />
        );
      }
    `);
    expect(result.container.querySelector('[data-slot="presence-status-text"]')?.textContent).toBe(
      "Lunch",
    );
    result.unmount();
  });
});

interface DataEvent {
  data: unknown;
}

describe("createPresenceStore", () => {
  test("keeps each person's presence and who is typing, from a socket", async () => {
    const sockets: EventTarget[] = [];
    const real = globalThis.WebSocket;
    class FakeSocket extends EventTarget {
      static OPEN = 1;
      readyState = 1;
      constructor() {
        super();
        sockets.push(this);
      }
      close() {}
      send() {}
    }
    globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
    try {
      const [dispose, store] = createRoot(
        (done) =>
          [
            done,
            createPresenceStore({ url: "wss://example.test/presence", typingTimeout: 30 }),
          ] as const,
      );
      function send(data: unknown): void {
        const event = new Event("message") as Event & DataEvent;
        event.data = JSON.stringify(data);
        sockets[0]?.dispatchEvent(event);
      }
      send({ type: "presence", userId: "u1", presence: "away", status: { text: "Out" } });
      send({ type: "typing", userId: "u1", conversationId: "c1", typing: true });
      send({ type: "typing", userId: "u2", conversationId: "c1", typing: true });
      flush();
      expect(store.of("u1")).toEqual({ presence: "away", status: { text: "Out" } });
      expect(store.of("nobody").presence).toBe("offline");
      expect(store.typing("c1")).toEqual(["u1", "u2"]);
      send({ type: "typing", userId: "u2", conversationId: "c1", typing: false });
      flush();
      expect(store.typing("c1")).toEqual(["u1"]);
      // A typing report lapses when the next one does not come.
      await new Promise((resolve) => setTimeout(resolve, 60));
      flush();
      expect(store.typing("c1")).toEqual([]);
      dispose();
    } finally {
      globalThis.WebSocket = real;
    }
  });

  test("someone going offline stops typing everywhere", () => {
    const [dispose, store] = createRoot((done) => [done, createPresenceStore()] as const);
    store.apply({ type: "typing", userId: "u1", conversationId: "c1", typing: true });
    store.apply({ type: "presence", userId: "u1", presence: "offline" });
    flush();
    expect(store.typing("c1")).toEqual([]);
    dispose();
  });

  test("a provider shares one store with usePresence and useTyping below it", () => {
    const store = createRoot(() => createPresenceStore());
    function Reader() {
      const entry = usePresence(() => "u1");
      const typing = useTyping(() => "c1");
      return (
        <p data-slot="reader">
          {entry().presence}:{typing().join()}
        </p>
      );
    }
    render(() => (
      <PresenceProvider store={store}>
        <Reader />
      </PresenceProvider>
    ));
    expect(slot("reader").textContent).toBe("offline:");
    store.apply({ type: "presence", userId: "u1", presence: "online" });
    store.apply({ type: "typing", userId: "u9", conversationId: "c1", typing: true });
    flush();
    expect(slot("reader").textContent).toBe("online:u9");
  });
});
