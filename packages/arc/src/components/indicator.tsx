import { type Child, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { numberFormatter } from "@barqjs/aria/i18n";
import { contrast } from "@barqjs/ui/shared-contrast";
import { srOnly } from "@barqjs/ui/sr-only";
import { tokens } from "@barqjs/ui/theme/tokens";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, fg, layout, rounded, space, tone as tones, type } from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { useArcMessages } from "./messages.ts";
import { statusVariants } from "./status.tsx";

export const indicatorStyles = variants({
  slots: {
    root: arc(layout.inlineRow, layout.relative, { verticalAlign: "middle" }),
    badge: arc(layout.inlineCentre, layout.noShrink, rounded.full, type.numeric, contrast.edge, {
      boxSizing: "border-box",
      fontWeight: "var(--font-weight-semibold)",
      lineHeight: "1",
    }),
    label: arc(srOnly),
  },
  variants: {
    tone: {
      success: { badge: tones.success },
      warning: { badge: tones.warning },
      danger: { badge: tones.danger },
      info: { badge: tones.info },
      neutral: { badge: tones.neutral },
    },
    variant: {
      solid: { badge: arc(bg.toneSolid, { color: tokens.background }) },
      subtle: { badge: arc(bg.tone, fg.tone) },
    },
    size: {
      sm: { badge: arc({ minWidth: space.x4, height: space.x4, fontSize: "0.625rem" }) },
      md: { badge: arc(type.xs, { minWidth: space.x5, height: space.x5 }) },
    },
    dot: {
      true: { badge: arc(statusVariants().dot, { minWidth: "0px" }) },
      false: { badge: arc({ paddingInline: space.x1 }) },
    },
    anchored: {
      true: {
        badge: arc({
          position: "absolute",
          insetBlockStart: "0",
          insetInlineEnd: "0",
          translate: "50% -50%",
          boxShadow: `0 0 0 2px ${tokens.background}`,
          ":dir(rtl)": { translate: "-50% -50%" },
        }),
      },
      false: {},
    },
  },
  defaults: { tone: "neutral", variant: "solid", size: "md", dot: false, anchored: false },
});

type Slots = ReturnType<typeof indicatorStyles>;

export interface IndicatorProps extends Customisable<Slots> {
  /** A number to show. Zero shows nothing unless `showZero`. */
  count?: number;
  /** Past it, the count is written `99+`. @default 99 */
  max?: number;
  showZero?: boolean;
  /** A dot with no number: something new. */
  dot?: boolean;
  /** @default "neutral" */
  tone?: Tone;
  /** @default "solid" */
  variant?: "solid" | "subtle";
  /** @default "md" */
  size?: "sm" | "md";
  /**
   * What it pins to: an icon, an avatar, a button. The badge sits on its
   * top corner at the reading direction's end.
   */
  children?: Child;
  /**
   * The words a screen reader hears, since a dot or a number on an icon says
   * nothing alone. @default "New", or "3 new", from arc's words, when it pins
   * to something
   */
  label?: string;
  id?: string;
}

/**
 * A count or a dot, on its own or pinned to the corner of something.
 *
 * ```tsx
 * <Indicator count={3} />
 * <Indicator count={unread()} tone="danger"><Bell /></Indicator>
 * <Indicator dot tone="success"><Avatar … /></Indicator>
 * ```
 *
 * The number is written in the locale's digits and capped at `max` (`99+`).
 * Pinned to something it carries words for a screen reader, `label` or arc's
 * "3 new"; on its own beside a label, the number reads as it is.
 */
export function Indicator(props: IndicatorProps) {
  const messages = useArcMessages();
  const format = numberFormatter();
  const anchored = (): boolean => props.children !== undefined;
  const dot = (): boolean => props.dot === true;
  const shown = (): boolean =>
    dot() || (props.count !== undefined && (props.count > 0 || props.showZero === true));
  const written = (): string => {
    const count = props.count ?? 0;
    const max = props.max ?? 99;
    return count > max ? `${format().format(max)}+` : format().format(count);
  };
  const words = (): string | undefined => {
    if (props.label !== undefined) return props.label;
    if (!anchored()) return undefined;
    return dot() ? messages().newItem : messages().newCount(written());
  };
  const cls = (): Slots =>
    parts(
      indicatorStyles({
        tone: props.tone,
        variant: props.variant,
        size: props.size,
        dot: dot(),
        anchored: anchored(),
      }),
      props.classes,
    );
  return (
    <span
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="indicator"
      data-tone={props.tone ?? "neutral"}
    >
      {props.children}
      <Show when={shown()}>
        <span
          class={cls().badge}
          data-slot="indicator-badge"
          aria-hidden={words() === undefined ? undefined : "true"}
        >
          {dot() ? "" : written()}
        </span>
        <Show when={words() !== undefined}>
          <span class={cls().label} data-slot="indicator-label">
            {words()}
          </span>
        </Show>
      </Show>
    </span>
  );
}
