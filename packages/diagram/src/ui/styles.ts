import {
  bg,
  edge,
  fg,
  focus,
  gap,
  glyph,
  interaction,
  layout,
  rounded,
  space,
  surface,
  target,
  type,
} from "@barqjs/arc/style";
import { tokens } from "@barqjs/ui/theme/tokens";

import { diagramLayer as d } from "./layer.ts";

/**
 * The UI's surfaces and controls, composed from `@barqjs/arc/style`'s
 * treatments: light, dark, density, high contrast and an app's brand all
 * reach them. What is the editor's own (a canvas UI's fixed sizes, where a
 * part sits over the canvas, the pressed state of a tool) is written here,
 * once, and composed by the parts that share it.
 */

/** Takes no pointer: a press goes through it to what is under it. */
export const noPointer = d({ pointerEvents: "none" });

export const absolute = d({ position: "absolute" });

/** Placed over the canvas, and taking no pointer itself: its islands do. */
export const pinned = d(noPointer, absolute);

/** From one side of its positioned parent to the other. */
export const acrossWidth = d({ insetInline: "0" });

/** The children of a part that takes no pointer, which do. */
export const passThrough = d({ "& > *": { pointerEvents: "auto" } });

/** A popup placed over the canvas at a point: a menu, a link's popup. */
export const floating = d(absolute, { zIndex: "4" });

/** At its positioned parent's top left corner. */
export const atTopLeft = d({ top: "0", left: "0" });

/** The whole of its positioned parent. */
export const cover = d(atTopLeft, { right: "0", bottom: "0" });

export const grid = d({ display: "grid" });

export const centredText = d({ textAlign: "center" });

/** A region that scrolls its overflow. */
export const scrolls = d({ overflowY: "auto" });

/** A dialog's content: the width it is given, scrolling past the viewport's height. */
export const dialogContent = d(layout.fill, scrolls, { maxHeight: "calc(100vh - 2rem)" });

