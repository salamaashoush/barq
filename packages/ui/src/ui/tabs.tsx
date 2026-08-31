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
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { icon } from "../lib/shared-icon.ts";
import { when } from "../lib/shared-when.ts";
import { text } from "../lib/shared-text.ts";
import { uiVariants } from "../lib/atoms.ts";

const ui = layer("barq.ui");

const root = ui({
  display: "flex",
  gap: "calc(var(--spacing) * 2)",
  '[data-orientation="horizontal"]': {
    flexDirection: "column",
  },
});

const trigger = ui(
  box.border,
  text.sm,
  text.medium,
  box.transition,
  when.disabled,
  icon.plain,
  icon.sized,
  {
    position: "relative",
    display: "inline-flex",
    height: "calc(100% - 1px)",
    flex: "1",
    alignItems: "center",
    justifyContent: "center",
    gap: "calc(var(--spacing) * 1.5)",
    borderRadius: "calc(var(--radius) - 2px)",
    borderColor: "transparent",
    paddingInline: "calc(var(--spacing) * 2)",
    paddingBlock: "var(--spacing)",
    whiteSpace: "nowrap",
    color: "var(--foreground)",
    transitionProperty: "all",
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
  },
);

const content = ui(box.outline, {
  flex: "1",
});

export type TabsListVariant = "default" | "line";

export const tabsListVariants = uiVariants({
  base: ui({
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
      default: ui({
        backgroundColor: "var(--muted)",
      }),
      line: ui({
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
