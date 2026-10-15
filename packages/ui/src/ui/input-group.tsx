import type { Incoming } from "@barqjs/core";
import { layer, variants } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { icon } from "../lib/shared-icon.ts";
import { when } from "../lib/shared-when.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Button, type ButtonProps, type ButtonVariant } from "./button.tsx";
import { Input, Textarea, type InputProps, type TextareaProps } from "./input.tsx";

const ui = layer("barq.ui");

// A marker: the addon dims with the group and the block addons read whether
// the group holds an `<input>`.
const root = ui(box.border, box.transition, box.outline, when.darkInput, "group/input-group", {
  position: "relative",
  display: "flex",
  height: "calc(var(--spacing) * 8)",
  width: "100%",
  minWidth: "0px",
  alignItems: "center",
  borderRadius: "var(--radius)",
  borderColor: "var(--input)",
  transitionProperty:
    "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --ui-gradient-from, --ui-gradient-via, --ui-gradient-to",
  // Inside a combobox panel the PANEL is the focus surface, so the search row
  // keeps the border it inherits and draws no ring.
  '[data-slot="combobox-content"] &:focus-within': {
    borderColor: "inherit",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(0px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
  },
  ":has(:disabled)": {
    backgroundColor: "var(--input)",
    opacity: "50%",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--input) 50%, transparent)",
    },
  },
  ":is(.dark *):has(:disabled)": {
    backgroundColor: "var(--input)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--input) 80%, transparent)",
    },
  },
  ':has(:is([data-slot="input-group-control"]:focus-visible))': {
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
  ':has(:is([data-slot][aria-invalid="true"]))': {
    borderColor: "var(--destructive)",
    "--ui-ring-color": "var(--destructive)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--destructive) 20%, transparent)",
    },
  },
  ':has(> [data-align="block-end"])': {
    height: "auto",
    flexDirection: "column",
  },
  ':has(> [data-align="block-start"])': {
    height: "auto",
    flexDirection: "column",
  },
  ":has(> textarea)": {
    height: "auto",
  },
  ':is(.dark *):has(:is([data-slot][aria-invalid="true"]))': {
    "--ui-ring-color": "var(--destructive)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--destructive) 40%, transparent)",
    },
  },
  ':has(> [data-align="block-end"]) > input': {
    paddingTop: "calc(var(--spacing) * 3)",
  },
  ':has(> [data-align="block-start"]) > input': {
    paddingBottom: "calc(var(--spacing) * 3)",
  },
  ':has(> [data-align="inline-end"]) > input': {
    paddingInlineEnd: "calc(var(--spacing) * 1.5)",
  },
  ':has(> [data-align="inline-start"]) > input': {
    paddingInlineStart: "calc(var(--spacing) * 1.5)",
  },
});

export type InputGroupAlign = "inline-start" | "inline-end" | "block-start" | "block-end";

/**
 * One class, four alignments, keyed off `data-align`.
 *
 * It was a `variants()` with a class per alignment, which is a rule the eight
 * styles cannot reach and a slot `verify` reads through one call.
 */
