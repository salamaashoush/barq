import { Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import {
  type Decoration,
  DecoratorBlockNode,
  type SerializedDecoratorBlockNode,
  useLexicalEditable,
  useLexicalEditor,
  useLexicalNodeSelection,
} from "@barqjs/lexical";
import { Copy } from "@barqjs/lucide/icons/copy";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { Repeat2 } from "@barqjs/lucide/icons/repeat-2";
import { Button } from "@barqjs/ui/button";
import type { JSX } from "@barqjs/web";
import type { ElementTransformer } from "@lexical/markdown";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  $parseSerializedNode,
  type DOMConversionMap,
  type DOMExportOutput,
  type ElementFormatType,
  type LexicalEditor,
  type LexicalNode,
  type LexicalUpdateJSON,
  type NodeKey,
  type SerializedEditorState,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";

import { useArcMessages } from "../components/messages.ts";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { edge, gap, glyph, layout, rounded, space, type } from "../style/index.ts";
import { $deepJSON } from "./commands.ts";
import { $rootBlockOf, buildDrawn } from "./containers.tsx";
import { type EditorExtension, defineEditorExtension } from "./extension.ts";
import { blockGap, documentStyles } from "./theme.ts";

export interface SharedBlockViewProps {
  id: string;
}

/**
 * Where an app keeps blocks shown in many documents. `View` draws one as
 * its readers see it; `choose` resolves to one picked to show here, `keep`
 * to the id a block was kept under, each `null` when the writer thought
 * better of it; `edit` opens one to change wherever it shows; `read` gives
 * its content to copy here.
 */
export interface SharedBlockSource {
  View: (props: SharedBlockViewProps) => JSX.Element;
  choose: () => Promise<string | null>;
  keep: (content: SerializedEditorState) => Promise<string | null>;
  edit: (id: string) => void;
  read: (id: string) => Promise<SerializedEditorState | null>;
  /** Whether a block may be kept, past the rule every source has: none holds a shared block. @default any */
  sharable?: (content: SerializedEditorState) => boolean;
}

export const sharedBlockStyles = variants({
  slots: {
    root: arc(blockGap, edge.all, rounded.lg, layout.column, gap[2], {
      borderStyle: "dashed",
      padding: space.x3,
    }),
    bar: arc(layout.row, layout.wrap, gap[1]),
    label: arc(layout.inlineRow, gap[1.5], glyph.sm, type.meta, { marginInlineEnd: "auto" }),
    action: arc(glyph.sm),
    view: arc(layout.minZero),
  },
});

export type SharedBlockSlots = ReturnType<typeof sharedBlockStyles>;

export type SharedBlockFields = {
  sharedId: string;
};

export type SerializedSharedBlockNode = Spread<SharedBlockFields, SerializedDecoratorBlockNode>;

const sources = new WeakMap<LexicalEditor, SharedBlockSource>();
const looks = new WeakMap<LexicalEditor, SharedBlockOptions>();

/**
 * A block kept once and shown in many documents: the document holds only
 * which one, and draws it as it now is, so a change to it reaches every
 * document showing it.
 */
export class SharedBlockNode extends DecoratorBlockNode {
  __sharedId: string;

  constructor(sharedId = "", format?: ElementFormatType, key?: NodeKey) {
    super(format, key);
    this.__sharedId = sharedId;
  }

  $config() {
    return this.config("shared", { extends: DecoratorBlockNode });
  }

  static clone(node: SharedBlockNode): SharedBlockNode {
    return new SharedBlockNode(node.__sharedId, node.__format, node.__key);
  }

  static importJSON(json: SerializedSharedBlockNode): SharedBlockNode {
    return new SharedBlockNode().updateFromJSON(json);
  }

  static importDOM(): DOMConversionMap {
    return {
      div: (element: HTMLElement) => {
        const id = element.getAttribute("data-shared-block");
        return id === null || id === ""
          ? null
          : { conversion: () => ({ node: new SharedBlockNode(id) }), priority: 2 };
      },
    };
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedSharedBlockNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__sharedId = typeof json.sharedId === "string" ? json.sharedId : "";
    return node;
  }

  exportJSON(): SerializedSharedBlockNode {
    return { ...super.exportJSON(), sharedId: this.getSharedId() };
  }

  exportDOM(): DOMExportOutput {
    return {
      element: buildDrawn({ tag: "div", attributes: { "data-shared-block": this.getSharedId() } }),
    };
  }

  getSharedId(): string {
    return this.getLatest().__sharedId;
  }

  decorate(): Decoration<this> {
    return (node) => <SharedFrame nodeKey={node().getKey()} sharedId={node().__sharedId} />;
  }
}

export function $createSharedBlockNode(sharedId: string): SharedBlockNode {
  return new SharedBlockNode(sharedId);
}

export function $isSharedBlockNode(node: LexicalNode | null | undefined): node is SharedBlockNode {
  return node instanceof SharedBlockNode;
}

/** A block as a document of its own, as a shared block keeps it. */
export function $blockDocument(block: LexicalNode): SerializedEditorState {
  return {
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [$deepJSON(block)],
    },
  };
}

