import { afterEach, describe, expect, test } from "bun:test";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, cleanup, render, screen, user } from "@barqjs/testing";
import {
  $getRoot,
  DELETE_CHARACTER_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  type LexicalEditor,
} from "lexical";

import { hydrates } from "../test-arc.ts";
import { BlockEditor } from "./block-editor.tsx";
import { $isColumnsNode, columnsStyles } from "./columns.tsx";
import { documentToMarkdown, documentToText, markdownToDocument } from "./document.ts";
import { RichTextRenderer } from "./renderer.tsx";
import { capture, hydratesFromServer, keydown, settle, typeText } from "./test-editor.ts";
import { $isToggleNode } from "./toggle.tsx";

afterEach(() => {
  cleanup();
  destroyAnnouncer();
  document.body.innerHTML = "";
});

const entry = JSON.stringify(new URL("./index.ts", import.meta.url).pathname);

function content(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="rich-text-editor-content"]')!;
}

function kinds(editor: LexicalEditor): string[] {
  return editor.read(() =>
    $getRoot()
      .getChildren()
      .map((one) => one.getType()),
  );
}

async function mount(markdown = "") {
  const editor = capture();
  render(() => <BlockEditor label="Page" defaultMarkdown={markdown} onEditor={editor.set} />);
  await settle();
  editor.get().update(() => $getRoot().selectEnd());
  await settle();
  return editor.get();
}

async function slash(editor: LexicalEditor, command: string): Promise<void> {
  await typeText(editor, `/${command}`);
  keydown(content(), "Enter");
  await settle();
}

