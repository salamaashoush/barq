import { afterEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { ariaViolations, cleanup, render, screen, user } from "@barqjs/testing";
import { UNDO_COMMAND } from "lexical";

import { hydrates } from "../test-arc.ts";
import { documentToMarkdown, markdownToDocument } from "./document.ts";
import { OPEN_MARKDOWN_DIALOG_COMMAND } from "./markdown-dialog.tsx";
import { RichTextRenderer } from "./renderer.tsx";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { capture, hydratesFromServer, settle, textOf } from "./test-editor.ts";

const entry = JSON.stringify(fileURLToPath(new URL("./index.ts", import.meta.url)));

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const DOC = "## Plan\n\n- one\n- **two**\n\n> [!warning]\n> Careful";

function source(): HTMLTextAreaElement {
  return screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Markdown" });
}

describe("the markdown dialog", () => {
  test("shows the document as markdown, every extension's rules included, with no violations", async () => {
    render(() => <RichTextEditor label="Notes" defaultMarkdown={DOC} />);
    await settle();
    await user.click(screen.getByRole("button", { name: "Markdown" }));
    await settle();
    expect(screen.getByRole("dialog", { name: "Markdown" })).toBeDefined();
    expect(source().value).toBe(DOC);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("replaces the document from what was written, as one edit to undo", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" defaultMarkdown={DOC} onEditor={editor.set} />);
    await settle();
    editor.get().dispatchCommand(OPEN_MARKDOWN_DIALOG_COMMAND, undefined);
    await settle();
    await user.clear(source());
    await user.type(source(), "# New title");
    await user.click(screen.getByRole("button", { name: "Replace the document" }));
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(documentToMarkdown(editor.get().getEditorState().toJSON())).toBe("# New title");
    editor.get().dispatchCommand(UNDO_COMMAND, undefined);
    await settle();
    expect(documentToMarkdown(editor.get().getEditorState().toJSON())).toBe(DOC);
  });

  test("an Arabic document's markdown reads right to left in its box", async () => {
    const editor = capture();
    render(() => (
      <RichTextEditor label="ملاحظات" defaultMarkdown={"## خطة\n\nمرحبا"} onEditor={editor.set} />
    ));
    await settle();
    editor.get().dispatchCommand(OPEN_MARKDOWN_DIALOG_COMMAND, undefined);
    await settle();
    expect(source().getAttribute("dir")).toBe("auto");
    expect(source().value).toBe("## خطة\n\nمرحبا");
    await user.click(screen.getByRole("button", { name: "Replace the document" }));
    await settle();
    expect(textOf(editor.get())).toBe("خطة\n\nمرحبا");
  });

  test("what it writes reads back the same, and the renderer and a server draw it", async () => {
    expect(documentToMarkdown(markdownToDocument(DOC))).toBe(DOC);
    render(() => <RichTextRenderer markdown={DOC} />);
    expect(document.querySelector("h2")?.textContent).toBe("Plan");
    cleanup();
    const result = await hydrates(`
      import { RichTextRenderer } from ${entry};
      export function Page() {
        return <RichTextRenderer markdown={${JSON.stringify(DOC)}} />;
      }
    `);
    result.unmount();
    const page = await hydratesFromServer(
      "RichTextEditor",
      `<RichTextEditor label="Notes" defaultMarkdown={${JSON.stringify(DOC)}} />`,
    );
    expect(page.container.querySelector('[data-tool="extension:markdown"]')).not.toBeNull();
    page.dispose();
  });
});
