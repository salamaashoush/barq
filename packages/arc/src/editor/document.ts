import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleExtension,
  HorizontalRuleNode,
  buildEditorFromExtensions,
} from "@lexical/extension";
import { HistoryExtension } from "@lexical/history";
import {
  AutoLinkExtension,
  LinkExtension,
  autoLinkEmailMatcher,
  autoLinkUrlMatcher,
} from "@lexical/link";
import { CheckListExtension, ListExtension } from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  CHECK_LIST,
  ELEMENT_TRANSFORMERS,
  type ElementTransformer,
  MULTILINE_ELEMENT_TRANSFORMERS,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
  type TextMatchTransformer,
  type Transformer,
  isTableRowDivider,
  registerMarkdownShortcuts,
} from "@lexical/markdown";
import { RichTextExtension } from "@lexical/rich-text";
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates,
  TableCellNode,
  TableExtension,
  TableNode,
  TableRowNode,
} from "@lexical/table";
import {
  $getRoot,
  $isParagraphNode,
  $isTextNode,
  type AnyLexicalExtensionArgument,
  type EditorThemeClasses,
  type Klass,
  type LexicalEditor,
  type LexicalNode,
  type SerializedEditorState,
  configExtension,
  defineExtension,
} from "lexical";

import type { AnyBlock } from "./blocks.tsx";
import { CodeHighlightExtension } from "./code-highlight.ts";
import { EmbedBlock, ImageBlock } from "./media.tsx";
import { $createMentionNode, $isMentionNode, MentionNode } from "./mention-node.ts";
import { editorTheme } from "./theme.ts";

