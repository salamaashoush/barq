import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  type DisclosureButtonComponentProps,
  type DisclosureComponentProps,
  type DisclosurePanelComponentProps,
} from "@barqjs/aria/disclosure";
import type { Incoming } from "@barqjs/core";
import { clsx, layer } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
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

export interface CollapsibleProps extends DisclosureComponentProps {}

/**
 * ```tsx
 * <Collapsible>
 *   <CollapsibleTrigger>Details</CollapsibleTrigger>
 *   <CollapsibleContent>…</CollapsibleContent>
 * </Collapsible>
 * ```
 *
 * The panel stays in the document while collapsed, so find-in-page reaches it.
 */
export function Collapsible(props: Incoming<CollapsibleProps>) {
  return <Disclosure {...props} />;
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
      <div class={clsx(props.class?.(), props.className?.())}>{props.children}</div>
    </DisclosurePanel>
  );
}
