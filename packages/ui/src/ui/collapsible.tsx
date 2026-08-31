import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  type DisclosureButtonComponentProps,
  type DisclosureComponentProps,
  type DisclosurePanelComponentProps,
} from "@barqjs/aria/disclosure";
import type { Incoming } from "@barqjs/core";
import { clsx, css } from "@barqjs/css";

import "../theme/layers.ts";

const trigger = css`
  @layer barq.ui {
    --ui-outline-style: none;
    outline-style: none;
    &[data-focus-visible] {
      --ui-ring-shadow: var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width))
        var(--ui-ring-color, currentcolor);
      box-shadow:
        var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
        var(--ui-ring-shadow), var(--ui-shadow);
      --ui-ring-color: var(--ring);
      @supports (color: color-mix(in lab, red, red)) {
        --ui-ring-color: color-mix(in oklab, var(--ring) 50%, transparent);
      }
    }
    &[data-disabled] {
      pointer-events: none;
      opacity: 50%;
    }
  }
`;

/** The same `grid-template-rows` collapse the accordion uses; see `accordion.tsx`. */
const panel = css`
  @layer barq.ui {
    display: grid;
    grid-template-rows: 0fr;
    overflow: hidden;
    transition: grid-template-rows 200ms ease-out;

    &[data-expanded] {
      grid-template-rows: 1fr;
    }

    & > * {
      overflow: hidden;
      min-height: 0;
    }

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }
`;

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
      class={clsx(trigger, props.class?.(), props.className?.())}
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
