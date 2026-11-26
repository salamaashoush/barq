import { afterEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { type Child } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, cleanup, render, screen, user, within } from "@barqjs/testing";
import {
  $createNodeSelection,
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  $setSelection,
  BEFORE_INPUT_COMMAND,
  type LexicalEditor,
} from "lexical";

import { hydrates } from "../test-arc.ts";
import { BlockEditor } from "./block-editor.tsx";
import { insertDivider } from "./commands.ts";
import { documentToMarkdown, markdownToDocument } from "./document.ts";
import { RichTextRenderer } from "./renderer.tsx";
import { capture, hydratesFromServer, keydown, layOut, settle } from "./test-editor.ts";

const entry = JSON.stringify(fileURLToPath(new URL("./index.ts", import.meta.url)));

afterEach(() => {
  cleanup();
  destroyAnnouncer();
  document.body.innerHTML = "";
});

const DOC = "First\n\nSecond\n\nThird";

function content(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="rich-text-editor-content"]')!;
}

function texts(editor: LexicalEditor): string[] {
  return editor.read(() =>
    $getRoot()
      .getChildren()
      .map((one) => one.getTextContent()),
  );
}

function kinds(editor: LexicalEditor): string[] {
  return editor.read(() =>
    $getRoot()
      .getChildren()
      .map((one) => one.getType()),
  );
}

async function caretIn(editor: LexicalEditor, index: number): Promise<void> {
  editor.update(() => $getRoot().getChildAtIndex(index)?.selectEnd());
  await settle();
}

async function mount(markdown = DOC): Promise<LexicalEditor> {
  const editor = capture();
  render(() => <BlockEditor label="Page" defaultMarkdown={markdown} onEditor={editor.set} />);
  await settle();
  return editor.get();
}

interface ArabicProps {
  children: Child;
}

function Arabic(props: ArabicProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("the block menu", () => {
  test("opens on a right click over a block and on Mod+/, named, with no violations", async () => {
    const editor = await mount();
    layOut(editor);
    content().dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientY: 45 }),
    );
    await settle();
    const menu = screen.getByRole("menu", { name: "Block actions" });
    expect(within(menu).getByRole("menuitem", { name: /Duplicate/ })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
    await user.click(within(menu).getByRole("menuitem", { name: /Duplicate/ }));
    await settle();
    expect(texts(editor)).toEqual(["First", "Second", "Second", "Third"]);
    await caretIn(editor, 0);
    keydown(content(), "/", { ctrlKey: true });
    await settle();
    expect(screen.getByRole("menu", { name: "Block actions" })).toBeDefined();
  });

  test("a right click with Shift, or on a link, keeps the browser's own menu", async () => {
    const editor = await mount("[a link](https://example.com)\n\nSecond");
    layOut(editor);
    const shifted = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientY: 5,
      shiftKey: true,
    });
    content().dispatchEvent(shifted);
    const onLink = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientY: 5 });
    content().querySelector("a")!.dispatchEvent(onLink);
    await settle();
    expect(shifted.defaultPrevented).toBe(false);
    expect(onLink.defaultPrevented).toBe(false);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("turns a line into a callout and a toggle, and back, taking the container apart first", async () => {
    const editor = await mount();
    await caretIn(editor, 1);
    async function turn(name: string): Promise<void> {
      await user.click(screen.getByRole("button", { name: "Block actions" }));
      await settle();
      await user.click(screen.getByRole("menuitemradio", { name }));
      await settle();
    }
    await turn("Callout");
    expect(kinds(editor)).toEqual(["paragraph", "callout", "paragraph"]);
    await turn("Toggle");
    expect(kinds(editor)).toEqual(["paragraph", "toggle", "paragraph"]);
    expect(content().querySelector('[data-slot="toggle-title"]')?.textContent).toBe("Second");
    await turn("Heading 2");
    expect(kinds(editor).slice(0, 3)).toEqual(["paragraph", "heading", "paragraph"]);
    expect(texts(editor)[1]).toBe("Second");
    expect(documentToMarkdown(editor.getEditorState().toJSON())).toContain("## Second");
  });

  test("Mod+D duplicates the caret's block and Alt+Shift with the arrows moves it", async () => {
    const editor = await mount();
    await caretIn(editor, 0);
    keydown(content(), "d", { ctrlKey: true, code: "KeyD" });
    await settle();
    expect(texts(editor)).toEqual(["First", "First", "Second", "Third"]);
    await caretIn(editor, 2);
    keydown(content(), "ArrowUp", { altKey: true, shiftKey: true });
    await settle();
    expect(texts(editor)).toEqual(["First", "Second", "First", "Third"]);
    keydown(content(), "ArrowDown", { altKey: true, shiftKey: true });
    await settle();
    expect(texts(editor)).toEqual(["First", "First", "Second", "Third"]);
  });

  test("the insert picker's group chips sit over the list and go away once a search is typed", async () => {
    const editor = await mount();
    await caretIn(editor, 0);
    await user.click(screen.getByRole("button", { name: "Insert a block" }));
    await settle();
    const chips = screen.getByRole("group", { name: "Groups" });
    const names = within(chips)
      .getAllByRole("button")
      .map((one) => one.textContent);
    expect(names).toContain("Basic");
    expect(names).toContain("Layout");
    await user.click(within(chips).getByRole("button", { name: "Layout" }));
    expect(document.activeElement?.getAttribute("data-slot")).toBe("command-input");
    await user.keyboard("cal");
    await settle();
    expect(screen.queryByRole("group", { name: "Groups" })).toBeNull();
  });
});

