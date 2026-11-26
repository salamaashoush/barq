import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, cleanup, render, screen, user, waitFor, within } from "@barqjs/testing";
import { DRAG_DROP_PASTE } from "@lexical/rich-text";
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
import {
  type FileData,
  FileBlock,
  fileExtension,
  fileFamily,
  fileHtml,
  fileMeta,
} from "./file-block.tsx";
import { provideEditorMedia } from "./media.tsx";
import { RichTextRenderer } from "./renderer.tsx";
import { storedFilesExtension } from "./stored-files.ts";
import { capture, hydratesFromServer, settle } from "./test-editor.ts";

const REPORT: FileData = {
  src: "https://cdn.example.com/report.pdf",
  name: "report.pdf",
  mime: "application/pdf",
  bytes: 48_213,
};
const ARCHIVE: FileData = {
  src: "https://cdn.example.com/photos.zip",
  name: "photos.zip",
  mime: "application/zip",
  bytes: 2_400_000,
};

const originalClick = HTMLInputElement.prototype.click;
let picked: File[] = [];

beforeAll(() => {
  // The browser's own file picker, answering with `picked`.
  HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
    if (this.type !== "file") return originalClick.call(this);
    Object.defineProperty(this, "files", { configurable: true, value: picked });
    this.dispatchEvent(new Event("change"));
  };
});
afterAll(() => {
  HTMLInputElement.prototype.click = originalClick;
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const entry = JSON.stringify(new URL("./index.ts", import.meta.url).pathname);

function stored(node: object): SerializedEditorState {
  return {
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [{ type: "file", version: 1, format: "", ...node }],
    },
  } as unknown as SerializedEditorState;
}

function card(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="editor-file"]')!;
}

function dataOf(editor: LexicalEditor): FileData {
  return editor.read(() => {
    const node = $getRoot().getChildren().find(FileBlock.$is);
    if (node === undefined) throw new Error("no file");
    return node.getData();
  });
}

interface Uploads {
  finish: () => void;
}

