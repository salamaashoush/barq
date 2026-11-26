import { afterEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, cleanup, render, screen, user, within } from "@barqjs/testing";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  IS_SUBSCRIPT,
  IS_SUPERSCRIPT,
  type LexicalEditor,
} from "lexical";

import { serverProcess } from "../ssr-harness.ts";
import { hydrates } from "../test-arc.ts";
import { documentToMarkdown, htmlToDocument, markdownToDocument } from "./document.ts";
import { HIGHLIGHT_COLOURS, TEXT_COLOURS, TEXT_SIZES } from "./text-style.ts";
import { RichTextRenderer } from "./renderer.tsx";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { capture, hydratesFromServer, keydown, settle } from "./test-editor.ts";

const entry = JSON.stringify(fileURLToPath(new URL("./index.ts", import.meta.url)));

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function content(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="rich-text-editor-content"]')!;
}

function bar() {
  const element = document.querySelector<HTMLElement>('[data-slot="floating-format-toolbar"]');
  if (element === null) throw new Error("no floating bar");
  return within(element);
}

interface Piece {
  text: string;
  format: number;
  style: string;
}

/** The text nodes of the first block, with their format and style. */
function pieces(editor: LexicalEditor): Piece[] {
  return editor.read(() => {
    const block = $getRoot().getFirstChild();
    return ($isElementNode(block) ? block.getChildren() : []).flatMap((node) =>
      $isTextNode(node)
        ? [{ text: node.getTextContent(), format: node.getFormat(), style: node.getStyle() }]
        : [],
    );
  });
}

interface Block {
  children: Piece[];
}

async function writeAndSelect(editor: LexicalEditor, text: string, from: number, to: number) {
  editor.update(() => {
    const node = $createTextNode(text);
    $getRoot().clear().append($createParagraphNode().append(node));
    node.select(from, to);
  });
  await settle();
}

const STYLED = {
  root: {
    type: "root",
    version: 1,
    format: "",
    indent: 0,
    direction: null,
    children: [
      {
        type: "paragraph",
        version: 1,
        format: "",
        indent: 0,
        direction: null,
        textFormat: 0,
        textStyle: "",
        children: [
          { type: "text", version: 1, text: "H", format: 0, style: "", mode: "normal", detail: 0 },
          {
            type: "text",
            version: 1,
            text: "2",
            format: IS_SUBSCRIPT,
            style: "",
            mode: "normal",
            detail: 0,
          },
          { type: "text", version: 1, text: "O is ", format: 0, style: "", mode: "normal", detail: 0 },
          {
            type: "text",
            version: 1,
            text: "blue",
            format: 0,
            style: `color: ${TEXT_COLOURS.blue}; font-size: ${TEXT_SIZES.large}`,
            mode: "normal",
            detail: 0,
          },
          { type: "text", version: 1, text: " and ", format: 0, style: "", mode: "normal", detail: 0 },
          {
            type: "text",
            version: 1,
            text: "marked",
            format: 0,
            style: `background-color: ${HIGHLIGHT_COLOURS.yellow}`,
            mode: "normal",
            detail: 0,
          },
        ],
      },
    ],
  },
};

describe("formatting by key", () => {
  test("Mod+. and Mod+, raise and lower the selection, by the key's place on any keyboard", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" onEditor={editor.set} />);
    await settle();
    await writeAndSelect(editor.get(), "x2", 1, 2);
    keydown(content(), ".", { ctrlKey: true, code: "Period" });
    await settle();
    expect(pieces(editor.get()).at(-1)).toMatchObject({ text: "2", format: IS_SUPERSCRIPT });
    // An Arabic keyboard types "و" at the comma's place.
    keydown(content(), "و", { ctrlKey: true, code: "Comma" });
    await settle();
    expect(pieces(editor.get()).at(-1)).toMatchObject({ text: "2", format: IS_SUBSCRIPT });
  });

  test("Mod+Shift+H highlights in yellow, Mod+Shift+S strikes through, Mod+\\ clears it all", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" onEditor={editor.set} />);
    await settle();
    await writeAndSelect(editor.get(), "keep this", 5, 9);
    keydown(content(), "H", { ctrlKey: true, shiftKey: true, code: "KeyH" });
    keydown(content(), "S", { ctrlKey: true, shiftKey: true, code: "KeyS" });
    keydown(content(), "b", { ctrlKey: true, code: "KeyB" });
    await settle();
    const marked = pieces(editor.get()).at(-1)!;
    expect(marked.text).toBe("this");
    expect(marked.style).toContain(`background-color: ${HIGHLIGHT_COLOURS.yellow}`);
    expect(marked.format).not.toBe(0);
    keydown(content(), "\\", { ctrlKey: true, code: "Backslash" });
    await settle();
    expect(pieces(editor.get()).every((one) => one.format === 0 && one.style === "")).toBe(true);
  });
});

