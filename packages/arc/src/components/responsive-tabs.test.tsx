import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { DEV, createSignal, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { hydrates, settle, wears } from "../test-arc.ts";
import { Indicator, indicatorStyles } from "./indicator.tsx";
import { provideArcMessages } from "./messages.ts";
import { ResponsiveTabs, type TabItem } from "./responsive-tabs.tsx";

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

function all(name: string): HTMLElement[] {
  return [...document.querySelectorAll(`[data-slot="${name}"]`)] as HTMLElement[];
}

function Rtl(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

const ITEMS: TabItem[] = [
  { id: "overview", label: "Overview" },
  { id: "checks", label: "Checks", count: 12 },
  { id: "runs", label: "Runs" },
  { id: "alerts", label: "Alerts" },
  { id: "settings", label: "Settings" },
];

describe("Indicator", () => {
  test("a count in the locale's digits, capped, and nothing at zero", () => {
    render(() => (
      <>
        <Indicator count={3} />
        <Indicator count={250} />
        <Indicator count={0} />
        <Indicator count={0} showZero />
      </>
    ));
    expect(all("indicator-badge").map((one) => one.textContent)).toEqual(["3", "99+", "0"]);
  });

  test("pinned to something, it carries words a screen reader hears", async () => {
    render(() => (
      <>
        <Indicator count={4} tone="danger">
          <button type="button" aria-label="Notifications" />
        </Indicator>
        <Indicator dot tone="success">
          <span>AB</span>
        </Indicator>
      </>
    ));
    const [count, dot] = all("indicator");
    expect(count?.querySelector('[data-slot="indicator-label"]')?.textContent).toBe("4 new");
    expect(count?.querySelector('[data-slot="indicator-badge"]')?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(dot?.querySelector('[data-slot="indicator-label"]')?.textContent).toBe("New");
    expect(
      wears(
        count?.querySelector('[data-slot="indicator-badge"]'),
        indicatorStyles({ tone: "danger", anchored: true }).badge,
      ),
    ).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("its words and digits follow the locale, and its parts take classes", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      provideArcMessages(() => ({ newCount: (count) => `${count} جديد` }));
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <Indicator count={5} classes={{ root: "r", badge: "b", label: "l" }}>
          <span>x</span>
        </Indicator>
      </Arabic>
    ));
    expect(slot("indicator-badge").textContent).toBe("٥");
    expect(slot("indicator-label").textContent).toBe("٥ جديد");
    expect(slot("indicator").classList.contains("r")).toBe(true);
    expect(slot("indicator-badge").classList.contains("b")).toBe(true);
    expect(slot("indicator-label").classList.contains("l")).toBe(true);
  });
});

describe("ResponsiveTabs", () => {
  test("a tab list with the selected tab's panel, and counts", async () => {
    render(() => (
      <ResponsiveTabs aria-label="Project" items={ITEMS}>
        {(tab) => <p>{tab.label} panel</p>}
      </ResponsiveTabs>
    ));
    const list = screen.getByRole("tablist", { name: "Project" });
    expect(within(list).getAllByRole("tab")).toHaveLength(5);
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("tabpanel").textContent).toBe("Overview panel");
    expect(screen.getByRole("tab", { name: "Checks 12" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the arrows move in the reading direction and open the tab", async () => {
    const changes: string[] = [];
    render(() => (
      <Rtl>
        <ResponsiveTabs
          aria-label="Project"
          items={ITEMS}
          onSelectionChange={(id) => changes.push(id)}
        >
          {(tab) => <p>{tab.label}</p>}
        </ResponsiveTabs>
      </Rtl>
    ));
    user.tab();
    expect(document.activeElement?.textContent).toBe("Overview");
    await user.keyboard("{ArrowLeft}");
    await settle();
    expect(document.activeElement?.textContent).toContain("Checks");
    expect(changes).toEqual(["checks"]);
  });

  test("a tap selects, and a controlled selection follows the caller", async () => {
    const [selected, setSelected] = createSignal("runs");
    render(() => (
      <ResponsiveTabs
        aria-label="Project"
        items={ITEMS}
        selectedKey={selected()}
        onSelectionChange={setSelected}
      >
        {(tab) => <p>{tab.label}</p>}
      </ResponsiveTabs>
    ));
    expect(screen.getByRole("tabpanel").textContent).toBe("Runs");
    user.tap(screen.getByRole("tab", { name: "Alerts" }));
    await settle();
    expect(selected()).toBe("alerts");
    setSelected("overview");
    await settle();
    expect(screen.getByRole("tabpanel").textContent).toBe("Overview");
  });

  describe("in a narrow row", () => {
    let restore: (() => void) | null = null;
    beforeEach(() => {
      const spy = spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
        this: Element,
      ) {
        const part = this.getAttribute("data-slot");
        const width =
          part === "responsive-tabs-bar" ? 300 : part === "responsive-tabs-more" ? 60 : 80;
        return {
          width,
          height: 32,
          top: 0,
          left: 0,
          bottom: 32,
          right: width,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      });
      restore = () => spy.mockRestore();
    });
    afterEach(() => {
      restore?.();
      restore = null;
    });

    test("the tabs that do not fit go into a More menu, the selected one kept", async () => {
      render(() => (
        <ResponsiveTabs aria-label="Project" items={ITEMS} defaultSelectedKey="settings">
          {(tab) => <p>{tab.label}</p>}
        </ResponsiveTabs>
      ));
      await settle();
      await settle();
      const tabs = screen.getAllByRole("tab").map((one) => one.textContent);
      expect(tabs).toEqual(["Overview", "Checks12", "Settings"]);
      const more = screen.getByRole("button", { name: "More" });
      user.click(more);
      await settle();
      const menu = screen.getByRole("menu", { name: "More" });
      const items = within(menu).getAllByRole("menuitem");
      expect(items.map((one) => one.textContent)).toEqual(["Runs", "Alerts"]);
      user.click(items[0] as HTMLElement);
      await settle();
      await settle();
      expect(screen.getByRole("tabpanel").textContent).toBe("Runs");
      expect(screen.getByRole("tab", { name: "Runs" }).getAttribute("aria-selected")).toBe("true");
    });

    test("with overflow=scroll the row scrolls instead, its buttons hidden from the tab order", async () => {
      render(() => (
        <ResponsiveTabs aria-label="Project" items={ITEMS} overflow="scroll">
          {(tab) => <p>{tab.label}</p>}
        </ResponsiveTabs>
      ));
      await settle();
      expect(screen.getAllByRole("tab")).toHaveLength(5);
      expect(screen.queryByRole("button", { name: "More" })).toBeNull();
      const buttons = all("responsive-tabs-scroll");
      expect(buttons.map((one) => one.getAttribute("data-direction"))).toEqual(["back", "forward"]);
      for (const one of buttons) {
        expect(one.getAttribute("tabindex")).toBe("-1");
        expect(one.getAttribute("aria-hidden")).toBe("true");
      }
    });
  });

  test("a scrolling row measures and follows the selection reading only what its effects track", async () => {
    const capture = DEV.diagnostics.capture();
    const [tab, setTab] = createSignal("overview");
    render(() => (
      <ResponsiveTabs
        aria-label="Project"
        items={ITEMS}
        overflow="scroll"
        selectedKey={tab()}
        onSelectionChange={setTab}
      >
        {(item) => <p>{item.label}</p>}
      </ResponsiveTabs>
    ));
    await settle();
    setTab(ITEMS[2]?.id ?? "overview");
    await settle();
    const strict = capture.stop().filter((event) => event.code === "STRICT_READ_UNTRACKED");
    expect(strict).toEqual([]);
  });

  test("its words come from arc's dictionary, and each part takes a class", () => {
    render(() => (
      <ResponsiveTabs
        aria-label="Project"
        items={[{ id: "a", label: "A", icon: <svg />, count: 1 }]}
        class="mine"
        classes={{
          root: "r",
          bar: "b",
          viewport: "v",
          list: "l",
          tab: "t",
          icon: "i",
          count: "c",
          panel: "p",
        }}
      >
        {() => <p>A</p>}
      </ResponsiveTabs>
    ));
    const pairs = [
      ["responsive-tabs", "r"],
      ["responsive-tabs-bar", "b"],
      ["responsive-tabs-viewport", "v"],
      ["responsive-tabs-list", "l"],
      ["responsive-tabs-tab", "t"],
      ["responsive-tabs-icon", "i"],
      ["responsive-tabs-panel", "p"],
    ] as const;
    for (const [name, cls] of pairs) expect(slot(name).classList.contains(cls)).toBe(true);
    expect(slot("responsive-tabs").classList.contains("mine")).toBe(true);
    expect(slot("indicator").classList.contains("c")).toBe(true);
  });

  test("hydrates what the server wrote, every tab in the row", async () => {
    const result = await hydrates(`
      import { ResponsiveTabs, Indicator } from "<arc>";
      const items = [{ id: "a", label: "Alpha", count: 2 }, { id: "b", label: "Beta" }];
      export function Page() {
        return (
          <div>
            <Indicator count={3} />
            <ResponsiveTabs aria-label="Sections" items={items}>
              {(tab) => <p>{tab.label} body</p>}
            </ResponsiveTabs>
          </div>
        );
      }
    `);
    expect(result.container.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(result.container.querySelector('[role="tabpanel"]')?.textContent).toBe("Alpha body");
    result.unmount();
  });
});