const addon = ui(text.sm, text.medium, box.noSelect, {
  display: "flex",
  height: "auto",
  cursor: "text",
  alignItems: "center",
  justifyContent: "center",
  gap: "calc(var(--spacing) * 2)",
  paddingBlock: "calc(var(--spacing) * 1.5)",
  color: "var(--muted-foreground)",
  "& > kbd": {
    borderRadius: "calc(var(--radius) - 5px)",
  },
  '& > svg:not([class*="size-"])': {
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
  },
  '[data-slot="input-group"][data-disabled] &': {
    opacity: "50%",
  },
  // A button or a key cap carries its own padding, so the addon pulls back by
  // that much and the control's text still starts where it would.
  '[data-align="inline-start"]': {
    order: "-9999",
    paddingInlineStart: "calc(var(--spacing) * 2)",
  },
  '[data-align="inline-start"]:has(> button)': {
    marginInlineStart: "-0.3rem",
  },
  '[data-align="inline-start"]:has(> kbd)': {
    marginInlineStart: "-0.15rem",
  },
  '[data-align="inline-end"]': {
    order: "9999",
    paddingInlineEnd: "calc(var(--spacing) * 2)",
  },
  '[data-align="inline-end"]:has(> button)': {
    marginInlineEnd: "-0.3rem",
  },
  '[data-align="inline-end"]:has(> kbd)': {
    marginInlineEnd: "-0.15rem",
  },
  '[data-align="block-start"]': {
    order: "-9999",
    width: "100%",
    justifyContent: "flex-start",
    paddingInline: "calc(var(--spacing) * 2.5)",
    paddingTop: "calc(var(--spacing) * 2)",
  },
  '[data-align="block-start"]:is(.border-b)': {
    paddingBottom: "calc(var(--spacing) * 2)",
  },
  '[data-slot="input-group"]:has(> input) &[data-align="block-start"]': {
    paddingTop: "calc(var(--spacing) * 2)",
  },
  '[data-align="block-end"]': {
    order: "9999",
    width: "100%",
    justifyContent: "flex-start",
    paddingInline: "calc(var(--spacing) * 2.5)",
    paddingBottom: "calc(var(--spacing) * 2)",
  },
  '[data-align="block-end"]:is(.border-t)': {
    paddingTop: "calc(var(--spacing) * 2)",
  },
  '[data-slot="input-group"]:has(> input) &[data-align="block-end"]': {
    paddingBottom: "calc(var(--spacing) * 2)",
  },
});

export type InputGroupButtonSize = "xs" | "sm" | "icon-xs" | "icon-sm";

export const inputGroupButtonVariants = variants({
  base: ui(text.sm, box.shadow, {
    display: "flex",
    alignItems: "center",
    gap: "calc(var(--spacing) * 2)",
    "--ui-shadow": "0 0 #0000",
  }),
  variants: {
    size: {
      xs: ui({
        height: "calc(var(--spacing) * 6)",
        gap: "var(--spacing)",
        borderRadius: "calc(var(--radius) - 3px)",
        paddingInline: "calc(var(--spacing) * 1.5)",
        '& > svg:not([class*="size-"])': {
          width: "calc(var(--spacing) * 3.5)",
          height: "calc(var(--spacing) * 3.5)",
        },
      }),
      sm: ui({}),
      "icon-xs": ui({
        width: "calc(var(--spacing) * 6)",
        height: "calc(var(--spacing) * 6)",
        borderRadius: "calc(var(--radius) - 3px)",
        padding: "0px",
        ":has(> svg)": {
          padding: "0px",
        },
      }),
      "icon-sm": ui({
        width: "calc(var(--spacing) * 8)",
        height: "calc(var(--spacing) * 8)",
        padding: "0px",
        ":has(> svg)": {
          padding: "0px",
        },
      }),
    },
  },
  defaults: { size: "xs" },
});

const label = ui(text.sm, icon.sized, {
  display: "flex",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  color: "var(--muted-foreground)",
  "& svg": {
    pointerEvents: "none",
  },
});

