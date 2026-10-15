import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import { createChat } from "../../chat/chat.ts";
import MessageScrollerAnchoring from "./message-scroller-anchoring.tsx";
import MessageScrollerCommands from "./message-scroller-commands.tsx";
import MessageScrollerDemo from "./message-scroller-demo.tsx";
import MessageScrollerGroupChat from "./message-scroller-group-chat.tsx";
import MessageScrollerLoadHistory from "./message-scroller-load-history.tsx";
import MessageScrollerPreviousContext from "./message-scroller-previous-context.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const after = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let scope: ParentNode = document;

const items = (): Element[] => [...scope.querySelectorAll('[data-slot="message-scroller-item"]')];

const rows = (): (string | null)[] => items().map((row) => row.getAttribute("data-message-id"));

describe("the message scroller examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("message-scroller")).toEqual([]);
  });

  test("the script plays in order, a turn at a time", () => {
    const chat = createChat()
      .user("one")
      .sleep(10)
      .assistant("two")
      .user("three")
      .assistant("four");
    expect(chat.get(0)).toEqual([]);
    expect(chat.get(1).map((message) => message.text)).toEqual(["one", "two"]);
    expect(chat.next(chat.get(1))?.text).toBe("three");
    expect(chat.next(chat.get())).toBeUndefined();
    expect(chat.replyTo(chat.get()[0]!)).toEqual({ reply: chat.get()[1]!, wait: 10 });
  });

  test("sending appends the prompt as an anchored row and streams the reply into one row", async () => {
    scope = render(() => <MessageScrollerDemo />).container;
    expect(screen.getByText("Morning, salama!")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Send" }));
    await settle();
    expect(scope.querySelector('[role="log"]')?.getAttribute("aria-relevant")).toBe("additions");
    expect(
      document
        .querySelector('[data-slot="message-scroller-item"]')
        ?.getAttribute("data-scroll-anchor"),
    ).toBe("true");
    expect(rows()).toHaveLength(1);
    await after(1100);
    await settle();
    expect(rows()).toHaveLength(2);
    const reply = items()[1];
    const early = reply?.textContent?.length ?? 0;
    await after(200);
    await settle();
    expect(reply?.isConnected).toBe(true);
    expect(reply?.textContent?.length ?? 0).toBeGreaterThan(early);
  });

  test("the log is busy while a reply is on its way, and settled once it has arrived", async () => {
    scope = render(() => <MessageScrollerDemo />).container;
    await user.click(screen.getByRole("button", { name: "Send" }));
    await settle();
    const log = (): Element | null => scope.querySelector('[role="log"]');
    const busy = (): boolean => log()?.getAttribute("aria-busy") === "true";
    expect(log()?.getAttribute("aria-busy")).toBe("true");
    for (let waited = 0; busy() && waited < 8000; waited += 100) {
      await after(100);
      await settle();
    }
    expect(log()?.getAttribute("aria-busy")).toBe("false");
    expect(rows()).toHaveLength(2);
  }, 10_000);

  test("the anchor role decides which rows are anchors", async () => {
    scope = render(() => <MessageScrollerAnchoring />).container;
    await user.click(screen.getByRole("button", { name: "Anchor assistant messages" }));
    await settle();
    const send = screen.getByRole("button", { name: "Send Message" });
    await user.click(send);
    await settle();
    await user.click(send);
    await settle();
    expect(items().map((row) => row.getAttribute("data-scroll-anchor"))).toEqual(["false", "true"]);
  });

  test("the group chat adds a marker turn and then the reply", async () => {
    scope = render(() => <MessageScrollerGroupChat />).container;
    expect(rows()).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Add Omar" }));
    await settle();
    expect(screen.getByText("Omar has joined the chat")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Send Message as Omar" }));
    await settle();
    expect(rows()).toHaveLength(5);
  });

  test("loading history prepends the earlier messages", async () => {
    scope = render(() => <MessageScrollerLoadHistory />).container;
    expect(rows().filter((id) => id !== null)).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: "Load History" }));
    await settle();
    expect(rows().filter((id) => id !== null)).toHaveLength(10);
    expect(screen.getByRole("button", { name: "History Loaded" })).toBeTruthy();
  });

  test("the previous context example opens on two exchanges", () => {
    scope = render(() => <MessageScrollerPreviousContext />).container;
    expect(rows()).toHaveLength(4);
    expect(screen.getByRole("slider", { name: "Previous context peek" })).toBeTruthy();
  });

  test("the command menu lists each prompt", async () => {
    scope = render(() => <MessageScrollerCommands />).container;
    await user.click(screen.getByRole("button", { name: "Jump to..." }));
    await settle();
    expect(screen.getAllByRole("menuitem")).toHaveLength(4);
    await user.keyboard("{Escape}");
    await settle();
  });
});
