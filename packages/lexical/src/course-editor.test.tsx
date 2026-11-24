/**
 * The binding against the shape a course editor on `@lexical/react` has: one
 * root extension handed to the composer, the editable root rendered by the
 * application inside its own frame, block decorators that render components
 * with state, `useLexicalEditable` and node selection inside those
 * components, a menu anchored to a node, and the same extensions used without
 * a screen, as a server does.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { render } from "@barqjs/web";
import { buildEditorFromExtensions } from "@lexical/extension";
import { HistoryExtension } from "@lexical/history";
import { RichTextExtension } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  type LexicalEditor,
  type NodeKey,
  UNDO_COMMAND,
  configExtension,
  defineExtension,
} from "lexical";

import { $createCardNode, $isCardNode, CardNode, lifecycle } from "./fixtures/card-node.tsx";
import {
  BarqExtension,
  BarqPluginHostExtension,
  ContentEditable,
  LexicalComposer,
  LexicalNodeMenuPlugin,
  MenuOption,
  mountBarqPluginComponent,
  mountBarqPluginHost,
  useLexicalEditor,
  useLexicalEditorState,
  useLexicalIsTextContentEmpty,
} from "./index.ts";
import { host, key, settle } from "./test-helpers.ts";

const cleanups: Array<() => void> = [];
beforeEach(() => {
  lifecycle.built = 0;
  lifecycle.disposed = 0;
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = "";
});

const STORED = JSON.stringify({
  root: {
    type: "root",
    version: 1,
    direction: null,
    format: "",
    indent: 0,
    children: [
      {
        type: "paragraph",
        version: 1,
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        children: [
          {
            type: "text",
            version: 1,
            text: "Lesson one",
            format: 0,
            style: "",
            mode: "normal",
            detail: 0,
          },
        ],
      },
      { type: "card", version: 1, format: "center", title: "Photosynthesis" },
    ],
  },
});

function courseExtension(errors: Error[] = []) {
  return defineExtension({
    name: "course/editor",
    namespace: "course-content",
    nodes: [CardNode],
    $initialEditorState: STORED,
    onError: (error: Error) => {
      errors.push(error);
    },
    dependencies: [RichTextExtension, configExtension(HistoryExtension, { maxDepth: 50 })],
  });
}

interface Mounted {
  editor: LexicalEditor;
  element: HTMLElement;
  root: HTMLElement;
  errors: Error[];
  cardKey: () => NodeKey;
}

function Status() {
  const editor = useLexicalEditor();
  const empty = useLexicalIsTextContentEmpty(editor, true);
  const blocks = useLexicalEditorState(() => $getRoot().getChildrenSize());
  return (
    <p class="status">
      {empty() ? "empty" : "written"}:{blocks()}
    </p>
  );
}

async function mountCourse(children?: () => unknown): Promise<Mounted> {
  let editor!: LexicalEditor;
  const errors: Error[] = [];
  function Surface() {
    editor = useLexicalEditor();
    return (
      <div class="frame">
        <ContentEditable class="lesson" aria-label="Lesson" aria-multiline="true" />
        <Status />
        {children?.() as never}
      </div>
    );
  }
  const element = host();
  cleanups.push(
    render(
      () => (
        <LexicalComposer extensions={[courseExtension(errors)]} contentEditable={null}>
          <Surface />
        </LexicalComposer>
      ),
      element,
    ),
  );
  await settle();
  const root = element.querySelector<HTMLElement>(".lesson");
  if (root === null) throw new Error("no editable root");
  function cardKey(): NodeKey {
    return editor.getEditorState().read(() => {
      const card = $getRoot().getChildren().find($isCardNode);
      if (card === undefined) throw new Error("no card");
      return card.getKey();
    });
  }
  return { editor, element, root, errors, cardKey };
}

describe("a course editor", () => {
  test("the stored document opens with its card drawn by a barq component inside the node's element", async () => {
    const { root, element, editor } = await mountCourse();
    expect(root.querySelector("p")?.textContent).toBe("Lesson one");
    const block = root.querySelector<HTMLElement>("div[contenteditable='false']");
    expect(block).not.toBeNull();
    expect(block?.querySelector(".card-title")?.textContent).toBe("Photosynthesis");
    // The component reads the composer's context through the portal.
    expect(block?.querySelector(".namespace")?.textContent).toBe("course-content");
    expect(element.querySelector(".status")?.textContent).toBe("written:2");
    expect(lifecycle.built).toBe(1);
    expect(
      editor.getEditorState().read(() => $getRoot().getLastChild()?.exportJSON()),
    ).toMatchObject({
      type: "card",
      format: "center",
      title: "Photosynthesis",
    });
  });

  test("editing the node updates the component in place, keeping its state", async () => {
    const { root, editor, cardKey } = await mountCourse();
    const figure = root.querySelector<HTMLElement>("figure.card");
    const counter = root.querySelector<HTMLButtonElement>("button.count");
    counter?.click();
    counter?.click();
    flush();
    expect(counter?.textContent).toBe("2");

    editor.update(() => {
      const card = $getNodeByKey(cardKey());
      if ($isCardNode(card)) card.setTitle("Respiration");
    });
    await settle();
    expect(root.querySelector(".card-title")?.textContent).toBe("Respiration");
    expect(root.querySelector("figure.card")).toBe(figure);
    expect(root.querySelector("button.count")?.textContent).toBe("2");
    expect(lifecycle.built).toBe(1);
    expect(lifecycle.disposed).toBe(0);
  });

  test("removing the node disposes its component", async () => {
    const { root, editor, cardKey, element } = await mountCourse();
    editor.update(() => $getNodeByKey(cardKey())?.remove());
    await settle();
    expect(root.querySelector("figure.card")).toBeNull();
    expect(lifecycle.disposed).toBe(1);
    expect(element.querySelector(".status")?.textContent).toBe("written:1");
  });

  test("a card inserted later is drawn, and undo takes it away again", async () => {
    const { root, editor } = await mountCourse();
    editor.update(() => {
      $getRoot().append($createCardNode("Cells"));
    });
    await settle(5);
    expect([...root.querySelectorAll(".card-title")].map((title) => title.textContent)).toEqual([
      "Photosynthesis",
      "Cells",
    ]);
    expect(lifecycle.built).toBe(2);
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await settle();
    expect([...root.querySelectorAll(".card-title")].map((title) => title.textContent)).toEqual([
      "Photosynthesis",
    ]);
    expect(lifecycle.disposed).toBe(1);
  });

  test("a read-only editor tells its components, and its root stops being editable", async () => {
    const { root, editor } = await mountCourse();
    expect(root.querySelector(".mode")?.textContent).toBe("editing");
    editor.setEditable(false);
    await settle();
    expect(root.getAttribute("contenteditable")).toBe("false");
    expect(root.getAttribute("aria-readonly")).toBe("true");
    expect(root.getAttribute("role")).toBe("textbox");
    expect(root.querySelector(".mode")?.textContent).toBe("reading");
    editor.setEditable(true);
    await settle();
    expect(root.querySelector(".mode")?.textContent).toBe("editing");
  });

  test("a card selects itself as a node selection", async () => {
    const { root, editor, cardKey } = await mountCourse();
    root.querySelector<HTMLButtonElement>("button.select")?.click();
    await settle();
    expect(root.querySelector("figure.card")?.hasAttribute("data-selected")).toBe(true);
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      expect($isNodeSelection(selection) && selection.has(cardKey())).toBe(true);
    });
  });

  test("a component that throws is contained and reported to the editor's onError", async () => {
    const { root, editor, errors } = await mountCourse();
    editor.update(() => {
      $getRoot().append($createCardNode("explode"));
    });
    await settle();
    expect(root.querySelectorAll("figure.card").length).toBe(1);
    expect(root.textContent).toContain("An error was thrown.");
    expect(errors.map((error) => error.message)).toContain("the card could not be drawn");
  });

  test("a node menu opens against a card and Enter runs the highlighted action", async () => {
    const chosen: string[] = [];
    const [anchored, setAnchored] = createSignal<NodeKey | null>(null);
    const actions = [new MenuOption("duplicate"), new MenuOption("delete")];
    for (const action of actions) action.title = action.key;
    const { root, cardKey } = await mountCourse(() => (
      <LexicalNodeMenuPlugin<MenuOption>
        nodeKey={anchored()}
        options={actions}
        onSelectOption={(option, _node, closeMenu) => {
          chosen.push(option.key);
          closeMenu();
        }}
      />
    ));
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    setAnchored(cardKey());
    await settle();
    const options = [...document.querySelectorAll<HTMLElement>('[role="listbox"] [role="option"]')];
    expect(options.map((option) => option.textContent)).toEqual(["duplicate", "delete"]);
    root.focus();
    key(root, "ArrowDown");
    await settle();
    key(root, "Enter");
    await settle();
    expect(chosen).toEqual(["delete"]);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  test("the document reports empty once its text and blocks are gone", async () => {
    const { editor, element } = await mountCourse();
    editor.update(() => {
      $getRoot().clear().append($createParagraphNode());
    });
    await settle();
    expect(element.querySelector(".status")?.textContent).toBe("empty:1");
    editor.update(() => {
      $getRoot()
        .clear()
        .append($createParagraphNode().append($createTextNode("  ")));
    });
    await settle();
    expect(element.querySelector(".status")?.textContent).toBe("empty:1");
  });
});

interface BadgeProps {
  label: string;
}

describe("the same extensions without a composer", () => {
  test("a headless editor reads and writes stored content, decorators included, without calling decorate", () => {
    const editor = buildEditorFromExtensions(courseExtension());
    const json = editor.getEditorState().read(() =>
      $getRoot()
        .getChildren()
        .map((child) => child.exportJSON()),
    );
    expect(json).toMatchObject([
      { type: "paragraph" },
      { type: "card", title: "Photosynthesis", format: "center" },
    ]);
    expect(lifecycle.built).toBe(0);
    editor.dispose();
  });

  test("a barq plugin host renders UI and decorators for an editor built elsewhere", async () => {
    const editor = buildEditorFromExtensions(
      courseExtension(),
      BarqPluginHostExtension,
      configExtension(BarqExtension, { contentEditable: null }),
    );
    cleanups.push(() => editor.dispose());
    const frame = host();
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    frame.append(editable);
    const plugins = document.createElement("div");
    frame.append(plugins);
    editor.setRootElement(editable);
    mountBarqPluginHost(editor, plugins);
    function Badge(props: BadgeProps) {
      const words = useLexicalEditorState(
        () => $getRoot().getTextContent().split(/\s+/).filter(Boolean).length,
      );
      return (
        <b class="badge">
          {props.label}:{words()}
        </b>
      );
    }
    mountBarqPluginComponent(editor, { key: "badge", Component: Badge, props: { label: "words" } });
    await settle();
    expect(plugins.querySelector(".badge")?.textContent).toBe("words:2");
    expect(editable.querySelector(".card-title")?.textContent).toBe("Photosynthesis");
    mountBarqPluginComponent(editor, { key: "badge", Component: Badge, props: null });
    await settle();
    expect(plugins.querySelector(".badge")).toBeNull();
  });
});
