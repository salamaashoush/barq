import { variants } from "@barqjs/css";
import { Info } from "@barqjs/lucide/icons/info";
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
  $isParagraphNode,
  type DOMConversionMap,
  type DOMExportOutput,
  type EditorConfig,
  ElementNode,
  type LexicalNode,
  type LexicalUpdateJSON,
  type NodeKey,
  type SerializedElementNode,
  type Spread,
  mergeRegister,
} from "lexical";

import { arcLayer as arc } from "../layer.ts";
import { bg, edge, place, rounded, tone as tones } from "../style/index.ts";
import {
  type Drawn,
  DrawnElement,
  $fillEmpty,
  $placeContainer,
  buildDrawn,
  registerContainerKeys,
} from "./containers.tsx";
import { defineEditorExtension } from "./extension.ts";
import { blockGap } from "./theme.ts";

export type CalloutTone = "neutral" | "info" | "success" | "warning" | "danger";

export const CALLOUT_TONES: readonly CalloutTone[] = [
  "neutral",
  "info",
  "success",
  "warning",
  "danger",
];

export const calloutStyles = variants({
  slots: {
    root: arc(bg.tone, edge.all, edge.tone, rounded.lg, blockGap, place.padded, {
      "& > :last-child": { marginBlockEnd: "0px" },
    }),
  },
  variants: {
    tone: {
      neutral: { root: tones.neutral },
      info: { root: tones.info },
      success: { root: tones.success },
      warning: { root: tones.warning },
      danger: { root: tones.danger },
    },
  },
  defaults: { tone: "info" },
});

function toneOf(value: unknown): CalloutTone {
  return CALLOUT_TONES.find((one) => one === value) ?? "info";
}

/** How a callout draws, in the editor and the renderer alike. */
export function drawCallout(tone: CalloutTone, themeClass?: unknown): Drawn {
  const own = calloutStyles({ tone }).root;
  return {
    tag: "div",
    attributes: {
      class: typeof themeClass === "string" && themeClass !== "" ? arc(own, themeClass) : own,
      role: "note",
      "data-slot": "callout",
      "data-tone": tone,
    },
  };
}

export type SerializedCalloutNode = Spread<{ tone: CalloutTone }, SerializedElementNode>;

/** A set-apart box of blocks in a tone: a note, a tip, a warning. */
export class CalloutNode extends ElementNode {
  __tone: CalloutTone;

  constructor(tone: CalloutTone = "info", key?: NodeKey) {
    super(key);
    this.__tone = tone;
  }

  $config() {
    return this.config("callout", { extends: ElementNode });
  }

  static clone(node: CalloutNode): CalloutNode {
    return new CalloutNode(node.__tone, node.__key);
  }

  static importJSON(json: SerializedCalloutNode): CalloutNode {
    return new CalloutNode().updateFromJSON(json);
  }

  static importDOM(): DOMConversionMap {
    const convert = (element: HTMLElement) =>
      element.hasAttribute("data-callout")
        ? {
            conversion: () => ({
              node: new CalloutNode(toneOf(element.getAttribute("data-callout"))),
            }),
            priority: 1 as const,
          }
        : null;
    return { aside: convert, div: convert };
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedCalloutNode>): this {
    return super.updateFromJSON(json).setTone(toneOf(json.tone));
  }

  exportJSON(): SerializedCalloutNode {
    return { ...super.exportJSON(), tone: this.getTone() };
  }

  exportDOM(): DOMExportOutput {
    const element = buildDrawn({
      tag: "div",
      attributes: { role: "note", "data-callout": this.getTone() },
    });
    return { element };
  }

  createDOM(config: EditorConfig): HTMLElement {
    return buildDrawn(drawCallout(this.__tone, config.theme.callout));
  }

  updateDOM(previous: this): boolean {
    return previous.__tone !== this.__tone;
  }

  isShadowRoot(): boolean {
    return true;
  }

  canBeEmpty(): boolean {
    return false;
  }

  /** Backspace at its start takes the box away and keeps what it held. */
  collapseAtStart(): boolean {
    const children = this.getChildren();
    for (const child of children) this.insertBefore(child);
    this.remove();
    children[0]?.selectStart();
    return true;
  }

  getTone(): CalloutTone {
    return this.getLatest().__tone;
  }

  setTone(tone: CalloutTone): this {
    const writable = this.getWritable();
    writable.__tone = tone;
    return writable;
  }
}

