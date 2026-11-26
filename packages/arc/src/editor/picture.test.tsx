import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, cleanup, render, screen, user, waitFor, within } from "@barqjs/testing";
import { strToU8, zipSync } from "fflate";
import {
  $createNodeSelection,
  $getRoot,
  $setSelection,
  type LexicalEditor,
  type SerializedEditorState,
} from "lexical";

import { hydrates } from "../test-arc.ts";
import { BlockEditor } from "./block-editor.tsx";
import { documentToMarkdown, htmlToDocument, markdownToDocument } from "./document.ts";
import { sizeOfShare, wordToHtml } from "./docx-import.tsx";
import { provideEditorMedia } from "./media.tsx";
import {
  type ImageData,
  ImageBlock,
  creditOf,
  creditSource,
  pictureHtml,
  pictureStyles,
} from "./picture.tsx";
import { imageExtension } from "./picture-extension.tsx";
import { RichTextRenderer } from "./renderer.tsx";
import { capture, hydratesFromServer, keydown, settle } from "./test-editor.ts";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const entry = JSON.stringify(new URL("./index.ts", import.meta.url).pathname);

const CREDIT = {
  author: "Jane Doe",
  licence: "CC BY-SA 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  source: "https://commons.wikimedia.org/wiki/File:River.jpg",
};

function picture(data: Partial<ImageData> = {}): ImageData {
  return {
    src: "https://cdn.example.com/river.jpg",
    alt: "A river",
    caption: "",
    size: "full",
    ...data,
  };
}

/** A document of one picture, as a stored node, the way an app wrote it. */
function stored(node: object): SerializedEditorState {
  return {
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [{ type: "image", version: 1, format: "", ...node }],
    },
  } as unknown as SerializedEditorState;
}

function content(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="rich-text-editor-content"]')!;
}

function figure(): HTMLElement {
  return content().querySelector<HTMLElement>('[data-slot="editor-image"]')!;
}

function dataOf(editor: LexicalEditor): ImageData {
  return editor.read(() => {
    const node = $getRoot().getChildren().find(ImageBlock.$is);
    if (node === undefined) throw new Error("no picture");
    return node.getData();
  });
}

async function mount(data: ImageData = picture()): Promise<LexicalEditor> {
  const editor = capture();
  render(() => <BlockEditor label="Page" onEditor={editor.set} />);
  await settle();
  editor.get().update(() => {
    $getRoot().clear().append(ImageBlock.$create(data));
  });
  await settle();
  return editor.get();
}

