import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import { shared } from "../lib/shared.ts";
import { uiVariants } from "../lib/atoms.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Button, type ButtonProps, type ButtonVariant } from "./button.tsx";
import { Input, Textarea, type InputProps, type TextareaProps } from "./input.tsx";

const ui = layer("barq.ui");

const root = ui(
  shared.border,
  shared.shadow,
  shared.transition,
  shared.outlineNone,
  shared.darkInput,
  {
    position: "relative",
    display: "flex",
    height: "calc(var(--spacing) * 9)",
    width: "100%",
    minWidth: "0px",
    alignItems: "center",
    borderRadius: "calc(var(--radius) - 2px)",
    borderColor: "var(--input)",
    "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
    transitionProperty: "color, box-shadow",
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
      paddingRight: "calc(var(--spacing) * 2)",
    },
    ':has(> [data-align="inline-start"]) > input': {
      paddingLeft: "calc(var(--spacing) * 2)",
    },
  },
);

export type InputGroupAlign = "inline-start" | "inline-end" | "block-start" | "block-end";

export const inputGroupAddonVariants = uiVariants({
  base: ui(shared.textSm, shared.fontMedium, shared.noSelect, {
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
  }),
  variants: {
    align: {
      "inline-start": ui({
        order: "-9999",
        paddingLeft: "calc(var(--spacing) * 3)",
        ":has(> button)": {
          marginLeft: "-0.45rem",
        },
        ":has(> kbd)": {
          marginLeft: "-0.35rem",
        },
      }),
      "inline-end": ui({
        order: "9999",
        paddingRight: "calc(var(--spacing) * 3)",
        ":has(> button)": {
          marginRight: "-0.45rem",
        },
        ":has(> kbd)": {
          marginRight: "-0.35rem",
        },
      }),
      "block-start": ui({
        order: "-9999",
        width: "100%",
        justifyContent: "flex-start",
        paddingInline: "calc(var(--spacing) * 3)",
        paddingTop: "calc(var(--spacing) * 3)",
        '[data-slot="input-group"]:has(> input) &': {
          paddingTop: "calc(var(--spacing) * 2.5)",
        },
      }),
      "block-end": ui({
        order: "9999",
        width: "100%",
        justifyContent: "flex-start",
        paddingInline: "calc(var(--spacing) * 3)",
        paddingBottom: "calc(var(--spacing) * 3)",
        '[data-slot="input-group"]:has(> input) &': {
          paddingBottom: "calc(var(--spacing) * 2.5)",
        },
      }),
    },
  },
  defaults: { align: "inline-start" },
});

export type InputGroupButtonSize = "xs" | "sm" | "icon-xs" | "icon-sm";

export const inputGroupButtonVariants = uiVariants({
  base: ui(shared.textSm, shared.shadow, {
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
        borderRadius: "calc(var(--radius) - 5px)",
        paddingInline: "calc(var(--spacing) * 2)",
        ":has(> svg)": {
          paddingInline: "calc(var(--spacing) * 2)",
        },
        '& > svg:not([class*="size-"])': {
          width: "calc(var(--spacing) * 3.5)",
          height: "calc(var(--spacing) * 3.5)",
        },
      }),
      sm: ui({
        height: "calc(var(--spacing) * 8)",
        gap: "calc(var(--spacing) * 1.5)",
        borderRadius: "calc(var(--radius) - 2px)",
        paddingInline: "calc(var(--spacing) * 2.5)",
        ":has(> svg)": {
          paddingInline: "calc(var(--spacing) * 2.5)",
        },
      }),
      "icon-xs": ui({
        width: "calc(var(--spacing) * 6)",
        height: "calc(var(--spacing) * 6)",
        borderRadius: "calc(var(--radius) - 5px)",
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

const text = ui(shared.textSm, shared.svgSize, {
  display: "flex",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  color: "var(--muted-foreground)",
  "& svg": {
    pointerEvents: "none",
  },
});

const control = ui(shared.shadow, {
  flex: "1",
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

const controlTextarea = ui(shared.shadow, {
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
  const className = (): string => inputGroupAddonVariants({ align: props.align?.() });
  return (
    <div
      {...uiProps("input-group-addon", className, props)}
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
  return <span {...uiProps("input-group-text", text, props)}>{props.children}</span>;
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
