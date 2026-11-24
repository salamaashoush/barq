/**
 * The inline mention a chat composer inserts: a text entity carrying the id
 * of whom it names, which typing cannot extend from either side.
 */
import {
  $applyNodeReplacement,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
  TextNode,
} from "lexical";

type SerializedMentionFields = {
  mentionName: string;
  mentionId: string;
  type: "mention";
  version: 1;
};

export type SerializedMentionNode = Spread<SerializedMentionFields, SerializedTextNode>;

function convertMentionElement(domNode: HTMLElement): DOMConversionOutput | null {
  const text = domNode.textContent;
  return text === null ? null : { node: $createMentionNode(text, domNode.dataset.mentionId) };
}

export class MentionNode extends TextNode {
  __mention: string;
  __mentionId: string;

  static getType(): string {
    return "mention";
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(node.__mention, node.__mentionId, node.__text, node.__key);
  }

  static importJSON(json: SerializedMentionNode): MentionNode {
    return $createMentionNode(json.mentionName, json.mentionId).updateFromJSON(json);
  }

  constructor(mentionName: string, mentionId = "", text?: string, key?: NodeKey) {
    super(text ?? mentionName, key);
    this.__mention = mentionName;
    this.__mentionId = mentionId;
  }

  exportJSON(): SerializedMentionNode {
    return {
      ...super.exportJSON(),
      mentionName: this.__mention,
      mentionId: this.__mentionId,
      type: "mention",
      version: 1,
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    element.className = "mention";
    element.setAttribute("data-mention-id", this.__mentionId);
    return element;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("span");
    element.setAttribute("data-mention-id", this.__mentionId);
    element.textContent = this.__text;
    return { element };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (domNode: HTMLElement) =>
        domNode.hasAttribute("data-mention-id")
          ? { conversion: convertMentionElement, priority: 1 }
          : null,
    };
  }

  isTextEntity(): true {
    return true;
  }

  canInsertTextBefore(): boolean {
    return false;
  }

  canInsertTextAfter(): boolean {
    return false;
  }
}

export function $createMentionNode(mentionName: string, mentionId?: string): MentionNode {
  return $applyNodeReplacement(new MentionNode(mentionName, mentionId));
}

export function $isMentionNode(node: LexicalNode | null | undefined): node is MentionNode {
  return node instanceof MentionNode;
}
