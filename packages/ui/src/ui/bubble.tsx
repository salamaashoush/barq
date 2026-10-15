import { Show, type Incoming, type JSXElement } from "@barqjs/core";
import { layer, variants } from "@barqjs/css";

import "../theme/layers.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { partRender, uiProps, type RenderPart } from "../lib/slot.ts";

const ui = layer("barq.ui");

export type BubbleVariant =
  | "default"
  | "secondary"
  | "muted"
  | "tinted"
  | "outline"
  | "ghost"
  | "destructive";

export type BubbleAlign = "start" | "end";
export type BubbleSide = "top" | "bottom";

const group = ui({
  display: "flex",
  minWidth: "0px",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 2)",
});

/**
 * The colour is set on the CONTENT from the bubble, not on the bubble.
 *
 * A bubble is a column: the content, and whatever sits under it — a timestamp,
 * a row of reactions. Painting the bubble itself would paint those too, so
 * every variant reaches its child instead.
 */
export const bubbleVariants = variants({
  base: ui({
    position: "relative",
    display: "flex",
    width: "fit-content",
    maxWidth: "80%",
    minWidth: "0px",
    flexDirection: "column",
    gap: "var(--spacing)",
    '&[data-align="end"]': {
      alignSelf: "flex-end",
    },
    '[data-slot="message"][data-align="end"] &': {
      alignSelf: "flex-end",
    },
  }),
  variants: {
    variant: {
      default: ui({
        '& > [data-slot="bubble-content"]': {
          backgroundColor: "var(--primary)",
          color: "var(--primary-foreground)",
        },
        "@media (hover: hover)": {
          '& > [data-slot="bubble-content"]:is(button, a):hover': {
            backgroundColor: "color-mix(in oklab, var(--primary) 80%, transparent)",
          },
        },
      }),
      secondary: ui({
        '& > [data-slot="bubble-content"]': {
          backgroundColor: "var(--secondary)",
          color: "var(--secondary-foreground)",
        },
        "@media (hover: hover)": {
          '& > [data-slot="bubble-content"]:is(button, a):hover': {
            backgroundColor: "color-mix(in oklch, var(--secondary), var(--foreground) 5%)",
          },
        },
      }),
      muted: ui({
        '& > [data-slot="bubble-content"]': {
          backgroundColor: "var(--muted)",
        },
        "@media (hover: hover)": {
          '& > [data-slot="bubble-content"]:is(button, a):hover': {
            backgroundColor: "color-mix(in oklch, var(--muted), var(--foreground) 5%)",
          },
        },
      }),
      tinted: ui({
        '& > [data-slot="bubble-content"]': {
          backgroundColor: "oklch(from var(--primary) 0.93 calc(c * 0.4) h)",
          color: "var(--foreground)",
        },
        '.dark & > [data-slot="bubble-content"]': {
          backgroundColor: "oklch(from var(--primary) 0.3 calc(c * 0.4) h)",
        },
        "@media (hover: hover)": {
          '& > [data-slot="bubble-content"]:is(button, a):hover': {
            backgroundColor: "oklch(from var(--primary) 0.88 calc(c * 0.5) h)",
          },
          '.dark & > [data-slot="bubble-content"]:is(button, a):hover': {
            backgroundColor: "oklch(from var(--primary) 0.35 calc(c * 0.5) h)",
          },
        },
      }),
      outline: ui({
        '& > [data-slot="bubble-content"]': {
          borderColor: "var(--border)",
          backgroundColor: "var(--background)",
        },
        "@media (hover: hover)": {
          '& > [data-slot="bubble-content"]:is(button, a):hover': {
            backgroundColor: "var(--muted)",
            color: "var(--foreground)",
          },
          '.dark & > [data-slot="bubble-content"]:is(button, a):hover': {
            backgroundColor: "color-mix(in oklab, var(--input) 30%, transparent)",
          },
        },
      }),
      ghost: ui({
        maxWidth: "100%",
        borderStyle: "none",
        '& > [data-slot="bubble-content"]': {
          borderRadius: "0px",
          backgroundColor: "transparent",
          padding: "0px",
        },
        "@media (hover: hover)": {
          '& > [data-slot="bubble-content"]:is(button, a):hover': {
            backgroundColor: "var(--muted)",
            color: "var(--foreground)",
          },
          '.dark & > [data-slot="bubble-content"]:is(button, a):hover': {
            backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
          },
        },
      }),
      destructive: ui({
        '& > [data-slot="bubble-content"]': {
          backgroundColor: "color-mix(in oklab, var(--destructive) 10%, transparent)",
          color: "var(--destructive)",
        },
        '.dark & > [data-slot="bubble-content"]': {
          backgroundColor: "color-mix(in oklab, var(--destructive) 20%, transparent)",
        },
        "@media (hover: hover)": {
          '& > [data-slot="bubble-content"]:is(button, a):hover': {
            backgroundColor: "color-mix(in oklab, var(--destructive) 20%, transparent)",
          },
          '.dark & > [data-slot="bubble-content"]:is(button, a):hover': {
            backgroundColor: "color-mix(in oklab, var(--destructive) 30%, transparent)",
          },
        },
      }),
    },
  },
  defaults: { variant: "default" },
});

