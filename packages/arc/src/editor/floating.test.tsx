import { afterEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { ariaViolations, cleanup, render, screen, user, within } from "@barqjs/testing";
import {
  $createNodeSelection,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  $setSelection,
  type LexicalEditor,
} from "lexical";

import { hydrates } from "../test-arc.ts";
import { documentToMarkdown, markdownToDocument } from "./document.ts";
import { RichTextRenderer } from "./renderer.tsx";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { capture, hydratesFromServer, keydown, settle, typeText } from "./test-editor.ts";

const entry = JSON.stringify(fileURLToPath(new URL("./index.ts", import.meta.url)));

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function content(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="rich-text-editor-content"]')!;
}

function barElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-slot="floating-format-toolbar"]');
}

function kinds(editor: LexicalEditor): string[] {
  return editor.read(() =>
    $getRoot()
      .getChildren()
      .map((one) => one.getType()),
  );
}

async function mount(markdown: string): Promise<LexicalEditor> {
  const editor = capture();
  render(() => <RichTextEditor label="Notes" defaultMarkdown={markdown} onEditor={editor.set} />);
  await settle();
  return editor.get();
}

/** Selects `length` characters from `from` in the text of the block at `index`. */
async function select(editor: LexicalEditor, index: number, from: number, length: number) {
  editor.update(() => {
    const block = $getRoot().getChildAtIndex(index);
    const text = $isElementNode(block) ? block.getFirstDescendant() : null;
    if ($isTextNode(text)) text.select(from, from + length);
  });
  await settle();
}

