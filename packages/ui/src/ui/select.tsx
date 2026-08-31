import type { OptionComponentProps } from "@barqjs/aria/listbox";
import {
  Option,
  Select as AriaSelect,
  SelectValue,
  type SelectComponentProps,
} from "@barqjs/aria/select";
import type { Incoming } from "@barqjs/core";
import { atomsIn, firstThatWorks } from "@barqjs/css";
import { Check } from "@barqjs/lucide/icons/check";

import "../theme/layers.ts";
import { ui } from "../lib/atoms.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const trigger = atomsIn("barq.ui", {
  display: "flex",
  width: "fit-content",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "calc(var(--spacing) * 2)",
  borderRadius: "calc(var(--radius) - 2px)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  borderColor: "var(--input)",
  backgroundColor: "transparent",
  paddingInline: "calc(var(--spacing) * 3)",
  paddingBlock: "calc(var(--spacing) * 2)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  whiteSpace: "nowrap",
  "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  transitionProperty: "color, box-shadow",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  '[data-size="default"]': {
    height: "calc(var(--spacing) * 9)",
  },
  '[data-size="sm"]': {
    height: "calc(var(--spacing) * 8)",
  },
  ":is(.dark *)": {
    backgroundColor: "var(--input)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--input) 30%, transparent)",
    },
  },
  "@media (hover: hover)": {
    ":is(.dark *):hover": {
      backgroundColor: "var(--input)",
    },
    "@supports (color: color-mix(in lab, red, red))": {
      ":is(.dark *):hover": {
        backgroundColor: "color-mix(in oklab, var(--input) 50%, transparent)",
      },
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
    cursor: "not-allowed",
    opacity: "50%",
  },
  "[data-invalid]": {
    borderColor: "var(--destructive)",
    "--ui-ring-color": "var(--destructive)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--destructive) 20%, transparent)",
    },
  },
  ":is(.dark *)[data-invalid]": {
    "--ui-ring-color": "var(--destructive)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--destructive) 40%, transparent)",
    },
  },
  "[data-placeholder]": {
    color: "var(--muted-foreground)",
  },
  "& svg": {
    pointerEvents: "none",
    flexShrink: "0",
  },
  '& svg:not([class*="size-"])': {
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
  },
  '& svg:not([class*="text-"])': {
    color: "var(--muted-foreground)",
  },
  '& > [data-slot="select-value"]': {
    overflow: "hidden",
    display: firstThatWorks("flex", "-webkit-box"),
    "-webkit-box-orient": "vertical",
    "-webkit-line-clamp": "1",
    alignItems: "center",
    gap: "calc(var(--spacing) * 2)",
  },
});

/**
 * shadcn puts min-w-[8rem] on the content and the trigger's width on the
 * viewport inside it, so the list is the wider of the two. `overlayPosition`
 * publishes the same measurement; the plain `8rem` beside it is the fallback
 * for a browser without `max()`, and is what the transcription produced.
 */
const list = atomsIn("barq.ui", {
  position: "relative",
  zIndex: "50",
  margin: "0px",
  minWidth: firstThatWorks("max(8rem, var(--barq-trigger-width, 0px))", "8rem"),
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  listStyleType: "none",
  overflowX: "hidden",
  overflowY: "auto",
  borderRadius: "calc(var(--radius) - 2px)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  backgroundColor: "var(--popover)",
  padding: "var(--spacing)",
  color: "var(--popover-foreground)",
  "--ui-shadow":
    "0 4px 6px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 2px 4px -2px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  "--ui-enter-opacity": firstThatWorks("0", "calc(0/100)"),
  "--ui-enter-scale": firstThatWorks("0.95", "calc(95*1%)"),
  '[data-placement="bottom"] &': {
    "--ui-enter-translate-y": "calc(2*var(--spacing)*-1)",
  },
  '[data-placement="left"] &': {
    "--ui-enter-translate-x": "calc(2*var(--spacing))",
  },
  '[data-placement="right"] &': {
    "--ui-enter-translate-x": "calc(2*var(--spacing)*-1)",
  },
  '[data-placement="top"] &': {
    "--ui-enter-translate-y": "calc(2*var(--spacing))",
  },
  "[data-closed] &": {
    animation:
      "exit var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
    "--ui-exit-opacity": firstThatWorks("0", "calc(0/100)"),
    "--ui-exit-scale": firstThatWorks("0.95", "calc(95*1%)"),
  },
  '[data-closed][data-placement="bottom"] &': {
    "--ui-exit-translate-y": "calc(2 * var(--spacing) * -1)",
  },
  '[data-closed][data-placement="left"] &': {
    "--ui-exit-translate-x": "calc(2 * var(--spacing))",
  },
  '[data-closed][data-placement="right"] &': {
    "--ui-exit-translate-x": "calc(2 * var(--spacing) * -1)",
  },
  '[data-closed][data-placement="top"] &': {
    "--ui-exit-translate-y": "calc(2 * var(--spacing))",
  },
});

