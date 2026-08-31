import { Switch as AriaSwitch, type SwitchComponentProps } from "@barqjs/aria/switch";
import type { Incoming } from "@barqjs/core";
import { atomsIn } from "@barqjs/css";

import "../theme/layers.ts";
import { ui } from "../lib/atoms.ts";

const track = atomsIn("barq.ui", {
  display: "inline-flex",
  flexShrink: "0",
  alignItems: "center",
  borderRadius: "calc(infinity * 1px)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  borderColor: "transparent",
  "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  transitionProperty: "all",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  '[data-size="default"]': {
    height: "1.15rem",
    width: "calc(var(--spacing) * 8)",
  },
  '[data-size="sm"]': {
    height: "calc(var(--spacing) * 3.5)",
    width: "calc(var(--spacing) * 6)",
  },
  "[data-selected]": {
    backgroundColor: "var(--primary)",
  },
  ":not([data-selected])": {
    backgroundColor: "var(--input)",
  },
  ":is(.dark *):not([data-selected])": {
    backgroundColor: "var(--input)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--input) 80%, transparent)",
    },
  },
  "[data-focus-visible]": {
    borderColor: "var(--ring)",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "var(--ring)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
    },
  },
  "[data-disabled]": {
    cursor: "not-allowed",
    opacity: "50%",
  },
});

const thumb = atomsIn("barq.ui", {
  pointerEvents: "none",
  display: "block",
  "--ui-translate-x": "0px",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  borderRadius: "calc(infinity * 1px)",
  backgroundColor: "var(--background)",
  "--ui-ring-shadow":
    "var(--ui-ring-inset,) 0 0 0 calc(0px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  transitionProperty: "transform, translate, scale, rotate",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  ":is(.dark *):not([data-selected] *)": {
    backgroundColor: "var(--foreground)",
  },
  "[data-selected] &": {
    "--ui-translate-x": "calc(100% - 2px)",
    translate: "var(--ui-translate-x) var(--ui-translate-y)",
  },
  "[data-selected] &:is(.dark *)": {
    backgroundColor: "var(--primary-foreground)",
  },
  '[data-size="default"] &': {
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
  },
  '[data-size="sm"] &': {
    width: "calc(var(--spacing) * 3)",
    height: "calc(var(--spacing) * 3)",
  },
});

export type SwitchSize = "default" | "sm";

export interface SwitchProps extends SwitchComponentProps {
  size?: SwitchSize;
  children?: never;
}

/**
 * ```tsx
 * <Switch id="wifi" defaultSelected onChange={(on) => setWifi(on)} />
 * <Label for="wifi">Wi-Fi</Label>
 * ```
 *
 * The thumb's position is a rule keyed off the track's `data-selected`, not a
 * class the component swaps: `[data-selected] &` moves it, so the transition
 * runs off one attribute changing.
 */
export function Switch(props: Incoming<SwitchProps>) {
  return (
    <AriaSwitch
      {...props}
      data-slot={props["data-slot"]?.() ?? "switch"}
      data-size={props.size?.() ?? "default"}
      class={ui(track, props.class?.(), props.className?.())}
    >
      <span data-slot="switch-thumb" class={thumb} />
    </AriaSwitch>
  );
}
