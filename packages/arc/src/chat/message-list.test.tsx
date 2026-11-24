import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Child, createSignal, flush } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { serverProcess } from "../ssr-harness.ts";
import { hydrates, settle } from "../test-arc.ts";
import { type MessageListApi, MessageList } from "./message-list.tsx";
import type { ChatMessage } from "./model.ts";
import { scrollViewport, sizeViewport } from "./test-chat.ts";

const ALEX = { id: "alex", name: "Alex Doe" };
const SAM = { id: "sam", name: "Sam Lee" };
const ME = { id: "me", name: "Salama Ashoush" };
const START = Date.UTC(2026, 4, 10, 8, 0);

/** Messages `from` to `to`, a minute apart, alternating author every three. */
function conversation(from: number, to: number): ChatMessage[] {
  return Array.from({ length: to - from }, (_, at) => {
    const n = from + at;
    return {
      id: `m${String(n)}`,
      author: Math.floor(n / 3) % 2 === 0 ? ALEX : SAM,
      createdAt: new Date(START + n * 60_000),
      body: `Message ${String(n)}`,
    };
  });
}

/** happy-dom lays nothing out: each row is as tall as `heights` says, 40px by default. */
const heights = new Map<string, number>();
class FakeObserver {
  constructor(callback: ResizeObserverCallback) {
    callbacks.set(this, callback);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    callbacks.delete(this);
  }
}
const callbacks = new Map<FakeObserver, ResizeObserverCallback>();
const realObserver = globalThis.ResizeObserver;
const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");

beforeEach(() => {
  heights.clear();
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      if (this.dataset.slot !== "message-list-row") return 0;
      return heights.get(this.dataset.key ?? "") ?? 40;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 320,
  });
  globalThis.ResizeObserver = FakeObserver;
});

afterEach(() => {
  if (offsetHeight !== undefined)
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", offsetHeight);
  if (offsetWidth !== undefined)
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", offsetWidth);
  globalThis.ResizeObserver = realObserver;
  callbacks.clear();
});

/** What a browser does when something it observes changes size. */
function resized(): void {
  // A copy: a callback may disconnect an observer and make another.
  for (const [observer, callback] of new Map(callbacks)) callback([], observer);
}

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

const rowsHeight = (): number => Number.parseFloat(slot("message-list-rows").style.height);

/** The list given a 400px viewport, laid out and measured. */
async function laidOut(height = 400): Promise<HTMLElement> {
  const viewport = slot("message-list-viewport");
  let box = height;
  sizeViewport(viewport, { height: box, scrollHeight: () => Math.max(box, rowsHeight()) });
  Object.defineProperty(viewport, "clientHeight", { configurable: true, get: () => box });
  (viewport as unknown as { resize: (next: number) => void }).resize = (next) => {
    box = next;
  };
  // A resize rather than a scroll: the virtualizer reads the box again, and
  // nothing reads it as the reader moving.
  for (let round = 0; round < 6; round++) {
    window.dispatchEvent(new Event("resize"));
    await settle();
  }
  return viewport;
}

const rowTop = (id: string): number =>
  Number.parseFloat(
    (document.querySelector(`[data-slot="message-list-row"][data-key="${id}"]`) as HTMLElement)
      .style.top,
  );

const articles = (): HTMLElement[] => screen.queryAllByRole("article");

const atBottom = (viewport: HTMLElement): boolean =>
  Math.abs(viewport.scrollTop - (rowsHeight() - viewport.clientHeight)) < 1;

