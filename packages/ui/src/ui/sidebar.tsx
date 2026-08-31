import {
  context,
  getContext,
  getOwner,
  provide,
  signal,
  type Child,
  type Incoming,
} from "@barqjs/core";
import { firstThatWorks, layer, variants } from "@barqjs/css";
import { PanelLeft } from "@barqjs/lucide/icons/panel-left";

import "../theme/layers.ts";
import { uiProps } from "../lib/slot.ts";
import { Button } from "./button.tsx";
import { Input } from "./input.tsx";
import { Separator } from "./separator.tsx";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./sheet.tsx";
import { Skeleton } from "./skeleton.tsx";
import { srOnly } from "./sr-only.ts";

import type { UiProps } from "../lib/props.ts";

const ui = layer("barq.ui");

/** shadcn's own five, and the keyboard shortcut it binds. */
const WIDTH = "16rem";
const WIDTH_MOBILE = "18rem";
const WIDTH_ICON = "3rem";
const SHORTCUT = "b";
const COOKIE = "sidebar_state";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/** Below this the sidebar is a `<Sheet>` rather than a column. */
const MOBILE = 768;

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
  height: "100svh",
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
      borderRadius: "calc(var(--radius) + 4px)",
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
  borderRadius: "calc(var(--radius) - 2px)",
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
  right: "calc(var(--spacing) * 3)",
  display: "flex",
  aspectRatio: "1 / 1",
  width: "calc(var(--spacing) * 5)",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "calc(var(--radius) - 2px)",
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
  borderRadius: "calc(var(--radius) - 2px)",
  padding: "calc(var(--spacing) * 2)",
  textAlign: "left",
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
    paddingRight: "calc(var(--spacing) * 8)",
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
  right: "var(--spacing)",
  display: "flex",
  aspectRatio: "1 / 1",
  width: "calc(var(--spacing) * 5)",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "calc(var(--radius) - 2px)",
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
  right: "var(--spacing)",
  display: "flex",
  height: "calc(var(--spacing) * 5)",
  minWidth: "calc(var(--spacing) * 5)",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "calc(var(--radius) - 2px)",
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
  borderRadius: "calc(var(--radius) - 2px)",
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
  borderLeftStyle: "var(--ui-border-style)",
  borderLeftWidth: "1px",
  borderColor: "var(--sidebar-border)",
  paddingInline: "calc(var(--spacing) * 2.5)",
  paddingBlock: "calc(var(--spacing) * 0.5)",
  ':is(:where(.group)[data-collapsible="icon"] *)': {
    display: "none",
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
  borderRadius: "calc(var(--radius) - 2px)",
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
}

const SidebarContext = context<SidebarValue | null>(null);

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
  const uncontrolled = signal(props.defaultOpen?.() ?? true);
  const openMobile = signal(false);
  // `matchMedia` rather than a resize listener: the browser already knows, and
  // a listener recomputes on every pixel of a drag.
  const narrow = signal(typeof window === "undefined" ? false : window.innerWidth < MOBILE);

  const open = (): boolean => props.open?.() ?? uncontrolled();
  const setOpen = (next: boolean): void => {
    if (props.open?.() === undefined) uncontrolled.set(next);
    props.onOpenChange?.()?.(next);
    // shadcn persists it, so a reload keeps the layout the person left.
    if (typeof document !== "undefined") {
      document.cookie = `${COOKIE}=${String(next)}; path=/; max-age=${String(COOKIE_MAX_AGE)}`;
    }
  };

  const toggle = (): void => {
    if (narrow()) openMobile.set(!openMobile());
    else setOpen(!open());
  };

  const value: SidebarValue = {
    state: () => (open() ? "expanded" : "collapsed"),
    open,
    setOpen,
    openMobile,
    setOpenMobile: (next: boolean) => openMobile.set(next),
    isMobile: narrow,
    toggle,
  };

  const owner = getOwner();

  return (
    <div
      {...uiProps("sidebar-wrapper", ui(wrapper, "group/sidebar-wrapper"), props)}
      style={{ "--sidebar-width": WIDTH, "--sidebar-width-icon": WIDTH_ICON }}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === SHORTCUT && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          toggle();
        }
      }}
      ref={(element: HTMLElement | null) => {
        if (element === null || typeof window === "undefined") return;
        const query = window.matchMedia(`(max-width: ${String(MOBILE - 1)}px)`);
        narrow.set(query.matches);
        query.addEventListener("change", (event) => narrow.set(event.matches));
      }}
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
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;
  return provide(
    owner,
    SidebarContext,
    () => props.value(),
    () => props.children,
  ) as never;
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
            <div class={none}>{props.children}</div>
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