export function $createCalloutNode(tone: CalloutTone = "info"): CalloutNode {
  return new CalloutNode(tone);
}

export function $isCalloutNode(node: LexicalNode | null | undefined): node is CalloutNode {
  return node instanceof CalloutNode;
}

/** The block a callout takes in when chosen on a line of text: the line itself. */
function wrapsInCallout(block: ElementNode): boolean {
  return (
    $isParagraphNode(block) || $isHeadingNode(block) || $isQuoteNode(block) || $isListNode(block)
  );
}

/** Puts a callout where the caret is, around the line it is on when that line has words. */
export function $insertCallout(tone: CalloutTone = "info"): CalloutNode {
  const callout = $createCalloutNode(tone);
  $placeContainer(callout, {
    wrap: wrapsInCallout,
    fill: () => [$createParagraphNode()],
    notInside: $isCalloutNode,
  });
  return callout;
}

const CALLOUT_LINE = /^>\s?\[!(\w+)\]\s*$/;

/**
 * A callout as an Obsidian and GitHub style alert, `> [!warning]` then the
 * callout's blocks as quoted lines, read back the same way.
 */
function calloutMarkdown(all: () => readonly Transformer[]): MultilineElementTransformer {
  return {
    type: "multiline-element",
    dependencies: [CalloutNode],
    regExpStart: CALLOUT_LINE,
    export: (node) => {
      if (!$isCalloutNode(node)) return null;
      const body = $convertToMarkdownString([...all()], node)
        .split("\n")
        .map((line) => (line === "" ? ">" : `> ${line}`));
      return [`> [!${node.getTone()}]`, ...body].join("\n");
    },
    handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex, startMatch }) => {
      const name = (startMatch[1] ?? "").toLowerCase();
      const tone = ALIASES[name] ?? CALLOUT_TONES.find((one) => one === name);
      if (tone === undefined) return null;
      const body: string[] = [];
      let at = startLineIndex + 1;
      while (at < lines.length && (lines[at] ?? "").startsWith(">")) {
        body.push((lines[at] ?? "").replace(/^>\s?/, ""));
        at += 1;
      }
      const callout = $createCalloutNode(tone);
      rootNode.append(callout);
      $convertFromMarkdownString(body.join("\n"), [...all()], callout);
      $fillEmpty(callout);
      return [true, at - 1];
    },
    replace: () => false,
  };
}

/** GitHub's alert names, read as the tone each means. */
const ALIASES: Readonly<Record<string, CalloutTone>> = {
  note: "info",
  tip: "success",
  important: "neutral",
  caution: "danger",
};

/**
 * Callouts: a box of blocks set apart in a tone (neutral, information,
 * success, warning, danger), chosen from the block menu. Backspace at its
 * start unwraps it, Enter on its empty last line and the arrows at its edges
 * leave it, and markdown writes it as a `> [!tone]` alert.
 */
export const calloutExtension = defineEditorExtension({
  name: "arc/callout",
  nodes: [CalloutNode],
  register: (editor) =>
    mergeRegister(
      editor.registerNodeTransform(CalloutNode, $fillEmpty),
      registerContainerKeys(editor, {
        isContainer: $isCalloutNode,
        exitsOnEmptyLine: $isCalloutNode,
      }),
    ),
  commands: [
    {
      id: "callout",
      label: (messages) => messages.callout,
      group: (messages) => messages.layoutBlocks,
      icon: () => <Info />,
      keywords: ["note", "tip", "warning", "alert", "aside"],
      run: (editor) => editor.update(() => void $insertCallout()),
    },
  ],
  blockMenu: [
    {
      id: "callout-tone",
      label: (messages) => messages.calloutTone,
      $read: (block) =>
        $isCalloutNode(block)
          ? {
              value: block.getTone(),
              options: CALLOUT_TONES.map((tone) => ({
                value: tone,
                label: (messages) => messages.calloutToneName(tone),
              })),
            }
          : null,
      $choose: (block, value) => {
        if ($isCalloutNode(block)) block.setTone(toneOf(value));
      },
    },
  ],
  markdown: (all) => [calloutMarkdown(all)],
  markdownPriority: 10,
  render: {
    callout: (node, scope) => (
      <DrawnElement drawn={drawCallout(toneOf(node.tone))}>{scope.children(node)}</DrawnElement>
    ),
  },
});
