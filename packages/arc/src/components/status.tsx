import { type Child, cells } from "@barqjs/core";
import { keyframes, variants } from "@barqjs/css";
import { on } from "@barqjs/ui/conditions";
import type { UiProps } from "@barqjs/ui/props";
import { uiProps } from "@barqjs/ui/slot";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  fg,
  gap,
  layout,
  motionTokens,
  rounded,
  space,
  tone as tones,
  type,
} from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";

export type StatusVariant = "dot" | "subtle" | "solid";

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

const pill = arc(rounded.xl, type.xs, { paddingInline: space.x2, paddingBlock: space.x0_5 });

export const statusVariants = variants({
  slots: {
    root: arc(layout.inlineRow, gap[1.5], type.label, fg.tone, { whiteSpace: "nowrap" }),
    dot: arc(layout.relative, layout.noShrink, rounded.full, bg.toneSolid, {
      display: "inline-block",
      width: space.x2,
      height: space.x2,
      "[data-variant=solid] > &": { backgroundColor: "currentColor" },
      "&[data-pulse]::after": {
        content: '""',
        position: "absolute",
        inset: "0",
        borderRadius: "inherit",
        backgroundColor: "inherit",
        animationName: pulse,
        animationDuration: "1.6s",
        animationTimingFunction: motionTokens.standard,
        animationIterationCount: "infinite",
      },
      [on.reducedMotion]: {
        "&[data-pulse]::after": { animationName: "none" },
      },
    }),
  },
  variants: {
    tone: {
      success: { root: tones.success },
      warning: { root: tones.warning },
      danger: { root: tones.danger },
      info: { root: tones.info },
      neutral: { root: tones.neutral },
    },
    variant: {
      dot: {},
      subtle: { root: arc(pill, bg.tone) },
      solid: { root: arc(pill, bg.toneSolid, { color: "var(--background)" }) },
    },
  },
  defaults: { tone: "neutral", variant: "dot" },
});

type Slots = ReturnType<typeof statusVariants>;

export interface StatusProps extends Omit<UiProps, "class" | "className">, Customisable<Slots> {
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
  function cls(): Slots {
    return parts(statusVariants({ tone: props.tone, variant: props.variant }), props.classes);
  }
  return (
    <span
      {...uiProps("status", () => cls().root, cells(props))}
      data-tone={props.tone ?? "neutral"}
      data-variant={props.variant ?? "dot"}
    >
      <span
        class={cls().dot}
        data-slot="status-dot"
        data-pulse={props.pulse ? "" : undefined}
        aria-hidden="true"
      />
      {props.children}
    </span>
  );
}
