import {
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  Tabs as AriaTabs,
  type TabComponentProps,
  type TabListComponentProps,
  type TabPanelComponentProps,
  type TabsComponentProps,
  useValueTabs,
  ValueTab as AriaValueTab,
  ValueTabList as AriaValueTabList,
  ValueTabPanel as AriaValueTabPanel,
  ValueTabs as AriaValueTabs,
  type ValueTabsComponentProps,
} from "@barqjs/aria/tabs";
import type { Child, Incoming } from "@barqjs/core";
import { layer, variants } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { icon } from "../lib/shared-icon.ts";
import { when } from "../lib/shared-when.ts";
import { text } from "../lib/shared-text.ts";

const ui = layer("barq.ui");

// Markers: the trigger reads both the tabs' orientation and the list's variant
// back through `.group\/tabs` and `.group\/tabs-list`.
const root = ui("group/tabs", {
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
    borderRadius: "calc(var(--radius) * 0.8)",
    borderColor: "transparent",
    paddingInline: "calc(var(--spacing) * 1.5)",
    paddingBlock: "calc(var(--spacing) * 0.5)",
    whiteSpace: "nowrap",
    color: "var(--foreground)",
    transitionProperty: "all",
    "@supports (color: color-mix(in lab, red, red))": {
      color: "color-mix(in oklab, var(--foreground) 60%, transparent)",
    },
    ':has([data-icon="inline-end"])': {
      paddingInlineEnd: "var(--spacing)",
    },
    ':has([data-icon="inline-start"])': {
      paddingInlineStart: "var(--spacing)",
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
      insetInlineEnd: "calc(var(--spacing) * -1)",
      width: "calc(var(--spacing) * 0.5)",
    },
  },
);

const content = ui(box.outline, text.sm, {
  flex: "1",
});

export type TabsListVariant = "default" | "line";

export const tabsListVariants = variants({
  base: ui("group/tabs-list", {
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
      height: "calc(var(--spacing) * 8)",
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

type ValueTabsOptions = Pick<
  ValueTabsComponentProps,
  "value" | "defaultValue" | "onValueChange" | "activationMode"
>;

export interface TabsProps<T> extends Omit<TabsComponentProps<T>, "items">, ValueTabsOptions {
  /** The tabs as data. Leave it out and write the triggers and panels with a `value` each. */
  items?: Iterable<T>;
}

/**
 * Two ways to say what the tabs are, and one look.
 *
 * As data, which is `@barqjs/aria`'s model and the one to use when the tabs
 * come from somewhere:
 *
 * ```tsx
 * <Tabs items={sections} defaultSelectedKey="overview">
 *   <TabsList aria-label="Sections">{(s) => <TabsTrigger>{s.name}</TabsTrigger>}</TabsList>
 *   <TabsContent>{(s) => <p>{s.body}</p>}</TabsContent>
 * </Tabs>
 * ```
 *
 * One `<TabsContent>`, not one per tab: only the selected panel is ever on the
 * page.
 *
 * Or written out, which is shadcn's and reads better for a fixed handful:
 *
 * ```tsx
 * <Tabs defaultValue="account">
 *   <TabsList aria-label="Settings">
 *     <TabsTrigger value="account">Account</TabsTrigger>
 *     <TabsTrigger value="password">Password</TabsTrigger>
 *   </TabsList>
 *   <TabsContent value="account">…</TabsContent>
 *   <TabsContent value="password">…</TabsContent>
 * </Tabs>
 * ```
 *
 * `items` decides which, once, and every part below follows the root it finds
 * itself in.
 */
export function Tabs<T>(props: Incoming<TabsProps<T>>) {
  const items = props.items;
  const { items: _, ...written } = props;

  return items === undefined ? (
    <AriaValueTabs
      {...written}
      data-slot={props["data-slot"]?.() ?? "tabs"}
      class={ui(root, props.class?.(), props.className?.())}
    />
  ) : (
    <AriaTabs
      {...props}
      items={items() ?? []}
      data-slot={props["data-slot"]?.() ?? "tabs"}
      class={ui(root, props.class?.(), props.className?.())}
    />
  );
}

export interface TabsListProps<T> extends Omit<TabListComponentProps<T>, "children"> {
  variant?: TabsListVariant;
  /** How one tab renders, under `items`. Otherwise the triggers themselves. */
  children?: ((item: T) => Child) | Child;
  /** Whether the arrows wrap round the ends, for tabs written out. @default true */
  loop?: boolean;
}

export function TabsList<T>(props: Incoming<TabsListProps<T>>) {
  const className = (): string =>
    ui(tabsListVariants({ variant: props.variant?.() }), props.class?.(), props.className?.());

  if (useValueTabs() !== null) {
    return (
      <AriaValueTabList
        {...props}
        data-slot={props["data-slot"]?.() ?? "tabs-list"}
        data-variant={props.variant?.() ?? "default"}
        class={className()}
      />
    );
  }

  const children = props.children;
  if (children === undefined) {
    throw new Error("A <TabsList> under `items` takes a function of the item.");
  }
  const collection = { ...props, children };

  return (
    <AriaTabList
      {...collection}
      data-slot={props["data-slot"]?.() ?? "tabs-list"}
      data-variant={props.variant?.() ?? "default"}
      class={className()}
    />
  );
}

export interface TabsTriggerProps extends TabComponentProps {
  /** Which panel this opens, for tabs written out. Under `items` the tab is the item. */
  value?: string;
  isDisabled?: boolean;
  /** The element's own word for `isDisabled`, which is the one upstream's callers write. */
  disabled?: boolean;
}

export function TabsTrigger(props: Incoming<TabsTriggerProps>) {
  const value = props.value;

  return value === undefined ? (
    <AriaTab
      {...props}
      data-slot={props["data-slot"]?.() ?? "tabs-trigger"}
      class={ui(trigger, props.class?.(), props.className?.())}
    />
  ) : (
    <AriaValueTab
      {...props}
      value={value() ?? ""}
      isDisabled={props.isDisabled?.() ?? props.disabled?.()}
      data-slot={props["data-slot"]?.() ?? "tabs-trigger"}
      class={ui(trigger, props.class?.(), props.className?.())}
    />
  );
}

export interface TabsContentProps<T> extends Omit<TabPanelComponentProps<T>, "children"> {
  /** Which trigger opens this, for tabs written out. */
  value?: string;
  /** Keep the panel in the document, hidden, while another shows. Written-out tabs only. */
  forceMount?: boolean;
  children?: ((item: T) => Child) | Child;
}

export function TabsContent<T>(props: Incoming<TabsContentProps<T>>) {
  const value = props.value;
  if (value !== undefined) {
    return (
      <AriaValueTabPanel
        {...props}
        value={value() ?? ""}
        data-slot={props["data-slot"]?.() ?? "tabs-content"}
        class={ui(content, props.class?.(), props.className?.())}
      />
    );
  }

  const children = props.children;
  if (children === undefined) {
    throw new Error("A <TabsContent> under `items` takes a function of the item.");
  }
  const collection = { ...props, children };

  return (
    <AriaTabPanel
      {...collection}
      data-slot={props["data-slot"]?.() ?? "tabs-content"}
      class={ui(content, props.class?.(), props.className?.())}
    />
  );
}
