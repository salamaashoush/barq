import { variants } from "@barqjs/css";
import { Footprints } from "@barqjs/lucide/icons/footprints";
import { GalleryHorizontalEnd } from "@barqjs/lucide/icons/gallery-horizontal-end";
import { History } from "@barqjs/lucide/icons/history";
import { PanelsTopLeft } from "@barqjs/lucide/icons/panels-top-left";
import { Split } from "@barqjs/lucide/icons/split";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  type MultilineElementTransformer,
  type Transformer,
} from "@lexical/markdown";
import { $findMatchingParent } from "@lexical/utils";
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  COMMAND_PRIORITY_LOW,
  type DOMConversionMap,
  type DOMExportOutput,
  type EditorConfig,
  ElementNode,
  INSERT_PARAGRAPH_COMMAND,
  type LexicalNode,
  type LexicalUpdateJSON,
  type NodeKey,
  type SerializedElementNode,
  type Spread,
  mergeRegister,
} from "lexical";

import type { Child } from "@barqjs/core";

import { arcLayer as arc } from "../layer.ts";
import { edge, layout as flow, place, rounded, space, type } from "../style/index.ts";
import {
  type Drawn,
  DrawnElement,
  $fillEmpty,
  $placeContainer,
  $unwrapInto,
  buildDrawn,
  registerContainerKeys,
} from "./containers.tsx";
import { type EditorExtension, type StoredNode, defineEditorExtension } from "./extension.ts";
import {
  MAX_PANELS,
  PANEL_LAYOUTS,
  type PanelItem,
  type PanelLayout,
  type PanelsLook,
  PanelsView,
  cardGrid,
  panelLayoutOf,
} from "./panels-view.tsx";
import { blockGap } from "./theme.ts";

/** A part framed as a box, its title ruled off above what it holds: a tab, a card, a choice. */
const framed = arc(edge.all, rounded.lg, place.padded);
const ruledTitle = arc(edge.bottom, { marginBlockEnd: space.x2, paddingBlockEnd: space.x1_5 });

/** Steps and events as list items, their numbers and dots in the room at their start. */
const listed = arc({ display: "list-item", marginInlineStart: space.x6 });

/** How a set draws in the editor, every part showing, framed as it will read. */
export const panelsStyles = variants({
  slots: {
    root: arc(blockGap, flow.minZero, { display: "grid", gap: space.x3 }),
    panel: arc(flow.relative, flow.minZero),
    title: arc(type.strong, { paddingBlock: space.x0_5 }),
    body: arc(flow.minZero, { "& > :last-child": { marginBlockEnd: "0px" } }),
  },
  variants: {
    layout: {
      tabs: { panel: framed, title: ruledTitle },
      steps: {
        root: arc({ counterReset: "list-item" }),
        panel: arc(listed, {
          listStyleType: "decimal",
          "&::marker": { fontWeight: "var(--font-weight-semibold)" },
          "&:lang(ar)": { listStyleType: "arabic-indic" },
        }),
      },
      timeline: {
        panel: arc(listed, edge.start, {
          listStyleType: "disc",
          borderInlineStartWidth: "2px",
          paddingInlineStart: space.x3,
        }),
      },
      cards: {
        root: cardGrid,
        panel: framed,
        title: arc(ruledTitle, { borderBlockEndStyle: "dashed", textAlign: "center" }),
      },
      choices: { panel: framed, title: ruledTitle },
    },
  },
  defaults: { layout: "tabs" },
});

function withTheme(own: string, themeClass: unknown): string {
  return typeof themeClass === "string" && themeClass !== "" ? arc(own, themeClass) : own;
}

export function drawPanels(layout: PanelLayout, themeClass?: unknown): Drawn {
  return {
    tag: "div",
    attributes: {
      class: withTheme(panelsStyles({ layout }).root, themeClass),
      "data-slot": "panels",
      "data-layout": layout,
    },
  };
}

export function drawPanel(layout: PanelLayout, themeClass?: unknown): Drawn {
  return {
    tag: "div",
    attributes: {
      class: withTheme(panelsStyles({ layout }).panel, themeClass),
      "data-slot": "panel",
    },
  };
}

