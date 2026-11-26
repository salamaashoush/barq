import { afterEach, describe, expect, test } from "bun:test";
import { ariaViolations, cleanup, render, screen, user } from "@barqjs/testing";
import { $generateHtmlFromNodes } from "@lexical/html";
import { $getRoot, type LexicalEditor, type SerializedEditorState } from "lexical";

import { hydrates } from "../test-arc.ts";
import { BlockEditor } from "./block-editor.tsx";
import {
  createDocumentEditor,
  documentToMarkdown,
  htmlToDocument,
  markdownToDocument,
} from "./document.ts";
import { RichTextRenderer } from "./renderer.tsx";
import {
  $isSharedBlockNode,
  $sharableBlock,
  type SharedBlockSource,
  type SharedBlockViewProps,
  sharedBlockExtension,
} from "./shared-block.tsx";
import { capture, hydratesFromServer, keydown, settle, typeText } from "./test-editor.ts";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const entry = JSON.stringify(new URL("./index.ts", import.meta.url).pathname);

const KEPT = '<div data-shared-block="kept-1"></div>';

function content(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="rich-text-editor-content"]')!;
}

function kinds(editor: LexicalEditor): string[] {
  return editor.read(() =>
    $getRoot()
      .getChildren()
      .map((one) => one.getType()),
  );
}

function Kept(props: SharedBlockViewProps) {
  return <p data-kept={props.id}>Opening hours: nine to five.</p>;
}

interface Recorded {
  kept: SerializedEditorState[];
  edited: string[];
}

function source(recorded: Recorded, chosen: string | null = "kept-2"): SharedBlockSource {
  return {
    View: Kept,
    choose: () => Promise.resolve(chosen),
    keep: (block) => {
      recorded.kept.push(block);
      return Promise.resolve("kept-3");
    },
    edit: (id) => {
      recorded.edited.push(id);
    },
    read: () => Promise.resolve(markdownToDocument("Copied **here**.\n\nAnd a second line.")),
  };
}

async function mount(markdown: string, extension = sharedBlockExtension()): Promise<LexicalEditor> {
  const editor = capture();
  render(() => (
    <BlockEditor
      label="Page"
      defaultMarkdown={markdown}
      extensions={[extension]}
      onEditor={editor.set}
    />
  ));
  await settle();
  return editor.get();
}

describe("a shared block stored", () => {
  test("is held by which one it is and comes back the same, in JSON, markdown and HTML", () => {
    const stored = markdownToDocument(`Before.\n\n${KEPT}`);
    expect(stored.root.children[1]).toMatchObject({ type: "shared", sharedId: "kept-1" });
    expect(documentToMarkdown(stored)).toBe(`Before.\n\n${KEPT}`);
    const editor = createDocumentEditor();
    editor.setEditorState(editor.parseEditorState(stored));
    expect(editor.getEditorState().toJSON()).toEqual(stored);
    const html = editor.read(() => $generateHtmlFromNodes(editor));
    editor.dispose();
    expect(html).toContain('data-shared-block="kept-1"');
    expect(htmlToDocument(html).root.children[1]).toMatchObject({
      type: "shared",
      sharedId: "kept-1",
    });
  });

  test("a document saved elsewhere, with no format on the node, opens unchanged", () => {
    const editor = createDocumentEditor();
    editor.setEditorState(
      editor.parseEditorState(
        JSON.stringify({
          root: {
            type: "root",
            version: 1,
            direction: null,
            format: "",
            indent: 0,
            children: [{ type: "shared", version: 1, sharedId: "kept-9" }],
          },
        }),
      ),
    );
    expect(editor.read(() => $isSharedBlockNode($getRoot().getFirstChild()))).toBe(true);
    expect(editor.getEditorState().toJSON().root.children[0]).toMatchObject({
      type: "shared",
      sharedId: "kept-9",
    });
    editor.dispose();
  });
});

