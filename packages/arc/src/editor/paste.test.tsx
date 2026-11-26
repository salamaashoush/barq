import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen, user, waitFor } from "@barqjs/testing";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  COPY_COMMAND,
  type LexicalEditor,
  PASTE_COMMAND,
} from "lexical";

import { BlockEditor } from "./block-editor.tsx";
import { embedExtension } from "./core.tsx";
import { documentToMarkdown, htmlToDocument } from "./document.ts";
import { clipboardGrid, isMarkdown } from "./paste.ts";
import { sanitiseStyle } from "./text-style.ts";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { capture, settle, textOf } from "./test-editor.ts";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function transfer(data: Record<string, string>): DataTransfer {
  const out = new DataTransfer();
  for (const [kind, value] of Object.entries(data)) out.setData(kind, value);
  return out;
}

async function paste(editor: LexicalEditor, data: Record<string, string>): Promise<void> {
  editor.dispatchCommand(
    PASTE_COMMAND,
    new ClipboardEvent("paste", { clipboardData: transfer(data) }),
  );
  await settle();
}

/** Embeds from a site of the test's own, framed as a blank page, which a test page can load. */
const EMBEDS = embedExtension({
  providers: [
    {
      name: "Example video",
      match: (url) => (url.hostname === "video.example.com" ? "about:blank" : null),
    },
  ],
});

async function mount(markdown = ""): Promise<LexicalEditor> {
  const editor = capture();
  render(() => (
    <RichTextEditor
      label="Notes"
      defaultMarkdown={markdown}
      extensions={[EMBEDS]}
      onEditor={editor.set}
    />
  ));
  await settle();
  editor.get().update(() => $getRoot().selectEnd());
  await settle();
  return editor.get();
}

function types(editor: LexicalEditor): string[] {
  return editor.read(() =>
    $getRoot()
      .getChildren()
      .map((one) => one.getType()),
  );
}

describe("what a paste is read as", () => {
  test("cells from a spreadsheet, tab-indented code not", () => {
    expect(clipboardGrid("Name\tRole\nSam\tOwner\n", "")).toEqual([
      ["Name", "Role"],
      ["Sam", "Owner"],
    ]);
    expect(clipboardGrid("\tindented\n\tcode", "")).toBeNull();
    expect(clipboardGrid("a\tb\nc", "")).toBeNull();
    expect(clipboardGrid("", "<table><tr><td>a</td><td>b</td></tr></table>")).toEqual([["a", "b"]]);
    expect(clipboardGrid("one", "")).toBeNull();
  });

  test("markdown from a chat or an assistant, a browser's page not", () => {
    expect(isMarkdown("# Title\n\n- a", "")).toBe(true);
    expect(isMarkdown("Some **bold** words", "")).toBe(true);
    expect(isMarkdown("# Title", "<h1>Title</h1>")).toBe(false);
    expect(isMarkdown("just words", "")).toBe(false);
  });

  test("a pasted style keeps its colour, highlight, size and first font", () => {
    expect(
      sanitiseStyle(
        "color: rgb(255, 0, 0); margin: 4px; background-color: rgba(0,0,0,0); font-size: 18px; font-family: Inter, sans-serif; line-height: 2",
      ),
    ).toBe("color: #ff0000; font-size: 18px; font-family: Inter");
  });
});

