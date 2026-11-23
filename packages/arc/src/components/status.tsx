import { type Child, cells } from "@barqjs/core";
import { keyframes, variants } from "@barqjs/css";
import type { UiProps } from "@barqjs/ui/props";
import { uiProps } from "@barqjs/ui/slot";

import { arcLayer as arc } from "../layer.ts";
import type { Tone } from "../theme/tokens.ts";

export type StatusVariant = "dot" | "subtle" | "solid";

const toneVars = (name: Tone) => ({
  "--arc-tone": `var(--${name})`,
  "--arc-tone-foreground": `var(--${name}-foreground)`,
  "--arc-tone-subtle": `var(--${name}-subtle)`,
});

export const statusVariants = variants({
  base: arc({
    display: "inline-flex",
    alignItems: "center",
    gap: "calc(var(--spacing) * 1.5)",
    fontSize: "var(--text-sm)",
    lineHeight: "var(--text-sm--line-height)",
    fontWeight: "var(--font-weight-medium)",
    whiteSpace: "nowrap",
    color: "var(--arc-tone-foreground)",
  }),
  variants: {
    tone: {
      success: arc(toneVars("success")),
      warning: arc(toneVars("warning")),
      danger: arc(toneVars("danger")),
      info: arc(toneVars("info")),
      neutral: arc(toneVars("neutral")),
    },
    variant: {
      dot: arc({}),
      subtle: arc({
        borderRadius: "calc(var(--radius) * 2)",
        paddingInline: "calc(var(--spacing) * 2)",
        paddingBlock: "calc(var(--spacing) * 0.5)",
        backgroundColor: "var(--arc-tone-subtle)",
        fontSize: "var(--text-xs)",
      }),
      solid: arc({
        borderRadius: "calc(var(--radius) * 2)",
        paddingInline: "calc(var(--spacing) * 2)",
        paddingBlock: "calc(var(--spacing) * 0.5)",
        backgroundColor: "var(--arc-tone)",
        color: "var(--background)",
        fontSize: "var(--text-xs)",
      }),
    },
  },
  defaults: { tone: "neutral", variant: "dot" },
});

const pulse = keyframes`
  from {
    transform: scale(1);
    opacity: 0.6;
  }
  to {
    transform: scale(2.4);
    opacity: 0;
  }
`;

const dot = arc({
  position: "relative",
  display: "inline-block",
  width: "calc(var(--spacing) * 2)",
  height: "calc(var(--spacing) * 2)",
  flexShrink: "0",
  borderRadius: "9999px",
  backgroundColor: "var(--arc-tone)",
  "[data-variant=solid] > &": { backgroundColor: "currentColor" },
  "&[data-pulse]::after": {
    content: '""',
    position: "absolute",
    inset: "0",
    borderRadius: "inherit",
    backgroundColor: "inherit",
    animationName: pulse,
    animationDuration: "1.6s",
    animationTimingFunction: "var(--ease-standard)",
    animationIterationCount: "infinite",
  },
  "@media (prefers-reduced-motion: reduce)": {
    "&[data-pulse]::after": { animationName: "none" },
  },
});

export interface StatusProps extends UiProps {
  /** @default "neutral" */
  tone?: Tone;
  /** A dot and a label, a tinted pill, or a filled one. @default "dot" */
  variant?: StatusVariant;
  /** A ring that pulses out of the dot, for something live. Still under reduced motion. */
  pulse?: boolean;
  /** The label. The tone is never the only signal: say what it means in words. */
  children?: Child;
}

/**
 * A state in a word and a colour: `Operational`, `Degraded`, `Down`.
 *
 * ```tsx
 * <Status tone="success">Operational</Status>
 * <Status tone="danger" variant="subtle" pulse>Down</Status>
 * ```
 */
export function Status(props: StatusProps) {
  const className = (): string => statusVariants({ tone: props.tone, variant: props.variant });
  return (
    <span
      {...uiProps("status", className, cells(props))}
      data-tone={props.tone ?? "neutral"}
      data-variant={props.variant ?? "dot"}
    >
      <span
        class={dot}
        data-slot="status-dot"
        data-pulse={props.pulse ? "" : undefined}
        aria-hidden="true"
      />
      {props.children}
    </span>
  );
}
