import { type Child } from "@barqjs/core";
import { useLexicalEditor } from "@barqjs/lexical";
import { Heading1 } from "@barqjs/lucide/icons/heading-1";
import { Heading2 } from "@barqjs/lucide/icons/heading-2";
import { Heading3 } from "@barqjs/lucide/icons/heading-3";
import { List } from "@barqjs/lucide/icons/list";
import { ListChecks } from "@barqjs/lucide/icons/list-checks";
import { ListOrdered } from "@barqjs/lucide/icons/list-ordered";
import { Minus } from "@barqjs/lucide/icons/minus";
import { Pilcrow } from "@barqjs/lucide/icons/pilcrow";
import { Quote } from "@barqjs/lucide/icons/quote";
import { SquareCode } from "@barqjs/lucide/icons/square-code";
import { SquarePlay } from "@barqjs/lucide/icons/square-play";
import { Table } from "@barqjs/lucide/icons/table";
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleExtension,
  HorizontalRuleNode,
} from "@lexical/extension";
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
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $isNodeSelection,
  $isParagraphNode,
  $isTextNode,
  BEFORE_INPUT_COMMAND,
  COMMAND_PRIORITY_LOW,
  type LexicalEditor,
  configExtension,
} from "lexical";

import { CodeHighlightExtension } from "./code-highlight.ts";
import {
  OPEN_EMBED_DIALOG_COMMAND,
  OPEN_TABLE_DIALOG_COMMAND,
  TEXT_BLOCK_TYPES,
  type TextBlockType,
  indent,
  insertDivider,
  insertTable,
  setTextBlock,
  textBlockLabel,
  toggleMark,
} from "./commands.ts";
import { type EditorExtension, defineEditorExtension } from "./extension.ts";
import { useDialogCommand } from "./hooks.ts";
import { DEFAULT_EMBED_PROVIDERS, EmbedBlock, type EmbedProvider, resolveEmbed } from "./media.tsx";
import { EmbedDialog } from "./media-insert.tsx";
import { $createMentionNode, $isMentionNode, MentionNode } from "./mention-node.ts";
import { TableControls, registerTableKeys } from "./table-controls.tsx";
import { TableDialog } from "./table-size.tsx";

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

const KEYWORDS: Record<TextBlockType, readonly string[]> = {
  paragraph: ["text", "plain"],
  h1: ["heading", "title"],
  h2: ["heading", "subtitle"],
  h3: ["heading"],
  bullet: ["list", "unordered"],
  number: ["list", "ordered"],
  check: ["list", "todo", "task"],
  quote: ["blockquote", "citation"],
  code: ["snippet", "pre"],
};

const TEXT_ICONS: Record<TextBlockType, () => Child> = {
  paragraph: () => <Pilcrow />,
  h1: () => <Heading1 />,
  h2: () => <Heading2 />,
  h3: () => <Heading3 />,
  bullet: () => <List />,
  number: () => <ListOrdered />,
  check: () => <ListChecks />,
  quote: () => <Quote />,
  code: () => <SquareCode />,
};

/**
 * Typing with a block chosen whole starts a line after it. Lexical leaves
 * that keystroke to the browser, which, with no caret in the text, writes
 * the letter at the start of the document.
 */
function $typeAfterSelectedBlock(event: InputEvent): boolean {
  if (event.inputType !== "insertText" || event.data === null || event.data === "") return false;
  const selection = $getSelection();
  if (!$isNodeSelection(selection)) return false;
  const block = selection.getNodes().at(-1)?.getTopLevelElement() ?? selection.getNodes().at(-1);
  if (block === undefined || block === null) return false;
  event.preventDefault();
  const next = block.getNextSibling();
  const line =
    $isParagraphNode(next) && next.getTextContentSize() === 0
      ? next
      : block.insertAfter($createParagraphNode());
  if ($isParagraphNode(line)) {
    line.append($createTextNode(event.data));
    line.selectEnd();
  }
  return true;
}

