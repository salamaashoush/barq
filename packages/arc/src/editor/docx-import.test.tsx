import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { cleanup, render, screen, waitFor } from "@barqjs/testing";
import { DRAG_DROP_PASTE } from "@lexical/rich-text";
import { strToU8, zipSync } from "fflate";
import { $getRoot } from "lexical";

import { importGraph } from "../test-graph.ts";
import { htmlToDocument } from "./document.ts";
import { wordImportExtension, wordToHtml } from "./docx-import.tsx";
import { ommlToLatex } from "./omml.ts";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { capture, settle, textOf } from "./test-editor.ts";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const run = (text: string) => `<m:r><m:t>${text}</m:t></m:r>`;

function latex(inner: string): string {
  const xml = new DOMParser().parseFromString(
    `<m:oMath xmlns:m="${MATH_NS}">${inner}</m:oMath>`,
    "application/xml",
  );
  return ommlToLatex(xml.documentElement);
}

describe("Word's equations as LaTeX", () => {
  test("fractions, powers, roots and Greek letters", () => {
    expect(latex(`<m:f><m:num>${run("1")}</m:num><m:den>${run("2")}</m:den></m:f>`)).toBe(
      "\\frac{1}{2}",
    );
    expect(
      latex(`${run("π")}<m:sSup><m:e>${run("r")}</m:e><m:sup>${run("2")}</m:sup></m:sSup>`),
    ).toBe("\\pi {r}^{2}");
    expect(
      latex(
        `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${run("x")}</m:e></m:rad>`,
      ),
    ).toBe("\\sqrt{x}");
    expect(latex(`<m:rad><m:deg>${run("3")}</m:deg><m:e>${run("8")}</m:e></m:rad>`)).toBe(
      "\\sqrt[3]{8}",
    );
  });

  test("sums with their limits, brackets and matrices", () => {
    expect(
      latex(
        `<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${run("i=1")}</m:sub><m:sup>${run("n")}</m:sup><m:e>${run("i")}</m:e></m:nary>`,
      ),
    ).toBe("\\sum_{i=1}^{n}{i}");
    expect(latex(`<m:d><m:e>${run("a+b")}</m:e></m:d>`)).toBe("\\left(a+b\\right)");
    expect(
      latex(
        `<m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr><m:e><m:m><m:mr><m:e>${run("1")}</m:e><m:e>${run("0")}</m:e></m:mr><m:mr><m:e>${run("0")}</m:e><m:e>${run("1")}</m:e></m:mr></m:m></m:e></m:d>`,
      ),
    ).toBe("\\left[\\begin{matrix}1 & 0 \\\\ 0 & 1\\end{matrix}\\right]");
  });

  test("functions and limits by name, and a vector's accent", () => {
    expect(latex(`<m:func><m:fName>${run("sin")}</m:fName><m:e>${run("θ")}</m:e></m:func>`)).toBe(
      "\\sin{\\theta}",
    );
    expect(
      latex(
        `<m:func><m:fName><m:limLow><m:e>${run("lim")}</m:e><m:lim>${run("x→0")}</m:lim></m:limLow></m:fName><m:e>${run("f")}</m:e></m:func>`,
      ),
    ).toBe("\\lim_{x\\to 0}{f}");
    expect(latex(`<m:acc><m:accPr><m:chr m:val="⃗"/></m:accPr><m:e>${run("v")}</m:e></m:acc>`)).toBe(
      "\\vec{v}",
    );
  });
});

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);

