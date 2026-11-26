import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, cleanup, render, screen, user } from "@barqjs/testing";
import { $generateHtmlFromNodes } from "@lexical/html";
import {
  $getRoot,
  $isElementNode,
  DELETE_CHARACTER_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  type LexicalEditor,
} from "lexical";

import { hydrates } from "../test-arc.ts";
import { BlockEditor } from "./block-editor.tsx";
import {
  createDocumentEditor,
  documentToMarkdown,
  htmlToDocument,
  markdownToDocument,
} from "./document.ts";
import { $isPanelsNode, panelsExtension } from "./panels.tsx";
import { PanelsView } from "./panels-view.tsx";
import { RichTextRenderer } from "./renderer.tsx";
import { capture, hydratesFromServer, keydown, settle, typeText } from "./test-editor.ts";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const entry = JSON.stringify(new URL("./index.ts", import.meta.url).pathname);

function set(layout: string, entries: readonly (readonly [string, string])[]): string {
  return [
    `<section data-panels="${layout}">`,
    ...entries.flatMap(([title, body]) => [`<header>${title}</header>`, "", body, ""]),
    "</section>",
  ].join("\n");
}

const LEAF_ROOT = [
  ["Leaf", "Makes food from light."],
  ["Root", "Takes in water."],
  ["Stem", "Holds the plant up."],
] as const;

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

/** Each part's words, its title and its body's lines joined by `|`. */
function partsOf(editor: LexicalEditor): string[] | null {
  return editor.read(() => {
    const panels = $getRoot().getChildren().find($isPanelsNode);
    return panels === undefined
      ? null
      : panels.getChildren().map((panel) => panel.getTextContent().replaceAll(/\n+/g, "|"));
  });
}

async function mount(markdown = ""): Promise<LexicalEditor> {
  const editor = capture();
  render(() => <BlockEditor label="Page" defaultMarkdown={markdown} onEditor={editor.set} />);
  await settle();
  editor.get().update(() => $getRoot().selectEnd());
  await settle();
  return editor.get();
}

