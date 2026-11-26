import { describe, expect, test } from "bun:test";
import { $isCodeNode } from "@lexical/code-core";
import { $getRoot, $isElementNode } from "lexical";

import { loadLanguage } from "../code/languages.ts";
import { defineBlock } from "./blocks.tsx";
import {
  createDocumentEditor,
  documentToMarkdown,
  documentToText,
  isSafeUrl,
  markdownToDocument,
} from "./document.ts";

interface NoteData {
  text: string;
}

const NOTE = defineBlock<NoteData>({
  type: "acme-note",
  label: "Note",
  defaultData: () => ({ text: "" }),
  component: () => null,
  toMarkdown: (data) => `> [!note] ${data.text}`,
  fromMarkdown: { regExp: /^> \[!note\] (.+)$/, data: (match) => ({ text: match[1] ?? "" }) },
});

const MARKDOWN = [
  "# Release notes",
  "",
  "Some **bold**, *italic*, ~~gone~~ and `code`, with [a link](https://example.com).",
  "",
  "- one",
  "- two",
  "",
  "1. first",
  "2. second",
  "",
  "- [x] done",
  "- [ ] to do",
  "",
  "> quoted",
  "",
  "```ts",
  "const a = 1;",
  "```",
  "",
  "| Name | Role |",
  "| --- | --- |",
  "| Salama | Owner |",
  "",
  "***",
  "",
  "Hi [@Salama](mention:u1), see ![A chart](https://example.com/chart.png)",
].join("\n");

describe("a document without a screen", () => {
  test("reads markdown into every node it knows and writes the same markdown back", () => {
    const state = markdownToDocument(MARKDOWN);
    const types = state.root.children.map((node) => node.type);
    expect(types).toEqual([
      "heading",
      "paragraph",
      "list",
      "list",
      "list",
      "quote",
      "code",
      "table",
      "horizontalrule",
      "paragraph",
    ]);
    const back = documentToMarkdown(state);
    expect(back).toContain("# Release notes");
    expect(back).toContain("**bold**");
    expect(back).toContain("~~gone~~");
    expect(back).toContain("[a link](https://example.com)");
    expect(back).toContain("- [x] done");
    expect(back).toContain("```ts\nconst a = 1;\n```");
    expect(back).toContain("| Name | Role |\n| --- | --- |\n| Salama | Owner |");
    expect(back).toContain("[@Salama](mention:u1)");
  });

  test("an image on a line of its own is an image block, with its words", () => {
    const state = markdownToDocument("![A chart](https://example.com/chart.png)");
    expect(state.root.children[0]).toMatchObject({
      type: "image",
      alt: "A chart",
      src: "https://example.com/chart.png",
    });
    expect(documentToMarkdown(state)).toBe("![A chart](https://example.com/chart.png)");
  });

  test("an app's block is read and written by its own markdown line", () => {
    const options = { extensions: [NOTE] };
    const state = markdownToDocument("> [!note] Bring water", options);
    expect(state.root.children[0]).toMatchObject({
      type: "acme-note",
      text: "Bring water",
    });
    expect(documentToMarkdown(state, options)).toBe("> [!note] Bring water");
  });

  test("the text alone keeps the mention as written", () => {
    const state = markdownToDocument("Ask [@Sam Roe](mention:sam) first");
    expect(documentToText(state)).toBe("Ask @Sam Roe first");
  });

  test("a code block is highlighted with arc's lezer classes once its language is here", async () => {
    await loadLanguage("typescript");
    const editor = createDocumentEditor();
    editor.update(
      () => {
        const state = markdownToDocument("```typescript\nconst a = 1;\n```");
        editor.setEditorState(editor.parseEditorState(state));
      },
      { discrete: true },
    );
    editor.update(() => $getRoot().getFirstChildOrThrow().markDirty(), { discrete: true });
    const highlighted = editor.read(() => {
      const code = $getRoot().getFirstChild();
      if (!$isCodeNode(code) || !$isElementNode(code)) return [];
      return code.getChildren().map((child) => [child.getTextContent(), child.exportJSON()]);
    });
    expect(highlighted.find(([text]) => text === "const")?.[1]).toMatchObject({
      highlightType: "keyword",
    });
    editor.dispose();
  });

  test("a link may go to the web, mail, a phone or a path, and nowhere else", () => {
    expect(isSafeUrl("https://example.com")).toBe(true);
    expect(isSafeUrl("mailto:team@example.com")).toBe(true);
    expect(isSafeUrl("/settings")).toBe(true);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("//evil.example")).toBe(false);
  });
});
