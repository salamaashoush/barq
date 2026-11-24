import { describe, expect, test } from "bun:test";
import { type Child, createSignal, flush } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { type AIMessage, AIChatPanel } from "./ai-chat.tsx";

const QUESTION: AIMessage = {
  id: "q",
  role: "user",
  parts: [{ type: "text", text: "Which checks failed?" }],
};

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

function all(name: string): HTMLElement[] {
  return [...document.querySelectorAll(`[data-slot="${name}"]`)] as HTMLElement[];
}

describe("AIChatPanel", () => {
  test("empty, it offers its suggestions, and one sends", async () => {
    const sent: string[] = [];
    render(() => (
      <AIChatPanel
        messages={[]}
        suggestions={["Summarise this page", "What changed?"]}
        onSend={(text) => sent.push(text)}
      />
    ));
    const list = screen.getByRole("list", { name: "Suggestions" });
    await user.click(within(list).getByRole("button", { name: "What changed?" }));
    expect(sent).toEqual(["What changed?"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a streaming reply is written out as markdown as it arrives, and the log is busy", async () => {
    const [reply, setReply] = createSignal<AIMessage>({
      id: "a",
      role: "assistant",
      parts: [],
      status: "streaming",
    });
    render(() => (
      <AIChatPanel messages={[QUESTION, reply()]} onSend={() => {}} onStop={() => {}} />
    ));
    expect(slot("ai-chat-generating").textContent).toBe("Writing a reply");
    expect(within(slot("ai-chat")).getByRole("log").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("button", { name: "Stop" })).toBeDefined();
    setReply({ ...reply(), parts: [{ type: "text", text: "Two checks **failed**:\n\n- login" }] });
    flush();
    const text = all("ai-chat-text").at(-1) as HTMLElement;
    expect(text.querySelector("strong")?.textContent).toBe("failed");
    expect(text.querySelectorAll("li")).toHaveLength(1);
    setReply({
      ...reply(),
      status: "done",
      parts: [{ type: "text", text: "Two checks **failed**:\n\n- login\n- checkout" }],
      citations: [{ title: "Run 42", href: "https://example.com/runs/42" }],
    });
    await settle();
    expect((all("ai-chat-text").at(-1) as HTMLElement).querySelectorAll("li")).toHaveLength(2);
    expect(within(slot("ai-chat")).getByRole("log").getAttribute("aria-busy")).toBe("false");
    const sources = screen.getByRole("region", { name: "Sources" });
    expect(within(sources).getByRole("link", { name: "Run 42" }).getAttribute("href")).toBe(
      "https://example.com/runs/42",
    );
    expect(screen.getByRole("button", { name: "Send" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("tool calls are listed as they run, and a proposed change is approved or rejected", async () => {
    const calls: string[] = [];
    const reply: AIMessage = {
      id: "a",
      role: "assistant",
      parts: [
        {
          type: "tool",
          call: { id: "t1", name: "search runs", state: "done", input: { failed: true } },
        },
        {
          type: "tool",
          call: {
            id: "t2",
            name: "pause the check",
            state: "awaiting-approval",
            output: "Pause login",
          },
        },
        { type: "tool", call: { id: "t3", name: "rerun", state: "running" } },
      ],
    };
    render(() => (
      <AIChatPanel
        messages={[QUESTION, reply]}
        onSend={() => {}}
        onApprove={(call) => calls.push(`approve:${call.id}`)}
        onReject={(call) => calls.push(`reject:${call.id}`)}
      />
    ));
    expect(screen.getByRole("group", { name: "Ran search runs" })).toBeDefined();
    expect(screen.getByRole("group", { name: "Running rerun" })).toBeDefined();
    const proposal = screen.getByRole("group", { name: "pause the check needs your approval" });
    await user.click(within(proposal).getByRole("button", { name: "Approve" }));
    user.tap(within(proposal).getByRole("button", { name: "Reject" }));
    expect(calls).toEqual(["approve:t2", "reject:t2"]);
    const search = screen.getByRole("group", { name: "Ran search runs" });
    const more = within(search).getByRole("button", { name: "Show more" });
    expect(slot("ai-chat-tool-details").hidden).toBe(true);
    await user.click(more);
    await settle();
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(search.querySelector("pre")?.textContent).toContain('"failed": true');
  });

  test("Enter sends, Shift+Enter does not, and Regenerate and Copy act on the last reply", async () => {
    const sent: string[] = [];
    let again = 0;
    render(() => (
      <AIChatPanel
        messages={[
          QUESTION,
          { id: "a", role: "assistant", parts: [{ type: "text", text: "Done." }] },
        ]}
        onSend={(text) => sent.push(text)}
        onRegenerate={() => again++}
      />
    ));
    const input = screen.getByRole("textbox", { name: "Message the assistant" });
    await user.type(input, "Thanks");
    user.key("Enter", { shiftKey: true });
    expect(sent).toEqual([]);
    user.keyboard("{Enter}");
    await settle();
    expect(sent).toEqual(["Thanks"]);
    expect((input as HTMLTextAreaElement).value).toBe("");
    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(again).toBe(1);
    expect(screen.getByRole("button", { name: "Copy" })).toBeDefined();
  });

  test("a failed or stopped reply says so; the caller's composer replaces the built-in one", () => {
    render(() => (
      <AIChatPanel
        messages={[
          QUESTION,
          { id: "a", role: "assistant", parts: [], status: "error" },
          {
            id: "b",
            role: "assistant",
            parts: [{ type: "text", text: "Partial" }],
            status: "stopped",
          },
        ]}
        onSend={() => {}}
        composer={<div data-slot="mine">composer</div>}
      />
    ));
    expect(screen.getByRole("alert").textContent).toContain("The reply could not be finished");
    expect(slot("ai-chat-stopped").textContent).toBe("Stopped");
    expect(slot("mine")).not.toBeNull();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  test("right to left, and a class per part", () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <AIChatPanel
          messages={[
            QUESTION,
            { id: "a", role: "assistant", parts: [{ type: "text", text: "نعم" }] },
          ]}
          onSend={() => {}}
          class="mine"
          classes={{ root: "r", message: "m", text: "t", composer: "c", actions: "a" }}
        />
      </Arabic>
    ));
    expect(slot("ai-chat").classList.contains("r")).toBe(true);
    expect(slot("ai-chat").classList.contains("mine")).toBe(true);
    expect(slot("ai-chat-message").classList.contains("m")).toBe(true);
    expect(slot("ai-chat-text").classList.contains("t")).toBe(true);
    expect(slot("ai-chat-composer").classList.contains("c")).toBe(true);
    expect(slot("ai-chat-actions").classList.contains("a")).toBe(true);
    const [question, answer] = all("message");
    expect(question?.getAttribute("data-align")).toBe("end");
    expect(answer?.getAttribute("data-align")).toBe("start");
  });

  test("a server's markup is hydrated in place", async () => {
    const result = await hydrates(`
      import { AIChatPanel } from ${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)};
      export function Page() {
        return (
          <AIChatPanel
            onSend={(text) => text}
            messages={[
              { id: "q", role: "user", parts: [{ type: "text", text: "Hi" }] },
              { id: "a", role: "assistant", parts: [{ type: "text", text: "Hello **there**" }] },
            ]}
          />
        );
      }
    `);
    expect(result.container.querySelector("strong")?.textContent).toBe("there");
    result.unmount();
  });
});
