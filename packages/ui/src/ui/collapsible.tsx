import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  type DisclosureButtonComponentProps,
  type DisclosureComponentProps,
  type DisclosurePanelComponentProps,
} from "@barqjs/aria/disclosure";
import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { uiProps } from "../lib/slot.ts";
import { cn } from "../lib/utils.ts";
import type { UiProps } from "../lib/props.ts";
import { when } from "../lib/shared-when.ts";

const ui = layer("barq.ui");

const trigger = ui(box.outline, when.disabled, {
  "[data-focus-visible]": {
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "var(--ring)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
    },
  },
});

/** The same `grid-template-rows` collapse the accordion uses; see `accordion.tsx`. */
const panel = ui({
  display: "grid",
  gridTemplateRows: "0fr",
  overflow: "hidden",
  transition: "grid-template-rows 200ms ease-out",
  "[data-expanded]": {
    gridTemplateRows: "1fr",
  },
  "& > *": {
    overflow: "hidden",
    minHeight: "0",
  },
  "@media (prefers-reduced-motion: reduce)": {
    transition: "none",
  },
});

export interface CollapsibleProps extends DisclosureComponentProps, UiProps {}

/**
 * ```tsx
 * <Collapsible>
 *   <CollapsibleTrigger>Details</CollapsibleTrigger>
 *   <CollapsibleContent>…</CollapsibleContent>
 * </Collapsible>
 * ```
 *
 * The panel stays in the document while collapsed, so find-in-page reaches it.
 *
 * The `<div>` is this component's own. `@barqjs/aria`'s `<Disclosure>` renders
 * no element, and shadcn's is Radix's `Collapsible.Root`, which does: without
 * one there is nothing on the page carrying `data-slot="collapsible"` and a
 * `class` handed here went nowhere.
 */
export function Collapsible(props: Incoming<CollapsibleProps>) {
  return (
    <div {...uiProps("collapsible", "", props)}>
      <Disclosure
        isExpanded={props.isExpanded?.()}
        defaultExpanded={props.defaultExpanded?.()}
        isDisabled={props.isDisabled?.()}
        onExpandedChange={props.onExpandedChange?.()}
      >
        {props.children}
      </Disclosure>
    </div>
  );
}

export interface CollapsibleTriggerProps extends DisclosureButtonComponentProps {}

export function CollapsibleTrigger(props: Incoming<CollapsibleTriggerProps>) {
  return (
    <DisclosureButton
      {...props}
      data-slot={props["data-slot"]?.() ?? "collapsible-trigger"}
      class={ui(trigger, props.class?.(), props.className?.())}
    />
  );
}

export interface CollapsibleContentProps extends DisclosurePanelComponentProps {}

export function CollapsibleContent(props: Incoming<CollapsibleContentProps>) {
  return (
    <DisclosurePanel {...props} data-slot="collapsible-content" class={panel}>
      <div class={cn(props.class?.(), props.className?.())}>{props.children}</div>
    </DisclosurePanel>
  );
}
