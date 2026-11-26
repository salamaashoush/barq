import type { Child } from "@barqjs/core";
import type { JSX } from "@barqjs/web";
import {
  type Decoration,
  DecoratorBlockNode,
  type SerializedDecoratorBlockNode,
  useLexicalEditable,
  useLexicalEditor,
  useLexicalNodeSelection,
} from "@barqjs/lexical";
import { type ElementTransformer } from "@lexical/markdown";
import {
  $getNodeByKey,
  type DOMConversionMap,
  type DOMExportOutput,
  type ElementFormatType,
  type Klass,
  type LexicalEditor,
  type LexicalNode,
  type LexicalUpdateJSON,
  type NodeKey,
  type Spread,
} from "lexical";

import type { ArcMessages } from "../components/messages.ts";
import { $insertBlock } from "./commands.ts";
import type { EditorExtension } from "./extension.ts";

/** What a block's component is handed, in the editor and in `RichTextRenderer` alike. */
export interface BlockProps<Data> {
  data: Data;
  /** Changes the block's data: a patch, or the next data from the current. Nothing while read-only. */
  setData: (next: Partial<Data> | ((data: Data) => Data)) => void;
  /** Whether the document is being edited, or only read. */
  editable: boolean;
  /** Whether the block itself is selected, as a node selection. */
  selected: boolean;
  /** Takes the block out of the document. */
  remove: () => void;
  /** The node's key while in an editor; empty in a renderer. */
  nodeKey: NodeKey;
  /** Where the block sits in the column, for a block narrower than it: `start`, `center`, `end`. */
  format: ElementFormatType;
}

/** A word that depends on the reader's language, or one fixed. */
export type BlockLabel = string | ((messages: ArcMessages) => string);

/** What a block's reader finds: its data, and where the block sits, as the node's own `format`. */
export type BlockRead<Data> = Data & { readonly format?: ElementFormatType };

export interface MarkdownImport<Data> {
  regExp: RegExp;
  data: (match: string[]) => BlockRead<Data> | null;
}

export interface BlockDefinition<Data> {
  /** The node type the document stores: `"acme-quiz"`. Unique in an editor. */
  type: string;
  /** In the insert picker, the slash menu and Turn into. */
  label: BlockLabel;
  /** The picker's group it sits in. @default arc's "Basic" */
  group?: BlockLabel;
  /** Beside the label in the pickers. */
  icon?: () => Child;
  /** More words it is found by. */
  keywords?: readonly string[];
  /** A line under the label in the picker. */
  description?: BlockLabel;
  /** The data a new block starts with. */
  defaultData(): Data;
  /** Draws the block, editing it while `editable`. */
  component: (props: BlockProps<Data>) => JSX.Element;
  /** Offered by the pickers. @default true */
  insertable?: boolean;
  /** As markdown, for export; `null` leaves it out. `format` is where the block sits. */
  toMarkdown?(data: Data, format: ElementFormatType): string | null;
  /** A whole line of markdown that becomes this block on import and as it is typed. */
  fromMarkdown?: MarkdownImport<Data>;
  /**
   * Elements read into this block from pasted or imported HTML, by tag name:
   * the block's data, or `null` to leave the element to another reader.
   */
  fromHtml?: Readonly<Record<string, (element: HTMLElement) => BlockRead<Data> | null>>;
  /** The block as HTML, for a copy and an HTML export. */
  toHtml?: (data: Data, format: ElementFormatType) => HTMLElement;
}

/**
 * A block as stored: its data's fields beside the node's own `type`,
 * `version` and `format`, the shape a node written by hand has, so a document
 * stored by another Lexical editor with the same fields opens unchanged.
 */
export type SerializedBlockNode<Data> = Spread<Data, SerializedDecoratorBlockNode>;

/** The fields Lexical keeps on every block node, which a block's data never holds. */
const NODE_FIELDS: ReadonlySet<string> = new Set(["type", "version", "format", "$"]);

/** A block's data from its stored node: every field but the node's own, over its defaults. */
export function storedBlockData<Data>(
  definition: BlockDefinition<Data>,
  stored: Readonly<Record<string, unknown>>,
): Data {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (!NODE_FIELDS.has(key)) fields[key] = value;
  }
  return { ...definition.defaultData(), ...fields };
}

