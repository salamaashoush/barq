import { variants } from "@barqjs/css";
import { announce } from "@barqjs/aria/live";
import { ListCollapse } from "@barqjs/lucide/icons/list-collapse";
import { tokens } from "@barqjs/ui/theme/tokens";
import { $isListNode } from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  type MultilineElementTransformer,
  type Transformer,
} from "@lexical/markdown";
import { $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  type DOMConversionMap,
  type DOMExportOutput,
  type EditorConfig,
  ElementNode,
  INSERT_PARAGRAPH_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type LexicalUpdateJSON,
  type NodeKey,
  type RangeSelection,
  type SerializedElementNode,
  type Spread,
  isHTMLElement,
  mergeRegister,
} from "lexical";

import { arcLayer as arc } from "../layer.ts";
import { focus, interaction, rounded, space, type } from "../style/index.ts";
import {
  type Drawn,
  DrawnElement,
  $fillEmpty,
  $placeContainer,
  $unwrapInto,
  buildDrawn,
  registerContainerKeys,
} from "./containers.tsx";
import { defineEditorExtension, editorMessages } from "./extension.ts";
import { blockGap } from "./theme.ts";

/** The room at a title's start the disclosure arrow takes, and a press on it opens or closes. */
const MARKER = "1.5em";

export const toggleStyles = variants({
  slots: {
    root: arc(blockGap, {
      "& > :last-child > :last-child": { marginBlockEnd: "0px" },
    }),
    title: arc(type.medium, {
      paddingInlineStart: MARKER,
      marginBlockEnd: space.x1,
      listStyle: "none",
      cursor: "pointer",
      "&::-webkit-details-marker": { display: "none" },
      // A chevron drawn pointing to the right, in the room the title keeps at
      // its start, which a right-to-left title mirrors.
      "&::before": {
        content: '""',
        display: "inline-block",
        width: "0.45em",
        height: "0.45em",
        marginInlineStart: `calc(${MARKER} * -1 + 0.2em)`,
        marginInlineEnd: "0.85em",
        verticalAlign: "0.15em",
        borderRight: `2px solid ${tokens.mutedForeground}`,
        borderBottom: `2px solid ${tokens.mutedForeground}`,
        rotate: "-45deg",
      },
      ":dir(rtl)&::before": { scale: "-1 1" },
      "[data-open=true] > &::before, details[open] > &::before": { rotate: "45deg" },
    }),
    content: arc({ paddingInlineStart: MARKER }),
    summary: arc(focus.visible, interaction.pressable, rounded.sm),
  },
});

export function drawToggle(open: boolean, themeClass?: unknown): Drawn {
  const own = toggleStyles().root;
  return {
    tag: "div",
    attributes: {
      class: typeof themeClass === "string" && themeClass !== "" ? arc(own, themeClass) : own,
      "data-slot": "toggle",
      "data-open": String(open),
    },
  };
}

export function drawToggleTitle(themeClass?: unknown): Drawn {
  const own = toggleStyles().title;
  return {
    tag: "div",
    attributes: {
      class: typeof themeClass === "string" && themeClass !== "" ? arc(own, themeClass) : own,
      "data-slot": "toggle-title",
    },
  };
}

export function drawToggleContent(open: boolean, themeClass?: unknown): Drawn {
  const own = toggleStyles().content;
  return {
    tag: "div",
    attributes: {
      class: typeof themeClass === "string" && themeClass !== "" ? arc(own, themeClass) : own,
      "data-slot": "toggle-content",
      ...(open ? {} : { hidden: "" }),
    },
  };
}

export type SerializedToggleNode = Spread<{ open: boolean }, SerializedElementNode>;

/** A title that opens and closes the blocks under it. */
export class ToggleNode extends ElementNode {
  __open: boolean;

  constructor(open = true, key?: NodeKey) {
    super(key);
    this.__open = open;
  }

  $config() {
    return this.config("toggle", { extends: ElementNode });
  }

  static clone(node: ToggleNode): ToggleNode {
    return new ToggleNode(node.__open, node.__key);
  }

  static importJSON(json: SerializedToggleNode): ToggleNode {
    return new ToggleNode().updateFromJSON(json);
  }

