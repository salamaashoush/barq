import { Button as AriaButton, type ButtonComponentProps } from "@barqjs/aria/button";
import { Link as AriaLink } from "@barqjs/aria/link";
import { Show, type Incoming } from "@barqjs/core";
import { layer, variants } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { icon } from "../lib/shared-icon.ts";
import { ring } from "../lib/shared-ring.ts";
import { text } from "../lib/shared-text.ts";

const ui = layer("barq.ui");

export type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";

export type ButtonSize =
  | "default"
  | "xs"
  | "sm"
  | "lg"
  | "icon"
  | "icon-xs"
  | "icon-sm"
  | "icon-lg";

/**
 * The classes, without the component.
 *
 * shadcn reaches for Radix's `Slot` and `asChild` when a button has to be an
 * `<a>`; this hands the classes over instead, which needs no runtime and no
 * cloning of anyone's element:
 *
 * ```tsx
 * <a href="/pricing" class={buttonVariants({ variant: "outline" })}>Pricing</a>
 * ```
 */
export const buttonVariants = variants({
  base: ui(
    text.sm,
    text.medium,
    box.transition,
    box.outline,
    ring.focus,
    ring.invalid,
    ring.invalidDark,
    icon.plain,
    icon.sized,
    // `group/button` is a marker class, not a utility: upstream's styles compile
    // to `.group\/button:has(…)`, so it has to be the literal string.
    "group/button",
    {
      display: "inline-flex",
      flexShrink: "0",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "var(--radius)",
      borderStyle: "var(--ui-border-style)",
      borderWidth: "1px",
      borderColor: "transparent",
      backgroundClip: "padding-box",
      whiteSpace: "nowrap",
      transitionProperty: "all",
      "-webkit-user-select": "none",
      userSelect: "none",
      // A button that opens something must not nudge, or the menu it anchors
      // moves with it.
      ":active:not([aria-haspopup])": {
        "--ui-translate-y": "1px",
        translate: "var(--ui-translate-x) var(--ui-translate-y)",
      },
      ":disabled": {
        pointerEvents: "none",
        opacity: "50%",
      },
      // An `<a>` has no `:disabled`, so a button that is a link dims by the
      // state it announces.
      '[aria-disabled="true"]': {
        pointerEvents: "none",
        opacity: "50%",
      },
      // `ring.invalidDark` carries the ring colour and not the border, and
      // upstream's button asks for both (`dark:aria-invalid:border-destructive/50`).
      ':is(.dark *)[aria-invalid="true"]': {
        borderColor: "var(--destructive)",
        "@supports (color: color-mix(in lab, red, red))": {
          borderColor: "color-mix(in oklab, var(--destructive) 50%, transparent)",
        },
      },
    },
  ),
  variants: {
    variant: {
      default: ui({
        backgroundColor: "var(--primary)",
        color: "var(--primary-foreground)",
        "@media (hover: hover)": {
          ":hover": {
            backgroundColor: "var(--primary)",
          },
          "@supports (color: color-mix(in lab, red, red))": {
            ":hover": {
              backgroundColor: "color-mix(in oklab, var(--primary) 80%, transparent)",
            },
          },
        },
      }),
      destructive: ui({
        backgroundColor: "var(--destructive)",
        color: "var(--destructive)",
        "@supports (color: color-mix(in lab, red, red))": {
          backgroundColor: "color-mix(in oklab, var(--destructive) 10%, transparent)",
        },
        "@media (hover: hover)": {
          ":hover": {
            backgroundColor: "var(--destructive)",
          },
          "@supports (color: color-mix(in lab, red, red))": {
            ":hover": {
              backgroundColor: "color-mix(in oklab, var(--destructive) 20%, transparent)",
            },
            ":is(.dark *):hover": {
              backgroundColor: "color-mix(in oklab, var(--destructive) 30%, transparent)",
            },
          },
          ":is(.dark *):hover": {
            backgroundColor: "var(--destructive)",
          },
        },
        ":focus-visible": {
          borderColor: "var(--destructive)",
          "--ui-ring-color": "var(--destructive)",
          "@supports (color: color-mix(in lab, red, red))": {
            borderColor: "color-mix(in oklab, var(--destructive) 40%, transparent)",
            "--ui-ring-color": "color-mix(in oklab, var(--destructive) 20%, transparent)",
          },
        },
        ":is(.dark *)": {
          backgroundColor: "var(--destructive)",
          "@supports (color: color-mix(in lab, red, red))": {
            backgroundColor: "color-mix(in oklab, var(--destructive) 20%, transparent)",
          },
        },
        ":is(.dark *):focus-visible": {
          "--ui-ring-color": "var(--destructive)",
          "@supports (color: color-mix(in lab, red, red))": {
            "--ui-ring-color": "color-mix(in oklab, var(--destructive) 40%, transparent)",
          },
        },
      }),
      outline: ui({
        borderColor: "var(--border)",
        backgroundColor: "var(--background)",
        "@media (hover: hover)": {
          ":hover": {
            backgroundColor: "var(--muted)",
            color: "var(--foreground)",
          },
          ":is(.dark *):hover": {
            backgroundColor: "var(--input)",
          },
          "@supports (color: color-mix(in lab, red, red))": {
            ":is(.dark *):hover": {
              backgroundColor: "color-mix(in oklab, var(--input) 50%, transparent)",
            },
          },
        },
        '[aria-expanded="true"]': {
          backgroundColor: "var(--muted)",
          color: "var(--foreground)",
        },
        ":is(.dark *)": {
          borderColor: "var(--input)",
          backgroundColor: "var(--input)",
          "@supports (color: color-mix(in lab, red, red))": {
            backgroundColor: "color-mix(in oklab, var(--input) 30%, transparent)",
          },
        },
      }),
      secondary: ui({
        backgroundColor: "var(--secondary)",
        color: "var(--secondary-foreground)",
        "@media (hover: hover)": {
          ":hover": {
            backgroundColor: "var(--secondary)",
          },
          "@supports (color: color-mix(in lab, red, red))": {
            ":hover": {
              backgroundColor: "color-mix(in oklch,var(--secondary),var(--foreground) 5%)",
            },
          },
        },
        '[aria-expanded="true"]': {
          backgroundColor: "var(--secondary)",
          color: "var(--secondary-foreground)",
        },
      }),
      ghost: ui({
        "@media (hover: hover)": {
          ":hover": {
            backgroundColor: "var(--muted)",
            color: "var(--foreground)",
          },
          ":is(.dark *):hover": {
            backgroundColor: "var(--muted)",
          },
          "@supports (color: color-mix(in lab, red, red))": {
            ":is(.dark *):hover": {
              backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
            },
          },
        },
        '[aria-expanded="true"]': {
          backgroundColor: "var(--muted)",
          color: "var(--foreground)",
        },
      }),
      link: ui({
        color: "var(--primary)",
        textUnderlineOffset: "4px",
        "@media (hover: hover)": {
          ":hover": {
            textDecorationLine: "underline",
          },
        },
      }),
    },
    size: {
      default: ui({
        height: "calc(var(--spacing) * 8)",
        gap: "calc(var(--spacing) * 1.5)",
        paddingInline: "calc(var(--spacing) * 2.5)",
        ':has([data-icon="inline-end"])': {
          paddingInlineEnd: "calc(var(--spacing) * 2)",
        },
        ':has([data-icon="inline-start"])': {
          paddingInlineStart: "calc(var(--spacing) * 2)",
        },
      }),
      xs: ui({
        height: "calc(var(--spacing) * 6)",
        gap: "var(--spacing)",
        borderRadius: "min(var(--radius-md), 10px)",
        paddingInline: "calc(var(--spacing) * 2)",
        fontSize: "var(--text-xs)",
        lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
        ':where([data-slot="button-group"]) &': {
          borderRadius: "var(--radius)",
        },
        ':has([data-icon="inline-end"])': {
          paddingInlineEnd: "calc(var(--spacing) * 1.5)",
        },
        ':has([data-icon="inline-start"])': {
          paddingInlineStart: "calc(var(--spacing) * 1.5)",
        },
        "& svg:not([class*='size-'])": {
          width: "calc(var(--spacing) * 3)",
          height: "calc(var(--spacing) * 3)",
        },
      }),
      sm: ui({
        height: "calc(var(--spacing) * 7)",
        gap: "var(--spacing)",
        borderRadius: "min(var(--radius-md), 12px)",
        paddingInline: "calc(var(--spacing) * 2.5)",
        fontSize: "0.8rem",
        ':where([data-slot="button-group"]) &': {
          borderRadius: "var(--radius)",
        },
        ':has([data-icon="inline-end"])': {
          paddingInlineEnd: "calc(var(--spacing) * 1.5)",
        },
        ':has([data-icon="inline-start"])': {
          paddingInlineStart: "calc(var(--spacing) * 1.5)",
        },
        "& svg:not([class*='size-'])": {
          width: "calc(var(--spacing) * 3.5)",
          height: "calc(var(--spacing) * 3.5)",
        },
      }),
      lg: ui({
        height: "calc(var(--spacing) * 9)",
        gap: "calc(var(--spacing) * 1.5)",
        paddingInline: "calc(var(--spacing) * 2.5)",
        ':has([data-icon="inline-end"])': {
          paddingInlineEnd: "calc(var(--spacing) * 2)",
        },
        ':has([data-icon="inline-start"])': {
          paddingInlineStart: "calc(var(--spacing) * 2)",
        },
      }),
      icon: ui({
        width: "calc(var(--spacing) * 8)",
        height: "calc(var(--spacing) * 8)",
      }),
      "icon-xs": ui({
        width: "calc(var(--spacing) * 6)",
        height: "calc(var(--spacing) * 6)",
        borderRadius: "min(var(--radius-md), 10px)",
        ':where([data-slot="button-group"]) &': {
          borderRadius: "var(--radius)",
        },
        "& svg:not([class*='size-'])": {
          width: "calc(var(--spacing) * 3)",
          height: "calc(var(--spacing) * 3)",
        },
      }),
      "icon-sm": ui({
        width: "calc(var(--spacing) * 7)",
        height: "calc(var(--spacing) * 7)",
        borderRadius: "min(var(--radius-md), 12px)",
        ':where([data-slot="button-group"]) &': {
          borderRadius: "var(--radius)",
        },
      }),
      "icon-lg": ui({
        width: "calc(var(--spacing) * 9)",
        height: "calc(var(--spacing) * 9)",
      }),
    },
  },
  defaults: { variant: "default", size: "default" },
});