export function SidebarTrigger(props: Incoming<UiProps>) {
  const sidebar = useSidebar();
  return (
    <Button
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      class={ui(trigger, props.class?.())}
      aria-label="Toggle Sidebar"
      onPress={() => sidebar.toggle()}
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

export function SidebarInput(props: Incoming<UiProps>) {
  return <Input {...props} data-slot="sidebar-input" class={ui(input, props.class?.())} />;
}

export function SidebarHeader(props: Incoming<UiProps>) {
  return <div {...uiProps("sidebar-header", header, props)}>{props.children}</div>;
}

export function SidebarFooter(props: Incoming<UiProps>) {
  return <div {...uiProps("sidebar-footer", footer, props)}>{props.children}</div>;
}

export function SidebarSeparator(props: Incoming<Omit<UiProps, "children">>) {
  return (
    <Separator {...props} data-slot="sidebar-separator" class={ui(separator, props.class?.())} />
  );
}

export function SidebarContent(props: Incoming<UiProps>) {
  return <div {...uiProps("sidebar-content", content, props)}>{props.children}</div>;
}

export function SidebarGroup(props: Incoming<UiProps>) {
  return <div {...uiProps("sidebar-group", group, props)}>{props.children}</div>;
}

export function SidebarGroupLabel(props: Incoming<UiProps>) {
  return <div {...uiProps("sidebar-group-label", groupLabel, props)}>{props.children}</div>;
}

export function SidebarGroupAction(props: Incoming<UiProps>) {
  return (
    <button {...uiProps("sidebar-group-action", groupAction, props)} type="button">
      {props.children}
    </button>
  );
}

export function SidebarGroupContent(props: Incoming<UiProps>) {
  return <div {...uiProps("sidebar-group-content", groupContent, props)}>{props.children}</div>;
}

export function SidebarMenu(props: Incoming<UiProps>) {
  return <ul {...uiProps("sidebar-menu", menu, props)}>{props.children}</ul>;
}

export function SidebarMenuItem(props: Incoming<UiProps>) {
  return (
    <li {...uiProps("sidebar-menu-item", ui(menuItem, "group/menu-item"), props)}>
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
}

export function SidebarMenuButton(props: Incoming<SidebarMenuButtonProps>) {
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
          {...uiProps("sidebar-menu-button", className, props)}
          type="button"
          data-sidebar="menu-button"
          data-size={() => props.size?.() ?? "default"}
          data-active={() => (props.isActive?.() === true ? "true" : "false")}
        >
          {props.children}
        </button>
      ) : (
        <a
          {...uiProps("sidebar-menu-button", className, props)}
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

export function SidebarMenuAction(props: Incoming<SidebarMenuActionProps>) {
  return (
    <button
      {...uiProps(
        "sidebar-menu-action",
        () => (props.showOnHover?.() === true ? ui(menuAction, menuActionHover) : menuAction),
        props,
      )}
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
          style={{ width: "1rem", height: "1rem", "border-radius": "var(--radius)" }}
        />
      ) : null}
      <Skeleton
        data-slot="sidebar-menu-skeleton-text"
        style={{ height: "1rem", flex: "1", "max-width": width }}
      />
    </div>
  );
}

export function SidebarMenuSub(props: Incoming<UiProps>) {
  return <ul {...uiProps("sidebar-menu-sub", menuSub, props)}>{props.children}</ul>;
}

export function SidebarMenuSubItem(props: Incoming<UiProps>) {
  return (
    <li {...uiProps("sidebar-menu-sub-item", ui(menuSubItem, "group/menu-sub-item"), props)}>
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
  const className = (): string =>
    ui(
      menuSubButton,
      (props.size?.() ?? "md") === "sm" ? menuSubButtonSm : menuSubButtonMd,
      props.class?.(),
      props.className?.(),
    );

  return (
    <a
      {...uiProps("sidebar-menu-sub-button", className, props)}
      href={props.href?.()}
      data-sidebar="menu-sub-button"
      data-size={() => props.size?.() ?? "md"}
      data-active={() => (props.isActive?.() === true ? "true" : "false")}
    >
      {props.children}
    </a>
  );
}