describe("blocks in place", () => {
  test("typing with a block chosen whole starts a line after it", async () => {
    const editor = await mount("Above\n\n---\n\nBelow");
    editor.update(() => {
      const selection = $createNodeSelection();
      selection.add($getRoot().getChildAtIndex(1)!.getKey());
      $setSelection(selection);
    });
    await settle();
    const typed = new InputEvent("beforeinput", {
      inputType: "insertText",
      data: "x",
      cancelable: true,
    });
    editor.update(() => {
      editor.dispatchCommand(BEFORE_INPUT_COMMAND, typed);
    });
    await settle();
    expect(typed.defaultPrevented).toBe(true);
    expect(texts(editor)).toEqual(["Above", "\n", "x", "Below"]);
    expect(kinds(editor)[1]).toBe("horizontalrule");
  });

  test("a divider goes before an empty line and keeps the caret on it", async () => {
    const editor = await mount("Above\n\nBelow");
    editor.update(() => {
      const line = $createParagraphNode();
      $getRoot().getFirstChildOrThrow().insertAfter(line);
      line.select();
    });
    await settle();
    insertDivider(editor);
    await settle();
    expect(kinds(editor)).toEqual(["paragraph", "horizontalrule", "paragraph", "paragraph"]);
    expect(texts(editor)).toEqual(["Above", "\n", "", "Below"]);
    const caret = editor.read(() => {
      const selection = $getSelection();
      return $isRangeSelection(selection)
        ? selection.anchor.getNode().getTopLevelElement()?.getIndexWithinParent()
        : null;
    });
    expect(caret).toBe(2);
  });

  test("a block chosen in a table's cell goes after the table, a cell taking text only", async () => {
    const editor = await mount("| a | b |\n| --- | --- |\n| c | d |");
    editor.update(() => {
      const table = $getRoot().getFirstChild();
      const text = $isElementNode(table) ? table.getFirstDescendant() : null;
      text?.selectEnd();
    });
    await settle();
    insertDivider(editor);
    await settle();
    expect(kinds(editor)).toEqual(["table", "horizontalrule", "paragraph"]);
  });

  test("an empty toggle title and a callout of one empty line say what they are", async () => {
    const editor = await mount("> [!info]\n>\n\n<details open>\n<summary></summary>\n\nInside\n\n</details>");
    await settle();
    const callout = content().querySelector('[data-slot="callout"] > *');
    expect(callout?.getAttribute("data-placeholder")).toBe("Callout");
    const title = content().querySelector('[data-slot="toggle-title"]');
    expect(title?.getAttribute("data-placeholder")).toBe("Toggle heading");
    await caretIn(editor, 0);
    expect(content().querySelector('[data-slot="callout"] > *')?.getAttribute("data-placeholder")).toBe(
      "Callout",
    );
  });

  test("in an Arabic document the block menu's turn-into and placeholders read right to left", async () => {
    const editor = capture();
    render(() => (
      <Arabic>
        <BlockEditor label="صفحة" defaultMarkdown={"الأول\n\nالثاني"} onEditor={editor.set} />
      </Arabic>
    ));
    await settle();
    await caretIn(editor.get(), 1);
    await user.click(screen.getByRole("button", { name: "Block actions" }));
    await settle();
    await user.click(screen.getByRole("menuitemradio", { name: "Callout" }));
    await settle();
    expect(kinds(editor.get())).toEqual(["paragraph", "callout", "paragraph"]);
    const body = document.querySelector('[data-slot="rich-text-editor-body"]');
    expect(body?.getAttribute("dir")).toBe("rtl");
  });
});

describe("blocks read and drawn", () => {
  const TURNED = "> [!info]\n> Second\n\n<details open>\n<summary>Title</summary>\n\nInside\n\n</details>\n\n***\n\nAfter";

  test("turned blocks write and read back as markdown, and the renderer draws them", async () => {
    const state = markdownToDocument(TURNED);
    expect(state.root.children.map((one) => one.type)).toEqual([
      "callout",
      "toggle",
      "horizontalrule",
      "paragraph",
    ]);
    expect(documentToMarkdown(state)).toBe(TURNED);
    render(() => <RichTextRenderer markdown={TURNED} />);
    expect(document.querySelector('[data-slot="callout"]')?.textContent).toBe("Second");
    expect(document.querySelector("details summary")?.textContent).toBe("Title");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("hydrates what the server wrote, read and in the block editor", async () => {
    const result = await hydrates(`
      import { RichTextRenderer } from ${entry};
      export function Page() {
        return <RichTextRenderer markdown={${JSON.stringify(TURNED)}} />;
      }
    `);
    result.unmount();
    const page = await hydratesFromServer(
      "BlockEditor",
      `<BlockEditor label="Page" defaultMarkdown={${JSON.stringify(TURNED)}} />`,
    );
    expect(content().querySelector('[data-slot="callout"]')).not.toBeNull();
    expect(content().hasAttribute("data-lexical-editor")).toBe(true);
    page.dispose();
  });
});
