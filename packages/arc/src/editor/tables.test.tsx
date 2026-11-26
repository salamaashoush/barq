import { afterEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { type Child } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, cleanup, render, screen, user, waitFor, within } from "@barqjs/testing";
import {
  $createTableSelectionFrom,
  $isTableCellNode,
  $isTableNode,
  type TableCellNode,
  type TableNode,
} from "@lexical/table";
import { $getRoot, $isElementNode, $setSelection, type LexicalEditor } from "lexical";

import { serverProcess } from "../ssr-harness.ts";
import { hydrates } from "../test-arc.ts";
import { documentToMarkdown, htmlToDocument, markdownToDocument } from "./document.ts";
import { RichTextRenderer } from "./renderer.tsx";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { HIGHLIGHT_COLOURS } from "./text-style.ts";
import { capture, hydratesFromServer, keydown, settle } from "./test-editor.ts";

const entry = JSON.stringify(fileURLToPath(new URL("./index.ts", import.meta.url)));

afterEach(() => {
  cleanup();
  destroyAnnouncer();
  document.body.innerHTML = "";
});

const TABLE = "| a | b |\n| --- | --- |\n| c | d |";

function content(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="rich-text-editor-content"]')!;
}

function $table(): TableNode {
  const table = $getRoot().getChildren().find($isTableNode);
  if (table === undefined) throw new Error("no table");
  return table;
}

/** The table's text, row by row. */
function grid(editor: LexicalEditor): string[][] {
  return editor.read(() =>
    $table()
      .getChildren()
      .map((row) =>
        "getChildren" in row
          ? (row as TableNode).getChildren().map((cell) => cell.getTextContent())
          : [],
      ),
  );
}

function firstRowSize(): number {
  const row = $table().getFirstChild();
  return $isElementNode(row) ? row.getChildrenSize() : 0;
}

function cells(editor: LexicalEditor): TableCellNode[] {
  return editor.read(() =>
    $table()
      .getAllTextNodes()
      .map((text) => text.getParentOrThrow().getParentOrThrow())
      .filter($isTableCellNode),
  );
}

async function mount(markdown = TABLE): Promise<LexicalEditor> {
  const editor = capture();
  render(() => <RichTextEditor label="Notes" defaultMarkdown={markdown} onEditor={editor.set} />);
  await settle();
  return editor.get();
}

async function caretInCell(editor: LexicalEditor, text: string): Promise<void> {
  editor.update(() => {
    const node = $table()
      .getAllTextNodes()
      .find((one) => one.getTextContent() === text);
    node?.selectEnd();
  });
  await settle();
}

async function menu(name = "Table actions"): Promise<void> {
  await user.click(screen.getByRole("button", { name }));
  await settle();
}

async function choose(name: string | RegExp, role = "menuitem"): Promise<void> {
  await user.click(screen.getByRole(role, { name }));
  await settle();
}

interface ArabicProps {
  children: Child;
}

function Arabic(props: ArabicProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("a table's keys", () => {
  test("Tab in the last cell adds a row and goes into it; elsewhere it goes to the next cell", async () => {
    const editor = await mount();
    await caretInCell(editor, "c");
    keydown(content(), "Tab");
    await settle();
    expect(grid(editor)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    await caretInCell(editor, "d");
    keydown(content(), "Tab");
    await settle();
    expect(grid(editor)).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["", ""],
    ]);
  });
});

