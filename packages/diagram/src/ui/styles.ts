import {
  edge,
  focus,
  interaction,
  layout,
  rounded,
  surface,
  target,
  type,
} from "@barqjs/arc/style";

import { diagramLayer as d } from "./layer.ts";

/**
 * The UI's surfaces and controls, composed from `@barqjs/arc/style`'s
 * treatments: light, dark, density, high contrast and an app's brand all
 * reach them. What is the editor's own (a canvas UI's fixed sizes, the
 * pressed state of a tool) is written here.
 */

/** The layer over the canvases: it takes no pointer itself, its islands do. */
export const layerUI = d(type.sm, {
  position: "absolute",
  inset: "0",
  // what changes in the UI (the zoom level as it zooms) lays out only itself
  contain: "layout style",
  pointerEvents: "none",
  zIndex: "3",
  fontFamily: "var(--font-sans)",
  color: "var(--foreground)",
});

export const topStart = d({
  position: "absolute",
  display: "flex",
  gap: "8px",
  pointerEvents: "none",
  top: "12px",
  insetInlineStart: "12px",
  flexDirection: "column",
  alignItems: "flex-start",
  maxHeight: "calc(100% - 80px)",
});

export const topCenter = d({
  position: "absolute",
  display: "flex",
  gap: "8px",
  pointerEvents: "none",
  top: "12px",
  insetInline: "0",
  justifyContent: "center",
});

export const topEnd = d({
  position: "absolute",
  display: "flex",
  gap: "8px",
  pointerEvents: "none",
  top: "12px",
  insetInlineEnd: "12px",
  flexDirection: "column",
  alignItems: "flex-end",
});

export const bottomStart = d({
  position: "absolute",
  display: "flex",
  gap: "8px",
  pointerEvents: "none",
  bottom: "12px",
  insetInlineStart: "12px",
  alignItems: "flex-end",
});

export const bottomEnd = d({
  position: "absolute",
  display: "flex",
  gap: "8px",
  pointerEvents: "none",
  bottom: "12px",
  insetInlineEnd: "12px",
  alignItems: "flex-end",
});

/** A floating surface: the toolbar, a panel, the footer's groups. */
export const island = d(surface.elevated, layout.row, {
  pointerEvents: "auto",
  contain: "layout style",
  gap: "2px",
  padding: "4px",
});

export const panel = d(surface.elevated, layout.column, {
  pointerEvents: "auto",
  gap: "12px",
  width: "212px",
  padding: "12px",
  overflowY: "auto",
});

export const divider = d({
  width: "1px",
  alignSelf: "stretch",
  marginBlock: "4px",
  marginInline: "4px",
  backgroundColor: "var(--border)",
});

/** A square icon control: a tool, an action, a choice. */
export const iconButton = d(layout.inlineCentre, layout.noShrink, rounded.md, focus.none, {
  position: "relative",
  width: "32px",
  height: "32px",
  padding: "0",
  border: "none",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  font: "inherit",
  "&:hover": { backgroundColor: "var(--accent)" },
  "&[data-focus-visible], &:focus-visible": {
    boxShadow: "0 0 0 2px var(--ring)",
  },
  "&[aria-pressed=true], &[aria-checked=true], &[data-selected], &[data-active]": {
    backgroundColor: "var(--brand, var(--primary))",
    color: "var(--brand-ink, var(--primary-foreground))",
  },
  "&[aria-disabled=true], &:disabled, &[data-disabled]": {
    opacity: "0.4",
    cursor: "default",
  },
  "& svg": { width: "18px", height: "18px" },
  // a finger's size, under a coarse pointer and once the editor has been touched
  "@media (pointer: coarse)": { width: "44px", height: "44px" },
  "[data-touch] &": { width: "44px", height: "44px" },
});

/** The key that picks a tool, in the button's corner. */
export const keyHint = d({
  position: "absolute",
  insetInlineEnd: "2px",
  bottom: "1px",
  fontSize: "9px",
  lineHeight: "1",
  opacity: "0.6",
  pointerEvents: "none",
});

/** A panel's section: a name over its controls. */
export const fieldset = d({
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  margin: "0",
  padding: "0",
  border: "none",
  minWidth: "0",
});

