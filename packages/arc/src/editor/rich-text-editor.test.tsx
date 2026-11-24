import { afterEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { type Child, DEV, createSignal, resetChildIds } from "@barqjs/core";
import { hydrate } from "@barqjs/web";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, cleanup, render, screen, user, waitFor, within } from "@barqjs/testing";
import { $getRoot, type SerializedEditorState } from "lexical";

import { halves, serverProcess } from "../ssr-harness.ts";
import { hydrates } from "../test-arc.ts";
import { documentToMarkdown } from "./document.ts";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { capture, keydown, selectAll, settle, textOf, typeText } from "./test-editor.ts";

const entry = JSON.stringify(fileURLToPath(new URL("./index.ts", import.meta.url)));

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function toolbar() {
  const element = document.querySelector<HTMLElement>('[data-slot="editor-toolbar"]');
  if (element === null) throw new Error("no toolbar");
  return within(element);
}

function content(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[data-slot="rich-text-editor-content"]');
  if (element === null) throw new Error("no editable content");
  return element;
}

const DOCUMENT = "## Plan\n\nFirst **bold** line\n\n- one\n- two\n\n```js\nlet a = 1;\n```\n\n";

interface ArabicProps {
  children: Child;
}

describe("RichTextEditor", () => {
  test("is a named, multi-line text box with a placeholder while empty", async () => {
    render(() => <RichTextEditor label="Description" placeholder="Write something" />);
    await settle();
    const box = screen.getByRole("textbox", { name: "Description" });
    expect(box.getAttribute("contenteditable")).toBe("true");
    expect(box.getAttribute("aria-multiline")).toBe("true");
    expect(screen.getByText("Write something")).toBeDefined();
    expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("opens on markdown, and reports each change as JSON", async () => {
    const editor = capture();
    const changes: SerializedEditorState[] = [];
    render(() => (
      <RichTextEditor
        label="Notes"
        defaultMarkdown={"# Plan\n\n- **one**\n- two"}
        onEditor={editor.set}
        onChange={(value) => changes.push(value)}
      />
    ));
    await settle();
    expect(content().querySelector("h1")?.textContent).toBe("Plan");
    expect(content().querySelector("ul > li strong")?.textContent).toBe("one");
    await typeText(editor.get(), "!");
    expect(changes.length).toBeGreaterThan(0);
    expect(documentToMarkdown(changes.at(-1)!)).toContain("- two!");
  });

  test("the toolbar follows the selection and its marks apply to it", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" onEditor={editor.set} />);
    await settle();
    await typeText(editor.get(), "word");
    await selectAll(editor.get());
    const bold = toolbar().getByRole("button", { name: "Bold" });
    expect(bold.getAttribute("aria-pressed")).toBe("false");
    await user.click(bold);
    await settle();
    expect(content().querySelector("strong")?.textContent).toBe("word");
    expect(bold.getAttribute("aria-pressed")).toBe("true");
    await user.click(toolbar().getByRole("button", { name: "Bulleted list" }));
    await settle();
    expect(content().querySelector("ul li")?.textContent).toBe("word");
    expect(
      toolbar().getByRole("button", { name: "Bulleted list" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  test("the text style menu turns a paragraph into a heading", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" onEditor={editor.set} />);
    await settle();
    await typeText(editor.get(), "Title");
    await user.click(screen.getByRole("button", { name: "Text style: Text" }));
    await settle();
    await user.click(screen.getByRole("menuitemradio", { name: "Heading 2" }));
    await settle();
    expect(content().querySelector("h2")?.textContent).toBe("Title");
    expect(screen.getByRole("button", { name: "Text style: Heading 2" })).toBeDefined();
  });

  test("undo and redo are enabled once there is history", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" onEditor={editor.set} />);
    await settle();
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo.hasAttribute("disabled") || undo.getAttribute("aria-disabled") === "true").toBe(
      true,
    );
    await typeText(editor.get(), "abc");
    await settle(5);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    expect(textOf(editor.get())).not.toBe("abc");
    await user.click(screen.getByRole("button", { name: "Redo" }));
    await settle();
    expect(textOf(editor.get())).toBe("abc");
  });

  test("Mod+E codes the selection and Mod+Shift+8 makes a list, by keyboard", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" onEditor={editor.set} />);
    await settle();
    await typeText(editor.get(), "x");
    await selectAll(editor.get());
    keydown(content(), "e", { ctrlKey: true });
    await settle();
    expect(content().querySelector("code")?.textContent).toBe("x");
    keydown(content(), "*", { ctrlKey: true, shiftKey: true, code: "Digit8" });
    await settle();
    expect(content().querySelector("ul")).not.toBeNull();
  });

  test("markdown typed becomes formatting", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" onEditor={editor.set} />);
    await settle();
    await typeText(editor.get(), "## ");
    await typeText(editor.get(), "Section");
    expect(content().querySelector("h2")?.textContent).toBe("Section");
  });

  test("read-only follows its prop", async () => {
    const [readOnly, setReadOnly] = createSignal(false);
    render(() => <RichTextEditor label="Notes" readOnly={readOnly()} defaultMarkdown="Fixed" />);
    await settle();
    expect(content().getAttribute("contenteditable")).toBe("true");
    setReadOnly(true);
    await settle();
    expect(content().getAttribute("contenteditable")).toBe("false");
    expect(content().getAttribute("aria-readonly")).toBe("true");
    expect(toolbar().getByRole("button", { name: "Bold" }).hasAttribute("disabled")).toBe(true);
  });

  test("counts characters against its limit, and says when it is past it", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Bio" maxLength={5} onEditor={editor.set} />);
    await settle();
    await typeText(editor.get(), "héllo");
    const counter = document.querySelector('[data-slot="rich-text-editor-counter"]');
    expect(counter?.textContent).toBe("5/5");
    expect(counter?.getAttribute("aria-label")).toBe("0 characters left");
    await typeText(editor.get(), "👍🏽");
    expect(counter?.textContent).toBe("6/5");
    expect(counter?.hasAttribute("data-over")).toBe(true);
    expect(counter?.getAttribute("aria-label")).toBe("1 character too many");
  });

  test("going past the limit is announced from what the effect tracked", async () => {
    const codes: string[] = [];
    const unsubscribe = DEV.diagnostics.subscribe((event) => {
      codes.push(event.code);
    });
    const editor = capture();
    render(() => <RichTextEditor label="Bio" maxLength={2} onEditor={editor.set} />);
    await settle();
    await typeText(editor.get(), "abc");
    unsubscribe();
    expect(document.querySelector('[data-slot="rich-text-editor-counter"]')?.textContent).toBe(
      "3/2",
    );
    expect(codes).not.toContain("STRICT_READ_UNTRACKED");
  });

  test("saves once typing pauses, and says so", async () => {
    const editor = capture();
    const saved: string[] = [];
    render(() => (
      <RichTextEditor
        label="Notes"
        onEditor={editor.set}
        autosave={{
          delay: 20,
          save: (value) => {
            saved.push(documentToMarkdown(value));
          },
        }}
      />
    ));
    await settle();
    await typeText(editor.get(), "draft");
    const status = document.querySelector('[data-slot="rich-text-editor-status"]');
    expect(status?.textContent).toBe("Saving…");
    await waitFor(() => expect(saved).toEqual(["draft"]));
    await settle();
    expect(status?.textContent).toBe("Saved");
  });

  test("leaves each block to take the direction of its own text", async () => {
    const editor = capture();
    function Arabic(props: ArabicProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <RichTextEditor
          label="ملاحظات"
          defaultMarkdown={"مرحبا بالعالم\n\nHello world"}
          onEditor={editor.set}
        />
      </Arabic>
    ));
    await settle();
    const [first, second] = [...content().querySelectorAll("p")];
    expect(first?.getAttribute("dir")).toBe("auto");
    expect(second?.getAttribute("dir")).toBe("auto");
    expect(first?.textContent).toBe("مرحبا بالعالم");
    expect(editor.get().read(() => $getRoot().getChildrenSize())).toBe(2);
  });

  test("Mod+K opens the link popover, which refuses an unsafe address and links a good one", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" onEditor={editor.set} />);
    await settle();
    await typeText(editor.get(), "docs");
    await selectAll(editor.get());
    keydown(content(), "k", { ctrlKey: true });
    await settle();
    const field = screen.getByRole("textbox", { name: "Link address" });
    await user.type(field, "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await settle();
    expect(screen.getByText("Enter a web address, an email address or a path")).toBeDefined();
    await user.clear(field);
    await user.type(field, "https://example.com/docs");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await settle();
    expect(content().querySelector("a")?.getAttribute("href")).toBe("https://example.com/docs");
  });

  test("takes a class per part", async () => {
    render(() => (
      <RichTextEditor
        label="Notes"
        maxLength={10}
        class="mine"
        classes={{ body: "b", content: "c", footer: "f", counter: "n" }}
      />
    ));
    await settle();
    const root = document.querySelector('[data-slot="rich-text-editor"]');
    expect(root?.classList.contains("mine")).toBe(true);
    expect(
      document.querySelector('[data-slot="rich-text-editor-body"]')?.classList.contains("b"),
    ).toBe(true);
    expect(content().classList.contains("c")).toBe(true);
    expect(
      document.querySelector('[data-slot="rich-text-editor-footer"]')?.classList.contains("f"),
    ).toBe(true);
    expect(
      document.querySelector('[data-slot="rich-text-editor-counter"]')?.classList.contains("n"),
    ).toBe(true);
  });

  test("a server writes the document in the editable box, as the editor will draw it", async () => {
    const { code, html, errors } = await serverProcess(`
      import { renderToStringAsync } from "@barqjs/server";
      import { RichTextEditor } from ${entry};
      export async function page() {
        return await renderToStringAsync(() => (
          <RichTextEditor label="Notes" defaultMarkdown={${JSON.stringify(DOCUMENT)}} />
        ));
      }
    `);
    expect(errors).toBe("");
    expect(code).toBe(0);
    const box = html.slice(html.indexOf('data-slot="rich-text-editor-content"'));
    expect(box).toMatch(/^[^>]*white-space: pre-wrap/u);
    const text = box.replaceAll(/<!--[^>]*-->/gu, "");
    expect(text).toContain(">Plan</h2>");
    expect(text).toContain("<strong>bold</strong>");
    expect(text).toContain("<li");
    expect(box).toContain('data-language="js"');
    expect(box).toContain("let a = 1;");
  });

  test("hydrated, Lexical takes the box over with the blocks the server drew", async () => {
    const { code, html } = await serverProcess(`
      import { renderToStringAsync } from "@barqjs/server";
      import { RichTextEditor } from ${entry};
      export async function page() {
        return await renderToStringAsync(() => (
          <RichTextEditor label="Notes" defaultMarkdown={${JSON.stringify(DOCUMENT)}} />
        ));
      }
    `);
    expect(code).toBe(0);
    const { client } = await halves(`
      import { RichTextEditor } from ${entry};
      export function Page() {
        return <RichTextEditor label="Notes" defaultMarkdown={${JSON.stringify(DOCUMENT)}} />;
      }
    `);
    const container = document.body.appendChild(document.createElement("div"));
    container.innerHTML = html;
    const written = [...container.querySelectorAll("*")];
    const served = content();
    const staticNodes = [...served.querySelectorAll("*")];
    function blocks(root: Element) {
      return [...root.children].map((one) => [one.localName, one.getAttribute("class") ?? ""]);
    }
    const before = blocks(served);
    resetChildIds();
    const dispose = hydrate(client, container);
    expect(hydrate.report.mismatches).toEqual([]);
    expect(hydrate.report.recovered).toBe(false);
    await settle();
    const box = content();
    expect(box).toBe(served);
    expect(box.hasAttribute("data-lexical-editor")).toBe(true);
    // Only what the server drew inside the box was replaced; the rest was kept.
    const lost = written.filter((node) => !container.contains(node));
    expect(lost.length).toBe(staticNodes.length);
    expect(lost.every((node) => staticNodes.includes(node))).toBe(true);
    // The editor's blocks are the server's, element for element and class for class.
    expect(JSON.stringify(blocks(box))).toBe(JSON.stringify(before));
    expect(box.textContent).toContain("let a = 1;");
    dispose();
    container.remove();
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { RichTextEditor } from ${entry};
      export function Page() {
        return <RichTextEditor label="Notes" placeholder="Write" maxLength={100} />;
      }
    `);
    expect(result.container.querySelector('[data-slot="rich-text-editor-content"]')).not.toBeNull();
    result.unmount();
  });
});
