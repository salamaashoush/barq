import { render } from "@barqjs/web";
import type { EditorView } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";

import { editorOwner } from "./editor-owner.ts";

/** Text from a server to show: markdown, or plain text taken as it is. */
export interface DocText {
  kind: lsp.MarkupKind;
  value: string;
}

export interface DocsView {
  dom: HTMLElement;
  destroy: () => void;
}

export type HoverContents = lsp.Hover["contents"];

type Renderer = typeof import("../editor/renderer.tsx").RichTextRenderer;

let renderer: Promise<Renderer | null> | undefined;

/**
 * Arc's markdown renderer, loaded on the first docs an editor shows: a page
 * whose editors never show any loads no markdown at all.
 */
function markdownRenderer(): Promise<Renderer | null> {
  renderer ??= import("../editor/renderer.tsx").then(
    (module) => module.RichTextRenderer,
    () => {
      renderer = undefined;
      return null;
    },
  );
  return renderer;
}

function fenced(language: string, code: string): string {
  const fence = code.includes("```") ? "~~~~" : "```";
  return `${fence}${language}\n${code}\n${fence}`;
}

function markedText(value: lsp.MarkedString | lsp.MarkupContent): DocText {
  if (typeof value === "string") return { kind: "markdown", value };
  if ("language" in value) return { kind: "markdown", value: fenced(value.language, value.value) };
  return { kind: value.kind, value: value.value };
}

/** A hover's contents, in any of the shapes the protocol allows, as the parts to show. */
export function hoverDocs(contents: HoverContents): DocText[] {
  const list = Array.isArray(contents) ? contents : [contents];
  return list.map(markedText).filter((one) => one.value.trim() !== "");
}

/** A completion's detail as code in the document's language, then its documentation. */
export function completionDocs(item: lsp.CompletionItem, languageId: string): DocText[] {
  const parts: DocText[] = [];
  if (item.detail !== undefined && item.detail !== "") {
    parts.push({ kind: "markdown", value: fenced(languageId, item.detail) });
  }
  if (item.documentation !== undefined) parts.push(markedText(item.documentation));
  return parts.filter((one) => one.value.trim() !== "");
}

/** Plain text as markdown that reads back as the same text, line breaks kept. */
function escapedMarkdown(text: string): string {
  return text
    .replace(/[\\`*_{}[\]()#+\-.!<>|~]/g, "\\$&")
    .split("\n")
    .join("  \n");
}

function markdownOf(parts: readonly DocText[]): string {
  return parts
    .map((part) => (part.kind === "markdown" ? part.value : escapedMarkdown(part.value)))
    .join("\n\n");
}

function plainView(parts: readonly DocText[]): DocsView {
  const dom = document.createElement("div");
  dom.className = "cm-lsp-docs";
  for (const part of parts) {
    const text = dom.appendChild(document.createElement("div"));
    text.className = "cm-lsp-docs-text";
    text.textContent = part.value;
  }
  return { dom, destroy: () => undefined };
}

/**
 * A server's docs drawn with arc's markdown: code blocks highlighted in
 * their language, links as links, in the editor component's contexts. Plain
 * text reads as it was written, and when markdown cannot load every part is
 * shown as it is.
 *
 * Resolves once the renderer has loaded to what draws the docs, so a
 * tooltip draws them in its own `create` and nothing is drawn for one that
 * never shows.
 */
export async function docsFactory(
  view: EditorView,
  parts: readonly DocText[],
): Promise<() => DocsView> {
  const markdown = markdownOf(parts);
  const Markdown = await markdownRenderer();
  if (Markdown === null) return () => plainView(parts);
  return () => {
    const dom = document.createElement("div");
    dom.className = "cm-lsp-docs";
    const destroy = render(() => <Markdown markdown={markdown} size="sm" />, dom, {
      owner: view.state.facet(editorOwner),
    });
    return { dom, destroy };
  };
}