interface SerializedParent extends SerializedLexicalNode {
  children?: SerializedLexicalNode[];
}

function holdsShared(node: SerializedParent): boolean {
  return node.type === "shared" || (node.children ?? []).some(holdsShared);
}

/**
 * Whether a block may be kept to show in many documents: one at the top of
 * the document, holding no shared block, which would let one edit reach
 * further than its writer sees, and that the source takes.
 */
export function $sharableBlock(block: LexicalNode, source: SharedBlockSource): boolean {
  if (!$isRootNode(block.getParent())) return false;
  const content = $blockDocument(block);
  return !content.root.children.some(holdsShared) && source.sharable?.(content) !== false;
}

/** Puts the caret on the line after a block, making one where there is none. */
function $caretAfter(node: LexicalNode): void {
  const next = node.getNextSibling();
  if ($isParagraphNode(next)) {
    next.selectStart();
    return;
  }
  const line = $createParagraphNode();
  node.insertAfter(line);
  line.selectStart();
}

/** Keeps the block with `key` as a shared block and shows the shared block in its place. */
export function keepSharedBlock(
  editor: LexicalEditor,
  source: SharedBlockSource,
  key: NodeKey,
): void {
  const content = editor.read(() => {
    const block = $getNodeByKey(key);
    return block === null ? null : $blockDocument(block);
  });
  if (content === null) return;
  void source.keep(content).then((id) => {
    if (id === null) return;
    editor.update(() => {
      const block = $getNodeByKey(key);
      if (block === null || !block.isAttached()) return;
      const node = $createSharedBlockNode(id);
      block.replace(node);
      $caretAfter(node);
    });
  });
}

/** Asks the source for a shared block and shows it where the caret was when asked. */
export function chooseSharedBlock(editor: LexicalEditor, source: SharedBlockSource): void {
  const anchor = editor.read(() => {
    const selection = $getSelection();
    return $isRangeSelection(selection)
      ? ($rootBlockOf(selection.anchor.getNode())?.getKey() ?? null)
      : null;
  });
  void source.choose().then((id) => {
    if (id === null) return;
    editor.update(() => {
      const node = $createSharedBlockNode(id);
      const at = anchor === null ? null : $getNodeByKey(anchor);
      if (at === null || !at.isAttached()) $getRoot().append(node);
      else if ($isParagraphNode(at) && at.getTextContentSize() === 0) at.replace(node);
      else at.insertAfter(node);
      $caretAfter(node);
    });
  });
}

/** Puts the shared block's content in its place, a copy that changes only here. */
export function copySharedBlockHere(
  editor: LexicalEditor,
  source: SharedBlockSource,
  key: NodeKey,
  id: string,
): void {
  void source.read(id).then((content) => {
    if (content === null) return;
    editor.update(() => {
      const node = $getNodeByKey(key);
      if (node === null || !node.isAttached()) return;
      const copies = content.root.children.map((child) => $parseSerializedNode(child));
      for (const copy of copies.toReversed()) node.insertAfter(copy);
      node.remove();
      const last = copies.at(-1);
      if ($isElementNode(last)) last.selectEnd();
      else last?.selectNext();
    });
  });
}

interface SharedLookProps {
  sharedId: string;
  cls: SharedBlockSlots;
  rootClass?: string;
  View: SharedBlockSource["View"] | undefined;
  actions?: JSX.Element;
}

/** A shared block in a document being written: named as one, its actions beside the name, drawn as it now is. */
function SharedLook(props: SharedLookProps) {
  const messages = useArcMessages();
  const View = props.View;
  return (
    <div
      class={arc(props.cls.root, props.rootClass)}
      data-slot="shared-block"
      data-shared-id={props.sharedId}
    >
      <div class={props.cls.bar} data-slot="shared-block-bar">
        <span class={props.cls.label} data-slot="shared-block-label">
          <Repeat2 aria-hidden="true" />
          {messages().sharedBlock}
        </span>
        {props.actions}
      </div>
      {View === undefined ? null : (
        <div class={props.cls.view} data-slot="shared-block-view">
          <View id={props.sharedId} />
        </div>
      )}
    </div>
  );
}

