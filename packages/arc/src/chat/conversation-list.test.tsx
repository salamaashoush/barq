import { afterEach, describe, expect, test } from "bun:test";
import { type Child } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";
import { Sidebar, SidebarContent, SidebarProvider } from "@barqjs/ui/sidebar";

import { hydrates, settle } from "../test-arc.ts";
import { type ConversationGroup, ConversationList } from "./conversation-list.tsx";

afterEach(() => localStorage.clear());

const GROUPS: ConversationGroup[] = [
  {
    id: "channels",
    label: "Channels",
    action: { label: "New channel", onPress: () => created.push("channel") },
    conversations: [
      { id: "general", name: "general", unread: 4, href: "/c/general" },
      { id: "design", name: "design", private: true, unread: 2, mentions: 1, href: "/c/design" },
      { id: "random", name: "random", unread: 9, muted: true, href: "/c/random" },
    ],
  },
  {
    id: "direct",
    label: "Direct messages",
    conversations: [
      {
        id: "dm-alex",
        name: "Alex Doe",
        kind: "direct",
        person: { name: "Alex Doe", presence: "away" },
        draft: true,
      },
      { id: "group", name: "Alex, Sam", kind: "group" },
    ],
  },
];
const created: string[] = [];

/** Built inside the provider, as the sidebar's own parts must be. */
function inSidebar(children: () => Child) {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarContent>{children()}</SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}

function item(name: RegExp): HTMLElement {
  return screen.getByRole("link", { name });
}

describe("ConversationList", () => {
  test("each conversation says its kind, its unread, its mentions, muted and draft", async () => {
    render(() => inSidebar(() => <ConversationList groups={GROUPS} activeId="general" />));
    const nav = screen.getByRole("navigation", { name: "Conversations" });
    expect(within(nav).getByRole("list", { name: "Channels" })).toBeDefined();
    const general = item(/^general/u);
    expect(general.getAttribute("aria-current")).toBe("page");
    expect(general.textContent).toContain("4 unread");
    expect(general.hasAttribute("data-unread")).toBe(true);
    expect(item(/^design/u).textContent).toContain("Private, 1 mention, 2 unread");
    const random = item(/^random/u);
    expect(random.textContent).toContain("Muted");
    expect(random.textContent).not.toContain("unread");
    expect(random.hasAttribute("data-unread")).toBe(false);
    const badges = [...document.querySelectorAll('[data-slot="sidebar-menu-badge"]')].map(
      (one) => one.textContent,
    );
    // Muted counts nothing but mentions.
    expect(badges).toEqual(["4", "1"]);
    expect(screen.getByRole("button", { name: /^Alex Doe ?, Draft$/u })).toBeDefined();
    expect(
      document.querySelector('[data-slot="presence-dot"]')?.getAttribute("data-presence"),
    ).toBe("away");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a heading folds its group, remembered; the action and a choice reach the caller", async () => {
    const chosen: string[] = [];
    render(() =>
      inSidebar(() => (
        <ConversationList
          groups={GROUPS}
          storageKey="side"
          onSelect={(conversation) => chosen.push(conversation.id)}
        />
      )),
    );
    const heading = screen.getByRole("button", { name: "Channels" });
    expect(heading.getAttribute("aria-expanded")).toBe("true");
    await user.click(heading);
    await settle();
    expect(heading.getAttribute("aria-expanded")).toBe("false");
    const content = document.getElementById(heading.getAttribute("aria-controls") ?? "");
    expect(content?.hidden).toBe(true);
    expect(JSON.parse(localStorage.getItem("arc-conversations:side") ?? "[]")).toEqual([
      "channels",
    ]);
    user.keyboard("{Enter}");
    await settle();
    expect(heading.getAttribute("aria-expanded")).toBe("true");
    await user.click(screen.getByRole("button", { name: "New channel" }));
    expect(created).toEqual(["channel"]);
    user.tap(screen.getByRole("button", { name: /^Alex, Sam/u }));
    expect(chosen).toEqual(["group"]);
  });

  test("right to left, and a class per part", () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        {inSidebar(() => (
          <ConversationList
            groups={GROUPS}
            class="mine"
            classes={{ root: "r", heading: "h", button: "b", name: "n", badge: "g" }}
          />
        ))}
      </Arabic>
    ));
    const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`);
    expect(slot("conversation-list")?.classList.contains("r")).toBe(true);
    expect(slot("conversation-list")?.classList.contains("mine")).toBe(true);
    expect(slot("conversation-list-heading")?.classList.contains("h")).toBe(true);
    expect(slot("conversation-list-button")?.classList.contains("b")).toBe(true);
    expect(slot("conversation-list-name")?.classList.contains("n")).toBe(true);
    expect(slot("sidebar-menu-badge")?.classList.contains("g")).toBe(true);
  });

  test("a server's markup is hydrated in place", async () => {
    const result = await hydrates(`
      import { Sidebar, SidebarContent, SidebarProvider } from "@barqjs/ui/sidebar";
      import { ConversationList } from ${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)};
      export function Page() {
        return (
          <SidebarProvider>
            <Sidebar>
              <SidebarContent>
                <ConversationList
                  activeId="a"
                  groups={[{ id: "c", label: "Channels", conversations: [{ id: "a", name: "general", unread: 3, href: "/a" }] }]}
                />
              </SidebarContent>
            </Sidebar>
          </SidebarProvider>
        );
      }
    `);
    expect(result.container.querySelector('[aria-current="page"]')?.textContent).toContain(
      "general",
    );
    result.unmount();
  });
});