async function mount(data?: FileData): Promise<[LexicalEditor, Uploads]> {
  const editor = capture();
  const waiting: (() => void)[] = [];
  render(() => (
    <BlockEditor
      label="Page"
      onEditor={editor.set}
      upload={(file: File) =>
        new Promise<string>((resolve) => {
          waiting.push(() => resolve(`https://cdn.example.com/v2/${file.name}`));
        })
      }
    />
  ));
  await settle();
  if (data !== undefined) {
    editor.get().update(() => {
      $getRoot().clear().append(FileBlock.$create(data));
    });
    await settle();
  }
  return [editor.get(), { finish: () => waiting.splice(0).forEach((one) => one()) }];
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("a file in the editor", () => {
  test("a file dropped on the editor shows at once with its progress, and takes its address once up", async () => {
    const [editor, uploads] = await mount();
    editor.update(() => $getRoot().selectEnd());
    editor.dispatchCommand(DRAG_DROP_PASTE, [
      new File(["%PDF"], "minutes.pdf", { type: "application/pdf" }),
    ]);
    await settle();
    expect(card().textContent).toContain("minutes.pdf");
    expect(screen.getByRole("progressbar", { name: "Uploading minutes.pdf" })).toBeDefined();
    uploads.finish();
    await waitFor(() => expect(dataOf(editor).src).toBe("https://cdn.example.com/v2/minutes.pdf"));
    expect(document.querySelector('[data-slot="editor-file-status"]')).toBeNull();
    expect(documentToMarkdown(editor.getEditorState().toJSON())).toContain(
      'href="https://cdn.example.com/v2/minutes.pdf"',
    );
  });

  test("a new version takes the file's place, the first file kept as its origin through every version", async () => {
    const [editor, uploads] = await mount({ ...REPORT, fileId: "first", src: undefined });
    picked = [new File(["%PDF-2"], "report-v2.pdf", { type: "application/pdf" })];
    await user.click(screen.getByRole("button", { name: "Upload a new version" }));
    await settle();
    uploads.finish();
    await waitFor(() =>
      expect(dataOf(editor).src).toBe("https://cdn.example.com/v2/report-v2.pdf"),
    );
    expect(dataOf(editor)).toMatchObject({ name: "report-v2.pdf", origin: "first" });
    expect(dataOf(editor).fileId).toBeUndefined();
    // Again from the block's menu: the origin is still the first file.
    editor.update(() => {
      const node = $getRoot().getChildren().find(FileBlock.$is);
      const selection = $createNodeSelection();
      if (node !== undefined) selection.add(node.getKey());
      $setSelection(selection);
    });
    await settle();
    picked = [new File(["%PDF-3"], "report-v3.pdf", { type: "application/pdf" })];
    await user.click(screen.getByRole("button", { name: "Block actions" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Upload a new version" }));
    await settle();
    uploads.finish();
    await waitFor(() => expect(dataOf(editor).name).toBe("report-v3.pdf"));
    await waitFor(() => expect(dataOf(editor).uploadId).toBeUndefined());
    expect(dataOf(editor).origin).toBe("first");
  });

  test("a PDF shows its pages when its menu says so; a file of another kind is offered no such choice", async () => {
    const [editor] = await mount(REPORT);
    editor.update(() => {
      const node = $getRoot().getChildren().find(FileBlock.$is);
      const selection = $createNodeSelection();
      if (node !== undefined) selection.add(node.getKey());
      $setSelection(selection);
    });
    await settle();
    await user.click(screen.getByRole("button", { name: "Block actions" }));
    await settle();
    await user.click(screen.getByRole("menuitemradio", { name: "A card and its pages" }));
    await settle();
    expect(dataOf(editor).display).toBe("preview");
    const pages = card().querySelector('[data-slot="editor-file-pages"]');
    expect(pages?.getAttribute("type")).toBe("application/pdf");
    expect(pages?.getAttribute("data")).toBe(REPORT.src);
    cleanup();
    const [other] = await mount(ARCHIVE);
    other.update(() => {
      const node = $getRoot().getChildren().find(FileBlock.$is);
      const selection = $createNodeSelection();
      if (node !== undefined) selection.add(node.getKey());
      $setSelection(selection);
    });
    await settle();
    await user.click(screen.getByRole("button", { name: "Block actions" }));
    await settle();
    expect(screen.queryByRole("menuitemradio", { name: "A card and its pages" })).toBeNull();
  });

  test("its caption is written in a popover from the card", async () => {
    const [editor] = await mount(REPORT);
    await user.click(screen.getByRole("button", { name: "Caption" }));
    await settle();
    await user.type(screen.getByRole("textbox", { name: "Caption" }), "Signed copy");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await settle();
    expect(dataOf(editor).caption).toBe("Signed copy");
    expect(card().querySelector('[data-slot="editor-file-caption"]')?.textContent).toBe(
      "Signed copy",
    );
  });
});

describe("a file as read", () => {
  test("a PDF opens in the viewer with its download and link; a file no browser shows downloads", async () => {
    render(() => <RichTextRenderer value={stored(REPORT)} />);
    const open = screen.getByRole("button", { name: "Open report.pdf (PDF · 48.2 kB)" });
    expect(open.getAttribute("aria-haspopup")).toBe("dialog");
    open.click();

    await settle();
    const dialog = await screen.findByRole("dialog", { name: "report.pdf" });
    const viewer = within(dialog);
    expect(dialog.querySelector('iframe[title="report.pdf"]')?.getAttribute("src")).toBe(
      REPORT.src,
    );
    expect(viewer.getByRole("link", { name: "Download report.pdf" }).getAttribute("download")).toBe(
      "report.pdf",
    );
    expect(viewer.getByRole("button", { name: "Copy link" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
    render(() => <RichTextRenderer value={stored(ARCHIVE)} />);
    const download = screen.getAllByRole("link", { name: "Download photos.zip (ZIP · 2.4 MB)" });
    expect(download[0]?.getAttribute("href")).toBe(ARCHIVE.src);
  });

  test("in Arabic the size is in the reader's digits and the name keeps its own direction", () => {
    render(() => (
      <Arabic>
        <RichTextRenderer value={stored({ ...REPORT, name: "تقرير.pdf" })} />
      </Arabic>
    ));
    expect(card().textContent).toContain("٤٨٫٢");
    expect(card().querySelector("bdi")?.textContent).toBe("تقرير.pdf");
    expect(fileMeta(REPORT, "ar-EG")).toContain("PDF");
  });

  test("a file's kind is read from its name, then its type", () => {
    expect(fileFamily("notes.docx", "")).toBe("document");
    expect(fileFamily("data", "text/csv")).toBe("text");
    expect(fileFamily("clip", "video/mp4")).toBe("video");
    expect(fileFamily("thing.bin", "application/octet-stream")).toBe("other");
  });

  test("a document an app stored, keeping the file by its id, opens unchanged", () => {
    function Page() {
      provideEditorMedia({ fileUrl: (id) => `https://files.example.com/${id}` });
      return (
        <RichTextRenderer
          value={stored({
            fileId: "f-7",
            name: "plan.pdf",
            mime: "application/pdf",
            bytes: 1200,
            display: "preview",
            origin: "f-1",
          })}
        />
      );
    }
    render(() => <Page />);
    expect(document.querySelector('[data-slot="editor-file-download"]')?.getAttribute("href")).toBe(
      "https://files.example.com/f-7",
    );
    expect(document.querySelector('[data-slot="editor-file-pages"]')?.getAttribute("data")).toBe(
      "https://files.example.com/f-7",
    );
  });
});

describe("a file written and read", () => {
  test("markdown keeps it as one link line of HTML, every field kept, and reads it back", () => {
    const full: FileData = { ...REPORT, caption: "Signed", display: "preview", origin: "f-1" };
    const line = fileHtml(full);
    const read = markdownToDocument(line);
    expect(read.root.children[0]).toMatchObject({ type: "file", ...full });
    expect(documentToMarkdown(read)).toBe(line);
  });

  test("HTML from elsewhere addresses kept files by a scheme: a picture and a file come in by their ids", () => {
    const state = htmlToDocument(
      `<p>Rivers flood. <img src="acme-file:pic-1" alt="A flood"></p>
       <p><a href="acme-file:doc-2" data-name="data.csv" data-mime="text/csv" data-bytes="12">data.csv</a></p>
       <p><a href="https://example.com">An ordinary link</a></p>`,
      { extensions: [storedFilesExtension({ scheme: "acme-file:" })] },
    );
    const children = state.root.children;
    expect(children.map((node) => node.type)).toEqual(["paragraph", "image", "file", "paragraph"]);
    expect(children[1]).toMatchObject({ fileId: "pic-1", alt: "A flood" });
    expect(children[2]).toMatchObject({
      fileId: "doc-2",
      name: "data.csv",
      mime: "text/csv",
      bytes: 12,
    });
  });

  test("class and classes reach every file card, in the renderer", () => {
    render(() => (
      <RichTextRenderer
        value={stored(REPORT)}
        extensions={[fileExtension({ class: "acme-file", classes: { name: "acme-name" } })]}
      />
    ));
    expect(card().classList.contains("acme-file")).toBe(true);
    expect(card().querySelector(".acme-name")?.textContent).toBe("report.pdf");
  });
});

describe("files on the server", () => {
  const MARKDOWN = [fileHtml({ ...REPORT, display: "preview" }), fileHtml(ARCHIVE)].join("\n\n");

  test("the renderer draws each card and the page hydrates with every node kept", async () => {
    const result = await hydrates(`
      import { RichTextRenderer } from ${entry};
      export function Page() {
        return <RichTextRenderer markdown={${JSON.stringify(MARKDOWN)}} />;
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="editor-file"]')).toHaveLength(2);
    expect(result.container.querySelector("object")?.getAttribute("data")).toBe(REPORT.src);
    result.unmount();
  });

  test("the editor takes over the cards the server drew", async () => {
    const page = await hydratesFromServer(
      "BlockEditor",
      `<BlockEditor label="Page" defaultMarkdown={${JSON.stringify(MARKDOWN)}} />`,
    );
    const root = document.querySelector('[data-slot="rich-text-editor-content"]')!;
    await waitFor(() => expect(root.querySelectorAll('[data-slot="editor-file"]')).toHaveLength(2));
    expect(root.hasAttribute("data-lexical-editor")).toBe(true);
    page.dispose();
  });
});
