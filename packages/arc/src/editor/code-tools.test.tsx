import { afterEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, cleanup, render, screen, user, waitFor } from "@barqjs/testing";
import { $isCodeNode } from "@lexical/code-core";
import { $getRoot, type LexicalEditor } from "lexical";

import { serverProcess } from "../ssr-harness.ts";
import { hydrates } from "../test-arc.ts";
import { codeGutter } from "./code-gutter.ts";
import { codeLanguageName } from "./code-tools.tsx";
import { documentToMarkdown, markdownToDocument } from "./document.ts";
import { RichTextRenderer } from "./renderer.tsx";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { capture, hydratesFromServer, settle } from "./test-editor.ts";

const entry = JSON.stringify(fileURLToPath(new URL("./index.ts", import.meta.url)));

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const CODE = "Before\n\n```ts\nconst a = 1;\nconst b = 2;\n```";

function content(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="rich-text-editor-content"]')!;
}

function language(editor: LexicalEditor): string | null | undefined {
  return editor.read(() => {
    const code = $getRoot().getChildren().find($isCodeNode);
    return code?.getLanguage();
  });
}

async function mount(markdown = CODE): Promise<LexicalEditor> {
  const editor = capture();
  render(() => <RichTextEditor label="Notes" defaultMarkdown={markdown} onEditor={editor.set} />);
  await settle();
  editor.get().update(() => $getRoot().getLastChild()?.selectEnd());
  await settle();
  return editor.get();
}

describe("a code block's tools", () => {
  test("numbers its lines, which a copy of the text leaves out", async () => {
    expect(codeGutter("one\ntwo\nthree")).toBe("1\n2\n3");
    await mount();
    const code = content().querySelector("code");
    expect(code?.getAttribute("data-gutter")).toBe("1\n2");
    // Lines are drawn with a break between them; the numbers are no text of the block's.
    expect(code?.textContent).toBe("const a = 1;const b = 2;");
  });

  test("with the caret in it, its language is chosen from a menu and its code copied", async () => {
    const editor = await mount();
    const trigger = screen.getByRole("button", { name: "Language: TypeScript" });
    expect(await ariaViolations(document.body)).toEqual([]);
    await user.click(trigger);
    await settle();
    await user.click(screen.getByRole("menuitemradio", { name: "Python" }));
    await settle();
    expect(language(editor)).toBe("python");
    expect(documentToMarkdown(editor.getEditorState().toJSON())).toContain("```python");
    await user.click(screen.getByRole("button", { name: "Language: Python" }));
    await settle();
    await user.click(screen.getByRole("menuitemradio", { name: "Plain text" }));
    await settle();
    expect(language(editor) ?? null).toBeNull();
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (text: string) => Promise.resolve(void written.push(text)) },
    });
    await user.click(screen.getByRole("button", { name: "Copy code" }));
    await waitFor(() => expect(written).toEqual(["const a = 1;\nconst b = 2;"]));
  });

  test("leaves the block when the caret does, and reads left to right in an Arabic document", async () => {
    const editor = capture();
    function Arabic() {
      provideLocale("ar-EG");
      return (
        <div dir="rtl">
          <RichTextEditor
            label="ملاحظات"
            defaultMarkdown={"مرحبا\n\n```js\nlet a;\n```"}
            onEditor={editor.set}
          />
        </div>
      );
    }
    render(() => <Arabic />);
    await settle();
    editor.get().update(() => $getRoot().getLastChild()?.selectEnd());
    await settle();
    const tools = document.querySelector('[data-slot="code-block-tools"]');
    expect(tools?.getAttribute("dir")).toBe("ltr");
    editor.get().update(() => $getRoot().getFirstChild()?.selectEnd());
    await settle();
    expect(document.querySelector('[data-slot="code-block-tools"]')).toBeNull();
    expect(codeLanguageName("javascript")).toBe("JavaScript");
  });
});

describe("code blocks read and written", () => {
  test("the language reads back from markdown, and the renderer highlights it", async () => {
    expect(documentToMarkdown(markdownToDocument(CODE))).toBe(CODE);
    render(() => <RichTextRenderer markdown={CODE} />);
    expect(screen.getByRole("button", { name: "Copy code" })).toBeDefined();
    expect(document.body.textContent).toContain("const a = 1;");
  });

  test("a server writes the numbered block under the editor, and the page hydrates with every node kept", async () => {
    const { code, html } = await serverProcess(`
      import { renderToStringAsync } from "@barqjs/server";
      import { RichTextEditor } from ${entry};
      export async function page() {
        return await renderToStringAsync(() => <RichTextEditor label="Notes" defaultMarkdown={${JSON.stringify(CODE)}} />);
      }
    `);
    expect(code).toBe(0);
    expect(html).toMatch(/data-gutter="1\n2"/u);
    const result = await hydrates(`
      import { RichTextRenderer } from ${entry};
      export function Page() {
        return <RichTextRenderer markdown={${JSON.stringify(CODE)}} />;
      }
    `);
    result.unmount();
    const page = await hydratesFromServer(
      "RichTextEditor",
      `<RichTextEditor label="Notes" defaultMarkdown={${JSON.stringify(CODE)}} />`,
    );
    expect(content().querySelector("code")?.getAttribute("data-gutter")).toBe("1\n2");
    page.dispose();
  });
});
