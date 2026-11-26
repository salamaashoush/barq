import { afterEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { ariaViolations, cleanup, render } from "@barqjs/testing";
import { $getRoot } from "lexical";

import { hydrates } from "../test-arc.ts";
import { createDocumentEditor, documentToMarkdown, markdownToDocument } from "./document.ts";
import { everyBlock, largeDocument } from "./fixtures.ts";
import { RichTextRenderer } from "./renderer.tsx";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { capture, hydratesFromServer, settle, typeText } from "./test-editor.ts";

const entry = JSON.stringify(fileURLToPath(new URL("./index.ts", import.meta.url)));

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

/** Node types that are pieces of others, never a document's own choice. */
const PIECES = new Set([
  "root",
  "text",
  "linebreak",
  "tab",
  "artificial",
  "code-highlight",
  "autolink",
  "arc-markdown-holder",
]);

interface Walked {
  type: string;
  children?: Walked[];
}

function typesIn(node: Walked, into = new Set<string>()): Set<string> {
  into.add(node.type);
  for (const child of node.children ?? []) typesIn(child, into);
  return into;
}

describe("the every-block document", () => {
  test("holds every kind of node the document preset knows", () => {
    const editor = createDocumentEditor();
    const known = [...editor._nodes.keys()].filter((type) => !PIECES.has(type));
    editor.dispose();
    const held = typesIn(everyBlock().root);
    expect(known.filter((type) => !held.has(type))).toEqual([]);
  });

  test("reads back as it was stored, and its markdown reads back the same", () => {
    const stored = everyBlock();
    const editor = createDocumentEditor();
    editor.setEditorState(editor.parseEditorState(stored));
    expect(editor.getEditorState().toJSON()).toEqual(stored);
    editor.dispose();
    const markdown = documentToMarkdown(stored);
    expect(documentToMarkdown(markdownToDocument(markdown))).toBe(markdown);
  });

  test("the renderer draws every block with no violations", async () => {
    render(() => <RichTextRenderer value={everyBlock()} />);
    const page = document.querySelector('[data-slot="rich-text"]')!;
    for (const part of ["callout", "toggle", "columns", "page-break", "footnotes"]) {
      expect(page.querySelector(`[data-slot="${part}"]`)).not.toBeNull();
    }
    expect(page.querySelector("table")).not.toBeNull();
    expect(page.querySelector("sub")?.textContent).toBe("2");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a server draws it, read and under the editor, and the page hydrates with every node kept", async () => {
    const stored = JSON.stringify(everyBlock());
    const result = await hydrates(`
      import { RichTextRenderer } from ${entry};
      export function Page() {
        return <RichTextRenderer value={${stored}} />;
      }
    `);
    result.unmount();
    const page = await hydratesFromServer(
      "RichTextEditor",
      `<RichTextEditor label="Every block" defaultValue={${stored}} />`,
    );
    expect(
      page.container.querySelector('[data-lexical-editor] [data-slot="callout"]'),
    ).not.toBeNull();
    page.dispose();
  });
});

describe("a long document", () => {
  const markdown = largeDocument();

  test("is read, drawn and written within budget", () => {
    expect(markdown.split(/\s+/).length).toBeGreaterThan(20_000);
    let started = performance.now();
    const stored = markdownToDocument(markdown);
    const read = performance.now() - started;
    started = performance.now();
    render(() => <RichTextRenderer value={stored} />);
    const drawn = performance.now() - started;
    started = performance.now();
    documentToMarkdown(stored);
    const written = performance.now() - started;
    expect(document.querySelectorAll('[data-slot="rich-text"] h2')).toHaveLength(60);
    // Generous ceilings, a regression by an order of magnitude rather than noise.
    expect(read).toBeLessThan(3000);
    expect(drawn).toBeLessThan(5000);
    expect(written).toBeLessThan(3000);
  });

  test("takes keystrokes at its end without redrawing the rest", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Long" defaultMarkdown={markdown} onEditor={editor.set} />);
    await settle();
    const first = document.querySelector('[data-slot="rich-text-editor-content"] h2');
    editor.get().update(() => $getRoot().selectEnd());
    await settle();
    const started = performance.now();
    await typeText(editor.get(), "typed at the end");
    const each = (performance.now() - started) / "typed at the end".length;
    expect(document.querySelector('[data-slot="rich-text-editor-content"] h2')).toBe(first);
    expect(each).toBeLessThan(150);
  });
});