const control = ui(box.shadow, {
  flex: "1",
  resize: "none",
  paddingBlock: "calc(var(--spacing) * 2)",
  borderRadius: "0",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "0px",
  backgroundColor: "transparent",
  "--ui-shadow": "0 0 #0000",
  ":focus-visible": {
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(0px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  },
  ":is(.dark *)": {
    backgroundColor: "transparent",
  },
});

const controlTextarea = ui(box.shadow, {
  flex: "1",
  resize: "none",
  borderRadius: "0",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "0px",
  backgroundColor: "transparent",
  paddingBlock: "calc(var(--spacing) * 3)",
  "--ui-shadow": "0 0 #0000",
  ":focus-visible": {
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(0px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  },
  ":is(.dark *)": {
    backgroundColor: "transparent",
  },
});

export interface InputGroupProps extends UiProps {
  /** Dims the addons. The control is disabled by its own prop. */
  isDisabled?: boolean;
}

/**
 * One border around a control and whatever sits beside it.
 *
 * ```tsx
 * <InputGroup>
 *   <InputGroupAddon><Search /></InputGroupAddon>
 *   <InputGroupInput placeholder="Search" />
 *   <InputGroupAddon align="inline-end">
 *     <InputGroupButton onPress={clear}>Clear</InputGroupButton>
 *   </InputGroupAddon>
 * </InputGroup>
 * ```
 *
 * The ring is drawn by the group and keyed off `:has()`, so focusing the
 * control lights the whole thing up and there is one outline rather than two.
 * That is why `<InputGroupInput>` exists instead of a bare `<Input>`: it
 * carries the `data-slot="input-group-control"` the group looks for.
 */
export function InputGroup(props: Incoming<InputGroupProps>) {
  return (
    <div
      {...uiProps("input-group", root, props)}
      role={props.role?.() ?? "group"}
      data-disabled={props.isDisabled?.() === true ? "" : undefined}
    >
      {props.children}
    </div>
  );
}

export interface InputGroupAddonProps extends UiProps {
  /** Which edge it sits on. `block-*` puts it on its own row. @default "inline-start" */
  align?: InputGroupAlign;
}

/**
 * A press on the padding moves focus to the control, the way a click on an
 * input's own padding does. A press on a button inside is that button's.
 */
export function InputGroupAddon(props: Incoming<InputGroupAddonProps>) {
  return (
    <div
      {...uiProps("input-group-addon", addon, props)}
      role={props.role?.() ?? "group"}
      data-align={props.align?.() ?? "inline-start"}
      onClick={(event: MouseEvent) => {
        props.onClick?.()?.(event);
        const target = event.target as HTMLElement | null;
        if (target !== null && target.closest("button") !== null) return;
        const group = (event.currentTarget as HTMLElement).parentElement;
        group?.querySelector<HTMLElement>("input, textarea")?.focus();
      }}
    >
      {props.children}
    </div>
  );
}

export interface InputGroupButtonProps extends Omit<ButtonProps, "size"> {
  /** @default "xs" */
  size?: InputGroupButtonSize;
  /** @default "ghost" */
  variant?: ButtonVariant;
  "data-slot"?: string;
}

/** A `<Button>` sized to sit inside the border rather than beside it. */
export function InputGroupButton(props: Incoming<InputGroupButtonProps>) {
  return (
    <Button
      {...props}
      data-slot={props["data-slot"]?.() ?? "input-group-button"}
      variant={props.variant?.() ?? "ghost"}
      size={props.size?.() ?? "xs"}
      class={ui(
        inputGroupButtonVariants({ size: props.size?.() }),
        props.class?.(),
        props.className?.(),
      )}
    />
  );
}

/** A word inside the border: a unit, a currency, a domain. */
export function InputGroupText(props: Incoming<UiProps>) {
  return <span {...uiProps("input-group-text", label, props)}>{props.children}</span>;
}

export interface InputGroupInputProps extends InputProps {}

export function InputGroupInput(props: Incoming<InputGroupInputProps>) {
  return (
    <Input
      {...props}
      data-slot={props["data-slot"]?.() ?? "input-group-control"}
      class={ui(control, props.class?.(), props.className?.())}
    />
  );
}

export interface InputGroupTextareaProps extends TextareaProps {}

export function InputGroupTextarea(props: Incoming<InputGroupTextareaProps>) {
  return (
    <Textarea
      {...props}
      data-slot={props["data-slot"]?.() ?? "input-group-control"}
      class={ui(controlTextarea, props.class?.(), props.className?.())}
    />
  );
}
