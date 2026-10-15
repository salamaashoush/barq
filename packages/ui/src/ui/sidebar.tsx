import { button, type ButtonOptions } from "@barqjs/aria/button";
import {
  filterDOMProps,
  mergeProps,
  triggerSlot,
  type DOMProps,
  type MaybeAccessor,
} from "@barqjs/aria/utils";
import {
  createContext,
  getContext,
  getOwner,
  provide,
  createSignal,
  type Child,
  type Incoming,
} from "@barqjs/core";
import { firstThatWorks, layer, variants } from "@barqjs/css";
import { PanelLeft } from "@barqjs/lucide/icons/panel-left";
import { on } from "@barqjs/primitives/event";
import { ref as makeRef, mergeRefs } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { useIsMobile } from "../hooks/use-mobile.ts";
import { uiProps } from "../lib/slot.ts";
import { Button, type ButtonProps } from "./button.tsx";
import { Input, type InputProps } from "./input.tsx";
import { Separator } from "./separator.tsx";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./sheet.tsx";
import { Skeleton } from "./skeleton.tsx";
import { srOnly } from "./sr-only.ts";
import { Tooltip, TooltipContent, type TooltipContentProps } from "./tooltip.tsx";

import type { UiProps } from "../lib/props.ts";

const ui = layer("barq.ui");

/** shadcn's own five, and the keyboard shortcut it binds. */
const WIDTH = "16rem";
const WIDTH_MOBILE = "18rem";
const WIDTH_ICON = "3rem";
const SHORTCUT = "b";
const COOKIE = "sidebar_state";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

const wrapper = ui({
  display: "flex",
  minHeight: "100svh",
  width: "100%",
  ':has([data-variant="inset"])': {
    backgroundColor: "var(--sidebar)",
  },
});

const none = ui({
  display: "flex",
  height: "100%",
  width: "var(--sidebar-width)",
  flexDirection: "column",
  backgroundColor: "var(--sidebar)",
  color: "var(--sidebar-foreground)",
});

const mobile = ui({
  // In the class as well as the style below: the sheet is portalled out of the
  // wrapper that declares the width, so the content has to declare its own.
  "--sidebar-width": WIDTH_MOBILE,
  width: "var(--sidebar-width)",
  backgroundColor: "var(--sidebar)",
  padding: "0px",
  color: "var(--sidebar-foreground)",
  "& > button": {
    display: "none",
  },
});

const shell = ui({
  display: "none",
  color: "var(--sidebar-foreground)",
  "@media (width >= 48rem)": {
    "&": {
      display: "block",
    },
  },
});

const gap = ui({
  position: "relative",
  width: "var(--sidebar-width)",
  backgroundColor: "transparent",
  transitionProperty: "width",
  transitionTimingFunction: firstThatWorks(
    "linear",
    "var(--ui-ease, var(--default-transition-timing-function))",
  ),
  transitionDuration: firstThatWorks(
    "200ms",
    "var(--ui-duration, var(--default-transition-duration))",
  ),
  "--ui-duration": "200ms",
  "--ui-ease": "linear",
  ':is(:where(.group)[data-collapsible="icon"] *)': {
    width: "var(--sidebar-width-icon)",
  },
  ':is(:where(.group)[data-collapsible="offcanvas"] *)': {
    width: "0px",
  },
  ':is(:where(.group)[data-side="right"] *)': {
    rotate: "180deg",
  },
});

const gapFloating = ui({
  ':is(:where(.group)[data-collapsible="icon"] *)': {
    width: "calc(var(--sidebar-width-icon) + (calc(var(--spacing) * 4)))",
  },
});

const container = ui({
  position: "fixed",
  insetBlock: "0px",
  zIndex: "10",
  display: "none",
  // NOT `h-svh`, which is upstream's. `inset-block: 0` already says "as tall as
  // my containing block", and for a fixed element with no contained ancestor
  // that IS the viewport — so the two agree wherever `h-svh` was right, and
  // only disagree where it was wrong. Inside anything establishing a containing
  // block for fixed descendants (`contain: layout`, a `transform`, a container),
  // a viewport unit is the one thing containment cannot redirect: the sidebar
  // came out a window tall inside a shorter panel with its footer below the
  // fold. Recorded in `ALLOWED`.
  width: "var(--sidebar-width)",
  transitionProperty: "left,right,width",
  transitionTimingFunction: firstThatWorks(
    "linear",
    "var(--ui-ease, var(--default-transition-timing-function))",
  ),
  transitionDuration: firstThatWorks(
    "200ms",
    "var(--ui-duration, var(--default-transition-duration))",
  ),
  "--ui-duration": "200ms",
  "--ui-ease": "linear",
  "@media (width >= 48rem)": {
    "&": {
      display: "flex",
    },
  },
});

const containerLeft = ui({
  left: "0px",
  ':is(:where(.group)[data-collapsible="offcanvas"] *)': {
    left: "calc(var(--sidebar-width) * -1)",
  },
});

const containerRight = ui({
  right: "0px",
  ':is(:where(.group)[data-collapsible="offcanvas"] *)': {
    right: "calc(var(--sidebar-width) * -1)",
  },
});

const containerPlain = ui({
  ':is(:where(.group)[data-collapsible="icon"] *)': {
    width: "var(--sidebar-width-icon)",
  },
  ':is(:where(.group)[data-side="left"] *)': {
    borderRightStyle: "var(--ui-border-style)",
    borderRightWidth: "1px",
  },
  ':is(:where(.group)[data-side="right"] *)': {
    borderLeftStyle: "var(--ui-border-style)",
    borderLeftWidth: "1px",
  },
});