describe("MessageList", () => {
  test("opens at the newest message, and draws only the rows on screen", async () => {
    render(() => <MessageList messages={conversation(0, 200)} timeZone="UTC" />);
    const viewport = await laidOut();
    expect(atBottom(viewport)).toBe(true);
    const drawn = articles();
    expect(drawn.length).toBeGreaterThan(5);
    expect(drawn.length).toBeLessThan(60);
    const last = drawn.at(-1) as HTMLElement;
    expect(last.textContent).toContain("Message 199");
    expect(last.getAttribute("aria-posinset")).toBe("200");
    expect(last.getAttribute("aria-setsize")).toBe("200");
    expect(screen.getByRole("feed", { name: "Messages" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a line per day and a New line above the first unread; a run of one author is grouped", async () => {
    const messages: ChatMessage[] = [
      { id: "a", author: ALEX, createdAt: new Date(START - 86_400_000), body: "yesterday" },
      { id: "b", author: ALEX, createdAt: new Date(START), body: "one" },
      { id: "c", author: ALEX, createdAt: new Date(START + 60_000), body: "two" },
      { id: "d", author: SAM, createdAt: new Date(START + 120_000), body: "three" },
      { id: "e", author: SAM, createdAt: new Date(START + 180_000), body: "four" },
    ];
    render(() => (
      <MessageList
        messages={messages}
        unreadFrom="e"
        timeZone="UTC"
        now={new Date(START + 3_600_000)}
      />
    ));
    await laidOut();
    expect(
      [...document.querySelectorAll('[data-slot="message-list-day"]')].map(
        (one) => one.textContent,
      ),
    ).toEqual(["Yesterday", "Today"]);
    expect(slot("message-list-unread").textContent).toBe("New");
    const grouped = articles().map((one) => one.hasAttribute("data-grouped"));
    // The New line breaks the run, as a day does.
    expect(grouped).toEqual([false, false, true, false, false]);
    expect(rowTop("unread")).toBeLessThan(rowTop("e"));
  });

  test("older messages loaded above keep the row being read where it was", async () => {
    const [messages, setMessages] = createSignal(conversation(100, 200));
    const [hasOlder, setHasOlder] = createSignal(true);
    let asked = 0;
    render(() => (
      <MessageList
        messages={messages()}
        hasOlder={hasOlder()}
        onLoadOlder={() => asked++}
        timeZone="UTC"
      />
    ));
    const viewport = await laidOut();
    scrollViewport(viewport, 1200);
    await settle();
    const first = articles().find((one) => rowTop(one.dataset.messageId ?? "") >= 1200);
    const id = first?.dataset.messageId ?? "";
    const before = rowTop(id) - viewport.scrollTop;
    expect(asked).toBe(0);

    setMessages([...conversation(60, 100), ...messages()]);
    await settle();
    await laidOut();
    expect(rowTop(id) - viewport.scrollTop).toBe(before);
    expect(rowTop(id)).toBeGreaterThan(1200);

    // Near the top it asks for the next page, once until that page lands.
    scrollViewport(viewport, 100);
    scrollViewport(viewport, 50);
    await settle();
    expect(asked).toBe(1);
    setHasOlder(false);
    await settle();
    expect(slot("message-list-start").textContent).toBe("This is the start of the conversation");
  });

  test("a new message follows the end while the reader is there, and waits while they are not", async () => {
    const [messages, setMessages] = createSignal(conversation(0, 100));
    let latest: boolean[] = [];
    render(() => (
      <MessageList
        messages={messages()}
        onAtLatestChange={(at) => latest.push(at)}
        timeZone="UTC"
      />
    ));
    const viewport = await laidOut();
    setMessages(conversation(0, 101));
    await laidOut();
    expect(atBottom(viewport)).toBe(true);
    expect(articles().at(-1)?.textContent).toContain("Message 100");

    scrollViewport(viewport, 800);
    await settle();
    expect(latest).toEqual([false]);
    const id = articles().find((one) => rowTop(one.dataset.messageId ?? "") >= 800)?.dataset
      .messageId as string;
    const offset = rowTop(id) - viewport.scrollTop;
    setMessages(conversation(0, 103));
    await laidOut();
    expect(rowTop(id) - viewport.scrollTop).toBe(offset);
    const jump = screen.getByRole("button", { name: "2 new messages" });
    user.tap(jump);
    await settle();
    expect(atBottom(viewport)).toBe(true);
    expect(screen.queryAllByRole("button", { name: /new message|Jump/u })).toHaveLength(0);
    latest = [];
  });

  test("a row growing above, or the window resizing, keeps the reader's place", async () => {
    render(() => <MessageList messages={conversation(0, 100)} timeZone="UTC" />);
    const viewport = await laidOut();
    scrollViewport(viewport, 1000);
    await settle();
    const drawn = articles().map((one) => one.dataset.messageId ?? "");
    const id = drawn.find((one) => rowTop(one) >= 1000) as string;
    const above = drawn.find((one) => rowTop(one) < 1000) as string;
    const offset = rowTop(id) - viewport.scrollTop;
    // An image above finishes loading and its row grows by 160px.
    heights.set(above, 200);
    resized();
    await laidOut();
    expect(rowTop(id) - viewport.scrollTop).toBe(offset);

    // At the end, a shorter window stays at the end.
    scrollViewport(viewport, rowsHeight() - 400);
    await settle();
    (viewport as unknown as { resize: (next: number) => void }).resize(250);
    resized();
    await laidOut(250);
    expect(atBottom(viewport)).toBe(true);
  });

  test("the arrows move between messages, Home and End to the ends, Escape back out of one", async () => {
    let api: MessageListApi | undefined;
    render(() => (
      <MessageList
        messages={conversation(0, 50)}
        onReply={() => {}}
        controller={(given) => {
          api = given;
        }}
        timeZone="UTC"
      />
    ));
    await laidOut();
    const tabbable = articles().filter((one) => one.tabIndex === 0);
    expect(tabbable.map((one) => one.dataset.messageId)).toEqual(["m49"]);
    (tabbable[0] as HTMLElement).focus();
    user.keyboard("{ArrowUp}");
    await settle();
    expect(document.activeElement?.getAttribute("data-message-id")).toBe("m48");
    user.keyboard("{Home}");
    await settle();
    await settle();
    expect(document.activeElement?.getAttribute("data-message-id")).toBe("m0");
    user.keyboard("{End}");
    await settle();
    expect(document.activeElement?.getAttribute("data-message-id")).toBe("m49");
    const reply = (document.activeElement as HTMLElement).querySelector(
      'button[aria-label="Reply in thread"]',
    ) as HTMLElement;
    reply.focus();
    user.keyboard("{Escape}");
    await settle();
    expect(document.activeElement?.getAttribute("data-message-id")).toBe("m49");
    expect(api?.scrollToMessage("m10")).toBe(true);
    await settle();
    await settle();
    expect(document.activeElement?.getAttribute("data-message-id")).toBe("m10");
    expect(api?.scrollToMessage("nope")).toBe(false);
  });

  test("a new message from someone else is announced, the reader's own and older ones are not", async () => {
    const [messages, setMessages] = createSignal(conversation(0, 10));
    render(() => <MessageList messages={messages()} currentUserId="me" timeZone="UTC" />);
    await laidOut();
    const said = (): string =>
      document.querySelector("[data-barq-live-announcer]")?.textContent ?? "";
    const before = said();
    setMessages([
      ...conversation(0, 10),
      { id: "x", author: ME, createdAt: new Date(START + 3_600_000), body: "mine" },
      { id: "y", author: SAM, createdAt: new Date(START + 3_660_000), body: "Lunch?" },
    ]);
    flush();
    expect(said()).toContain("Sam Lee: Lunch?");
    expect(said().replace(before, "")).not.toContain("mine");
  });

  test("shows its loading line while older messages load, and an empty state with none", async () => {
    const [messages, setMessages] = createSignal<ChatMessage[]>([]);
    render(() => (
      <MessageList messages={messages()} hasOlder={messages().length > 0} isLoadingOlder />
    ));
    expect(screen.getByText("No messages yet")).toBeDefined();
    setMessages(conversation(0, 3));
    await settle();
    expect(slot("message-list-loading").textContent).toContain("Loading earlier messages");
    expect(screen.getByRole("feed").getAttribute("aria-busy")).toBe("true");
  });

  test("right to left in the locale's words, and a class per part", async () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <MessageList
          messages={conversation(0, 4)}
          unreadFrom="m2"
          timeZone="UTC"
          now={new Date(START + 86_400_000 * 3)}
          class="mine"
          classes={{ root: "r", viewport: "v", rows: "w", row: "o", separator: "s", unread: "u" }}
        />
      </Arabic>
    ));
    await laidOut();
    expect(slot("message-list-day").textContent).toMatch(/[٠-٩]/u);
    const pairs = [
      ["message-list", "r"],
      ["message-list-viewport", "v"],
      ["message-list-rows", "w"],
      ["message-list-row", "o"],
      ["message-list-day", "s"],
      ["message-list-unread", "u"],
    ] as const;
    for (const [name, cls] of pairs) expect(slot(name).classList.contains(cls)).toBe(true);
    expect(slot("message-list").classList.contains("mine")).toBe(true);
  });

  test("a server writes the newest rows, at the foot of the estimated space above them", async () => {
    const { code, html, errors } = await serverProcess(`
      import { renderToStringAsync } from "@barqjs/server";
      import { MessageList } from ${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)};
      const messages = Array.from({ length: 200 }, (_, n) => ({
        id: "m" + n,
        author: { id: n % 2 === 0 ? "a" : "b", name: n % 2 === 0 ? "Alex" : "Sam" },
        createdAt: new Date(Date.UTC(2026, 4, 10, 8, 0) + n * 60000),
        body: "Message " + n,
      }));
      export async function page() {
        return await renderToStringAsync(() => (
          <MessageList messages={messages} timeZone="UTC" now={new Date("2026-05-10T12:00:00Z")} serverRows={10} />
        ));
      }
    `);
    expect(errors).toBe("");
    expect(code).toBe(0);
    const bodies = [...html.matchAll(/Message (\d+)/gu)].map((match) => Number(match[1]));
    expect(bodies).toEqual([190, 191, 192, 193, 194, 195, 196, 197, 198, 199]);
    // The rows above are space by estimate, 64px each, with the day's line.
    const rows = /<div[^>]*data-slot="message-list-rows"[^>]*>/u.exec(html)?.[0] ?? "";
    expect(rows).toContain("data-seeded");
    expect(rows).toContain(`padding-block-start: ${String(191 * 64)}px`);
    // Laid out bottom up, so the browser opens it at the newest with no script.
    const viewport = /<div[^>]*data-slot="message-list-viewport"[^>]*>/u.exec(html)?.[0] ?? "";
    expect(viewport).toContain("flex-direction: column-reverse");
    expect(html).toContain("<article");
  });

  test("hydrated, the server's rows are measured where they stand and the list scrolls from them", async () => {
    const result = await hydrates(`
      import { MessageList } from ${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)};
      const messages = Array.from({ length: 60 }, (_, n) => ({
        id: "m" + n,
        author: { id: n % 2 === 0 ? "a" : "b", name: n % 2 === 0 ? "Alex" : "Sam" },
        createdAt: new Date(Date.UTC(2026, 4, 10, 8, 0) + n * 60000),
        body: "Message " + n,
      }));
      export function Page() {
        return <MessageList messages={messages} timeZone="UTC" now={new Date("2026-05-10T12:00:00Z")} serverRows={12} />;
      }
    `);
    const newest = result.container.querySelector('[data-key="m59"]');
    expect(slot("message-list-rows").hasAttribute("data-seeded")).toBe(true);
    expect(articles()).toHaveLength(12);
    heights.set("m59", 90);
    const viewport = await laidOut();
    expect(slot("message-list-rows").hasAttribute("data-seeded")).toBe(false);
    expect(slot("message-list-viewport").style.flexDirection).toBe("");
    // The same element, now placed by the layout at the measured height.
    expect(result.container.querySelector('[data-key="m59"]')).toBe(newest);
    expect(rowTop("m59")).toBe(rowsHeight() - 90);
    expect(rowTop("m58")).toBe(rowsHeight() - 90 - 40);
    expect(atBottom(viewport)).toBe(true);
    result.unmount();
  });

  test("a server's markup is hydrated in place", async () => {
    const result = await hydrates(`
      import { MessageList } from ${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)};
      export function Page() {
        return (
          <MessageList
            aria-label="#general"
            timeZone="UTC"
            messages={[{ id: "a", author: { id: "x", name: "Alex" }, createdAt: new Date("2026-05-10T09:00:00Z"), body: "Hi" }]}
          />
        );
      }
    `);
    expect(result.container.querySelector('[role="feed"]')?.getAttribute("aria-label")).toBe(
      "#general",
    );
    result.unmount();
  });
});