const item = atomsIn("barq.ui", {
  position: "relative",
  display: "flex",
  width: "100%",
  cursor: "default",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  borderRadius: "calc(var(--radius) - 4px)",
  paddingBlock: "calc(var(--spacing) * 1.5)",
  paddingRight: "calc(var(--spacing) * 8)",
  paddingLeft: "calc(var(--spacing) * 2)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  "-webkit-user-select": "none",
  userSelect: "none",
  "[data-focused]": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  "[data-disabled]": {
    pointerEvents: "none",
    opacity: "50%",
  },
  "& svg": {
    pointerEvents: "none",
    flexShrink: "0",
  },
  '& svg:not([class*="size-"])': {
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
  },
  '& svg:not([class*="text-"])': {
    color: "var(--muted-foreground)",
  },
});

const indicator = atomsIn("barq.ui", {
  position: "absolute",
  right: "calc(var(--spacing) * 2)",
  display: "flex",
  width: "calc(var(--spacing) * 3.5)",
  height: "calc(var(--spacing) * 3.5)",
  alignItems: "center",
  justifyContent: "center",
  "& > svg": {
    display: "none",
  },
  "[data-selected] & > svg": {
    display: "block",
  },
});

const label = atomsIn("barq.ui", {
  paddingInline: "calc(var(--spacing) * 2)",
  paddingBlock: "calc(var(--spacing) * 1.5)",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  color: "var(--muted-foreground)",
});

const separator = atomsIn("barq.ui", {
  pointerEvents: "none",
  marginInline: "calc(var(--spacing) * -1)",
  marginBlock: "var(--spacing)",
  height: "1px",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "0px",
  backgroundColor: "var(--border)",
});

/**
 * The chevron, drawn by the trigger rather than rendered into it.
 *
 * `@barqjs/aria`'s `<Select>` renders one button with the current value inside
 * it and takes no slot for anything else, and adding one would be API for a
 * decoration. A masked pseudo-element is the same lucide glyph in the same
 * `currentColor` at the same size — and it cannot be focused, selected or read
 * by a screen reader, which an `<svg>` there would have needed
 * `aria-hidden` to avoid.
 */
const chevron = atomsIn("barq.ui", {
  "::after": {
    content: '""',
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
    flexShrink: "0",
    opacity: "50%",
    backgroundColor: "currentcolor",
    maskImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
    maskSize: "contain",
    maskRepeat: "no-repeat",
    maskPosition: "center",
  },
});

export type SelectSize = "default" | "sm";

export interface SelectProps<T> extends SelectComponentProps<T> {
  /** @default "default" */
  size?: SelectSize;
}

/**
 * ```tsx
 * <Select items={fruits} placeholder="Pick one" aria-label="Fruit"
 *         onSelectionChange={(key) => chosen.set(key)}>
 *   {(fruit) => <SelectItem>{fruit.name}</SelectItem>}
 * </Select>
 * ```
 *
 * One component, not five. shadcn's `<SelectTrigger>` / `<SelectContent>` /
 * `<SelectValue>` exist because Radix needs the tree written out;
 * `@barqjs/aria` builds the trigger, the popover and the list from the same
 * `items`, and renders a real `<select>` beside them when you give it a `name`
 * so the value reaches a form post.
 */
export function Select<T>(props: Incoming<SelectProps<T>>) {
  return (
    <AriaSelect
      {...props}
      data-slot={props["data-slot"]?.() ?? "select-trigger"}
      data-size={props.size?.() ?? "default"}
      class={ui(trigger, chevron, props.class?.(), props.className?.())}
      listClass={list}
    />
  );
}

export interface SelectItemProps extends OptionComponentProps {}

/** One option. The tick appears from `data-selected`; nothing re-renders. */
export function SelectItem(props: Incoming<SelectItemProps>) {
  return (
    <Option
      {...props}
      data-slot={props["data-slot"]?.() ?? "select-item"}
      class={ui(item, props.class?.(), props.className?.())}
    >
      <span data-slot="select-item-indicator" class={indicator}>
        <Check />
      </span>
      {props.children}
    </Option>
  );
}

/** A heading over a run of options. */
export function SelectLabel(props: Incoming<UiProps>) {
  return (
    <li {...uiProps("select-label", label, props)} role="presentation">
      {props.children}
    </li>
  );
}

export function SelectSeparator(props: Incoming<UiProps>) {
  return <li {...uiProps("select-separator", separator, props)} role="separator" />;
}

export { SelectValue };
