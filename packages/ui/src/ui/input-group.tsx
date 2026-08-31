import type { Incoming } from "@barqjs/core";
import { clsx, css, variants } from "@barqjs/css";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Button, type ButtonProps, type ButtonVariant } from "./button.tsx";
import { Input, Textarea, type InputProps, type TextareaProps } from "./input.tsx";

const root = css`
  @layer barq.ui {
    position: relative;
    display: flex;
    height: calc(var(--spacing) * 9);
    width: 100%;
    min-width: 0px;
    align-items: center;
    border-radius: calc(var(--radius) - 2px);
    border-style: var(--ui-border-style);
    border-width: 1px;
    border-color: var(--input);
    --ui-shadow: 0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05));
    box-shadow:
      var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
      var(--ui-ring-shadow), var(--ui-shadow);
    transition-property: color, box-shadow;
    transition-timing-function: var(--ui-ease, var(--default-transition-timing-function));
    transition-duration: var(--ui-duration, var(--default-transition-duration));
    --ui-outline-style: none;
    outline-style: none;
    &:has(:is([data-slot="input-group-control"]:focus-visible)) {
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
    &:has(:is([data-slot][aria-invalid="true"])) {
      border-color: var(--destructive);
      --ui-ring-color: var(--destructive);
      @supports (color: color-mix(in lab, red, red)) {
        --ui-ring-color: color-mix(in oklab, var(--destructive) 20%, transparent);
      }
    }
    &:has(> [data-align="block-end"]) {
      height: auto;
      flex-direction: column;
    }
    &:has(> [data-align="block-start"]) {
      height: auto;
      flex-direction: column;
    }
    &:has(> textarea) {
      height: auto;
    }
    &:is(.dark *) {
      background-color: var(--input);
      @supports (color: color-mix(in lab, red, red)) {
        background-color: color-mix(in oklab, var(--input) 30%, transparent);
      }
    }
    &:is(.dark *):has(:is([data-slot][aria-invalid="true"])) {
      --ui-ring-color: var(--destructive);
      @supports (color: color-mix(in lab, red, red)) {
        --ui-ring-color: color-mix(in oklab, var(--destructive) 40%, transparent);
      }
    }
    &:has(> [data-align="block-end"]) > input {
      padding-top: calc(var(--spacing) * 3);
    }
    &:has(> [data-align="block-start"]) > input {
      padding-bottom: calc(var(--spacing) * 3);
    }
    &:has(> [data-align="inline-end"]) > input {
      padding-right: calc(var(--spacing) * 2);
    }
    &:has(> [data-align="inline-start"]) > input {
      padding-left: calc(var(--spacing) * 2);
    }
  }
`;

export type InputGroupAlign = "inline-start" | "inline-end" | "block-start" | "block-end";

export const inputGroupAddonVariants = variants({
  base: css`
    @layer barq.ui {
      display: flex;
      height: auto;
      cursor: text;
      align-items: center;
      justify-content: center;
      gap: calc(var(--spacing) * 2);
      padding-block: calc(var(--spacing) * 1.5);
      font-size: var(--text-sm);
      line-height: var(--ui-leading, var(--text-sm--line-height));
      --ui-font-weight: var(--font-weight-medium);
      font-weight: var(--font-weight-medium);
      color: var(--muted-foreground);
      -webkit-user-select: none;
      user-select: none;
      & > kbd {
        border-radius: calc(var(--radius) - 5px);
      }
      & > svg:not([class*="size-"]) {
        width: calc(var(--spacing) * 4);
        height: calc(var(--spacing) * 4);
      }
      [data-slot="input-group"][data-disabled] & {
        opacity: 50%;
      }
    }
  `,
  variants: {
    align: {
      "inline-start": css`
        @layer barq.ui {
          order: -9999;
          padding-left: calc(var(--spacing) * 3);
          &:has(> button) {
            margin-left: -0.45rem;
          }
          &:has(> kbd) {
            margin-left: -0.35rem;
          }
        }
      `,
      "inline-end": css`
        @layer barq.ui {
          order: 9999;
          padding-right: calc(var(--spacing) * 3);
          &:has(> button) {
            margin-right: -0.45rem;
          }
          &:has(> kbd) {
            margin-right: -0.35rem;
          }
        }
      `,
      "block-start": css`
        @layer barq.ui {
          order: -9999;
          width: 100%;
          justify-content: flex-start;
          padding-inline: calc(var(--spacing) * 3);
          padding-top: calc(var(--spacing) * 3);
          [data-slot="input-group"]:has(> input) & {
            padding-top: calc(var(--spacing) * 2.5);
          }
        }
      `,
      "block-end": css`
        @layer barq.ui {
          order: 9999;
          width: 100%;
          justify-content: flex-start;
          padding-inline: calc(var(--spacing) * 3);
          padding-bottom: calc(var(--spacing) * 3);
          [data-slot="input-group"]:has(> input) & {
            padding-bottom: calc(var(--spacing) * 2.5);
          }
        }
      `,
    },
  },
  defaults: { align: "inline-start" },
});

