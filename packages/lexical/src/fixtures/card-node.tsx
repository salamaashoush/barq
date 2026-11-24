/**
 * A block a course editor puts in a document: a barq component with state of
 * its own, drawn by a `DecoratorBlockNode`.
 */
import { createSignal, onCleanup } from "@barqjs/core";
import type { ElementFormatType, LexicalNode, LexicalUpdateJSON, NodeKey, Spread } from "lexical";

import {
  type Decoration,
  DecoratorBlockNode,
  type SerializedDecoratorBlockNode,
  useLexicalEditable,
  useLexicalEditor,
  useLexicalNodeSelection,
} from "../index.ts";

type SerializedCardFields = {
  title: string;
};

export type SerializedCardNode = Spread<SerializedCardFields, SerializedDecoratorBlockNode>;

export const lifecycle = { built: 0, disposed: 0 };

interface CardProps {
  nodeKey: NodeKey;
  title: string;
}

function Card(props: CardProps) {
  const editor = useLexicalEditor();
  const editable = useLexicalEditable();
  const [selected, setSelected, clearSelected] = useLexicalNodeSelection(props.nodeKey);
  const [clicks, setClicks] = createSignal(0);
  lifecycle.built++;
  onCleanup(() => {
    lifecycle.disposed++;
  });
  if (props.title === "explode") throw new Error("the card could not be drawn");
  return (
    <figure class="card" data-selected={selected() ? "" : undefined}>
      <h3 class="card-title">{props.title}</h3>
      <button type="button" class="count" onClick={() => setClicks((count) => count + 1)}>
        {clicks()}
      </button>
      <button
        type="button"
        class="select"
        onClick={() => {
          clearSelected();
          setSelected(true);
        }}
      >
        select
      </button>
      <span class="mode">{editable() ? "editing" : "reading"}</span>
      <span class="namespace">{editor._config.namespace}</span>
    </figure>
  );
}

export class CardNode extends DecoratorBlockNode {
  __title: string;

  constructor(title = "", format?: ElementFormatType, key?: NodeKey) {
    super(format, key);
    this.__title = title;
  }

  $config() {
    return this.config("card", { extends: DecoratorBlockNode });
  }

  static clone(node: CardNode): CardNode {
    return new CardNode(node.__title, node.__format, node.__key);
  }

  static importJSON(json: SerializedCardNode): CardNode {
    return new CardNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedCardNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__title = json.title;
    return node;
  }

  exportJSON(): SerializedCardNode {
    return { ...super.exportJSON(), title: this.getLatest().__title };
  }

  setTitle(title: string): this {
    const writable = this.getWritable();
    writable.__title = title;
    return writable;
  }

  decorate(): Decoration<this> {
    return (node) => <Card nodeKey={node().getKey()} title={node().__title} />;
  }
}

export function $createCardNode(title: string): CardNode {
  return new CardNode(title);
}

export function $isCardNode(node: LexicalNode | null | undefined): node is CardNode {
  return node instanceof CardNode;
}
