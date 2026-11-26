import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { createSignal } from "@barqjs/core";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import type { TabItem } from "../components/responsive-tabs.tsx";
import { hydrates, settle } from "../test-arc.ts";
import { EditorTabs } from "./code-tabs.tsx";

const entry = JSON.stringify(fileURLToPath(new URL("./index.ts", import.meta.url)));

const OPEN: TabItem[] = [
  { id: "src/main.toy", label: "main.toy", title: "src/main.toy" },
  { id: "src/util.toy", label: "util.toy", title: "src/util.toy", dirty: true },
];

function Editor() {
  const [items, setItems] = createSignal(OPEN);
  return (
    <EditorTabs
      aria-label="Open files"
      items={items()}
      onClose={(ids) => setItems(items().filter((one) => !ids.includes(one.id)))}
      empty={<p>No file open</p>}
    >
      {(tab) => <textarea aria-label={tab.label} value={tab.id} />}
    </EditorTabs>
  );
}

describe("EditorTabs", () => {
  test("every open document's editor stays in the page, the others hidden", async () => {
    render(() => <Editor />);
    expect(screen.getByRole("tablist", { name: "Open files" })).toBeDefined();
    const editors = document.querySelectorAll("textarea");
    expect(editors).toHaveLength(2);
    expect(screen.getByRole("tab", { name: "util.toy, Unsaved changes" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
    user.click(screen.getByRole("tab", { name: "util.toy, Unsaved changes" }));
    await settle();
    expect(screen.getByRole("textbox", { name: "util.toy" })).toBeDefined();
  });

  test("closing the last document shows what is there with none open", async () => {
    render(() => <Editor />);
    user.tab();
    await user.keyboard("{Delete}");
    await settle();
    await user.keyboard("{Delete}");
    await settle();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("No file open")).toBeDefined();
  });

  test("takes a class per part", () => {
    render(() => (
      <EditorTabs
        aria-label="Open files"
        items={OPEN}
        class="mine"
        classes={{ root: "r", panel: "p" }}
      >
        {(tab) => <p>{tab.label}</p>}
      </EditorTabs>
    ));
    const root = document.querySelector('[data-slot="responsive-tabs"]') as HTMLElement;
    expect(root.classList.contains("mine")).toBe(true);
    expect(root.classList.contains("r")).toBe(true);
    expect(
      document.querySelector('[data-slot="responsive-tabs-panel"]')?.classList.contains("p"),
    ).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { EditorTabs } from ${entry};
      const items = [{ id: "a", label: "main.toy", dirty: true }, { id: "b", label: "util.toy", pinned: true }];
      export function Page() {
        return (
          <EditorTabs aria-label="Open files" items={items} onClose={() => {}}>
            {(tab) => <p>{tab.label}</p>}
          </EditorTabs>
        );
      }
    `);
    expect(result.container.querySelectorAll('[role="tab"]')).toHaveLength(2);
    result.unmount();
  });
});
