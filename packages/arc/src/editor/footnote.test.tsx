import { afterEach, describe, expect, test } from "bun:test";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, cleanup, render, screen, user } from "@barqjs/testing";
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from "lexical";

import { hydrates } from "../test-arc.ts";
import { documentToMarkdown, markdownToDocument } from "./document.ts";
import { RichTextRenderer } from "./renderer.tsx";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { capture, hydratesFromServer, keydown, settle } from "./test-editor.ts";

const entry = JSON.stringify(new URL("./index.ts", import.meta.url).pathname);

afterEach(() => {
  cleanup();
  destroyAnnouncer();
  document.body.innerHTML = "";
});

function content(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="rich-text-editor-content"]')!;
}

function notes(editor: LexicalEditor): string[] {
  return editor.read(() =>
    $getRoot().getAllTextNodes().length >= 0 ? editorFootnotes(editor) : [],
  );
}

function editorFootnotes(editor: LexicalEditor): string[] {
  const json = JSON.stringify(editor.getEditorState().toJSON());
  return [...json.matchAll(/"type":"footnote","version":1,"note":"([^"]*)"/g)].map(
    (one) => one[1] ?? "",
  );
}

const MARKDOWN = "Rivers flood^[Every spring, see https://example.com/floods] and dry^[In summer].";

describe("footnotes in markdown", () => {
  test("Pandoc's `^[note]` reads into footnotes and writes back the same", () => {
    const state = markdownToDocument(MARKDOWN);
    expect(JSON.stringify(state)).toContain('"note":"In summer"');
    expect(documentToMarkdown(state)).toBe(MARKDOWN);
  });
});

describe("footnotes in the editor", () => {
  test("Mod+Alt+F adds one after the words chosen and opens it to write in; its words are kept", async () => {
    const editor = capture();
    render(() => (
      <RichTextEditor label="Notes" defaultMarkdown="Rivers flood" onEditor={editor.set} />
    ));
    await settle();
    editor.get().update(() => {
      const text = $getRoot().getFirstDescendant();
      if (text !== null && "select" in text)
        (text as unknown as { select: (a: number, b: number) => void }).select(0, 6);
    });
    await settle();
    keydown(content(), "f", { metaKey: true, altKey: true, code: "KeyF" });
    await settle();
    const mark = content().querySelector('[data-slot="footnote-mark"]');
    expect(mark).not.toBeNull();
    const field = await screen.findByLabelText("Footnote", { selector: "textarea" });
    await user.type(field, "Every spring");
    await settle();
    expect(editorFootnotes(editor.get())).toEqual(["Every spring"]);
    expect(editor.get().read(() => $getRoot().getTextContent())).toBe("Rivers flood");
    await user.click(screen.getByRole("button", { name: "Done" }));
    await settle();
    expect(editorFootnotes(editor.get())).toEqual(["Every spring"]);
    expect(
      editor.get().read(() =>
        $getRoot()
          .getAllTextNodes()
          .map((one) => one.getTextContent()),
      ),
    ).toEqual(["Rivers", " flood"]);
  });

  test("a footnote closed with no words is not kept", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" defaultMarkdown="Rivers" onEditor={editor.set} />);
    await settle();
    editor.get().update(() => $getRoot().selectEnd());
    keydown(content(), "f", { ctrlKey: true, altKey: true, code: "KeyF" });
    await settle();
    await screen.findByLabelText("Footnote", { selector: "textarea" });
    await user.click(screen.getByRole("button", { name: "Done" }));
    await settle();
    expect(editorFootnotes(editor.get())).toEqual([]);
    expect(notes(editor.get())).toEqual([]);
  });

  test("the button over selected words adds one", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" onEditor={editor.set} />);
    await settle();
    editor.get().update(() => {
      const text = $createTextNode("Rivers flood");
      $getRoot().clear().append($createParagraphNode().append(text));
      text.select(0, 6);
    });
    await settle();
    expect(screen.getByRole("button", { name: /Add a footnote/ })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: /Add a footnote/ }));
    await settle();
    expect(editor.get().read(() => $getRoot().getAllTextNodes().length)).toBe(2);
    expect(JSON.stringify(editor.get().getEditorState().toJSON())).toContain('"type":"footnote"');
  });
});

describe("footnotes read", () => {
  test("numbered in reading order, listed under the text with links both ways and none broken", async () => {
    render(() => <RichTextRenderer markdown={MARKDOWN} />);
    const refs = [...document.querySelectorAll<HTMLAnchorElement>('[data-slot="footnote"] a')];
    expect(refs.map((one) => one.textContent)).toEqual(["1", "2"]);
    expect(refs[1]?.getAttribute("aria-label")).toBe("Footnote 2");
    const list = screen.getByRole("region", { name: "Footnotes" });
    const items = list.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0]?.querySelector("a[target]")?.getAttribute("href")).toBe(
      "https://example.com/floods",
    );
    const target = refs[0]?.getAttribute("href")?.slice(1) ?? "";
    expect(document.getElementById(target)).toBe(items[0] ?? null);
    const back = items[1]?.querySelector('a[aria-label="Back to footnote 2 in the text"]');
    expect(document.getElementById(back?.getAttribute("href")?.slice(1) ?? "")).toBe(
      refs[1] ?? null,
    );
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("numbers are written in the reader's digits", () => {
    render(() => {
      provideLocale("ar-EG");
      return <RichTextRenderer markdown={MARKDOWN} />;
    });
    const refs = [...document.querySelectorAll('[data-slot="footnote"] a')];
    expect(refs.map((one) => one.textContent)).toEqual(["١", "٢"]);
  });

  test("hydrates what the server wrote, read and in the editor", async () => {
    const result = await hydrates(`
      import { RichTextRenderer } from ${entry};
      export function Page() {
        return <RichTextRenderer markdown={${JSON.stringify(MARKDOWN)}} />;
      }
    `);
    expect(result.container.querySelectorAll("li")).toHaveLength(2);
    result.unmount();
    const page = await hydratesFromServer(
      "RichTextEditor",
      `<RichTextEditor label="Notes" defaultMarkdown={${JSON.stringify(MARKDOWN)}} />`,
    );
    await settle();
    expect(content().querySelectorAll('[data-slot="footnote-mark"]')).toHaveLength(2);
    page.dispose();
  });
});
