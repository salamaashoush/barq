import { afterEach, describe, expect, test } from "bun:test";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { cleanup, render, screen, user, waitFor } from "@barqjs/testing";
import { $createHeadingNode } from "@lexical/rich-text";
import { $isTableNode } from "@lexical/table";
import { $createParagraphNode, $getRoot, type LexicalEditor } from "lexical";

import { BlockEditor } from "./block-editor.tsx";
import { OPEN_TABLE_DIALOG_COMMAND } from "./commands.ts";
import { type ImageData, ImageBlock } from "./media.tsx";
import { RichTextRenderer } from "./renderer.tsx";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { capture, settle, typeText } from "./test-editor.ts";

afterEach(() => {
  cleanup();
  destroyAnnouncer();
  document.body.innerHTML = "";
});

function content(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="rich-text-editor-content"]')!;
}

function widthsOf(editor: LexicalEditor) {
  return editor.read(() => {
    const table = $getRoot()
      .getChildren()
      .find((one) => $isTableNode(one));
    return $isTableNode(table) ? table.getColWidths() : undefined;
  });
}

describe("the table size picker", () => {
  test("the Insert menu's Table opens a grid that lights up to the size and inserts it", async () => {
    render(() => <RichTextEditor label="Notes" />);
    await settle();
    await user.click(screen.getByRole("button", { name: "Insert" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Table" }));
    await settle();
    const grid = screen.getByRole("group", { name: "Table size" });
    expect(grid.querySelectorAll("button")).toHaveLength(64);
    const cell = screen.getByRole("button", { name: "2 by 4 table" });
    cell.dispatchEvent(new PointerEvent("pointerenter"));
    await settle();
    expect(grid.querySelectorAll("[data-within]")).toHaveLength(8);
    expect(document.querySelector('[data-slot="table-size-label"]')?.textContent).toBe(
      "2 by 4 table",
    );
    await user.click(cell);
    await settle();
    expect(content().querySelectorAll("tr")).toHaveLength(2);
    expect(content().querySelector("tr")?.children).toHaveLength(4);
  });

  test("one Tab stop: the arrows change the size along the line, and Enter picks it", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" onEditor={editor.set} />);
    await settle();
    expect(editor.get().dispatchCommand(OPEN_TABLE_DIALOG_COMMAND, undefined)).toBe(true);
    await settle();
    const start = screen.getByRole("button", { name: "3 by 3 table" });
    expect(start.tabIndex).toBe(0);
    start.focus();
    user.key("ArrowRight");
    user.key("ArrowDown");
    await settle();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("4 by 4 table");
    user.keyboard("{Enter}");
    await settle();
    await waitFor(() => expect(content().querySelectorAll("tr")).toHaveLength(4));
  });
});

describe("column widths", () => {
  test("the column edge beside the caret's cell resizes by pointer or arrows, and the renderer keeps it", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" onEditor={editor.set} />);
    await settle();
    editor.get().dispatchCommand(OPEN_TABLE_DIALOG_COMMAND, undefined);
    await settle();
    await user.click(screen.getByRole("button", { name: "2 by 3 table" }));
    await settle();
    editor.get().update(() => {
      $getRoot()
        .getChildren()
        .find((one) => $isTableNode(one))
        ?.selectStart();
    });
    await settle();
    const resizer = screen.getByRole("separator", { name: "Resize column" });
    // happy-dom lays nothing out: every column measures 0, so the first step lands on the narrowest.
    resizer.focus();
    user.key("ArrowRight");
    await settle();
    expect(document.activeElement).toBe(resizer);
    user.key("ArrowRight");
    await settle();
    expect(widthsOf(editor.get())).toEqual([56, 0, 0]);
    // happy-dom leaves `pageX` at 0, and a drag reads the page's coordinates.
    function at(type: string, x: number): PointerEvent {
      const event = new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1 });
      Object.defineProperty(event, "pageX", { value: x });
      Object.defineProperty(event, "pageY", { value: 0 });
      return event;
    }
    resizer.dispatchEvent(at("pointerdown", 100));
    resizer.dispatchEvent(at("pointermove", 120));
    resizer.dispatchEvent(at("pointerup", 120));
    await settle();
    expect(widthsOf(editor.get())).toEqual([76, 0, 0]);
    expect(content().querySelectorAll("colgroup col")).toHaveLength(3);
    const stored = editor.get().getEditorState().toJSON();
    cleanup();
    render(() => <RichTextRenderer value={stored} />);
    const cols = [...document.querySelectorAll("colgroup col")] as HTMLElement[];
    expect(cols.map((one) => one.style.width)).toEqual(["76px", "", ""]);
  });
});

describe("an image's alt text and caption", () => {
  test("edited in a popover from the button over the picture", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" onEditor={editor.set} upload={async () => ""} />);
    await settle();
    editor.get().update(() => {
      $getRoot().append(
        ImageBlock.$create({ src: "https://cdn.example.com/chart.png", alt: "chart" }),
      );
    });
    await settle();
    await user.click(screen.getByRole("button", { name: "Alt text and caption" }));
    await settle();
    const alt = screen.getByRole<HTMLInputElement>("textbox", { name: "Alt text" });
    expect(alt.value).toBe("chart");
    user.clear(alt);
    user.type(alt, "Sales by quarter");
    user.type(screen.getByRole("textbox", { name: "Caption" }), "Figure 1");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await settle();
    const data = editor.get().read((): ImageData | null => {
      for (const one of $getRoot().getChildren()) if (ImageBlock.$is(one)) return one.getData();
      return null;
    });
    expect(data).toMatchObject({ alt: "Sales by quarter", caption: "Figure 1" });
    const figure = document.querySelector('[data-slot="editor-image"]');
    expect(figure?.querySelector("img")?.getAttribute("alt")).toBe("Sales by quarter");
    expect(figure?.querySelector("figcaption")?.textContent).toBe("Figure 1");
  });
});

describe("BlockEditor's placeholders", () => {
  test("the caret's empty line and every empty heading say what they are for", async () => {
    const editor = capture();
    render(() => <BlockEditor label="Page" onEditor={editor.set} />);
    await settle();
    editor.get().update(() => {
      const root = $getRoot().clear();
      root.append($createHeadingNode("h2"), $createParagraphNode());
      root.getLastChildOrThrow().selectStart();
    });
    await settle();
    const [heading, line] = [...content().children] as HTMLElement[];
    expect(heading?.dataset.placeholder).toBe("Heading 2");
    expect(line?.dataset.placeholder).toBe("Write, or press / for blocks");
    await typeText(editor.get(), "Hello");
    expect(line?.dataset.placeholder).toBeUndefined();
    expect(heading?.dataset.placeholder).toBe("Heading 2");
  });

  test("its own words, or none", async () => {
    const editor = capture();
    render(() => (
      <BlockEditor
        label="Page"
        onEditor={editor.set}
        blockPlaceholders={{ paragraph: "Start writing" }}
      />
    ));
    await settle();
    editor.get().update(() => $getRoot().selectStart());
    await settle();
    expect(content().querySelector("[data-placeholder]")?.getAttribute("data-placeholder")).toBe(
      "Start writing",
    );
    cleanup();
    render(() => <BlockEditor label="Page" blockPlaceholders={false} />);
    await settle();
    expect(content().querySelector("[data-placeholder]")).toBeNull();
  });
});
