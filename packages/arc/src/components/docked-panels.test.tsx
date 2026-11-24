import { afterEach, describe, expect, test } from "bun:test";
import { createSignal, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { Info } from "@barqjs/lucide/icons/info";
import { MessageSquare } from "@barqjs/lucide/icons/message-square";
import { ariaViolations, render, screen, user, waitFor } from "@barqjs/testing";
import { touch } from "@barqjs/ui/shared-touch";

import { hydrates, settle, wears } from "../test-arc.ts";
import { type DockedPanel, DockedPanelToggle, DockedPanels } from "./docked-panels.tsx";

const PANELS: DockedPanel[] = [
  { id: "details", label: "Details", icon: Info, content: () => <p>Owner: Acme</p> },
  {
    id: "comments",
    label: "Comments",
    icon: MessageSquare,
    count: 3,
    content: () => <p>Two threads</p>,
    footer: () => <button type="button">Send</button>,
  },
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

function page(props: Partial<Parameters<typeof DockedPanels>[0]> = {}) {
  return (
    <DockedPanels panels={PANELS} {...props}>
      <DockedPanelToggle panel="details" />
      <DockedPanelToggle panel="comments" />
      <article>Document</article>
    </DockedPanels>
  );
}

function slot(name: string): HTMLElement | null {
  return document.querySelector(`[data-slot="${name}"]`);
}

describe("DockedPanels", () => {
  test("a toggle docks its panel beside the page as a named landmark, the page still in reach", async () => {
    screenIs(false);
    render(() => page());
    await settle();
    expect(slot("docked-panel")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Comments, 3" });
    await user.click(toggle);
    await settle();
    const panel = screen.getByRole("complementary", { name: "Comments" });
    expect(panel.textContent).toContain("Two threads");
    expect(panel.textContent).toContain("Send");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("separator", { name: "Resize the panel" })).toBeDefined();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(slot("docked-panels")?.getAttribute("data-presentation")).toBe("docked");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("one at a time: another toggle swaps it, the same one closes it", async () => {
    screenIs(false);
    render(() => page());
    await settle();
    await user.click(screen.getByRole("button", { name: "Details" }));
    await settle();
    await user.click(screen.getByRole("button", { name: "Comments, 3" }));
    await settle();
    expect(screen.getAllByRole("complementary")).toHaveLength(1);
    expect(screen.getByRole("complementary", { name: "Comments" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Comments, 3" }));
    await settle();
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  test("Escape inside it or its close button closes it and gives focus back to its toggle", async () => {
    screenIs(false);
    const [active, setActive] = createSignal<string | null>("details");
    render(() => page({ active: active(), onActiveChange: setActive }));
    await settle();
    screen.getByRole("button", { name: "Close Details" }).focus();
    await user.keyboard("{Escape}");
    await settle();
    expect(active()).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Details" })),
    );
    setActive("details");
    await settle();
    await user.click(screen.getByRole("button", { name: "Close Details" }));
    await settle();
    expect(active()).toBeNull();
  });

  test("its width is remembered under its storage key", async () => {
    screenIs(false);
    localStorage.setItem("arc-docked:doc", "42");
    render(() => page({ storageKey: "doc", defaultActive: "details" }));
    await settle();
    const handle = screen.getByRole("separator", { name: "Resize the panel" });
    expect(Number(handle.getAttribute("aria-valuenow"))).toBe(58);
    handle.focus();
    await user.keyboard("{ArrowLeft}");
    await settle();
    await waitFor(() => expect(localStorage.getItem("arc-docked:doc")).toBe("43"));
  });

  test("under a finger the panel is a sheet over the page, with its toggle a finger's size", async () => {
    screenIs(true);
    render(() => page());
    await settle();
    const toggle = screen.getByRole("button", { name: "Details" });
    expect(wears(toggle, touch.target)).toBe(true);
    user.tap(toggle);
    await settle();
    expect(slot("docked-panels")?.getAttribute("data-presentation")).toBe("sheet");
    await waitFor(() =>
      expect(slot("responsive-overlay")?.getAttribute("data-presentation")).toBe("sheet"),
    );
    expect(screen.getByRole("dialog", { name: "Details" }).textContent).toContain("Owner: Acme");
  });

  test("runs right to left, the panel at the reading end", async () => {
    screenIs(false);
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => <Arabic>{page({ defaultActive: "details" })}</Arabic>);
    await settle();
    const group = document.querySelector('[data-slot="resizable-panel-group"]') as HTMLElement;
    expect(group.lastElementChild?.querySelector('[data-slot="docked-panel"]')).not.toBeNull();
    expect(screen.getByRole("complementary").closest("[dir=rtl]")).not.toBeNull();
  });

  test("takes a class per part", async () => {
    screenIs(false);
    render(() =>
      page({
        class: "mine",
        defaultActive: "comments",
        classes: {
          root: "r",
          main: "m",
          panel: "p",
          header: "h",
          title: "t",
          body: "b",
          footer: "f",
        },
      }),
    );
    await settle();
    const pairs = [
      ["docked-panels", "r"],
      ["docked-panels-main", "m"],
      ["docked-panel", "p"],
      ["docked-panel-header", "h"],
      ["docked-panel-title", "t"],
      ["docked-panel-body", "b"],
      ["docked-panel-footer", "f"],
    ] as const;
    for (const [name, cls] of pairs) expect(slot(name)?.classList.contains(cls)).toBe(true);
    expect(slot("docked-panels")?.classList.contains("mine")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { DockedPanels, DockedPanelToggle } from "<arc>";
      export function Page() {
        return (
          <DockedPanels
            defaultActive="details"
            panels={[{ id: "details", label: "Details", content: () => <p>Facts</p> }]}
          >
            <DockedPanelToggle panel="details" />
            <article>Document</article>
          </DockedPanels>
        );
      }
    `);
    expect(result.container.querySelector('[data-slot="docked-panel-body"]')?.textContent).toBe(
      "Facts",
    );
    result.unmount();
  });
});
