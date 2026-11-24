import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { cleanup, render, screen, user, waitFor, within } from "@barqjs/testing";
import { DRAG_DROP_PASTE } from "@lexical/rich-text";
import { $getRoot } from "lexical";

import { documentToMarkdown } from "./document.ts";
import { resolveEmbed } from "./media.tsx";
import { RichTextEditor } from "./rich-text-editor.tsx";
import { capture, settle, typeText } from "./test-editor.ts";

afterEach(() => {
  cleanup();
  destroyAnnouncer();
  document.body.innerHTML = "";
});

function content(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="rich-text-editor-content"]')!;
}

describe("tables", () => {
  test("a table from the Insert menu, its rows and columns changed from the cell's corner", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" onEditor={editor.set} />);
    await settle();
    await user.click(screen.getByRole("button", { name: "Insert" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Table" }));
    await settle();
    await user.click(screen.getByRole("button", { name: "3 by 3 table" }));
    await settle();
    expect(content().querySelectorAll("tr")).toHaveLength(3);
    expect(content().querySelector("tr")?.querySelectorAll("th")).toHaveLength(3);
    editor.get().update(() => {
      const table = $getRoot()
        .getChildren()
        .find((one) => one.getType() === "table");
      table?.selectStart();
    });
    await settle();
    const corner = screen.getByRole("button", { name: "Table actions" });
    await user.click(corner);
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Insert row below" }));
    await settle();
    expect(content().querySelectorAll("tr")).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: "Table actions" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Delete column" }));
    await settle();
    expect(content().querySelector("tr")?.children).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Table actions" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Delete table" }));
    await settle();
    expect(content().querySelector("table")).toBeNull();
  });
});

describe("images", () => {
  beforeAll(() => {
    URL.createObjectURL = () => "blob:preview";
    URL.revokeObjectURL = () => undefined;
  });
  afterAll(() => {
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  test("a pasted picture shows at once with its progress, and takes its URL once it is up", async () => {
    const editor = capture();
    let finish: () => void = () => {};
    render(() => (
      <RichTextEditor
        label="Notes"
        onEditor={editor.set}
        upload={(file: File, { onProgress }) =>
          new Promise<string>((resolve) => {
            onProgress(0.5);
            finish = () => resolve(`https://cdn.example.com/${file.name}`);
          })
        }
      />
    ));
    await settle();
    await typeText(editor.get(), "Before");
    editor
      .get()
      .dispatchCommand(DRAG_DROP_PASTE, [new File(["x"], "chart.png", { type: "image/png" })]);
    await settle();
    const image = document.querySelector('[data-slot="editor-image"]');
    expect(image?.querySelector("img")?.getAttribute("src")).toBe("blob:preview");
    expect(image?.querySelector("img")?.getAttribute("alt")).toBe("chart");
    expect(screen.getByRole("progressbar", { name: "Uploading chart.png" })).toBeDefined();
    finish();
    await waitFor(() =>
      expect(document.querySelector('[data-slot="editor-image"] img')?.getAttribute("src")).toBe(
        "https://cdn.example.com/chart.png",
      ),
    );
    expect(document.querySelector('[data-slot="editor-image-status"]')).toBeNull();
    expect(documentToMarkdown(editor.get().getEditorState().toJSON())).toContain(
      "![chart](https://cdn.example.com/chart.png)",
    );
  });

  test("an upload that takes nothing is called when a picture goes up, and not before", async () => {
    const editor = capture();
    let calls = 0;
    render(() => (
      <RichTextEditor
        label="Notes"
        onEditor={editor.set}
        upload={() => {
          calls++;
          return new Promise<string>(() => {});
        }}
      />
    ));
    await settle();
    await typeText(editor.get(), "Before");
    await user.click(screen.getByRole("button", { name: "Insert" }));
    await settle();
    expect(screen.getByRole("menuitem", { name: "Image" })).toBeDefined();
    await user.keyboard("{Escape}");
    await settle();
    expect(calls).toBe(0);
    editor
      .get()
      .dispatchCommand(DRAG_DROP_PASTE, [new File(["x"], "chart.png", { type: "image/png" })]);
    await settle();
    expect(calls).toBe(1);
  });

  test("an editor with no upload offers no image, and leaves pasted files alone", async () => {
    render(() => <RichTextEditor label="Notes" />);
    await settle();
    await user.click(screen.getByRole("button", { name: "Insert" }));
    await settle();
    expect(screen.queryByRole("menuitem", { name: "Image" })).toBeNull();
  });
});

describe("embeds", () => {
  test("a video site's address becomes its player, and anything else is refused", () => {
    expect(resolveEmbed("https://youtu.be/dQw4w9WgXcQ")?.src).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(resolveEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.title).toBe("YouTube");
    expect(resolveEmbed("https://vimeo.com/76979871")?.src).toBe(
      "https://player.vimeo.com/video/76979871",
    );
    expect(resolveEmbed("https://example.com/page")).toBeNull();
    expect(resolveEmbed("javascript:alert(1)")).toBeNull();
  });

  test("the embed dialog inserts a framed player, titled, and says when it cannot", async () => {
    const editor = capture();
    render(() => <RichTextEditor label="Notes" onEditor={editor.set} />);
    await settle();
    await user.click(screen.getByRole("button", { name: "Insert" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Embed" }));
    await settle();
    const field = screen.getByRole("textbox", { name: "Address to embed" });
    await user.type(field, "https://example.com/x");
    const dialog = within(screen.getByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Insert" }));
    await settle();
    expect(screen.getByText("That address cannot be embedded")).toBeDefined();
    await user.clear(field);
    await user.type(field, "https://vimeo.com/76979871");
    await user.click(dialog.getByRole("button", { name: "Insert" }));
    await settle();
    const frame = await waitFor(() => {
      const found = document.querySelector('[data-slot="editor-embed"] iframe');
      if (found === null) throw new Error("no frame yet");
      return found;
    });
    expect(frame.getAttribute("title")).toBe("Vimeo");
    expect(frame.getAttribute("src")).toBe("https://player.vimeo.com/video/76979871");
  });
});

describe("the toolbar on a narrow screen", () => {
  const original = HTMLElement.prototype.getBoundingClientRect;
  beforeAll(() => {
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const width =
        this.dataset.slot === "editor-toolbar"
          ? 200
          : this.dataset.slot === "editor-toolbar-group"
            ? 70
            : this.dataset.slot === "editor-toolbar-more"
              ? 30
              : 0;
      return {
        top: 0,
        left: 0,
        bottom: 30,
        right: width,
        width,
        height: 30,
        x: 0,
        y: 0,
      } as DOMRect;
    };
  });
  afterAll(() => {
    HTMLElement.prototype.getBoundingClientRect = original;
  });

  test("folds the groups that do not fit into More, keeping the marks and the text style", async () => {
    render(() => <RichTextEditor label="Notes" />);
    await settle();
    await settle();
    const groups = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="editor-toolbar-group"]'),
    ];
    expect(groups.map((one) => one.dataset.tool)).toEqual(["textStyle", "marks"]);
    await user.click(screen.getByRole("button", { name: "More options" }));
    await settle();
    expect(screen.getByRole("menuitem", { name: "Undo" })).toBeDefined();
    expect(screen.getByRole("menuitemcheckbox", { name: "Bulleted list" })).toBeDefined();
  });
});
