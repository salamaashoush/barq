import type { Key } from "@barqjs/aria/collections";
import {
  Section,
  useItemNode,
  useListBox,
  useSectionHeading,
  type OptionComponentProps,
} from "@barqjs/aria/listbox";
import { placementFor, type Align, type Placement, type Side } from "@barqjs/aria/overlays";
import {
  Option,
  Select as AriaSelect,
  SelectContent as AriaSelectContent,
  SelectItemText,
  SelectRoot,
  SelectScrollButton,
  SelectTrigger as AriaSelectTrigger,
  SelectValue as AriaSelectValue,
  SelectViewport,
  type SelectComponentProps,
  type SelectPosition,
  type SelectTriggerComponentProps,
  type SelectValueComponentProps,
} from "@barqjs/aria/select";
import type { Child, Incoming } from "@barqjs/core";
import { firstThatWorks, layer } from "@barqjs/css";
import { Check } from "@barqjs/lucide/icons/check";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { ChevronUp } from "@barqjs/lucide/icons/chevron-up";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { icon } from "../lib/shared-icon.ts";
import { ringSlot } from "../lib/shared-ring-slot.ts";
import { when } from "../lib/shared-when.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

const trigger = ui(
  box.border,
  text.sm,
  box.transition,
  box.outline,
  box.noSelect,
  when.darkInput,
  ringSlot.focus,
  when.disabledCursor,
  ringSlot.invalid,
  ringSlot.invalidRing,
  ringSlot.invalidDark,
  ringSlot.invalidBorderDark,
  icon.plain,
  icon.sized,
  icon.muted,
  {
    display: "flex",
    width: "fit-content",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "calc(var(--spacing) * 1.5)",
    borderRadius: "var(--radius)",
    borderColor: "var(--input)",
    backgroundColor: "transparent",
    paddingBlock: "calc(var(--spacing) * 2)",
    paddingInlineEnd: "calc(var(--spacing) * 2)",
    paddingInlineStart: "calc(var(--spacing) * 2.5)",
    whiteSpace: "nowrap",
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --ui-gradient-from, --ui-gradient-via, --ui-gradient-to",
    '[data-size="default"]': {
      height: "calc(var(--spacing) * 8)",
    },
    '[data-size="sm"]': {
      height: "calc(var(--spacing) * 7)",
      borderRadius: "min(var(--radius-md), 10px)",
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
    "[data-placeholder]": {
      color: "var(--muted-foreground)",
    },
    '& > [data-slot="select-value"]': {
      overflow: "hidden",
      display: firstThatWorks("flex", "-webkit-box"),
      "-webkit-box-orient": "vertical",
      "-webkit-line-clamp": "1",
      alignItems: "center",
      gap: "calc(var(--spacing) * 1.5)",
    },
  },
);

/**
 * shadcn puts min-w-[8rem] on the content and the trigger's width on the
 * viewport inside it, so the list is the wider of the two. `overlayPosition`
 * publishes the same measurement; the plain `8rem` beside it is the fallback
 * for a browser without `max()`, and is what the transcription produced.
 */
const list = ui(box.shadow, {
  position: "relative",
  zIndex: "50",
  margin: "0px",
  maxHeight: "var(--barq-available-height)",
  minWidth: firstThatWorks(
    "max(calc(var(--spacing) * 36), var(--barq-trigger-width, 0px))",
    "calc(var(--spacing) * 36)",
  ),
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  listStyleType: "none",
  overflowX: "hidden",
  overflowY: "auto",
  borderRadius: "var(--radius)",
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  "--ui-shadow":
    "0 4px 6px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 2px 4px -2px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
  "--ui-ring-shadow":
    "var(--ui-ring-inset,) 0 0 0 calc(1px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
  "--ui-ring-color": "var(--foreground)",
  "--ui-duration": "100ms",
  transitionDuration: "100ms",
  "@supports (color: color-mix(in lab, red, red))": {
    "--ui-ring-color": "color-mix(in oklab, var(--foreground) 10%, transparent)",
  },
  // A list pinned to its trigger does not zoom out of a corner: it is already
  // where it belongs, and the scale reads as a jolt rather than an entrance.
  '[data-align-trigger="true"]': {
    animation: "none",
  },
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
    "--ui-animation-fill-mode": "forwards",
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

const item = ui(
  text.sm,
  box.outline,
  box.forcedColors,
  box.noSelect,
  when.focused,
  when.disabled,
  icon.plain,
  icon.sized,
  icon.muted,
  {
    position: "relative",
    display: "flex",
    width: "100%",
    cursor: "default",
    alignItems: "center",
    gap: "calc(var(--spacing) * 1.5)",
    borderRadius: "calc(var(--radius) * 0.8)",
    paddingBlock: "var(--spacing)",
    paddingInlineEnd: "calc(var(--spacing) * 8)",
    paddingInlineStart: "calc(var(--spacing) * 1.5)",
    ':is(&:not([data-variant="destructive"])[data-focused] *)': {
      color: "var(--accent-foreground)",
    },
    // The row's trailing span is the label beside the value's own icon, and it
    // lays out as a row of its own.
    ":is(& > *):is(span:last-child)": {
      display: "flex",
      alignItems: "center",
      gap: "calc(var(--spacing) * 2)",
    },
  },
);

const indicator = ui({
  position: "absolute",
  insetInlineEnd: "calc(var(--spacing) * 2)",
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

const label = ui({
  paddingInline: "calc(var(--spacing) * 2)",
  paddingBlock: "calc(var(--spacing) * 1.5)",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  color: "var(--muted-foreground)",
});

const separator = ui({
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
const chevron = ui({
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

/**
 * The box a written select's list opens in.
 *
 * The same box as `list`, laid out as a column: the scroll buttons sit above
 * and below a viewport that does the scrolling, so the box itself clips.
 */
const content = ui(list, {
  display: "flex",
  flexDirection: "column",
  overflowY: "hidden",
});

/**
 * The scroller. Its scrollbar is hidden because the arrows at either end say
 * the same thing, and both at once is two indicators for one fact.
 */
const viewport = ui({
  margin: "0px",
  minHeight: "0px",
  flexGrow: "1",
  flexShrink: "1",
  flexBasis: "0%",
  listStyleType: "none",
  padding: "0px",
  overflowX: "hidden",
  overflowY: "auto",
  scrollbarWidth: "none",
  "::-webkit-scrollbar": {
    display: "none",
  },
  '[data-position="popper"]': {
    width: "100%",
    minWidth: "var(--barq-trigger-width)",
  },
});

const scrollButton = ui(icon.plain, icon.sized, {
  zIndex: "10",
  display: "flex",
  flexShrink: "0",
  cursor: "default",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "var(--popover)",
  paddingBlock: "var(--spacing)",
});

const triggerIcon = ui({
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
  flexShrink: "0",
  opacity: "50%",
  color: "var(--muted-foreground)",
});

const value = ui({
  textAlign: "start",
});

export type SelectSize = "default" | "sm";

export interface SelectProps<T> extends Omit<SelectComponentProps<T>, "items" | "children"> {
  /**
   * The values to choose between, for a select built from data. Leave it out
   * and the select is written as parts instead.
   */
  items?: Iterable<T>;
  /** How one value renders, with `items`; the trigger and the content, without. */
  children?: ((item: T) => Child) | Child;
  /** The trigger's size, with `items`. A written select sizes its own `<SelectTrigger>`. @default "default" */
  size?: SelectSize;
  /** The chosen option's `value`. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  disabled?: boolean;
  required?: boolean;
  /** The reading direction, when it is not the page's. */
  dir?: "ltr" | "rtl";
}

function hasItems<T>(
  props: Incoming<SelectProps<T>>,
): props is Incoming<SelectProps<T> & SelectComponentProps<T>> {
  return props.items !== undefined;
}

/**
 * Written as parts, which is how shadcn's reads:
 *
 * ```tsx
 * <Select defaultValue="apple" onValueChange={(fruit) => chosen.set(fruit)}>
 *   <SelectTrigger aria-label="Fruit"><SelectValue placeholder="Pick one" /></SelectTrigger>
 *   <SelectContent>
 *     <SelectGroup>
 *       <SelectLabel>Fruit</SelectLabel>
 *       <SelectItem value="apple">Apple</SelectItem>
 *       <SelectItem value="banana">Banana</SelectItem>
 *     </SelectGroup>
 *   </SelectContent>
 * </Select>
 * ```
 *
 * Or built from data, where `@barqjs/aria` makes the trigger, the popover and
 * the list from the same `items`:
 *
 * ```tsx
 * <Select items={fruits} placeholder="Pick one" aria-label="Fruit"
 *         onSelectionChange={(key) => chosen.set(key)}>
 *   {(fruit) => <SelectItem>{fruit.name}</SelectItem>}
 * </Select>
 * ```
 *
 * Which one it is follows from `items` alone. Either way a real `<select>` is
 * rendered beside it when you give it a `name`, so the value reaches a form
 * post, and the written one takes `value`, `open`, `disabled` and `required`
 * under shadcn's names as well as this package's.
 */
export function Select<T>(props: Incoming<SelectProps<T>>) {
  if (hasItems(props)) {
    return (
      <AriaSelect
        {...props}
        selectedKey={props.selectedKey?.() ?? props.value?.()}
        defaultSelectedKey={props.defaultSelectedKey?.() ?? props.defaultValue?.()}
        isOpen={props.isOpen?.() ?? props.open?.()}
        isDisabled={props.isDisabled?.() ?? props.disabled?.()}
        isRequired={props.isRequired?.() ?? props.required?.()}
        onSelectionChange={(key) => chose(props, key)}
        data-slot={props["data-slot"]?.() ?? "select-trigger"}
        data-size={props.size?.() ?? "default"}
        class={ui(trigger, chevron, props.class?.(), props.className?.())}
        listClass={list}
        listSlot="select-content"
      />
    );
  }

  return (
    <SelectRoot
      selectedKey={props.selectedKey?.() ?? props.value?.()}
      defaultSelectedKey={props.defaultSelectedKey?.() ?? props.defaultValue?.()}
      isOpen={props.isOpen?.() ?? props.open?.()}
      defaultOpen={props.defaultOpen?.()}
      isDisabled={props.isDisabled?.() ?? props.disabled?.()}
      isRequired={props.isRequired?.() ?? props.required?.()}
      name={props.name?.()}
      form={props.form?.()}
      autoComplete={props.autoComplete?.()}
      dir={props.dir?.()}
      onSelectionChange={(key) => chose(props, key)}
      onOpenChange={props.onOpenChange?.()}
    >
      {props.children}
    </SelectRoot>
  );
}

function chose<T>(props: Incoming<SelectProps<T>>, key: Key | null): void {
  props.onSelectionChange?.()?.(key);
  if (key !== null) props.onValueChange?.()?.(String(key));
}

export interface SelectTriggerProps extends SelectTriggerComponentProps {
  /** @default "default" */
  size?: SelectSize;
  disabled?: boolean;
}

/**
 * The control that shows the value and opens the list, for a written select.
 *
 * This IS the button, as shadcn's is, so it takes the `id` a `<label for>`
 * points at; a combobox is named by its label, and one with neither that nor
 * an `aria-label` has no name at all.
 */
export function SelectTrigger(props: Incoming<SelectTriggerProps>) {
  return (
    <AriaSelectTrigger
      {...props}
      isDisabled={props.isDisabled?.() ?? props.disabled?.()}
      data-slot={props["data-slot"]?.() ?? "select-trigger"}
      data-size={props.size?.() ?? "default"}
      class={ui(trigger, props.class?.(), props.className?.())}
    >
      {props.children}
      <ChevronDown data-slot="select-icon" class={triggerIcon} aria-hidden="true" />
    </AriaSelectTrigger>
  );
}

export interface SelectValueProps extends SelectValueComponentProps {}

/** What is chosen, or the placeholder. Inside a `<SelectTrigger>`. */
export function SelectValue(props: Incoming<SelectValueProps>) {
  return (
    <AriaSelectValue
      {...props}
      data-slot={props["data-slot"]?.() ?? "select-value"}
      class={ui(value, props.class?.(), props.className?.())}
    />
  );
}

export interface SelectContentProps extends UiProps {
  /**
   * `"item-aligned"` lays the list over the trigger with the chosen option on
   * top of it, and falls back to `"popper"` where that would leave the
   * viewport; `"popper"` hangs it off the trigger.
   *
   * @default "item-aligned"
   */
  position?: SelectPosition;
  /** @default "bottom" */
  side?: Side;
  /** @default "center" */
  align?: Align;
  /** Distance from the trigger, on top of the gap the list always keeps. @default 0 */
  sideOffset?: number;
  alignOffset?: number;
  /** This package's name for a side and an alignment at once. Wins over both. */
  placement?: Placement;
  /** This package's name for the whole distance from the trigger. Wins over `sideOffset`. */
  offset?: number;
}

/** The gap shadcn draws between a popper list and its trigger, in pixels. */
const POPPER_GAP = 4;

/**
 * The list a written select opens: the scroll buttons and the viewport the
 * options are in.
 */
export function SelectContent(props: Incoming<SelectContentProps>) {
  const position = (): SelectPosition => props.position?.() ?? "item-aligned";

  return (
    <AriaSelectContent
      {...props}
      data-slot={props["data-slot"]?.() ?? "select-content"}
      class={ui(content, props.class?.(), props.className?.())}
      position={position()}
      placement={
        props.placement?.() ?? placementFor(props.side?.() ?? "bottom", props.align?.() ?? "center")
      }
      offset={props.offset?.() ?? (props.sideOffset?.() ?? 0) + POPPER_GAP}
      crossOffset={props.alignOffset?.()}
    >
      <SelectScrollUpButton />
      <SelectViewport class={viewport} data-slot="select-viewport" data-position={position()}>
        {props.children}
      </SelectViewport>
      <SelectScrollDownButton />
    </AriaSelectContent>
  );
}

export interface SelectItemProps extends OptionComponentProps {
  /** shadcn's name for `isDisabled`, for an item written as a child. */
  disabled?: boolean;
}

/**
 * One option. The tick appears from `data-selected`; nothing re-renders.
 *
 * Written as a child it carries its own `value`. Its children are what the
 * trigger shows once it is chosen, so an icon beside the text goes there too.
 */
export function SelectItem(props: Incoming<SelectItemProps>) {
  const listbox = useListBox();
  const key = listbox.staticItems === undefined ? useItemNode().key : props.value?.();
  const isChecked = (): boolean =>
    key !== undefined && listbox.state.selectionManager().isSelected(key);
  const isHighlighted = (): boolean =>
    key !== undefined && listbox.state.selectionManager().focusedKey === key;
  const isDisabled = (): boolean => (props.isDisabled?.() ?? props.disabled?.()) === true;

  return (
    <Option
      {...props}
      isDisabled={isDisabled()}
      data-slot={props["data-slot"]?.() ?? "select-item"}
      data-state={isChecked() ? "checked" : "unchecked"}
      data-highlighted={isHighlighted() ? "" : undefined}
      class={ui(item, props.class?.(), props.className?.())}
    >
      <span data-slot="select-item-indicator" class={indicator}>
        <Check />
      </span>
      <SelectItemText data-slot="select-item-text">{props.children}</SelectItemText>
    </Option>
  );
}

/**
 * A heading over a run of options.
 *
 * Inside a written `<SelectGroup>` it is what names the group, which is why
 * the group needs no `title` there.
 */
export function SelectLabel(props: Incoming<UiProps>) {
  const headingId = useSectionHeading();
  return (
    <li
      {...uiProps("select-label", label, props)}
      id={props.id?.() ?? headingId?.()}
      role="presentation"
    >
      {props.children}
    </li>
  );
}

export function SelectSeparator(props: Incoming<UiProps>) {
  return <li {...uiProps("select-separator", separator, props)} role="separator" />;
}

/** The arrow at the top of a written select's list, there while it can scroll up. */
export function SelectScrollUpButton(props: Incoming<UiProps>) {
  return (
    <SelectScrollButton
      {...props}
      direction="up"
      data-slot={props["data-slot"]?.() ?? "select-scroll-up-button"}
      class={ui(scrollButton, props.class?.(), props.className?.())}
    >
      <ChevronUp />
    </SelectScrollButton>
  );
}

/** The arrow at the bottom, there while it can scroll down. */
export function SelectScrollDownButton(props: Incoming<UiProps>) {
  return (
    <SelectScrollButton
      {...props}
      direction="down"
      data-slot={props["data-slot"]?.() ?? "select-scroll-down-button"}
      class={ui(scrollButton, props.class?.(), props.className?.())}
    >
      <ChevronDown />
    </SelectScrollButton>
  );
}

const group = ui({
  scrollMarginBlock: "var(--spacing)",
  padding: "var(--spacing)",
});

export interface SelectGroupProps extends Omit<UiProps, "title"> {
  /**
   * The heading over the run, for a group rendered from data. A written group
   * takes a `<SelectLabel>` as its first child instead.
   */
  title?: Child;
}

/**
 * A run of options under a heading.
 *
 * Written, it holds its `<SelectLabel>` and its `<SelectItem>`s. Rendered from
 * data it comes out of the item callback like an option does: give the select
 * `getChildren` and each group arrives there as its own value.
 *
 * ```tsx
 * <Select items={groups} getChildren={(group) => group.options}>
 *   {(value) =>
 *     value.options === undefined
 *       ? <SelectItem>{value.name}</SelectItem>
 *       : <SelectGroup title={value.name} />}
 * </Select>
 * ```
 */
export function SelectGroup(props: Incoming<SelectGroupProps>) {
  // A group named by a `<SelectLabel>` child has no title of its own, and the
  // element that would have held one must not be drawn as a heading.
  const isTitled = props.title !== undefined;
  return (
    <Section
      {...props}
      data-slot={props["data-slot"]?.() ?? "select-group"}
      titleSlot={isTitled ? "select-label" : "select-group-title"}
      titleClass={isTitled ? label : undefined}
      class={ui(group, props.class?.(), props.className?.())}
    />
  );
}
