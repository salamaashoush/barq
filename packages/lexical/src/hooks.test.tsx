/**
 * The hooks that are not covered by the two application shapes: extension
 * signals as barq accessors, extension lookups, text entities, named slots
 * inside a decorator, and the accessibility refs over `@lexical/a11y`.
 */

import { afterEach, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { render } from "@barqjs/web";
import {
  AriaLiveRegionExtension,
  FocusManagerExtension,
  FocusTrapExtension,
  RovingTabIndexExtension,
} from "@lexical/a11y";
import { HistoryExtension } from "@lexical/history";
import { RichTextExtension } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $setSlot,
  ElementNode,
  type LexicalEditor,
  type NodeKey,
  TextNode,
  UNDO_COMMAND,
} from "lexical";

import { CardNode } from "./fixtures/card-node.tsx";
import {
  BarqExtension,
  type Decoration,
  type EditorComponentType,
  LexicalComposer,
  useExtensionComponent,
  useExtensionSignalValue,
  useLexicalAriaLiveRegion,
  useLexicalEditor,
  useLexicalFocusManagerRef,
  useLexicalFocusTrapRef,
  useLexicalRovingTabIndexRef,
  useLexicalSlotRef,
  useLexicalTextEntity,
  useOptionalExtensionDependency,
} from "./index.ts";
import { host, key, settle } from "./test-helpers.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = "";
});

class TagNode extends TextNode {
  static getType(): string {
    return "tag";
  }
  static clone(node: TagNode): TagNode {
    return new TagNode(node.__text, node.__key);
  }
  createDOM(config: Parameters<TextNode["createDOM"]>[0]): HTMLElement {
    const element = super.createDOM(config);
    element.className = "tag";
    return element;
  }
}

class CaptionNode extends ElementNode {
  $config() {
    return this.config("caption_slot", { extends: ElementNode });
  }
  createDOM(): HTMLElement {
    return document.createElement("div");
  }
  updateDOM(): false {
    return false;
  }
  isShadowRoot(): boolean {
    return true;
  }
}

function Figure(props: { nodeKey: NodeKey }) {
  const editor = useLexicalEditor();
  return (
    <figure class="figure">
      <figcaption class="caption" ref={useLexicalSlotRef(editor, props.nodeKey, "caption")} />
    </figure>
  );
}

class FigureNode extends CardNode {
  $config() {
    return this.config("figure", { extends: CardNode });
  }
  decorate(): Decoration<this> {
    return (node) => <Figure nodeKey={node().getKey()} />;
  }
}

async function mount(
  extensions: Parameters<typeof LexicalComposer>[0]["extensions"],
  children: () => unknown,
): Promise<{ editor: LexicalEditor; element: HTMLElement }> {
  let editor!: LexicalEditor;
  function Grab() {
    editor = useLexicalEditor();
    return children() as never;
  }
  const element = host();
  cleanups.push(
    render(
      () => (
        <LexicalComposer
          extensions={extensions}
          initialConfig={{
            nodes: [TagNode, CardNode, FigureNode, CaptionNode],
            onError: (error) => {
              throw error;
            },
          }}
        >
          <Grab />
        </LexicalComposer>
      ),
      element,
    ),
  );
  await settle();
  return { editor, element };
}

test("an extension's signal is a barq accessor, and an extension's component and presence can be looked up", async () => {
  let component: EditorComponentType | undefined;
  let hasRich = false;
  let hasA11y = true;
  const { editor, element } = await mount([RichTextExtension, HistoryExtension], () => {
    const canUndo = useExtensionSignalValue(HistoryExtension, "canUndo");
    component = useExtensionComponent(BarqExtension);
    hasRich = useOptionalExtensionDependency(RichTextExtension) !== undefined;
    hasA11y = useOptionalExtensionDependency(FocusTrapExtension) !== undefined;
    return <i class="undo">{canUndo() ? "can undo" : "nothing to undo"}</i>;
  });
  expect(typeof component).toBe("function");
  expect(hasRich).toBe(true);
  expect(hasA11y).toBe(false);
  expect(element.querySelector(".undo")?.textContent).toBe("nothing to undo");
  editor.update(() => {
    $getRoot()
      .clear()
      .append($createParagraphNode().append($createTextNode("edit")));
  });
  await settle(5);
  expect(element.querySelector(".undo")?.textContent).toBe("can undo");
  editor.dispatchCommand(UNDO_COMMAND, undefined);
  await settle();
  expect(element.querySelector(".undo")?.textContent).toBe("nothing to undo");
});