/** A drawing shown inside a box, scaled down to fit and never up. */
export const fitted = d({
  "& svg, & canvas": { maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto" },
});

/** The colour and the type of whatever it sits in, not the browser's for a control. */
export const inherits = d({ color: "inherit", font: "inherit" });

/** A button drawn as nothing but its content. */
export const bare = d(inherits, { border: "none", background: "transparent" });

/** A list with no marker and no indent. */
export const listReset = d(layout.flush, { padding: "0", listStyle: "none" });

/** Takes the pointer, inside a part that does not. */
export const takesPointer = d({ pointerEvents: "auto" });

/** The tint a pressable part takes under the pointer. */
export const hoverTint = d({ "&:hover": { backgroundColor: tokens.accent } });

/** The room round a line of small text: a badge's label, a hint in a list. */
export const labelPadding = d({ paddingBlock: space.x1, paddingInline: space.x2 });

/** A small heading over a group: the caption size, strong, without margin. */
export const captionHeading = d(type.caption, type.strong, layout.flush);

/** The layer over the canvases: it takes no pointer itself, its islands do. */
export const layerUI = d(type.sm, type.sans, fg.default, pinned, cover, {
  // what changes in the UI (the zoom level as it zooms) lays out only itself
  contain: "layout style",
  zIndex: "3",
});

/** The editor's corners and its top middle, where the islands sit. */
const corner = d(pinned, layout.row, gap[2]);
const topEdge = d({ top: space.x3, alignItems: "flex-start" });
const bottomEdge = d({ bottom: space.x3, alignItems: "flex-end" });
export const startEdge = d({ insetInlineStart: space.x3 });
const endEdge = d({ insetInlineEnd: space.x3 });

export const topStart = d(corner, layout.column, topEdge, startEdge, {
  maxHeight: "calc(100% - 80px)",
});

export const topCenter = d(corner, topEdge, acrossWidth, { justifyContent: "center" });

export const topEnd = d(corner, layout.column, topEdge, endEdge, { alignItems: "flex-end" });

export const bottomStart = d(corner, bottomEdge, startEdge);

export const bottomEnd = d(corner, bottomEdge, endEdge);

/** A floating surface: the toolbar, a panel, the footer's groups. */
export const island = d(surface.elevated, layout.row, gap[0.5], takesPointer, {
  contain: "layout style",
  padding: space.x1,
});

export const panel = d(surface.elevated, layout.column, gap[3], scrolls, takesPointer, {
  width: "212px",
  padding: space.x3,
});

/** A one-pixel rule standing between two things, in the border's colour. */
export const rule = d({ width: "1px", backgroundColor: tokens.border });

/** A rule between two groups of controls. */
export const divider = d(rule, { alignSelf: "stretch", margin: space.x1 });

/** The colour a chosen control takes: the brand's, or the primary's. */
const chosen = d({
  "&[aria-pressed=true], &[aria-checked=true], &[data-selected], &[data-active]": {
    backgroundColor: "var(--brand, var(--primary))",
    color: "var(--brand-ink, var(--primary-foreground))",
  },
});

/** A control's 32px, and a finger's 44px under a coarse pointer and once the editor has been touched. */
const controlSize = d({
  width: "32px",
  height: "32px",
  "@media (pointer: coarse)": { width: "44px", height: "44px" },
  "[data-touch] &": { width: "44px", height: "44px" },
});

/** The ring a control draws on keyboard focus, where a dragged pick lands, and round the pick it would duplicate. */
export const ringed = d({
  "&[data-focus-visible], &:focus-visible, &:has([data-drop-target]), &:has([data-duplicate])": {
    boxShadow: "0 0 0 2px var(--diagram-ring)",
  },
  "&:is([data-focus-visible], :focus-visible, :has([data-drop-target])):not(:has([data-duplicate]))":
    { "--diagram-ring": tokens.ring },
  "&:has([data-duplicate])": { "--diagram-ring": tokens.destructive },
});

/** An icon at the size a control draws it. */
export const controlGlyph = d({ "& svg": { width: "18px", height: "18px" } });

/** A square icon control: a tool, an action, a choice. */
export const iconButton = d(
  layout.inlineCentre,
  layout.noShrink,
  layout.relative,
  rounded.md,
  focus.none,
  bare,
  hoverTint,
  interaction.pressable,
  controlSize,
  ringed,
  chosen,
  controlGlyph,
  {
    padding: "0",
    "&[aria-disabled=true], &:disabled, &[data-disabled]": { opacity: "0.4", cursor: "default" },
  },
);

/** The key that picks a tool, in the button's corner. */
export const keyHint = d(pinned, {
  insetInlineEnd: "2px",
  bottom: "1px",
  fontSize: "9px",
  lineHeight: "1",
  opacity: "0.6",
});

/** A panel's section: a name over its controls. */
export const fieldset = d(layout.column, gap[1.5], layout.flush, layout.minZero, edge.none, {
  padding: "0",
});

export const legend = d(type.meta, { padding: "0", marginBottom: space.x1 });

export const buttonRow = d(layout.row, layout.wrap, gap[1]);

/** An icon radio: the input hidden, its label drawn as the choice. */
export const radioChoice = d(
  layout.inlineCentre,
  layout.relative,
  rounded.md,
  interaction.pressable,
  bg.muted,
  hoverTint,
  controlSize,
  ringed,
  chosen,
  controlGlyph,
  {
    "&[data-disabled]": { opacity: "0.4", cursor: "default" },
    "& input": {
      position: "absolute",
      opacity: "0",
      width: "1px",
      height: "1px",
      margin: "0",
      pointerEvents: "none",
    },
  },
);

export const radioGroupRow = d(layout.row, layout.wrap, gap[1], { alignItems: "normal" });

/** Transparent, drawn as a chequerboard in `--checker`'s colour. */
export const chequered = d({
  backgroundImage:
    "linear-gradient(45deg, var(--checker) 25%, transparent 25%), linear-gradient(-45deg, var(--checker) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--checker) 75%), linear-gradient(-45deg, transparent 75%, var(--checker) 75%)",
});

/** A colour, as a square. */
export const swatch = d(
  layout.relative,
  layout.noShrink,
  edge.all,
  focus.none,
  interaction.pressable,
  chequered,
  {
    width: "24px",
    height: "24px",
    "@media (pointer: coarse)": { width: "36px", height: "36px" },
    "[data-touch] &": { width: "36px", height: "36px" },
    padding: "0",
    borderRadius: "6px",
    "--checker": "#ccc",
    backgroundSize: "8px 8px",
    backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
    // the ring: a gap in the popover's colour, then the ring's, which says why
    "&[data-active], &[aria-checked=true], &[aria-pressed=true], &:focus-visible, &[data-focus-visible], &[data-drop-target], &[data-duplicate]":
      { boxShadow: "0 0 0 2px var(--popover), 0 0 0 4px var(--swatch-ring)" },
    "&[data-active], &[aria-checked=true], &[aria-pressed=true]": {
      "--swatch-ring": "var(--brand, var(--primary))",
    },
    // where a dragged colour or font lands, and the pick it would duplicate
    "&:is(:focus-visible, [data-focus-visible], [data-drop-target]):not([data-duplicate])": {
      "--swatch-ring": tokens.ring,
    },
    "&[data-duplicate]": { "--swatch-ring": tokens.destructive },
  },
);

export const swatchFill = d(pinned, cover, { borderRadius: "5px" });

export const menuSurface = d(surface.elevated, scrolls, takesPointer, {
  minWidth: "220px",
  maxHeight: "min(70vh, 560px)",
  padding: space.x1,
  "& [role=menu]": { outline: "none", listStyle: "none", margin: "0", padding: "0" },
  "& [role=separator]": { height: "1px", marginBlock: space.x1, backgroundColor: tokens.border },
});

export const menuItem = d(layout.row, gap[2], rounded.sm, focus.none, target.size, glyph.md, {
  paddingInline: space.x2,
  paddingBlock: space.x1_5,
  cursor: "default",
  userSelect: "none",
  "&[data-focused], &:hover": { backgroundColor: tokens.accent },
  "&[data-disabled]": { opacity: "0.45" },
  "&[data-variant=destructive]": { color: tokens.destructive },
});

export const menuShortcut = d(type.meta, layout.pushEnd, {
  paddingInlineStart: space.x4,
  fontFamily: "inherit",
});

export const menuCheck = d(layout.inlineCentre, { width: "16px" });

export const textInput = d(
  edge.input,
  rounded.md,
  focus.visible,
  layout.fill,
  layout.minZero,
  inherits,
  bg.transparent,
  { height: "30px", paddingInline: space.x2 },
);