/** A document block drawn by a barq component, holding its data as JSON. */
export class BlockNode extends DecoratorBlockNode {
  __data: unknown;

  constructor(data: unknown, format?: ElementFormatType, key?: NodeKey) {
    super(format, key);
    this.__data = data;
  }

  /** What `defineBlock` made this node's class from. */
  getDefinition(): BlockDefinition<unknown> {
    throw new Error("A block node is made by defineBlock, which says what it is.");
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedDecoratorBlockNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__data = storedBlockData(this.getDefinition(), json as Record<string, unknown>);
    return node;
  }

  exportJSON(): SerializedDecoratorBlockNode {
    return { ...(this.getLatest().__data as object), ...super.exportJSON() };
  }

  getData(): unknown {
    return this.getLatest().__data;
  }

  setData(data: unknown): this {
    const writable = this.getWritable();
    writable.__data = data;
    return writable;
  }

  getTextContent(): string {
    const latest = this.getLatest();
    const markdown = this.getDefinition().toMarkdown?.(latest.__data, latest.__format);
    return markdown === null || markdown === undefined ? "" : `${markdown}\n`;
  }

  decorate(): Decoration<this> {
    const definition = this.getDefinition();
    return (node) => (
      <BlockFrame
        definition={definition}
        nodeKey={node().getKey()}
        data={node().__data}
        format={node().__format}
      />
    );
  }
}

export function $isBlockNode(node: LexicalNode | null | undefined): node is BlockNode {
  return node instanceof BlockNode;
}

function applyData<Data>(current: Data, next: Partial<Data> | ((data: Data) => Data)): Data {
  return typeof next === "function" ? next(current) : { ...current, ...next };
}

/** Sets a block's data from outside its component: an upload finishing, a server's answer. */
export function updateBlockData<Data>(
  editor: LexicalEditor,
  key: NodeKey,
  next: Partial<Data> | ((data: Data) => Data),
): void {
  editor.update(() => {
    const node = $getNodeByKey(key);
    if ($isBlockNode(node)) node.setData(applyData(node.getData() as Data, next));
  });
}

interface BlockFrameProps {
  definition: BlockDefinition<unknown>;
  nodeKey: NodeKey;
  data: unknown;
  format: ElementFormatType;
}

function BlockFrame(props: BlockFrameProps): JSX.Element {
  const editor = useLexicalEditor();
  const editable = useLexicalEditable();
  const [selected] = useLexicalNodeSelection(props.nodeKey);
  const Component = props.definition.component;
  return (
    <Component
      data={props.data}
      editable={editable()}
      selected={selected()}
      nodeKey={props.nodeKey}
      format={props.format}
      setData={(next) => {
        if (editor.isEditable()) updateBlockData(editor, props.nodeKey, next);
      }}
      remove={() => {
        editor.update(() => $getNodeByKey(props.nodeKey)?.remove());
      }}
    />
  );
}

/** A block node whose data is known to be `Data`. */
export interface TypedBlockNode<Data> extends BlockNode {
  getData(): Data;
}

export interface AnyMarkdownImport {
  regExp: RegExp;
  data: (match: string[]) => unknown;
}

/** The node with what a reader found: its data, and its `format` set apart as the node's own. */
function $blockFromRead<Node extends BlockNode>(node: Node, read: unknown): Node {
  const { format, ...data } = read as BlockRead<object>;
  node.setData(data);
  if (typeof format === "string") node.setFormat(format);
  return node;
}

/** Any block, whatever its data: what a picker lists and a document registers. */
export interface AnyBlock {
  readonly type: string;
  readonly label: BlockLabel;
  readonly group?: BlockLabel;
  readonly icon?: () => Child;
  readonly keywords?: readonly string[];
  readonly description?: BlockLabel;
  readonly insertable?: boolean;
  readonly fromMarkdown?: AnyMarkdownImport;
  readonly node: Klass<BlockNode>;
  /** What the block was defined with, its data's type forgotten. */
  readonly definition: BlockDefinition<unknown>;
  /** A new block with its default data. */
  $create(): BlockNode;
  $is(node: LexicalNode | null | undefined): node is BlockNode;
}

/**
 * A block type an editor knows: its definition, its node class, and how to
 * make one. It is an editor extension of its own, named by its type, which
 * offers it in the pickers and reads and writes its line of markdown.
 */