describe("columns", () => {
  test("/2 columns puts two empty columns in, each sharing the width, a line after them", async () => {
    const editor = await mount();
    await slash(editor, "2 columns");
    expect(kinds(editor)).toEqual(["columns", "paragraph"]);
    const columns = content().querySelectorAll('[data-slot="column"]');
    expect(columns).toHaveLength(2);
    expect((columns[0] as HTMLElement).getAttribute("style")).toContain("--share: 1");
    for (const one of columnsStyles({ editing: true }).column.split(" ")) {
      expect(columns[0]?.classList.contains(one)).toBe(true);
    }
  });

  test("the block menu changes the layout: a new column starts empty, a lost one's words move over", async () => {
    const editor = await mount();
    await slash(editor, "3 columns");
    editor.update(() => {
      const columns = $getRoot().getFirstChild();
      if (!$isColumnsNode(columns)) return;
      columns.getChildAtIndex(2)?.selectEnd();
    });
    await typeText(editor, "third");
    await user.click(screen.getByRole("button", { name: "Block actions" }));
    await settle();
    await user.click(screen.getByRole("menuitemradio", { name: "1 : 2" }));
    await settle();
    const columns = content().querySelectorAll('[data-slot="column"]');
    expect(columns).toHaveLength(2);
    expect((columns[1] as HTMLElement).getAttribute("style")).toContain("--share: 2");
    expect(columns[1]?.textContent).toBe("third");
    await user.click(screen.getByRole("button", { name: "Block actions" }));
    await settle();
    await user.click(screen.getByRole("menuitemradio", { name: "1 : 1 : 1 : 1" }));
    await settle();
    expect(content().querySelectorAll('[data-slot="column"]')).toHaveLength(4);
  });

  test("Backspace at the start of an empty set takes it away; markdown writes each column in turn", async () => {
    const editor = await mount();
    await slash(editor, "2 columns");
    editor.update(() => {
      const columns = $getRoot().getFirstChild();
      if ($isColumnsNode(columns)) columns.getFirstDescendant()?.selectStart();
    });
    editor.dispatchCommand(DELETE_CHARACTER_COMMAND, true);
    await settle();
    expect(kinds(editor)).toEqual(["paragraph", "paragraph"]);

    await slash(editor, "2 columns");
    editor.update(() => {
      const columns = $getRoot().getChildren().find($isColumnsNode);
      columns?.getChildAtIndex(0)?.selectEnd();
    });
    await typeText(editor, "left");
    editor.update(() => {
      const columns = $getRoot().getChildren().find($isColumnsNode);
      columns?.getChildAtIndex(1)?.selectEnd();
    });
    await typeText(editor, "right");
    expect(documentToMarkdown(editor.getEditorState().toJSON())).toContain("left\n\nright");
  });

  test("a stray column or a set of one is undone, keeping its words", () => {
    const state = {
      root: {
        type: "root",
        version: 1,
        direction: null,
        format: "",
        indent: 0,
        children: [
          {
            type: "columns",
            version: 1,
            layout: "1:1",
            direction: null,
            format: "",
            indent: 0,
            children: [
              {
                type: "column",
                version: 1,
                direction: null,
                format: "",
                indent: 0,
                children: [
                  {
                    type: "paragraph",
                    version: 1,
                    direction: null,
                    format: "",
                    indent: 0,
                    textFormat: 0,
                    textStyle: "",
                    children: [
                      {
                        type: "text",
                        version: 1,
                        text: "alone",
                        format: 0,
                        style: "",
                        mode: "normal",
                        detail: 0,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    expect(documentToText(JSON.stringify(state))).toBe("alone");
  });
});

describe("toggles", () => {
  test("/toggle on a line of words makes it the title; Enter goes into the content", async () => {
    const editor = await mount("Read more");
    await typeText(editor, " /toggle");
    keydown(content(), "Enter");
    await settle();
    const toggle = content().querySelector('[data-slot="toggle"]');
    expect(toggle?.getAttribute("data-open")).toBe("true");
    expect(toggle?.querySelector('[data-slot="toggle-title"]')?.textContent).toBe("Read more ");
    editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
    await settle();
    await typeText(editor, "hidden words");
    expect(toggle?.querySelector('[data-slot="toggle-content"]')?.textContent).toBe("hidden words");
  });

  test("Mod+Enter in the title closes and opens it, hiding the content and saying so", async () => {
    const editor = await mount("<details open>\n<summary>Title</summary>\n\nBody\n\n</details>");
    editor.update(() => {
      const toggle = $getRoot().getFirstChild();
      if ($isToggleNode(toggle)) toggle.getFirstChild()?.selectEnd();
    });
    await settle();
    keydown(content(), "Enter", { metaKey: true });
    await settle();
    const toggle = content().querySelector<HTMLElement>('[data-slot="toggle"]')!;
    expect(toggle.dataset.open).toBe("false");
    expect(toggle.querySelector<HTMLElement>('[data-slot="toggle-content"]')?.hidden).toBe(true);
    await settle();
    expect(document.body.textContent).toContain("Collapsed");
    expect(documentToMarkdown(editor.getEditorState().toJSON())).toBe(
      "<details>\n<summary>Title</summary>\n\nBody\n\n</details>",
    );
    keydown(content(), "Enter", { ctrlKey: true });
    await settle();
    expect(toggle.dataset.open).toBe("true");
  });

  test("Backspace at the start of the title unwraps it: title a line, content kept", async () => {
    const editor = await mount("<details open>\n<summary>Title</summary>\n\nBody\n\n</details>");
    editor.update(() => {
      const toggle = $getRoot().getFirstChild();
      if ($isToggleNode(toggle)) toggle.getFirstChild()?.selectStart();
    });
    editor.dispatchCommand(DELETE_CHARACTER_COMMAND, true);
    await settle();
    expect(kinds(editor).slice(0, 2)).toEqual(["paragraph", "paragraph"]);
    expect(documentToText(editor.getEditorState().toJSON())).toContain("Title\n\nBody");
  });

  test("read as a native details element, open as saved, with no violations", async () => {
    render(() => (
      <RichTextRenderer markdown={"<details>\n<summary>More</summary>\n\nHidden\n\n</details>"} />
    ));
    const details = document.querySelector("details");
    expect(details?.open).toBe(false);
    expect(details?.querySelector("summary")?.textContent).toBe("More");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("HTML's details is read as a toggle", () => {
    expect(
      markdownToDocument("<details open>\n<summary>A</summary>\n\nB\n\n</details>").root
        .children[0],
    ).toMatchObject({
      type: "toggle",
      open: true,
    });
  });
});

describe("page breaks", () => {
  test("/page break shows a named dashed line in the editor and nothing on screen when read", async () => {
    const editor = await mount();
    await slash(editor, "page break");
    expect(kinds(editor)[0]).toBe("pagebreak");
    expect(screen.getByRole("separator", { name: "Page break" })).not.toBeNull();
    cleanup();
    render(() => <RichTextRenderer value={editor.getEditorState().toJSON()} />);
    const read = document.querySelector('[data-slot="page-break"]');
    expect(read?.getAttribute("aria-hidden")).toBe("true");
    expect(read?.textContent).toBe("");
  });

  test("a stored break with no data of its own still reads", () => {
    const state = JSON.stringify({
      root: {
        type: "root",
        version: 1,
        direction: null,
        format: "",
        indent: 0,
        children: [{ type: "pagebreak", version: 1 }],
      },
    });
    render(() => <RichTextRenderer value={state} />);
    expect(document.querySelector('[data-slot="page-break"]')).not.toBeNull();
  });
});

describe("on the server", () => {
  const MARKDOWN = [
    "<details open>",
    "<summary>Title</summary>",
    "",
    "Body",
    "",
    "</details>",
    "",
    "> [!tip]",
    "> Inside",
  ].join("\n");

  test("the renderer hydrates toggles and callouts", async () => {
    const result = await hydrates(`
      import { RichTextRenderer } from ${entry};
      export function Page() {
        return <RichTextRenderer markdown={${JSON.stringify(MARKDOWN)}} />;
      }
    `);
    expect(result.container.querySelector("details")?.open).toBe(true);
    result.unmount();
  });

  test("the editor takes over the toggles the server drew", async () => {
    const page = await hydratesFromServer(
      "BlockEditor",
      `<BlockEditor label="Page" defaultMarkdown={${JSON.stringify(MARKDOWN)}} />`,
    );
    expect(content().querySelector('[data-slot="toggle-title"]')?.textContent).toBe("Title");
    expect(content().hasAttribute("data-lexical-editor")).toBe(true);
    page.dispose();
  });
});
