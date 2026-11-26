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
  ".cm-lsp-docs": {
    // A code block in the docs takes the sizes of its own, not the editor's it sits in.
    "--code-min-height": "auto",
    "--code-max-height": "none",
    padding: "0.5rem 0.75rem",
    maxHeight: "20rem",
    fontFamily: "var(--font-sans)",
    overflow: "auto",
    fontSize: "var(--code-font-size)",
  },
  ".cm-lsp-docs-text": { whiteSpace: "pre-wrap" },
  ".cm-lsp-signature-tooltip": { padding: "0.375rem 0.625rem" },
  ".cm-lsp-signature": { fontFamily: "var(--font-mono)" },
  ".cm-lsp-active-parameter": { color: "var(--link)" },
  ".cm-lsp-reference-panel .cm-lsp-reference[aria-selected]": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  ".cm-inlay-hint": {
    margin: "0 0.125em",
    padding: "0 0.25em",
    borderRadius: "calc(var(--radius) - 4px)",
    backgroundColor: "var(--muted)",
    color: "var(--muted-foreground)",
    fontSize: "0.9em",
  },
  ".cm-inlay-hint-before": { marginInlineStart: "0.375em" },
  ".cm-inlay-hint-after": { marginInlineEnd: "0.375em" },
  ".cm-code-lenses": {
    display: "flex",
    gap: "0.75rem",
    padding: "0 var(--code-pad-x)",
    fontFamily: "var(--font-sans)",
    fontSize: "0.8em",
  },
  ".cm-code-lens": {
    padding: "0",
    border: "none",
    background: "none",
    color: "var(--muted-foreground)",
    font: "inherit",
    cursor: "pointer",
  },
  ".cm-code-lens:hover": { color: "var(--link)", textDecoration: "underline" },
  ".cm-code-lens:focus-visible": { outline: "2px solid var(--ring)", outlineOffset: "1px" },
  ".cm-lsp-actions": {
    margin: "0",
    padding: "0.25rem",
    minWidth: "12rem",
    listStyle: "none",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--code-font-size)",
    outline: "none",
  },
  ".cm-lsp-action, .cm-lsp-actions-empty": {
    padding: "0.25rem 0.5rem",
    borderRadius: "calc(var(--radius) - 4px)",
  },
  ".cm-lsp-action": { cursor: "pointer" },
  ".cm-lsp-actions-empty": { color: "var(--muted-foreground)" },
  ".cm-lsp-action[data-preferred]": { fontWeight: "var(--font-weight-semibold)" },
  ".cm-lsp-action[aria-selected=true]": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  ".cm-lsp-diagnostic-code": { color: "var(--muted-foreground)", fontSize: "0.9em" },
  ".cm-lsp-related": { margin: "0.25rem 0 0", padding: "0", listStyle: "none" },
  ".cm-lsp-related-place": {
    padding: "0",
    border: "none",
    background: "none",
    color: "var(--link)",
    font: "inherit",
    cursor: "pointer",
    textDecoration: "underline",
  },
  ".cm-lsp-unnecessary": { opacity: "0.6" },
  ".cm-lsp-deprecated, .cm-semantic-deprecated": { textDecorationLine: "line-through" },
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
  ".cm-lintRange-hint": {
    backgroundImage: "none",
    textDecoration: "underline dotted var(--muted-foreground)",
    textUnderlineOffset: "3px",
  },
  ".cm-diagnostic-hint": { borderLeftColor: "var(--muted-foreground)" },
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
