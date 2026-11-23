import { type Child, Show, cells, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLocale } from "@barqjs/aria/i18n";
import { Minus } from "@barqjs/lucide/icons/minus";
import { TrendingDown } from "@barqjs/lucide/icons/trending-down";
import { TrendingUp } from "@barqjs/lucide/icons/trending-up";
import type { UiProps } from "@barqjs/ui/props";
import { uiProps } from "@barqjs/ui/slot";

import { arcLayer as arc } from "../layer.ts";
import type { Tone } from "../theme/tokens.ts";

const toneVars = (name: Tone) => ({
  "--arc-tone": `var(--${name})`,
  "--arc-tone-foreground": `var(--${name}-foreground)`,
  "--arc-tone-subtle": `var(--${name}-subtle)`,
});

const tones = variants({
  base: arc({}),
  variants: {
    tone: {
      success: arc(toneVars("success")),
      warning: arc(toneVars("warning")),
      danger: arc(toneVars("danger")),
      info: arc(toneVars("info")),
      neutral: arc(toneVars("neutral")),
    },
  },
  defaults: { tone: "neutral" },
});

const root = arc({
  display: "flex",
  minWidth: "0px",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 1)",
  borderRadius: "calc(var(--radius) * 1.4)",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "var(--border)",
  backgroundColor: "var(--card)",
  color: "var(--card-foreground)",
  padding: "calc(var(--spacing) * 4)",
});

const label = arc({
  margin: "0",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--text-sm--line-height)",
  color: "var(--muted-foreground)",
});

const value = arc({
  margin: "0",
  fontSize: "var(--text-2xl)",
  lineHeight: "var(--text-2xl--line-height)",
  fontWeight: "var(--font-weight-semibold)",
  letterSpacing: "var(--tracking-tight)",
  fontVariantNumeric: "tabular-nums",
});

const footer = arc({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  columnGap: "calc(var(--spacing) * 2)",
  rowGap: "calc(var(--spacing) * 1)",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--text-xs--line-height)",
  color: "var(--muted-foreground)",
});

const delta = arc({
  display: "inline-flex",
  alignItems: "center",
  gap: "calc(var(--spacing) * 1)",
  fontWeight: "var(--font-weight-medium)",
  fontVariantNumeric: "tabular-nums",
  color: "var(--arc-tone-foreground)",
  "& > svg": {
    width: "calc(var(--spacing) * 3.5)",
    height: "calc(var(--spacing) * 3.5)",
    flexShrink: "0",
  },
});

const spark = arc({
  display: "block",
  width: "100%",
  height: "calc(var(--spacing) * 10)",
  marginBlockStart: "calc(var(--spacing) * 2)",
  overflow: "visible",
  color: "var(--arc-tone)",
});

/** The width and height the sparkline is drawn in before it is stretched to its box. */
const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 32;
const INSET = 2;

export interface StatDelta {
  /** The change as the reader should see it, sign included: `"+12%"`. */
  value: Child;
  /** @default "neutral" */
  tone?: Tone;
  /** Which way the arrow points. The value's own sign says it in words. @default "flat" */
  direction?: "up" | "down" | "flat";
  /** What it is measured against, after it: `"from last week"`. */
  label?: Child;
}

export interface StatCardProps extends UiProps {
  label: Child;
  /** Already formatted for the reader: a count, an amount, a duration. */
  value: Child;
  delta?: StatDelta;
  /** A line under the value. */
  description?: Child;
  /** The recent values, oldest first, drawn as a sparkline. */
  trend?: readonly number[];
  /** The sparkline in words. Left out, one is written from the values. */
  trendLabel?: string;
  /** @default the delta's tone, else "info" */
  trendTone?: Tone;
}

/** The two paths of a sparkline over `points`, in the view box. */
function sparkPaths(points: readonly number[]): { line: string; area: string } {
  const low = Math.min(...points);
  const high = Math.max(...points);
  const span = high - low;
  const step = VIEW_WIDTH / (points.length - 1);
  const coordinates = points.map((point, index) => {
    const x = index * step;
    const y =
      span === 0 ? VIEW_HEIGHT / 2 : INSET + (1 - (point - low) / span) * (VIEW_HEIGHT - INSET * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = `M${coordinates.join("L")}`;
  return { line, area: `${line}L${VIEW_WIDTH},${VIEW_HEIGHT}L0,${VIEW_HEIGHT}Z` };
}

/**
 * One number, what it counts, how it moved, and where it has been.
 *
 * ```tsx
 * <StatCard
 *   label="Active projects"
 *   value="128"
 *   delta={{ value: "+12%", tone: "success", direction: "up", label: "from last week" }}
 *   trend={[90, 96, 101, 99, 110, 121, 128]}
 * />
 * ```
 *
 * The sparkline is an image with its numbers in words: how many, where it
 * started and ended, and its lowest and highest.
 */
export function StatCard(props: StatCardProps) {
  const labelId = createUniqueId();
  const locale = useLocale();
  const format = (n: number): string => new Intl.NumberFormat(locale().locale).format(n);
  const points = (): readonly number[] => props.trend ?? [];
  const drawn = (): boolean => points().length > 1;
  const paths = (): { line: string; area: string } => sparkPaths(points());
  const described = (): string => {
    if (props.trendLabel !== undefined) return props.trendLabel;
    const all = points();
    const first = all[0] ?? 0;
    const last = all[all.length - 1] ?? 0;
    return (
      `Trend over ${String(all.length)} values, from ${format(first)} to ${format(last)}; ` +
      `lowest ${format(Math.min(...all))}, highest ${format(Math.max(...all))}`
    );
  };

  return (
    <div {...uiProps("stat-card", root, cells(props))} role="group" aria-labelledby={labelId}>
      <p class={label} id={labelId} data-slot="stat-card-label">
        {props.label}
      </p>
      <p class={value} data-slot="stat-card-value">
        {props.value}
      </p>
      <Show when={props.delta !== undefined || props.description !== undefined}>
        <div class={footer} data-slot="stat-card-footer">
          <Show when={props.delta}>
            <span
              class={arc(delta, tones({ tone: props.delta?.tone }))}
              data-slot="stat-card-delta"
              data-tone={props.delta?.tone ?? "neutral"}
              data-direction={props.delta?.direction ?? "flat"}
            >
              {props.delta?.direction === "up" ? (
                <TrendingUp aria-hidden="true" />
              ) : props.delta?.direction === "down" ? (
                <TrendingDown aria-hidden="true" />
              ) : (
                <Minus aria-hidden="true" />
              )}
              {props.delta?.value}
            </span>
            <Show when={props.delta?.label}>
              <span data-slot="stat-card-delta-label">{props.delta?.label}</span>
            </Show>
          </Show>
          <Show when={props.description}>
            <span data-slot="stat-card-description">{props.description}</span>
          </Show>
        </div>
      </Show>
      <Show when={drawn()}>
        <svg
          class={arc(spark, tones({ tone: props.trendTone ?? props.delta?.tone ?? "info" }))}
          data-slot="stat-card-trend"
          viewBox={`0 0 ${String(VIEW_WIDTH)} ${String(VIEW_HEIGHT)}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={described()}
        >
          <path d={paths().area} fill="currentColor" fill-opacity="0.12" stroke="none" />
          <path
            d={paths().line}
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>
      </Show>
    </div>
  );
}
