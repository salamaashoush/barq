import {
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  Tabs as AriaTabs,
  type TabComponentProps,
  type TabListComponentProps,
  type TabPanelComponentProps,
  type TabsComponentProps,
} from "@barqjs/aria/tabs";
import type { Incoming } from "@barqjs/core";
import { atomsIn } from "@barqjs/css";

import "../theme/layers.ts";
import { ui, uiVariants } from "../lib/atoms.ts";

const root = atomsIn("barq.ui", {
  display: "flex",
  gap: "calc(var(--spacing) * 2)",
  '[data-orientation="horizontal"]': {
    flexDirection: "column",
  },
});

const trigger = atomsIn("barq.ui", {
  position: "relative",
  display: "inline-flex",
  height: "calc(100% - 1px)",
  flex: "1",
  alignItems: "center",
  justifyContent: "center",
  gap: "calc(var(--spacing) * 1.5)",
  borderRadius: "calc(var(--radius) - 2px)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  borderColor: "transparent",
  paddingInline: "calc(var(--spacing) * 2)",
  paddingBlock: "var(--spacing)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
  whiteSpace: "nowrap",
  color: "var(--foreground)",
  transitionProperty: "all",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  "@supports (color: color-mix(in lab, red, red))": {
    color: "color-mix(in oklab, var(--foreground) 60%, transparent)",
  },
  "::after": {
    content: "var(--ui-content)",
    position: "absolute",
    backgroundColor: "var(--foreground)",
    opacity: "0%",
    transitionProperty: "opacity",
    transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
    transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  },
  "@media (hover: hover)": {
    ":hover": {
      color: "var(--foreground)",
    },
    ":is(.dark *):hover": {
      color: "var(--foreground)",
    },
  },
  ":is(.dark *)": {
    color: "var(--muted-foreground)",
  },
  "[data-selected]": {
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
  },
  ":is(.dark *)[data-selected]": {
    borderColor: "var(--input)",
    backgroundColor: "var(--input)",
    color: "var(--foreground)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--input) 30%, transparent)",
    },
  },
  "[data-focus-visible]": {
    borderColor: "var(--ring)",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "var(--ring)",
    outlineStyle: "var(--ui-outline-style)",
    outlineWidth: "1px",
    outlineColor: "var(--ring)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
    },
  },
  "[data-disabled]": {
    pointerEvents: "none",
    opacity: "50%",
  },
  "& svg": {
    pointerEvents: "none",
    flexShrink: "0",
  },
  '& svg:not([class*="size-"])': {
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
  },
  '[data-slot="tabs-list"][data-variant="default"] &[data-selected]': {
    "--ui-shadow":
      "0 1px 3px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 1px 2px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  },
  '[data-slot="tabs-list"][data-variant="line"] &': {
    backgroundColor: "transparent",
  },
  '[data-slot="tabs-list"][data-variant="line"] &[data-selected]': {
    backgroundColor: "transparent",
    "--ui-shadow": "0 0 #0000",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  },
  '[data-slot="tabs-list"][data-variant="line"] &[data-selected]::after': {
    content: "var(--ui-content)",
    opacity: "100%",
  },
  '[data-slot="tabs-list"][data-variant="line"] &:is(.dark *)[data-selected]': {
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  '[data-slot="tabs"][data-orientation="horizontal"] &::after': {
    content: "var(--ui-content)",
    insetInline: "0px",
    bottom: "-5px",
    height: "calc(var(--spacing) * 0.5)",
  },
  '[data-slot="tabs"][data-orientation="vertical"] &': {
    width: "100%",
    justifyContent: "flex-start",
  },
  '[data-slot="tabs"][data-orientation="vertical"] &::after': {
    content: "var(--ui-content)",
    insetBlock: "0px",
    right: "calc(var(--spacing) * -1)",
    width: "calc(var(--spacing) * 0.5)",
  },
});

const content = atomsIn("barq.ui", {
  flex: "1",
  "--ui-outline-style": "none",
  outlineStyle: "none",
});

export type TabsListVariant = "default" | "line";

export const tabsListVariants = uiVariants({
  base: atomsIn("barq.ui", {
    display: "inline-flex",
    width: "fit-content",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "var(--radius)",
    padding: "3px",
    color: "var(--muted-foreground)",
    '[data-variant="line"]': {
      borderRadius: "0",
    },
    '[data-slot="tabs"][data-orientation="horizontal"] &': {
      height: "calc(var(--spacing) * 9)",
    },
    '[data-slot="tabs"][data-orientation="vertical"] &': {
      height: "fit-content",
      flexDirection: "column",
    },
  }),
  variants: {
    variant: {
      default: atomsIn("barq.ui", {
        backgroundColor: "var(--muted)",
      }),
      line: atomsIn("barq.ui", {
        gap: "var(--spacing)",
        backgroundColor: "transparent",
      }),
    },
  },
  defaults: { variant: "default" },
});

export interface TabsProps<T> extends TabsComponentProps<T> {}

/**
 * ```tsx
 * <Tabs items={sections} defaultSelectedKey="overview">
 *   <TabsList aria-label="Sections">{(s) => <TabsTrigger>{s.name}</TabsTrigger>}</TabsList>
 *   <TabsContent>{(s) => <p>{s.body}</p>}</TabsContent>
 * </Tabs>
 * ```
 *
 * The collection is `items` plus a render function, which is `@barqjs/aria`'s
 * model rather than shadcn's `<TabsTrigger value="…">`. A framework whose
 * children are lazy Blocks cannot render them once to find out what they
 * declare, so there is nothing to be gained by pretending otherwise.
 *
 * One `<TabsContent>`, not one per tab: only the selected panel is ever on the
 * page.
 */
export function Tabs<T>(props: Incoming<TabsProps<T>>) {
  return (
    <AriaTabs
      {...props}
      data-slot={props["data-slot"]?.() ?? "tabs"}
      class={ui(root, props.class?.(), props.className?.())}
    />
  );
}

export interface TabsListProps<T> extends TabListComponentProps<T> {
  variant?: TabsListVariant;
}

export function TabsList<T>(props: Incoming<TabsListProps<T>>) {
  return (
    <AriaTabList
      {...props}
      data-slot={props["data-slot"]?.() ?? "tabs-list"}
      data-variant={props.variant?.() ?? "default"}
      class={ui(
        tabsListVariants({ variant: props.variant?.() }),
        props.class?.(),
        props.className?.(),
      )}
    />
  );
}

export interface TabsTriggerProps extends TabComponentProps {}

export function TabsTrigger(props: Incoming<TabsTriggerProps>) {
  return (
    <AriaTab
      {...props}
      data-slot={props["data-slot"]?.() ?? "tabs-trigger"}
      class={ui(trigger, props.class?.(), props.className?.())}
    />
  );
}

export interface TabsContentProps<T> extends TabPanelComponentProps<T> {}

export function TabsContent<T>(props: Incoming<TabsContentProps<T>>) {
  return (
    <AriaTabPanel
      {...props}
      data-slot={props["data-slot"]?.() ?? "tabs-content"}
      class={ui(content, props.class?.(), props.className?.())}
    />
  );
}