describe("a shared block read", () => {
  test("draws as it now is through the source's View, with no violations", async () => {
    const recorded: Recorded = { kept: [], edited: [] };
    render(() => (
      <RichTextRenderer
        markdown={`Before.\n\n${KEPT}`}
        extensions={[sharedBlockExtension({ source: source(recorded), class: "acme-shared" })]}
      />
    ));
    const drawn = document.querySelector<HTMLElement>('[data-slot="shared-block"]')!;
    expect(drawn.dataset.sharedId).toBe("kept-1");
    expect(drawn.classList.contains("acme-shared")).toBe(true);
    expect(drawn.querySelector("[data-kept]")?.textContent).toBe("Opening hours: nine to five.");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("without a source the document still reads, the shared block left out", () => {
    render(() => <RichTextRenderer markdown={`Before.\n\n${KEPT}`} />);
    expect(document.querySelector('[data-slot="shared-block"]')).toBeNull();
    expect(document.querySelector('[data-slot="rich-text"]')?.textContent).toBe("Before.");
  });
});

describe("a shared block in the editor", () => {
  test("is named as one and drawn; Edit everywhere asks the source, by keyboard or touch", async () => {
    const recorded: Recorded = { kept: [], edited: [] };
    await mount(`Before.\n\n${KEPT}`, sharedBlockExtension({ source: source(recorded) }));
    const frame = content().querySelector<HTMLElement>('[data-slot="shared-block"]')!;
    expect(frame.textContent).toContain("Shared block");
    expect(frame.querySelector("[data-kept]")).not.toBeNull();
    const edit = screen.getByRole("button", { name: "Edit everywhere" });
    await user.click(edit);
    edit.focus();
    await user.keyboard("{Enter}");
    user.tap(edit);
    expect(recorded.edited).toEqual(["kept-1", "kept-1", "kept-1"]);
  });

  test("Copy here puts the shared block's content in its place, to change apart", async () => {
    const recorded: Recorded = { kept: [], edited: [] };
    const editor = await mount(
      `Before.\n\n${KEPT}`,
      sharedBlockExtension({ source: source(recorded) }),
    );
    await user.click(screen.getByRole("button", { name: "Copy here" }));
    await settle();
    expect(kinds(editor).slice(0, 3)).toEqual(["paragraph", "paragraph", "paragraph"]);
    expect(documentToMarkdown(editor.getEditorState().toJSON())).toBe(
      "Before.\n\nCopied **here**.\n\nAnd a second line.",
    );
  });

  test("/shared block shows the one the source chooses where the caret was", async () => {
    const recorded: Recorded = { kept: [], edited: [] };
    const editor = await mount("Before.", sharedBlockExtension({ source: source(recorded) }));
    editor.update(() => $getRoot().selectEnd());
    await settle();
    await typeText(editor, " /shared block");
    keydown(content(), "Enter");
    await settle(10);
    expect(kinds(editor)).toEqual(["paragraph", "shared", "paragraph"]);
    expect(
      editor.read(() => {
        const node = $getRoot().getChildAtIndex(1);
        return $isSharedBlockNode(node) ? node.getSharedId() : null;
      }),
    ).toBe("kept-2");
  });

  test("the block menu keeps a top-level block as a shared block and shows it in its place", async () => {
    const recorded: Recorded = { kept: [], edited: [] };
    const editor = await mount(
      `Our opening hours.\n\n${KEPT}`,
      sharedBlockExtension({ source: source(recorded) }),
    );
    editor.update(() => $getRoot().getFirstChild()?.selectEnd());
    await settle();
    await user.click(screen.getByRole("button", { name: "Block actions" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Keep as a shared block" }));
    await settle(10);
    expect(recorded.kept).toHaveLength(1);
    expect(documentToMarkdown(recorded.kept[0]!)).toBe("Our opening hours.");
    // The caret goes on below the block it was in, which is now kept.
    expect(kinds(editor).slice(0, 3)).toEqual(["shared", "paragraph", "shared"]);
    // A shared block is never kept inside another.
    const offered = editor.read(() =>
      $getRoot()
        .getChildren()
        .map((one) => $sharableBlock(one, source(recorded))),
    );
    expect(offered.slice(0, 3)).toEqual([false, true, false]);
  });

  test("without a source the editor offers neither the command nor the actions", async () => {
    const editor = await mount(`Before.\n\n${KEPT}`);
    expect(content().querySelector('[data-slot="shared-block"]')?.textContent).toBe("Shared block");
    expect(screen.queryByRole("button", { name: "Edit everywhere" })).toBeNull();
    editor.update(() => $getRoot().selectEnd());
    await typeText(editor, "/shared block");
    expect(document.querySelector('[role="option"]')?.textContent ?? "").not.toContain(
      "Shared block",
    );
  });
});

describe("a shared block on the server", () => {
  test("the renderer draws it through the source's View and the page hydrates", async () => {
    const result = await hydrates(`
      import { RichTextRenderer, sharedBlockExtension } from ${entry};
      function Kept(props) {
        return <p data-kept={props.id}>Opening hours: nine to five.</p>;
      }
      const shared = sharedBlockExtension({
        source: {
          View: Kept,
          choose: async () => null,
          keep: async () => null,
          edit: () => undefined,
          read: async () => null,
        },
      });
      export function Page() {
        return <RichTextRenderer markdown={${JSON.stringify(`Before.\n\n${KEPT}`)}} extensions={[shared]} />;
      }
    `);
    expect(result.container.querySelector("[data-kept]")?.textContent).toBe(
      "Opening hours: nine to five.",
    );
    result.unmount();
  });

  test("the editor takes over the shared block the server drew", async () => {
    const page = await hydratesFromServer(
      "BlockEditor",
      `<BlockEditor label="Page" defaultMarkdown={${JSON.stringify(`Before.\n\n${KEPT}`)}} />`,
    );
    expect(content().querySelector('[data-slot="shared-block"]')).not.toBeNull();
    expect(content().hasAttribute("data-lexical-editor")).toBe(true);
    page.dispose();
  });
});
