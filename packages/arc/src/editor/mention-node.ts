import {
  $applyNodeReplacement,
  $getDocument,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type LexicalUpdateJSON,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
  TextNode,
  addClassNamesToElement,
} from "lexical";

export type MentionFields = {
  mentionId: string;
  mentionName: string;
  trigger: string;
};

export type SerializedMentionNode = Spread<MentionFields, SerializedTextNode>;

function convertMention(element: HTMLElement): DOMConversionOutput | null {
  const id = element.dataset.mentionId;
  const text = element.textContent;
  if (id === undefined || text === null) return null;
  const trigger = element.dataset.mentionTrigger ?? "@";
  const name = text.startsWith(trigger) ? text.slice(trigger.length) : text;
  return { node: $createMentionNode({ id, name, trigger }) };
}

/**
 * Someone or something named in the text: `@Salama`, `#general`. It is one
 * unit, which typing cannot extend and Backspace removes whole, carrying the
 * id of what it names.
 */
export class MentionNode extends TextNode {
  __mentionId: string;
  __mentionName: string;
  __trigger: string;

  $config() {
    return this.config("mention", { extends: TextNode });
  }

  constructor(name = "", id = "", trigger = "@", key?: NodeKey) {
    super(`${trigger}${name}`, key);
    this.__mentionId = id;
    this.__mentionName = name;
    this.__trigger = trigger;
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(node.__mentionName, node.__mentionId, node.__trigger, node.__key);
  }

  static importJSON(json: SerializedMentionNode): MentionNode {
    return $createMentionNode({
      id: json.mentionId,
      name: json.mentionName,
      trigger: json.trigger,
    }).updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedMentionNode>): this {
    return super.updateFromJSON(json);
  }

  exportJSON(): SerializedMentionNode {
    const self = this.getLatest();
    return {
      ...super.exportJSON(),
      mentionId: self.__mentionId,
      mentionName: self.__mentionName,
      trigger: self.__trigger,
    };
  }

  getMentionId(): string {
    return this.getLatest().__mentionId;
  }

  getMentionName(): string {
    return this.getLatest().__mentionName;
  }

  getTrigger(): string {
    return this.getLatest().__trigger;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    addClassNamesToElement(element, config.theme.mention as string | undefined);
    element.dataset.mentionId = this.__mentionId;
    element.dataset.mentionTrigger = this.__trigger;
    element.dataset.slot = "mention";
    element.spellcheck = false;
    return element;
  }

  exportDOM(): DOMExportOutput {
    const element = $getDocument().createElement("span");
    element.dataset.mentionId = this.__mentionId;
    element.dataset.mentionTrigger = this.__trigger;
    element.textContent = this.getTextContent();
    return { element };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (element: HTMLElement) =>
        element.dataset.mentionId === undefined
          ? null
          : { conversion: convertMention, priority: 1 },
    };
  }

  isTextEntity(): true {
    return true;
  }

  canInsertTextBefore(): false {
    return false;
  }

  canInsertTextAfter(): false {
    return false;
  }
}

export interface MentionValue {
  id: string;
  name: string;
  /** @default "@" */
  trigger?: string;
}

export function $createMentionNode(mention: MentionValue): MentionNode {
  return $applyNodeReplacement(
    new MentionNode(mention.name, mention.id, mention.trigger ?? "@")
      .setMode("token")
      .toggleDirectionless(),
  );
}

export function $isMentionNode(node: LexicalNode | null | undefined): node is MentionNode {
  return node instanceof MentionNode;
}
