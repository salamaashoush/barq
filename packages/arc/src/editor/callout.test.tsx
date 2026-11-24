import { afterEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, cleanup, render, screen, user } from "@barqjs/testing";
import { $getRoot, DELETE_CHARACTER_COMMAND, INSERT_PARAGRAPH_COMMAND } from "lexical";

import { hydrates } from "../test-arc.ts";
import { BlockEditor } from "./block-editor.tsx";
import { $isCalloutNode, calloutStyles } from "./callout.tsx";
import { documentToMarkdown, markdownToDocument } from "./document.ts";
import { RichTextRenderer } from "./renderer.tsx";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { capture, hydratesFromServer, keydown, settle, typeText } from "./test-editor.ts";

const entry = JSON.stringify(fileURLToPath(new URL("./index.ts", import.meta.url)));

afterEach(() => {
  cleanup();
  destroyAnnouncer();
  document.body.innerHTML = "";
});

const MARKDOWN = "> [!warning]\n> Bring **water**\n>\n> - a hat\n\nAfter";

function content(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="rich-text-editor-content"]')!;
}

describe("callouts in markdown", () => {
  test("a `> [!tone]` alert reads into a callout of its blocks and writes back the same", () => {
    const state = markdownToDocument(MARKDOWN);
    const [callout, after] = state.root.children as unknown as {
      type: string;
      tone?: string;
      children: { type: string }[];
    }[];
    expect(callout?.type).toBe("callout");
    expect(callout?.tone).toBe("warning");
    expect(callout?.children.map((one) => one.type)).toEqual(["paragraph", "list"]);
    expect(after?.type).toBe("paragraph");
    expect(documentToMarkdown(state)).toBe(MARKDOWN);
  });

  test("GitHub's alert names read as their tones, and a plain quote stays a quote", () => {
    const tip = markdownToDocument("> [!TIP]\n> Use the shortcut").root.children[0];
    expect(tip).toMatchObject({ type: "callout", tone: "success" });
    expect(markdownToDocument("> just a quote").root.children[0]?.type).toBe("quote");
  });
});

describe("callouts in the editor", () => {
  test("/callout on a line of words takes the line in; Backspace at its start lets it go", async () => {
    const editor = capture();
    render(() => <BlockEditor label="Notes" defaultMarkdown="Bring water" onEditor={editor.set} />);
    await settle();
    editor.get().update(() => $getRoot().selectEnd());
    await typeText(editor.get(), " /callout");
    keydown(content(), "Enter");
    await settle();
    const box = content().querySelector('[data-slot="callout"]');
    expect(box?.getAttribute("role")).toBe("note");
    expect(box?.getAttribute("data-tone")).toBe("info");
    expect(box?.textContent).toBe("Bring water ");
    editor.get().update(() => {
      const callout = $getRoot().getFirstChild();
      if ($isCalloutNode(callout)) callout.getFirstDescendant()?.selectStart();
    });
    editor.get().dispatchCommand(DELETE_CHARACTER_COMMAND, true);
    await settle();
    expect(content().querySelector('[data-slot="callout"]')).toBeNull();
    expect(content().textContent).toBe("Bring water ");
  });

  test("Enter on its empty last line steps out after it", async () => {
    const editor = capture();
    render(() => (
      <RichTextEditor label="Notes" defaultMarkdown={"> [!info]\n> Inside"} onEditor={editor.set} />
    ));
    await settle();
    editor.get().update(() => $getRoot().getFirstChild()?.selectEnd());
    editor.get().dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
    await settle();
    editor.get().dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
    await settle();
    const kinds = editor.get().read(() =>
      $getRoot()
        .getChildren()
        .map((one) => one.getType()),
    );
    expect(kinds).toEqual(["callout", "paragraph"]);
    expect(editor.get().read(() => $getRoot().getFirstChild()?.getTextContent())).toBe("Inside");
  });

  test("the block menu changes its tone, which the editor and the markdown follow", async () => {
    const editor = capture();
    render(() => (
      <BlockEditor label="Page" defaultMarkdown={"> [!info]\n> Inside"} onEditor={editor.set} />
    ));
    await settle();
    editor.get().update(() => $getRoot().getFirstChild()?.selectEnd());
    await settle();
    await user.click(screen.getByRole("button", { name: "Block actions" }));
    await settle();
    expect(screen.getByText("Tone")).not.toBeNull();
    await user.click(screen.getByRole("menuitemradio", { name: "Warning" }));
    await settle();
    const box = content().querySelector('[data-slot="callout"]');
    expect(box?.getAttribute("data-tone")).toBe("warning");
    for (const one of calloutStyles({ tone: "warning" }).root.split(" ")) {
      expect(box?.classList.contains(one)).toBe(true);
    }
    expect(documentToMarkdown(editor.get().getEditorState().toJSON())).toBe(
      "> [!warning]\n> Inside",
    );
  });
});

describe("callouts read", () => {
  test("the renderer draws a note in its tone, with no violations", async () => {
    render(() => <RichTextRenderer markdown={MARKDOWN} />);
    const box = document.querySelector('[data-slot="callout"]');
    expect(box?.getAttribute("role")).toBe("note");
    expect(box?.querySelector("strong")?.textContent).toBe("water");
    expect(box?.querySelector("li")?.textContent).toBe("a hat");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("hydrates what the server wrote, read and in the editor", async () => {
    const result = await hydrates(`
      import { RichTextRenderer } from ${entry};
      export function Page() {
        return <RichTextRenderer markdown={${JSON.stringify(MARKDOWN)}} />;
      }
    `);
    expect(result.container.querySelector('[data-slot="callout"]')?.textContent).toContain("water");
    result.unmount();
    const page = await hydratesFromServer(
      "RichTextEditor",
      `<RichTextEditor label="Notes" defaultMarkdown={${JSON.stringify(MARKDOWN)}} />`,
    );
    const box = page.container.querySelector('[data-slot="callout"]');
    expect(box?.getAttribute("data-tone")).toBe("warning");
    expect(content().hasAttribute("data-lexical-editor")).toBe(true);
    page.dispose();
  });
});