async function choose(editor: LexicalEditor): Promise<void> {
  editor.update(() => {
    const node = $getRoot().getChildren().find(ImageBlock.$is);
    if (node === undefined) return;
    const selection = $createNodeSelection();
    selection.add(node.getKey());
    $setSelection(selection);
  });
  await settle();
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("a picture's size and place", () => {
  test("the block menu sizes it and moves it to the start or the end, and the document keeps both", async () => {
    const editor = await mount();
    expect(figure().getAttribute("data-size")).toBe("full");
    await choose(editor);
    await user.click(screen.getByRole("button", { name: "Block actions" }));
    await settle();
    // A picture as wide as the column has nowhere to move to.
    expect(screen.queryByRole("menuitemradio", { name: "Align to the end" })).toBeNull();
    await user.click(screen.getByRole("menuitemradio", { name: "Small" }));
    await settle();
    expect(figure().getAttribute("data-size")).toBe("small");
    for (const one of pictureStyles({ size: "small" }).figure.split(" ")) {
      expect(figure().classList.contains(one)).toBe(true);
    }
    await choose(editor);
    await user.click(screen.getByRole("button", { name: "Block actions" }));
    await settle();
    await user.click(screen.getByRole("menuitemradio", { name: "Align to the end" }));
    await settle();
    expect(figure().getAttribute("data-align")).toBe("end");
    const json = editor.getEditorState().toJSON();
    expect(json.root.children[0]).toMatchObject({ type: "image", size: "small", format: "end" });
  });

  test("in Arabic the end is the left: alignment is written on the inline axis", async () => {
    render(() => (
      <Arabic>
        <RichTextRenderer value={stored({ ...picture({ size: "medium" }), format: "end" })} />
      </Arabic>
    ));
    const shown = document.querySelector<HTMLElement>('[data-slot="editor-image"]')!;
    expect(shown.getAttribute("data-align")).toBe("end");
    for (const one of pictureStyles({ size: "medium", align: "end" }).figure.split(" ")) {
      expect(shown.classList.contains(one)).toBe(true);
    }
    expect(shown.closest("[dir]")?.getAttribute("dir")).toBe("rtl");
  });
});

describe("a picture's words", () => {
  test("a picture with no alt text says so while it is edited, and marked decorative it is passed by", async () => {
    const editor = await mount(picture({ alt: "" }));
    expect(figure().querySelector('[data-slot="editor-image-alt-missing"]')?.textContent).toBe(
      "Add alt text, or mark the picture decorative",
    );
    await user.click(screen.getByRole("button", { name: "Alt text and caption" }));
    await settle();
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("textbox", { name: "Alt text" })).toBeDefined();
    await user.click(dialog.getByRole("checkbox", { name: /Decorative only/ }));
    await settle();
    // Words for a picture nobody is told about would never be read.
    expect(dialog.queryByRole("textbox", { name: "Alt text" })).toBeNull();
    await user.click(dialog.getByRole("button", { name: "Save" }));
    await settle();
    expect(dataOf(editor).decorative).toBe(true);
    expect(figure().querySelector("img")?.getAttribute("alt")).toBe("");
    expect(figure().querySelector('[data-slot="editor-image-alt-missing"]')).toBeNull();
  });

  test("a credit names who made it, links its licence's terms and the page it came from", async () => {
    const editor = await mount();
    await user.click(screen.getByRole("button", { name: "Alt text and caption" }));
    await settle();
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByRole("textbox", { name: "Made by" }), "Jane Doe");
    await user.type(dialog.getByRole("combobox", { name: "Licence" }), "CC BY-SA 4.0");
    await user.type(dialog.getByRole("textbox", { name: "Page it came from" }), CREDIT.source);
    await user.type(dialog.getByRole("textbox", { name: "Caption" }), "The river in May");
    await user.click(dialog.getByRole("button", { name: "Save" }));
    await settle();
    expect(dataOf(editor).credit).toEqual(CREDIT);
    const line = figure().querySelector('[data-slot="editor-image-credit"]')!;
    expect(line.textContent).toBe("Jane Doe · CC BY-SA 4.0 · Wikimedia Commons");
    const [terms, source] = [...line.querySelectorAll("a")];
    expect(terms?.getAttribute("rel")).toBe("license noopener noreferrer");
    expect(terms?.getAttribute("href")).toBe(CREDIT.licenceUrl);
    expect(source?.getAttribute("href")).toBe(CREDIT.source);
    expect(figure().querySelector("figcaption")?.textContent).toBe("The river in May");
  });

  test("a credit is none until it names someone or a licence, and keeps a source only once it is https", () => {
    expect(creditOf(null, " ", "", "https://example.com")).toBeUndefined();
    expect(creditOf(null, "Sam", "", "example.com")).toEqual({ author: "Sam", licence: "" });
    expect(creditOf(null, "", "CC0 1.0", "")?.licenceUrl).toBe(
      "https://creativecommons.org/publicdomain/zero/1.0/",
    );
    // A licence that came with its own terms keeps them until it is renamed.
    const kept = { author: "A", licence: "Own terms", licenceUrl: "https://example.com/terms" };
    expect(creditOf(kept, "A", "Own terms", "")?.licenceUrl).toBe("https://example.com/terms");
    expect(creditOf(kept, "A", "Other", "")?.licenceUrl).toBeUndefined();
    expect(creditSource({ author: "", licence: "", source: "https://en.wikipedia.org/x" })).toBe(
      "Wikipedia",
    );
  });
});

describe("a picture's focus point", () => {
  test("the arrows move the dot five points, one with Shift, and a press puts it where it lands", async () => {
    const editor = await mount();
    await user.click(screen.getByRole("button", { name: "Alt text and caption" }));
    await settle();
    const dot = screen.getByRole("button", { name: "Focus point, 50% across and 50% down" });
    keydown(dot, "ArrowRight");
    await settle();
    keydown(screen.getByRole("button", { name: /^Focus point/ }), "ArrowUp", { shiftKey: true });
    await settle();
    expect(screen.getByRole("button", { name: /^Focus point/ }).getAttribute("aria-label")).toBe(
      "Focus point, 55% across and 49% down",
    );
    const stage = document.querySelector<HTMLElement>('[data-slot="focus-picker-stage"]')!;
    stage.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }) as DOMRect;
    stage.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientX: 50, clientY: 80, pointerId: 1 }),
    );
    await settle();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await settle();
    expect(dataOf(editor).focus).toEqual({ x: 25, y: 80 });
  });

  test("in Arabic the right arrow still moves it right: the picture does not turn round", async () => {
    const editor = capture();
    render(() => (
      <Arabic>
        <BlockEditor label="Page" onEditor={editor.set} />
      </Arabic>
    ));
    await settle();
    editor.get().update(() => {
      $getRoot().clear().append(ImageBlock.$create(picture()));
    });
    await settle();
    await user.click(screen.getByRole("button", { name: "Alt text and caption" }));
    await settle();
    expect(document.querySelector('[data-slot="focus-picker-stage"]')?.getAttribute("dir")).toBe(
      "ltr",
    );
    keydown(screen.getByRole("button", { name: /^Focus point/ }), "ArrowRight");
    await settle();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await settle();
    expect(dataOf(editor.get()).focus).toEqual({ x: 55, y: 50 });
  });
});

