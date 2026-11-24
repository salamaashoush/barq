import { describe, expect, test } from "bun:test";
import { type Child, flush } from "@barqjs/core";
import type { Key } from "@barqjs/aria/collections";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { hydrates, settle, wears } from "../test-arc.ts";
import { List, ListItem, listStyles } from "./item-list.tsx";

interface File {
  id: string;
  name: string;
  size: string;
}

const FILES: File[] = [
  { id: "a", name: "report.pdf", size: "2 MB" },
  { id: "b", name: "notes.txt", size: "4 KB" },
  { id: "c", name: "photo.png", size: "1 MB" },
];

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

function files(extra: Partial<Parameters<typeof List<File>>[0]> = {}) {
  return (
    <List<File> aria-label="Files" items={FILES} {...extra}>
      {(file) => (
        <ListItem
          title={file.name}
          description="Shared"
          meta={file.size}
          media={<svg />}
          actions={
            <button type="button" aria-label={`Delete ${file.name}`}>
              x
            </button>
          }
        />
      )}
    </List>
  );
}

describe("List", () => {
  test("a grid of rows, each ui's item with its parts", async () => {
    render(() => files());
    const grid = screen.getByRole("grid", { name: "Files" });
    const rows = within(grid).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("report.pdf");
    expect(rows[0]?.querySelector('[data-slot="list-item-meta"]')?.textContent).toBe("2 MB");
    expect(wears(rows[0], listStyles({ divided: true }).row)).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("one Tab stop, the arrows between rows, Enter opens one", async () => {
    const opened: Key[] = [];
    render(() => files({ onAction: (key) => opened.push(key) }));
    user.tab();
    expect(document.activeElement?.textContent).toContain("report.pdf");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toContain("notes.txt");
    await user.keyboard("{Enter}");
    await settle();
    expect(opened).toEqual(["b"]);
  });

  test("selects many with a press or Space, the caller hearing each", async () => {
    const seen: string[][] = [];
    render(() =>
      files({
        selectionMode: "multiple",
        onSelectionChange: (keys) => seen.push(keys === "all" ? ["all"] : [...keys].map(String)),
      }),
    );
    const rows = screen.getAllByRole("row");
    user.click(rows[0] as HTMLElement);
    flush();
    user.tab();
    await user.keyboard("{ArrowDown}");
    await user.keyboard(" ");
    flush();
    expect(seen.at(-1)).toEqual(["a", "b"]);
    expect(rows[1]?.getAttribute("aria-selected")).toBe("true");
  });

  test("shows a loading row after the rows while more load, which is not one of them", () => {
    render(() => files({ onLoadMore: () => {}, isLoadingMore: true }));
    expect(slot("list-loader").textContent).toContain("Loading more");
    expect(document.querySelectorAll('[data-slot="list-row"]')).toHaveLength(3);
    user.tab();
    expect(document.activeElement?.getAttribute("data-slot")).toBe("list-row");
  });

  test("virtual: only the rows on screen are drawn, every row still counted", () => {
    const many = Array.from({ length: 200 }, (_, at) => ({
      id: `f${at}`,
      name: `File ${at}`,
      size: "1 KB",
    }));
    render(() => (
      <List<File> aria-label="Many" items={many} virtual={{ rowHeight: 40, height: "200px" }}>
        {(file) => <ListItem title={file.name} />}
      </List>
    ));
    const grid = screen.getByRole("grid", { name: "Many" });
    Object.defineProperty(grid, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(grid, "clientWidth", { value: 300, configurable: true });
    grid.dispatchEvent(new Event("scroll"));
    flush();
    expect(grid.getAttribute("aria-rowcount")).toBe("200");
    expect(within(grid).getAllByRole("row").length).toBeLessThan(40);
  });

  test("an empty list says so; right to left, and a class per part", () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <List<File> aria-label="لا شيء" items={[]} empty={<p>لا ملفات</p>}>
          {(file) => <ListItem title={file.name} />}
        </List>
        <List<File>
          aria-label="ملفات"
          items={FILES.slice(0, 1)}
          class="mine"
          divided={false}
          classes={{ root: "r", row: "w" }}
        >
          {(file) => (
            <ListItem
              title={file.name}
              description="d"
              media={<svg />}
              meta="m"
              actions={<span>a</span>}
              classes={{
                item: "i",
                media: "md",
                content: "c",
                title: "t",
                description: "ds",
                meta: "mt",
                actions: "ac",
              }}
            />
          )}
        </List>
      </Arabic>
    ));
    expect(screen.getByRole("grid", { name: "لا شيء" }).textContent).toContain("لا ملفات");
    const pairs = [
      ["list-row", "w"],
      ["list-item", "i"],
      ["list-item-media", "md"],
      ["list-item-content", "c"],
      ["list-item-title", "t"],
      ["list-item-description", "ds"],
      ["list-item-meta", "mt"],
      ["list-item-actions", "ac"],
    ] as const;
    for (const [name, cls] of pairs) expect(slot(name).classList.contains(cls)).toBe(true);
    const lists = document.querySelectorAll('[data-slot="list"]');
    expect(lists[1]?.classList.contains("mine")).toBe(true);
    expect(lists[1]?.classList.contains("r")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { List, ListItem } from "<arc>";
      const items = [{ id: "a", name: "One" }, { id: "b", name: "Two" }];
      export function Page() {
        return (
          <List aria-label="Things" items={items}>
            {(item) => <ListItem title={item.name} meta="now" />}
          </List>
        );
      }
    `);
    expect(result.container.querySelectorAll('[role="row"]')).toHaveLength(2);
    result.unmount();
  });
});