describe("pasting into the editor", () => {
  test("cells from a spreadsheet become a table with its header row", async () => {
    const editor = await mount();
    await paste(editor, { "text/plain": "Name\tRole\nSam\tOwner" });
    expect(types(editor)).toContain("table");
    expect(document.querySelectorAll("th")).toHaveLength(2);
    expect(textOf(editor)).toContain("Owner");
  });

  test("cells pasted in a table fill it from the cell in hand, adding the rows they need", async () => {
    const editor = await mount("| A | B |\n| --- | --- |\n| 1 | 2 |");
    editor.update(() => {
      const table = $getRoot().getFirstChild();
      if ($isElementNode(table)) table.getLastDescendant()?.getParent()?.selectEnd();
    });
    await settle();
    await paste(editor, { "text/plain": "x\ty\nz\tw" });
    expect(document.querySelectorAll("tr")).toHaveLength(3);
    expect(textOf(editor)).toContain("w");
  });

  test("an address pasted over words links them; one on an empty line from a provider embeds", async () => {
    const editor = await mount();
    editor.update(() => {
      const text = $createTextNode("the docs");
      $getRoot().clear().append($createParagraphNode().append(text));
      text.select(0, 8);
    });
    await paste(editor, { "text/plain": "https://example.com/docs" });
    expect(documentToMarkdown(editor.getEditorState().toJSON())).toBe(
      "[the docs](https://example.com/docs)",
    );
    editor.update(() => {
      const line = $createParagraphNode();
      $getRoot().append(line);
      line.select();
    });
    await paste(editor, { "text/plain": "https://video.example.com/watch/1" });
    expect(types(editor)).toContain("embed");
  });

  test("markdown becomes headings, lists and the rest where the caret is", async () => {
    const editor = await mount();
    await paste(editor, { "text/plain": "## Plan\n\n- one\n- two\n\n> [!tip]\n> Go early" });
    expect(types(editor)).toEqual(["heading", "list", "callout"]);
  });

  test("HTML is read through every extension, blocks standing apart and unsafe links left as words", async () => {
    const editor = await mount();
    await paste(editor, {
      "text/plain": "x",
      "text/html": [
        '<p>Look <img src="https://example.com/a.png" alt="A map"> here <a href="javascript:alert(1)">now</a></p>',
        '<div data-callout="warning"><p>Careful</p></div>',
        "<details><summary>More</summary><p>Inside</p></details>",
        '<p>A word<sup data-footnote="A note"></sup></p>',
      ].join(""),
    });
    expect(types(editor)).toEqual(["paragraph", "image", "callout", "toggle", "paragraph"]);
    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(json).not.toContain("javascript:");
    expect(json).toContain('"tone":"warning"');
    expect(json).toContain('"open":false');
    expect(json).toContain('"note":"A note"');
  });

  test("a style a paste brings keeps only its colour, highlight, size and font", async () => {
    const editor = await mount();
    editor.update(() => {
      const text = $createTextNode("blue").setStyle("color: rgb(0, 0, 255); margin: 3px");
      $getRoot().clear().append($createParagraphNode().append(text));
    });
    await settle();
    expect(JSON.stringify(editor.getEditorState().toJSON())).toContain('"style":"color: #0000ff"');
  });

  test("what the editor copied pastes whole while the clipboard holds its text", async () => {
    const editor = await mount("**Keep** this");
    editor.update(() => $getRoot().select(0, 1));
    const copied = new DataTransfer();
    editor.dispatchCommand(COPY_COMMAND, new ClipboardEvent("copy", { clipboardData: copied }));
    editor.update(() => {
      $getRoot().clear().append($createParagraphNode());
      $getRoot().selectEnd();
    });
    await settle();
    // A copy through the browser's clipboard API keeps only the text.
    await paste(editor, { "text/plain": copied.getData("text/plain") });
    expect(documentToMarkdown(editor.getEditorState().toJSON())).toBe("**Keep** this");
  });
});

interface ClipboardNode {
  type: string;
  data?: unknown;
}

describe("HTML as a document", () => {
  test("keeps words, lists and tables, and stands pictures and embeds apart as blocks", () => {
    const state = htmlToDocument(`
      <h2>Rivers</h2>
      <p>Rivers flood <strong>every</strong> spring. <img src="https://example.com/flood.jpg" alt="A flood"></p>
      <ul><li>Rain</li><li>Snow</li></ul>
      <table><tr><td>May</td></tr></table>
      <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>
      <div data-page-break></div>
    `);
    const children = state.root.children as unknown as ClipboardNode[];
    expect(children.map((node) => node.type)).toEqual([
      "heading",
      "paragraph",
      "image",
      "list",
      "table",
      "embed",
      "pagebreak",
    ]);
    expect(children[2]).toMatchObject({
      src: "https://example.com/flood.jpg",
      alt: "A flood",
    });
  });
});

describe("a block's menu", () => {
  test("cuts a block to the clipboard, and pastes it back where the caret is in another", async () => {
    const written: ClipboardItem[] = [];
    const clipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: async (items: ClipboardItem[]) => {
          written.push(...items);
        },
        read: async () => written,
        readText: async () => "",
      },
    });
    try {
      const editor = capture();
      render(() => (
        <BlockEditor label="Page" defaultMarkdown={"First\n\nSecond"} onEditor={editor.set} />
      ));
      await settle();
      editor.get().update(() => $getRoot().getFirstChild()?.selectEnd());
      await settle();
      await user.click(screen.getByRole("button", { name: "Block actions" }));
      await settle();
      await user.click(screen.getByRole("menuitem", { name: "Cut" }));
      await waitFor(() => expect(textOf(editor.get())).toBe("Second"));
      expect(written).toHaveLength(1);
      editor.get().update(() => $getRoot().getFirstChild()?.selectEnd());
      await settle();
      await user.click(screen.getByRole("button", { name: "Block actions" }));
      await settle();
      await user.click(screen.getByRole("menuitem", { name: "Paste" }));
      await waitFor(() => expect(textOf(editor.get())).toBe("SecondFirst"));
    } finally {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
    }
  });
});