describe("the floating bar", () => {
  test("shows for words selected, stays away from code, and hides while a pointer is pressed", async () => {
    const editor = await mount("Some words\n\n```js\nlet a = 1;\n```");
    await select(editor, 0, 0, 4);
    expect(barElement()?.getAttribute("data-mode")).toBe("text");
    content().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    await settle();
    expect(barElement()).toBeNull();
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    await settle();
    expect(barElement()).not.toBeNull();
    editor.update(() => {
      const code = $getRoot().getLastChild();
      if ($isElementNode(code)) code.select(0, code.getChildrenSize());
    });
    await settle();
    expect(barElement()).toBeNull();
  });

  test("Alt+F10 moves into it, Escape back to the text with the selection kept", async () => {
    const editor = await mount("Some words");
    await select(editor, 0, 0, 4);
    keydown(content(), "F10", { altKey: true });
    await settle();
    expect(barElement()?.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    await settle();
    expect(barElement()).toBeNull();
    expect(editor.read(() => $getRoot().getTextContent())).toBe("Some words");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("Turn into makes a heading, wraps the line in a callout, and unwraps it into a quote", async () => {
    const editor = await mount("First line\n\nSecond");
    await select(editor, 0, 0, 5);
    await user.click(within(barElement()!).getByRole("button", { name: "Turn into" }));
    await settle();
    await user.click(screen.getByRole("menuitemradio", { name: "Heading 2" }));
    await settle();
    expect(kinds(editor)).toEqual(["heading", "paragraph"]);
    await select(editor, 1, 0, 3);
    await user.click(within(barElement()!).getByRole("button", { name: "Turn into" }));
    await settle();
    await user.click(screen.getByRole("menuitemradio", { name: "Callout" }));
    await settle();
    expect(kinds(editor)).toEqual(["heading", "callout", "paragraph"]);
    await select(editor, 1, 0, 3);
    await user.click(within(barElement()!).getByRole("button", { name: "Turn into" }));
    await settle();
    const callout = screen.getByRole("menuitemradio", { name: "Callout" });
    expect(callout.getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByRole("menuitemradio", { name: "Quote" }));
    await settle();
    expect(kinds(editor).slice(0, 2)).toEqual(["heading", "quote"]);
    expect(documentToMarkdown(editor.getEditorState().toJSON())).toContain("> Second");
  });

  test("over a block chosen whole it duplicates and deletes, reached by Tab", async () => {
    const editor = await mount("Above\n\n---\n\nBelow");
    editor.update(() => {
      const selection = $createNodeSelection();
      const rule = $getRoot().getChildAtIndex(1);
      if (rule !== null) selection.add(rule.getKey());
      $setSelection(selection);
    });
    await settle();
    expect(barElement()?.getAttribute("data-mode")).toBe("block");
    const bar = within(barElement()!);
    expect(bar.getByRole("toolbar", { name: "Block" })).toBeDefined();
    keydown(content(), "Tab");
    await settle();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Duplicate");
    await user.click(bar.getByRole("button", { name: "Duplicate" }));
    await settle();
    expect(kinds(editor)).toEqual(["paragraph", "horizontalrule", "horizontalrule", "paragraph"]);
    editor.update(() => {
      const selection = $createNodeSelection();
      const rule = $getRoot().getChildAtIndex(1);
      if (rule !== null) selection.add(rule.getKey());
      $setSelection(selection);
    });
    await settle();
    await user.click(within(barElement()!).getByRole("button", { name: "Delete" }));
    await settle();
    expect(kinds(editor)).toEqual(["paragraph", "horizontalrule", "paragraph"]);
  });
});

describe("links", () => {
  test("a caret in a link offers its address to open, edit and remove", async () => {
    const editor = await mount("Read [the docs](https://example.com/docs) first");
    editor.update(() => {
      const paragraph = $getRoot().getFirstChild();
      const link = $isElementNode(paragraph) ? paragraph.getChildAtIndex(1) : null;
      const text = $isElementNode(link) ? link.getFirstDescendant() : null;
      if ($isTextNode(text)) text.select(2, 2);
    });
    await settle();
    const preview = within(document.querySelector<HTMLElement>('[data-slot="link-preview"]')!);
    expect(preview.getByRole("link", { name: "https://example.com/docs" })).toBeDefined();
    expect(preview.getByRole("link", { name: "Open link" }).getAttribute("href")).toBe(
      "https://example.com/docs",
    );
    await user.click(preview.getByRole("button", { name: "Edit link" }));
    await settle();
    const field = screen.getByRole<HTMLInputElement>("textbox", { name: "Link address" });
    expect(field.value).toBe("https://example.com/docs");
    await user.keyboard("{Escape}");
    await settle();
    editor.update(() => {
      const paragraph = $getRoot().getFirstChild();
      const link = $isElementNode(paragraph) ? paragraph.getChildAtIndex(1) : null;
      const text = $isElementNode(link) ? link.getFirstDescendant() : null;
      if ($isTextNode(text)) text.select(2, 2);
    });
    await settle();
    await user.click(
      within(document.querySelector<HTMLElement>('[data-slot="link-preview"]')!).getByRole(
        "button",
        { name: "Remove link" },
      ),
    );
    await settle();
    expect(content().querySelector("a")).toBeNull();
    expect(editor.read(() => $getRoot().getTextContent())).toBe("Read the docs first");
  });

  test("a link made on a caret writes its address as its words", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" onEditor={editor.set} />);
    await settle();
    editor.get().update(() => {
      $getRoot()
        .clear()
        .append($createParagraphNode().append($createTextNode("See ")));
      $getRoot().selectEnd();
    });
    await settle();
    keydown(content(), "k", { ctrlKey: true });
    await settle();
    await user.type(screen.getByRole("textbox", { name: "Link address" }), "example.com/a");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await settle();
    const link = content().querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.com/a");
    expect(link?.textContent).toBe("https://example.com/a");
    await typeText(editor.get(), "!");
    expect(documentToMarkdown(editor.get().getEditorState().toJSON())).toContain(
      "[https://example.com/a](https://example.com/a)",
    );
  });

  test("links read back from markdown, draw in the renderer and hydrate", async () => {
    const markdown = "See [the docs](https://example.com/docs).";
    expect(documentToMarkdown(markdownToDocument(markdown))).toBe(markdown);
    render(() => <RichTextRenderer markdown={markdown} />);
    expect(screen.getByRole("link", { name: /the docs/ }).getAttribute("href")).toBe(
      "https://example.com/docs",
    );
    cleanup();
    const result = await hydrates(`
      import { RichTextRenderer } from ${entry};
      export function Page() {
        return <RichTextRenderer markdown={${JSON.stringify(markdown)}} />;
      }
    `);
    result.unmount();
    const page = await hydratesFromServer(
      "RichTextEditor",
      `<RichTextEditor label="Notes" defaultMarkdown={${JSON.stringify(markdown)}} />`,
    );
    expect(content().querySelector("a")?.textContent).toBe("the docs");
    page.dispose();
  });
});