describe("a labelled picture", () => {
  test("labels are added, named, moved by the arrows and dragged, and drawn numbered on the picture", async () => {
    const editor = await mount();
    await user.click(screen.getByRole("button", { name: "Alt text and caption" }));
    await settle();
    const dialog = within(screen.getByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Add label" }));
    await user.click(dialog.getByRole("button", { name: "Add label" }));
    await settle();
    await user.type(dialog.getByRole("textbox", { name: "Label 1 name" }), "Source");
    await user.type(dialog.getByRole("textbox", { name: "Label 2 name" }), "Delta");
    await user.type(
      dialog.getByRole("textbox", { name: "Label 2 description" }),
      "Where it meets the sea",
    );
    keydown(dialog.getByRole("button", { name: "Move label 1" }), "ArrowLeft", { shiftKey: true });
    await settle();
    const frame = document.querySelector<HTMLElement>('[data-slot="picture-labels-frame"]')!;
    frame.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }) as DOMRect;
    const second = dialog.getByRole("button", { name: "Move label 2" });
    second.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerId: 2, pointerType: "touch" }),
    );
    await settle();
    second.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, pointerId: 2, clientX: 90, clientY: 20 }),
    );
    second.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerId: 2, clientX: 90, clientY: 20 }),
    );
    await settle();
    await user.click(dialog.getByRole("button", { name: "Save" }));
    await settle();
    const labels = dataOf(editor).labels ?? [];
    expect(labels.map((one) => [one.title, one.x, one.y])).toEqual([
      ["Source", 0.45, 0.5],
      ["Delta", 0.9, 0.2],
    ]);
    const markers = figure().querySelectorAll('[data-slot="picture-label-marker"]');
    expect([...markers].map((one) => one.textContent)).toEqual(["1", "2"]);
    expect(markers[0]?.getAttribute("aria-hidden")).toBe("true");
  });

  test("the reader opens one label at a time under the picture, and paper lists them all", async () => {
    const labels = [
      { id: "a", x: 0.2, y: 0.3, title: "Source", text: "" },
      { id: "b", x: 0.8, y: 0.6, title: "", text: "Where it meets the sea" },
    ];
    render(() => <RichTextRenderer value={stored(picture({ labels }))} />);
    const first = screen.getByRole("button", { name: "1. Source" });
    const second = screen.getByRole("button", { name: "2. Label 2" });
    expect(first.getAttribute("aria-expanded")).toBe("false");
    await user.click(second);
    await settle();
    expect(second.getAttribute("aria-expanded")).toBe("true");
    const card = document.querySelector('[data-slot="picture-label-card"]');
    expect(card?.textContent).toContain("Where it meets the sea");
    user.tap(first);
    await settle();
    expect(document.querySelector('[data-slot="picture-label-card"]')?.textContent).toContain(
      "Source",
    );
    expect(second.getAttribute("aria-expanded")).toBe("false");
    const list = document.querySelector('[data-slot="picture-label-list"]');
    expect(list?.querySelectorAll("li")).toHaveLength(2);
    expect(await ariaViolations(document.body)).toEqual([]);
  });
});