const containerFloating = ui({
  padding: "calc(var(--spacing) * 2)",
  ':is(:where(.group)[data-collapsible="icon"] *)': {
    width: "calc(var(--sidebar-width-icon) + (calc(var(--spacing) * 4)) + 2px)",
  },
});

const inner = ui({
  display: "flex",
  height: "100%",
  width: "100%",
  flexDirection: "column",
  backgroundColor: "var(--sidebar)",
  ':is(:where(.group)[data-variant="floating"] *)': {
    borderRadius: "var(--radius)",
    borderStyle: "var(--ui-border-style)",
    borderWidth: "1px",
    borderColor: "var(--sidebar-border)",
    "--ui-shadow":
      "0 1px 3px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 1px 2px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  },
});

const trigger = ui({
  width: "calc(var(--spacing) * 7)",
  height: "calc(var(--spacing) * 7)",
});

const rail = ui({
  position: "absolute",
  insetBlock: "0px",
  zIndex: "20",
  display: "none",
  width: "calc(var(--spacing) * 4)",
  "--ui-translate-x": "calc(calc(1 / 2 * 100%) * -1)",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  transitionProperty: "all",
  transitionTimingFunction: firstThatWorks(
    "linear",
    "var(--ui-ease, var(--default-transition-timing-function))",
  ),
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  "--ui-ease": "linear",
  ':is(:where(.group)[data-collapsible="offcanvas"] *)': {
    "--ui-translate-x": "0px",
    translate: "var(--ui-translate-x) var(--ui-translate-y)",
  },
  ':is(:where(.group)[data-side="left"] *)': {
    right: "calc(var(--spacing) * -4)",
  },
  ':is(:where(.group)[data-side="right"] *)': {
    left: "0px",
  },
  "::after": {
    content: "var(--ui-content)",
    position: "absolute",
    insetBlock: "0px",
    left: "calc(1 / 2 * 100%)",
    width: "2px",
  },
  ':is(:where(.group)[data-collapsible="offcanvas"] *)::after': {
    content: "var(--ui-content)",
    left: "100%",
  },
  "@media (hover: hover)": {
    ':hover:is(:where(.group)[data-collapsible="offcanvas"] *)': {
      backgroundColor: "var(--sidebar)",
    },
    ":hover::after": {
      content: "var(--ui-content)",
      backgroundColor: "var(--sidebar-border)",
    },
  },
  ':where([data-side="left"]) &': {
    cursor: "w-resize",
  },
  ':where([data-side="right"]) &': {
    cursor: "e-resize",
  },
  "@media (width >= 40rem)": {
    "&": {
      display: "flex",
    },
  },
});

const inset = ui({
  position: "relative",
  display: "flex",
  width: "100%",
  flex: "1",
  flexDirection: "column",
  backgroundColor: "var(--background)",
  "@media (width >= 48rem)": {
    ':is(:where(.peer)[data-variant="inset"] ~ *)': {
      margin: "calc(var(--spacing) * 2)",
      marginLeft: "0px",
      borderRadius: "calc(var(--radius) * 1.4)",
      "--ui-shadow":
        "0 1px 3px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 1px 2px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
      boxShadow:
        "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    },
    ':is(:where(.peer)[data-variant="inset"] ~ *):is(:where(.peer)[data-state="collapsed"] ~ *)': {
      marginLeft: "calc(var(--spacing) * 2)",
    },
  },
});

const input = ui({
  height: "calc(var(--spacing) * 8)",
  width: "100%",
  backgroundColor: "var(--background)",
  "--ui-shadow": "0 0 #0000",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
});

const header = ui({
  display: "flex",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 2)",
  padding: "calc(var(--spacing) * 2)",
});

const footer = ui({
  display: "flex",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 2)",
  padding: "calc(var(--spacing) * 2)",
});

const separator = ui({
  marginInline: "calc(var(--spacing) * 2)",
  width: "auto",
  backgroundColor: "var(--sidebar-border)",
});

const content = ui({
  display: "flex",
  minHeight: "0px",
  flex: "1",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 2)",
  overflow: "auto",
  ':is(:where(.group)[data-collapsible="icon"] *)': {
    overflow: "hidden",
  },
});

const group = ui({
  position: "relative",
  display: "flex",
  width: "100%",
  minWidth: "0px",
  flexDirection: "column",
  padding: "calc(var(--spacing) * 2)",
});

