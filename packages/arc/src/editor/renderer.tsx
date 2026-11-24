import { type Child, For, Show, createMemo } from "@barqjs/core";
import { type JSX, dynamic } from "@barqjs/web";
import {
  IS_BOLD,
  IS_CODE,
  IS_HIGHLIGHT,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  IS_SUBSCRIPT,
  IS_SUPERSCRIPT,
  IS_UNDERLINE,
  type SerializedEditorState,
  type SerializedLexicalNode,
} from "lexical";

import { CodeBlock } from "../code/code-block.tsx";
import { Link } from "../components/text-link.tsx";
import { proseStyles } from "../components/typography.tsx";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import type { AnyBlock, BlockDefinition } from "./blocks.tsx";
import {
  type DocumentOptions,
  type DocumentValue,
  createDocumentEditor,
  documentBlocks,
  markdownToDocument,
} from "./document.ts";
import { type DocumentSlots, documentStyles } from "./theme.ts";

/** A node as stored, read loosely: every type of node a document holds. */
interface StoredNode extends SerializedLexicalNode {
  children?: StoredNode[];
  text?: string;
  format?: number | string;
  indent?: number;
  tag?: string;
  listType?: "bullet" | "number" | "check";
  start?: number;
  checked?: boolean;
  url?: string;
  title?: string | null;
  language?: string | null;
  headerState?: number;
  colSpan?: number;
  rowSpan?: number;
  mentionId?: string;
  mentionName?: string;
  trigger?: string;
  data?: unknown;
}

/** A mention as `RichTextRenderer` hands it to `renderMention`. */
export interface RenderedMention {
  id: string;
  name: string;
  trigger: string;
}

interface RenderContext {
  slots: DocumentSlots;
  blocks: ReadonlyMap<string, BlockDefinition<unknown>>;
  headingOffset: number;
  renderMention?: (mention: RenderedMention) => Child;
  linkHref?: (url: string) => string;
}

const ALIGNMENTS = new Set(["left", "start", "center", "right", "end", "justify"]);

function blockStyle(node: StoredNode): Record<string, string> | undefined {
  const style: Record<string, string> = {};
  if (typeof node.format === "string" && ALIGNMENTS.has(node.format)) {
    style["text-align"] = node.format;
  }
  if (typeof node.indent === "number" && node.indent > 0) {
    style["padding-inline-start"] = `calc(${String(node.indent)} * 2em)`;
  }
  return Object.keys(style).length === 0 ? undefined : style;
}

function codeText(node: StoredNode): string {
  return (node.children ?? [])
    .map((child) =>
      child.type === "linebreak" ? "\n" : child.type === "tab" ? "\t" : (child.text ?? ""),
    )
    .join("");
}

function Text(props: { node: StoredNode; slots: DocumentSlots }): JSX.Element {
  const node = props.node;
  const format = typeof node.format === "number" ? node.format : 0;
  const has = (flag: number): boolean => (format & flag) !== 0;
  let out: Child = node.text ?? "";
  const underline = has(IS_UNDERLINE);
  const strike = has(IS_STRIKETHROUGH);
  if (underline || strike) {
    const cls =
      underline && strike
        ? props.slots.underlineStrikethrough
        : underline
          ? props.slots.underline
          : props.slots.strikethrough;
    out = <span class={cls}>{out}</span>;
  }
  if (has(IS_ITALIC)) out = <em>{out}</em>;
  if (has(IS_BOLD)) out = <strong>{out}</strong>;
  if (has(IS_HIGHLIGHT)) out = <mark class={props.slots.highlight}>{out}</mark>;
  if (has(IS_SUBSCRIPT)) out = <sub>{out}</sub>;
  if (has(IS_SUPERSCRIPT)) out = <sup>{out}</sup>;
  if (has(IS_CODE)) out = <code>{out}</code>;
  return out;
}

function Children(props: { nodes: readonly StoredNode[] | undefined; context: RenderContext }) {
  return (
    <For each={props.nodes ?? []}>
      {(child: StoredNode) => <Node node={child} context={props.context} />}
    </For>
  );
}

function ListItem(props: { node: StoredNode; listType?: string; context: RenderContext }) {
  const node = props.node;
  const nested =
    (node.children ?? []).length > 0 && (node.children ?? []).every((one) => one.type === "list");
  if (nested) {
    return (
      <li class={props.context.slots.nestedItem}>
        <Children nodes={node.children} context={props.context} />
      </li>
    );
  }
  if (props.listType === "check") {
    return (
      <li
        class={props.context.slots.checkItem}
        role="checkbox"
        aria-checked={node.checked === true}
        aria-readonly="true"
        dir="auto"
      >
        <Children nodes={node.children} context={props.context} />
      </li>
    );
  }
  return (
    <li dir="auto" style={blockStyle(node)}>
      <Children nodes={node.children} context={props.context} />
    </li>
  );
}

