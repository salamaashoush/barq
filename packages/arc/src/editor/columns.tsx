import { variants } from "@barqjs/css";
import { Columns2 } from "@barqjs/lucide/icons/columns-2";
import { Columns3 } from "@barqjs/lucide/icons/columns-3";
import {
  $convertToMarkdownString,
  type ElementTransformer,
  type Transformer,
} from "@lexical/markdown";
import {
  $createParagraphNode,
  $isParagraphNode,
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
import { edge, gap, layout, rounded, space } from "../style/index.ts";
import {
  type Drawn,
  DrawnElement,
  $fillEmpty,
  $placeContainer,
  $unwrapInto,
  buildDrawn,
  registerContainerKeys,
} from "./containers.tsx";
import { defineEditorExtension } from "./extension.ts";
import { blockGap } from "./theme.ts";

/** How a set of columns shares the width: equal halves, a narrow and a wide, thirds, quarters. */
export type ColumnLayout = "1:1" | "1:2" | "2:1" | "1:1:1" | "1:1:1:1";

export const COLUMN_LAYOUTS: readonly ColumnLayout[] = ["1:1", "1:2", "2:1", "1:1:1", "1:1:1:1"];

export const columnsStyles = variants({
  slots: {
    // Columns side by side as far as each keeps a readable width, then one under another.
    root: arc(layout.wrap, gap[6], blockGap, { display: "flex" }),
    column: arc(layout.minZero, {
      flex: "var(--share, 1) 1 0",
      minInlineSize: "min(100%, 12rem)",
      "& > :last-child": { marginBlockEnd: "0px" },
    }),
  },
  variants: {
    editing: {
      true: { column: arc(edge.frame, rounded.md, { borderStyle: "dashed", padding: space.x2 }) },
      false: {},
    },
  },
  defaults: { editing: false },
});

function layoutOf(value: unknown): ColumnLayout {
  return COLUMN_LAYOUTS.find((one) => one === value) ?? "1:1";
}

/** The share of the width each column takes. */
export function columnShares(columns: ColumnLayout): number[] {
  return columns.split(":").map(Number);
}

/** The layout of `count` equal columns. */
function equalLayout(count: number): ColumnLayout {
  return count >= 4 ? "1:1:1:1" : count === 3 ? "1:1:1" : "1:1";
}

export function drawColumns(themeClass?: unknown): Drawn {
  const own = columnsStyles().root;
  return {
    tag: "div",
    attributes: {
      class: typeof themeClass === "string" && themeClass !== "" ? arc(own, themeClass) : own,
      "data-slot": "columns",
    },
  };
}

export function drawColumn(share: number, editing: boolean, themeClass?: unknown): Drawn {
  const own = columnsStyles({ editing }).column;
  return {
    tag: "div",
    attributes: {
      class: typeof themeClass === "string" && themeClass !== "" ? arc(own, themeClass) : own,
      "data-slot": "column",
      style: `--share: ${String(share)}`,
    },
  };
}

export type SerializedColumnsNode = Spread<{ layout: ColumnLayout }, SerializedElementNode>;

/** Blocks laid out in columns side by side, which stack on a narrow screen. */
export class ColumnsNode extends ElementNode {
  __layout: ColumnLayout;

  constructor(columns: ColumnLayout = "1:1", key?: NodeKey) {
    super(key);
    this.__layout = columns;
  }

  $config() {
    return this.config("columns", { extends: ElementNode });
  }

  static clone(node: ColumnsNode): ColumnsNode {
    return new ColumnsNode(node.__layout, node.__key);
  }

  static importJSON(json: SerializedColumnsNode): ColumnsNode {
    return new ColumnsNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedColumnsNode>): this {
    return super.updateFromJSON(json).setLayout(layoutOf(json.layout));
  }

  exportJSON(): SerializedColumnsNode {
    return { ...super.exportJSON(), layout: this.getLayout() };
  }

  exportDOM(): DOMExportOutput {
    const template = columnShares(this.getLayout())
      .map((share) => `minmax(0, ${String(share)}fr)`)
      .join(" ");
    const element = buildDrawn({
      tag: "div",
      attributes: {
        "data-columns": this.getLayout(),
        style: `display: grid; grid-template-columns: ${template}`,
      },
    });
    return { element };
  }

  createDOM(config: EditorConfig): HTMLElement {
    return buildDrawn(drawColumns(config.theme.columns));
  }

  /** Its columns draw their shares, so a new layout draws them again. */
  updateDOM(previous: this): boolean {
    return previous.__layout !== this.__layout;
  }

  isShadowRoot(): boolean {
    return true;
  }

  canBeEmpty(): boolean {
    return false;
  }

  getLayout(): ColumnLayout {
    return this.getLatest().__layout;
  }

  setLayout(columns: ColumnLayout): this {
    const writable = this.getWritable();
    writable.__layout = columns;
    return writable;
  }
}

/** One column of a set, holding its blocks. */
export class ColumnNode extends ElementNode {
  $config() {
    return this.config("column", { extends: ElementNode });
  }

  createDOM(config: EditorConfig): HTMLElement {
    const parent = this.getParent();
    const shares = $isColumnsNode(parent) ? columnShares(parent.getLayout()) : [];
    return buildDrawn(
      drawColumn(shares[this.getIndexWithinParent()] ?? 1, true, config.theme.column),
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

  /** Backspace at the start of an empty set of columns takes the set away. */
  collapseAtStart(): boolean {
    const columns = this.getParent();
    if (
      $isColumnsNode(columns) &&
      this.is(columns.getFirstChild()) &&
      columns.getChildren().every($isEmptyColumn)
    ) {
      const line = $createParagraphNode();
      columns.replace(line);
      line.selectStart();
      return true;
    }
    return false;
  }
}

export function $isEmptyColumn(node: LexicalNode): boolean {
  if (!$isColumnNode(node) || node.getChildrenSize() !== 1) return false;
  const first = node.getFirstChild();
  return $isParagraphNode(first) && first.isEmpty();
}

export function $createColumnsNode(columns: ColumnLayout = "1:1"): ColumnsNode {
  return new ColumnsNode(columns);
}

export function $createColumnNode(): ColumnNode {
  return new ColumnNode();
}

export function $isColumnsNode(node: LexicalNode | null | undefined): node is ColumnsNode {
  return node instanceof ColumnsNode;
}

export function $isColumnNode(node: LexicalNode | null | undefined): node is ColumnNode {
  return node instanceof ColumnNode;
}

/**
 * Gives a set of columns a layout: columns it gains start empty, and what
 * columns it loses held goes into the last one it keeps.
 */
export function $setColumnLayout(columns: ColumnsNode, next: ColumnLayout): void {
  const count = columnShares(next).length;
  const children = columns.getChildren().filter($isColumnNode);
  for (let index = children.length; index < count; index++) {
    columns.append($createColumnNode().append($createParagraphNode()));
  }
  const kept = children[count - 1];
  if (kept !== undefined) {
    for (const extra of children.slice(count)) {
      for (const child of extra.getChildren()) {
        if (!($isParagraphNode(child) && child.isEmpty())) kept.append(child);
      }
      extra.remove();
    }
  }
  columns.setLayout(next);
}

/** Puts a set of `count` empty columns where the caret is, at the document's top level. */
export function $insertColumns(count: 2 | 3 | 4): ColumnsNode {
  const columns = $createColumnsNode(equalLayout(count));
  $placeContainer(columns, {
    topLevel: true,
    fill: () =>
      Array.from({ length: count }, () => $createColumnNode().append($createParagraphNode())),
  });
  return columns;
}

/** Each column's blocks, one column after another: markdown has no columns of its own. */
function columnsMarkdown(all: () => readonly Transformer[]): ElementTransformer {
  return {
    type: "element",
    dependencies: [ColumnsNode, ColumnNode],
    regExp: /(?!)/,
    export: (node) =>
      $isColumnsNode(node)
        ? node
            .getChildren()
            .map((column) =>
              $isColumnNode(column) ? $convertToMarkdownString([...all()], column) : "",
            )
            .filter((text) => text !== "")
            .join("\n\n")
        : null,
    replace: () => false,
  };
}

/**
 * Columns: two to four, sharing the width equally or as a narrow and a wide,
 * side by side while each keeps a readable width and stacked on a phone.
 * The block menu changes the layout, keeping every column's blocks, and
 * Backspace at the start of an empty set takes it away.
 */
export const columnsExtension = defineEditorExtension({
  name: "arc/columns",
  nodes: [ColumnsNode, ColumnNode],
  register: (editor) =>
    mergeRegister(
      editor.registerNodeTransform(ColumnNode, (node) => {
        if (!$isColumnsNode(node.getParent())) $unwrapInto(node);
        else $fillEmpty(node);
      }),
      editor.registerNodeTransform(ColumnsNode, (node) => {
        const children = node.getChildren();
        if (children.length < 2 || !children.every($isColumnNode)) {
          for (const child of children) {
            if ($isColumnNode(child)) $unwrapInto(child);
          }
          $unwrapInto(node);
          return;
        }
        if (columnShares(node.getLayout()).length !== children.length) {
          node.setLayout(equalLayout(children.length));
        }
      }),
      registerContainerKeys(editor, { isContainer: $isColumnsNode }),
    ),
  commands: [
    {
      id: "columns-2",
      label: (messages) => messages.twoColumns,
      group: (messages) => messages.layoutBlocks,
      icon: () => <Columns2 />,
      keywords: ["columns", "side by side", "layout"],
      run: (editor) => editor.update(() => void $insertColumns(2)),
    },
    {
      id: "columns-3",
      label: (messages) => messages.threeColumns,
      group: (messages) => messages.layoutBlocks,
      icon: () => <Columns3 />,
      keywords: ["columns", "side by side", "layout"],
      run: (editor) => editor.update(() => void $insertColumns(3)),
    },
  ],
  blockMenu: [
    {
      id: "column-layout",
      label: (messages) => messages.columnLayout,
      $read: (block) =>
        $isColumnsNode(block)
          ? {
              value: block.getLayout(),
              options: COLUMN_LAYOUTS.map((value) => ({
                value,
                label: (messages) => messages.columnLayoutName(columnShares(value)),
              })),
            }
          : null,
      $choose: (block, value) => {
        if ($isColumnsNode(block)) $setColumnLayout(block, layoutOf(value));
      },
    },
  ],
  markdown: (all) => [columnsMarkdown(all)],
  render: {
    columns: (node, scope) => {
      const shares = columnShares(layoutOf(node.layout));
      return (
        <DrawnElement drawn={drawColumns()}>
          {(node.children ?? []).map((column, index) => (
            <DrawnElement drawn={drawColumn(shares[index] ?? 1, scope.editing)}>
              {scope.children(column)}
            </DrawnElement>
          ))}
        </DrawnElement>
      );
    },
  },
});