  /** HTML's `<details>`, its `<summary>` the title and the rest the content. */
  static importDOM(): DOMConversionMap {
    return {
      details: (element: HTMLElement) => ({
        conversion: () => ({
          node: new ToggleNode(element.hasAttribute("open")),
          after: (children) => {
            const title =
              children.find((child): child is ToggleTitleNode => $isToggleTitleNode(child)) ??
              $createToggleTitleNode();
            const content = $createToggleContentNode();
            let line: ElementNode | null = null;
            for (const child of children) {
              if (child === title) continue;
              if ($isElementNode(child) && !child.isInline()) {
                content.append(child);
                line = null;
              } else {
                if (line === null) {
                  line = $createParagraphNode();
                  content.append(line);
                }
                line.append(child);
              }
            }
            return [title, content];
          },
        }),
        priority: 1,
      }),
    };
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedToggleNode>): this {
    return super.updateFromJSON(json).setOpen(json.open ?? true);
  }

  exportJSON(): SerializedToggleNode {
    return { ...super.exportJSON(), open: this.getOpen() };
  }

  exportDOM(): DOMExportOutput {
    return {
      element: buildDrawn({ tag: "details", attributes: this.getOpen() ? { open: "" } : {} }),
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    return buildDrawn(drawToggle(this.__open, config.theme.toggle));
  }

  updateDOM(previous: this, dom: HTMLElement): boolean {
    if (previous.__open !== this.__open) {
      dom.dataset.open = String(this.__open);
      const content = dom.querySelector(':scope > [data-slot="toggle-content"]');
      if (isHTMLElement(content)) content.hidden = !this.__open;
    }
    return false;
  }

  isShadowRoot(): boolean {
    return true;
  }

  canBeEmpty(): boolean {
    return false;
  }

  /** Backspace at its start takes the toggle away: the title becomes a line, the content stays. */
  collapseAtStart(): boolean {
    const nodes: LexicalNode[] = [];
    const [title, content] = this.getChildren();
    if ($isElementNode(title)) nodes.push($createParagraphNode().append(...title.getChildren()));
    if ($isElementNode(content)) nodes.push(...content.getChildren());
    for (const node of nodes) this.insertBefore(node);
    this.remove();
    nodes[0]?.selectStart();
    return true;
  }

  getOpen(): boolean {
    return this.getLatest().__open;
  }

  setOpen(open: boolean): this {
    const writable = this.getWritable();
    writable.__open = open;
    return writable;
  }

  toggleOpen(): this {
    return this.setOpen(!this.getOpen());
  }
}

/** A toggle's title: the line that stays in view, a press at its start opening or closing it. */
export class ToggleTitleNode extends ElementNode {
  $config() {
    return this.config("toggle-title", { extends: ElementNode });
  }

  static importDOM(): DOMConversionMap {
    return {
      summary: () => ({ conversion: () => ({ node: new ToggleTitleNode() }), priority: 1 }),
    };
  }

  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = buildDrawn(drawToggleTitle(config.theme.toggleTitle));
    dom.addEventListener("click", (event) => {
      const box = dom.getBoundingClientRect();
      const rtl = getComputedStyle(dom).direction === "rtl";
      const from = rtl ? box.right - event.clientX : event.clientX - box.left;
      if (from > dom.offsetHeight * 1.2 && from > 24) return;
      event.preventDefault();
      const key = this.getKey();
      editor.update(() => {
        const toggle = $getNodeByKey(key)?.getParent();
        if ($isToggleNode(toggle)) $flip(toggle, editor);
      });
    });
    return dom;
  }

  updateDOM(): boolean {
    return false;
  }

  /** Enter in an open toggle's title goes into its content; in a closed one, to a line after it. */
  insertNewAfter(_: RangeSelection, restoreSelection = true): ElementNode {
    const toggle = this.getParent();
    if (!$isToggleNode(toggle)) return $createParagraphNode();
    if (toggle.getOpen()) {
      const content = this.getNextSibling();
      const first = $isElementNode(content) ? content.getFirstChild() : null;
      if ($isElementNode(first)) return first;
      const line = $createParagraphNode();
      if ($isElementNode(content)) content.append(line);
      return line;
    }
    const line = $createParagraphNode();
    toggle.insertAfter(line, restoreSelection);
    return line;
  }

  collapseAtStart(): boolean {
    const toggle = this.getParent();
    return $isToggleNode(toggle) ? toggle.collapseAtStart() : false;
  }
}

/** A toggle's content: the blocks it shows while open. */
export class ToggleContentNode extends ElementNode {
  $config() {
    return this.config("toggle-content", { extends: ElementNode });
  }