export type InputGroupButtonSize = "xs" | "sm" | "icon-xs" | "icon-sm";

export const inputGroupButtonVariants = variants({
  base: css`
    @layer barq.ui {
      display: flex;
      align-items: center;
      gap: calc(var(--spacing) * 2);
      font-size: var(--text-sm);
      line-height: var(--ui-leading, var(--text-sm--line-height));
      --ui-shadow: 0 0 #0000;
      box-shadow:
        var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
        var(--ui-ring-shadow), var(--ui-shadow);
    }
  `,
  variants: {
    size: {
      xs: css`
        @layer barq.ui {
          height: calc(var(--spacing) * 6);
          gap: var(--spacing);
          border-radius: calc(var(--radius) - 5px);
          padding-inline: calc(var(--spacing) * 2);
          &:has(> svg) {
            padding-inline: calc(var(--spacing) * 2);
          }
          & > svg:not([class*="size-"]) {
            width: calc(var(--spacing) * 3.5);
            height: calc(var(--spacing) * 3.5);
          }
        }
      `,
      sm: css`
        @layer barq.ui {
          height: calc(var(--spacing) * 8);
          gap: calc(var(--spacing) * 1.5);
          border-radius: calc(var(--radius) - 2px);
          padding-inline: calc(var(--spacing) * 2.5);
          &:has(> svg) {
            padding-inline: calc(var(--spacing) * 2.5);
          }
        }
      `,
      "icon-xs": css`
        @layer barq.ui {
          width: calc(var(--spacing) * 6);
          height: calc(var(--spacing) * 6);
          border-radius: calc(var(--radius) - 5px);
          padding: 0px;
          &:has(> svg) {
            padding: 0px;
          }
        }
      `,
      "icon-sm": css`
        @layer barq.ui {
          width: calc(var(--spacing) * 8);
          height: calc(var(--spacing) * 8);
          padding: 0px;
          &:has(> svg) {
            padding: 0px;
          }
        }
      `,
    },
  },
  defaults: { size: "xs" },
});

const text = css`
  @layer barq.ui {
    display: flex;
    align-items: center;
    gap: calc(var(--spacing) * 2);
    font-size: var(--text-sm);
    line-height: var(--ui-leading, var(--text-sm--line-height));
    color: var(--muted-foreground);
    & svg {
      pointer-events: none;
    }
    & svg:not([class*="size-"]) {
      width: calc(var(--spacing) * 4);
      height: calc(var(--spacing) * 4);
    }
  }
`;

const control = css`
  @layer barq.ui {
    flex: 1;
    border-radius: 0;
    border-style: var(--ui-border-style);
    border-width: 0px;
    background-color: transparent;
    --ui-shadow: 0 0 #0000;
    box-shadow:
      var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
      var(--ui-ring-shadow), var(--ui-shadow);
    &:focus-visible {
      --ui-ring-shadow: var(--ui-ring-inset,) 0 0 0 calc(0px + var(--ui-ring-offset-width))
        var(--ui-ring-color, currentcolor);
      box-shadow:
        var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
        var(--ui-ring-shadow), var(--ui-shadow);
    }
    &:is(.dark *) {
      background-color: transparent;
    }
  }
`;

const controlTextarea = css`
  @layer barq.ui {
    flex: 1;
    resize: none;
    border-radius: 0;
    border-style: var(--ui-border-style);
    border-width: 0px;
    background-color: transparent;
    padding-block: calc(var(--spacing) * 3);
    --ui-shadow: 0 0 #0000;
    box-shadow:
      var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
      var(--ui-ring-shadow), var(--ui-shadow);
    &:focus-visible {
      --ui-ring-shadow: var(--ui-ring-inset,) 0 0 0 calc(0px + var(--ui-ring-offset-width))
        var(--ui-ring-color, currentcolor);
      box-shadow:
        var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
        var(--ui-ring-shadow), var(--ui-shadow);
    }
    &:is(.dark *) {
      background-color: transparent;
    }
  }
`;

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
}

/** A `<Button>` sized to sit inside the border rather than beside it. */
export function InputGroupButton(props: Incoming<InputGroupButtonProps>) {
  return (
    <Button
      {...props}
      data-slot="input-group-button"
      variant={props.variant?.() ?? "ghost"}
      size={props.size?.() ?? "xs"}
      class={clsx(
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
      data-slot="input-group-control"
      class={clsx(control, props.class?.(), props.className?.())}
    />
  );
}

export interface InputGroupTextareaProps extends TextareaProps {}

export function InputGroupTextarea(props: Incoming<InputGroupTextareaProps>) {
  return (
    <Textarea
      {...props}
      data-slot="input-group-control"
      class={clsx(controlTextarea, props.class?.(), props.className?.())}
    />
  );
}