/**
 * Rich text itself: paragraphs, headings, lists and check lists, quotes,
 * code blocks highlighted as `CodeBlock` highlights them, links, the marks,
 * the keys Lexical leaves to an app and the markdown they are written in.
 */
export const richTextExtension = defineEditorExtension({
  name: "arc/rich-text",
  register: (editor) =>
    editor.registerCommand(BEFORE_INPUT_COMMAND, $typeAfterSelectedBlock, COMMAND_PRIORITY_LOW),
  lexical: [
    RichTextExtension,
    ListExtension,
    CheckListExtension,
    configExtension(LinkExtension, { validateUrl: isSafeUrl }),
    CodeHighlightExtension,
  ],
  commands: TEXT_BLOCK_TYPES.map((block) => ({
    id: block,
    label: (messages) => textBlockLabel(block, messages),
    icon: TEXT_ICONS[block],
    keywords: KEYWORDS[block],
    places: ["slash", "picker"] as const,
    run: (editor: LexicalEditor) => setTextBlock(editor, block),
  })),
  keys: [
    { keys: "Mod+e", run: (editor) => toggleMark(editor, "code") },
    { keys: "Mod+Shift+x", run: (editor) => toggleMark(editor, "strikethrough") },
    { keys: "Mod+Shift+7", run: (editor) => setTextBlock(editor, "number") },
    { keys: "Mod+Shift+8", run: (editor) => setTextBlock(editor, "bullet") },
    { keys: "Mod+Shift+9", run: (editor) => setTextBlock(editor, "check") },
    { keys: "Mod+Alt+0", run: (editor) => setTextBlock(editor, "paragraph") },
    { keys: "Mod+Alt+1", run: (editor) => setTextBlock(editor, "h1") },
    { keys: "Mod+Alt+2", run: (editor) => setTextBlock(editor, "h2") },
    { keys: "Mod+Alt+3", run: (editor) => setTextBlock(editor, "h3") },
    { keys: "Mod+]", run: (editor) => indent(editor, "in") },
    { keys: "Mod+[", run: (editor) => indent(editor, "out") },
  ],
  markdown: [
    CHECK_LIST,
    ...ELEMENT_TRANSFORMERS,
    ...MULTILINE_ELEMENT_TRANSFORMERS,
    ...TEXT_FORMAT_TRANSFORMERS,
    ...TEXT_MATCH_TRANSFORMERS,
  ],
  // Lexical's own lines are the most general (`> `, `- `), so every
  // extension's more particular line is tried before them.
  markdownPriority: -100,
});

/** An address typed or pasted becomes a link. */
export const autoLinkExtension = defineEditorExtension({
  name: "arc/auto-link",
  lexical: [
    configExtension(AutoLinkExtension, { matchers: [autoLinkUrlMatcher, autoLinkEmailMatcher] }),
  ],
});

const TABLE_ROW = /^\|(.+)\|\s?$/;