describe("formatting over selected text", () => {
  test("the bar raises and lowers, colours, highlights, sizes and clears, with no violations", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" onEditor={editor.set} />);
    await settle();
    await writeAndSelect(editor.get(), "a word", 2, 6);
    const superscript = bar().getByRole("button", { name: /Superscript/ });
    expect(superscript.getAttribute("aria-pressed")).toBe("false");
    await user.click(superscript);
    await settle();
    expect(pieces(editor.get()).at(-1)?.format).toBe(IS_SUPERSCRIPT);
    expect(bar().getByRole("button", { name: /Superscript/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    await user.click(bar().getByRole("button", { name: "Text colour" }));
    await settle();
    const menu = within(document.querySelector<HTMLElement>('[data-slot="text-colour-menu"]')!);
    expect(menu.getByRole("listbox", { name: "Text colour" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
    await user.click(menu.getAllByRole("option", { name: "Blue" })[0]!);
    await settle();
    expect(pieces(editor.get()).at(-1)?.style).toBe(`color: ${TEXT_COLOURS.blue}`);
    expect(content().querySelector("sup")?.getAttribute("style")).toContain("color");

    await user.click(bar().getByRole("button", { name: "Text colour" }));
    await settle();
    const highlight = within(
      document.querySelector<HTMLElement>('[data-slot="text-colour-menu"]')!,
    ).getByRole("listbox", { name: "Highlight" });
    await user.click(within(highlight).getByRole("option", { name: "Green" }));
    await settle();
    expect(pieces(editor.get()).at(-1)?.style).toContain(
      `background-color: ${HIGHLIGHT_COLOURS.green}`,
    );

    await user.click(bar().getByRole("button", { name: "Text size" }));
    await settle();
    await user.click(screen.getByRole("menuitemradio", { name: "Huge" }));
    await settle();
    expect(pieces(editor.get()).at(-1)?.style).toContain(`font-size: ${TEXT_SIZES.huge}`);

    await user.click(bar().getByRole("button", { name: /Clear formatting/ }));
    await settle();
    expect(pieces(editor.get()).every((one) => one.format === 0 && one.style === "")).toBe(true);
  });

  test("in an Arabic document the bar's controls run right to left", async () => {
    const editor = capture();
    function Arabic() {
      provideLocale("ar-EG");
      return (
        <div dir="rtl">
          <RichTextEditor label="ملاحظات" onEditor={editor.set} />
        </div>
      );
    }
    render(() => <Arabic />);
    await settle();
    await writeAndSelect(editor.get(), "ماء عذب", 0, 3);
    // Alt+F10 moves into the bar, and the left arrow goes on to the next control.
    keydown(content(), "F10", { altKey: true });
    await settle();
    const first = document.activeElement as HTMLElement;
    expect(first.getAttribute("data-slot")).toBe("floating-turn-into");
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Bold");
    await user.keyboard("{Escape}");
    await settle();
    keydown(content(), "ز", { ctrlKey: true, code: "Period" });
    await settle();
    expect(pieces(editor.get())[0]).toMatchObject({ text: "ماء", format: IS_SUPERSCRIPT });
  });
});

describe("formatting read and written", () => {
  test("HTML's sup, sub and coloured spans read in as the same formatting", () => {
    const state = htmlToDocument(
      `<p>E=mc<sup>2</sup>, H<sub>2</sub>O, <span style="color: ${TEXT_COLOURS.red}; font-size: 1.25em">red</span></p>`,
    );
    const texts = (state.root.children[0] as unknown as Block).children;
    expect(texts.find((one) => one.text === "2")?.format).toBe(IS_SUPERSCRIPT);
    expect(texts.filter((one) => one.text === "2")[1]?.format).toBe(IS_SUBSCRIPT);
    expect(texts.find((one) => one.text === "red")?.style).toBe(
      `color: ${TEXT_COLOURS.red}; font-size: 1.25em`,
    );
  });

  test("markdown keeps the words, the one thing it can write of a colour or a size", () => {
    expect(documentToMarkdown(STYLED as never)).toBe("H2O is blue and marked");
    expect(markdownToDocument("H2O").root.children.length).toBe(1);
  });

  test("the renderer draws raised, lowered, coloured, highlighted and sized text", async () => {
    render(() => <RichTextRenderer value={STYLED as never} />);
    const root = document.querySelector('[data-slot="rich-text"]')!;
    expect(root.querySelector("sub")?.textContent).toBe("2");
    const blue = [...root.querySelectorAll<HTMLElement>("span[style]")].find(
      (one) => one.textContent === "blue",
    );
    expect(blue?.style.color).not.toBe("");
    expect(blue?.getAttribute("style")).toContain("font-size: 1.25em");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a stored style the document does not draw is left out by the renderer", () => {
    const tampered = structuredClone(STYLED);
    tampered.root.children[0]!.children[0]!.style =
      "position: fixed; background-image: url(https://example.com/x)";
    render(() => <RichTextRenderer value={tampered as never} />);
    expect(document.querySelector('[data-slot="rich-text"] span[style*="position"]')).toBeNull();
  });

  test("a server writes the styles, and the page hydrates with every node kept", async () => {
    const { code, html } = await serverProcess(`
      import { renderToStringAsync } from "@barqjs/server";
      import { RichTextRenderer } from ${entry};
      export async function page() {
        return await renderToStringAsync(() => <RichTextRenderer value={${JSON.stringify(STYLED)}} />);
      }
    `);
    expect(code).toBe(0);
    expect(html).toContain(`color: ${TEXT_COLOURS.blue}`);
    expect(html).toContain("<sub>2</sub>");
    const result = await hydrates(`
      import { RichTextRenderer } from ${entry};
      export function Page() {
        return <RichTextRenderer value={${JSON.stringify(STYLED)}} />;
      }
    `);
    result.unmount();
    const page = await hydratesFromServer(
      "RichTextEditor",
      `<RichTextEditor label="Notes" defaultValue={${JSON.stringify(STYLED)}} />`,
    );
    expect(content().hasAttribute("data-lexical-editor")).toBe(true);
    expect(content().querySelector("sub")?.textContent).toBe("2");
    page.dispose();
  });
});
