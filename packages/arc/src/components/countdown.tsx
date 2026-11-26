import { createEffect, createSignal, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLocale } from "@barqjs/aria/i18n";
import { announce } from "@barqjs/aria/live";
import { interval } from "@barqjs/primitives/timer";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, tone, type } from "../style/index.ts";
import { type Moment, durationText, hydrated, toDate } from "./format.tsx";
import { useArcMessages } from "./messages.ts";

export const countdownStyles = variants({
  slots: { root: arc(type.numeric, { whiteSpace: "nowrap" }) },
  variants: {
    tone: {
      neutral: {},
      warning: { root: arc(tone.warning, fg.tone, type.medium) },
      danger: { root: arc(tone.danger, fg.tone, type.medium) },
    },
  },
  defaults: { tone: "neutral" },
});

type Slots = ReturnType<typeof countdownStyles>;

export type CountdownTone = "neutral" | "warning" | "danger";

export interface CountdownProps extends Customisable<Slots> {
  /** The deadline: it counts down to it. */
  to?: Moment;
  /** The start: it counts up from it, an elapsed time. Ignored with `to`. */
  from?: Moment;
  /**
   * The moment it is measured from while the page is drawn and hydrated: the
   * request's time, handed to both, so they write the same thing. Left out,
   * both write a dash and the browser starts the clock once hydrated.
   */
  now?: Moment;
  /** Names the timer for a screen reader: "Time left in the quiz". */
  label?: string;
  /** `"digital"` is `4:05`; the rest name each unit. @default "digital" */
  length?: "digital" | "long" | "short" | "narrow";
  /** How many units, largest first, when not digital. @default 2 */
  units?: number;
  /** Milliseconds left at which it turns to the warning tone. */
  warnAt?: number;
  /** Milliseconds left at which it turns to the danger tone. */
  dangerAt?: number;
  /**
   * Tells a screen reader how long is left this often, in milliseconds, and
   * as it crosses `warnAt` and `dangerAt`. The figure itself is never
   * announced as it ticks. @default 60000; `0` for never
   */
  announceEvery?: number;
  /** Once, when the deadline passes. */
  onExpire?: () => void;
  /** Ticks while true. @default true */
  live?: boolean;
}

/**
 * The time a live display reads: `now` while the page is drawn and
 * hydrated, so both write the same, then the browser's clock, a second at a
 * time while `ticking` holds. `undefined` before either is known.
 */
export function useClock(
  now: () => Moment | undefined,
  ticking: () => boolean,
): () => number | undefined {
  const local = hydrated();
  const [clock, setClock] = createSignal(0, { ownedWrite: true });
  if (!isServer) {
    interval(
      () => setClock((tick) => tick + 1),
      () => (local() && ticking() ? 1000 : null),
    );
  }
  return () => {
    if (local()) {
      clock();
      return Date.now();
    }
    const given = now();
    return given === undefined ? undefined : toDate(given).getTime();
  };
}

/**
 * A live countdown to a deadline or, with `from`, the time elapsed since a
 * start: a quiz's time left, a session's end, a run's duration so far.
 *
 * ```tsx
 * <Countdown to={attempt.endsAt} label="Time left" warnAt={5 * 60_000} dangerAt={60_000} onExpire={submit} />
 * <Countdown from={run.startedAt} length="short" />
 * ```
 *
 * A `timer`, which a screen reader does not read as it ticks; it hears how
 * long is left once a minute and as each threshold passes, politely, and
 * that time is up at once. The tone changes with the thresholds and the
 * words say the same, so colour is never the only signal.
 */
export function Countdown(props: CountdownProps) {
  const locale = useLocale();
  const messages = useArcMessages();
  function counting(): boolean {
    return props.to !== undefined;
  }
  const reference = useClock(
    () => props.now,
    () => props.live !== false && !expired(),
  );
  function span(): number | undefined {
    const now = reference();
    if (now === undefined) return undefined;
    if (props.to !== undefined) return Math.max(0, toDate(props.to).getTime() - now);
    if (props.from !== undefined) return Math.max(0, now - toDate(props.from).getTime());
    return undefined;
  }
  function currentTone(): CountdownTone {
    const left = span();
    if (!counting() || left === undefined) return "neutral";
    if (props.dangerAt !== undefined && left <= props.dangerAt) return "danger";
    if (props.warnAt !== undefined && left <= props.warnAt) return "warning";
    return "neutral";
  }
  function expired(): boolean {
    return counting() && span() === 0;
  }
  function text(): string {
    const value = span();
    if (value === undefined) return "—";
    const length = props.length ?? "digital";
    return durationText(value, locale().locale, {
      length,
      units: props.units,
      hours: length === "digital" ? "auto" : undefined,
    });
  }
  function spoken(left: number): string {
    return messages().timeLeft(durationText(left, locale().locale, { length: "long", units: 2 }));
  }

  if (!isServer) {
    let announcedAt: number | undefined;
    let lastTone: CountdownTone = "neutral";
    let ended = false;
    createEffect(
      () =>
        [counting() ? span() : undefined, currentTone(), props.announceEvery ?? 60_000] as const,
      ([left, now, every]) => {
        if (left === undefined) return;
        if (left === 0) {
          if (ended) return;
          ended = true;
          untrack(() => {
            announce(messages().timeUp, "assertive");
            props.onExpire?.();
          });
          return;
        }
        ended = false;
        const crossed = now !== lastTone && now !== "neutral";
        lastTone = now;
        if (crossed || (every > 0 && announcedAt !== undefined && announcedAt - left >= every)) {
          announce(
            untrack(() => spoken(left)),
            "polite",
          );
          announcedAt = left;
        }
        announcedAt ??= left;
      },
    );
  }

  function cls(): Slots {
    return parts(countdownStyles({ tone: currentTone() }), props.classes);
  }
  return (
    <span
      class={arc(cls().root, props.class, props.className)}
      data-slot="countdown"
      data-tone={currentTone()}
      data-expired={expired() ? "" : undefined}
      role="timer"
      aria-label={props.label}
    >
      {expired() ? messages().timeUp : text()}
    </span>
  );
}
