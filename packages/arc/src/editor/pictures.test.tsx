import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, cleanup, render, screen, user, waitFor, within } from "@barqjs/testing";
import { $getRoot, type LexicalEditor, type SerializedEditorState } from "lexical";

import { hydrates } from "../test-arc.ts";
import { BlockEditor } from "./block-editor.tsx";
import { documentToMarkdown, htmlToDocument, markdownToDocument } from "./document.ts";
import { provideEditorMedia } from "./media.tsx";
import {
  CompareBlock,
  GalleryBlock,
  MAX_GALLERY_PICTURES,
  type PicturesData,
  type SetPicture,
  picturesExtension,
  picturesHtml,
} from "./pictures.tsx";
import { RichTextRenderer } from "./renderer.tsx";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { capture, hydratesFromServer, keydown, settle } from "./test-editor.ts";

beforeAll(() => {
  let made = 0;
  URL.createObjectURL = () => `blob:preview-${String(++made)}`;
  URL.revokeObjectURL = () => undefined;
});
afterAll(() => {
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const entry = JSON.stringify(new URL("./index.ts", import.meta.url).pathname);

const RIVER: SetPicture = {
  src: "https://cdn.example.com/river.jpg",
  alt: "A river",
  caption: "May",
};
const BRIDGE: SetPicture = { src: "https://cdn.example.com/bridge.jpg", alt: "A bridge" };
const MILL: SetPicture = { src: "https://cdn.example.com/mill.jpg", alt: "" };

function stored(type: string, pictures: readonly SetPicture[]): SerializedEditorState {
  return {
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [{ type, version: 1, format: "", pictures }],
    },
  } as unknown as SerializedEditorState;
}

function images(count: number): File[] {
  return Array.from(
    { length: count },
    (_, index) => new File(["x"], `photo-${String(index + 1)}.png`, { type: "image/png" }),
  );
}

function choose(files: readonly File[]): void {
  const input = [...document.querySelectorAll<HTMLInputElement>('input[type="file"]')].at(-1)!;
  Object.defineProperty(input, "files", { configurable: true, value: files });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function setOf(editor: LexicalEditor, type: string): PicturesData {
  return editor.read(() => {
    const node = $getRoot()
      .getChildren()
      .find((one) => one.getType() === type);
    if (node === undefined || !(GalleryBlock.$is(node) || CompareBlock.$is(node))) {
      throw new Error(`no ${type}`);
    }
    return node.getData();
  });
}

interface Uploader {
  finish: () => void;
}

async function mount(pictures: readonly SetPicture[] = []): Promise<[LexicalEditor, Uploader]> {
  const editor = capture();
  const waiting: (() => void)[] = [];
  render(() => (
    <RichTextEditor
      label="Notes"
      onEditor={editor.set}
      upload={(file: File) =>
        new Promise<string>((resolve) => {
          waiting.push(() => resolve(`https://cdn.example.com/${file.name}`));
        })
      }
    />
  ));
  await settle();
  editor.get().update(() => {
    $getRoot()
      .clear()
      .append(GalleryBlock.$create({ pictures: [...pictures] }));
  });
  await settle();
  return [editor.get(), { finish: () => waiting.splice(0).forEach((one) => one()) }];
}

function tiles(): string[] {
  return [...document.querySelectorAll('[data-slot="gallery-form-tile"]')].map(
    (one) => one.getAttribute("aria-label") ?? "",
  );
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("a gallery in the editor", () => {
  test("the Insert menu offers it where pictures upload, and a new one asks for its pictures", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" onEditor={editor.set} upload={async () => ""} />);
    await settle();
    await user.click(screen.getByRole("button", { name: "Insert" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Gallery" }));
    await settle();
    const block = document.querySelector('[data-slot="editor-gallery"]');
    expect(block?.textContent).toContain("No pictures yet");
    expect(screen.getByRole("button", { name: "Add pictures" })).toBeDefined();
    cleanup();
    render(() => <RichTextEditor label="Notes" />);
    await settle();
    await user.click(screen.getByRole("button", { name: "Insert" }));
    await settle();
    expect(screen.queryByRole("menuitem", { name: "Gallery" })).toBeNull();
  });

  test("pictures upload into it, are described, reordered by Alt and an arrow and by Later, and kept on Save", async () => {
    const [editor, uploads] = await mount();
    await user.click(screen.getByRole("button", { name: "Add pictures" }));
    await settle();
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("No pictures yet")).toBeDefined();
    choose(images(3));
    await settle();
    expect(tiles()).toEqual(["Picture 1 of 3", "Picture 2 of 3", "Picture 3 of 3"]);
    await user.type(dialog.getByRole("textbox", { name: "Alt text" }), "First");
    keydown(dialog.getByRole("button", { name: "Picture 1 of 3" }), "ArrowRight", { altKey: true });
    await settle();
    // The first picture is second now, and still the one chosen.
    expect(
      dialog.getByRole("button", { name: "Picture 2 of 3" }).getAttribute("aria-pressed"),
    ).toBe("true");
    await user.click(dialog.getByRole("button", { name: "Later" }));
    await settle();
    expect(dialog.getByRole("button", { name: "Later" }).hasAttribute("disabled")).toBe(true);
    await user.click(dialog.getByRole("button", { name: "Save" }));
    await settle();
    const { pictures } = setOf(editor, "gallery");
    expect(pictures.map((one) => one.alt)).toEqual(["", "", "First"]);
    expect(pictures.every((one) => one.uploadId !== undefined)).toBe(true);
    await waitFor(() => {
      // Two go up at once; each finished lets the next start.
      uploads.finish();
      expect(setOf(editor, "gallery").pictures.map((one) => one.src)).toEqual([
        "https://cdn.example.com/photo-2.png",
        "https://cdn.example.com/photo-3.png",
        "https://cdn.example.com/photo-1.png",
      ]);
    });
    const shown = document.querySelector('[data-slot="editor-gallery"]')!;
    expect(shown.querySelectorAll('[data-slot="editor-gallery-alt-missing"]')).toHaveLength(2);
  });

  test("a tile dragged by a finger onto another takes its place", async () => {
    const [editor] = await mount([RIVER, BRIDGE, MILL]);
    await user.click(screen.getByRole("button", { name: "Edit gallery" }));
    await settle();
    const items = [...document.querySelectorAll<HTMLElement>("[data-tile]")];
    items.forEach((item, index) => {
      item.getBoundingClientRect = () =>
        ({ left: index * 100, right: index * 100 + 90, top: 0, bottom: 90 }) as DOMRect;
    });
    const first = screen.getByRole("button", { name: "Picture 1 of 3" });
    first.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerId: 3, pointerType: "touch" }),
    );
    first.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, pointerId: 3, clientX: 250, clientY: 40 }),
    );
    await settle();
    expect(items[2]?.hasAttribute("data-over")).toBe(true);
    first.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerId: 3, clientX: 250, clientY: 40 }),
    );
    await settle();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await settle();
    expect(setOf(editor, "gallery").pictures.map((one) => one.alt)).toEqual([
      "A bridge",
      "",
      "A river",
    ]);
  });

  test(`at most ${String(MAX_GALLERY_PICTURES)} pictures, the rest left out`, async () => {
    const [editor] = await mount();
    await user.click(screen.getByRole("button", { name: "Add pictures" }));
    await settle();
    choose(images(30));
    await settle();
    expect(tiles()).toHaveLength(MAX_GALLERY_PICTURES);
    // Full, it offers no more.
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", { name: "Add pictures" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await settle();
    expect(setOf(editor, "gallery").pictures).toHaveLength(MAX_GALLERY_PICTURES);
  });

  test("in Arabic, Alt with the left arrow moves a picture on: later in the reading order", async () => {
    const editor = capture();
    render(() => (
      <Arabic>
        <RichTextEditor label="Notes" onEditor={editor.set} upload={async () => ""} />
      </Arabic>
    ));
    await settle();
    editor.get().update(() => {
      $getRoot()
        .clear()
        .append(GalleryBlock.$create({ pictures: [RIVER, BRIDGE] }));
    });
    await settle();
    await user.click(screen.getByRole("button", { name: "Edit gallery" }));
    await settle();
    const first = screen.getByRole("button", { name: "Picture ١ of ٢" });
    keydown(first, "ArrowLeft", { altKey: true });
    await settle();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await settle();
    expect(setOf(editor.get(), "gallery").pictures.map((one) => one.alt)).toEqual([
      "A bridge",
      "A river",
    ]);
  });
});

