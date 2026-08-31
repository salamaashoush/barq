import type { Incoming } from "@barqjs/core";

import "../theme/layers.ts";
import { ui } from "../lib/atoms.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

/**
 * A scrolling box with a scrollbar that matches the theme.
 *
 * Radix — and so shadcn — hides the native scrollbar and draws its own out of
 * two `<div>`s, a resize observer and a pointer-drag handler, because
 * `scrollbar-color` did not exist when that component was written. It does now,
 * in every engine, so this is the native scroller with the theme's colours on
 * it: it scrolls with the wheel, the trackpad, the keyboard and a touch flick
 * without any of that machinery, and it does not break when the content
 * changes size.
 *
 * The trade is stated rather than hidden: a native scrollbar cannot be made to
 * overlay the content or to fade out when idle. If you need that, the DOM is
 * yours and this component is forty lines.
 */
const box = ui({
  position: "relative",
  overflow: "auto",
  overscrollBehavior: "contain",
  scrollbarWidth: "thin",
  scrollbarColor: "var(--border) transparent",
  ":focus-visible": {
    outline: "1px solid var(--ring)",
    "--ui-ring-shadow": "0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent)",
    boxShadow: "var(--ui-ring-shadow)",
  },
  "/* WebKit still needs its own, and ignores scrollbar-color. */ &::-webkit-scrollbar": {
    width: "calc(var(--spacing) * 2.5)",
    height: "calc(var(--spacing) * 2.5)",
  },
  "::-webkit-scrollbar-track": {
    background: "transparent",
  },
  "::-webkit-scrollbar-thumb": {
    borderRadius: "calc(infinity * 1px)",
    backgroundColor: "var(--border)",
    border: "3px solid transparent",
    backgroundClip: "content-box",
  },
});

export interface ScrollAreaProps extends UiProps {
  /** Which way it scrolls. `both` is the default the CSS already gives. */
  orientation?: "vertical" | "horizontal" | "both";
}

export function ScrollArea(props: Incoming<ScrollAreaProps>) {
  return (
    <div
      {...uiProps("scroll-area", box, props)}
      data-orientation={props.orientation?.() ?? "both"}
      // Focusable, so a keyboard can scroll it. A scrolling region nobody can
      // reach with Tab is a WCAG failure, and the platform only makes one
      // focusable on its own in Firefox.
      tabIndex={props.tabIndex?.() ?? 0}
      role={props.role?.() ?? "region"}
    >
      {props.children}
    </div>
  );
}