async function enter(editor: LexicalEditor): Promise<void> {
  editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
  await settle();
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("panels in the editor", () => {
  test("/tabs puts two empty parts in at the top level, the caret in the first title, named for what it is", async () => {
    const editor = await mount();
    await typeText(editor, "/tabs");
    keydown(content(), "Enter");
    await settle();
    expect(kinds(editor)).toEqual(["panels", "paragraph"]);
    const drawn = content().querySelector<HTMLElement>('[data-slot="panels"]')!;
    expect(drawn.dataset.layout).toBe("tabs");
    expect(drawn.querySelectorAll('[data-slot="panel"]')).toHaveLength(2);
    const title = drawn.querySelector<HTMLElement>('[data-slot="panel-title"]')!;
    expect(title.dataset.placeholder).toBe("Tab name");
    await typeText(editor, "Leaf");
    expect(partsOf(editor)).toEqual(["Leaf|", "|"]);
  });

  test("a set chosen inside another set's part goes after it, at the top level", async () => {
    const editor = await mount(set("steps", [["Mix", "Flour"]]));
    editor.update(() => {
      const panels = $getRoot().getFirstChild();
      if ($isPanelsNode(panels)) panels.getLastDescendant()?.selectEnd();
    });
    await settle();
    await enter(editor);
    await typeText(editor, "/timeline");
    keydown(content(), "Enter");
    await settle();
    expect(kinds(editor).filter((one) => one === "panels")).toHaveLength(2);
    expect(content().querySelectorAll('[data-slot="panels"] [data-slot="panels"]')).toHaveLength(0);
  });

  test("Enter: title to body, empty last line to the next part, empty last title out of the set", async () => {
    const editor = await mount("Fractions");
    await typeText(editor, " /flip cards");
    keydown(content(), "Enter");
    await settle();
    expect(kinds(editor)).toEqual(["paragraph", "panels", "paragraph"]);
    await typeText(editor, "Half");
    await enter(editor);
    await typeText(editor, "One of two equal parts.");
    await enter(editor);
    await enter(editor);
    await typeText(editor, "Quarter");
    expect(partsOf(editor)).toEqual(["Half|One of two equal parts.", "Quarter|"]);
    // With no part waiting, an empty last line starts one; Enter on its
    // empty title leaves the set, the empty part gone.
    await enter(editor);
    await enter(editor);
    expect(partsOf(editor)).toEqual(["Half|One of two equal parts.", "Quarter|", "|"]);
    await enter(editor);
    expect(partsOf(editor)).toEqual(["Half|One of two equal parts.", "Quarter|"]);
    expect(
      editor.read(() =>
        $getRoot()
          .getChildren()
          .findIndex((one) => $isPanelsNode(one)),
      ),
    ).toBe(1);
  });

  test("a set holds at most twelve parts: Enter on the last one's empty line stays in its body", async () => {
    const twelve = Array.from(
      { length: 12 },
      (_, index) => [`Part ${String(index + 1)}`, "Words"] as const,
    );
    const editor = await mount(set("steps", twelve));
    editor.update(() => {
      const panels = $getRoot().getFirstChild();
      if ($isPanelsNode(panels)) panels.getLastDescendant()?.selectEnd();
    });
    await enter(editor);
    await enter(editor);
    expect(partsOf(editor)).toHaveLength(12);
    expect(content().querySelectorAll('[data-slot="panel"]')).toHaveLength(12);
  });

  test("Backspace at a title's start: an empty part goes; the first title of a set of one takes it apart", async () => {
    const editor = await mount(set("tabs", [["Leaf", "Green"]]));
    editor.update(() => {
      const panels = $getRoot().getFirstChild();
      if ($isPanelsNode(panels)) panels.getLastDescendant()?.selectEnd();
    });
    await enter(editor);
    await enter(editor);
    expect(partsOf(editor)).toEqual(["Leaf|Green", "|"]);
    editor.dispatchCommand(DELETE_CHARACTER_COMMAND, true);
    await settle();
    expect(partsOf(editor)).toEqual(["Leaf|Green"]);
    editor.update(() => {
      const panels = $getRoot().getFirstChild();
      const panel = $isPanelsNode(panels) ? panels.getFirstChild() : null;
      if ($isElementNode(panel)) panel.getFirstChild()?.selectStart();
    });
    editor.dispatchCommand(DELETE_CHARACTER_COMMAND, true);
    await settle();
    expect(partsOf(editor)).toBeNull();
    expect(documentToMarkdown(editor.getEditorState().toJSON())).toBe("Leaf\n\nGreen");
  });

  test("the block menu shows the set another way, every word kept, and adds a part", async () => {
    const editor = await mount(set("tabs", LEAF_ROOT));
    editor.update(() => {
      const panels = $getRoot().getFirstChild();
      if ($isPanelsNode(panels)) panels.getFirstDescendant()?.selectEnd();
    });
    await settle();
    await user.click(screen.getByRole("button", { name: "Block actions" }));
    await settle();
    await user.click(screen.getByRole("menuitemradio", { name: "Steps" }));
    await settle();
    const drawn = content().querySelector<HTMLElement>('[data-slot="panels"]')!;
    expect(drawn.dataset.layout).toBe("steps");
    expect(partsOf(editor)).toEqual([
      "Leaf|Makes food from light.",
      "Root|Takes in water.",
      "Stem|Holds the plant up.",
    ]);
    await user.click(screen.getByRole("button", { name: "Block actions" }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: "Add a step" }));
    await settle();
    expect(partsOf(editor)).toHaveLength(4);
    const titles = content().querySelectorAll<HTMLElement>('[data-slot="panel-title"]');
    expect(titles[3]?.dataset.placeholder).toBe("Step");
    expect(documentToMarkdown(editor.getEditorState().toJSON())).toContain(
      '<section data-panels="steps">',
    );
  });

  test("each layout's title says what it is for", async () => {
    const expected = {
      tabs: "Tab name",
      steps: "Step",
      timeline: "Date or event",
      cards: "Front of the card",
      choices: "A choice the reader can make",
    };
    for (const [layout, words] of Object.entries(expected)) {
      await mount(set(layout, [["", "Body"]]));
      const title = content().querySelector<HTMLElement>('[data-slot="panel-title"]');
      expect(title?.dataset.placeholder).toBe(words);
      cleanup();
    }
  });

  test("an Arabic set numbers its steps in Arabic digits and keeps its titles' direction", async () => {
    const editor = capture();
    render(() => (
      <Arabic>
        <BlockEditor
          label="صفحة"
          defaultMarkdown={set("steps", [["اخلط", "الدقيق"]])}
          onEditor={editor.set}
        />
      </Arabic>
    ));
    await settle();
    const panel = content().querySelector<HTMLElement>('[data-slot="panel"]')!;
    expect(panel.closest('[dir="rtl"]')).not.toBeNull();
    expect(content().querySelector('[data-slot="panel-title"]')?.textContent).toBe("اخلط");
  });
});

