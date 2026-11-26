import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { DockedPanelToggle } from "../components/docked-panels.tsx";
import { hydrates, settle } from "../test-arc.ts";
import { ConversationLayout } from "./conversation-layout.tsx";

function slot(name: string): HTMLElement | null {
  return document.querySelector(`[data-slot="${name}"]`);
}

describe("ConversationLayout", () => {
  test("the name and topic head the column, the messages fill it and the composer docks below", async () => {
    render(() => (
      <ConversationLayout
        heading="design"
        icon={<svg />}
        topic="Reviews and the Friday demo"
        actions={<button type="button">Call</button>}
        banner={<p>A call is on</p>}
        typing={<p>Salama is typing</p>}
        composer={<textarea aria-label="Message #design" />}
      >
        <ul aria-label="Messages">
          <li>Hello</li>
        </ul>
      </ConversationLayout>
    ));
    await settle();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("design");
    expect(slot("conversation-icon")?.getAttribute("aria-hidden")).toBe("true");
    expect(slot("conversation-topic")?.textContent).toBe("Reviews and the Friday demo");
    const main = slot("docked-panels-main") as HTMLElement;
    expect([...main.children].map((one) => one.getAttribute("data-slot"))).toEqual([
      "conversation-header",
      "conversation-banner",
      "conversation-body",
      "conversation-dock",
    ]);
    const dock = slot("conversation-dock") as HTMLElement;
    expect(within(dock).getByRole("textbox", { name: "Message #design" })).toBeDefined();
    expect(dock.firstElementChild?.getAttribute("data-slot")).toBe("conversation-typing");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a toggle in the header opens a panel beside the whole column, and closing returns", async () => {
    const [active, setActive] = createSignal<string | null>(null);
    render(() => (
      <ConversationLayout
        heading="design"
        actions={<DockedPanelToggle panel="members" />}
        panels={[{ id: "members", label: "Members", count: 3, content: () => <p>Salama</p> }]}
        activePanel={active()}
        onActivePanelChange={setActive}
        breakpoint="sm"
      >
        <p>Messages</p>
      </ConversationLayout>
    ));
    await settle();
    await user.click(screen.getByRole("button", { name: /Members/ }));
    await settle();
    expect(active()).toBe("members");
    const panel = screen.getByRole("complementary", { name: "Members" });
    expect(panel.textContent).toContain("Salama");
    await user.click(within(panel).getByRole("button", { name: /Close/ }));
    await settle();
    expect(active()).toBe(null);
  });

  test("a person's conversation: a subtitle under the name, no topic, no composer when one cannot write", async () => {
    render(() => (
      <ConversationLayout heading="Salama Ashoush" subtitle="Active now">
        <p>Messages</p>
      </ConversationLayout>
    ));
    await settle();
    expect(slot("conversation-subtitle")?.textContent).toBe("Active now");
    for (const name of ["topic", "tabs", "banner", "dock", "actions", "icon"]) {
      expect(slot(`conversation-${name}`)).toBeNull();
    }
  });

  test("names itself with an h2 inside a page, and in a right-to-left page", async () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <ConversationLayout
          heading="التصميم"
          tabs={<nav aria-label="أقسام">…</nav>}
          renders={{ heading: (part, content) => <h2 {...part.props}>{content}</h2> }}
        />
      </Rtl>
    ));
    await settle();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("التصميم");
    expect(slot("conversation-tabs")).not.toBeNull();
  });

  test("a server's conversation is hydrated in place", async () => {
    const result = await hydrates(`
      import { ConversationLayout } from ${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)};
      export function Page() {
        return (
          <ConversationLayout heading="design" topic="Reviews" composer={<textarea aria-label="Message" />}>
            <p>Hello</p>
          </ConversationLayout>
        );
      }
    `);
    expect(result.container.textContent).toContain("Hello");
    result.unmount();
  });
});