test("a text entity becomes its node as it is typed", async () => {
  const { editor, element } = await mount([RichTextExtension], () => {
    useLexicalTextEntity(
      (text) => {
        const match = /#\w+/.exec(text);
        return match === null ? null : { start: match.index, end: match.index + match[0].length };
      },
      TagNode,
      (node) => new TagNode(node.getTextContent()),
    );
    return null;
  });
  editor.update(() => {
    $getRoot()
      .clear()
      .append($createParagraphNode().append($createTextNode("ship #barq today")));
  });
  await settle();
  expect(element.querySelector(".tag")?.textContent).toBe("#barq");
});

test("a decorator draws its node's named slot where it puts the slot ref", async () => {
  const { editor, element } = await mount([RichTextExtension], () => null);
  editor.update(() => {
    const figure = new FigureNode("figure");
    $setSlot(
      figure,
      "caption",
      new CaptionNode().append($createParagraphNode().append($createTextNode("A leaf"))),
    );
    $getRoot().append(figure);
  });
  await settle();
  const caption = element.querySelector(".figure .caption");
  expect(caption?.querySelector('[data-lexical-slot="caption"]')?.textContent).toBe("A leaf");
});

test("the toolbar, roving and live-region hooks register with their extensions", async () => {
  let announce!: (message: string) => void;
  const { editor, element } = await mount(
    [RichTextExtension, FocusManagerExtension, RovingTabIndexExtension, AriaLiveRegionExtension],
    () => {
      announce = useLexicalAriaLiveRegion();
      const toolbar = useLexicalFocusManagerRef();
      const roving = useLexicalRovingTabIndexRef({ orientation: "horizontal" });
      return (
        <div
          class="toolbar"
          ref={(node: HTMLElement) => {
            const leave = toolbar(node);
            const stop = roving(node);
            return () => {
              leave();
              stop();
            };
          }}
        >
          <button type="button" class="first">
            B
          </button>
          <button type="button" class="second">
            I
          </button>
        </div>
      );
    },
  );
  const root = editor.getRootElement();
  if (root === null) throw new Error("no root");
  const first = element.querySelector<HTMLButtonElement>(".first");
  const second = element.querySelector<HTMLButtonElement>(".second");
  root.focus();
  key(root, "F10", { altKey: true });
  expect(document.activeElement).toBe(first);
  key(first as HTMLElement, "ArrowRight");
  expect(document.activeElement).toBe(second);
  key(second as HTMLElement, "Escape");
  expect(document.activeElement).toBe(root);

  announce("Saved");
  await settle();
  expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe("Saved");
});

test("a focus trap follows its accessor", async () => {
  const [open, setOpen] = createSignal(false);
  const { element } = await mount([RichTextExtension, FocusTrapExtension], () => {
    const trap = useLexicalFocusTrapRef(open);
    return (
      <div class="dialog" ref={trap}>
        <button type="button" class="one">
          1
        </button>
        <button type="button" class="two">
          2
        </button>
      </div>
    );
  });
  const one = element.querySelector<HTMLButtonElement>(".one");
  const two = element.querySelector<HTMLButtonElement>(".two");
  setOpen(true);
  flush();
  await settle();
  two?.focus();
  key(two as HTMLElement, "Tab");
  expect(document.activeElement).toBe(one);
});