export interface ButtonProps extends ButtonComponentProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** The element's own word for `isDisabled`, which is the one upstream's callers write. */
  disabled?: boolean;
  /**
   * Renders an `<a>` wearing the button's classes, pressed the same way.
   *
   * What upstream's `asChild` around an `<a>` is for. `ref` is typed for a
   * `<button>` and is not handed the anchor.
   */
  href?: string;
  target?: string;
  rel?: string;
  /** Renames the slot, for a wrapper that is a button and answers to another name. */
  "data-slot"?: string;
}

/**
 * ```tsx
 * <Button variant="outline" size="sm" onPress={() => save()}>Save</Button>
 * ```
 *
 * The press comes from `@barqjs/aria`, so it begins on pointer-down, cancels
 * when the pointer leaves, and does not wait for a click on touch.
 */
export function Button(props: Incoming<ButtonProps>) {
  const className = (): string =>
    ui(
      buttonVariants({ variant: props.variant?.(), size: props.size?.() }),
      props.class?.(),
      props.className?.(),
    );
  const isDisabled = (): boolean | undefined => props.isDisabled?.() ?? props.disabled?.();
  const { ref: _, ...link } = props;

  return (
    <Show
      when={props.href?.() !== undefined}
      fallback={
        <AriaButton
          {...props}
          isDisabled={isDisabled()}
          data-slot={props["data-slot"]?.() ?? "button"}
          data-variant={props.variant?.() ?? "default"}
          data-size={props.size?.() ?? "default"}
          class={className()}
        />
      }
    >
      <AriaLink
        {...link}
        isDisabled={isDisabled()}
        data-slot={props["data-slot"]?.() ?? "button"}
        data-variant={props.variant?.() ?? "default"}
        data-size={props.size?.() ?? "default"}
        class={className()}
      />
    </Show>
  );
}
