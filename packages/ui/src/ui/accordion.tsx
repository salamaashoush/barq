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
import { firstThatWorks, layer } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { ringSlot } from "../lib/shared-ring-slot.ts";
import { when } from "../lib/shared-when.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

const item = ui({
  ":not(:last-child)": {
    borderBottomStyle: "var(--ui-border-style)",
    borderBottomWidth: "1px",
  },
});

const trigger = ui(
  text.sm,
  text.medium,
  box.transition,
  box.outline,
  ringSlot.focus,
  when.disabled,
  // A marker: upstream's styles compile to `.group\/accordion-trigger:has(…)`.
  "group/accordion-trigger",
  {
    position: "relative",
    display: "flex",
    width: "100%",
    flex: "1",
    alignItems: "flex-start",
    justifyContent: "space-between",
    borderRadius: "var(--radius)",
    borderStyle: "var(--ui-border-style)",
    borderWidth: "1px",
    borderColor: "transparent",
    backgroundColor: "transparent",
    paddingBlock: "calc(var(--spacing) * 2.5)",
    textAlign: "left",
    transitionProperty: "all",
    "@media (hover: hover)": {
      ":hover": {
        textDecorationLine: "underline",
      },
    },
    ":focus-visible": {
      borderColor: "var(--ring)",
    },
    ":focus-visible::after": {
      content: "var(--ui-content)",
      borderColor: "var(--ring)",
    },
    // The chevron is a DESCENDANT rule upstream, so its size and colour belong
    // to the trigger rather than to the icon's own class.
    ':is(& *)[data-slot="accordion-trigger-icon"]': {
      marginLeft: "auto",
      width: "calc(var(--spacing) * 4)",
      height: "calc(var(--spacing) * 4)",
      color: "var(--muted-foreground)",
    },
    '[data-expanded] > [data-slot="accordion-chevron"]': {
      rotate: "180deg",
    },
  },
);

const chevron = ui({
  pointerEvents: "none",
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
  flexShrink: "0",
  "--ui-translate-y": "calc(var(--spacing) * 0.5)",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  color: "var(--muted-foreground)",
  transitionProperty: "transform, translate, scale, rotate",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: firstThatWorks(
    "200ms",
    "var(--ui-duration, var(--default-transition-duration))",
  ),
  "--ui-duration": "200ms",
});

const body = ui(text.sm, {
  paddingTop: "0px",
  paddingBottom: "calc(var(--spacing) * 4)",
});

/**
 * The panel collapses on `grid-template-rows`, not on `height`.
 *
 * shadcn animates `height` from 0 to a value Radix measures and publishes as
 * `--radix-accordion-content-height`. There is nothing to measure here: a grid
 * row of `0fr` growing to `1fr` interpolates to the content's own height, so
 * the panel animates without JavaScript, without a resize observer, and
 * correctly when the content changes while it is open.
 */
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
      class={ui(trigger, props.class?.(), props.className?.())}
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
      <div data-slot="accordion-body" class={ui(body, props.class?.(), props.className?.())}>
        {props.children}
      </div>
    </DisclosurePanel>
  );
}