interface SharedFrameProps {
  nodeKey: NodeKey;
  sharedId: string;
}

function SharedFrame(props: SharedFrameProps) {
  const editor = useLexicalEditor();
  const editable = useLexicalEditable();
  const messages = useArcMessages();
  const [selected] = useLexicalNodeSelection(props.nodeKey);
  const source = sources.get(editor);
  const look = looks.get(editor) ?? {};
  const cls = parts(sharedBlockStyles(), look.classes);
  return (
    <SharedLook
      sharedId={props.sharedId}
      cls={cls}
      rootClass={arc(
        look.class,
        look.className,
        selected() ? documentStyles().blockSelected : undefined,
      )}
      View={source?.View}
      actions={
        <Show when={source !== undefined && editable()}>
          <Button
            variant="ghost"
            size="xs"
            class={cls.action}
            data-slot="shared-block-edit"
            onPress={() => source?.edit(props.sharedId)}
          >
            <Pencil aria-hidden="true" />
            {messages().editSharedBlock}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            class={cls.action}
            data-slot="shared-block-copy"
            onPress={() => {
              if (source !== undefined) {
                copySharedBlockHere(editor, source, props.nodeKey, props.sharedId);
              }
            }}
          >
            <Copy aria-hidden="true" />
            {messages().copySharedBlockHere}
          </Button>
        </Show>
      }
    />
  );
}

const SHARED_LINE = /^<div data-shared-block="([^"]+)"><\/div>\s*$/;

const SHARED_MARKDOWN: ElementTransformer = {
  type: "element",
  dependencies: [SharedBlockNode],
  regExp: SHARED_LINE,
  export: (node) =>
    $isSharedBlockNode(node)
      ? `<div data-shared-block="${node.getSharedId().replaceAll('"', "&quot;")}"></div>`
      : null,
  replace: (parent, _children, match) => {
    const id = (match[1] ?? "").replaceAll("&quot;", '"');
    if (id === "") return false;
    parent.replace($createSharedBlockNode(id));
    return undefined;
  },
};

export interface SharedBlockOptions extends Customisable<SharedBlockSlots> {
  /** Where the app keeps its shared blocks. Without one a document still opens and keeps those it holds, and shows none. */
  source?: SharedBlockSource;
}

/**
 * Shared blocks: a block kept once and shown in many documents, which the
 * document stores as `{ type: "shared", sharedId }` and draws as it now is
 * through the source's `View`. The `/` menu offers one the source chooses,
 * a block's menu keeps a top-level block as one, and in the editor each
 * offers Edit everywhere and Copy here, which puts a copy in its place to
 * change apart. Markdown and HTML keep it as `<div data-shared-block>`.
 */
export function sharedBlockExtension(options: SharedBlockOptions = {}): EditorExtension {
  const source = options.source;
  function cls(): SharedBlockSlots {
    return parts(sharedBlockStyles(), options.classes);
  }
  return defineEditorExtension({
    name: "arc/shared-block",
    nodes: [SharedBlockNode],
    register: (editor) => {
      if (source !== undefined) sources.set(editor, source);
      looks.set(editor, options);
      return () => {
        sources.delete(editor);
        looks.delete(editor);
      };
    },
    commands:
      source === undefined
        ? []
        : [
            {
              id: "shared-block",
              label: (messages) => messages.sharedBlock,
              description: (messages) => messages.sharedBlockHint,
              icon: () => <Repeat2 />,
              keywords: ["shared", "synced", "reuse", "reused"],
              run: (editor) => chooseSharedBlock(editor, source),
            },
          ],
    blockActions:
      source === undefined
        ? []
        : [
            {
              id: "keep-shared-block",
              $label: (block) =>
                $sharableBlock(block, source) ? (messages) => messages.keepAsSharedBlock : null,
              run: (editor, key) => keepSharedBlock(editor, source, key),
            },
          ],
    markdown: [SHARED_MARKDOWN],
    render: {
      shared: (node, scope) => {
        const id = typeof node.sharedId === "string" ? node.sharedId : "";
        if (scope.editing) {
          return (
            <div>
              <SharedLook
                sharedId={id}
                cls={cls()}
                rootClass={arc(options.class, options.className)}
                View={source?.View}
              />
            </div>
          );
        }
        const View = source?.View;
        if (View === undefined || id === "") return null;
        return (
          <div
            class={arc(cls().view, options.class, options.className)}
            data-slot="shared-block"
            data-shared-id={id}
          >
            <View id={id} />
          </div>
        );
      },
    },
  });
}
