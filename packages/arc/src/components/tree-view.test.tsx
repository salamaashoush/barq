import { describe, expect, test } from "bun:test";
import { createSignal, flush, type ParentProps } from "@barqjs/core";
import type { Key } from "@barqjs/aria/collections";
import { dragAndDrop } from "@barqjs/aria/drag-and-drop";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { type TreeNode, TreeView } from "./tree-view.tsx";

const FILES: TreeNode[] = [
  {
    id: "src",
    label: "src",
    children: [
      { id: "index", label: "index.ts", description: "2 KB" },
      { id: "app", label: "app.tsx" },
    ],
  },
  { id: "docs", label: "docs", hasChildren: true },
  { id: "readme", label: "README.md" },
];

function rows(): string[] {
  return [...document.querySelectorAll('[data-slot="tree-view-label"]')].map(
    (one) => one.textContent ?? "",
  );
}

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

describe("TreeView", () => {
  test("a tree grid of rows, closed until opened, with levels", async () => {
    render(() => <TreeView aria-label="Files" items={FILES} defaultExpandedKeys={["src"]} />);
    const tree = screen.getByRole("treegrid", { name: "Files" });
    expect(rows()).toEqual(["src", "index.ts", "app.tsx", "docs", "README.md"]);
    const index = within(tree).getAllByRole("row")[1] as HTMLElement;
    expect(index.getAttribute("aria-level")).toBe("2");
    expect(within(tree).getAllByRole("row")[0]?.getAttribute("aria-expanded")).toBe("true");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the arrows walk it: Right opens, Left closes, Enter acts", async () => {
    const acted: Key[] = [];
    render(() => <TreeView aria-label="Files" items={FILES} onAction={(key) => acted.push(key)} />);
    user.tab();
    expect(document.activeElement?.textContent).toContain("src");
    await user.keyboard("{ArrowRight}");
    flush();
    expect(rows()).toEqual(["src", "index.ts", "app.tsx", "docs", "README.md"]);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toContain("index.ts");
    await user.keyboard("{Enter}");
    expect(acted).toEqual(["index"]);
    await user.keyboard("{ArrowLeft}");
    await user.keyboard("{ArrowLeft}");
    flush();
    expect(rows()).toEqual(["src", "docs", "README.md"]);
  });

  test("right to left, Left opens", async () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <TreeView aria-label="ملفات" items={FILES} />
      </Arabic>
    ));
    user.tab();
    await user.keyboard("{ArrowLeft}");
    flush();
    expect(rows()).toContain("index.ts");
  });

  test("a checkbox per row when several can be chosen", async () => {
    const seen: string[][] = [];
    render(() => (
      <TreeView
        aria-label="Files"
        items={FILES}
        selectionMode="multiple"
        onSelectionChange={(keys) => seen.push(keys === "all" ? ["all"] : [...keys].map(String))}
      />
    ));
    const box = screen.getByRole("checkbox", { name: "Select README.md" });
    user.click(box);
    await settle();
    expect(seen.at(-1)).toEqual(["readme"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("children load as a row opens, with a loading line meanwhile", async () => {
    const asked: string[] = [];
    const [loading, setLoading] = createSignal<string[]>([]);
    const [items, setItems] = createSignal<TreeNode[]>(FILES);
    render(() => (
      <TreeView
        aria-label="Files"
        items={items()}
        loadingKeys={loading()}
        onLoadChildren={(id) => {
          asked.push(id);
          setLoading([id]);
        }}
      />
    ));
    const docs = screen.getAllByRole("row")[1] as HTMLElement;
    expect(docs.getAttribute("aria-expanded")).toBe("false");
    user.click(within(docs).getByRole("button", { hidden: true }));
    await settle();
    expect(asked).toEqual(["docs"]);
    expect(slot("tree-view-loader").textContent).toContain("Loading more");
    setItems(
      FILES.map((one) =>
        one.id === "docs" ? { ...one, children: [{ id: "guide", label: "guide.md" }] } : one,
      ),
    );
    setLoading([]);
    await settle();
    expect(rows()).toContain("guide.md");
    expect(slot("tree-view-loader")).toBeNull();
  });

  test("with drag and drop each row has a drag button named after it", () => {
    const hooks = dragAndDrop<TreeNode>({
      getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
      onReorder: () => {},
    }).dragAndDropHooks;
    render(() => <TreeView aria-label="Files" items={FILES} dragAndDropHooks={hooks} />);
    const readme = screen.getAllByRole("row")[2] as HTMLElement;
    expect(
      within(readme).getByRole("button", { name: "Drag README.md", hidden: true }),
    ).toBeDefined();
    expect(slot("tree-view-drag")).not.toBeNull();
  });

  test("takes a class per part", () => {
    render(() => (
      <TreeView
        aria-label="Files"
        class="mine"
        items={[
          {
            id: "a",
            label: "A",
            icon: <svg />,
            description: "d",
            children: [{ id: "b", label: "B" }],
          },
        ]}
        defaultExpandedKeys={["a"]}
        selectionMode="multiple"
        classes={{
          root: "r",
          row: "w",
          content: "c",
          expand: "x",
          spacer: "s",
          checkbox: "k",
          icon: "i",
          label: "l",
          description: "d",
        }}
      />
    ));
    const pairs = [
      ["tree-view", "r"],
      ["tree-view-row", "w"],
      ["tree-view-content", "c"],
      ["tree-view-expand", "x"],
      ["tree-view-spacer", "s"],
      ["tree-view-checkbox", "k"],
      ["tree-view-icon", "i"],
      ["tree-view-label", "l"],
      ["tree-view-description", "d"],
    ] as const;
    for (const [name, cls] of pairs) expect(slot(name).classList.contains(cls)).toBe(true);
    expect(slot("tree-view").classList.contains("mine")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { TreeView } from "<arc>";
      const items = [{ id: "a", label: "Alpha", children: [{ id: "b", label: "Beta" }] }, { id: "c", label: "Gamma" }];
      export function Page() {
        return <TreeView aria-label="Things" items={items} defaultExpandedKeys={["a"]} />;
      }
    `);
    expect(result.container.querySelectorAll('[role="row"]')).toHaveLength(3);
    result.unmount();
  });

  test("hydrates rows that drag, each with its drop targets around it", async () => {
    const result = await hydrates(`
      import { TreeView } from "<arc>";
      import { dragAndDrop } from "@barqjs/aria/drag-and-drop";
      const items = [{ id: "a", label: "Alpha", children: [{ id: "b", label: "Beta" }] }, { id: "c", label: "Gamma" }];
      export function Page() {
        const { dragAndDropHooks } = dragAndDrop({
          getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
          onMove: () => {},
        });
        return <TreeView aria-label="Things" items={items} defaultExpandedKeys={["a"]} dragAndDropHooks={dragAndDropHooks} />;
      }
    `);
    expect(result.container.querySelectorAll('button[aria-label^="Drag"]')).toHaveLength(3);
    result.unmount();
  });
});
