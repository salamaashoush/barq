import type { Incoming } from "@barqjs/core";
import { layer, variants } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { icon } from "../lib/shared-icon.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Separator, type SeparatorProps } from "./separator.tsx";

const ui = layer("barq.ui");

export type ButtonGroupOrientation = "horizontal" | "vertical";

export const buttonGroupVariants = variants({
  base: ui({
    display: "flex",
    width: "fit-content",
    alignItems: "stretch",
    ':has(> [data-slot="button-group"])': {
      gap: "calc(var(--spacing) * 2)",
    },
    "& > *:focus-visible": {
      position: "relative",
      zIndex: "10",
    },
    ':has(> select[aria-hidden="true"]:last-child) > [data-slot="select-trigger"]:last-of-type': {
      borderTopRightRadius: "calc(var(--radius) - 2px)",
      borderBottomRightRadius: "calc(var(--radius) - 2px)",
    },
    '& > [data-slot="select-trigger"]:not([class*="w-"])': {
      width: "fit-content",
    },
    "& > input": {
      flex: "1",
    },
  }),
  variants: {
    orientation: {
      horizontal: ui({
        "& > :not(:first-child)": {
          borderTopLeftRadius: "0",
          borderBottomLeftRadius: "0",
          borderLeftStyle: "var(--ui-border-style)",
          borderLeftWidth: "0px",
        },
        "& > :not(:last-child)": {
          borderTopRightRadius: "0",
          borderBottomRightRadius: "0",
        },
      }),
      vertical: ui({
        flexDirection: "column",
        "& > :not(:first-child)": {
          borderTopLeftRadius: "0",
          borderTopRightRadius: "0",
          borderTopStyle: "var(--ui-border-style)",
          borderTopWidth: "0px",
        },
        "& > :not(:last-child)": {
          borderBottomRightRadius: "0",
          borderBottomLeftRadius: "0",
        },
      }),
    },
  },
  defaults: { orientation: "horizontal" },
});

const label = ui(box.border, text.sm, text.medium, box.shadow, icon.sized, {
  display: "flex",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  borderRadius: "calc(var(--radius) - 2px)",
  backgroundColor: "var(--muted)",
  paddingInline: "calc(var(--spacing) * 4)",
  "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
  "& svg": {
    pointerEvents: "none",
  },
});

const separator = ui({
  position: "relative",
  margin: "0px !important",
  alignSelf: "stretch",
  backgroundColor: "var(--input)",
  '[data-orientation="vertical"]': {
    height: "auto",
  },
});

export interface ButtonGroupProps extends UiProps {
  /** @default "horizontal" */
  orientation?: ButtonGroupOrientation;
}

/**
 * Buttons welded into one control: the inner corners are squared and the
 * shared borders collapse.
 *
 * ```tsx
 * <ButtonGroup>
 *   <Button variant="outline">Day</Button>
 *   <Button variant="outline">Week</Button>
 *   <Button variant="outline">Month</Button>
 * </ButtonGroup>
 * ```
 *
 * The rules select `& > *`, so anything with a border joins the seam: a
 * `<Button>`, a `<ButtonGroupText>`, a `<Select>`'s trigger, an `<Input>`.
 */
export function ButtonGroup(props: Incoming<ButtonGroupProps>) {
  const className = (): string => buttonGroupVariants({ orientation: props.orientation?.() });
  return (
    <div
      {...uiProps("button-group", className, props)}
      role={props.role?.() ?? "group"}
      data-orientation={props.orientation?.() ?? "horizontal"}
    >
      {props.children}
    </div>
  );
}

/** A label welded into the group: a unit, a prefix, an icon that is not a button. */
export function ButtonGroupText(props: Incoming<UiProps>) {
  return <div {...uiProps("button-group-text", label, props)}>{props.children}</div>;
}

export interface ButtonGroupSeparatorProps extends SeparatorProps {}

/** The line between two segments. Vertical by default, which is what a row of buttons wants. */
export function ButtonGroupSeparator(props: Incoming<ButtonGroupSeparatorProps>) {
  return (
    <Separator
      {...props}
      data-slot={props["data-slot"]?.() ?? "button-group-separator"}
      orientation={props.orientation?.() ?? "vertical"}
      class={ui(separator, props.class?.(), props.className?.())}
    />
  );
}
