import { afterEach, describe, expect, test } from "bun:test";
import { type Child } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";

import { ConfirmHost } from "../components/confirm.tsx";
import { markdownToDocument } from "../editor/document.ts";
import { hydrates, settle } from "../test-arc.ts";
import { MessageItem } from "./message-item.tsx";
import type { ChatMessage } from "./model.ts";
import { sampleSource, scrollViewport, sizeViewport } from "./test-chat.ts";

const ME = { id: "me", name: "Salama Ashoush" };
const ALEX = { id: "alex", name: "Alex Doe" };

const MESSAGE: ChatMessage = {
  id: "m1",
  author: ALEX,
  createdAt: new Date("2026-05-10T09:30:00Z"),
  editedAt: new Date("2026-05-10T09:35:00Z"),
  body: "The build is green.\nShipping after lunch.",
  reactions: [{ emoji: "👍", count: 2, reacted: true }],
  thread: {
    count: 3,
    participants: [{ name: "Sam Lee" }, ME],
    lastReplyAt: new Date("2026-05-10T10:00:00Z"),
  },
  pinned: true,
};

const original = window.matchMedia.bind(window);
afterEach(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: original });
});

function coarse(): void {
  const stub = (query: string): MediaQueryList =>
    ({
      matches: query.includes("pointer: coarse") ? true : original(query).matches,
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

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

function count(name: string): number {
  return document.querySelectorAll(`[data-slot="${name}"]`).length;
}

describe("MessageItem", () => {
  test("an article named by its author and time, with the body, edited, pinned and its thread", async () => {
    const opened: string[] = [];
    render(() => (
      <MessageItem
        message={MESSAGE}
        timeZone="UTC"
        now={new Date("2026-05-10T12:00:00Z")}
        onOpenThread={(message) => opened.push(message.id)}
      />
    ));
    const article = screen.getByRole("article", { name: "Alex Doe May 10, 2026 at 9:30 AM" });
    expect(slot("message-item-body").textContent).toBe(
      "The build is green.\nShipping after lunch.",
    );
    expect(slot("message-item-edited").textContent).toBe("(edited)");
    expect(slot("message-item-pinned").textContent).toBe("Pinned");
    const thread = within(article).getByRole("button", { name: /3 replies/u });
    expect(thread.textContent).toContain("Last reply");
    expect(thread.querySelector("time")?.getAttribute("datetime")).toBe("2026-05-10T10:00:00.000Z");
    await user.click(thread);
    expect(opened).toEqual(["m1"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a later message of a run has no avatar, and its name is left for a screen reader", () => {
    render(() => <MessageItem message={MESSAGE} grouped timeZone="UTC" />);
    expect(count("person-avatar")).toBe(0);
    expect(slot("message-item-header").className).toContain(" ");
    expect(screen.getByRole("article", { name: /Alex Doe/u })).toBeDefined();
  });

  test("pictures open the lightbox, files download, and audio plays in the player", async () => {
    render(() => (
      <MessageItem
        message={{
          ...MESSAGE,
          attachments: [
            { id: "a", kind: "image", name: "diagram.png", url: "/diagram.png" },
            { id: "b", kind: "file", name: "report.pdf", url: "/report.pdf", size: 2048 },
            { id: "c", kind: "audio", name: "voice note", url: "/note.webm" },
          ],
        }}
      />
    ));
    const group = screen.getByRole("group", { name: "Attachments" });
    const link = within(group).getByRole("link", { name: "Download report.pdf" });
    expect(link.getAttribute("download")).toBe("report.pdf");
    expect(slot("message-item-file").textContent).toContain("2 kB");
    expect(group.querySelector("audio")).not.toBeNull();
    await user.click(within(group).getByRole("button", { name: "diagram.png" }));
    await settle();
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  test("a reaction toggles, and the add button opens the emoji picker", async () => {
    const reacted: string[] = [];
    render(() => (
      <MessageItem
        message={MESSAGE}
        emojiSource={sampleSource()}
        onReact={(message, emoji, add) => reacted.push(`${message.id}:${emoji}:${String(add)}`)}
      />
    ));
    const chips = within(slot("message-item-reactions")).getAllByRole("button");
    await user.click(chips[0] as HTMLElement);
    expect(reacted).toEqual(["m1:👍:false"]);
    const toolbar = screen.getByRole("toolbar", { name: "Message from Alex Doe" });
    await user.click(within(toolbar).getByRole("button", { name: "Add a reaction" }));
    await settle();
    await waitFor(() => expect(count("emoji-picker-viewport")).toBe(1));
    const viewport = slot("emoji-picker-viewport");
    sizeViewport(viewport, { height: 300 });
    scrollViewport(viewport, 0);
    await settle();
    await user.click(screen.getByRole("option", { name: "cat face" }));
    await settle();
    expect(reacted.at(-1)).toBe("m1:🐱:true");
  });

  test("its own message is edited and deleted after asking; any can be pinned and linked", async () => {
    const calls: string[] = [];
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => written.push(text) },
    });
    const handlers = {
      currentUserId: "me",
      onReply: (message: ChatMessage) => calls.push(`reply:${message.id}`),
      onEdit: (message: ChatMessage) => calls.push(`edit:${message.id}`),
      onDelete: (message: ChatMessage) => calls.push(`delete:${message.id}`),
      onPin: (message: ChatMessage, pinned: boolean) =>
        calls.push(`pin:${message.id}:${String(pinned)}`),
      linkTo: (message: ChatMessage) => `https://example.com/m/${message.id}`,
    };
    render(() => (
      <>
        <MessageItem
          message={{ ...MESSAGE, id: "mine", author: ME, pinned: false }}
          {...handlers}
        />
        <MessageItem message={MESSAGE} {...handlers} />
        <ConfirmHost />
      </>
    ));
    const [mine, theirs] = screen.getAllByRole("toolbar");
    expect(
      within(theirs as HTMLElement).queryAllByRole("button", { name: "Edit message" }),
    ).toHaveLength(0);
    await user.click(within(mine as HTMLElement).getByRole("button", { name: "Reply in thread" }));
    await user.click(within(mine as HTMLElement).getByRole("button", { name: "Edit message" }));
    await user.click(within(mine as HTMLElement).getByRole("button", { name: "More actions" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Copy link" }));
    await settle();
    expect(written).toEqual(["https://example.com/m/mine"]);
    await user.click(within(mine as HTMLElement).getByRole("button", { name: "More actions" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Pin to conversation" }));
    await settle();
    await user.click(within(mine as HTMLElement).getByRole("button", { name: "More actions" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Delete message" }));
    await settle();
    expect(calls).not.toContain("delete:mine");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await settle();
    expect(calls).toEqual(["reply:mine", "edit:mine", "pin:mine:true", "delete:mine"]);
  });

  test("under a finger a long press opens the actions in a sheet", async () => {
    coarse();
    const calls: string[] = [];
    render(() => (
      <MessageItem
        message={MESSAGE}
        onReply={(message) => calls.push(`reply:${message.id}`)}
        onReact={(_message, emoji) => calls.push(`react:${emoji}`)}
      />
    ));
    await settle();
    user.pointerHold(slot("message-item"), { pointerType: "touch" });
    await new Promise((resolve) => setTimeout(resolve, 600));
    user.pointerUp(slot("message-item"), { pointerType: "touch" });
    await settle();
    const sheet = slot("message-item-sheet");
    expect(sheet).not.toBeNull();
    await user.click(within(sheet).getByRole("button", { name: "🎉" }));
    await settle();
    expect(calls).toEqual(["react:🎉"]);
  });

  test("a message still sending is dimmed and says so; one refused offers Retry and Discard", async () => {
    const calls: string[] = [];
    render(() => (
      <>
        <MessageItem message={{ ...MESSAGE, id: "p", state: "pending" }} onReact={() => {}} />
        <MessageItem
          message={{ ...MESSAGE, id: "f", state: "failed", error: "You are offline" }}
          onRetry={(message) => calls.push(`retry:${message.id}`)}
          onDiscard={(message) => calls.push(`discard:${message.id}`)}
        />
      </>
    ));
    const [pending, failed] = screen.getAllByRole("article");
    expect(pending?.getAttribute("aria-busy")).toBe("true");
    expect(pending?.textContent).toContain("Sending");
    expect(within(pending as HTMLElement).queryAllByRole("toolbar")).toHaveLength(0);
    expect(failed?.textContent).toContain("You are offline");
    await user.click(within(failed as HTMLElement).getByRole("button", { name: "Retry" }));
    await user.click(within(failed as HTMLElement).getByRole("button", { name: "Discard" }));
    expect(calls).toEqual(["retry:f", "discard:f"]);
  });

  test("as bubbles, the reader's own sit at the reading end; rich content comes from renderBody", () => {
    render(() => (
      <>
        <MessageItem
          message={{ ...MESSAGE, author: ME }}
          appearance="bubble"
          currentUserId="me"
          renderBody={(message) => <strong>{message.body?.toUpperCase()}</strong>}
        />
        <MessageItem message={MESSAGE} appearance="bubble" currentUserId="me" />
      </>
    ));
    const [own, theirs] = [...document.querySelectorAll('[data-slot="message"]')];
    expect(own?.getAttribute("data-align")).toBe("end");
    expect(theirs?.getAttribute("data-align")).toBe("start");
    expect(own?.querySelector("strong")?.textContent).toContain("THE BUILD IS GREEN");
    expect(count("bubble")).toBe(2);
  });

  test("rich content is drawn by RichTextRenderer", () => {
    render(() => (
      <MessageItem
        message={{
          ...MESSAGE,
          body: undefined,
          content: markdownToDocument("Ship **today**, see [the plan](https://example.com)"),
        }}
      />
    ));
    const body = slot("message-item-body");
    expect(body.querySelector("strong")?.textContent).toBe("today");
    expect(body.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
  });

  test("right to left in the locale's digits, and a class per part", () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <MessageItem
          message={MESSAGE}
          timeZone="UTC"
          onReply={() => {}}
          class="mine"
          classes={{
            root: "r",
            header: "h",
            author: "a",
            time: "t",
            body: "b",
            reactions: "re",
            thread: "th",
            actions: "ac",
          }}
        />
      </Arabic>
    ));
    expect(slot("message-item-time").textContent).toMatch(/[٠-٩]/u);
    const pairs = [
      ["message-item", "r"],
      ["message-item-header", "h"],
      ["message-item-author", "a"],
      ["message-item-time", "t"],
      ["message-item-body", "b"],
      ["message-item-reactions", "re"],
      ["message-item-thread", "th"],
      ["message-item-actions", "ac"],
    ] as const;
    for (const [name, cls] of pairs) expect(slot(name).classList.contains(cls)).toBe(true);
    expect(slot("message-item").classList.contains("mine")).toBe(true);
  });

  test("a server's markup is hydrated in place", async () => {
    const result = await hydrates(`
      import { MessageItem } from ${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)};
      export function Page() {
        return (
          <MessageItem
            timeZone="UTC"
            now={new Date("2026-05-10T12:00:00Z")}
            message={{
              id: "m1",
              author: { id: "a", name: "Alex Doe" },
              createdAt: new Date("2026-05-10T09:30:00Z"),
              body: "Hello",
              reactions: [{ emoji: "👍", count: 1 }],
            }}
          />
        );
      }
    `);
    expect(result.container.querySelector('[data-slot="message-item-body"]')?.textContent).toBe(
      "Hello",
    );
    result.unmount();
  });
});