const groupLabel = ui({
  display: "flex",
  height: "calc(var(--spacing) * 8)",
  flexShrink: "0",
  alignItems: "center",
  borderRadius: "calc(var(--radius) * 0.8)",
  paddingInline: "calc(var(--spacing) * 2)",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
  color: "var(--sidebar-foreground)",
  "--ui-ring-color": "var(--sidebar-ring)",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  transitionProperty: "margin,opacity",
  transitionTimingFunction: firstThatWorks(
    "linear",
    "var(--ui-ease, var(--default-transition-timing-function))",
  ),
  transitionDuration: firstThatWorks(
    "200ms",
    "var(--ui-duration, var(--default-transition-duration))",
  ),
  "--ui-duration": "200ms",
  "--ui-ease": "linear",
  "@supports (color: color-mix(in lab, red, red))": {
    color: "color-mix(in oklab, var(--sidebar-foreground) 70%, transparent)",
  },
  "@media (forced-colors: active)": {
    outline: "2px solid transparent",
    outlineOffset: "2px",
  },
  ':is(:where(.group)[data-collapsible="icon"] *)': {
    marginTop: "calc(var(--spacing) * -8)",
    opacity: "0%",
  },
  ":focus-visible": {
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(2px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  },
  "& > svg": {
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
    flexShrink: "0",
  },
});

const groupAction = ui({
  position: "absolute",
  top: "calc(var(--spacing) * 3.5)",
  insetInlineEnd: "calc(var(--spacing) * 3)",
  display: "flex",
  aspectRatio: "1 / 1",
  width: "calc(var(--spacing) * 5)",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "calc(var(--radius) * 0.8)",
  padding: "0px",
  color: "var(--sidebar-foreground)",
  "--ui-ring-color": "var(--sidebar-ring)",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  transitionProperty: "transform, translate, scale, rotate",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  "@media (forced-colors: active)": {
    outline: "2px solid transparent",
    outlineOffset: "2px",
  },
  ':is(:where(.group)[data-collapsible="icon"] *)': {
    display: "none",
  },
  "::after": {
    content: "var(--ui-content)",
    position: "absolute",
    inset: "calc(var(--spacing) * -2)",
  },
  "@media (hover: hover)": {
    ":hover": {
      backgroundColor: "var(--sidebar-accent)",
      color: "var(--sidebar-accent-foreground)",
    },
  },
  ":focus-visible": {
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(2px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  },
  "@media (width >= 48rem)": {
    "::after": {
      content: "var(--ui-content)",
      display: "none",
    },
  },
  "& > svg": {
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
    flexShrink: "0",
  },
});

const groupContent = ui({
  width: "100%",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
});

const menu = ui({
  display: "flex",
  width: "100%",
  minWidth: "0px",
  flexDirection: "column",
  gap: "var(--spacing)",
});

const menuItem = ui({
  position: "relative",
});

const menuButton = ui({
  display: "flex",
  width: "100%",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  overflow: "hidden",
  borderRadius: "calc(var(--radius) * 0.8)",
  padding: "calc(var(--spacing) * 2)",
  textAlign: "start",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  "--ui-ring-color": "var(--sidebar-ring)",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  transitionProperty: "width,height,padding",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  "@media (forced-colors: active)": {
    outline: "2px solid transparent",
    outlineOffset: "2px",
  },
  ':is(:where(.group\\/menu-item):has([data-sidebar="menu-action"]) *)': {
    paddingInlineEnd: "calc(var(--spacing) * 8)",
  },
  ':is(:where(.group)[data-collapsible="icon"] *)': {
    width: "calc(var(--spacing) * 8) !important",
    height: "calc(var(--spacing) * 8) !important",
    padding: "calc(var(--spacing) * 2) !important",
  },
  "@media (hover: hover)": {
    ":hover": {
      backgroundColor: "var(--sidebar-accent)",
      color: "var(--sidebar-accent-foreground)",
    },
    '[data-state="open"]:hover': {
      backgroundColor: "var(--sidebar-accent)",
      color: "var(--sidebar-accent-foreground)",
    },
  },
  ":focus-visible": {
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(2px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  },
  ":active": {
    backgroundColor: "var(--sidebar-accent)",
    color: "var(--sidebar-accent-foreground)",
  },
  ":disabled": {
    pointerEvents: "none",
    opacity: "50%",
  },
  '[aria-disabled="true"]': {
    pointerEvents: "none",
    opacity: "50%",
  },
  '[data-active="true"]': {
    backgroundColor: "var(--sidebar-accent)",
    "--ui-font-weight": "var(--font-weight-medium)",
    fontWeight: "var(--font-weight-medium)",
    color: "var(--sidebar-accent-foreground)",
  },
  "& > span:last-child": {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  "& > svg": {
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
    flexShrink: "0",
  },
});

const menuButtonDefault = ui({
  "@media (hover: hover)": {
    ":hover": {
      backgroundColor: "var(--sidebar-accent)",
      color: "var(--sidebar-accent-foreground)",
    },
  },
});

const menuButtonOutline = ui({
  backgroundColor: "var(--background)",
  "--ui-shadow": "0 0 0 1px var(--ui-shadow-color, var(--sidebar-border))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  "@media (hover: hover)": {
    ":hover": {
      backgroundColor: "var(--sidebar-accent)",
      color: "var(--sidebar-accent-foreground)",
      "--ui-shadow": "0 0 0 1px var(--ui-shadow-color, var(--sidebar-accent))",
      boxShadow:
        "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    },
  },
});

const menuButtonSizeDefault = ui({
  height: "calc(var(--spacing) * 8)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
});

const menuButtonSizeSm = ui({
  height: "calc(var(--spacing) * 7)",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
});

const menuButtonSizeLg = ui({
  height: "calc(var(--spacing) * 12)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  ':is(:where(.group)[data-collapsible="icon"] *)': {
    padding: "0px !important",
  },
});

const menuAction = ui({
  position: "absolute",
  top: "calc(var(--spacing) * 1.5)",
  insetInlineEnd: "var(--spacing)",
  display: "flex",
  aspectRatio: "1 / 1",
  width: "calc(var(--spacing) * 5)",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "calc(var(--radius) * 0.8)",
  padding: "0px",
  color: "var(--sidebar-foreground)",
  "--ui-ring-color": "var(--sidebar-ring)",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  transitionProperty: "transform, translate, scale, rotate",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  "@media (forced-colors: active)": {
    outline: "2px solid transparent",
    outlineOffset: "2px",
  },
  ':is(:where(.group)[data-collapsible="icon"] *)': {
    display: "none",
  },
  "@media (hover: hover)": {
    ":is(:where(.peer\\/menu-button):hover ~ *)": {
      color: "var(--sidebar-accent-foreground)",
    },
    ":hover": {
      backgroundColor: "var(--sidebar-accent)",
      color: "var(--sidebar-accent-foreground)",
    },
  },
  ':is(:where(.peer\\/menu-button)[data-size="default"] ~ *)': {
    top: "calc(var(--spacing) * 1.5)",
  },
  ':is(:where(.peer\\/menu-button)[data-size="lg"] ~ *)': {
    top: "calc(var(--spacing) * 2.5)",
  },
  ':is(:where(.peer\\/menu-button)[data-size="sm"] ~ *)': {
    top: "var(--spacing)",
  },
  "::after": {
    content: "var(--ui-content)",
    position: "absolute",
    inset: "calc(var(--spacing) * -2)",
  },
  ":focus-visible": {
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(2px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  },
  "@media (width >= 48rem)": {
    "::after": {
      content: "var(--ui-content)",
      display: "none",
    },
  },
  "& > svg": {
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
    flexShrink: "0",
  },
});

const menuActionHover = ui({
  ":is(:where(.group\\/menu-item):focus-within *)": {
    opacity: "100%",
  },
  "@media (hover: hover)": {
    ":is(:where(.group\\/menu-item):hover *)": {
      opacity: "100%",
    },
  },
  ':is(:where(.peer\\/menu-button)[data-active="true"] ~ *)': {
    color: "var(--sidebar-accent-foreground)",
  },
  '[data-state="open"]': {
    opacity: "100%",
  },
  "@media (width >= 48rem)": {
    "&": {
      opacity: "0%",
    },
  },
});

const menuBadge = ui({
  pointerEvents: "none",
  position: "absolute",
  insetInlineEnd: "var(--spacing)",
  display: "flex",
  height: "calc(var(--spacing) * 5)",
  minWidth: "calc(var(--spacing) * 5)",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "calc(var(--radius) * 0.8)",
  paddingInline: "var(--spacing)",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
  color: "var(--sidebar-foreground)",
  "--ui-numeric-spacing": "tabular-nums",
  fontVariantNumeric:
    "var(--ui-ordinal,) var(--ui-slashed-zero,) var(--ui-numeric-figure,) var(--ui-numeric-spacing,) var(--ui-numeric-fraction,)",
  "-webkit-user-select": "none",
  userSelect: "none",
  ':is(:where(.group)[data-collapsible="icon"] *)': {
    display: "none",
  },
  "@media (hover: hover)": {
    ":is(:where(.peer\\/menu-button):hover ~ *)": {
      color: "var(--sidebar-accent-foreground)",
    },
  },
  ':is(:where(.peer\\/menu-button)[data-active="true"] ~ *)': {
    color: "var(--sidebar-accent-foreground)",
  },
  ':is(:where(.peer\\/menu-button)[data-size="default"] ~ *)': {
    top: "calc(var(--spacing) * 1.5)",
  },
  ':is(:where(.peer\\/menu-button)[data-size="lg"] ~ *)': {
    top: "calc(var(--spacing) * 2.5)",
  },
  ':is(:where(.peer\\/menu-button)[data-size="sm"] ~ *)': {
    top: "var(--spacing)",
  },
});

const menuSkeleton = ui({
  display: "flex",
  height: "calc(var(--spacing) * 8)",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  borderRadius: "calc(var(--radius) * 0.8)",
  paddingInline: "calc(var(--spacing) * 2)",
});

const menuSub = ui({
  marginInline: "calc(var(--spacing) * 3.5)",
  display: "flex",
  minWidth: "0px",
  "--ui-translate-x": "1px",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  flexDirection: "column",
  gap: "var(--spacing)",
  borderInlineStartStyle: "var(--ui-border-style)",
  borderInlineStartWidth: "1px",
  borderColor: "var(--sidebar-border)",
  paddingInline: "calc(var(--spacing) * 2.5)",
  paddingBlock: "calc(var(--spacing) * 0.5)",
  ':is(:where(.group)[data-collapsible="icon"] *)': {
    display: "none",
  },
  // The one-pixel nudge lines the rule up with the icons above it, so it
  // follows the rule to the other side.
  ':where(:dir(rtl), [dir="rtl"], [dir="rtl"] *)': {
    "--ui-translate-x": "-1px",
  },
});

const menuSubItem = ui({
  position: "relative",
});

const menuSubButton = ui({
  display: "flex",
  height: "calc(var(--spacing) * 7)",
  minWidth: "0px",
  "--ui-translate-x": "-1px",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  overflow: "hidden",
  borderRadius: "calc(var(--radius) * 0.8)",
  paddingInline: "calc(var(--spacing) * 2)",
  color: "var(--sidebar-foreground)",
  "--ui-ring-color": "var(--sidebar-ring)",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  "@media (forced-colors: active)": {
    outline: "2px solid transparent",
    outlineOffset: "2px",
  },
  ':is(:where(.group)[data-collapsible="icon"] *)': {
    display: "none",
  },
  "@media (hover: hover)": {
    ":hover": {
      backgroundColor: "var(--sidebar-accent)",
      color: "var(--sidebar-accent-foreground)",
    },
  },
  ":focus-visible": {
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(2px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  },
  ":active": {
    backgroundColor: "var(--sidebar-accent)",
    color: "var(--sidebar-accent-foreground)",
  },
  ":disabled": {
    pointerEvents: "none",
    opacity: "50%",
  },
  '[aria-disabled="true"]': {
    pointerEvents: "none",
    opacity: "50%",
  },
  '[data-active="true"]': {
    backgroundColor: "var(--sidebar-accent)",
    color: "var(--sidebar-accent-foreground)",
  },
  ':where(:dir(rtl), [dir="rtl"], [dir="rtl"] *)': {
    "--ui-translate-x": "1px",
  },
  "& > span:last-child": {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  "& > svg": {
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
    flexShrink: "0",
    color: "var(--sidebar-accent-foreground)",
  },
});

const menuSubButtonSm = ui({
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
});

const menuSubButtonMd = ui({
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
});

export type SidebarSide = "left" | "right";
export type SidebarVariant = "sidebar" | "floating" | "inset";
export type SidebarCollapsible = "offcanvas" | "icon" | "none";

interface SidebarValue {
  readonly state: () => "expanded" | "collapsed";
  readonly open: () => boolean;
  readonly setOpen: (open: boolean) => void;
  readonly openMobile: () => boolean;
  readonly setOpenMobile: (open: boolean) => void;
  readonly isMobile: () => boolean;
  readonly toggle: () => void;
  /** shadcn's name for {@link SidebarValue.toggle}. */
  readonly toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarValue | null>(null);

export function useSidebar(): SidebarValue {
  const value = getContext(SidebarContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <SidebarProvider>.");
  }
  return value;
}

export interface SidebarProviderProps extends UiProps {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * ```tsx
 * <SidebarProvider>
 *   <Sidebar>…</Sidebar>
 *   <SidebarInset>…</SidebarInset>
 * </SidebarProvider>
 * ```
 *
 * Holds the open state, the widths every child reads, and the `Cmd/Ctrl+B` that
 * toggles it. The width lives in `--sidebar-width` rather than in a class so a
 * caller can change it on one element and every part follows.
 */
export function SidebarProvider(props: Incoming<SidebarProviderProps>) {
  const [uncontrolled, setUncontrolled] = createSignal(props.defaultOpen?.() ?? true);
  const [openMobile, writeOpenMobile] = createSignal(false);
  const narrow = useIsMobile();

  const open = (): boolean => props.open?.() ?? uncontrolled();
  const setOpen = (next: boolean): void => {
    if (props.open?.() === undefined) setUncontrolled(next);
    props.onOpenChange?.()?.(next);
    // shadcn persists it, so a reload keeps the layout the person left.
    if (typeof document !== "undefined") {
      document.cookie = `${COOKIE}=${String(next)}; path=/; max-age=${String(COOKIE_MAX_AGE)}`;
    }
  };

  const toggle = (): void => {
    if (narrow()) writeOpenMobile((prev) => !prev);
    else setOpen(!open());
  };

  const value: SidebarValue = {
    state: () => (open() ? "expanded" : "collapsed"),
    open,
    setOpen,
    openMobile,
    setOpenMobile: (next: boolean) => writeOpenMobile(next),
    isMobile: narrow,
    toggle,
    toggleSidebar: toggle,
  };

  // On the window, so the shortcut works wherever focus is: with nothing
  // focused the key goes to the body, which the wrapper never hears.
  if (typeof window !== "undefined") {
    on(window, "keydown", (event) => {
      if (event.key === SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggle();
      }
    });
  }

  const owner = getOwner();

  return (
    <div
      {...uiProps("sidebar-wrapper", ui(wrapper, "group/sidebar-wrapper"), props)}
      // The caller's last: a width set on this element is the documented way to
      // resize every part, and the defaults must not write over it.
      style={() => ({
        "--sidebar-width": WIDTH,
        "--sidebar-width-icon": WIDTH_ICON,
        ...props.style?.(),
      })}
    >
      {owner === null ? (
        props.children
      ) : (
        <SidebarProviderInner value={value}>{props.children}</SidebarProviderInner>
      )}
    </div>
  );
}

/**
 * The context, and nothing else.
 *
 * `provide`'s callback must build no JSX: one that does closes over the scope
 * at the CALL site, so the children go up beside the context rather than under
 * it and every `useSidebar` throws.
 */
function SidebarProviderInner(props: Incoming<{ value: SidebarValue; children?: Child }>) {
  return provide(
    SidebarContext,
    () => props.value(),
    () => props.children,
  );
}

export interface SidebarProps extends UiProps {
  /** @default "left" */
  side?: SidebarSide;
  /** @default "sidebar" */
  variant?: SidebarVariant;
  /** @default "offcanvas" */
  collapsible?: SidebarCollapsible;
}

/**
 * The column itself, which is three elements rather than one.
 *
 * A `gap` that reserves the width in the flow, a `container` that is FIXED and
 * slides, and the `inner` that draws. Animating a fixed element while a
 * placeholder holds the space is what makes the collapse move the page content
 * without relayout jitter, and it is shadcn's arrangement exactly.
 */
export function Sidebar(props: Incoming<SidebarProps>) {
  const sidebar = useSidebar();
  const side = (): SidebarSide => props.side?.() ?? "left";
  const variant = (): SidebarVariant => props.variant?.() ?? "sidebar";
  const collapsible = (): SidebarCollapsible => props.collapsible?.() ?? "offcanvas";
  const floats = (): boolean => variant() === "floating" || variant() === "inset";

  return (
    <>
      {collapsible() === "none" ? (
        <div {...uiProps("sidebar", none, props)}>{props.children}</div>
      ) : sidebar.isMobile() ? (
        <Sheet isOpen={sidebar.openMobile()} onOpenChange={sidebar.setOpenMobile}>
          <SheetContent
            data-slot="sidebar"
            data-mobile="true"
            side={() => side()}
            class={mobile}
            style={{ "--sidebar-width": WIDTH_MOBILE }}
          >
            <SheetHeader class={srOnly}>
              <SheetTitle>Sidebar</SheetTitle>
              <SheetDescription>Displays the mobile sidebar.</SheetDescription>
            </SheetHeader>
            <div class={none} data-sidebar="sidebar" data-mobile="true">
              {props.children}
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        // Every one of these is a THUNK, and none of them is decoration.
        // `sidebar.state` is a method on a value `useSidebar()` returned, which
        // the compiler cannot see inside, so it proves nothing about it and
        // binds the call ONCE. Spent that way the shell keeps whatever state it
        // had at mount, and every `group-data-[state=…]` rule in the stylesheet
        // is decided forever by the first paint.
        <div
          class={ui(shell, "group", "peer")}
          data-slot="sidebar"
          data-state={() => sidebar.state()}
          data-collapsible={() => (sidebar.state() === "collapsed" ? collapsible() : "")}
          data-variant={() => variant()}
          data-side={() => side()}
        >
          <div class={() => (floats() ? ui(gap, gapFloating) : gap)} data-slot="sidebar-gap" />
          <div
            {...uiProps(
              "sidebar-container",
              () =>
                ui(
                  container,
                  side() === "left" ? containerLeft : containerRight,
                  floats() ? containerFloating : containerPlain,
                ),
              props,
            )}
          >
            <div class={inner} data-slot="sidebar-inner" data-sidebar="sidebar">
              {props.children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface Slotted {
  readonly props: DOMProps;
  readonly ref: ((element: Element | null) => void) | undefined;
}

/**
 * What the trigger a part is written inside wants on that part's element.
 *
 * shadcn makes a row the trigger of a menu with `asChild`. Nothing is cloned
 * here: the trigger OFFERS its props and the control takes them, which is how
 * `<Button>` composes, so a row inside `<DropdownMenuTrigger>` opens the menu.
 *
 * Only a trigger that is PRESSED makes its control a button. A tooltip offers
 * a description and hover and focus handlers, and a link wearing one is still a
 * link: run through `button()` it would announce as a button and stop
 * navigating. Outside any trigger this is nothing at all, so a plain row keeps
 * exactly the element it had.
 *
 * Merged BEFORE the part's own props: `button()` answers every ARIA name it
 * knows, with `undefined` for the ones the trigger did not set, and merged
 * last that erased an `aria-label` the caller wrote on an icon-only action.
 */
function slotted(elementType: MaybeAccessor<string>): Slotted {
  const slot = triggerSlot();
  const names = Object.keys(slot.props);
  if (names.length === 0) return { props: {}, ref: slot.ref };

  const dom = filterDOMProps(slot.props, { global: true, labelable: true });
  if (!names.some((name) => name.startsWith("onPress"))) return { props: dom, ref: slot.ref };

  const domRef = makeRef<Element>();
  const options: ButtonOptions = { ...slot.props, elementType };
  const { buttonProps } = button(options, domRef);
  return { props: mergeProps(buttonProps, dom), ref: mergeRefs(domRef.set, slot.ref) };
}

export function SidebarTrigger(props: Incoming<ButtonProps>) {
  const sidebar = useSidebar();
  return (
    <Button
      {...props}
      data-slot={props["data-slot"]?.() ?? "sidebar-trigger"}
      data-sidebar="trigger"
      variant={props.variant?.() ?? "ghost"}
      size={props.size?.() ?? "icon"}
      class={ui(trigger, props.class?.(), props.className?.())}
      aria-label={props["aria-label"]?.() ?? "Toggle Sidebar"}
      onPress={(event) => {
        props.onPress?.()?.(event);
        sidebar.toggle();
      }}
    >
      <PanelLeft />
    </Button>
  );
}

/** The hairline down the edge, which drags the sidebar open and shut. */
export function SidebarRail(props: Incoming<UiProps>) {
  const sidebar = useSidebar();
  return (
    <button
      {...uiProps("sidebar-rail", rail, props)}
      type="button"
      data-sidebar="rail"
      aria-label="Toggle Sidebar"
      title="Toggle Sidebar"
      tabIndex={-1}
      onClick={() => sidebar.toggle()}
    />
  );
}

export function SidebarInset(props: Incoming<UiProps>) {
  return <main {...uiProps("sidebar-inset", inset, props)}>{props.children}</main>;
}

export function SidebarInput(props: Incoming<InputProps>) {
  return (
    <Input
      {...props}
      data-slot="sidebar-input"
      data-sidebar="input"
      class={ui(input, props.class?.(), props.className?.())}
    />
  );
}

export function SidebarHeader(props: Incoming<UiProps>) {
  return (
    <div {...uiProps("sidebar-header", header, props)} data-sidebar="header">
      {props.children}
    </div>
  );
}

export function SidebarFooter(props: Incoming<UiProps>) {
  return (
    <div {...uiProps("sidebar-footer", footer, props)} data-sidebar="footer">
      {props.children}
    </div>
  );
}

export function SidebarSeparator(props: Incoming<Omit<UiProps, "children">>) {
  return (
    <Separator
      {...props}
      data-slot="sidebar-separator"
      data-sidebar="separator"
      class={ui(separator, props.class?.())}
    />
  );
}

export function SidebarContent(props: Incoming<UiProps>) {
  return (
    <div {...uiProps("sidebar-content", content, props)} data-sidebar="content">
      {props.children}
    </div>
  );
}

export function SidebarGroup(props: Incoming<UiProps>) {
  return (
    <div {...uiProps("sidebar-group", group, props)} data-sidebar="group">
      {props.children}
    </div>
  );
}

/**
 * The label's classes, for an element that is the label and something else.
 *
 * ```tsx
 * <CollapsibleTrigger data-slot="sidebar-group-label" class={sidebarGroupLabelVariants()}>
 *   Help
 * </CollapsibleTrigger>
 * ```
 *
 * A collapsible's trigger renders its own button, so the label is that button
 * wearing these rather than a `<div>` around it.
 */
export const sidebarGroupLabelVariants = variants({ base: groupLabel, variants: {} });

export function SidebarGroupLabel(props: Incoming<UiProps>) {
  const taken = slotted("div");
  return (
    <div
      {...mergeProps(taken.props, uiProps("sidebar-group-label", groupLabel, props))}
      ref={mergeRefs(taken.ref, props.ref?.())}
      data-sidebar="group-label"
    >
      {props.children}
    </div>
  );
}

export function SidebarGroupAction(props: Incoming<UiProps>) {
  const taken = slotted("button");
  return (
    <button
      {...mergeProps(taken.props, uiProps("sidebar-group-action", groupAction, props))}
      ref={mergeRefs(taken.ref, props.ref?.())}
      type="button"
      data-sidebar="group-action"
    >
      {props.children}
    </button>
  );
}

export function SidebarGroupContent(props: Incoming<UiProps>) {
  return (
    <div {...uiProps("sidebar-group-content", groupContent, props)} data-sidebar="group-content">
      {props.children}
    </div>
  );
}

export function SidebarMenu(props: Incoming<UiProps>) {
  return (
    <ul {...uiProps("sidebar-menu", menu, props)} data-sidebar="menu">
      {props.children}
    </ul>
  );
}

export function SidebarMenuItem(props: Incoming<UiProps>) {
  return (
    <li
      {...uiProps("sidebar-menu-item", ui(menuItem, "group/menu-item"), props)}
      data-sidebar="menu-item"
    >
      {props.children}
    </li>
  );
}

export type SidebarMenuButtonVariant = "default" | "outline";
export type SidebarMenuButtonSize = "default" | "sm" | "lg";

export const sidebarMenuButtonVariants = variants({
  base: ui(menuButton, "peer/menu-button"),
  variants: {
    variant: { default: menuButtonDefault, outline: menuButtonOutline },
    size: {
      default: menuButtonSizeDefault,
      sm: menuButtonSizeSm,
      lg: menuButtonSizeLg,
    },
  },
  defaults: { variant: "default", size: "default" },
});

export interface SidebarMenuButtonProps extends UiProps {
  /** @default "default" */
  variant?: SidebarMenuButtonVariant;
  /** @default "default" */
  size?: SidebarMenuButtonSize;
  isActive?: boolean;
  /** Renders an anchor instead of a button, which is what a nav item usually is. */
  href?: string;
  /**
   * Names the row while the sidebar is collapsed to icons. A string is the
   * text; an object is `<TooltipContent>`'s own props, `children` included.
   */
  tooltip?: string | TooltipContentProps;
}

/**
 * A row of the menu.
 *
 * ```tsx
 * <SidebarMenuButton tooltip="Inbox" isActive>
 *   <Inbox />
 *   <span>Inbox</span>
 * </SidebarMenuButton>
 * ```
 *
 * The tooltip exists for the icon rail, where the label is clipped away and the
 * icon is all that is left. Expanded, or as a sheet on a narrow viewport, the
 * label is on screen and a tooltip repeating it would only be in the way, so it
 * is disabled rather than rendered and hidden: a disabled trigger writes no
 * `aria-describedby` either.
 */
export function SidebarMenuButton(props: Incoming<SidebarMenuButtonProps>) {
  const sidebar = useSidebar();
  const tip = (): TooltipContentProps | undefined => {
    const tooltip = props.tooltip?.();
    if (tooltip === undefined || tooltip === "") return undefined;
    return typeof tooltip === "string" ? { children: tooltip } : tooltip;
  };

  return (
    <>
      {tip() === undefined ? (
        <SidebarMenuControl {...props} />
      ) : (
        <Tooltip delay={0} isDisabled={() => sidebar.state() !== "collapsed" || sidebar.isMobile()}>
          <SidebarMenuControl {...props} />
          <TooltipContent
            side={() => tip()?.side ?? "right"}
            align={() => tip()?.align ?? "center"}
            sideOffset={() => tip()?.sideOffset}
            alignOffset={() => tip()?.alignOffset}
            placement={() => tip()?.placement}
            offset={() => tip()?.offset}
            crossOffset={() => tip()?.crossOffset}
            shouldFlip={() => tip()?.shouldFlip}
            containerPadding={() => tip()?.containerPadding}
            arrow={() => tip()?.arrow}
            class={() => tip()?.class}
            className={() => tip()?.className}
            id={() => tip()?.id}
          >
            {tip()?.children}
          </TooltipContent>
        </Tooltip>
      )}
    </>
  );
}

/**
 * The control itself, which takes whatever trigger wraps it.
 *
 * A tooltip writes `aria-describedby` and its focus handlers on the focusable
 * element, so the row reads the slot its surroundings offer rather than being
 * wrapped in an element focus never reaches.
 */
function SidebarMenuControl(props: Incoming<SidebarMenuButtonProps>) {
  const taken = slotted(() => (props.href?.() === undefined ? "button" : "a"));
  const className = (): string =>
    ui(
      sidebarMenuButtonVariants({
        variant: props.variant?.() ?? "default",
        size: props.size?.() ?? "default",
      }),
      props.class?.(),
      props.className?.(),
    );

  return (
    <>
      {props.href?.() === undefined ? (
        <button
          {...mergeProps(taken.props, uiProps("sidebar-menu-button", className, props))}
          ref={mergeRefs(taken.ref, props.ref?.())}
          type="button"
          data-sidebar="menu-button"
          data-size={() => props.size?.() ?? "default"}
          data-active={() => (props.isActive?.() === true ? "true" : "false")}
        >
          {props.children}
        </button>
      ) : (
        <a
          {...mergeProps(taken.props, uiProps("sidebar-menu-button", className, props))}
          ref={mergeRefs(taken.ref, props.ref?.())}
          href={props.href()}
          data-sidebar="menu-button"
          data-size={() => props.size?.() ?? "default"}
          data-active={() => (props.isActive?.() === true ? "true" : "false")}
        >
          {props.children}
        </a>
      )}
    </>
  );
}

export interface SidebarMenuActionProps extends UiProps {
  /** Hidden until the row is hovered or focused, which is shadcn's default for these. */
  showOnHover?: boolean;
}

export const sidebarMenuActionVariants = variants({
  base: menuAction,
  variants: { showOnHover: { true: menuActionHover, false: "" } },
  defaults: { showOnHover: "false" },
});

export function SidebarMenuAction(props: Incoming<SidebarMenuActionProps>) {
  const taken = slotted("button");
  return (
    <button
      {...mergeProps(
        taken.props,
        uiProps(
          "sidebar-menu-action",
          () => sidebarMenuActionVariants({ showOnHover: props.showOnHover?.() === true }),
          props,
        ),
      )}
      ref={mergeRefs(taken.ref, props.ref?.())}
      type="button"
      data-sidebar="menu-action"
    >
      {props.children}
    </button>
  );
}

export function SidebarMenuBadge(props: Incoming<UiProps>) {
  return (
    <div {...uiProps("sidebar-menu-badge", menuBadge, props)} data-sidebar="menu-badge">
      {props.children}
    </div>
  );
}

export interface SidebarMenuSkeletonProps extends UiProps {
  showIcon?: boolean;
}

/**
 * A row-shaped placeholder, with a width that differs per row.
 *
 * shadcn randomises it so a column of them does not read as a barcode. The
 * width is computed ONCE per instance rather than per render, or every paint
 * would resize it.
 */
export function SidebarMenuSkeleton(props: Incoming<SidebarMenuSkeletonProps>) {
  const width = `${String(Math.floor(Math.random() * 40) + 50)}%`;
  return (
    <div {...uiProps("sidebar-menu-skeleton", menuSkeleton, props)} data-sidebar="menu-skeleton">
      {props.showIcon?.() === true ? (
        <Skeleton
          data-slot="sidebar-menu-skeleton-icon"
          data-sidebar="menu-skeleton-icon"
          style={{ width: "1rem", height: "1rem", "border-radius": "var(--radius)" }}
        />
      ) : null}
      <Skeleton
        data-slot="sidebar-menu-skeleton-text"
        data-sidebar="menu-skeleton-text"
        style={{ height: "1rem", flex: "1", "max-width": width }}
      />
    </div>
  );
}

export function SidebarMenuSub(props: Incoming<UiProps>) {
  return (
    <ul {...uiProps("sidebar-menu-sub", menuSub, props)} data-sidebar="menu-sub">
      {props.children}
    </ul>
  );
}

export function SidebarMenuSubItem(props: Incoming<UiProps>) {
  return (
    <li
      {...uiProps("sidebar-menu-sub-item", ui(menuSubItem, "group/menu-sub-item"), props)}
      data-sidebar="menu-sub-item"
    >
      {props.children}
    </li>
  );
}

export interface SidebarMenuSubButtonProps extends UiProps {
  /** @default "md" */
  size?: "sm" | "md";
  isActive?: boolean;
  href?: string;
}

export function SidebarMenuSubButton(props: Incoming<SidebarMenuSubButtonProps>) {
  const taken = slotted("a");
  const className = (): string =>
    ui(
      menuSubButton,
      (props.size?.() ?? "md") === "sm" ? menuSubButtonSm : menuSubButtonMd,
      props.class?.(),
      props.className?.(),
    );

  return (
    <a
      {...mergeProps(taken.props, uiProps("sidebar-menu-sub-button", className, props))}
      ref={mergeRefs(taken.ref, props.ref?.())}
      href={props.href?.()}
      data-sidebar="menu-sub-button"
      data-size={() => props.size?.() ?? "md"}
      data-active={() => (props.isActive?.() === true ? "true" : "false")}
    >
      {props.children}
    </a>
  );
}
