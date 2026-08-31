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
import { clsx, css, variants } from "@barqjs/css";

import "../theme/layers.ts";

const root = css`
  @layer barq.ui {
    display: flex;
    gap: calc(var(--spacing) * 2);
    &[data-orientation="horizontal"] {
      flex-direction: column;
    }
  }
`;

const trigger = css`
  @layer barq.ui {
    position: relative;
    display: inline-flex;
    height: calc(100% - 1px);
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: calc(var(--spacing) * 1.5);
    border-radius: calc(var(--radius) - 2px);
    border-style: var(--ui-border-style);
    border-width: 1px;
    border-color: transparent;
    padding-inline: calc(var(--spacing) * 2);
    padding-block: var(--spacing);
    font-size: var(--text-sm);
    line-height: var(--ui-leading, var(--text-sm--line-height));
    --ui-font-weight: var(--font-weight-medium);
    font-weight: var(--font-weight-medium);
    white-space: nowrap;
    color: var(--foreground);
    @supports (color: color-mix(in lab, red, red)) {
      color: color-mix(in oklab, var(--foreground) 60%, transparent);
    }
    transition-property: all;
    transition-timing-function: var(--ui-ease, var(--default-transition-timing-function));
    transition-duration: var(--ui-duration, var(--default-transition-duration));
    &::after {
      content: var(--ui-content);
      position: absolute;
      background-color: var(--foreground);
      opacity: 0%;
      transition-property: opacity;
      transition-timing-function: var(--ui-ease, var(--default-transition-timing-function));
      transition-duration: var(--ui-duration, var(--default-transition-duration));
    }
    @media (hover: hover) {
      &:hover {
        color: var(--foreground);
      }
    }
    &:is(.dark *) {
      color: var(--muted-foreground);
    }
    @media (hover: hover) {
      &:is(.dark *):hover {
        color: var(--foreground);
      }
    }
    &[data-selected] {
      background-color: var(--background);
      color: var(--foreground);
    }
    &:is(.dark *)[data-selected] {
      border-color: var(--input);
      background-color: var(--input);
      @supports (color: color-mix(in lab, red, red)) {
        background-color: color-mix(in oklab, var(--input) 30%, transparent);
      }
      color: var(--foreground);
    }
    &[data-focus-visible] {
      border-color: var(--ring);
      --ui-ring-shadow: var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width))
        var(--ui-ring-color, currentcolor);
      box-shadow:
        var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
        var(--ui-ring-shadow), var(--ui-shadow);
      --ui-ring-color: var(--ring);
      @supports (color: color-mix(in lab, red, red)) {
        --ui-ring-color: color-mix(in oklab, var(--ring) 50%, transparent);
      }
      outline-style: var(--ui-outline-style);
      outline-width: 1px;
      outline-color: var(--ring);
    }
    &[data-disabled] {
      pointer-events: none;
      opacity: 50%;
    }
    & svg {
      pointer-events: none;
      flex-shrink: 0;
    }
    & svg:not([class*="size-"]) {
      width: calc(var(--spacing) * 4);
      height: calc(var(--spacing) * 4);
    }
    [data-slot="tabs-list"][data-variant="default"] &[data-selected] {
      --ui-shadow:
        0 1px 3px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.1)),
        0 1px 2px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1));
      box-shadow:
        var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
        var(--ui-ring-shadow), var(--ui-shadow);
    }
    [data-slot="tabs-list"][data-variant="line"] & {
      background-color: transparent;
    }
    [data-slot="tabs-list"][data-variant="line"] &[data-selected] {
      background-color: transparent;
      --ui-shadow: 0 0 #0000;
      box-shadow:
        var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
        var(--ui-ring-shadow), var(--ui-shadow);
    }
    [data-slot="tabs-list"][data-variant="line"] &[data-selected]::after {
      content: var(--ui-content);
      opacity: 100%;
    }
    [data-slot="tabs-list"][data-variant="line"] &:is(.dark *)[data-selected] {
      border-color: transparent;
      background-color: transparent;
    }
    [data-slot="tabs"][data-orientation="horizontal"] &::after {
      content: var(--ui-content);
      inset-inline: 0px;
      bottom: -5px;
      height: calc(var(--spacing) * 0.5);
    }
    [data-slot="tabs"][data-orientation="vertical"] & {
      width: 100%;
      justify-content: flex-start;
    }
    [data-slot="tabs"][data-orientation="vertical"] &::after {
      content: var(--ui-content);
      inset-block: 0px;
      right: calc(var(--spacing) * -1);
      width: calc(var(--spacing) * 0.5);
    }
  }
`;

const content = css`
  @layer barq.ui {
    flex: 1;
    --ui-outline-style: none;
    outline-style: none;
  }
`;

export type TabsListVariant = "default" | "line";

export const tabsListVariants = variants({
  base: css`
    @layer barq.ui {
      display: inline-flex;
      width: fit-content;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius);
      padding: 3px;
      color: var(--muted-foreground);
      &[data-variant="line"] {
        border-radius: 0;
      }
      [data-slot="tabs"][data-orientation="horizontal"] & {
        height: calc(var(--spacing) * 9);
      }
      [data-slot="tabs"][data-orientation="vertical"] & {
        height: fit-content;
        flex-direction: column;
      }
    }
  `,
  variants: {
    variant: {
      default: css`
        @layer barq.ui {
          background-color: var(--muted);
        }
      `,
      line: css`
        @layer barq.ui {
          gap: var(--spacing);
          background-color: transparent;
        }
      `,
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
      class={clsx(root, props.class?.(), props.className?.())}
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
      class={clsx(
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
      class={clsx(trigger, props.class?.(), props.className?.())}
    />
  );
}

export interface TabsContentProps<T> extends TabPanelComponentProps<T> {}

export function TabsContent<T>(props: Incoming<TabsContentProps<T>>) {
  return (
    <AriaTabPanel
      {...props}
      data-slot={props["data-slot"]?.() ?? "tabs-content"}
      class={clsx(content, props.class?.(), props.className?.())}
    />
  );
}