/** A small Word document: a heading, a footnote, an equation in a line and one on its own, a picture. */
function wordDocument(): Uint8Array {
  const picture = `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="914400" cy="914400"/><wp:docPr id="1" name="Picture 1" descr="A river"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="river.png" descr="A river"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  const body = [
    `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Rivers</w:t></w:r></w:p>`,
    `<w:p><w:r><w:t>Rivers flood</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="1"/></w:r><w:r><w:t xml:space="preserve"> in spring.</w:t></w:r></w:p>`,
    `<w:p><w:r><w:t xml:space="preserve">Area is </w:t></w:r><m:oMath>${run("π")}<m:sSup><m:e>${run("r")}</m:e><m:sup>${run("2")}</m:sup></m:sSup></m:oMath></w:p>`,
    `<w:p><m:oMathPara><m:oMath><m:f><m:num>${run("1")}</m:num><m:den>${run("2")}</m:den></m:f></m:oMath></m:oMathPara></w:p>`,
    `<w:p>${picture}</w:p>`,
  ].join("");
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    "word/_rels/document.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdNotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/river.png"/></Relationships>`,
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0"?><w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:m="${MATH_NS}"><w:body>${body}</w:body></w:document>`,
    ),
    "word/footnotes.xml": strToU8(
      `<?xml version="1.0"?><w:footnotes xmlns:w="${W}"><w:footnote w:id="1"><w:p><w:r><w:t>Every year, after the rains.</w:t></w:r></w:p></w:footnote></w:footnotes>`,
    ),
    "word/media/river.png": PNG,
  });
}

describe("a Word document read", () => {
  test("headings, footnotes in their line, equations as their LaTeX and stored pictures", async () => {
    const stored: File[] = [];
    const { html, skipped } = await wordToHtml(wordDocument(), {
      picture: async (file) => {
        stored.push(file);
        return { src: "https://example.com/river.png" };
      },
    });
    expect(skipped).toBe(0);
    expect(stored[0]?.type).toBe("image/png");
    const state = htmlToDocument(html);
    const json = JSON.stringify(state);
    const kinds = (state.root.children as unknown as { type: string }[]).map((one) => one.type);
    expect(kinds).toEqual(["heading", "paragraph", "paragraph", "paragraph", "image"]);
    expect(json).toContain('"note":"Every year, after the rains."');
    expect(json).toContain("\\\\pi {r}^{2}");
    expect(json).toContain("\\\\frac{1}{2}");
    expect(json).toContain('"alt":"A river"');
    expect(json).toContain("https://example.com/river.png");
  });

  test("a formula rule of an extension's writes each equation, and pictures with nowhere to go are counted", async () => {
    const { html, skipped } = await wordToHtml(wordDocument(), {
      extensions: [
        {
          name: "test/formulas",
          docx: {
            formula: (tex, block) =>
              `<span data-tex="${tex}" data-block="${String(block)}"></span>`,
          },
        },
      ],
    });
    expect(skipped).toBe(1);
    expect(html).toContain('data-block="true"');
    expect(html).toContain('data-tex="\\pi {r}^{2}" data-block="false"');
  });
});

describe("in the editor", () => {
  test("a Word document dropped on the editor is read in where the caret is, and the card says so", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" defaultMarkdown="Before" onEditor={editor.set} />);
    await settle();
    editor.get().update(() => $getRoot().selectEnd());
    const file = new File([wordDocument() as Uint8Array<ArrayBuffer>], "rivers.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    editor.get().update(() => {
      editor.get().dispatchCommand(DRAG_DROP_PASTE, [file]);
    });
    await waitFor(() => expect(textOf(editor.get())).toContain("Rivers flood"), { timeout: 5000 });
    expect(textOf(editor.get()).startsWith("Before")).toBe(true);
    const card = document.querySelector('[data-slot="word-import"]');
    await waitFor(() => expect(card?.getAttribute("data-state")).toBe("done"));
    expect(card?.textContent).toContain("1 picture was left out");
    expect(JSON.stringify(editor.get().getEditorState().toJSON())).toContain('"type":"footnote"');
  });

  test("the Insert menu offers it, and a file that is not Word says it could not be read", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" onEditor={editor.set} />);
    await settle();
    const input = document.querySelector<HTMLInputElement>('[data-slot="word-import-input"]')!;
    const broken = new File(["not a zip"], "broken.docx");
    Object.defineProperty(input, "files", { configurable: true, value: [broken] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("The Word document could not be read"),
    );
  });
});

describe("what an editor pays for Word", () => {
  test("mammoth and fflate load only when a document is read", () => {
    const graph = importGraph(join(import.meta.dir, "index.ts"));
    expect([...(graph.packages.get("mammoth") ?? [])]).toEqual(["dynamic-import"]);
    expect([...(graph.packages.get("fflate") ?? [])]).toEqual(["dynamic-import"]);
    expect(wordImportExtension.load).toBeDefined();
  });
});
