import type { Accessor } from "@barqjs/core";
import type { JSX } from "@barqjs/web";
import {
  $getDocument,
  DecoratorNode,
  type ElementFormatType,
  type LexicalNode,
  type LexicalParseJSON,
  type NodeKey,
  type SerializedLexicalNode,
  type SerializedPartial,
  type Spread,
  enumValue,
  nodeSchema,
  withField,
} from "lexical";

/**
 * What a decorator node's `decorate()` returns in barq: a function that
 * builds the node's component, handed the node as an accessor.
 *
 * Barq JSX builds where it is written, so `decorate()` cannot return the
 * element itself the way a React decorator does; it returns how to build it.
 * The binding calls it once, under the editor's scope and inside the node's
 * own DOM element, and keeps the component for as long as that element lives.
 * When the node changes, the accessor moves to the new version and whatever
 * read it updates in place, so the component keeps its state and its focus.
 *
 * ```tsx
 * decorate(): Decoration<this> {
 *   return (node) => <Chart nodeKey={node().getKey()} size={node().__size} />;
 * }
 * ```
 */
export type Decoration<N extends LexicalNode = LexicalNode> = {
  // A method, so a node's `Decoration<this>` is one of the base class's.
  bivarianceHack(node: Accessor<N>): JSX.Element;
}["bivarianceHack"];

export type SerializedDecoratorBlockNode = Spread<
  { format: ElementFormatType },
  SerializedLexicalNode
>;

const decoratorBlockNodeSchema = nodeSchema<DecoratorBlockNode>()({
  format: withField(enumValue(["", "left", "start", "center", "right", "end", "justify"]), {
    field: "__format",
  }),
});

/**
 * A block-level decorator: a node that is a whole block of the document, drawn
 * by a barq component, and aligned like a paragraph.
 */
export class DecoratorBlockNode extends DecoratorNode<Decoration> {
  __format: ElementFormatType;

  constructor(format?: ElementFormatType, key?: NodeKey) {
    super(key);
    this.__format = format || "";
  }

  $config() {
    return this.config(Symbol.for("DecoratorBlockNode"), {
      extends: DecoratorNode,
      json: decoratorBlockNodeSchema,
    });
  }

  exportJSON(compact?: false): SerializedDecoratorBlockNode;
  exportJSON(compact: boolean): SerializedPartial<SerializedDecoratorBlockNode>;
  exportJSON(compact = false): SerializedPartial<SerializedDecoratorBlockNode> {
    return super.exportJSON(compact);
  }

  updateFromJSON(serializedNode: LexicalParseJSON<SerializedDecoratorBlockNode>): this {
    return super.updateFromJSON(serializedNode);
  }

  canIndent(): false {
    return false;
  }

  createDOM(): HTMLElement {
    return $getDocument().createElement("div");
  }

  updateDOM(): false {
    return false;
  }

  setFormat(format: ElementFormatType): this {
    const self = this.getWritable();
    self.__format = format;
    return self;
  }

  getFormat(): ElementFormatType {
    return this.getLatest().__format;
  }

  isInline(): false {
    return false;
  }
}

export function $isDecoratorBlockNode(
  node: LexicalNode | null | undefined,
): node is DecoratorBlockNode {
  return node instanceof DecoratorBlockNode;
}