describe("panels written and read", () => {
  test("markdown keeps a set as a section of headed parts and reads it back the same", () => {
    const markdown = set("timeline", [
      ["**1969**", "The first *landing*."],
      ["1972", "- The last\n- of six"],
    ]);
    const stored = markdownToDocument(markdown);
    expect(stored.root.children[0]).toMatchObject({ type: "panels", layout: "timeline" });
    expect(documentToMarkdown(stored)).toBe(markdown);
  });

  test("HTML keeps a set as a section of parts, and a section of headers reads as one", () => {
    const editor = createDocumentEditor();
    editor.update(
      () => {
        $getRoot().clear();
      },
      { discrete: true },
    );
    editor.setEditorState(editor.parseEditorState(markdownToDocument(set("cards", LEAF_ROOT))));
    const html = editor.read(() => $generateHtmlFromNodes(editor));
    editor.dispose();
    expect(html).toContain('<section data-panels="cards">');
    expect(html).toContain("<header");
    const back = htmlToDocument(html);
    expect(documentToMarkdown(back)).toBe(set("cards", LEAF_ROOT));
    const flat = htmlToDocument(
      '<section data-panels="choices"><header>Left</header><p>A dark wood.</p><header>Right</header><p>A river.</p></section>',
    );
    expect(documentToMarkdown(flat)).toBe(
      set("choices", [
        ["Left", "A dark wood."],
        ["Right", "A river."],
      ]),
    );
  });

  test("a stray part, title or body outside a set comes apart into lines", () => {
    const stored = {
      root: {
        type: "root",
        version: 1,
        direction: null,
        format: "",
        indent: 0,
        children: [
          {
            type: "panel",
            version: 1,
            children: [
              {
                type: "panel-title",
                version: 1,
                children: [{ type: "text", version: 1, text: "Lost" }],
              },
              {
                type: "panel-body",
                version: 1,
                children: [
                  {
                    type: "paragraph",
                    version: 1,
                    children: [{ type: "text", version: 1, text: "Words" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const editor = createDocumentEditor();
    editor.setEditorState(editor.parseEditorState(JSON.stringify(stored)));
    editor.update(() => $getRoot().markDirty(), { discrete: true });
    editor.update(() => $getRoot().getFirstChild()?.markDirty(), { discrete: true });
    expect(kinds(editor)).toEqual(["paragraph", "paragraph"]);
    expect(editor.read(() => $getRoot().getTextContent())).toBe("Lost\n\nWords");
    editor.dispose();
  });
});

describe("panels as read", () => {
  test("tabs: one panel shows, the first chosen; a press or the arrows choose another", async () => {
    render(() => <RichTextRenderer markdown={set("tabs", LEAF_ROOT)} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((one) => one.textContent)).toEqual(["Leaf", "Root", "Stem"]);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    const visible = screen.getAllByRole("tabpanel").filter((one) => !one.hidden);
    expect(visible.map((one) => one.textContent)).toEqual(["Makes food from light."]);
    // Every panel stays in the page, hidden, for the page's find and a printed copy.
    expect(document.body.textContent).toContain("Takes in water.");
    await user.click(tabs[1]!);
    await settle();
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    tabs[1]?.focus();
    await user.keyboard("{ArrowRight}");
    await settle();
    expect(document.activeElement).toBe(tabs[2]!);
    expect(tabs[2]?.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{Home}");
    await settle();
    expect(document.activeElement).toBe(tabs[0]!);
    user.tap(tabs[2]!);
    await settle();
    expect(tabs[2]?.getAttribute("aria-selected")).toBe("true");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("tabs in Arabic: the left arrow goes on to the next tab", async () => {
    render(() => (
      <Arabic>
        <RichTextRenderer
          markdown={set("tabs", [
            ["ورقة", "خضراء"],
            ["جذر", "يشرب"],
          ])}
        />
      </Arabic>
    ));
    const tabs = screen.getAllByRole("tab");
    tabs[0]?.focus();
    await user.keyboard("{ArrowLeft}");
    await settle();
    expect(document.activeElement).toBe(tabs[1]!);
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
  });

  test("steps are an ordered list, each numbered in the reader's digits; a timeline marks each event", async () => {
    render(() => (
      <Arabic>
        <RichTextRenderer
          markdown={set("steps", [
            ["اخلط", "الدقيق"],
            ["اخبز", "أربعين دقيقة"],
          ])}
        />
      </Arabic>
    ));
    const steps = document.querySelector<HTMLElement>('[data-slot="panels"][data-layout="steps"]')!;
    expect(steps.querySelector("ol")?.children).toHaveLength(2);
    const markers = [...steps.querySelectorAll('[data-slot="timeline-marker"]')].map(
      (one) => one.textContent,
    );
    expect(markers).toEqual(["١", "٢"]);
    expect(steps.querySelector('[data-slot="panels-title"]')?.getAttribute("dir")).toBe("auto");
    expect(await ariaViolations(document.body)).toEqual([]);
    cleanup();
    render(() => <RichTextRenderer markdown={set("timeline", LEAF_ROOT)} />);
    const timeline = document.querySelector('[data-slot="panels"][data-layout="timeline"]')!;
    expect(timeline.querySelectorAll('[data-slot="timeline-dot"]')).toHaveLength(3);
  });

  test("cards: the front is one button holding the title; turning moves focus to the side that shows", async () => {
    render(() => <RichTextRenderer markdown={set("cards", LEAF_ROOT)} />);
    const fronts = screen.getAllByRole("button", { name: /Turn over/ });
    expect(fronts).toHaveLength(3);
    expect(fronts[0]?.textContent).toContain("Leaf");
    expect(fronts[0]?.textContent).not.toContain("Makes food");
    await user.click(fronts[0]!);
    await settle();
    const back = document.querySelectorAll<HTMLElement>('[data-slot="panels-card-back"]')[0]!;
    expect(back.hidden).toBe(false);
    expect(fronts[0]?.hidden).toBe(true);
    expect(document.activeElement).toBe(back);
    await user.click(screen.getByRole("button", { name: "Turn back" }));
    await settle();
    expect(document.activeElement).toBe(fronts[0]!);
    fronts[1]?.focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(
      document.querySelectorAll<HTMLElement>('[data-slot="panels-card-back"]')[1]?.hidden,
    ).toBe(false);
    user.tap(fronts[2]!);
    await settle();
    expect(
      document.querySelectorAll<HTMLElement>('[data-slot="panels-card-back"]')[2]?.hidden,
    ).toBe(false);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("choices: choosing shows only that path, focus on it; choosing again goes back to the choices", async () => {
    render(() => <RichTextRenderer markdown={set("choices", LEAF_ROOT)} />);
    function shown(words: string): boolean {
      return screen.getByText(words).closest("[hidden]") === null;
    }
    expect(shown("Makes food from light.")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Leaf" }));
    await settle();
    expect(shown("Makes food from light.")).toBe(true);
    expect(shown("Takes in water.")).toBe(false);
    expect(document.querySelector<HTMLElement>('[data-slot="panels-choices"]')?.hidden).toBe(true);
    const region = screen.getByRole("region", { name: "What happens next" });
    expect(document.activeElement).toBe(region);
    expect(await ariaViolations(document.body)).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Choose again" }));
    await settle();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Leaf" }));
    user.tap(screen.getByRole("button", { name: "Stem" }));
    await settle();
    expect(shown("Holds the plant up.")).toBe(true);
  });

  test("class, classes, data-slot and renders reach every set the renderer draws", () => {
    render(() => (
      <RichTextRenderer
        markdown={set("steps", LEAF_ROOT)}
        extensions={[
          panelsExtension({
            class: "acme-panels",
            classes: { title: "acme-title" },
            renders: { title: (part, title) => <h3 {...part.props}>{title}</h3> },
          }),
        ]}
      />
    ));
    const root = document.querySelector('[data-slot="panels"]')!;
    expect(root.classList.contains("acme-panels")).toBe(true);
    const heading = root.querySelector("h3")!;
    expect(heading.getAttribute("data-slot")).toBe("panels-title");
    expect(heading.classList.contains("acme-title")).toBe(true);
    expect(heading.textContent).toBe("Leaf");
  });

  test("PanelsView draws an app's own parts", async () => {
    render(() => (
      <PanelsView
        layout="cards"
        items={[{ id: "a", title: () => "Front", body: () => <p>Back</p> }]}
      />
    ));
    await user.click(screen.getByRole("button", { name: /Front/ }));
    await settle();
    expect(screen.getByText("Back")).toBeDefined();
  });
});

describe("panels on the server", () => {
  const MARKDOWN = ["tabs", "steps", "timeline", "cards", "choices"]
    .map((layout) => set(layout, LEAF_ROOT))
    .join("\n\n");

  test("the renderer draws every layout and the page hydrates with every node kept", async () => {
    const result = await hydrates(`
      import { RichTextRenderer } from ${entry};
      export function Page() {
        return <RichTextRenderer markdown={${JSON.stringify(MARKDOWN)}} />;
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="panels"]')).toHaveLength(5);
    expect(result.container.querySelectorAll('[role="tab"]')).toHaveLength(3);
    result.unmount();
  });

  test("the editor takes over the sets the server drew", async () => {
    const page = await hydratesFromServer(
      "BlockEditor",
      `<BlockEditor label="Page" defaultMarkdown={${JSON.stringify(MARKDOWN)}} />`,
    );
    expect(content().querySelectorAll('[data-slot="panels"]')).toHaveLength(5);
    expect(content().querySelector('[data-slot="panel-title"]')?.textContent).toBe("Leaf");
    expect(content().hasAttribute("data-lexical-editor")).toBe(true);
    page.dispose();
  });
});
