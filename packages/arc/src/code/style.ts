import { arcLayer as arc } from "../layer.ts";
import { bg, edge, fg, focus, interaction, layout, motion, rounded, type } from "../style/index.ts";

/**
 * The metrics and colours every code surface shares, as custom properties.
 *
 * The editor's theme and the static renderer both read these, so the markup a
 * server writes has the editor's line height, padding and gutter, and the
 * editor that takes it over moves nothing. The colours are arc's tokens, so
 * light, dark and an app's own values follow the theme with no reconfigure.
 */
export const codeSurface = arc(type.mono, fg.default, {
  "--code-font-size": "0.8125rem",
  "--code-line-height": "1.25rem",
  "--code-pad-y": "0.5rem",
  "--code-pad-x": "0.75rem",
  "--code-gutter-min": "2rem",
  "--code-gutter-pad-start": "0.75rem",
  "--code-gutter-pad-end": "0.25rem",
  "--code-gutter-width":
    "max(var(--code-gutter-min), calc(var(--code-digits, 2) * 1ch + var(--code-gutter-pad-start) + var(--code-gutter-pad-end)))",
  fontSize: "var(--code-font-size)",
  lineHeight: "var(--code-line-height)",
  "& .tok-keyword": { color: "var(--code-keyword)" },
  "& .tok-string": { color: "var(--code-string)" },
  "& .tok-number": { color: "var(--code-number)" },
  "& .tok-function": { color: "var(--code-function)" },
  "& .tok-property": { color: "var(--code-property)" },
  "& .tok-type": { color: "var(--code-type)" },
  "& .tok-tag": { color: "var(--code-tag)" },
  "& .tok-comment": { color: "var(--faint-foreground)", fontStyle: "italic" },
  "& .tok-punctuation": { color: "var(--muted-foreground)" },
  "& .tok-heading": { color: "var(--code-function)", fontWeight: "var(--font-weight-semibold)" },
  "& .tok-strong": { fontWeight: "var(--font-weight-semibold)" },
  "& .tok-emphasis": { fontStyle: "italic" },
  "& .tok-link": { color: "var(--link)", textDecorationLine: "underline" },
  "& .tok-inserted": { color: "var(--success-foreground)" },
  "& .tok-deleted": { color: "var(--danger-foreground)" },
  "& .tok-invalid": { color: "var(--danger-foreground)" },
});

/**
 * The static rendering: a `<pre>` of `highlightHtml` lines that sits where
 * the editor will, line for line. Each line is an inline block so a copy of
 * the text keeps its newlines, and a line number is generated content, which
 * a copy leaves out and a screen reader skips.
 */
/** Between the sizes the caller set, scrolling past the larger. */
const scroller = arc({
  minHeight: "var(--code-min-height, auto)",
  maxHeight: "var(--code-max-height, none)",
  overflow: "auto",
});

export const staticCode = arc(layout.flush, scroller, {
  boxSizing: "border-box",
  paddingBlock: "var(--code-pad-y)",
  font: "inherit",
  whiteSpace: "pre",
  tabSize: "var(--code-tab-size, 4)",
  counterReset: "code-line",
  "&[data-wrap]": {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  "& [data-line]": {
    display: "inline-block",
    position: "relative",
    boxSizing: "border-box",
    width: "100%",
    minHeight: "var(--code-line-height)",
    verticalAlign: "top",
    paddingInline: "var(--code-pad-x)",
  },
  "&[data-numbered] [data-line]": {
    counterIncrement: "code-line",
    paddingInlineStart: "calc(var(--code-gutter-width) + var(--code-pad-x))",
  },
  "&[data-numbered] [data-line]::before": {
    content: 'counter(code-line) / ""',
    position: "absolute",
    insetInlineStart: "0",
    boxSizing: "border-box",
    width: "var(--code-gutter-width)",
    paddingInlineStart: "var(--code-gutter-pad-start)",
    paddingInlineEnd: "var(--code-gutter-pad-end)",
    textAlign: "end",
    color: "var(--faint-foreground)",
    fontStyle: "normal",
    userSelect: "none",
  },
  "& [data-placeholder]": {
    color: "var(--faint-foreground)",
  },
});

/** The box an editor or a diff sits in: an input's border, focus ring and invalid state. */
export const codeFrame = arc(
  layout.relative,
  layout.column,
  layout.minZero,
  edge.input,
  rounded.md,
  bg.page,
  focus.within,
  interaction.invalid,
  motion.colours,
  {
    overflow: "hidden",
    "&[data-invalid]:focus-within": {
      boxShadow: "0 0 0 3px color-mix(in oklab, var(--destructive) 20%, transparent)",
    },
    "&[data-readonly]": {
      backgroundColor: "var(--sunken)",
    },
    "& > .cm-editor, & > [data-slot=code-editor-host] > .cm-editor": {
      flex: "1 1 auto",
      minHeight: "0px",
    },
  },
);

/** Where a diff's editors sit: one column, a rule between the two sides. */
export const diffHost = arc(layout.column, layout.growAuto, scroller, {
  "& .cm-mergeView": { flex: "1 1 auto" },
  "& .cm-mergeViewEditor + .cm-mergeViewEditor, & .cm-merge-revert + .cm-mergeViewEditor": {
    borderInlineStart: "1px solid var(--border)",
  },
});