export interface Block<Data = unknown> extends BlockDefinition<Data>, EditorExtension {
  readonly node: Klass<BlockNode>;
  readonly definition: BlockDefinition<unknown>;
  $create(data?: Data): TypedBlockNode<Data>;
  $is(node: LexicalNode | null | undefined): node is TypedBlockNode<Data>;
}

/**
 * A block of an app's own, built only from arc pieces, that an editor
 * offers in its pickers and stores as `{ type, data }`.
 *
 * ```tsx
 * const Callout = defineBlock({
 *   type: "acme-callout",
 *   label: "Callout",
 *   icon: () => <Info />,
 *   defaultData: () => ({ text: "" }),
 *   component: (props) => (
 *     <Alert>
 *       <TextField label="Callout" value={props.data.text} isReadOnly={!props.editable}
 *         onChange={(text) => props.setData({ text })} />
 *     </Alert>
 *   ),
 * });
 *
 * <BlockEditor extensions={[Callout]} />
 * ```
 */
export function defineBlock<Data>(definition: BlockDefinition<Data>): Block<Data> {
  class DefinedBlockNode extends BlockNode {
    $config() {
      // The type is the app's, known only at run time; to the checker it is
      // one literal, which keeps the config's shape a record of one key.
      return this.config(definition.type as "block", { extends: BlockNode });
    }

    static clone(node: DefinedBlockNode): DefinedBlockNode {
      return new DefinedBlockNode(node.__data, node.__format, node.__key);
    }

    static importJSON(json: SerializedDecoratorBlockNode): DefinedBlockNode {
      return new DefinedBlockNode(definition.defaultData()).updateFromJSON(json);
    }

    static importDOM(): DOMConversionMap | null {
      const readers = definition.fromHtml;
      if (readers === undefined) return null;
      const map: DOMConversionMap = {};
      for (const [tag, read] of Object.entries(readers)) {
        map[tag] = (element: HTMLElement) => {
          const found = read(element);
          if (found === null) return null;
          return {
            conversion: () => ({
              node: $blockFromRead(new DefinedBlockNode(definition.defaultData()), found),
            }),
            priority: 1,
          };
        };
      }
      return map;
    }

    exportDOM(editor: LexicalEditor): DOMExportOutput {
      return definition.toHtml === undefined
        ? super.exportDOM(editor)
        : {
            element: definition.toHtml(this.getLatest().__data as Data, this.getLatest().__format),
          };
    }

    getDefinition(): BlockDefinition<unknown> {
      return definition as unknown as BlockDefinition<unknown>;
    }
  }
  const blocks: AnyBlock[] = [];
  const block: Block<Data> = {
    ...definition,
    name: definition.type,
    node: DefinedBlockNode,
    definition: definition as unknown as BlockDefinition<unknown>,
    $create: (data) =>
      new DefinedBlockNode(data ?? definition.defaultData()) as TypedBlockNode<Data>,
    $is: (node): node is TypedBlockNode<Data> => node instanceof DefinedBlockNode,
    blocks,
    commands:
      definition.insertable === false
        ? []
        : [
            {
              id: definition.type,
              label: definition.label,
              group: definition.group,
              icon: definition.icon,
              keywords: definition.keywords,
              description: definition.description,
              run: (editor) => editor.update(() => void $insertBlock(block.$create())),
            },
          ],
    markdown: [],
  };
  blocks.push(block);
  (block.markdown as ElementTransformer[]).push(blockTransformer(block));
  return block;
}

/** The block's line of markdown, read as it is typed and on import, and written on export. */
function blockTransformer(block: AnyBlock): ElementTransformer {
  const from = block.fromMarkdown;
  return {
    dependencies: [block.node],
    export: (node) =>
      block.$is(node)
        ? (node.getDefinition().toMarkdown?.(node.getData(), node.getFormat()) ?? null)
        : null,
    regExp: from?.regExp ?? /(?!)/,
    replace: (parent, _children, match) => {
      const data = from?.data(match);
      if (data === null || data === undefined) return false;
      parent.replace($blockFromRead(block.$create(), data));
      return undefined;
    },
    type: "element",
  };
}

/** A label in the reader's words. */
export function labelOf(label: BlockLabel | undefined, messages: ArcMessages): string {
  if (label === undefined) return "";
  return typeof label === "function" ? label(messages) : label;
}
