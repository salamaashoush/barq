import { syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { codeHighlighter } from "./highlight.ts";

/**
 * The editor's chrome on arc's tokens and the metrics `codeSurface` declares.
 *
 * Every value is a `var()`, so a theme switch restyles a live editor with no
 * reconfigure. The rules are CodeMirror's own, unlayered and scoped to the
 * editor, because its base theme is unlayered too and would beat anything in
 * `@layer barq.arc`.
 */
const chrome = EditorView.theme({
  "&": {
    color: "var(--foreground)",
    backgroundColor: "transparent",
    fontSize: "var(--code-font-size)",
    maxHeight: "var(--code-max-height, none)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "var(--code-line-height)",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "var(--code-pad-y) 0",
    minHeight: "var(--code-min-height, auto)",
    caretColor: "var(--foreground)",
  },
  ".cm-line": { padding: "0 var(--code-pad-x)" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--faint-foreground)",
    border: "none",
  },
  ".cm-gutter": { minHeight: "var(--code-min-height, auto)" },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 var(--code-gutter-pad-end) 0 var(--code-gutter-pad-start)",
    minWidth: "var(--code-gutter-min)",
  },
  ".cm-foldGutter .cm-gutterElement": {
    boxSizing: "border-box",
    width: "var(--code-fold-width)",
    textAlign: "center",
    cursor: "pointer",
  },
  ".cm-foldGutter .cm-gutterElement:hover": { color: "var(--foreground)" },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--muted)",
    border: "1px solid var(--border)",
    color: "var(--muted-foreground)",
    borderRadius: "calc(var(--radius) - 4px)",
  },
  "&.cm-focused .cm-activeLine": {
    backgroundColor: "color-mix(in oklab, var(--muted) 70%, transparent)",
  },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
  "&.cm-focused .cm-activeLineGutter": { color: "var(--foreground)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "var(--selection)" },
  ".cm-selectionMatch": {
    backgroundColor: "color-mix(in oklab, var(--primary) 12%, transparent)",
  },
  "&.cm-focused .cm-matchingBracket": {
    backgroundColor: "color-mix(in oklab, var(--primary) 16%, transparent)",
    outline: "1px solid color-mix(in oklab, var(--primary) 40%, transparent)",
  },
  ".cm-placeholder": { color: "var(--faint-foreground)" },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "calc(var(--radius) - 2px)",
    boxShadow: "0 4px 12px var(--shadow-color-strong)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--code-font-size)",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  ".cm-completionDetail": { color: "var(--muted-foreground)", fontStyle: "normal" },
  ".cm-completionMatchedText": { textDecoration: "none", color: "var(--link)" },
  ".cm-panels": { backgroundColor: "var(--sunken)", color: "var(--foreground)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--border)" },
  ".cm-textfield": {
    border: "1px solid var(--input)",
    borderRadius: "calc(var(--radius) - 4px)",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
  },
  ".cm-button": {
    backgroundImage: "none",
    backgroundColor: "var(--secondary)",
    color: "var(--secondary-foreground)",
    border: "1px solid var(--input)",
    borderRadius: "calc(var(--radius) - 4px)",
  },
  ".cm-completionInfo": {
    padding: "0.5rem 0.75rem",
    maxWidth: "28rem",
    fontSize: "var(--code-font-size)",
  },
  ".cm-tooltip-hover": { maxWidth: "36rem" },
  ".cm-code-docs": { padding: "0.5rem 0.75rem", fontSize: "var(--code-font-size)" },
  ".cm-code-docs-signature": {
    display: "block",
    fontFamily: "var(--font-mono)",
    whiteSpace: "pre-wrap",
  },
  ".cm-code-docs-text": {
    margin: "0.375rem 0 0",
    color: "var(--muted-foreground)",
    fontFamily: "var(--font-sans)",
    whiteSpace: "pre-wrap",
  },
  ".cm-diagnostic": { padding: "0.25rem 0.5rem", borderLeftWidth: "3px" },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--danger)",
    textUnderlineOffset: "3px",
  },
  ".cm-lintRange-warning": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--warning)",
    textUnderlineOffset: "3px",
  },
  ".cm-lintRange-info": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--info)",
    textUnderlineOffset: "3px",
  },
  ".cm-diagnostic-error": { borderLeftColor: "var(--danger)" },
  ".cm-diagnostic-warning": { borderLeftColor: "var(--warning)" },
  ".cm-diagnostic-info": { borderLeftColor: "var(--info)" },
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in oklab, var(--warning) 30%, transparent)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in oklab, var(--warning) 55%, transparent)",
  },
});

/** The diff's own colours, on arc's tones. */
export const diffChrome: Extension = EditorView.theme({
  "&.cm-merge-a .cm-changedLine, .cm-deletedChunk": {
    backgroundColor: "var(--danger-subtle)",
  },
  "&.cm-merge-b .cm-changedLine, .cm-inlineChangedLine": {
    backgroundColor: "var(--success-subtle)",
  },
  "&.cm-merge-a .cm-changedText, .cm-deletedChunk .cm-deletedText": {
    background: "color-mix(in oklab, var(--danger) 28%, transparent)",
  },
  "&.cm-merge-b .cm-changedText": {
    background: "color-mix(in oklab, var(--success) 28%, transparent)",
  },
  ".cm-changeGutter": { width: "3px", paddingLeft: "0" },
  "&.cm-merge-a .cm-changedLineGutter, .cm-deletedLineGutter": {
    background: "var(--danger)",
  },
  "&.cm-merge-b .cm-changedLineGutter": { background: "var(--success)" },
  ".cm-collapsedLines": {
    backgroundColor: "var(--sunken)",
    backgroundImage: "none",
    color: "var(--muted-foreground)",
    fontFamily: "var(--font-sans)",
  },
});

/** The theme and the highlighting, for an editor of arc's. */
export const codeTheme: Extension = [chrome, syntaxHighlighting(codeHighlighter)];
