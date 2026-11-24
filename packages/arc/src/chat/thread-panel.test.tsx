import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { DockedPanels } from "../components/docked-panels.tsx";
import { hydrates, settle } from "../test-arc.ts";
import type { ChatMessage } from "./model.ts";
import { ThreadPanel } from "./thread-panel.tsx";

const ALEX = { id: "alex", name: "Alex Doe" };
const SAM = { id: "sam", name: "Sam Lee" };
const PARENT: ChatMessage = {
  id: "p",
  author: ALEX,
  createdAt: new Date("2026-05-10T09:00:00Z"),
  body: "Should we ship on Friday?",
  thread: { count: 2, participants: [SAM] },
};
const REPLIES: ChatMessage[] = [
  { id: "r1", author: SAM, createdAt: new Date("2026-05-10T09:05:00Z"), body: "Yes" },
  { id: "r2", author: ALEX, createdAt: new Date("2026-05-10T09:30:00Z"), body: "Agreed" },
];

const original = window.matchMedia.bind(window);
afterEach(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: original });
  localStorage.clear();
});

function screenIs(compact: boolean): void {
  function stub(query: string): MediaQueryList {
    return {
      matches: query.includes("pointer: coarse") ? compact : original(query).matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList;
  }
  Object.defineProperty(window, "matchMedia", { configurable: true, value: stub });
}

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

function inPanels(onClose: () => void = () => {}) {
  return (
    <DockedPanels
      active="thread"
      onActiveChange={(id) => {
        if (id === null) onClose();
      }}
      panels={[
        {
          id: "thread",
          label: "Thread",
          content: () => (
            <ThreadPanel
              parent={PARENT}
              replies={REPLIES}
              context="in #design"
              typing={[{ name: "Sam Lee" }]}
              timeZone="UTC"
            />
          ),
          footer: () => <textarea aria-label="Reply" />,
        },
      ]}
    >
      <p>Conversation</p>
    </DockedPanels>
  );
}

describe("ThreadPanel", () => {
  test("docked beside the conversation: the parent, the replies counted, who is typing", async () => {
    screenIs(false);
    render(() => inPanels());
    await settle();
    const panel = screen.getByRole("complementary", { name: "Thread" });
    expect(within(panel).getByText("in #design")).toBeDefined();
    const parent = slot("thread-panel-parent");
    expect(parent.textContent).toContain("Should we ship on Friday?");
    // The parent is not offered as a way back into the thread it heads.
    expect(parent.querySelector('[data-slot="message-item-thread"]')).toBeNull();
    expect(slot("thread-panel-divider").textContent).toBe("2 replies");
    expect(screen.getByRole("feed", { name: "2 replies" })).toBeDefined();
    expect(within(panel).getByRole("status").textContent).toBe("Sam Lee is typing");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("on a phone or under a finger it is a sheet over the conversation, closed by Escape", async () => {
    screenIs(true);
    let closed = 0;
    render(() => inPanels(() => closed++));
    await settle();
    const sheet = screen.getByRole("dialog", { name: "Thread" });
    expect(within(sheet).getByRole("textbox", { name: "Reply" })).toBeDefined();
    expect(slot("thread-panel")).not.toBeNull();
    user.keyboard("{Escape}");
    await settle();
    expect(closed).toBe(1);
  });

  test("a thread with no replies yet shows its parent and the composer alone", () => {
    render(() => (
      <ThreadPanel parent={PARENT} replies={[]} composer={<textarea aria-label="Reply" />} />
    ));
    expect(screen.queryAllByRole("feed")).toHaveLength(0);
    expect(screen.queryAllByRole("separator")).toHaveLength(0);
    expect(slot("thread-panel-composer").querySelector("textarea")).not.toBeNull();
  });

  test("right to left, in the locale's words, with a class per part", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <ThreadPanel
          parent={PARENT}
          replies={REPLIES}
          context="#design"
          composer={<span />}
          timeZone="UTC"
          class="mine"
          classes={{
            root: "r",
            context: "c",
            parent: "p",
            divider: "d",
            replies: "l",
            composer: "o",
          }}
        />
      </Arabic>
    ));
    expect(slot("message-item-time").textContent).toMatch(/[٠-٩]/u);
    const pairs = [
      ["thread-panel", "r"],
      ["thread-panel-context", "c"],
      ["thread-panel-parent", "p"],
      ["thread-panel-divider", "d"],
      ["thread-panel-replies", "l"],
      ["thread-panel-composer", "o"],
    ] as const;
    for (const [name, cls] of pairs) expect(slot(name).classList.contains(cls)).toBe(true);
    expect(slot("thread-panel").classList.contains("mine")).toBe(true);
  });

  test("a server's markup is hydrated in place", async () => {
    const result = await hydrates(`
      import { ThreadPanel } from ${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)};
      export function Page() {
        return (
          <ThreadPanel
            timeZone="UTC"
            parent={{ id: "p", author: { id: "a", name: "Alex" }, createdAt: new Date("2026-05-10T09:00:00Z"), body: "Ship?" }}
            replies={[{ id: "r", author: { id: "b", name: "Sam" }, createdAt: new Date("2026-05-10T09:01:00Z"), body: "Yes" }]}
          />
        );
      }
    `);
    expect(result.container.querySelector('[role="separator"]')?.textContent).toBe("1 reply");
    result.unmount();
  });
});