describe("a table's menus", () => {
  test("moves rows and columns, merges and splits, with no violations", async () => {
    const editor = await mount();
    await caretInCell(editor, "a");
    await menu();
    expect(await ariaViolations(document.body)).toEqual([]);
    expect(
      screen.getByRole("menuitem", { name: "Move row up" }).getAttribute("aria-disabled"),
    ).toBe("true");
    await choose("Move column after");
    expect(grid(editor)).toEqual([
      ["b", "a"],
      ["d", "c"],
    ]);
    await caretInCell(editor, "a");
    await menu();
    await choose("Move row down");
    expect(grid(editor)).toEqual([
      ["d", "c"],
      ["b", "a"],
    ]);
    editor.update(() => {
      const [first, second] = $table().getAllTextNodes();
      const from = first?.getParentOrThrow().getParentOrThrow();
      const to = second?.getParentOrThrow().getParentOrThrow();
      if ($isTableCellNode(from) && $isTableCellNode(to)) {
        $setSelection($createTableSelectionFrom($table(), from, to));
      }
    });
    await settle();
    await menu();
    await choose("Merge cells");
    expect(editor.read(() => firstRowSize())).toBe(1);
    await caretInCell(editor, "dc");
    await menu();
    await choose("Split cell");
    expect(editor.read(() => firstRowSize())).toBe(2);
  });

  test("header column, stripes, colour and alignment, which the renderer draws", async () => {
    const editor = await mount();
    await caretInCell(editor, "c");
    await menu();
    await choose("Header column", "menuitemcheckbox");
    await menu();
    await choose("Striped rows", "menuitemcheckbox");
    await menu();
    await choose("Green", "menuitemradio");
    await menu();
    await choose("Middle", "menuitemradio");
    await menu();
    await choose("Centre", "menuitemradio");
    const cell = cells(editor).find((one) => editor.read(() => one.getTextContent()) === "c")!;
    expect(editor.read(() => cell.getBackgroundColor())).toBe(HIGHLIGHT_COLOURS.green);
    expect(editor.read(() => cell.getVerticalAlign())).toBe("middle");
    const stored = editor.getEditorState().toJSON();
    expect(JSON.stringify(stored)).toContain('"rowStriping":true');
    expect(JSON.stringify(stored)).toContain('"format":"center"');
    cleanup();
    render(() => <RichTextRenderer value={stored} />);
    const table = document.querySelector("table")!;
    expect(table.getAttribute("data-lexical-row-striping")).toBe("true");
    const drawn = [...table.querySelectorAll<HTMLElement>("td, th")].find(
      (one) => one.textContent === "c",
    )!;
    expect(drawn.localName).toBe("th");
    expect(drawn.getAttribute("scope")).toBe("row");
    expect(drawn.style.verticalAlign).toBe("middle");
    expect(drawn.getAttribute("style")).toContain("background-color");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a line goes above or below a table that starts or ends the document", async () => {
    const editor = await mount();
    await caretInCell(editor, "a");
    await menu();
    await choose("Add a line above");
    await caretInCell(editor, "a");
    await menu();
    await choose("Add a line below");
    expect(
      editor.read(() =>
        $getRoot()
          .getChildren()
          .map((one) => one.getType()),
      ),
    ).toEqual(["paragraph", "table", "paragraph"]);
  });
});

