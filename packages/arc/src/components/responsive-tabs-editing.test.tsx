import { afterEach, describe, expect, test } from "bun:test";
import { createSignal, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { clearAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { ResponsiveTabs, type ResponsiveTabsProps, type TabItem } from "./responsive-tabs.tsx";

const FILES: TabItem[] = [
  { id: "a", label: "main.toy", title: "src/main.toy" },
  { id: "b", label: "util.toy", dirty: true },
  { id: "c", label: "notes.md" },
  { id: "d", label: "README.md" },
];

interface Log {
  events: string[];
}

interface DocumentsProps extends Partial<ResponsiveTabsProps> {
  log: Log;
  start?: TabItem[];
}

function Documents(props: DocumentsProps) {
  const [items, setItems] = createSignal(props.start ?? FILES);
  const [selected, setSelected] = createSignal("a");
  return (
    <ResponsiveTabs
      aria-label="Open files"
      overflow="scroll"
      items={items()}
      selectedKey={selected()}
      onSelectionChange={(id) => {
        props.log.events.push(`select ${id}`);
        setSelected(id);
      }}
      onClose={(ids) => {
        props.log.events.push(`close ${ids.join(",")}`);
        setItems(items().filter((one) => !ids.includes(one.id)));
      }}
      onReorder={(ids) => {
        props.log.events.push(`order ${ids.join(",")}`);
        setItems(ids.map((id) => items().find((one) => one.id === id) as TabItem));
      }}
      onPinnedChange={(id, pinned) => {
        props.log.events.push(`${pinned ? "pin" : "unpin"} ${id}`);
        const rest = items().map((one) => (one.id === id ? { ...one, pinned } : one));
        setItems([...rest.filter((one) => one.pinned), ...rest.filter((one) => !one.pinned)]);
      }}
    >
      {(item) => <p>{item.label}</p>}
    </ResponsiveTabs>
  );
}

function labels(): string[] {
  return screen.getAllByRole("tab").map((one) => one.getAttribute("data-key") ?? "");
}

function closeButton(id: string): HTMLElement {
  return document.querySelector(
    `[role="tab"][data-key="${id}"] [data-slot="responsive-tabs-close"]`,
  ) as HTMLElement;
}

afterEach(() => clearAnnouncer());

describe("ResponsiveTabs as documents", () => {
  test("each tab has a close button the pointer uses, and says what is unsaved", async () => {
    const log: Log = { events: [] };
    render(() => <Documents log={log} />);
    const util = screen.getByRole("tab", { name: "util.toy, Unsaved changes" });
    expect(util.querySelector('[data-slot="responsive-tabs-dirty"]')).not.toBeNull();
    expect(screen.getByRole("tab", { name: "main.toy" }).getAttribute("title")).toBe(
      "src/main.toy",
    );
    expect(await ariaViolations(document.body)).toEqual([]);
    user.click(closeButton("c"));
    await settle();
    expect(log.events).toEqual(["close c"]);
    expect(labels()).toEqual(["a", "b", "d"]);
  });

  test("closing the selected tab selects its neighbour first", async () => {
    const log: Log = { events: [] };
    render(() => <Documents log={log} />);
    user.click(closeButton("a"));
    await settle();
    expect(log.events).toEqual(["select b", "close a"]);
    expect(screen.getByRole("tab", { selected: true }).getAttribute("data-key")).toBe("b");
  });

  test("Delete closes the focused tab and focus moves to the next", async () => {
    const log: Log = { events: [] };
    render(() => <Documents log={log} />);
    user.tab();
    expect(document.activeElement?.getAttribute("data-key")).toBe("a");
    await user.keyboard("{Delete}");
    await settle();
    expect(log.events).toEqual(["select b", "close a"]);
    expect(document.activeElement?.getAttribute("data-key")).toBe("b");
  });

  test("a middle click closes; a left click on the close button does not select", async () => {
    const log: Log = { events: [] };
    render(() => <Documents log={log} />);
    const notes = screen.getByRole("tab", { name: "notes.md" });
    notes.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));
    await settle();
    expect(log.events).toEqual(["close c"]);
    user.click(closeButton("d"));
    await settle();
    expect(log.events).toEqual(["close c", "close d"]);
  });

  test("Ctrl+Shift+Page Down and Alt+Shift+arrows move the focused tab", async () => {
    const log: Log = { events: [] };
    render(() => <Documents log={log} />);
    user.tab();
    user.keyboard("{PageDown}", { ctrlKey: true, shiftKey: true });
    await settle();
    expect(labels()).toEqual(["b", "a", "c", "d"]);
    expect(document.activeElement?.getAttribute("data-key")).toBe("a");
    user.keyboard("{ArrowRight}", { altKey: true, shiftKey: true });
    await settle();
    expect(labels()).toEqual(["b", "c", "a", "d"]);
    user.keyboard("{ArrowLeft}", { altKey: true, shiftKey: true });
    await settle();
    expect(labels()).toEqual(["b", "a", "c", "d"]);
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain(
      "main.toy moved to 2 of 4",
    );
  });

  test("right to left, Alt+Shift+Left moves a tab later", async () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    const log: Log = { events: [] };
    render(() => (
      <Rtl>
        <Documents log={log} />
      </Rtl>
    ));
    user.tab();
    user.keyboard("{ArrowLeft}", { altKey: true, shiftKey: true });
    await settle();
    expect(labels()).toEqual(["b", "a", "c", "d"]);
  });

  test("a tab dragged over another drops before or after it", async () => {
    const log: Log = { events: [] };
    render(() => <Documents log={log} />);
    const first = screen.getByRole("tab", { name: "main.toy" });
    const last = screen.getByRole("tab", { name: "README.md" });
    expect(first.getAttribute("draggable")).toBe("true");
    last.getBoundingClientRect = () => new DOMRect(300, 0, 100, 30);
    first.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true }));
    const over = new DragEvent("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(over, "clientX", { value: 380 });
    last.dispatchEvent(over);
    await settle();
    expect(last.getAttribute("data-drop")).toBe("after");
    last.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true }));
    await settle();
    expect(log.events).toEqual(["order b,c,d,a"]);
    expect(labels()).toEqual(["b", "c", "d", "a"]);
    expect(document.querySelector("[data-drop]")).toBeNull();
  });

  test("a tab's menu closes others, the ones after, all, pins and moves", async () => {
    const log: Log = { events: [] };
    render(() => <Documents log={log} />);
    function open(id: string): void {
      const tab = document.querySelector(`[role="tab"][data-key="${id}"]`) as HTMLElement;
      tab.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 2, clientY: 2 }),
      );
    }
    open("b");
    await settle();
    let menu = screen.getByRole("menu", { name: "Tab actions" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((one) => one.textContent),
    ).toEqual([
      "Close",
      "Close others",
      "Close the ones after",
      "Close all",
      "Pin",
      "Move earlier",
      "Move later",
    ]);
    user.click(within(menu).getByRole("menuitem", { name: "Pin" }));
    await settle();
    expect(labels()).toEqual(["b", "a", "c", "d"]);
    expect(screen.getByRole("tab", { name: "util.toy, Pinned, Unsaved changes" })).toBeDefined();
    expect(closeButton("b")).toBeNull();
    open("c");
    await settle();
    menu = screen.getByRole("menu", { name: "Tab actions" });
    user.click(within(menu).getByRole("menuitem", { name: "Close others" }));
    await settle();
    expect(labels()).toEqual(["b", "c"]);
    expect(log.events.at(-1)).toBe("close a,d");
  });

  test("pinned tabs stay before the rest when one moves", async () => {
    const log: Log = { events: [] };
    const start = [{ ...FILES[0], pinned: true } as TabItem, ...FILES.slice(1)];
    render(() => <Documents log={log} start={start} />);
    (document.querySelector('[role="tab"][data-key="b"]') as HTMLElement).focus();
    user.keyboard("{PageUp}", { ctrlKey: true, shiftKey: true });
    await settle();
    expect(labels()).toEqual(["a", "b", "c", "d"]);
    expect(log.events.filter((one) => one.startsWith("order"))).toEqual([]);
  });

  test("without the editing callbacks a tab is only a tab", () => {
    render(() => <ResponsiveTabs aria-label="Views" items={FILES} />);
    expect(document.querySelector('[data-slot="responsive-tabs-close"]')).toBeNull();
    expect(document.querySelector('[data-slot="responsive-tabs-strip"]')).toBeNull();
    expect(screen.getByRole("tab", { name: "util.toy" }).getAttribute("draggable")).toBeNull();
  });

  test("hydrates closable, dirty and pinned tabs", async () => {
    const result = await hydrates(`
      import { ResponsiveTabs } from "<arc>";
      const items = [
        { id: "a", label: "main.toy", pinned: true },
        { id: "b", label: "util.toy", dirty: true },
        { id: "c", label: "notes.md" },
      ];
      export function Page() {
        return (
          <ResponsiveTabs aria-label="Open files" overflow="scroll" items={items} onClose={() => {}} onReorder={() => {}}>
            {(item) => <p>{item.label}</p>}
          </ResponsiveTabs>
        );
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="responsive-tabs-close"]')).toHaveLength(
      2,
    );
    result.unmount();
  });
});