export function drawPanelTitle(layout: PanelLayout, themeClass?: unknown): Drawn {
  return {
    tag: "div",
    attributes: {
      class: withTheme(panelsStyles({ layout }).title, themeClass),
      "data-slot": "panel-title",
    },
  };
}

export function drawPanelBody(layout: PanelLayout, themeClass?: unknown): Drawn {
  return {
    tag: "div",
    attributes: {
      class: withTheme(panelsStyles({ layout }).body, themeClass),
      "data-slot": "panel-body",
    },
  };
}

export type PanelsFields = {
  layout: PanelLayout;
};

export type SerializedPanelsNode = Spread<PanelsFields, SerializedElementNode>;

/** The layout of the set a part, a title or a body is in. */
function $layoutAbove(node: LexicalNode): PanelLayout {
  const panels = $findMatchingParent(node, $isPanelsNode);
  return $isPanelsNode(panels) ? panels.getLayout() : "tabs";
}

/**
 * A set of titled parts that reads as tabs, steps, a timeline, cards to
 * turn over or paths to choose between. The parts are stored one after
 * another whatever the layout, so changing it loses nothing.
 */
export class PanelsNode extends ElementNode {
  __layout: PanelLayout;

  constructor(layout: PanelLayout = "tabs", key?: NodeKey) {
    super(key);
    this.__layout = layout;
  }

  $config() {
    return this.config("panels", { extends: ElementNode });
  }

  static clone(node: PanelsNode): PanelsNode {
    return new PanelsNode(node.__layout, node.__key);
  }

  static importJSON(json: SerializedPanelsNode): PanelsNode {
    return new PanelsNode().updateFromJSON(json);
  }

  /** `<section data-panels>`, its parts as `<div data-panel>` or a `<header>` before each part's blocks. */
  static importDOM(): DOMConversionMap {
    return {
      section: (element: HTMLElement) =>
        element.hasAttribute("data-panels")
          ? {
              conversion: () => ({
                node: new PanelsNode(panelLayoutOf(element.getAttribute("data-panels"))),
                after: $groupParts,
              }),
              priority: 1,
            }
          : null,
    };
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedPanelsNode>): this {
    return super.updateFromJSON(json).setLayout(panelLayoutOf(json.layout));
  }

  exportJSON(): SerializedPanelsNode {
    return { ...super.exportJSON(), layout: this.getLayout() };
  }

  exportDOM(): DOMExportOutput {
    return {
      element: buildDrawn({ tag: "section", attributes: { "data-panels": this.getLayout() } }),
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    return buildDrawn(drawPanels(this.__layout, config.theme.panels));
  }

  /** Its parts draw in its layout, so a new layout draws them again. */
  updateDOM(previous: this): boolean {
    return previous.__layout !== this.__layout;
  }

  isShadowRoot(): boolean {
    return true;
  }

  canBeEmpty(): boolean {
    return false;
  }

  /** Takes the set apart into its titles, each a line, and its bodies' blocks. */
  collapseAtStart(): boolean {
    const held: LexicalNode[] = [];
    for (const panel of this.getChildren()) {
      if (!$isElementNode(panel)) continue;
      const [title, body] = panel.getChildren();
      if ($isElementNode(title) && !title.isEmpty()) {
        held.push($createParagraphNode().append(...title.getChildren()));
      }
      if ($isElementNode(body)) held.push(...body.getChildren());
    }
    if (held.length === 0) held.push($createParagraphNode());
    for (const one of held) this.insertBefore(one);
    this.remove();
    const first = held[0];
    if ($isElementNode(first)) first.selectStart();
    return true;
  }

  getLayout(): PanelLayout {
    return this.getLatest().__layout;
  }

  setLayout(layout: PanelLayout): this {
    const writable = this.getWritable();
    writable.__layout = layout;
    return writable;
  }
}

/** One tab, step, event, card or choice: a title and the blocks it holds. */
export class PanelNode extends ElementNode {
  $config() {
    return this.config("panel", { extends: ElementNode });
  }

  static importDOM(): DOMConversionMap {
    return {
      div: (element: HTMLElement) =>
        element.hasAttribute("data-panel")
          ? { conversion: () => ({ node: new PanelNode(), after: $partOf }), priority: 2 }
          : null,
    };
  }