  createDOM(config: EditorConfig): HTMLElement {
    const parent = this.getParent();
    return buildDrawn(
      drawToggleContent(!$isToggleNode(parent) || parent.getOpen(), config.theme.toggleContent),
    );
  }

  updateDOM(): boolean {
    return false;
  }

  isShadowRoot(): boolean {
    return true;
  }

  canBeEmpty(): boolean {
    return false;
  }
}

export function $createToggleNode(open = true): ToggleNode {
  return new ToggleNode(open);
}

export function $createToggleTitleNode(): ToggleTitleNode {
  return new ToggleTitleNode();
}

export function $createToggleContentNode(): ToggleContentNode {
  return new ToggleContentNode();
}

export function $isToggleNode(node: LexicalNode | null | undefined): node is ToggleNode {
  return node instanceof ToggleNode;
}

export function $isToggleTitleNode(node: LexicalNode | null | undefined): node is ToggleTitleNode {
  return node instanceof ToggleTitleNode;
}

export function $isToggleContentNode(
  node: LexicalNode | null | undefined,
): node is ToggleContentNode {
  return node instanceof ToggleContentNode;
}

/** Opens or closes a toggle, said to a screen reader since the editor's text has no button to say it. */
function $flip(toggle: ToggleNode, editor: LexicalEditor): void {
  toggle.toggleOpen();
  const open = toggle.getOpen();
  const words = editorMessages(editor);
  queueMicrotask(() => announce(open ? words.toggleExpanded : words.toggleCollapsed, "polite"));
}

/** The toggle whose title holds the caret. */
function $toggleAtCaret(): ToggleNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  let node: LexicalNode | null = selection.anchor.getNode();
  while (node !== null && !$isToggleTitleNode(node)) node = node.getParent();
  const toggle = node?.getParent() ?? null;
  return $isToggleNode(toggle) ? toggle : null;
}

/** Enter in a closed toggle's title opens it on the way into its content. */
function $enterFromTitle(): boolean {
  const toggle = $toggleAtCaret();
  if (toggle === null) return false;
  if (!toggle.getOpen()) toggle.setOpen(true);
  const content = toggle.getChildAtIndex(1);
  if ($isElementNode(content)) {
    const first = content.getFirstChild();
    if ($isElementNode(first)) first.selectStart();
    else content.append($createParagraphNode()).selectStart();
  }
  return true;
}

function wrapsInToggle(block: ElementNode): boolean {
  return $isParagraphNode(block) || $isHeadingNode(block) || $isQuoteNode(block);
}

/** Puts a toggle where the caret is; on a line of words, the line becomes its title. */
export function $insertToggle(): ToggleNode {
  const toggle = $createToggleNode(true);
  const selection = $getSelection();
  const block = $isRangeSelection(selection)
    ? selection.anchor.getNode().getTopLevelElement()
    : null;
  const title = $createToggleTitleNode();
  const content = $createToggleContentNode().append($createParagraphNode());
  if (block !== null && wrapsInToggle(block) && !block.isEmpty() && !$isListNode(block)) {
    title.append(...block.getChildren());
    block.replace(toggle);
    toggle.append(title, content);
    if (toggle.getNextSibling() === null) toggle.insertAfter($createParagraphNode());
    title.selectEnd();
    return toggle;
  }
  $placeContainer(toggle, { fill: () => [title, content] });
  title.selectStart();
  return toggle;
}

const TOGGLE_START = /^<details(\s+open)?>\s*$/;

/**
 * A toggle as the HTML markdown keeps as it is: `<details>`, a `<summary>`
 * line, the content's markdown, `</details>`; read back the same way.
 */