function tableTransformer(cellTransformers: () => readonly Transformer[]): ElementTransformer {
  function cell(text: string) {
    const node = $createTableCellNode(TableCellHeaderStates.NO_STATUS);
    $convertFromMarkdownString(text.replace(/\\n/g, "\n").trim(), [...cellTransformers()], node);
    return node;
  }
  function cells(line: string) {
    const match = TABLE_ROW.exec(line);
    return match?.[1] === undefined ? null : match[1].split("|").map(cell);
  }
  function columns(table: TableNode): number {
    const row = table.getFirstChild();
    return $isTableRowNode(row) ? row.getChildrenSize() : 0;
  }
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
            $convertToMarkdownString([...cellTransformers()], one)
              .replace(/\n/g, "\\n")
              .trim(),
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

function TableDialogHost() {
  const editor = useLexicalEditor();
  const [open, setOpen] = useDialogCommand(OPEN_TABLE_DIALOG_COMMAND);
  return (
    <TableDialog
      open={open()}
      onOpenChange={setOpen}
      onPick={(rows, columns) => insertTable(editor, rows, columns)}
    />
  );
}

/**
 * Tables: sized on insert from a grid; rows and columns added, moved,
 * deleted and made headers, cells merged, split, coloured and aligned, rows
 * striped, from a button at the cell's corner and a grip on every row and
 * column; Tab in the last cell adds a row; columns resized at their edge;
 * and markdown's pipe tables.
 */
export const tableExtension = defineEditorExtension({
  name: "arc/table",
  lexical: [configExtension(TableExtension, { hasHorizontalScroll: true })],
  register: registerTableKeys,
  commands: [
    {
      id: "table",
      label: (messages) => messages.table,
      icon: () => <Table />,
      keywords: ["grid"],
      // The size picker where the editor has one, three by three otherwise.
      run: (editor) => {
        if (!editor.dispatchCommand(OPEN_TABLE_DIALOG_COMMAND, undefined)) insertTable(editor);
      },
    },
  ],
  markdown: (all) => [tableTransformer(all)],
  markdownPriority: 10,
  plugins: [() => <TableControls />, TableDialogHost],
});

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

/** A divider between blocks, `---` in markdown. */
export const dividerExtension = defineEditorExtension({
  name: "arc/divider",
  lexical: [HorizontalRuleExtension],
  commands: [
    {
      id: "divider",
      label: (messages) => messages.divider,
      icon: () => <Minus />,
      keywords: ["rule", "line", "hr"],
      run: insertDivider,
    },
  ],
  markdown: [HR],
});

export interface EmbedExtensionOptions {
  providers?: readonly EmbedProvider[];
}

/** Video and other pages framed from the sites `providers` allows: YouTube and Vimeo by default. */
export function embedExtension(options: EmbedExtensionOptions = {}): EditorExtension {
  const providers = options.providers ?? DEFAULT_EMBED_PROVIDERS;
  return defineEditorExtension({
    name: "arc/embed",
    dependencies: [EmbedBlock],
    commands: [
      {
        id: "embed",
        label: (messages) => messages.embed,
        group: (messages) => messages.mediaBlocks,
        icon: () => <SquarePlay />,
        keywords: ["video", "youtube", "vimeo"],
        run: (editor) => editor.dispatchCommand(OPEN_EMBED_DIALOG_COMMAND, undefined),
      },
    ],
    // An address a provider takes, pasted on an empty line, or a frame's
    // embed code anywhere, becomes the embed.
    paste: [
      {
        priority: 15,
        $paste: (data, selection) => {
          const text = data.getData("text/plain").trim();
          const frame = /^<iframe\b[^>]*\ssrc=["']([^"']+)["']/i.exec(text);
          const top = selection.anchor.getNode().getTopLevelElement();
          const emptyLine = $isParagraphNode(top) && top.getTextContentSize() === 0;
          const address = frame?.[1] ?? (emptyLine && !/\s/.test(text) ? text : null);
          const embed = address === null ? null : resolveEmbed(address, providers);
          if (embed === null || !selection.isCollapsed()) return false;
          const block = EmbedBlock.$create(embed);
          if (emptyLine && top !== null) top.replace(block);
          else selection.insertNodes([block]);
          if (block.getNextSibling() === null) block.insertAfter($createParagraphNode());
          block.selectNext();
          return true;
        },
      },
    ],
    plugins: [
      () => {
        const [open, setOpen] = useDialogCommand(OPEN_EMBED_DIALOG_COMMAND);
        return <EmbedDialog open={open()} onOpenChange={setOpen} providers={providers} />;
      },
    ],
  });
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

/** Mentions, as `MentionTypeahead` inserts them, written `[@Name](mention:id)` in markdown. */
export const mentionExtension = defineEditorExtension({
  name: "arc/mention",
  nodes: [MentionNode],
  markdown: [MENTION],
});
