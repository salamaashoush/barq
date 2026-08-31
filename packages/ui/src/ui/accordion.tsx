import {
  DisclosureButton,
  DisclosureGroup,
  DisclosureGroupItem,
  DisclosurePanel,
  type DisclosureButtonComponentProps,
  type DisclosureGroupComponentProps,
  type DisclosurePanelComponentProps,
} from "@barqjs/aria/disclosure";
import type { Incoming } from "@barqjs/core";
import { clsx, css } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const item = css`
  @layer barq.ui {
    border-bottom-style: var(--ui-border-style);
    border-bottom-width: 1px;
    &:last-child {
      border-bottom-style: var(--ui-border-style);
      border-bottom-width: 0px;
    }
  }
`;

const trigger = css`
  @layer barq.ui {
    display: flex;
    width: 100%;
    flex: 1;
    align-items: flex-start;
    justify-content: space-between;
    gap: calc(var(--spacing) * 4);
    border-radius: calc(var(--radius) - 2px);
    background-color: transparent;
    padding-block: calc(var(--spacing) * 4);
    text-align: left;
    font-size: var(--text-sm);
    line-height: var(--ui-leading, var(--text-sm--line-height));
    --ui-font-weight: var(--font-weight-medium);
    font-weight: var(--font-weight-medium);
    transition-property: all;
    transition-timing-function: var(--ui-ease, var(--default-transition-timing-function));
    transition-duration: var(--ui-duration, var(--default-transition-duration));
    --ui-outline-style: none;
    outline-style: none;
    @media (hover: hover) {
      &:hover {
        text-decoration-line: underline;
      }
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
    }
    &[data-disabled] {
      pointer-events: none;
      opacity: 50%;
    }
    &[data-expanded] > [data-slot="accordion-chevron"] {
      rotate: 180deg;
    }
  }
`;

const chevron = css`
  @layer barq.ui {
    pointer-events: none;
    width: calc(var(--spacing) * 4);
    height: calc(var(--spacing) * 4);
    flex-shrink: 0;
    --ui-translate-y: calc(var(--spacing) * 0.5);
    translate: var(--ui-translate-x) var(--ui-translate-y);
    color: var(--muted-foreground);
    transition-property: transform, translate, scale, rotate;
    transition-timing-function: var(--ui-ease, var(--default-transition-timing-function));
    transition-duration: var(--ui-duration, var(--default-transition-duration));
    --ui-duration: 200ms;
    transition-duration: 200ms;
  }
`;

const body = css`
  @layer barq.ui {
    padding-top: 0px;
    padding-bottom: calc(var(--spacing) * 4);
    font-size: var(--text-sm);
    line-height: var(--ui-leading, var(--text-sm--line-height));
  }
`;

/**
 * The panel collapses on `grid-template-rows`, not on `height`.
 *
 * shadcn animates `height` from 0 to a value Radix measures and publishes as
 * `--radix-accordion-content-height`. There is nothing to measure here: a grid
 * row of `0fr` growing to `1fr` interpolates to the content's own height, so
 * the panel animates without JavaScript, without a resize observer, and
 * correctly when the content changes while it is open.
 */
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

export interface AccordionProps<T> extends DisclosureGroupComponentProps<T> {}

/**
 * ```tsx
 * <Accordion items={faqs} allowsMultipleExpanded>
 *   {(faq) => (
 *     <AccordionItem>
 *       <AccordionTrigger>{faq.question}</AccordionTrigger>
 *       <AccordionContent>{faq.answer}</AccordionContent>
 *     </AccordionItem>
 *   )}
 * </Accordion>
 * ```
 */
export function Accordion<T>(props: Incoming<AccordionProps<T>>) {
  return <DisclosureGroup {...props} data-slot="accordion" />;
}

export interface AccordionItemProps extends UiProps {
  isDisabled?: boolean;
}

/**
 * The rule between two sections is drawn by this element, and this element is
 * the reason it exists.
 *
 * `@barqjs/aria`'s `<DisclosureGroupItem>` renders nothing — it is a provider,
 * like every other grouping component here — so a `class` handed to it landed
 * nowhere and the accordion had no dividers at all.
 */
export function AccordionItem(props: Incoming<AccordionItemProps>) {
  return (
    <div {...uiProps("accordion-item", item, props)}>
      <DisclosureGroupItem isDisabled={props.isDisabled?.()}>{props.children}</DisclosureGroupItem>
    </div>
  );
}

export interface AccordionTriggerProps extends DisclosureButtonComponentProps {}

/** The header row. The chevron turns over on `data-expanded`, which the button already writes. */
export function AccordionTrigger(props: Incoming<AccordionTriggerProps>) {
  return (
    <DisclosureButton
      {...props}
      data-slot={props["data-slot"]?.() ?? "accordion-trigger"}
      class={clsx(trigger, props.class?.(), props.className?.())}
    >
      {props.children}
      <ChevronDown data-slot="accordion-chevron" class={chevron} />
    </DisclosureButton>
  );
}

export interface AccordionContentProps extends DisclosurePanelComponentProps {}

export function AccordionContent(props: Incoming<AccordionContentProps>) {
  return (
    <DisclosurePanel {...props} data-slot="accordion-content" class={panel}>
      <div data-slot="accordion-body" class={clsx(body, props.class?.(), props.className?.())}>
        {props.children}
      </div>
    </DisclosurePanel>
  );
}