describe("a table's grips", () => {
  test("a row's grip chooses the row and opens its menu; Alt and the arrows move it", async () => {
    const editor = await mount("| a | b |\n| --- | --- |\n| c | d |\n| e | f |");
    await caretInCell(editor, "c");
    const grip = screen.getByRole("button", { name: "Row 2" });
    expect(grip.getAttribute("title")).toBe("Drag to move, or press for actions");
    grip.focus();
    keydown(grip, "ArrowDown", { altKey: true });
    await settle();
    expect(grid(editor).map((row) => row[0])).toEqual(["a", "e", "c"]);
    await waitFor(() =>
      expect(
        [...document.querySelectorAll('[role="log"]')].map((one) => one.textContent).join(" "),
      ).toContain("Row moved to 3 of 3"),
    );
    await user.click(screen.getByRole("button", { name: "Row 1" }));
    await settle();
    const rowMenu = screen.getByRole("menu", { name: "Row 1" });
    expect(
      within(rowMenu).getByRole("menuitem", { name: "Move row up" }).getAttribute("aria-disabled"),
    ).toBe("true");
    await user.click(within(rowMenu).getByRole("menuitem", { name: "Move row down" }));
    await settle();
    expect(grid(editor).map((row) => row[0])).toEqual(["e", "a", "c"]);
  });

  test("a column's grip dragged by a pointer moves its column to where it is let go", async () => {
    const editor = await mount("| a | b | c |\n| --- | --- | --- |\n| d | e | f |");
    await caretInCell(editor, "d");
    for (const [index, element] of [
      ...content().querySelectorAll("tr:first-child > *"),
    ].entries()) {
      element.getBoundingClientRect = () =>
        ({
          top: 0,
          bottom: 30,
          height: 30,
          left: index * 100,
          right: index * 100 + 100,
          width: 100,
          x: index * 100,
          y: 0,
        }) as DOMRect;
    }
    editor.update(() => $getRoot().markDirty());
    await settle();
    const grip = screen.getByRole("button", { name: "Column 1" });
    grip.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        pointerId: 1,
        clientX: 50,
        clientY: -10,
      }),
    );
    grip.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 180, clientY: -10 }),
    );
    grip.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: 260, clientY: -10 }),
    );
    await settle();
    expect(grid(editor)[0]).toEqual(["b", "c", "a"]);
  });

  test("in an Arabic document a column moves after with the left arrow, the reading way", async () => {
    const editor = capture();
    render(() => (
      <Arabic>
        <RichTextEditor
          label="ملاحظات"
          defaultMarkdown={"| أ | ب |\n| --- | --- |\n| ج | د |"}
          onEditor={editor.set}
        />
      </Arabic>
    ));
    await settle();
    await caretInCell(editor.get(), "ج");
    const grip = screen.getByRole("button", { name: "Column 1" });
    grip.focus();
    keydown(grip, "ArrowLeft", { altKey: true });
    await settle();
    expect(grid(editor.get())[0]).toEqual(["ب", "أ"]);
  });
});

describe("tables read and written", () => {
  test("a pipe table reads back the same, and HTML's cell colours and alignment read in", () => {
    expect(documentToMarkdown(markdownToDocument(TABLE))).toBe(TABLE);
    const state = htmlToDocument(
      `<table><tr><td style="background-color: ${HIGHLIGHT_COLOURS.blue}; vertical-align: bottom">x</td><td>y</td></tr></table>`,
    );
    const json = JSON.stringify(state);
    expect(json).toContain('"verticalAlign":"bottom"');
    expect(json).toContain(`"backgroundColor":"${HIGHLIGHT_COLOURS.blue}"`);
  });

  test("a server draws a striped table with its colours, and the page hydrates with every node kept", async () => {
    const stored = htmlToDocument(
      `<table><tr><th>h</th><th>i</th></tr><tr><td style="background-color: ${HIGHLIGHT_COLOURS.red}">x</td><td>y</td></tr></table>`,
    );
    const table = stored.root.children[0] as unknown as Record<string, unknown>;
    table.rowStriping = true;
    const { code, html } = await serverProcess(`
      import { renderToStringAsync } from "@barqjs/server";
      import { RichTextRenderer } from ${entry};
      export async function page() {
        return await renderToStringAsync(() => <RichTextRenderer value={${JSON.stringify(stored)}} />);
      }
    `);
    expect(code).toBe(0);
    expect(html).toContain('data-lexical-row-striping="true"');
    expect(html).toContain("background-color");
    const result = await hydrates(`
      import { RichTextRenderer } from ${entry};
      export function Page() {
        return <RichTextRenderer value={${JSON.stringify(stored)}} />;
      }
    `);
    result.unmount();
    const page = await hydratesFromServer(
      "RichTextEditor",
      `<RichTextEditor label="Notes" defaultValue={${JSON.stringify(stored)}} />`,
    );
    expect(content().querySelector("table")).not.toBeNull();
    page.dispose();
  });
});
