import { afterEach, describe, expect, test } from "bun:test";
import { type Child, createRoot, createSignal, flush } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";
import { touch } from "@barqjs/ui/shared-touch";

import { hydrates, settle, wears } from "../test-arc.ts";
import {
  NotificationCenter,
  NotificationFeed,
  type NotificationItem,
  useNotifications,
} from "./notifications.tsx";

const NOW = new Date("2026-05-10T12:00:00Z");
const accepted: string[] = [];

const ITEMS: NotificationItem[] = [
  {
    id: "n1",
    title: "Alex mentioned you",
    body: "Can you look at the draft?",
    actor: { name: "Alex Doe" },
    source: "Design review",
    createdAt: new Date("2026-05-10T11:00:00Z"),
    href: "/docs/1",
  },
  {
    id: "n2",
    title: "You were invited to Acme",
    tone: "info",
    source: "Acme",
    createdAt: new Date("2026-05-09T09:00:00Z"),
    actions: [{ id: "accept", label: "Accept", onAction: (item) => accepted.push(item.id) }],
  },
  {
    id: "n3",
    title: "Export finished",
    read: true,
    source: "Acme",
    createdAt: new Date("2026-05-01T09:00:00Z"),
  },
];

const original = window.matchMedia.bind(window);
afterEach(() => {
  accepted.length = 0;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: original });
});

function screenIs(compact: boolean): void {
  const stub = (query: string): MediaQueryList =>
    ({
      matches: query.includes("pointer: coarse") ? compact : original(query).matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: stub });
}

function slots(name: string): HTMLElement[] {
  return [...document.querySelectorAll(`[data-slot="${name}"]`)] as HTMLElement[];
}

