import { CodeExtension, CodeHighlightNode, CodeNode, $isCodeNode } from "@lexical/code-core";
import { highlightCode } from "@lezer/highlight";
import {
  $createLineBreakNode,
  $createTabNode,
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isLineBreakNode,
  $isRangeSelection,
  $isTabNode,
  $isTextNode,
  type LexicalNode,
  type NodeKey,
  type PointType,
  TextNode,
  defineExtension,
  mergeRegister,
} from "lexical";

import { codeHighlighter } from "../code/highlight.ts";
import { isKnownLanguage, loadLanguage, loadedLanguage } from "../code/languages.ts";

interface Token {
  text: string;
  /** A highlight type, `keyword` for `tok-keyword`; none for plain text. */
  kind?: string;
  /** `\n` and `\t` are nodes of their own. */
  special?: "break" | "tab";
}

/** Lezer's classes are `tok-<kind>`, possibly several; the first names the kind. */
function kindOf(classes: string): string | undefined {
  const first = classes.split(" ")[0] ?? "";
  return first.startsWith("tok-") ? first.slice(4) : undefined;
}

function pushText(tokens: Token[], text: string, kind: string | undefined): void {
  const parts = text.split("\t");
  parts.forEach((part, index) => {
    if (index > 0) tokens.push({ text: "\t", special: "tab" });
    if (part !== "") tokens.push({ text: part, kind });
  });
}

/** The code cut into highlighted runs, line breaks and tabs, with arc's lezer highlighter. */
export function codeTokens(code: string, language: string | null | undefined): Token[] {
  const tokens: Token[] = [];
  const support =
    language === null || language === undefined ? undefined : loadedLanguage(language);
  const lines = code.split("\n");
  if (support === undefined) {
    lines.forEach((line, index) => {
      if (index > 0) tokens.push({ text: "\n", special: "break" });
      pushText(tokens, line, undefined);
    });
    return tokens;
  }
  highlightCode(
    code,
    support.language.parser.parse(code),
    codeHighlighter,
    (text, classes) => pushText(tokens, text, classes === "" ? undefined : kindOf(classes)),
    () => tokens.push({ text: "\n", special: "break" }),
  );
  return tokens;
}

function sameAs(node: LexicalNode, token: Token): boolean {
  if (token.special === "break") return $isLineBreakNode(node);
  if (token.special === "tab") return $isTabNode(node);
  return (
    node instanceof CodeHighlightNode &&
    node.getTextContent() === token.text &&
    (node.getHighlightType() ?? undefined) === token.kind
  );
}

function nodeOf(token: Token): LexicalNode {
  if (token.special === "break") return $createLineBreakNode();
  if (token.special === "tab") return $createTabNode();
  return new CodeHighlightNode(token.text, token.kind);
}

/** Where `point` is inside `code`, as a character offset, or `null` when it is elsewhere. */
function offsetIn(code: CodeNode, point: PointType): number | null {
  const children = code.getChildren();
  if (point.key === code.getKey()) {
    return children.slice(0, point.offset).reduce((sum, one) => sum + one.getTextContentSize(), 0);
  }
  let total = 0;
  for (const child of children) {
    if (child.getKey() === point.key) return total + point.offset;
    total += child.getTextContentSize();
  }
  return null;
}

function placeAt(code: CodeNode, point: PointType, offset: number): void {
  let rest = offset;
  const children = code.getChildren();
  for (const [index, child] of children.entries()) {
    const size = child.getTextContentSize();
    if (rest <= size && $isTextNode(child) && !$isTabNode(child)) {
      point.set(child.getKey(), rest, "text");
      return;
    }
    if (rest < size || (rest === size && index === children.length - 1)) {
      point.set(code.getKey(), rest === 0 ? index : index + 1, "element");
      return;
    }
    rest -= size;
  }
  point.set(code.getKey(), children.length, "element");
}

/**
 * Rebuild a code block's children from its text when they no longer match
 * what the highlighter makes of it, keeping the caret where it was in the text.
 */
function $highlight(code: CodeNode, onLoad: (key: NodeKey, language: string) => void): void {
  const language = code.getLanguage();
  const ready = language !== null && language !== undefined && loadedLanguage(language);
  if (language !== null && language !== undefined && !ready && isKnownLanguage(language)) {
    onLoad(code.getKey(), language);
  }
  if (code.getIsSyntaxHighlightSupported() !== Boolean(ready)) {
    code.setIsSyntaxHighlightSupported(Boolean(ready));
  }
  const tokens = codeTokens(code.getTextContent(), language);
  const children = code.getChildren();
  if (
    children.length === tokens.length &&
    children.every((child, i) => sameAs(child, tokens[i]!))
  ) {
    return;
  }
  const selection = $getSelection();
  const inside = $isRangeSelection(selection);
  const anchor = inside ? offsetIn(code, selection.anchor) : null;
  const focus = inside ? offsetIn(code, selection.focus) : null;
  code.splice(0, children.length, tokens.map(nodeOf));
  if (inside && anchor !== null) placeAt(code, selection.anchor, anchor);
  if (inside && focus !== null) placeAt(code, selection.focus, focus);
}

/**
 * Code blocks highlighted as `CodeBlock` highlights them: the same lezer
 * parsers and the same `tok-*` classes, coloured by the theme's `code-*`
 * tokens. A language loads on first use and the block is drawn plain until
 * it lands.
 */
export const CodeHighlightExtension = defineExtension({
  name: "@barqjs/arc/code-highlight",
  dependencies: [CodeExtension],
  register(editor) {
    const loading = new Set<NodeKey>();
    const onLoad = (key: NodeKey, language: string): void => {
      if (loading.has(key)) return;
      loading.add(key);
      void loadLanguage(language).then(() => {
        loading.delete(key);
        editor.update(() => {
          const node = $getNodeByKey(key);
          if ($isCodeNode(node)) node.markDirty();
        });
      });
    };
    const $fromText = (node: TextNode): void => {
      const parent = node.getParent();
      if ($isCodeNode(parent)) $highlight(parent, onLoad);
      else if (node instanceof CodeHighlightNode) {
        node.replace($createTextNode(node.getTextContent()).setFormat(node.getFormat()));
      }
    };
    return mergeRegister(
      editor.registerNodeTransform(CodeNode, (node) => $highlight(node, onLoad)),
      editor.registerNodeTransform(TextNode, $fromText),
      editor.registerNodeTransform(CodeHighlightNode, $fromText),
    );
  },
});
