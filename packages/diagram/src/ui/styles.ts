import { diagramLayer as d } from "./layer.ts";

/**
 * The UI's surfaces and controls, on arc's tokens: light, dark and an app's
 * brand all reach them. Each value falls back to something legible when the
 * page installs no theme.
 */

/** The layer over the canvases: it takes no pointer itself, its islands do. */
export const layerUI = d({
  position: "absolute",
  inset: "0",
  // what changes in the UI (the zoom level as it zooms) lays out only itself
  contain: "layout style",
  pointerEvents: "none",
  zIndex: "3",
  fontFamily: "var(--font-sans, system-ui, sans-serif)",
  fontSize: "var(--text-sm, 0.875rem)",
  color: "var(--foreground, CanvasText)",
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
export const island = d({
  pointerEvents: "auto",
  contain: "layout style",
  display: "flex",
  alignItems: "center",
  gap: "2px",
  padding: "4px",
  borderRadius: "calc(var(--radius, 0.5rem) + 2px)",
  backgroundColor: "var(--popover, Canvas)",
  color: "var(--popover-foreground, CanvasText)",
  boxShadow: "0 1px 3px rgb(0 0 0 / 0.12), 0 0 0 1px var(--border, rgb(0 0 0 / 0.08))",
});

export const panel = d({
  pointerEvents: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  width: "212px",
  padding: "12px",
  overflowY: "auto",
  borderRadius: "calc(var(--radius, 0.5rem) + 2px)",
  backgroundColor: "var(--popover, Canvas)",
  color: "var(--popover-foreground, CanvasText)",
  boxShadow: "0 1px 3px rgb(0 0 0 / 0.12), 0 0 0 1px var(--border, rgb(0 0 0 / 0.08))",
});

export const divider = d({
  width: "1px",
  alignSelf: "stretch",
  marginBlock: "4px",
  marginInline: "4px",
  backgroundColor: "var(--border, rgb(0 0 0 / 0.12))",
});

/** A square icon control: a tool, an action, a choice. */
export const iconButton = d({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "32px",
  height: "32px",
  flexShrink: "0",
  padding: "0",
  border: "none",
  borderRadius: "var(--radius, 0.5rem)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  font: "inherit",
  outline: "none",
  "&:hover": { backgroundColor: "var(--accent, rgb(0 0 0 / 0.06))" },
  "&[data-focus-visible], &:focus-visible": {
    boxShadow: "0 0 0 2px var(--ring, Highlight)",
  },
  "&[aria-pressed=true], &[aria-checked=true], &[data-selected], &[data-active]": {
    backgroundColor: "var(--brand, var(--primary, Highlight))",
    color: "var(--brand-ink, var(--primary-foreground, HighlightText))",
  },
  "&[aria-disabled=true], &:disabled, &[data-disabled]": {
    opacity: "0.4",
    cursor: "default",
  },
  "& svg": { width: "18px", height: "18px" },
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

export const legend = d({
  padding: "0",
  marginBottom: "4px",
  fontSize: "var(--text-xs, 0.75rem)",
  color: "var(--muted-foreground, GrayText)",
});

export const buttonRow = d({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "4px",
});

/** An icon radio: the input hidden, its label drawn as the choice. */
export const radioChoice = d({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "32px",
  height: "32px",
  borderRadius: "var(--radius, 0.5rem)",
  backgroundColor: "var(--muted, rgb(0 0 0 / 0.04))",
  cursor: "pointer",
  "&:hover": { backgroundColor: "var(--accent, rgb(0 0 0 / 0.08))" },
  "&[data-selected]": {
    backgroundColor: "var(--brand, var(--primary, Highlight))",
    color: "var(--brand-ink, var(--primary-foreground, HighlightText))",
  },
  "&[data-focus-visible]": { boxShadow: "0 0 0 2px var(--ring, Highlight)" },
  "&[data-disabled]": { opacity: "0.4", cursor: "default" },
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
  border: "1px solid var(--border, rgb(0 0 0 / 0.15))",
  cursor: "pointer",
  outline: "none",
  // transparent shows as a chequerboard
  backgroundImage:
    "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
  backgroundSize: "8px 8px",
  backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
  "&[data-active], &[aria-checked=true], &[aria-pressed=true]": {
    boxShadow:
      "0 0 0 2px var(--popover, Canvas), 0 0 0 4px var(--brand, var(--primary, Highlight))",
  },
  "&:focus-visible, &[data-focus-visible]": {
    boxShadow: "0 0 0 2px var(--popover, Canvas), 0 0 0 4px var(--ring, Highlight)",
  },
});

export const swatchFill = d({
  position: "absolute",
  inset: "0",
  borderRadius: "5px",
});

export const menuSurface = d({
  pointerEvents: "auto",
  minWidth: "220px",
  maxHeight: "min(70vh, 560px)",
  overflowY: "auto",
  padding: "4px",
  borderRadius: "calc(var(--radius, 0.5rem) + 2px)",
  backgroundColor: "var(--popover, Canvas)",
  color: "var(--popover-foreground, CanvasText)",
  boxShadow: "0 4px 16px rgb(0 0 0 / 0.16), 0 0 0 1px var(--border, rgb(0 0 0 / 0.08))",
  "& [role=menu]": { outline: "none", listStyle: "none", margin: "0", padding: "0" },
  "& [role=separator]": {
    height: "1px",
    marginBlock: "4px",
    backgroundColor: "var(--border, rgb(0 0 0 / 0.12))",
  },
});

export const menuItem = d({
  display: "flex",
  alignItems: "center",
  gap: "8px",
  paddingInline: "8px",
  paddingBlock: "6px",
  borderRadius: "var(--radius, 0.375rem)",
  cursor: "default",
  outline: "none",
  userSelect: "none",
  "&[data-focused], &:hover": { backgroundColor: "var(--accent, rgb(0 0 0 / 0.06))" },
  "&[data-disabled]": { opacity: "0.45" },
  "&[data-variant=destructive]": { color: "var(--destructive, #e03131)" },
  "& svg": { width: "16px", height: "16px", flexShrink: "0" },
});

export const menuShortcut = d({
  marginInlineStart: "auto",
  paddingInlineStart: "16px",
  fontSize: "var(--text-xs, 0.75rem)",
  color: "var(--muted-foreground, GrayText)",
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

export const textInput = d({
  width: "100%",
  minWidth: "0",
  height: "30px",
  paddingInline: "8px",
  borderRadius: "var(--radius, 0.375rem)",
  border: "1px solid var(--input, var(--border, rgb(0 0 0 / 0.2)))",
  backgroundColor: "transparent",
  color: "inherit",
  font: "inherit",
  outline: "none",
  "&:focus-visible": { boxShadow: "0 0 0 2px var(--ring, Highlight)" },
});