describe("NotificationFeed", () => {
  test("groups by day, marks the unread, and lists each with its actor, source and time", async () => {
    render(() => <NotificationFeed items={ITEMS} now={NOW} timeZone="UTC" />);
    const headings = slots("notification-feed-heading").map((one) => one.textContent);
    expect(headings).toEqual(["Today", "Yesterday", "May 1, 2026"]);
    const items = slots("notification");
    expect(items.map((one) => one.hasAttribute("data-read"))).toEqual([false, false, true]);
    expect(
      within(items[0] as HTMLElement).getByRole("link", { name: "Alex mentioned you" }),
    ).toBeDefined();
    expect(items[0]?.textContent).toContain("Design review");
    expect(screen.getByRole("button", { name: "Unread 2" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("groups by source, or under an item's own group", () => {
    render(() => (
      <NotificationFeed
        items={[...ITEMS, { id: "n4", title: "Pinned", group: "Pinned", createdAt: NOW }]}
        groupBy="source"
        now={NOW}
      />
    ));
    expect(slots("notification-feed-heading").map((one) => one.textContent)).toEqual([
      "Design review",
      "Acme",
      "Pinned",
    ]);
  });

  test("opening one marks it read; each toggles read, and Mark all as read reads them all", async () => {
    const marks: string[] = [];
    const opened: string[] = [];
    let all = 0;
    render(() => (
      <NotificationFeed
        items={ITEMS}
        now={NOW}
        onMarkRead={(ids, read) => marks.push(`${ids.join()}:${String(read)}`)}
        onMarkAllRead={() => all++}
        onOpen={(item) => opened.push(item.id)}
      />
    ));
    await user.click(screen.getByRole("link", { name: "Alex mentioned you" }));
    expect(opened).toEqual(["n1"]);
    expect(marks).toEqual(["n1:true"]);
    await user.click(screen.getAllByRole("button", { name: "Mark as unread" })[0] as HTMLElement);
    expect(marks.at(-1)).toBe("n3:false");
    await user.click(screen.getByRole("button", { name: "Mark all as read" }));
    expect(all).toBe(1);
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(accepted).toEqual(["n2"]);
  });

  test("the Unread filter shows only those, and says so when there are none", async () => {
    const [items, setItems] = createSignal<NotificationItem[]>(ITEMS);
    render(() => <NotificationFeed items={items()} now={NOW} />);
    await user.click(screen.getByRole("button", { name: "Unread 2" }));
    await settle();
    expect(slots("notification")).toHaveLength(2);
    setItems(ITEMS.map((item) => ({ ...item, read: true })));
    await settle();
    expect(screen.getByText("You're all caught up")).toBeDefined();
  });

  test("loading draws placeholders, and Load more asks for the next page", async () => {
    let more = 0;
    const [loading, setLoading] = createSignal(true);
    render(() => (
      <NotificationFeed items={ITEMS} now={NOW} isLoading={loading()} onLoadMore={() => more++} />
    ));
    expect(slots("notification")).toHaveLength(0);
    expect(document.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    setLoading(false);
    await settle();
    user.tap(screen.getByRole("button", { name: "Load more" }));
    expect(more).toBe(1);
  });

  test("runs right to left in the locale's words and digits", () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <NotificationFeed items={ITEMS} now={NOW} timeZone="UTC" />
      </Arabic>
    ));
    expect(slots("notification-feed-heading")[2]?.textContent).toMatch(/[٠-٩]/u);
  });

  test("takes a class per part", () => {
    render(() => (
      <NotificationFeed
        class="mine"
        items={ITEMS}
        now={NOW}
        classes={{
          root: "r",
          item: "i",
          title: "t",
          body: "b",
          meta: "m",
          heading: "h",
          actions: "a",
        }}
      />
    ));
    const pairs = [
      ["notification-feed", "r"],
      ["notification", "i"],
      ["notification-title", "t"],
      ["notification-body", "b"],
      ["notification-meta", "m"],
      ["notification-feed-heading", "h"],
      ["notification-actions", "a"],
    ] as const;
    for (const [name, cls] of pairs) expect(slots(name)[0]?.classList.contains(cls)).toBe(true);
    expect(slots("notification-feed")[0]?.classList.contains("mine")).toBe(true);
  });
});

describe("NotificationCenter", () => {
  test("a bell with the unread count opens the feed in a popover beside it", async () => {
    screenIs(false);
    render(() => <NotificationCenter items={ITEMS} now={NOW} allHref="/notifications" />);
    await settle();
    const bell = screen.getByRole("button", { name: "Notifications, 2 unread" });
    expect(wears(bell, touch.target)).toBe(true);
    await user.click(bell);
    await settle();
    const panel = document.querySelector('[data-slot="responsive-overlay"]');
    expect(panel?.getAttribute("data-presentation")).toBe("popover");
    expect(
      within(panel as HTMLElement).getByRole("region", { name: "Notifications" }),
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "View all" }).getAttribute("href")).toBe(
      "/notifications",
    );
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("under a finger the feed is a sheet", async () => {
    screenIs(true);
    render(() => <NotificationCenter items={ITEMS} now={NOW} />);
    await settle();
    user.tap(screen.getByRole("button", { name: "Notifications, 2 unread" }));
    await settle();
    await waitFor(() =>
      expect(
        document
          .querySelector('[data-slot="responsive-overlay"]')
          ?.getAttribute("data-presentation"),
      ).toBe("sheet"),
    );
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { NotificationFeed } from "<arc>";
      export function Page() {
        return (
          <NotificationFeed
            now={new Date("2026-05-10T12:00:00Z")}
            timeZone="UTC"
            items={[{ id: "a", title: "Build passed", createdAt: new Date("2026-05-10T10:00:00Z") }]}
          />
        );
      }
    `);
    expect(
      result.container.querySelector('[data-slot="notification-feed-heading"]')?.textContent,
    ).toBe("Today");
    result.unmount();
  });
});

describe("useNotifications", () => {
  test("appends each message from a websocket, two in one tick included, newest first", () => {
    const sockets: (EventTarget & { readyState: number })[] = [];
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
      const [dispose, feed] = createRoot(
        (done) =>
          [
            done,
            useNotifications({
              initial: [ITEMS[2] as NotificationItem],
              stream: { kind: "websocket", url: "wss://example.test/notifications" },
            }),
          ] as const,
      );
      const socket = sockets[0] as EventTarget;
      for (const item of [ITEMS[0], ITEMS[1]]) {
        const event = new Event("message") as Event & { data: unknown };
        event.data = JSON.stringify(item);
        socket.dispatchEvent(event);
      }
      flush();
      expect(feed.items().map((item) => item.id)).toEqual(["n2", "n1", "n3"]);
      expect(feed.unread()).toBe(2);
      feed.markRead(["n2"]);
      flush();
      expect(feed.unread()).toBe(1);
      feed.markAllRead();
      flush();
      expect(feed.unread()).toBe(0);
      dispose();
    } finally {
      globalThis.WebSocket = real;
    }
  });

  test("appends from an event stream's named event", () => {
    const real = globalThis.EventSource;
    const made: EventTarget[] = [];
    class FakeSource extends EventTarget {
      readyState = 1;
      withCredentials = false;
      constructor() {
        super();
        made.push(this);
      }
      close() {}
    }
    globalThis.EventSource = FakeSource as unknown as typeof EventSource;
    try {
      const [dispose, feed] = createRoot(
        (done) =>
          [done, useNotifications({ stream: { url: "/stream", event: "notification" } })] as const,
      );
      const event = new MessageEvent("notification", { data: JSON.stringify(ITEMS[0]) });
      made[0]?.dispatchEvent(event);
      flush();
      expect(feed.items().map((item) => item.id)).toEqual(["n1"]);
      dispose();
    } finally {
      globalThis.EventSource = real;
    }
  });
});
