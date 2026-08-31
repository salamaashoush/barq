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
import { atomsIn, firstThatWorks } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";

import "../theme/layers.ts";
import { ui } from "../lib/atoms.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const item = atomsIn("barq.ui", {
  borderBottomStyle: "var(--ui-border-style)",
  borderBottomWidth: "1px",
  ":last-child": {
    borderBottomStyle: "var(--ui-border-style)",
    borderBottomWidth: "0px",
  },
});

const trigger = atomsIn("barq.ui", {
  display: "flex",
  width: "100%",
  flex: "1",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "calc(var(--spacing) * 4)",
  borderRadius: "calc(var(--radius) - 2px)",
  backgroundColor: "transparent",
  paddingBlock: "calc(var(--spacing) * 4)",
  textAlign: "left",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
  transitionProperty: "all",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  "@media (hover: hover)": {
    ":hover": {
      textDecorationLine: "underline",
    },
  },
  "[data-focus-visible]": {
    borderColor: "var(--ring)",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "var(--ring)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
    },
  },
  "[data-disabled]": {
    pointerEvents: "none",
    opacity: "50%",
  },
  '[data-expanded] > [data-slot="accordion-chevron"]': {
    rotate: "180deg",
  },
});

const chevron = atomsIn("barq.ui", {
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

const body = atomsIn("barq.ui", {
  paddingTop: "0px",
  paddingBottom: "calc(var(--spacing) * 4)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
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
const panel = atomsIn("barq.ui", {
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