  exportDOM(): DOMExportOutput {
    return { element: buildDrawn({ tag: "div", attributes: { "data-panel": "" } }) };
  }

  createDOM(config: EditorConfig): HTMLElement {
    return buildDrawn(drawPanel($layoutAbove(this), config.theme.panel));
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

/** A part's title: one line of words. */
export class PanelTitleNode extends ElementNode {
  $config() {
    return this.config("panel-title", { extends: ElementNode });
  }

  static importDOM(): DOMConversionMap {
    return {
      header: (element: HTMLElement) =>
        element.parentElement?.closest("[data-panels]") === null
          ? null
          : { conversion: () => ({ node: new PanelTitleNode() }), priority: 1 },
    };
  }

  exportDOM(): DOMExportOutput {
    return { element: buildDrawn({ tag: "header" }) };
  }

  createDOM(config: EditorConfig): HTMLElement {
    return buildDrawn(drawPanelTitle($layoutAbove(this), config.theme.panelTitle));
  }

  updateDOM(): boolean {
    return false;
  }

  /**
   * Backspace at the start of a title: an empty part goes, the caret moving
   * to the end of the one before; at the first part, a set of one is taken
   * apart and a longer set stays as it is.
   */
  collapseAtStart(): boolean {
    const panel = this.getParent();
    const panels = panel?.getParent();
    if (!$isPanelNode(panel) || !$isPanelsNode(panels)) return false;
    const previous = panel.getPreviousSibling();
    if (!$isPanelNode(previous)) {
      return panels.getChildrenSize() === 1 ? panels.collapseAtStart() : true;
    }
    if (panel.getTextContent().trim() === "") panel.remove();
    const body = previous.getLastChild();
    if ($isElementNode(body)) body.selectEnd();
    return true;
  }
}

/** A part's blocks. */
export class PanelBodyNode extends ElementNode {
  $config() {
    return this.config("panel-body", { extends: ElementNode });
  }

  static importDOM(): DOMConversionMap {
    return {
      div: (element: HTMLElement) =>
        element.hasAttribute("data-panel-body")
          ? { conversion: () => ({ node: new PanelBodyNode() }), priority: 2 }
          : null,
    };
  }

  exportDOM(): DOMExportOutput {
    return { element: buildDrawn({ tag: "div", attributes: { "data-panel-body": "" } }) };
  }

  createDOM(config: EditorConfig): HTMLElement {
    return buildDrawn(drawPanelBody($layoutAbove(this), config.theme.panelBody));
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

export function $createPanelsNode(layout: PanelLayout = "tabs"): PanelsNode {
  return new PanelsNode(layout);
}

/** A part with an empty title and an empty line to write in. */
export function $createPanel(): PanelNode {
  return new PanelNode().append(
    new PanelTitleNode(),
    new PanelBodyNode().append($createParagraphNode()),
  );
}

export function $createPanelTitleNode(): PanelTitleNode {
  return new PanelTitleNode();
}

export function $createPanelBodyNode(): PanelBodyNode {
  return new PanelBodyNode();
}

export function $isPanelsNode(node: LexicalNode | null | undefined): node is PanelsNode {
  return node instanceof PanelsNode;
}

export function $isPanelNode(node: LexicalNode | null | undefined): node is PanelNode {
  return node instanceof PanelNode;
}

export function $isPanelTitleNode(node: LexicalNode | null | undefined): node is PanelTitleNode {
  return node instanceof PanelTitleNode;
}

export function $isPanelBodyNode(node: LexicalNode | null | undefined): node is PanelBodyNode {
  return node instanceof PanelBodyNode;
}

/** A block for a body: blocks as they are, words and other inline nodes on a line of their own. */
function $asBlock(node: LexicalNode): LexicalNode {
  return $isElementNode(node) && !node.isInline() ? node : $createParagraphNode().append(node);
}

/** What an imported part holds, put back as a title then a body. */
function $partOf(children: LexicalNode[]): LexicalNode[] {
  const title = children.find($isPanelTitleNode) ?? $createPanelTitleNode();
  const body = children.find($isPanelBodyNode) ?? $createPanelBodyNode();
  for (const child of children) {
    if (child !== title && child !== body) body.append($asBlock(child));
  }
  return [title, body];
}

/** What an imported set holds, as parts: each `<header>` starts one, and what follows it is its body. */
function $groupParts(children: LexicalNode[]): LexicalNode[] {
  const out: LexicalNode[] = [];
  let body: PanelBodyNode | null = null;
  for (const child of children) {
    if ($isPanelNode(child)) {
      out.push(child);
      body = null;
    } else if ($isPanelTitleNode(child)) {
      body = $createPanelBodyNode();
      out.push(new PanelNode().append(child, body));
    } else {
      if (body === null) {
        body = $createPanelBodyNode();
        out.push(new PanelNode().append($createPanelTitleNode(), body));
      }
      body.append($asBlock(child));
    }
  }
  return out;
}

/**
 * Puts a part back together: its title, then its body, anything else moved
 * into the body. Outside a set it comes apart into plain blocks.
 */
function $repairPanel(node: PanelNode): void {
  const children = node.getChildren();
  if (!$isPanelsNode(node.getParent())) {
    for (const child of children) {
      if ($isPanelTitleNode(child)) {
        if (!child.isEmpty()) {
          node.insertBefore($createParagraphNode().append(...child.getChildren()));
        }
        child.remove();
      } else if ($isPanelBodyNode(child)) {
        $unwrapInto(child);
      }
    }
    $unwrapInto(node);
    return;
  }
  const [first, second] = children;
  if (children.length === 2 && $isPanelTitleNode(first) && $isPanelBodyNode(second)) return;
  const [title, body] = $partOf(children);
  if (title !== undefined && body !== undefined) node.append(title, body);
  if ($isPanelBodyNode(body)) $fillEmpty(body);
}

/**
 * Enter in a set: from a title to its body; from the empty title of a last,
 * empty part out of the set, the part gone; from an empty last line of a
 * body to the next part's title, a new part made where none waits, as a
 * list goes on to its next item, up to `MAX_PANELS`.
 */
function $enterInPanel(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchor = selection.anchor.getNode();
  const title = $findMatchingParent(anchor, $isPanelTitleNode);
  if ($isPanelTitleNode(title)) {
    const panel = title.getParent();
    const panels = panel?.getParent();
    if (!$isPanelNode(panel) || !$isPanelsNode(panels)) return false;
    if (
      panel.getTextContent().trim() === "" &&
      panel.getNextSibling() === null &&
      panels.getChildrenSize() > 1
    ) {
      const line = $createParagraphNode();
      panels.insertAfter(line);
      panel.remove();
      line.selectStart();
      return true;
    }
    const body = title.getNextSibling();
    if ($isElementNode(body)) {
      const first = body.getFirstChild();
      if ($isElementNode(first)) first.selectStart();
      else body.append($createParagraphNode()).selectStart();
    }
    return true;
  }
  if (!$isParagraphNode(anchor) || !anchor.isEmpty()) return false;
  const body = anchor.getParent();
  if (!$isPanelBodyNode(body) || !anchor.is(body.getLastChild())) return false;
  const panel = body.getParent();
  const panels = panel?.getParent();
  if (!$isPanelNode(panel) || !$isPanelsNode(panels)) return false;
  // An empty part waiting next, as a new set starts with, is the one to fill.
  const following = panel.getNextSibling();
  const waiting = $isPanelNode(following) && following.getTextContent().trim() === "";
  if (!waiting && panels.getChildrenSize() >= MAX_PANELS) return false;
  if (body.getChildrenSize() > 1) anchor.remove();
  const next = waiting ? following : panel.insertAfter($createPanel());
  const nextTitle = $isPanelNode(next) ? next.getFirstChild() : null;
  if ($isElementNode(nextTitle)) nextTitle.selectStart();
  return true;
}

/** Puts a set of two empty parts where the caret is, at the document's top level, the caret in the first title. */
export function $insertPanels(layout: PanelLayout): PanelsNode {
  const panels = $createPanelsNode(layout);
  $placeContainer(panels, { topLevel: true, fill: () => [$createPanel(), $createPanel()] });
  return panels;
}

const PANELS_START = /^<section data-panels="(tabs|steps|timeline|cards|choices)">\s*$/;
const PANELS_END = /^<\/section>\s*$/;
const PART_TITLE = /^<header>(.*)<\/header>\s*$/;

/**
 * A set as HTML that markdown keeps as it is: `<section data-panels>`, a
 * `<header>` line naming each part before its markdown, `</section>`; read
 * back the same way.
 */
function panelsMarkdown(all: () => readonly Transformer[]): MultilineElementTransformer {
  return {
    type: "multiline-element",
    dependencies: [PanelsNode, PanelNode, PanelTitleNode, PanelBodyNode],
    regExpStart: PANELS_START,
    export: (node, traverseChildren) => {
      if (!$isPanelsNode(node)) return null;
      const lines = [`<section data-panels="${node.getLayout()}">`];
      for (const panel of node.getChildren()) {
        if (!$isElementNode(panel)) continue;
        const [title, body] = panel.getChildren();
        lines.push(`<header>${$isElementNode(title) ? traverseChildren(title) : ""}</header>`);
        const text = $isElementNode(body) ? $convertToMarkdownString([...all()], body) : "";
        lines.push("", text, "");
      }
      lines.push("</section>");
      return lines.join("\n");
    },
    handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex, startMatch }) => {
      const end = lines.findIndex((line, index) => index > startLineIndex && PANELS_END.test(line));
      if (end === -1) return null;
      const panels = $createPanelsNode(panelLayoutOf(startMatch[1]));
      rootNode.append(panels);
      let words: string[] = [];
      let title: string | null = null;
      function close(): void {
        if (title === null && words.join("").trim() === "") return;
        const part = $createPanel();
        const [heading, body] = part.getChildren();
        if ($isElementNode(heading) && title !== null && title !== "") {
          const holder = $createParagraphNode();
          $convertFromMarkdownString(title, [...all()], holder);
          const line = holder.getFirstChild();
          heading.append(...($isElementNode(line) ? line.getChildren() : [$createTextNode(title)]));
        }
        if ($isElementNode(body)) {
          body.clear();
          $convertFromMarkdownString(words.join("\n").trim(), [...all()], body);
          $fillEmpty(body);
        }
        panels.append(part);
      }
      for (const line of lines.slice(startLineIndex + 1, end)) {
        const heading = PART_TITLE.exec(line);
        if (heading === null) {
          words.push(line);
          continue;
        }
        close();
        title = heading[1] ?? "";
        words = [];
      }
      close();
      if (panels.isEmpty()) panels.append($createPanel());
      return [true, end];
    },
    replace: () => false,
  };
}

const ICONS: Readonly<Record<PanelLayout, () => Child>> = {
  tabs: () => <PanelsTopLeft />,
  steps: () => <Footprints />,
  timeline: () => <History />,
  cards: () => <GalleryHorizontalEnd />,
  choices: () => <Split />,
};

const KEYWORDS: Readonly<Record<PanelLayout, readonly string[]>> = {
  tabs: ["tabs", "sections", "panels"],
  steps: ["steps", "process", "how to", "procedure"],
  timeline: ["timeline", "events", "history", "dates"],
  cards: ["cards", "flip", "flashcards", "flash cards"],
  choices: ["choices", "paths", "branching", "story"],
};

interface StoredPart {
  title: StoredNode | undefined;
  body: StoredNode | undefined;
}

function storedParts(node: StoredNode): StoredPart[] {
  return (node.children ?? [])
    .filter((child) => child.type === "panel")
    .map((part) => ({ title: part.children?.[0], body: part.children?.[1] }));
}

/** How a set reads in the renderer: `class`, `classes` and `renders` go to every `PanelsView` it draws. */
export type PanelsExtensionOptions = PanelsLook;

/**
 * Sets of titled parts: tabs, numbered steps, a timeline, flip cards and
 * choices between paths, at most `MAX_PANELS` parts each. The editor shows
 * every part framed as it will read; Enter goes from a title to its body,
 * from an empty last line to the next part, and from an empty last title out
 * of the set; the block menu changes the layout, keeping every part, and
 * adds a part. Markdown and HTML keep a set as `<section data-panels>`.
 * The renderer draws each layout as its reader meets it, through
 * `PanelsView`, which `options` customises.
 */
export function panelsExtension(options: PanelsExtensionOptions = {}): EditorExtension {
  return defineEditorExtension({
    name: "arc/panels",
    nodes: [PanelsNode, PanelNode, PanelTitleNode, PanelBodyNode],
    register: (editor) =>
      mergeRegister(
        editor.registerNodeTransform(PanelsNode, (node) => {
          if (!$isRootNode(node.getParent())) {
            $unwrapInto(node);
            return;
          }
          if (node.isEmpty()) {
            node.remove();
            return;
          }
          for (const child of node.getChildren()) {
            if (!$isPanelNode(child)) node.insertAfter($asBlock(child));
          }
        }),
        editor.registerNodeTransform(PanelNode, $repairPanel),
        editor.registerNodeTransform(PanelTitleNode, (node) => {
          if (!$isPanelNode(node.getParent())) {
            node.replace($createParagraphNode().append(...node.getChildren()));
          }
        }),
        editor.registerNodeTransform(PanelBodyNode, (node) => {
          if (!$isPanelNode(node.getParent())) $unwrapInto(node);
          else $fillEmpty(node);
        }),
        editor.registerCommand(INSERT_PARAGRAPH_COMMAND, $enterInPanel, COMMAND_PRIORITY_LOW),
        registerContainerKeys(editor, { isContainer: $isPanelsNode }),
      ),
    commands: PANEL_LAYOUTS.map((layout) => ({
      id: `panels-${layout}`,
      label: (messages) => messages.panelLayoutName(layout),
      description: (messages) => messages.panelLayoutHint(layout),
      group: (messages) => messages.layoutBlocks,
      icon: ICONS[layout],
      keywords: KEYWORDS[layout],
      run: (editor) => editor.update(() => void $insertPanels(layout)),
    })),
    blockMenu: [
      {
        id: "panel-layout",
        label: (messages) => messages.panelLayout,
        $read: (block) =>
          $isPanelsNode(block)
            ? {
                value: block.getLayout(),
                options: PANEL_LAYOUTS.map((value) => ({
                  value,
                  label: (messages) => messages.panelLayoutName(value),
                })),
              }
            : null,
        $choose: (block, value) => {
          if ($isPanelsNode(block)) block.setLayout(panelLayoutOf(value));
        },
      },
    ],
    blockActions: [
      {
        id: "add-panel",
        $label: (block) => {
          if (!$isPanelsNode(block) || block.getChildrenSize() >= MAX_PANELS) return null;
          const layout = block.getLayout();
          return (messages) => messages.addPanel(layout);
        },
        run: (editor, key) => {
          editor.update(() => {
            const panels = $getNodeByKey(key);
            if (!$isPanelsNode(panels)) return;
            const panel = $createPanel();
            panels.append(panel);
            panel.getFirstChild()?.selectStart();
          });
          editor.focus();
        },
      },
    ],
    placeholder: (block) => {
      if (!$isPanelTitleNode(block)) return null;
      const layout = $layoutAbove(block);
      return (messages) => messages.panelTitle(layout);
    },
    markdown: (all) => [panelsMarkdown(all)],
    markdownPriority: 10,
    render: {
      panels: (node, scope) => {
        const layout = panelLayoutOf(node.layout);
        const stored = storedParts(node);
        if (scope.editing) {
          return (
            <DrawnElement drawn={drawPanels(layout)}>
              {stored.map((part) => (
                <DrawnElement drawn={drawPanel(layout)}>
                  <DrawnElement drawn={drawPanelTitle(layout)}>
                    {part.title === undefined ? null : scope.children(part.title)}
                  </DrawnElement>
                  <DrawnElement drawn={drawPanelBody(layout)}>
                    {part.body === undefined ? null : scope.children(part.body)}
                  </DrawnElement>
                </DrawnElement>
              ))}
            </DrawnElement>
          );
        }
        const items: PanelItem[] = stored.map((part, index) => ({
          id: String(index),
          title: () => (part.title === undefined ? null : scope.children(part.title)),
          body: () => (part.body === undefined ? null : scope.children(part.body)),
        }));
        return (
          <PanelsView
            layout={layout}
            items={items}
            formatNumber={scope.formatNumber}
            class={options.class}
            className={options.className}
            classes={options.classes}
            renders={options.renders}
          />
        );
      },
    },
  });
}
