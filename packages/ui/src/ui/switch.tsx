import { Switch as AriaSwitch, type SwitchComponentProps } from "@barqjs/aria/switch";
import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { ringSlot } from "../lib/shared-ring-slot.ts";
import { when } from "../lib/shared-when.ts";

const ui = layer("barq.ui");

const track = ui(
  box.border,
  box.transition,
  box.outline,
  ringSlot.focus,
  ringSlot.invalid,
  ringSlot.invalidRing,
  ringSlot.invalidDark,
  ringSlot.invalidBorderDark,
  when.disabledCursor,
  // `peer` for a label beside it, `group/switch` for the thumb inside it.
  "peer group/switch",
  {
    position: "relative",
    display: "inline-flex",
    flexShrink: "0",
    alignItems: "center",
    borderRadius: "calc(infinity * 1px)",
    borderColor: "transparent",
    transitionProperty: "all",
    // A 32x18 track is under the 24px minimum a pointer target wants, so the
    // press area is grown past the paint with a pseudo-element.
    "::after": {
      content: "var(--ui-content)",
      position: "absolute",
      insetInline: "calc(var(--spacing) * -3)",
      insetBlock: "calc(var(--spacing) * -2)",
    },
    // A field label draws the focus ring around the whole row, so the switch
    // inside it draws none of its own.
    ":is(:where(.group\\/field-label):has(:focus-visible) *)": {
      borderColor: "transparent",
      "--ui-ring-shadow":
        "var(--ui-ring-inset,) 0 0 0 calc(0px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    },
    '[data-size="default"]': {
      height: "18.4px",
      width: "32px",
    },
    '[data-size="sm"]': {
      height: "14px",
      width: "24px",
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
  },
);

const thumb = ui(box.shadow, box.transition, {
  pointerEvents: "none",
  display: "block",
  "--ui-translate-x": "0px",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  borderRadius: "calc(infinity * 1px)",
  backgroundColor: "var(--background)",
  "--ui-ring-shadow":
    "var(--ui-ring-inset,) 0 0 0 calc(0px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
  transitionProperty: "transform, translate, scale, rotate",
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