const content = ui(text.sm, {
  width: "fit-content",
  maxWidth: "100%",
  minWidth: "0px",
  overflow: "hidden",
  borderRadius: "calc(var(--radius) * 1.4)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  borderColor: "transparent",
  paddingInline: "calc(var(--spacing) * 3)",
  paddingBlock: "calc(var(--spacing) * 2)",
  "--ui-leading": "var(--leading-relaxed)",
  lineHeight: "var(--leading-relaxed)",
  overflowWrap: "break-word",
  '[data-slot="bubble"][data-align="end"] &': {
    alignSelf: "flex-end",
  },
  "&:is(button)": {
    textAlign: "left",
  },
  "&:is(button, a)": {
    transitionProperty: "color, background-color, border-color",
    transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
    transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
    outlineStyle: "none",
  },
  "&:is(button, a)[data-focus-visible], &:is(button, a):focus-visible": {
    borderColor: "var(--ring)",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
  },
});

export const bubbleReactionsVariants = variants({
  base: ui(text.sm, {
    position: "absolute",
    zIndex: "10",
    display: "flex",
    width: "fit-content",
    flexShrink: "0",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--spacing)",
    borderRadius: "calc(infinity * 1px)",
    backgroundColor: "var(--muted)",
    paddingInline: "calc(var(--spacing) * 1.5)",
    paddingBlock: "calc(var(--spacing) * 0.5)",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "var(--card)",
    // A row of reaction BUTTONS provides its own padding, so the strip must
    // not add a second one around them.
    "&:has(button)": {
      padding: "0px",
    },
  }),
  variants: {
    side: {
      top: ui({
        top: "0px",
        "--ui-translate-y": "calc(calc(3 / 4 * 100%) * -1)",
        translate: "var(--ui-translate-x) var(--ui-translate-y)",
      }),
      bottom: ui({
        bottom: "0px",
        "--ui-translate-y": "calc(3 / 4 * 100%)",
        translate: "var(--ui-translate-x) var(--ui-translate-y)",
      }),
    },
    align: {
      start: ui({ left: "calc(var(--spacing) * 3)" }),
      end: ui({ right: "calc(var(--spacing) * 3)" }),
    },
  },
  defaults: { side: "bottom", align: "end" },
});

/** A column of bubbles from one side of a conversation. */
export function BubbleGroup(props: Incoming<UiProps>) {
  return <div {...uiProps("bubble-group", group, props)}>{props.children}</div>;
}

export interface BubbleProps extends UiProps {
  /** @default "default" */
  variant?: BubbleVariant;
  /** Which side of the conversation it is on. @default "start" */
  align?: BubbleAlign;
}

/**
 * One turn in a conversation.
 *
 * ```tsx
 * <Bubble align="end">
 *   <BubbleContent>Sounds good</BubbleContent>
 * </Bubble>
 * ```
 */
export function Bubble(props: Incoming<BubbleProps>) {
  return (
    <div
      {...uiProps(
        "bubble",
        () => ui(bubbleVariants({ variant: props.variant?.() }), "group/bubble"),
        props,
      )}
      data-variant={props.variant?.() ?? "default"}
      data-align={props.align?.() ?? "start"}
    >
      {props.children}
    </div>
  );
}

export interface BubbleContentProps extends UiProps {
  /** Turns the painted part into a link. */
  href?: string;
  target?: string;
  rel?: string;
  /** Another element in its place: a `<button>` makes a bubble you can press. */
  render?: RenderPart;
}

/** The painted part. */
export function BubbleContent(props: Incoming<BubbleContentProps>) {
  const render = props.render?.();
  if (render !== undefined) {
    return render(partRender(uiProps("bubble-content", content, props))) as JSXElement;
  }
  return (
    <Show
      when={props.href?.() !== undefined}
      fallback={<div {...uiProps("bubble-content", content, props)}>{props.children}</div>}
    >
      <a
        {...uiProps("bubble-content", content, props)}
        href={props.href?.()}
        target={props.target?.()}
        rel={props.rel?.()}
      >
        {props.children}
      </a>
    </Show>
  );
}

export interface BubbleReactionsProps extends UiProps {
  /** @default "bottom" */
  side?: BubbleSide;
  /** @default "end" */
  align?: BubbleAlign;
}

/** The little strip of emoji hanging off a corner of the bubble. */
export function BubbleReactions(props: Incoming<BubbleReactionsProps>) {
  return (
    <div
      {...uiProps(
        "bubble-reactions",
        () => bubbleReactionsVariants({ side: props.side?.(), align: props.align?.() }),
        props,
      )}
      data-side={props.side?.() ?? "bottom"}
      data-align={props.align?.() ?? "end"}
    >
      {props.children}
    </div>
  );
}
