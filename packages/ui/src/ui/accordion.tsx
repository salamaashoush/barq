import type { Key } from "@barqjs/aria/collections";
import {
  DisclosureButton,
  DisclosureGroup,
  DisclosureGroupItem,
  DisclosurePanel,
  useDisclosure,
  type DisclosureButtonComponentProps,
  type DisclosureGroupComponentProps,
  type DisclosurePanelComponentProps,
} from "@barqjs/aria/disclosure";
import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { ChevronUp } from "@barqjs/lucide/icons/chevron-up";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { ringSlot } from "../lib/shared-ring-slot.ts";
import { when } from "../lib/shared-when.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { omit, uiProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

const item = ui({
  ":not(:last-child)": {
    borderBottomStyle: "var(--ui-border-style)",
    borderBottomWidth: "1px",
  },
});

const header = ui({
  display: "flex",
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
    textAlign: "start",
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
      marginInlineStart: "auto",
      width: "calc(var(--spacing) * 4)",
      height: "calc(var(--spacing) * 4)",
      color: "var(--muted-foreground)",
    },
  },
);

/**
 * TWO chevrons, one shown at a time, which is what upstream draws now.
 *
 * It was one glyph rotated 180 degrees on `data-expanded`. Upstream renders a
 * down chevron and an up chevron and swaps which is displayed, so the icon
 * changes shape rather than turning over — and the size and colour come from
 * the TRIGGER's descendant rule, not from either icon's own class.
 */
const chevronDown = ui({
  pointerEvents: "none",
  flexShrink: "0",
  "[data-expanded] &": {
    display: "none",
  },
});

const chevronUp = ui({
  pointerEvents: "none",
  display: "none",
  flexShrink: "0",
  "[data-expanded] &": {
    display: "inline",
  },
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

export interface AccordionProps<T> extends DisclosureGroupComponentProps<T> {
  /**
   * shadcn's spelling of `allowsMultiple`. Giving it at all also takes
   * shadcn's default for `collapsible`, which is `false`.
   */
  type?: "single" | "multiple";
  /** With `type="single"`, whether the open section may be shut. @default false */
  collapsible?: boolean;
  /** The open section's `value`, or every open one's with `type="multiple"`. */
  value?: string | string[];
  defaultValue?: string | string[];
  /** A string with `type="single"` (empty when nothing is open), an array otherwise. */
  onValueChange?: (value: string | string[]) => void;
  disabled?: boolean;
}

const UPSTREAM = [
  "type",
  "collapsible",
  "value",
  "defaultValue",
  "onValueChange",
  "disabled",
] as const;

function keysOf(value: string | string[] | undefined): Key[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value;
  return value === "" ? [] : [value];
}

/**
 * ```tsx
 * <Accordion items={faqs} allowsMultiple>
 *   {(faq) => (
 *     <AccordionItem>
 *       <AccordionTrigger>{faq.question}</AccordionTrigger>
 *       <AccordionContent>{faq.answer}</AccordionContent>
 *     </AccordionItem>
 *   )}
 * </Accordion>
 * ```
 *
 * Or written out the way shadcn's is, each section naming itself:
 *
 * ```tsx
 * <Accordion type="single" collapsible defaultValue="shipping">
 *   <AccordionItem value="shipping">
 *     <AccordionTrigger>Shipping</AccordionTrigger>
 *     <AccordionContent>Two days</AccordionContent>
 *   </AccordionItem>
 * </Accordion>
 * ```
 */
export function Accordion<T>(props: Incoming<AccordionProps<T>>) {
  const multiple = (): boolean => props.allowsMultiple?.() ?? props.type?.() === "multiple";
  const report = (keys: Set<Key>): void => {
    props.onExpandedChange?.()?.(keys);
    const values = [...keys].map(String);
    props.onValueChange?.()?.(multiple() ? values : (values[0] ?? ""));
  };

  return (
    <DisclosureGroup
      {...omit(props, UPSTREAM)}
      data-slot="accordion"
      allowsMultiple={multiple()}
      isCollapsible={
        props.isCollapsible?.() ??
        (props.type === undefined ? undefined : (props.collapsible?.() ?? false))
      }
      isDisabled={props.isDisabled?.() ?? props.disabled?.()}
      expandedKeys={props.expandedKeys?.() ?? keysOf(props.value?.())}
      defaultExpandedKeys={props.defaultExpandedKeys?.() ?? keysOf(props.defaultValue?.())}
      onExpandedChange={report}
    />
  );
}

export interface AccordionItemProps extends UiProps {
  isDisabled?: boolean;
  /** shadcn's spelling of `isDisabled`. */
  disabled?: boolean;
  /** What this section answers to in the accordion's `value`. Not read when it was built from `items`. */
  value?: string;
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
    <DisclosureGroupItem
      id={props.value?.()}
      isDisabled={props.isDisabled?.() ?? props.disabled?.()}
    >
      <AccordionSection {...props}>{props.children}</AccordionSection>
    </DisclosureGroupItem>
  );
}

/**
 * The element, INSIDE the provider rather than around it, so it can say whether
 * its own section is open. Around it, the state is one scope too far down.
 */
function AccordionSection(props: Incoming<AccordionItemProps>) {
  const section = useDisclosure();
  return (
    <div
      {...uiProps("accordion-item", item, props)}
      data-state={() => (section.state.isExpanded() ? "open" : "closed")}
      data-orientation={() => section.group?.orientation()}
      data-disabled={() => (section.isDisabled() ? "" : undefined)}
    >
      {props.children}
    </div>
  );
}

export interface AccordionTriggerProps extends DisclosureButtonComponentProps {}

/** The header row. The chevron swaps on `data-expanded`, which the button writes. */
export function AccordionTrigger(props: Incoming<AccordionTriggerProps>) {
  const section = useDisclosure();
  return (
    <h3
      data-slot="accordion-header"
      class={header}
      data-state={() => (section.state.isExpanded() ? "open" : "closed")}
      data-orientation={() => section.group?.orientation()}
      data-disabled={() => (section.isDisabled() ? "" : undefined)}
    >
      <DisclosureButton
        {...props}
        data-slot={props["data-slot"]?.() ?? "accordion-trigger"}
        class={ui(trigger, props.class?.(), props.className?.())}
      >
        {props.children}
        <ChevronDown data-slot="accordion-trigger-icon" class={chevronDown} />
        <ChevronUp data-slot="accordion-trigger-icon" class={chevronUp} />
      </DisclosureButton>
    </h3>
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