function Node(props: { node: StoredNode; context: RenderContext }): JSX.Element {
  const node = props.node;
  const context = props.context;
  switch (node.type) {
    case "paragraph":
      return (
        <p dir="auto" style={blockStyle(node)}>
          <Children nodes={node.children} context={context} />
        </p>
      );
    case "heading": {
      const level = Math.min(6, Number((node.tag ?? "h2").slice(1)) + context.headingOffset);
      const Heading = dynamic(() => `h${String(level)}` as "h2");
      return (
        <Heading dir="auto" style={blockStyle(node)}>
          <Children nodes={node.children} context={context} />
        </Heading>
      );
    }
    case "quote":
      return (
        <blockquote dir="auto" style={blockStyle(node)}>
          <Children nodes={node.children} context={context} />
        </blockquote>
      );
    case "list":
      return node.listType === "number" ? (
        <ol start={node.start !== undefined && node.start !== 1 ? node.start : undefined}>
          <For each={node.children ?? []}>
            {(child: StoredNode) => <ListItem node={child} listType="number" context={context} />}
          </For>
        </ol>
      ) : (
        <ul data-list={node.listType}>
          <For each={node.children ?? []}>
            {(child: StoredNode) => (
              <ListItem node={child} listType={node.listType} context={context} />
            )}
          </For>
        </ul>
      );
    case "listitem":
      return <ListItem node={node} context={context} />;
    case "code":
      return <CodeBlock code={codeText(node)} language={node.language ?? undefined} />;
    case "table":
      return (
        <div class={context.slots.tableScroller}>
          <table class={context.slots.table}>
            <tbody>
              <Children nodes={node.children} context={context} />
            </tbody>
          </table>
        </div>
      );
    case "tablerow":
      return (
        <tr>
          <Children nodes={node.children} context={context} />
        </tr>
      );
    case "tablecell": {
      const header = (node.headerState ?? 0) !== 0;
      const Cell = dynamic(() => (header ? "th" : "td") as "td");
      return (
        <Cell
          class={header ? context.slots.tableCellHeader : undefined}
          colSpan={node.colSpan !== undefined && node.colSpan > 1 ? node.colSpan : undefined}
          rowSpan={node.rowSpan !== undefined && node.rowSpan > 1 ? node.rowSpan : undefined}
          scope={header ? "col" : undefined}
        >
          <Children nodes={node.children} context={context} />
        </Cell>
      );
    }
    case "horizontalrule":
      return <hr />;
    case "linebreak":
      return <br />;
    case "tab":
      return "\t";
    case "link":
    case "autolink": {
      const url = node.url ?? "";
      return (
        <Link href={context.linkHref?.(url) ?? url}>
          <Children nodes={node.children} context={context} />
        </Link>
      );
    }
    case "mention": {
      const mention = {
        id: node.mentionId ?? "",
        name: node.mentionName ?? "",
        trigger: node.trigger ?? "@",
      };
      return (
        <Show
          when={context.renderMention !== undefined}
          fallback={
            <span
              class={context.slots.mention}
              data-slot="mention"
              data-mention-id={mention.id}
              dir="auto"
            >
              {node.text ?? `${mention.trigger}${mention.name}`}
            </span>
          }
        >
          {context.renderMention?.(mention)}
        </Show>
      );
    }
    case "text":
    case "code-highlight":
      return <Text node={node} slots={context.slots} />;
    default: {
      const definition = context.blocks.get(node.type);
      if (definition !== undefined) {
        const Component = definition.component;
        return (
          <Component
            data={node.data}
            editable={false}
            selected={false}
            nodeKey=""
            setData={() => undefined}
            remove={() => undefined}
          />
        );
      }
      return <Children nodes={node.children} context={context} />;
    }
  }
}

export interface RichTextRendererProps
  extends Customisable<DocumentSlots & { root: string }>, Pick<DocumentOptions, "blocks"> {
  /** A stored document: what `RichTextEditor` reported. */
  value?: DocumentValue;
  /** Markdown, read with the same rules the editor writes it with. */
  markdown?: string;
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  /** `prose` holds lines to a readable measure; `full` takes the room. @default "full" */
  width?: "prose" | "full";
  /** Levels added to each heading, so a document under a page's own `<h1>` starts at `<h2>`. @default 0 */
  headingOffset?: number;
  /** Draws a mention: a link to a profile, a hover card. A highlighted name otherwise. */
  renderMention?: (mention: RenderedMention) => Child;
  /** Where a link really goes: an app's own route for its own addresses. */
  linkHref?: (url: string) => string;
}

function storedNodes(
  value: DocumentValue | undefined,
  markdown: string | undefined,
  blocks?: readonly AnyBlock[],
): StoredNode[] {
  if (markdown !== undefined)
    return markdownToDocument(markdown, { blocks }).root.children;
  if (value === undefined) return [];
  // Read through an editor with the document's nodes, so a stored state
  // from an older version comes out in the shape it has today.
  const editor = createDocumentEditor({ blocks });
  try {
    const state: SerializedEditorState = editor.parseEditorState(value).toJSON();
    return state.root.children;
  } finally {
    editor.dispose();
  }
}

/**
 * A document drawn without an editor: what `RichTextEditor` stored, or
 * markdown, in `Prose`'s type, for a message list, a comment or a page.
 *
 * ```tsx
 * <RichTextRenderer value={message.body} size="sm" renderMention={(m) => <Link href={`/people/${m.id}`}>@{m.name}</Link>} />
 * <RichTextRenderer markdown={release.notes} headingOffset={1} />
 * ```
 *
 * The document is read with Lexical's headless editor, from the same nodes
 * the editor writes, and drawn as plain elements, so a server writes all of
 * it, code highlighted and links as links, and the browser adopts it with
 * nothing to load. Each block takes its direction from its own text, and an
 * app's blocks draw with their own components, read-only.
 */
export function RichTextRenderer(props: RichTextRendererProps) {
  const nodes = createMemo(() => storedNodes(props.value, props.markdown, props.blocks));
  const cls = () => parts({ ...documentStyles(), root: "" }, props.classes);
  const context = (): RenderContext => ({
    slots: cls(),
    blocks: new Map(documentBlocks(props.blocks).map((block) => [block.type, block.definition])),
    headingOffset: props.headingOffset ?? 0,
    renderMention: props.renderMention,
    linkHref: props.linkHref,
  });
  return (
    <div
      class={arc(
        proseStyles({ size: props.size, width: props.width ?? "full" }).root,
        cls().root,
        props.class,
        props.className,
      )}
      data-slot="rich-text"
    >
      <Children nodes={nodes()} context={context()} />
    </div>
  );
}
