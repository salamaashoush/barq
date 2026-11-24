import { afterEach, describe, expect, test } from "bun:test";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, cleanup, render, screen, user } from "@barqjs/testing";
import { $createHeadingNode } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  type LexicalEditor,
} from "lexical";

import { $createCalloutNode } from "./callout.tsx";
import { $outline, readingStats } from "./document-status.tsx";
import { type FindOptions, $findInDocument, $replaceFound, findIn } from "./find.ts";
import { createDocumentEditor } from "./document.ts";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { capture, keydown, settle, textOf } from "./test-editor.ts";

afterEach(() => {
  cleanup();
  destroyAnnouncer();
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

function words(text: string, query: string, options?: FindOptions) {
  return findIn(text, query, options).map(({ start, end }) => text.slice(start, end));
}

describe("finding in a text", () => {
  test("finds every match, whatever its case unless asked", () => {
    expect(words("The Nile and the nile", "nile")).toEqual(["Nile", "nile"]);
    expect(words("The Nile and the nile", "nile", { matchCase: true })).toEqual(["nile"]);
    expect(findIn("aaaa", "aa")).toHaveLength(2);
    expect(findIn("text", "")).toEqual([]);
  });

  test("finds Arabic with or without its vowel marks and forms of alef", () => {
    expect(words("قال مُحَمَّد: أحمد هنا", "محمد")).toEqual(["مُحَمَّد"]);
    expect(words("قال احمد", "أحمد")).toEqual(["احمد"]);
    expect(words("على الطاولة", "علي")).toEqual(["على"]);
  });

  test("keeps the text's own offsets past letters outside the basic plane", () => {
    const text = "𝑥 equals x";
    expect(words(text, "x")).toEqual(["x"]);
    expect(findIn(text, "equals")[0]?.start).toBe(3);
  });

  test("finds whole words only when asked, in any script", () => {
    const whole = { wholeWords: true };
    expect(words("cat, catalogue and bobcat", "cat", whole)).toEqual(["cat"]);
    expect(words("cat_food and cat", "cat", whole)).toEqual(["cat"]);
    expect(words("كتاب والكتاب كتابي كِتَاب", "كتاب", whole)).toEqual(["كتاب", "كِتَاب"]);
    expect(words("the cat sat", "the ", whole)).toEqual(["the "]);
    expect(words("x2 and 2", "2", whole)).toEqual(["2"]);
    expect(words("aa a", "a", whole)).toEqual(["a"]);
  });
});

interface Disposable {
  dispose: () => void;
}

function headless(build: () => void): LexicalEditor & Disposable {
  const editor = createDocumentEditor();
  editor.update(build, { discrete: true });
  return editor;
}

describe("finding in a document", () => {
  test("a word half in bold is found across its pieces and replaced in place", () => {
    const editor = headless(() => {
      $getRoot()
        .clear()
        .append(
          $createParagraphNode().append(
            $createTextNode("Rivers "),
            $createTextNode("flo").toggleFormat("bold"),
            $createTextNode("od in spring; rivers flood."),
          ),
        );
    });
    const found = editor.read(() => $findInDocument("flood"));
    expect(found).toHaveLength(2);
    editor.update(() => $replaceFound(found, "rise"), { discrete: true });
    expect(textOf(editor)).toBe("Rivers rise in spring; rivers rise.");
    editor.dispose();
  });

  test("a match never runs across two blocks", () => {
    const editor = headless(() => {
      $getRoot()
        .clear()
        .append(
          $createParagraphNode().append($createTextNode("ab")),
          $createParagraphNode().append($createTextNode("cd")),
        );
    });
    expect(editor.read(() => $findInDocument("bc"))).toEqual([]);
    editor.dispose();
  });
});

function content(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="rich-text-editor-content"]')!;
}

describe("the find panel", () => {
  test("Mod+F opens it on the text: matches counted and stepped through, then replaced", async () => {
    const editor = capture();
    render(() => (
      <RichTextEditor
        label="Notes"
        defaultMarkdown="A cat, a CAT and a dog."
        onEditor={editor.set}
      />
    ));
    await settle();
    editor.get().update(() => $getRoot().selectStart());
    keydown(content(), "f", { metaKey: true, code: "KeyF" });
    await settle();
    const panel = screen.getByRole("search", { name: "Find and replace" });
    const find = screen.getByRole("searchbox", { name: "Find" });
    await user.type(find, "cat");
    await settle();
    const count = panel.querySelector('[data-slot="find-count"]');
    expect(count?.textContent).toBe("1 of 2");
    user.keyboard("{Enter}");
    await settle();
    expect(count?.textContent).toBe("2 of 2");
    await user.click(screen.getByRole("checkbox", { name: "Match case" }));
    await settle();
    expect(count?.textContent).toBe("1 of 1");
    await user.click(screen.getByRole("checkbox", { name: "Match case" }));
    await user.type(screen.getByRole("textbox", { name: "Replace with" }), "bird");
    await user.click(screen.getByRole("button", { name: "Replace all" }));
    await settle();
    expect(textOf(editor.get())).toBe("A bird, a bird and a dog.");
    expect(count?.textContent).toBe("No matches");
    expect(await ariaViolations(panel)).toEqual([]);
  });

  test("Escape closes it and selects the match in hand; a read-only document only finds", async () => {
    const editor = capture();
    render(() => (
      <RichTextEditor label="Notes" readOnly defaultMarkdown="one two one" onEditor={editor.set} />
    ));
    await settle();
    editor.get().dispatchCommand((await import("./find-panel.tsx")).OPEN_FIND_COMMAND, undefined);
    await settle();
    expect(screen.queryByRole("textbox", { name: "Replace with" })).toBeNull();
    await user.type(screen.getByRole("searchbox", { name: "Find" }), "two");
    await settle();
    keydown(screen.getByRole("searchbox", { name: "Find" }), "Escape");
    await settle();
    expect(screen.queryByRole("search")).toBeNull();
    expect(editor.get().read(() => $getSelection()?.getTextContent())).toBe("two");
  });

  test("the toolbar offers it", async () => {
    render(() => <RichTextEditor label="Notes" />);
    await settle();
    await user.click(screen.getByRole("button", { name: /Find and replace/ }));
    await settle();
    expect(screen.getByRole("search")).not.toBeNull();
  });
});

describe("the document status", () => {
  test("lists every heading in order, those inside blocks too, and skips empty ones", () => {
    const editor = headless(() => {
      $getRoot()
        .clear()
        .append(
          $createHeadingNode("h1").append($createTextNode("Rivers")),
          $createParagraphNode().append($createTextNode("Water moves.")),
          $createCalloutNode("info").append(
            $createHeadingNode("h2").append($createTextNode("Remember")),
          ),
          $createHeadingNode("h3"),
          $createHeadingNode("h3").append($createTextNode("الأسئلة")),
        );
    });
    expect(editor.read($outline).map(({ level, text }) => [level, text])).toEqual([
      [1, "Rivers"],
      [2, "Remember"],
      [3, "الأسئلة"],
    ]);
    editor.dispose();
  });

  test("counts words and the minutes they take to read", () => {
    expect(readingStats("")).toEqual({ words: 0, minutes: 0 });
    expect(readingStats("one two\nthree")).toEqual({ words: 3, minutes: 1 });
    expect(readingStats(Array.from({ length: 401 }, () => "w").join(" ")).minutes).toBe(3);
  });

  test("shows the counts under the editor, jumps by the outline, and focus mode comes and goes", async () => {
    const editor = capture();
    render(() => (
      <RichTextEditor
        label="Notes"
        defaultMarkdown={"# Rivers\n\nWater moves fast.\n\n## Floods"}
        onEditor={editor.set}
      />
    ));
    await settle();
    const status = document.querySelector('[data-slot="document-status"]');
    expect(status?.querySelector('[data-slot="document-status-words"]')?.textContent).toBe(
      "5 words",
    );
    expect(status?.textContent).toContain("1 min read");
    await user.click(screen.getByRole("button", { name: "Outline" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Floods" }));
    await settle();
    expect(editor.get().read(() => $getSelection()?.getNodes()[0]?.getTextContent())).toBe(
      "Floods",
    );
    const frame = document.querySelector<HTMLElement>('[data-slot="rich-text-editor"]')!;
    keydown(content(), "\\", { metaKey: true, shiftKey: true, code: "Backslash" });
    await settle();
    expect(frame.dataset.focusMode).toBe("");
    expect(document.body.style.overflow).toBe("hidden");
    expect(
      screen.getByRole("button", { name: /Leave focus mode/ }).getAttribute("aria-pressed"),
    ).toBe("true");
    keydown(content(), "Escape");
    await settle();
    expect(frame.dataset.focusMode).toBeUndefined();
    expect(document.body.style.overflow).toBe("");
  });
});
