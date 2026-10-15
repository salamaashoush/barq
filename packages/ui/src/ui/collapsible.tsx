import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  useDisclosure,
  type DisclosureButtonComponentProps,
  type DisclosureComponentProps,
  type DisclosurePanelComponentProps,
} from "@barqjs/aria/disclosure";
import { mergeProps } from "@barqjs/aria/utils";
import type { Incoming, JSXElement } from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { partRender, uiProps, type RenderPart } from "../lib/slot.ts";
import { TriggerPart, type TriggerPartProps } from "../lib/trigger.tsx";
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

export interface CollapsibleProps extends DisclosureComponentProps, UiProps {
  /** shadcn's spelling of `isExpanded`. */
  open?: boolean;
  /** shadcn's spelling of `defaultExpanded`. */
  defaultOpen?: boolean;
  /** shadcn's spelling of `onExpandedChange`. */
  onOpenChange?: (open: boolean) => void;
  /** shadcn's spelling of `isDisabled`. */
  disabled?: boolean;
  /**
   * Another element as the collapsible, as upstream's `asChild` makes a
   * `SidebarMenuItem` one. It is handed the class, the state and the ref, and
   * keeps its own slot name.
   */
  render?: RenderPart;
}

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
    <Disclosure
      isExpanded={props.isExpanded?.() ?? props.open?.()}
      defaultExpanded={props.defaultExpanded?.() ?? props.defaultOpen?.()}
      isDisabled={props.isDisabled?.() ?? props.disabled?.()}
      onExpandedChange={(open: boolean) => {
        props.onExpandedChange?.()?.(open);
        props.onOpenChange?.()?.(open);
      }}
    >
      <CollapsibleRoot {...props}>{props.children}</CollapsibleRoot>
    </Disclosure>
  );
}

/**
 * The element, INSIDE the provider rather than around it, so it can say whether
 * it is open. Around it, the state is one scope too far down.
 */
function CollapsibleRoot(props: Incoming<CollapsibleProps>) {
  const disclosure = useDisclosure();
  const render = props.render?.();
  if (render !== undefined) {
    const { "data-slot": _, ...own } = uiProps("collapsible", "", props);
    return render(
      partRender(
        mergeProps(own, {
          "data-state": () => (disclosure.state.isExpanded() ? "open" : "closed"),
          "data-disabled": () => (disclosure.isDisabled() ? "" : undefined),
        }),
      ),
    ) as JSXElement;
  }
  return (
    <div
      {...uiProps("collapsible", "", props)}
      data-state={() => (disclosure.state.isExpanded() ? "open" : "closed")}
      data-disabled={() => (disclosure.isDisabled() ? "" : undefined)}
    >
      {props.children}
    </div>
  );
}

export interface CollapsibleTriggerProps extends DisclosureButtonComponentProps {
  /**
   * The control written inside is the trigger, and no button is rendered
   * around it: a `<Button>`, a `<SidebarGroupLabel>`, anything that takes the
   * trigger slot.
   */
  asChild?: boolean;
  /** Any other element, built from the props and the ref it is handed. */
  render?: TriggerPartProps["render"];
}

/**
 * ```tsx
 * <CollapsibleTrigger asChild>
 *   <SidebarGroupLabel>Help</SidebarGroupLabel>
 * </CollapsibleTrigger>
 * ```
 */
export function CollapsibleTrigger(props: Incoming<CollapsibleTriggerProps>) {
  if (props.asChild?.() === true || props.render?.() !== undefined) {
    return (
      <CollapsibleTriggerSlot render={props.render?.()}>{props.children}</CollapsibleTriggerSlot>
    );
  }
  return (
    <DisclosureButton
      {...props}
      data-slot={props["data-slot"]?.() ?? "collapsible-trigger"}
      class={ui(trigger, props.class?.(), props.className?.())}
    />
  );
}

function CollapsibleTriggerSlot(props: Incoming<TriggerPartProps>) {
  const disclosure = useDisclosure();
  return (
    <TriggerPart
      slot={{
        props: mergeProps(disclosure.buttonProps, {
          "data-state": () => (disclosure.state.isExpanded() ? "open" : "closed"),
        }),
      }}
      render={props.render?.()}
      name="collapsible-trigger"
    >
      {props.children}
    </TriggerPart>
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