function toggleMarkdown(all: () => readonly Transformer[]): MultilineElementTransformer {
  return {
    type: "multiline-element",
    dependencies: [ToggleNode, ToggleTitleNode, ToggleContentNode],
    regExpStart: TOGGLE_START,
    export: (node, traverseChildren) => {
      if (!$isToggleNode(node)) return null;
      const [title, content] = node.getChildren();
      const summary = $isElementNode(title) ? traverseChildren(title) : "";
      const body = $isElementNode(content) ? $convertToMarkdownString([...all()], content) : "";
      return [
        node.getOpen() ? "<details open>" : "<details>",
        `<summary>${summary}</summary>`,
        "",
        body,
        "",
        "</details>",
      ].join("\n");
    },
    handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex, startMatch }) => {
      const end = lines.findIndex(
        (line, index) => index > startLineIndex && /^<\/details>\s*$/.test(line),
      );
      if (end === -1) return null;
      const inside = lines.slice(startLineIndex + 1, end);
      const summaryAt = inside.findIndex((line) => /^<summary>.*<\/summary>\s*$/.test(line));
      const summary =
        summaryAt === -1
          ? ""
          : (/^<summary>(.*)<\/summary>/.exec(inside[summaryAt] ?? "")?.[1] ?? "");
      const body = inside
        .filter((_, index) => index !== summaryAt)
        .join("\n")
        .trim();
      const toggle = $createToggleNode(startMatch[1] !== undefined);
      const title = $createToggleTitleNode();
      const content = $createToggleContentNode();
      toggle.append(title, content);
      rootNode.append(toggle);
      if (summary !== "") {
        const holder = $createParagraphNode();
        $convertFromMarkdownString(summary, [...all()], holder);
        const line = holder.getFirstChild();
        title.append(...($isElementNode(line) ? line.getChildren() : [$createTextNode(summary)]));
      }
      $convertFromMarkdownString(body, [...all()], content);
      $fillEmpty(content);
      return [true, end];
    },
    replace: () => false,
  };
}

/**
 * Toggles: a title that opens and closes the blocks under it, open or closed
 * as it was saved. A press on the arrow at the title's start, or Mod+Enter
 * in the title, opens and closes it; Enter in the title goes into its
 * content, opening it; Backspace at its start unwraps it. The renderer draws
 * it as `<details>`, which opens with nothing to load.
 */
export const toggleExtension = defineEditorExtension({
  name: "arc/toggle",
  nodes: [ToggleNode, ToggleTitleNode, ToggleContentNode],
  register: (editor) =>
    mergeRegister(
      editor.registerNodeTransform(ToggleContentNode, (node) => {
        if (!$isToggleNode(node.getParent())) $unwrapInto(node);
        else $fillEmpty(node);
      }),
      editor.registerNodeTransform(ToggleTitleNode, (node) => {
        if (!$isToggleNode(node.getParent())) {
          node.replace($createParagraphNode().append(...node.getChildren()));
        }
      }),
      editor.registerNodeTransform(ToggleNode, (node) => {
        const [title, content, ...rest] = node.getChildren();
        if (rest.length > 0 || !$isToggleTitleNode(title) || !$isToggleContentNode(content)) {
          $unwrapInto(node);
        }
      }),
      editor.registerCommand(INSERT_PARAGRAPH_COMMAND, $enterFromTitle, COMMAND_PRIORITY_LOW),
      registerContainerKeys(editor, {
        isContainer: $isToggleNode,
        exitsOnEmptyLine: $isToggleContentNode,
        outer: (content) => content.getParent() ?? content,
      }),
    ),
  keys: [
    {
      keys: "Mod+Enter",
      run: (editor) => {
        const toggle = $toggleAtCaret();
        if (toggle === null) return false;
        $flip(toggle, editor);
        return true;
      },
    },
  ],
  commands: [
    {
      id: "toggle",
      label: (messages) => messages.toggle,
      group: (messages) => messages.layoutBlocks,
      icon: () => <ListCollapse />,
      keywords: ["details", "collapse", "expand", "disclosure", "accordion"],
      run: (editor) => editor.update(() => void $insertToggle()),
    },
  ],
  markdown: (all) => [toggleMarkdown(all)],
  markdownPriority: 10,
  render: {
    toggle: (node, scope) => {
      const [title, content] = node.children ?? [];
      const open = node.open !== false;
      if (scope.editing) {
        return (
          <DrawnElement drawn={drawToggle(open)}>
            <DrawnElement drawn={drawToggleTitle()}>
              {title === undefined ? null : scope.children(title)}
            </DrawnElement>
            <DrawnElement drawn={drawToggleContent(open)}>
              {content === undefined ? null : scope.children(content)}
            </DrawnElement>
          </DrawnElement>
        );
      }
      const own = toggleStyles();
      return (
        <details class={own.root} data-slot="toggle" open={open}>
          <summary class={arc(own.title, own.summary)} data-slot="toggle-title" dir="auto">
            {title === undefined ? null : scope.children(title)}
          </summary>
          <div class={own.content} data-slot="toggle-content">
            {content === undefined ? null : scope.children(content)}
          </div>
        </details>
      );
    },
  },
});
