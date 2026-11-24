import { afterEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { type Child, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import {
  ariaViolations,
  cleanup,
  pointerDown,
  pointerMove,
  pointerUp,
  render,
  screen,
  user,
  waitFor,
} from "@barqjs/testing";
import { $getRoot, type LexicalEditor } from "lexical";

import { hydrates } from "../test-arc.ts";
import { BlockEditor } from "./block-editor.tsx";
import { defineBlock } from "./blocks.tsx";
import { documentToMarkdown } from "./document.ts";
import { capture, keydown, settle } from "./test-editor.ts";

const entry = JSON.stringify(fileURLToPath(new URL("./index.ts", import.meta.url)));

afterEach(() => {
  cleanup();
  destroyAnnouncer();
  document.body.innerHTML = "";
});

const DOC = "First\n\nSecond\n\nThird";

function blocks(editor: LexicalEditor): string[] {
  return editor.read(() =>
    $getRoot()
      .getChildren()
      .map((one) => one.getTextContent()),
  );
}

function content(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-slot="rich-text-editor-content"]')!;
}

async function caretIn(editor: LexicalEditor, index: number): Promise<void> {
  editor.update(() => $getRoot().getChildAtIndex(index)?.selectEnd());
  await settle();
}

async function mount(extra: Partial<Parameters<typeof BlockEditor>[0]> = {}) {
  const editor = capture();
  render(() => <BlockEditor label="Page" defaultMarkdown={DOC} onEditor={editor.set} {...extra} />);
  await settle();
  return editor.get();
}

/** Lays the blocks out 40px apart, which happy-dom does not. */
function layOut(editor: LexicalEditor): void {
  const keys = editor.read(() => $getRoot().getChildrenKeys());
  keys.forEach((key, index) => {
    const element = editor.getElementByKey(key);
    if (element === null) return;
    element.getBoundingClientRect = () =>
      ({
        top: index * 40,
        bottom: index * 40 + 30,
        height: 30,
        left: 0,
        right: 300,
        width: 300,
        x: 0,
        y: index * 40,
      }) as DOMRect;
  });
}

describe("BlockEditor", () => {
  test("puts an insert button and a grip beside the caret's block, each named", async () => {
    const editor = await mount();
    await caretIn(editor, 1);
    expect(screen.getByRole("button", { name: "Insert a block" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Block actions" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("Mod+Shift and the arrows move the caret's block, each move announced", async () => {
    const editor = await mount();
    await caretIn(editor, 0);
    keydown(content(), "ArrowDown", { ctrlKey: true, shiftKey: true });
    await settle();
    expect(blocks(editor)).toEqual(["Second", "First", "Third"]);
    await waitFor(() =>
      expect(
        [...document.querySelectorAll('[role="log"]')].map((one) => one.textContent).join(" "),
      ).toContain("Moved to 2 of 3"),
    );
    keydown(content(), "ArrowUp", { ctrlKey: true, shiftKey: true });
    await settle();
    expect(blocks(editor)).toEqual(["First", "Second", "Third"]);
  });

  test("the grip's menu duplicates, moves, turns into and deletes", async () => {
    const editor = await mount();
    await caretIn(editor, 0);
    const open = async (): Promise<void> => {
      await user.click(screen.getByRole("button", { name: "Block actions" }));
      await settle();
    };
    await open();
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    await settle();
    expect(blocks(editor)).toEqual(["First", "First", "Second", "Third"]);
    await open();
    await user.click(screen.getByRole("menuitemradio", { name: "Heading 1" }));
    await settle();
    expect(content().querySelector("h1")?.textContent).toBe("First");
    await caretIn(editor, 3);
    await open();
    expect(screen.getByRole("menuitem", { name: /Move down/ }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await settle();
    expect(blocks(editor)).toEqual(["First", "First", "Second"]);
  });

  test("the insert picker is searched and grouped, and puts its choice after the block", async () => {
    const editor = await mount();
    await caretIn(editor, 0);
    await user.click(screen.getByRole("button", { name: "Insert a block" }));
    await settle();
    expect(
      screen
        .getAllByRole("group")
        .map((one) => one.getAttribute("aria-label") ?? one.textContent?.slice(0, 5)),
    ).not.toHaveLength(0);
    await user.type(screen.getByPlaceholderText("Search blocks"), "quote");
    await settle();
    await user.keyboard("{Enter}");
    await settle();
    expect(blocks(editor)).toEqual(["First", "", "Second", "Third"]);
    expect(content().querySelector("blockquote")).not.toBeNull();
  });

  test("a grip dragged by a finger moves its block to where it is let go", async () => {
    const editor = await mount();
    layOut(editor);
    await caretIn(editor, 0);
    const grip = screen.getByRole("button", { name: "Block actions" });
    pointerDown(grip, { pointerType: "touch", clientY: 10 });
    pointerMove(grip, { pointerType: "touch", clientY: 95 });
    await settle();
    expect(document.querySelector('[data-slot="block-drop-indicator"]')).not.toBeNull();
    pointerUp(grip, { pointerType: "touch", clientY: 95 });
    await settle();
    expect(blocks(editor)).toEqual(["Second", "Third", "First"]);
    expect(document.querySelector('[data-slot="block-drop-indicator"]')).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("an app's block is offered, inserted, drawn by its component and edited through it", async () => {
    const Rating = defineBlock<{ stars: number }>({
      type: "acme-rating",
      label: "Rating",
      group: "Feedback",
      defaultData: () => ({ stars: 0 }),
      toMarkdown: (data) => `Rated ${String(data.stars)}`,
      component: (props) => (
        <button
          type="button"
          data-editable={String(props.editable)}
          onClick={() => props.setData({ stars: props.data.stars + 1 })}
        >
          {`${String(props.data.stars)} stars`}
        </button>
      ),
    });
    const editor = await mount({ blocks: [Rating] });
    await caretIn(editor, 2);
    await user.click(screen.getByRole("button", { name: "Insert a block" }));
    await settle();
    expect(screen.getByText("Feedback")).toBeDefined();
    await user.click(screen.getByRole("option", { name: "Rating" }));
    await settle();
    const block = await waitFor(() => screen.getByRole("button", { name: "0 stars" }));
    expect(block.getAttribute("data-editable")).toBe("true");
    await user.click(block);
    await settle();
    expect(screen.getByRole("button", { name: "1 stars" })).toBeDefined();
    expect(documentToMarkdown(editor.getEditorState().toJSON(), { blocks: [Rating] })).toContain(
      "Rated 1",
    );
  });

  test("the gutter sits at the start of the line, so it is on the right in Arabic", async () => {
    const editor = capture();
    function Arabic(props: { children: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <BlockEditor label="صفحة" defaultMarkdown={"أول\n\nثاني"} onEditor={editor.set} />
      </Arabic>
    ));
    await settle();
    await caretIn(editor.get(), 0);
    const gutter = document.querySelector<HTMLElement>('[data-slot="block-handle"]');
    expect(gutter?.className).toContain("inset-inline-start");
    expect(gutter?.className).not.toMatch(/(^|\s)a-left_/);
  });

  test("takes a class per part", async () => {
    const [, setValue] = createSignal(0);
    const editor = capture();
    render(() => (
      <BlockEditor
        label="Page"
        defaultMarkdown={DOC}
        onEditor={editor.set}
        onChange={() => setValue(1)}
        blockClasses={{ gutter: "g", handle: "h" }}
        classes={{ content: "c" }}
      />
    ));
    await settle();
    await caretIn(editor.get(), 0);
    expect(content().classList.contains("c")).toBe(true);
    expect(document.querySelector('[data-slot="block-handle"]')?.classList.contains("g")).toBe(
      true,
    );
    expect(document.querySelector('[data-slot="block-grip"]')?.classList.contains("h")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { BlockEditor } from ${entry};
      export function Page() {
        return <BlockEditor label="Page" placeholder="Type / for blocks" />;
      }
    `);
    expect(result.container.querySelector('[data-slot="rich-text-editor-content"]')).not.toBeNull();
    result.unmount();
  });
});
