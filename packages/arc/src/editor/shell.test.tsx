import { afterEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { type Child } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, cleanup, render, screen, waitFor } from "@barqjs/testing";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  type SerializedEditorState,
  UNDO_COMMAND,
} from "lexical";

import { serverProcess } from "../ssr-harness.ts";
import { hydrates } from "../test-arc.ts";
import { documentToMarkdown, markdownToDocument, replaceDocument } from "./document.ts";
import { textDirection } from "./direction.tsx";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { capture, hydratesFromServer, settle, textOf, typeText } from "./test-editor.ts";

const entry = JSON.stringify(fileURLToPath(new URL("./index.ts", import.meta.url)));

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function content(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="rich-text-editor-content"]')!;
}

function body(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="rich-text-editor-body"]')!;
}

interface ArabicProps {
  children: Child;
}

function Arabic(props: ArabicProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("handing the document over", () => {
  test("autosave saves at once when the editor loses focus, and when it goes", async () => {
    const editor = capture();
    const saved: string[] = [];
    const { unmount } = render(() => (
      <RichTextEditor
        label="Notes"
        onEditor={editor.set}
        autosave={{ delay: 60_000, save: (value) => void saved.push(documentToMarkdown(value)) }}
      />
    ));
    await settle();
    await typeText(editor.get(), "first");
    content().dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(saved).toEqual(["first"]);
    await typeText(editor.get(), " more");
    unmount();
    expect(saved).toEqual(["first", "first more"]);
  });

  test("validate refuses a change: it is not handed over, the box is invalid and says why", async () => {
    const editor = capture();
    const changes: SerializedEditorState[] = [];
    const validity: boolean[] = [];
    render(() => (
      <RichTextEditor
        label="Notes"
        onEditor={editor.set}
        onChange={(value) => changes.push(value)}
        validate={(value) =>
          JSON.stringify(value).includes("forbidden") ? "That word cannot be saved" : true
        }
        onValidityChange={(valid) => validity.push(valid)}
      />
    ));
    await settle();
    await typeText(editor.get(), "ok");
    const handed = changes.length;
    expect(handed).toBeGreaterThan(0);
    await typeText(editor.get(), " forbidden");
    expect(changes.length).toBeLessThan(handed + " forbidden".length);
    expect(validity).toEqual([false]);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("That word cannot be saved");
    expect(content().getAttribute("aria-invalid")).toBe("true");
    expect(content().getAttribute("aria-describedby")).toBe(alert.id);
    expect(await ariaViolations(document.body)).toEqual([]);
    editor.get().update(() => {
      $getRoot().clear().append($createParagraphNode().append($createTextNode("fine")));
    });
    await settle();
    expect(validity).toEqual([false, true]);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(documentToMarkdown(changes.at(-1)!)).toBe("fine");
  });

  test("replaceDocument puts a document in as one edit to undo, a quiet one not handed over", async () => {
    const editor = capture();
    const changes: string[] = [];
    render(() => (
      <RichTextEditor
        label="Notes"
        defaultMarkdown="Old"
        onEditor={editor.set}
        onChange={(value) => changes.push(documentToMarkdown(value))}
      />
    ));
    await settle();
    replaceDocument(editor.get(), markdownToDocument("# New\n\nBody"));
    await settle();
    expect(textOf(editor.get())).toBe("New\n\nBody");
    expect(changes.at(-1)).toBe("# New\n\nBody");
    replaceDocument(editor.get(), markdownToDocument("Quiet"), { quiet: true });
    await settle();
    expect(textOf(editor.get())).toBe("Quiet");
    expect(changes.at(-1)).toBe("# New\n\nBody");
    editor.get().dispatchCommand(UNDO_COMMAND, undefined);
    await settle();
    expect(textOf(editor.get())).toBe("New\n\nBody");
  });

  test("undo goes back no further than the history limit", async () => {
    const editor = capture();
    let canUndo = false;
    render(() => <RichTextEditor label="Notes" historyLimit={3} onEditor={editor.set} />);
    await settle();
    editor.get().registerCommand(
      CAN_UNDO_COMMAND,
      (value) => {
        canUndo = value;
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    for (const word of ["a", "b", "c", "d", "e"]) {
      replaceDocument(editor.get(), markdownToDocument(word));
      await settle();
    }
    let steps = 0;
    for (; steps < 10; steps++) {
      if (!canUndo) break;
      editor.get().dispatchCommand(UNDO_COMMAND, undefined);
      await settle();
    }
    expect(steps).toBe(3);
    expect(textOf(editor.get())).toBe("b");
  });

  test("autoFocus puts the caret in the editor once it is built", async () => {
    render(() => <RichTextEditor label="Notes" autoFocus defaultMarkdown="Text" />);
    await settle();
    await waitFor(() => expect(document.activeElement).toBe(content()));
  });
});

describe("the document's direction", () => {
  test("reads its first letter: an English note in an Arabic interface is left to right", async () => {
    expect(textDirection("12 - مرحبا")).toBe("rtl");
    expect(textDirection("2024")).toBeNull();
    render(() => (
      <Arabic>
        <RichTextEditor label="ملاحظات" defaultMarkdown={"Hello\n\n123"} />
      </Arabic>
    ));
    await settle();
    expect(body().getAttribute("dir")).toBe("ltr");
    const [, number] = [...content().querySelectorAll("p")];
    expect(number?.getAttribute("dir")).toBe("ltr");
  });

  test("a line without letters follows an Arabic document, and its language is set when given", async () => {
    const editor = capture();
    render(() => (
      <RichTextEditor
        label="ملاحظات"
        language="ar"
        defaultMarkdown={"2024\n\nمرحبا"}
        onEditor={editor.set}
      />
    ));
    await settle();
    expect(body().getAttribute("dir")).toBe("rtl");
    expect(content().getAttribute("lang")).toBe("ar");
    const [number, word] = [...content().querySelectorAll("p")];
    expect(number?.getAttribute("dir")).toBe("rtl");
    expect(number?.hasAttribute("data-neutral-dir")).toBe(true);
    expect(word?.getAttribute("dir")).toBe("auto");
    editor.get().update(() => {
      $getRoot().getFirstChildOrThrow().selectEnd();
    });
    await typeText(editor.get(), " abc");
    expect(content().querySelector("p")?.getAttribute("dir")).toBe("auto");
  });

  test("a server writes the direction from the words, and the page hydrates with every node kept", async () => {
    const { code, html } = await serverProcess(`
      import { renderToStringAsync } from "@barqjs/server";
      import { RichTextEditor } from ${entry};
      export async function page() {
        return await renderToStringAsync(() => <RichTextEditor label="Notes" defaultMarkdown="مرحبا بالعالم" />);
      }
    `);
    expect(code).toBe(0);
    expect(html).toMatch(/data-slot="rich-text-editor-body"[^>]*dir="rtl"/u);
    const result = await hydrates(`
      import { RichTextEditor } from ${entry};
      export function Page() {
        return <RichTextEditor label="Notes" language="ar" placeholder="اكتب" />;
      }
    `);
    result.unmount();
    const page = await hydratesFromServer(
      "RichTextEditor",
      `<RichTextEditor label="Notes" defaultMarkdown="مرحبا بالعالم" validate={() => true} />`,
    );
    expect(body().getAttribute("dir")).toBe("rtl");
    expect(content().hasAttribute("data-lexical-editor")).toBe(true);
    page.dispose();
  });
});
