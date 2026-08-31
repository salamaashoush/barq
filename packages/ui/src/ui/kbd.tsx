import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

const kbd = ui({
  pointerEvents: "none",
  display: "inline-flex",
  height: "calc(var(--spacing) * 5)",
  width: "fit-content",
  minWidth: "calc(var(--spacing) * 5)",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--spacing)",
  borderRadius: "calc(var(--radius) - 4px)",
  backgroundColor: "var(--muted)",
  paddingInline: "var(--spacing)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
  color: "var(--muted-foreground)",
  "-webkit-user-select": "none",
  userSelect: "none",
  '& svg:not([class*="size-"])': {
    width: "calc(var(--spacing) * 3)",
    height: "calc(var(--spacing) * 3)",
  },
  '[data-slot="tooltip-content"] &': {
    backgroundColor: "var(--background)",
    color: "var(--background)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--background) 20%, transparent)",
    },
  },
  '[data-slot="tooltip-content"] &:is(.dark *)': {
    backgroundColor: "var(--background)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--background) 10%, transparent)",
    },
  },
});

const group = ui({
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing)",
});

/**
 * ```tsx
 * <KbdGroup>
 *   <Kbd>⌘</Kbd>
 *   <Kbd>K</Kbd>
 * </KbdGroup>
 * ```
 */
export function Kbd(props: Incoming<UiProps>) {
  return <kbd {...uiProps("kbd", kbd, props)}>{props.children}</kbd>;
}

export function KbdGroup(props: Incoming<UiProps>) {
  return <kbd {...uiProps("kbd-group", group, props)}>{props.children}</kbd>;
}
