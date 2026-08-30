import { describe, expect, test } from "bun:test";
import { flush, type Incoming, signal } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import type { Key } from "./collections.ts";
import { Tab, TabList, TabPanel, Tabs } from "./tabs.tsx";

interface Section {
  id: string;
  name: string;
  body: string;
  isDisabled?: boolean;
}

const SECTIONS: Section[] = [
  { id: "founding", name: "Founding", body: "How it began" },
  { id: "today", name: "Today", body: "Where it is" },
  { id: "later", name: "Later", body: "Not yet", isDisabled: true },
  { id: "notes", name: "Notes", body: "Odds and ends" },
];

function Sections(
  props: Incoming<{
    keyboardActivation?: "automatic" | "manual";
    orientation?: "horizontal" | "vertical";
    defaultSelectedKey?: Key;
    onSelectionChange?: (key: Key) => void;
  }>,
) {
  return (
    <Tabs
      items={SECTIONS}
      keyboardActivation={props.keyboardActivation?.()}
      orientation={props.orientation?.()}
      defaultSelectedKey={props.defaultSelectedKey?.()}
      onSelectionChange={props.onSelectionChange?.()}
    >
      <TabList aria-label="History">{(section: Section) => <Tab>{section.name}</Tab>}</TabList>
      <TabPanel>{(section: Section) => <p>{section.body}</p>}</TabPanel>
    </Tabs>
  );
}

describe("Tabs", () => {
  test("is a named tablist of tabs with one panel", () => {
    render(() => <Sections />);

    expect(accessibleName(screen.getByRole("tablist"))).toBe("History");
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });

  test("the first tab is selected when nothing says otherwise", () => {
    render(() => <Sections />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tabpanel").textContent).toBe("How it began");
  });

  test("the tab and its panel point at each other", () => {
    render(() => <Sections />);

    const selected = screen.getAllByRole("tab")[0] as HTMLElement;
    const panel = screen.getByRole("tabpanel");

    expect(selected.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(selected.id);
  });

  test("an unselected tab controls nothing", () => {
    render(() => <Sections />);
    expect(screen.getAllByRole("tab")[1]?.hasAttribute("aria-controls")).toBe(false);
  });

  test("clicking a tab shows its panel", () => {
    const chosen: Key[] = [];
    render(() => <Sections onSelectionChange={(key) => chosen.push(key)} />);

    user.click(screen.getByRole("tab", { name: "Today" }));
    flush();

    expect(chosen).toEqual(["today"]);
    expect(screen.getByRole("tabpanel").textContent).toBe("Where it is");
  });

  test("a disabled tab cannot be chosen", () => {
    const chosen: Key[] = [];
    render(() => <Sections onSelectionChange={(key) => chosen.push(key)} />);

    const later = screen.getByRole("tab", { name: "Later" });
    expect(later.getAttribute("aria-disabled")).toBe("true");

    user.click(later);
    flush();
    expect(chosen).toEqual([]);
  });

  test("the tab list is ONE Tab stop, on the selected tab", () => {
    render(() => <Sections defaultSelectedKey="today" />);

    const tabs = screen.getAllByRole("tab");
    expect(screen.getByRole("tablist").hasAttribute("tabindex")).toBe(false);
    expect(tabs[1]?.getAttribute("tabindex")).toBe("0");
    expect(tabs[0]?.getAttribute("tabindex")).toBe("-1");
  });

  test("the arrows move and select, skipping disabled tabs", () => {
    const chosen: Key[] = [];
    render(() => <Sections onSelectionChange={(key) => chosen.push(key)} />);

    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[0] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(tabs[1] as HTMLElement);

    // "Later" is disabled, so Right lands on "Notes".
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(tabs[3] as HTMLElement);

    expect(chosen).toEqual(["today", "notes"]);
  });

  test("the arrows wrap round the ends", () => {
    render(() => <Sections />);

    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[0] as HTMLElement);
    user.keyDown("ArrowLeft");
    flush();

    expect(document.activeElement).toBe(tabs[3] as HTMLElement);
  });

  test("manual activation moves focus without selecting", () => {
    const chosen: Key[] = [];
    render(() => (
      <Sections keyboardActivation="manual" onSelectionChange={(key) => chosen.push(key)} />
    ));

    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[0] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();

    expect(document.activeElement).toBe(tabs[1] as HTMLElement);
    expect(chosen).toEqual([]);
    expect(screen.getByRole("tabpanel").textContent).toBe("How it began");

    user.key("Enter");
    flush();
    expect(chosen).toEqual(["today"]);
  });

  test("a vertical list uses the vertical arrows and says so", () => {
    render(() => <Sections orientation="vertical" />);

    const list = screen.getByRole("tablist");
    expect(list.getAttribute("aria-orientation")).toBe("vertical");

    const tabs = screen.getAllByRole("tab");
    user.focus(tabs[0] as HTMLElement);
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(tabs[1] as HTMLElement);
  });

  test("a panel of prose is a Tab stop", () => {
    render(() => <Sections />);
    expect(screen.getByRole("tabpanel").getAttribute("tabindex")).toBe("0");
  });

  test("a panel with something focusable inside is not", () => {
    render(() => (
      <Tabs items={SECTIONS}>
        <TabList aria-label="History">{(s: Section) => <Tab>{s.name}</Tab>}</TabList>
        <TabPanel>{(s: Section) => <button type="button">{s.name}</button>}</TabPanel>
      </Tabs>
    ));
    flush();

    expect(screen.getByRole("tabpanel").hasAttribute("tabindex")).toBe(false);
  });

  test("the tabs are data, so changing them updates the list", () => {
    const items = signal<Section[]>([{ id: "a", name: "One", body: "1" }]);
    render(() => (
      <Tabs items={items()}>
        <TabList aria-label="History">{(s: Section) => <Tab>{s.name}</Tab>}</TabList>
        <TabPanel>{(s: Section) => <p>{s.body}</p>}</TabPanel>
      </Tabs>
    ));

    expect(screen.getAllByRole("tab")).toHaveLength(1);

    items.set([
      { id: "a", name: "One", body: "1" },
      { id: "b", name: "Two", body: "2" },
    ]);
    flush();

    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  test("removing the selected tab selects another", () => {
    const items = signal<Section[]>([
      { id: "a", name: "One", body: "1" },
      { id: "b", name: "Two", body: "2" },
    ]);
    render(() => (
      <Tabs items={items()} defaultSelectedKey="b">
        <TabList aria-label="History">{(s: Section) => <Tab>{s.name}</Tab>}</TabList>
        <TabPanel>{(s: Section) => <p>{s.body}</p>}</TabPanel>
      </Tabs>
    ));
    flush();
    expect(screen.getByRole("tabpanel").textContent).toBe("2");

    items.set([{ id: "a", name: "One", body: "1" }]);
    flush();

    expect(screen.getByRole("tabpanel").textContent).toBe("1");
    expect(screen.getByRole("tab", { name: "One" }).getAttribute("aria-selected")).toBe("true");
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Sections />);
    expectNoAriaViolations(container);
  });
});