describe("a gallery as read", () => {
  test("a grid of pictures, each opening the viewer at itself, which steps through them", async () => {
    render(() => <RichTextRenderer value={stored("gallery", [RIVER, BRIDGE, MILL])} />);
    const list = screen.getByRole("list", { name: "Gallery" });
    const thumbs = within(list).getAllByRole("button");
    expect(thumbs).toHaveLength(3);
    await user.click(thumbs[1]!);
    await settle();
    const viewer = screen.getByRole("dialog");
    expect(viewer.textContent).toContain("Image 2 of 3");
    await user.keyboard("{ArrowRight}");
    await settle();
    expect(screen.getByRole("dialog").textContent).toContain("Image 3 of 3");
    await user.keyboard("{Escape}");
    await settle();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a document an app stored, its pictures kept by file id, opens unchanged", () => {
    function Page() {
      provideEditorMedia({ fileUrl: (id) => `https://files.example.com/${id}` });
      return (
        <RichTextRenderer
          value={stored("gallery", [
            { fileId: "f-1", alt: "A river", caption: "" },
            { fileId: "f-2", alt: "A bridge" },
          ])}
        />
      );
    }
    render(() => <Page />);
    const sources = [...document.querySelectorAll('[data-slot="editor-gallery"] img')].map((one) =>
      one.getAttribute("src"),
    );
    expect(sources).toEqual(["https://files.example.com/f-1", "https://files.example.com/f-2"]);
  });
});