export const legend = d(type.meta, { padding: "0", marginBottom: "4px" });

export const buttonRow = d({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "4px",
});

/** An icon radio: the input hidden, its label drawn as the choice. */
export const radioChoice = d(layout.inlineCentre, rounded.md, interaction.pressable, {
  position: "relative",
  width: "32px",
  height: "32px",
  backgroundColor: "var(--muted)",
  "&:hover": { backgroundColor: "var(--accent)" },
  "&[data-selected]": {
    backgroundColor: "var(--brand, var(--primary))",
    color: "var(--brand-ink, var(--primary-foreground))",
  },
  "&[data-focus-visible], &:has([data-drop-target])": {
    boxShadow: "0 0 0 2px var(--ring)",
  },
  "&:has([data-duplicate])": { boxShadow: "0 0 0 2px var(--destructive)" },
  "&[data-disabled]": { opacity: "0.4", cursor: "default" },
  "@media (pointer: coarse)": { width: "44px", height: "44px" },
  "[data-touch] &": { width: "44px", height: "44px" },
  "& input": {
    position: "absolute",
    opacity: "0",
    width: "1px",
    height: "1px",
    margin: "0",
    pointerEvents: "none",
  },
  "& svg": { width: "18px", height: "18px" },
});

export const radioGroupRow = d({
  display: "flex",
  flexWrap: "wrap",
  gap: "4px",
});

/** A colour, as a square. */
export const swatch = d({
  position: "relative",
  width: "24px",
  height: "24px",
  padding: "0",
  flexShrink: "0",
  borderRadius: "6px",
  border: "1px solid var(--border)",
  cursor: "pointer",
  outline: "none",
  "@media (pointer: coarse)": { width: "36px", height: "36px" },
  "[data-touch] &": { width: "36px", height: "36px" },
  // transparent shows as a chequerboard
  backgroundImage:
    "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
  backgroundSize: "8px 8px",
  backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
  "&[data-active], &[aria-checked=true], &[aria-pressed=true]": {
    boxShadow: "0 0 0 2px var(--popover), 0 0 0 4px var(--brand, var(--primary))",
  },
  "&:focus-visible, &[data-focus-visible]": {
    boxShadow: "0 0 0 2px var(--popover), 0 0 0 4px var(--ring)",
  },
  // where a dragged colour or font lands, and the pick it would duplicate
  "&[data-drop-target]": {
    boxShadow: "0 0 0 2px var(--popover), 0 0 0 4px var(--ring)",
  },
  "&[data-duplicate]": {
    boxShadow: "0 0 0 2px var(--popover), 0 0 0 4px var(--destructive)",
  },
});

export const swatchFill = d({
  position: "absolute",
  inset: "0",
  borderRadius: "5px",
});

export const menuSurface = d(surface.elevated, {
  pointerEvents: "auto",
  minWidth: "220px",
  maxHeight: "min(70vh, 560px)",
  overflowY: "auto",
  padding: "4px",
  "& [role=menu]": { outline: "none", listStyle: "none", margin: "0", padding: "0" },
  "& [role=separator]": {
    height: "1px",
    marginBlock: "4px",
    backgroundColor: "var(--border)",
  },
});

export const menuItem = d(layout.row, rounded.sm, focus.none, target.size, {
  gap: "8px",
  paddingInline: "8px",
  paddingBlock: "6px",
  cursor: "default",
  userSelect: "none",
  "&[data-focused], &:hover": { backgroundColor: "var(--accent)" },
  "&[data-disabled]": { opacity: "0.45" },
  "&[data-variant=destructive]": { color: "var(--destructive)" },
  "& svg": { width: "16px", height: "16px", flexShrink: "0" },
});

export const menuShortcut = d(type.meta, layout.pushEnd, {
  paddingInlineStart: "16px",
  fontFamily: "inherit",
});

export const menuCheck = d({
  width: "16px",
  display: "inline-flex",
  justifyContent: "center",
});

export const visuallyHidden = d({
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: "0",
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: "0",
});

export const textInput = d(edge.input, rounded.md, focus.visible, layout.fill, layout.minZero, {
  height: "30px",
  paddingInline: "8px",
  backgroundColor: "transparent",
  color: "inherit",
  font: "inherit",
});
