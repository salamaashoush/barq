import type { LanguageSupport } from "@codemirror/language";
import { type Highlighter, highlightCode, tagHighlighter, tags as t } from "@lezer/highlight";

/**
 * Syntax tags to stable class names, for the editor and the static renderer
 * alike. A `HighlightStyle` would generate its class names in the order its
 * styles are defined in each process and keep the rules in a module only a
 * browser can mount, so what a server wrote would not match what the editor
 * draws. The colours are arc's `code-*` tokens, in `codeSurface`.
 */
export const codeHighlighter: Highlighter = tagHighlighter([
  {
    tag: [
      t.keyword,
      t.controlKeyword,
      t.moduleKeyword,
      t.operatorKeyword,
      t.definitionKeyword,
      t.modifier,
      t.self,
    ],
    class: "tok-keyword",
  },
  {
    tag: [t.string, t.special(t.string), t.regexp, t.attributeValue, t.character],
    class: "tok-string",
  },
  { tag: [t.number, t.bool, t.null, t.atom, t.unit], class: "tok-number" },
  {
    tag: [
      t.function(t.variableName),
      t.function(t.propertyName),
      t.function(t.definition(t.variableName)),
      t.macroName,
    ],
    class: "tok-function",
  },
  {
    tag: [t.propertyName, t.attributeName, t.definition(t.propertyName)],
    class: "tok-property",
  },
  { tag: [t.typeName, t.className, t.namespace], class: "tok-type" },
  { tag: [t.tagName, t.angleBracket], class: "tok-tag" },
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment, t.meta, t.processingInstruction],
    class: "tok-comment",
  },
  { tag: [t.punctuation, t.separator, t.bracket, t.operator], class: "tok-punctuation" },
  { tag: t.heading, class: "tok-heading" },
  { tag: t.strong, class: "tok-strong" },
  { tag: t.emphasis, class: "tok-emphasis" },
  { tag: [t.link, t.url], class: "tok-link" },
  { tag: t.inserted, class: "tok-inserted" },
  { tag: t.deleted, class: "tok-deleted" },
  { tag: t.invalid, class: "tok-invalid" },
]);

/** Past this many characters code is shown plain: parsing it would stall the page for text nobody reads whole. */
const LIMIT = 200_000;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

function escape(text: string): string {
  return text.replace(/[&<>]/g, (one) => ESCAPES[one] ?? one);
}

/**
 * `code` as HTML: one `<span data-line>` per line, joined by newlines, with a
 * `<span class="tok-…">` around each highlighted run. Pure, so a server writes
 * it. Without a language, or past the size limit, the lines are plain.
 */
export function highlightHtml(code: string, language?: LanguageSupport): string {
  const lines: string[] = [];
  let line = "";
  function putText(text: string, classes: string): void {
    line += classes === "" ? escape(text) : `<span class="${classes}">${escape(text)}</span>`;
  }
  function putBreak(): void {
    lines.push(line);
    line = "";
  }
  if (language === undefined || code.length > LIMIT) {
    for (const text of code.split("\n")) {
      putText(text, "");
      putBreak();
    }
  } else {
    highlightCode(code, language.language.parser.parse(code), codeHighlighter, putText, putBreak);
    putBreak();
  }
  return lines.map((one) => `<span data-line>${one}</span>`).join("\n");
}

/** How many lines `code` has, as an editor counts them. */
export function lineCount(code: string): number {
  let count = 1;
  for (let at = code.indexOf("\n"); at !== -1; at = code.indexOf("\n", at + 1)) count++;
  return count;
}