describe("a before and after", () => {
  test("the reader slides between the two, the line moving with the slider, said as a share of the before", async () => {
    render(() => <RichTextRenderer value={stored("compare", [RIVER, BRIDGE])} />);
    const slider = screen.getByRole<HTMLInputElement>("slider", {
      name: "Slide between before and after",
    });
    expect(slider.getAttribute("aria-valuetext")).toBe("May 50%");
    const stage = document.querySelector<HTMLElement>('[data-slot="editor-compare-stage"]')!;
    // Pictures run left to right whatever the page's direction.
    expect(stage.getAttribute("dir")).toBe("ltr");
    slider.value = "70";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    expect(stage.style.getPropertyValue("--split")).toBe("70%");
    expect(slider.getAttribute("aria-valuetext")).toBe("May 70%");
    const [after, before] = [...stage.querySelectorAll("img")];
    expect(after?.getAttribute("alt")).toBe("A bridge");
    expect(before?.getAttribute("alt")).toBe("A river");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("with one side missing the other stands alone, named", () => {
    render(() => <RichTextRenderer value={stored("compare", [{ alt: "" }, BRIDGE])} />);
    expect(screen.queryByRole("slider")).toBeNull();
    const shown = document.querySelector('[data-slot="editor-compare"]')!;
    expect(shown.querySelectorAll("img")).toHaveLength(1);
    expect(shown.querySelector("figcaption")?.textContent).toBe("After");
  });

  test("each side is uploaded and described in its dialog; an after alone keeps its place", async () => {
    const editor = capture();
    render(() => (
      <BlockEditor
        label="Page"
        onEditor={editor.set}
        upload={async () => "https://cdn.example.com/field.png"}
      />
    ));
    await settle();
    editor.get().update(() => {
      $getRoot().clear().append(CompareBlock.$create());
    });
    await settle();
    await user.click(screen.getByRole("button", { name: "Edit comparison" }));
    await settle();
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("group", { name: "Before" })).toBeDefined();
    choose(images(1));
    await settle();
    await user.type(dialog.getByRole("textbox", { name: "Alt text" }), "The field in spring");
    await user.click(dialog.getByRole("button", { name: "Save" }));
    await settle();
    const [before, after] = setOf(editor.get(), "compare").pictures;
    expect(before).toEqual({ alt: "" });
    // Its upload finished while the dialog was open, so it keeps the address it was given.
    expect(after).toEqual({
      alt: "The field in spring",
      src: "https://cdn.example.com/field.png",
      uploadId: undefined,
    });
    const shown = document.querySelector('[data-slot="editor-compare"]')!;
    expect(shown.querySelector("figcaption")?.textContent).toBe("After");
  });
});

describe("sets written and read", () => {
  test("markdown keeps each set as one line of HTML and reads it back the same", () => {
    for (const [kind, pictures] of [
      ["gallery", [RIVER, BRIDGE, { fileId: "f-9", alt: "Kept by the app" }]],
      ["compare", [RIVER, BRIDGE]],
    ] as const) {
      const line = picturesHtml(kind, { pictures: [...pictures] });
      const read = markdownToDocument(line);
      expect(read.root.children[0]).toMatchObject({ type: kind, pictures });
      expect(documentToMarkdown(read)).toBe(line);
    }
  });

  test("HTML writes a figure of images the import reads back, a compare at most two", () => {
    const html = picturesHtml("compare", { pictures: [RIVER, BRIDGE, MILL] });
    const state = htmlToDocument(html);
    expect(state.root.children[0]).toMatchObject({ type: "compare", pictures: [RIVER, BRIDGE] });
    const element = GalleryBlock.toHtml?.({ pictures: [RIVER] }, "");
    expect(element?.getAttribute("data-gallery")).toBe("");
    expect(element?.querySelector("img")?.getAttribute("title")).toBe("May");
  });

  test("class and classes reach every set, in the renderer", () => {
    render(() => (
      <RichTextRenderer
        value={stored("compare", [RIVER, BRIDGE])}
        extensions={[picturesExtension({ class: "acme-set", classes: { line: "acme-line" } })]}
      />
    ));
    const shown = document.querySelector('[data-slot="editor-compare"]')!;
    expect(shown.classList.contains("acme-set")).toBe(true);
    expect(shown.querySelector('[aria-hidden="true"]')?.classList.contains("acme-line")).toBe(true);
  });
});

describe("sets on the server", () => {
  const MARKDOWN = [
    picturesHtml("gallery", { pictures: [RIVER, BRIDGE] }),
    picturesHtml("compare", { pictures: [RIVER, BRIDGE] }),
  ].join("\n\n");

  test("the renderer draws both and the page hydrates with every node kept", async () => {
    const result = await hydrates(`
      import { RichTextRenderer } from ${entry};
      export function Page() {
        return <RichTextRenderer markdown={${JSON.stringify(MARKDOWN)}} />;
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="gallery-thumb"]')).toHaveLength(2);
    expect(result.container.querySelector('input[type="range"]')).not.toBeNull();
    result.unmount();
  });

  test("the editor takes over the sets the server drew", async () => {
    const page = await hydratesFromServer(
      "BlockEditor",
      `<BlockEditor label="Page" defaultMarkdown={${JSON.stringify(MARKDOWN)}} />`,
    );
    const root = document.querySelector('[data-slot="rich-text-editor-content"]')!;
    await waitFor(() => expect(root.querySelector('[data-slot="editor-gallery"]')).not.toBeNull());
    expect(root.querySelector('[data-slot="editor-compare-stage"]')).not.toBeNull();
    expect(root.hasAttribute("data-lexical-editor")).toBe(true);
    page.dispose();
  });
});