describe("a picture written and read", () => {
  test("markdown keeps a plain picture as markdown, and anything more as one line of HTML", () => {
    const plain = markdownToDocument('![A river](https://cdn.example.com/river.jpg "In May")');
    expect(plain.root.children[0]).toMatchObject({
      type: "image",
      alt: "A river",
      caption: "In May",
    });
    expect(documentToMarkdown(plain)).toBe(
      '![A river](https://cdn.example.com/river.jpg "In May")',
    );
    const full = picture({
      size: "medium",
      caption: "In <May>",
      credit: CREDIT,
      focus: { x: 30, y: 70 },
      labels: [{ id: "a", x: 0.5, y: 0.5, title: "Bend", text: 'A "bend"' }],
    });
    const line = pictureHtml(full);
    expect(line).not.toContain("\n");
    const read = markdownToDocument(line);
    expect(read.root.children[0]).toMatchObject({ type: "image", ...full });
    expect(documentToMarkdown(read)).toBe(line);
  });

  test("HTML writes a figure the import reads back, a decorative picture with empty words", () => {
    const decorative = picture({ decorative: true, size: "small", fileId: "file-1" });
    const html = pictureHtml(decorative, "end");
    expect(html).toContain('alt=""');
    const state = htmlToDocument(html);
    expect(state.root.children[0]).toMatchObject({
      type: "image",
      decorative: true,
      size: "small",
      fileId: "file-1",
      alt: "",
    });
    const element = ImageBlock.toHtml?.(picture({ caption: "In May" }), "");
    expect(element?.tagName).toBe("FIGURE");
    expect(element?.querySelector("figcaption")?.textContent).toBe("In May");
  });

  test("a document an app stored, keeping a file by its id, opens unchanged with the app's address for it", async () => {
    function Page() {
      provideEditorMedia({ fileUrl: (id) => `https://files.example.com/${id}` });
      return (
        <RichTextRenderer
          value={stored({ fileId: "f-1", alt: "", decorative: true, caption: "", size: "small" })}
        />
      );
    }
    render(() => <Page />);
    const image = document.querySelector('[data-slot="editor-image"] img');
    expect(image?.getAttribute("src")).toBe("https://files.example.com/f-1");
    expect(image?.getAttribute("alt")).toBe("");
  });

  test("Word's pictures come in at the size they had on the page", async () => {
    expect([0.2, 0.5, 0.8, 1].map(sizeOfShare)).toEqual(["small", "medium", "large", "full"]);
    const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const drawing = `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="2865755" cy="914400"/><wp:docPr id="1" name="Picture 1" descr="A river"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="river.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    const docx = zipSync({
      "[Content_Types].xml": strToU8(
        `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
      ),
      "_rels/.rels": strToU8(
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
      ),
      "word/_rels/document.xml.rels": strToU8(
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/river.png"/></Relationships>`,
      ),
      "word/document.xml": strToU8(
        `<?xml version="1.0"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body><w:p>${drawing}</w:p></w:body></w:document>`,
      ),
      "word/media/river.png": new Uint8Array([137, 80, 78, 71]),
    });
    const { html } = await wordToHtml(docx, {
      picture: async () => ({ src: "https://example.com/river.png" }),
    });
    // Half an A4 page's text wide, its description kept as written.
    expect(htmlToDocument(html).root.children[0]).toMatchObject({
      type: "image",
      alt: "A river",
      size: "medium",
    });
  });

  test("class, classes and renders reach every picture, in the renderer", () => {
    render(() => (
      <RichTextRenderer
        value={stored(picture({ caption: "In May" }))}
        extensions={[
          imageExtension({
            class: "acme-picture",
            classes: { credit: "acme-credit" },
            renders: { caption: (part, words) => <p {...part.props}>{words}</p> },
          }),
        ]}
      />
    ));
    const shown = document.querySelector('[data-slot="editor-image"]')!;
    expect(shown.classList.contains("acme-picture")).toBe(true);
    const caption = shown.querySelector('[data-slot="editor-image-caption"]')!;
    expect(caption.tagName).toBe("P");
    expect(caption.textContent).toBe("In May");
  });
});

describe("pictures on the server", () => {
  const MARKDOWN = [
    pictureHtml(
      picture({
        size: "medium",
        caption: "In May",
        credit: CREDIT,
        labels: [{ id: "a", x: 0.5, y: 0.5, title: "Bend", text: "" }],
      }),
      "end",
    ),
    "![A bridge](https://cdn.example.com/bridge.jpg)",
  ].join("\n\n");

  test("the renderer draws each picture, its credit and labels, and the page hydrates with every node kept", async () => {
    const result = await hydrates(`
      import { RichTextRenderer } from ${entry};
      export function Page() {
        return <RichTextRenderer markdown={${JSON.stringify(MARKDOWN)}} />;
      }
    `);
    const figures = result.container.querySelectorAll('[data-slot="editor-image"]');
    expect(figures).toHaveLength(2);
    expect(figures[0]?.getAttribute("data-size")).toBe("medium");
    expect(figures[0]?.querySelector('[data-slot="editor-image-credit"]')?.textContent).toContain(
      "Jane Doe",
    );
    expect(figures[0]?.querySelector('[data-slot="picture-label-marker"]')?.tagName).toBe("BUTTON");
    result.unmount();
  });

  test("the editor takes over the pictures the server drew", async () => {
    const page = await hydratesFromServer(
      "BlockEditor",
      `<BlockEditor label="Page" defaultMarkdown={${JSON.stringify(MARKDOWN)}} />`,
    );
    await waitFor(() =>
      expect(content().querySelectorAll('[data-slot="editor-image"]')).toHaveLength(2),
    );
    expect(content().querySelector('[data-slot="editor-image"]')?.getAttribute("data-align")).toBe(
      "end",
    );
    expect(content().hasAttribute("data-lexical-editor")).toBe(true);
    page.dispose();
  });
});
