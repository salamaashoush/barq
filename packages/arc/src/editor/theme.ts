import { variants } from "@barqjs/css";
import { tokens } from "@barqjs/ui/theme/tokens";
import type { EditorThemeClasses } from "lexical";

import { codeSurface, staticCode } from "../code/style.ts";
import { arc as arcTokens } from "../theme/tokens.ts";
import { arcLayer as arc } from "../layer.ts";
import { bg, edge, fg, focus, layout, rounded, space, type } from "../style/index.ts";

/**
 * What Lexical draws a document's nodes with: one class per node and text
 * format, each in arc's look. The editor and `RichTextRenderer` both draw from
 * it, under ui's `Prose`, which styles the headings, lists, quotes and tables
 * by their elements; what is left here is what Lexical draws without an
 * element of its own (underline, a code block as a `<code>`, a check item).
 */
/** The room under each block of a document, as `Prose` leaves under a paragraph. */
const blockGap = arc({ marginBlock: "0 1.25em" });

export const documentStyles = variants({
  slots: {
    underline: arc({ textDecorationLine: "underline" }),
    strikethrough: arc({ textDecorationLine: "line-through" }),
    underlineStrikethrough: arc({ textDecorationLine: "underline line-through" }),
    highlight: arc({ backgroundColor: arcTokens.selection, color: "inherit" }),
    codeBlock: arc(codeSurface, staticCode, bg.sunken, edge.all, rounded.md, blockGap, {
      display: "block",
      direction: "ltr",
      textAlign: "start",
      paddingInline: "var(--code-pad-x)",
    }),
    link: arc(fg.link),
    nestedItem: arc({ listStyleType: "none" }),
    checkItem: arc(focus.visible, {
      position: "relative",
      listStyleType: "none",
      paddingInlineStart: "1.75em",
      "&::before": {
        content: '""',
        position: "absolute",
        insetInlineStart: "0",
        insetBlockStart: "0.2em",
        width: "1.1em",
        height: "1.1em",
        cursor: "pointer",
        borderRadius: "0.25em",
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: tokens.input,
        backgroundColor: tokens.background,
      },
      '&[aria-checked="true"]': {
        color: tokens.mutedForeground,
        textDecorationLine: "line-through",
      },
      '&[aria-checked="true"]::before': {
        borderColor: tokens.primary,
        backgroundColor: tokens.primary,
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E\")",
        backgroundSize: "80%",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      },
    }),
    table: arc({ tableLayout: "fixed" }),
    tableScroller: arc(blockGap, { overflowX: "auto", maxWidth: "100%" }),
    tableCell: arc({ position: "relative", minWidth: space.x16, verticalAlign: "top" }),
    tableCellHeader: arc(bg.sunken, type.strong),
    tableSelected: arc({ outline: `2px solid ${tokens.ring}`, outlineOffset: "-2px" }),
    tableCellSelected: arc({ backgroundColor: arcTokens.selection }),
    hr: arc({ cursor: "default", "&.selected": { outline: `2px solid ${tokens.ring}` } }),
    mention: arc(fg.link, type.medium, rounded.xs, {
      backgroundColor: `color-mix(in oklab, ${arcTokens.link} 10%, transparent)`,
      paddingInline: "0.15em",
      unicodeBidi: "isolate",
    }),
    block: arc(layout.relative, blockGap),
    remoteCaret: arc({
      width: "2px",
      backgroundColor: "var(--lexical-cursor-color)",
      zIndex: "1",
      pointerEvents: "none",
    }),
    remoteName: arc(type.caption, type.medium, rounded.xs, {
      position: "absolute",
      insetBlockEnd: "100%",
      insetInlineStart: "-1px",
      paddingInline: space.x1,
      whiteSpace: "nowrap",
      color: "white",
      backgroundColor: "var(--lexical-cursor-color)",
    }),
    blockSelected: arc(rounded.md, { outline: `2px solid ${tokens.ring}`, outlineOffset: "2px" }),
  },
});

/** The editable root: no outline of its own, since the frame around it shows focus, and the caret in the text's colour. */
const editableText = arc({ outline: "none", caretColor: tokens.foreground });

export { blockGap, editableText };

export type DocumentSlots = ReturnType<typeof documentStyles>;

/** The token classes `codeSurface` colours, by the highlight type a code token carries. */
const CODE_TOKENS = [
  "keyword",
  "string",
  "number",
  "function",
  "property",
  "type",
  "tag",
  "comment",
  "punctuation",
  "heading",
  "strong",
  "emphasis",
  "link",
  "inserted",
  "deleted",
  "invalid",
] as const;

/**
 * A Lexical theme in arc's look: what an editor of an app's own passes as
 * `initialConfig.theme` to draw as `RichTextEditor` does.
 */
export function editorTheme(slots: DocumentSlots = documentStyles()): EditorThemeClasses {
  return {
    text: {
      underline: slots.underline,
      strikethrough: slots.strikethrough,
      underlineStrikethrough: slots.underlineStrikethrough,
      highlight: slots.highlight,
    },
    code: slots.codeBlock,
    codeHighlight: Object.fromEntries(CODE_TOKENS.map((one) => [one, `tok-${one}`])),
    link: slots.link,
    list: {
      nested: { listitem: slots.nestedItem },
      listitemChecked: slots.checkItem,
      listitemUnchecked: slots.checkItem,
    },
    table: slots.table,
    tableScrollableWrapper: slots.tableScroller,
    tableCell: slots.tableCell,
    tableCellHeader: slots.tableCellHeader,
    tableSelection: slots.tableSelected,
    tableCellSelected: slots.tableCellSelected,
    hr: slots.hr,
    mention: slots.mention,
    blockSelected: slots.blockSelected,
    collaboration: { cursor: slots.remoteCaret, cursorName: slots.remoteName },
    block: slots.block,
  };
}
