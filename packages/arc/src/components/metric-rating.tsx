import type { Child } from "@barqjs/core";

import type { Customisable } from "../lib/parts.ts";
import type { Tone } from "../theme/tokens.ts";
import { type ArcMessages, useArcMessages } from "./messages.ts";
import { Status, type StatusVariant, type statusVariants } from "./status.tsx";

/** How a measure reads against what is good for it. */
export type MetricRatingLevel = "good" | "fair" | "poor";

/**
 * Where a measure turns from good and where it turns poor. Lower is better
 * when `good` is below `poor` (a load time), higher when it is above (a
 * score).
 */
export interface MetricBounds {
  good: number;
  poor: number;
}

export const RATING_TONE: Record<MetricRatingLevel, Tone> = {
  good: "success",
  fair: "warning",
  poor: "danger",
};

/** How `value` rates within `bounds`: good up to `good`, poor past `poor`, fair between. */
export function rateMetric(
  value: number | null | undefined,
  bounds: MetricBounds,
): MetricRatingLevel | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) return undefined;
  const lowerIsBetter = bounds.good <= bounds.poor;
  if (lowerIsBetter ? value <= bounds.good : value >= bounds.good) return "good";
  if (lowerIsBetter ? value > bounds.poor : value < bounds.poor) return "poor";
  return "fair";
}

/** A rating in arc's words. */
export function ratingLabel(messages: ArcMessages, rating: MetricRatingLevel): string {
  if (rating === "good") return messages.ratingGood;
  if (rating === "fair") return messages.ratingFair;
  return messages.ratingPoor;
}

type Slots = ReturnType<typeof statusVariants>;

export interface MetricRatingProps extends Customisable<Slots> {
  rating: MetricRatingLevel;
  /** The rating in the caller's words. @default arc's "Good", "Needs improvement", "Poor" */
  children?: Child;
  /** @default "dot" */
  variant?: StatusVariant;
}

/**
 * How a measure reads, in a word and a tone: a page's load time, a score,
 * an error rate.
 *
 * ```tsx
 * <MetricRating rating={rateMetric(lcp, { good: 2500, poor: 4000 }) ?? "fair"} />
 * ```
 *
 * A `Status` in the rating's tone that always says the rating in words.
 * `rateMetric` places a value between the bounds, lower or higher being
 * better as the bounds run; `StatCard`'s `rating` draws one in its footer.
 */
export function MetricRating(props: MetricRatingProps) {
  const messages = useArcMessages();
  return (
    <Status
      tone={RATING_TONE[props.rating]}
      variant={props.variant}
      class={props.class}
      className={props.className}
      classes={props.classes}
      data-slot="metric-rating"
      data-rating={props.rating}
    >
      {props.children ?? ratingLabel(messages(), props.rating)}
    </Status>
  );
}