/** A web, mail or phone address, or a path on the same site: what a link may point at. */
export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === "") return false;
  if (/^(?:\/(?!\/)|\.{1,2}\/|#|\?)/.test(trimmed)) return true;
  try {
    return ["http:", "https:", "mailto:", "tel:"].includes(new URL(trimmed).protocol);
  } catch {
    return false;
  }
}

/** What every document holds beyond Lexical's own rich text: the built-in blocks. */
export const BUILT_IN_BLOCKS: readonly AnyBlock[] = [ImageBlock, EmbedBlock];

/** The blocks a document knows: the built-in ones and an app's, an app's winning by type. */
export function documentBlocks(blocks: readonly AnyBlock[] = []): AnyBlock[] {
  const byType = new Map<string, AnyBlock>();
  for (const block of [...BUILT_IN_BLOCKS, ...blocks]) byType.set(block.type, block);
  return [...byType.values()];
}

const MENTION: TextMatchTransformer = {
  dependencies: [MentionNode],
  export: (node) =>
    $isMentionNode(node)
      ? `[${node.getTextContent()}](mention:${encodeURIComponent(node.getMentionId())})`
      : null,
  importRegExp: /\[([@#])([^\]]+)\]\(mention:([^)\s]+)\)/,
  regExp: /\[([@#])([^\]]+)\]\(mention:([^)\s]+)\)$/,
  replace: (node, match) => {
    node.replace(
      $createMentionNode({
        trigger: match[1] ?? "@",
        name: match[2] ?? "",
        id: decodeURIComponent(match[3] ?? ""),
      }),
    );
  },
  trigger: ")",
  type: "text-match",
};

const HR: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node) => ($isHorizontalRuleNode(node) ? "***" : null),
  regExp: /^(?:---|\*\*\*|___)\s?$/,
  replace: (parent, _children, _match, isImport) => {
    const line = $createHorizontalRuleNode();
    if (isImport || parent.getNextSibling() !== null) parent.replace(line);
    else parent.insertBefore(line);
    line.selectNext();
  },
  type: "element",
};

const TABLE_ROW = /^\|(.+)\|\s?$/;

function tableTransformer(cellTransformers: () => Transformer[]): ElementTransformer {
  const cell = (text: string) => {
    const node = $createTableCellNode(TableCellHeaderStates.NO_STATUS);
    $convertFromMarkdownString(text.replace(/\\n/g, "\n").trim(), cellTransformers(), node);
    return node;
  };
  const cells = (line: string) => {
    const match = TABLE_ROW.exec(line);
    return match?.[1] === undefined ? null : match[1].split("|").map(cell);
  };
  const columns = (table: TableNode): number => {
    const row = table.getFirstChild();
    return $isTableRowNode(row) ? row.getChildrenSize() : 0;
  };
  return {
    dependencies: [TableNode, TableRowNode, TableCellNode],
    export: (node) => {
      if (!$isTableNode(node)) return null;
      const out: string[] = [];
      for (const row of node.getChildren()) {
        if (!$isTableRowNode(row)) continue;
        let header = false;
        const texts: string[] = [];
        for (const one of row.getChildren()) {
          if (!$isTableCellNode(one)) continue;
          texts.push(
            $convertToMarkdownString(cellTransformers(), one).replace(/\n/g, "\\n").trim(),
          );
          if ((one.getHeaderStyles() & TableCellHeaderStates.ROW) !== 0) header = true;
        }
        out.push(`| ${texts.join(" | ")} |`);
        if (header) out.push(`| ${texts.map(() => "---").join(" | ")} |`);
      }
      return out.join("\n");
    },
    regExp: TABLE_ROW,
    replace: (parent, _children, match) => {
      const line = match[0] ?? "";
      if (isTableRowDivider(line)) {
        const table = parent.getPreviousSibling();
        const last = $isTableNode(table) ? table.getLastChild() : null;
        if ($isTableRowNode(last)) {
          for (const one of last.getChildren()) {
            if ($isTableCellNode(one)) {
              one.setHeaderStyles(TableCellHeaderStates.ROW, TableCellHeaderStates.ROW);
            }
          }
          parent.remove();
        }
        return;
      }
      const first = cells(line);
      if (first === null) return;
      const rows = [first];
      let width = first.length;
      let sibling = parent.getPreviousSibling();
      while ($isParagraphNode(sibling) && sibling.getChildrenSize() === 1) {
        const text = sibling.getFirstChild();
        const row = $isTextNode(text) ? cells(text.getTextContent()) : null;
        if (row === null) break;
        width = Math.max(width, row.length);
        rows.unshift(row);
        const previous = sibling.getPreviousSibling();
        sibling.remove();
        sibling = previous;
      }
      const table = $createTableNode();
      for (const row of rows) {
        const node = $createTableRowNode();
        for (let index = 0; index < width; index++) node.append(row[index] ?? cell(""));
        table.append(node);
      }
      const previous = parent.getPreviousSibling();
      if ($isTableNode(previous) && columns(previous) === width) {
        previous.append(...table.getChildren());
        parent.remove();
      } else {
        parent.replace(table);
      }
      table.selectEnd();
    },
    type: "element",
  };
}

function blockTransformer(block: AnyBlock): ElementTransformer {
  const from = block.fromMarkdown;
  return {
    dependencies: [block.node],
    export: (node) =>
      block.$is(node) ? (node.getDefinition().toMarkdown?.(node.getData()) ?? null) : null,
    regExp: from?.regExp ?? /(?!)/,
    replace: (parent, _children, match) => {
      const data = from?.data(match);
      if (data === null || data === undefined) return false;
      parent.replace(block.$create().setData(data));
      return undefined;
    },
    type: "element",
  };
}

/**
 * Every markdown rule a document reads and writes: Lexical's own, check
 * lists, tables, dividers, mentions as `[@Name](mention:id)`, and each
 * block's own line.
 */
export function markdownTransformers(blocks: readonly AnyBlock[] = []): Transformer[] {
  const all: Transformer[] = [];
  all.push(
    tableTransformer(() => all),
    HR,
    ...documentBlocks(blocks).map(blockTransformer),
    CHECK_LIST,
    ...ELEMENT_TRANSFORMERS,
    ...MULTILINE_ELEMENT_TRANSFORMERS,
    ...TEXT_FORMAT_TRANSFORMERS,
    MENTION,
    ...TEXT_MATCH_TRANSFORMERS,
  );
  return all;
}

export interface DocumentOptions {
  /** Blocks of an app's own, beside images and embeds. */
  blocks?: readonly AnyBlock[];
  /** Nodes of an app's own. */
  nodes?: readonly Klass<LexicalNode>[];
  /** Tables, with rows and columns added and removed. @default true */
  tables?: boolean;
  /** Typed markdown becomes formatting: `# `, `- `, `**bold**`. @default true */
  markdownShortcuts?: boolean;
  /** Undo and redo. Off for a shared document, whose own history takes over. @default true */
  history?: boolean;
  /** An address typed or pasted becomes a link. @default true */
  autoLink?: boolean;
  theme?: EditorThemeClasses;
}

/**
 * The extensions a document is built from, in the editor, the renderer and
 * on a server alike, so all three read the same JSON.
 */
export function documentExtensions(options: DocumentOptions = {}): AnyLexicalExtensionArgument[] {
  const blocks = documentBlocks(options.blocks);
  const extensions: AnyLexicalExtensionArgument[] = [
    RichTextExtension,
    ListExtension,
    CheckListExtension,
    configExtension(LinkExtension, { validateUrl: isSafeUrl }),
    CodeHighlightExtension,
    HorizontalRuleExtension,
    defineExtension({
      name: "@barqjs/arc/document",
      nodes: () => [MentionNode, ...blocks.map((block) => block.node), ...(options.nodes ?? [])],
      theme: options.theme ?? editorTheme(),
    }),
  ];
  if (options.tables !== false) {
    extensions.push(configExtension(TableExtension, { hasHorizontalScroll: true }));
  }
  if (options.autoLink !== false) {
    extensions.push(
      configExtension(AutoLinkExtension, { matchers: [autoLinkUrlMatcher, autoLinkEmailMatcher] }),
    );
  }
  if (options.history !== false) extensions.push(HistoryExtension);
  if (options.markdownShortcuts !== false) {
    const transformers = markdownTransformers(options.blocks);
    extensions.push(
      defineExtension({
        name: "@barqjs/arc/markdown-shortcuts",
        register: (editor) => registerMarkdownShortcuts(editor, transformers),
      }),
    );
  }
  return extensions;
}

/**
 * An editor with no screen, for a server or a conversion: the same nodes as
 * `RichTextEditor`, so it reads and writes the same documents. Dispose it
 * when done.
 */
export function createDocumentEditor(
  options: DocumentOptions = {},
): LexicalEditor & { dispose: () => void } {
  return buildEditorFromExtensions(
    ...documentExtensions({ ...options, history: false, markdownShortcuts: false }),
    defineExtension({
      name: "@barqjs/arc/headless",
      $initialEditorState: null,
      onError: (error: Error) => {
        throw error;
      },
    }),
  );
}

/** A stored document: its JSON, as a string or parsed. */
export type DocumentValue = string | SerializedEditorState;

/** Markdown read into a document, with the same rules the editor types and exports with. */
export function markdownToDocument(
  markdown: string,
  options: DocumentOptions = {},
): SerializedEditorState {
  const editor = createDocumentEditor(options);
  try {
    const transformers = markdownTransformers(options.blocks);
    editor.update(() => $convertFromMarkdownString(markdown, transformers), { discrete: true });
    return editor.getEditorState().toJSON();
  } finally {
    editor.dispose();
  }
}

/** A document written as markdown. */
export function documentToMarkdown(value: DocumentValue, options: DocumentOptions = {}): string {
  const editor = createDocumentEditor(options);
  try {
    editor.setEditorState(editor.parseEditorState(value));
    const transformers = markdownTransformers(options.blocks);
    return editor.read(() => $convertToMarkdownString(transformers));
  } finally {
    editor.dispose();
  }
}

/** A document's text alone, as a search index or a notification wants it. */
export function documentToText(value: DocumentValue, options: DocumentOptions = {}): string {
  const editor = createDocumentEditor(options);
  try {
    editor.setEditorState(editor.parseEditorState(value));
    return editor.read(() => $getRoot().getTextContent());
  } finally {
    editor.dispose();
  }
}
