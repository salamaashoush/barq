import { afterEach, describe, expect, test } from "bun:test";
import { createSignal, flush, type ParentProps } from "@barqjs/core";
import { dragSession } from "@barqjs/aria/dnd";
import { provideLocale } from "@barqjs/aria/i18n";
import { clearAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { ConfirmHost } from "./confirm.tsx";
import { FileExplorer, type FileExplorerProps } from "./file-explorer.tsx";
import { type VirtualFs, virtualFs } from "./virtual-fs.ts";

function workspace(): VirtualFs {
  return virtualFs({
    src: { "main.toy": "print 1", "util.toy": "", lib: { "deep.toy": "" } },
    docs: {},
    "README.md": "# Notes",
  });
}

function rows(): string[] {
  return [...document.querySelectorAll('[data-slot="tree-view-label"]')].map(
    (one) => one.textContent ?? "",
  );
}

function row(name: string): HTMLElement {
  const found = screen
    .getAllByRole("row")
    .find((one) => one.querySelector('[data-slot="tree-view-label"]')?.textContent === name);
  if (found === undefined) throw new Error(`no row ${name}`);
  return found;
}

function focusTree(): void {
  for (let step = 0; step < 6 && document.activeElement?.getAttribute("role") !== "row"; step++) {
    user.tab();
  }
}

function press(key: string): void {
  user.keyDown(key);
  user.keyUp(key);
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  flush();
}

interface Log {
  events: string[];
}

interface ExplorerProps extends Partial<FileExplorerProps> {
  fs: VirtualFs;
  log?: Log;
}

function Explorer(props: ExplorerProps) {
  return (
    <>
      <ConfirmHost />
      <FileExplorer
        {...props}
        onOpen={(path) => props.log?.events.push(`open ${path}`)}
        onCreate={(path, kind) => props.log?.events.push(`create ${kind} ${path}`)}
        onMove={(from, to) => props.log?.events.push(`move ${from} ${to}`)}
        onDelete={(path) => props.log?.events.push(`delete ${path}`)}
      />
    </>
  );
}

afterEach(async () => {
  if (dragSession() !== null) press("Escape");
  await nextFrame();
  clearAnnouncer();
});

describe("FileExplorer", () => {
  test("folders first, the open file chosen with its folders open", async () => {
    render(() => <Explorer fs={workspace()} activePath="src/lib/deep.toy" />);
    const tree = screen.getByRole("treegrid", { name: "Files" });
    expect(rows()).toEqual(["docs", "src", "lib", "deep.toy", "main.toy", "util.toy", "README.md"]);
    expect(row("deep.toy").getAttribute("aria-selected")).toBe("true");
    expect(within(tree).getAllByRole("row")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "New file" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("choosing a file opens it; a folder opens and closes", async () => {
    const log: Log = { events: [] };
    render(() => <Explorer fs={workspace()} log={log} />);
    user.click(row("README.md"));
    await settle();
    expect(log.events).toEqual(["open README.md"]);
    row("docs").focus();
    await user.keyboard("{ArrowRight}");
    await settle();
    expect(rows()).toEqual(["docs", "src", "README.md"]);
  });

  test("New file adds a row in the chosen folder, named in place", async () => {
    const fs = workspace();
    const log: Log = { events: [] };
    render(() => <Explorer fs={fs} log={log} activePath="src/main.toy" />);
    user.click(screen.getByRole("button", { name: "New file" }));
    await settle();
    const field = screen.getByRole<HTMLInputElement>("textbox", { name: "File name" });
    expect(document.activeElement).toBe(field);
    field.value = "main.toy";
    await user.keyboard("{Enter}");
    await settle();
    expect(screen.getByRole("alert").textContent).toContain("main.toy is already here");
    field.value = "new.toy";
    await user.keyboard("{Enter}");
    await settle();
    expect(fs.read("src/new.toy")).toBe("");
    expect(log.events).toEqual(["create file src/new.toy", "open src/new.toy"]);
    expect(rows()).toContain("new.toy");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  test("New folder at the root, and Escape leaves nothing behind", async () => {
    const fs = workspace();
    render(() => <Explorer fs={fs} />);
    user.click(screen.getByRole("button", { name: "New folder" }));
    await settle();
    expect(screen.getByRole("textbox", { name: "Folder name" })).toBeDefined();
    await user.keyboard("{Escape}");
    await settle();
    expect(rows()).toEqual(["docs", "src", "README.md"]);
    user.click(screen.getByRole("button", { name: "New folder" }));
    await settle();
    screen.getByRole<HTMLInputElement>("textbox").value = "assets";
    await user.keyboard("{Enter}");
    await settle();
    expect(fs.entry("assets")?.kind).toBe("folder");
    expect(rows()).toEqual(["assets", "docs", "src", "README.md"]);
  });

  test("F2 renames with the name before the extension chosen", async () => {
    const fs = workspace();
    const log: Log = { events: [] };
    render(() => <Explorer fs={fs} log={log} />);
    focusTree();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    await user.keyboard("{F2}");
    await settle();
    const field = screen.getByRole<HTMLInputElement>("textbox", { name: "Rename README.md" });
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 6]);
    field.value = "GUIDE.md";
    await user.keyboard("{Enter}");
    await settle();
    expect(fs.read("GUIDE.md")).toBe("# Notes");
    expect(log.events).toEqual(["move README.md GUIDE.md"]);
    expect(document.activeElement?.textContent).toContain("GUIDE.md");
  });

  test("Delete asks first, then removes a folder with what is in it", async () => {
    const fs = workspace();
    const log: Log = { events: [] };
    render(() => <Explorer fs={fs} log={log} />);
    focusTree();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toContain("src");
    await user.keyboard("{Delete}");
    await settle();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("Delete src?");
    expect(dialog.textContent).toContain("The 4 items in it are deleted with it.");
    user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await settle();
    await settle();
    expect(fs.exists("src")).toBe(false);
    expect(log.events).toEqual(["delete src"]);
    expect(rows()).toEqual(["docs", "README.md"]);
  });

  test("a right-click opens the row's actions", async () => {
    const fs = workspace();
    render(() => <Explorer fs={fs} />);
    const docs = row("docs");
    docs.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 4, clientY: 4 }),
    );
    await settle();
    const menu = screen.getByRole("menu", { name: "File actions" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((one) => one.textContent),
    ).toEqual(["New file", "New folder", "Rename", "Delete", "Copy path"]);
    user.click(within(menu).getByRole("menuitem", { name: "New file" }));
    await settle();
    screen.getByRole<HTMLInputElement>("textbox", { name: "File name" }).value = "a.md";
    await user.keyboard("{Enter}");
    await settle();
    expect(fs.read("docs/a.md")).toBe("");
  });

  test("a row moves into a folder with its drag button", async () => {
    const fs = workspace();
    const log: Log = { events: [] };
    render(() => <Explorer fs={fs} log={log} />);
    const readme = row("README.md");
    readme.focus();
    press("ArrowRight");
    expect(document.activeElement?.getAttribute("data-slot")).toBe("tree-view-drag");
    press("Enter");
    await nextFrame();
    press("ArrowUp");
    press("ArrowUp");
    press("Enter");
    await nextFrame();
    await settle();
    expect(log.events).toEqual(["move README.md src/README.md"]);
    expect(fs.read("src/README.md")).toBe("# Notes");
  });

  test("folders opened for the open file stay open after it, and Collapse folders shuts them", async () => {
    const [active, setActive] = createSignal("src/lib/deep.toy");
    render(() => <Explorer fs={workspace()} activePath={active()} />);
    setActive("README.md");
    await settle();
    expect(rows()).toContain("deep.toy");
    user.click(screen.getByRole("button", { name: "Collapse folders" }));
    await settle();
    expect(rows()).toEqual(["docs", "src", "README.md"]);
  });

  test("dirty files carry a dot that says so", () => {
    render(() => (
      <Explorer fs={workspace()} activePath="src/main.toy" dirtyPaths={["src/main.toy"]} />
    ));
    expect(row("main.toy").textContent).toContain("Unsaved changes");
    expect(row("util.toy").textContent).not.toContain("Unsaved changes");
  });

  test("read only: no actions, no rename", async () => {
    render(() => <Explorer fs={workspace()} readOnly />);
    expect(screen.queryByRole("button", { name: "New file" })).toBeNull();
    focusTree();
    await user.keyboard("{F2}");
    await settle();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector('[data-slot="tree-view-drag"]')).toBeNull();
  });

  test("empty says so", () => {
    render(() => <Explorer fs={virtualFs()} />);
    expect(screen.getByText("No files yet")).toBeDefined();
  });

  test("right to left, Left opens a folder", async () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <Explorer fs={workspace()} aria-label="ملفات" />
      </Arabic>
    ));
    focusTree();
    await user.keyboard("{ArrowDown}{ArrowLeft}");
    await settle();
    expect(rows()).toContain("main.toy");
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { FileExplorer, virtualFs } from "<arc>";
      const fs = virtualFs({ src: { "main.toy": "print 1" }, "README.md": "# Notes" });
      export function Page() {
        return <FileExplorer fs={fs} activePath="src/main.toy" dirtyPaths={["src/main.toy"]} />;
      }
    `);
    expect(result.container.querySelectorAll('[role="row"]')).toHaveLength(3);
    result.unmount();
  });
});
