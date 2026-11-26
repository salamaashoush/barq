import { createEffect, createSignal, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { prefersReducedMotion } from "@barqjs/primitives/media";
import { intersectionObserver } from "@barqjs/primitives/observers";
import { raf } from "@barqjs/primitives/raf";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { srOnly } from "@barqjs/ui/sr-only";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { type } from "../style/index.ts";
import { chartNumbers } from "./chart-frame.tsx";

export const countUpStyles = variants({
  slots: {
    root: arc(type.numeric),
    shown: arc({}),
  },
});

export type CountUpSlots = ReturnType<typeof countUpStyles>;

export interface CountUpProps extends Customisable<CountUpSlots> {
  value: number;
  /** Where the count starts. @default 0 */
  from?: number;
  /** How the number is written in the locale: a currency, a percentage, a unit. */
  formatOptions?: Intl.NumberFormatOptions;
  /** How long the count takes, in ms. @default 1200 */
  duration?: number;
  id?: string;
}

/** The ease a count settles in with: fast, then slowing onto the figure. */
function settleIn(progress: number): number {
  return 1 - (1 - progress) ** 4;
}

/**
 * A figure that counts up to its value as it scrolls into view: a landing
 * page's numbers, a report's headline.
 *
 * ```tsx
 * <CountUp value={12480} />
 * <CountUp value={0.982} formatOptions={{ style: "percent", maximumFractionDigits: 1 }} />
 * ```
 *
 * The server and the hydrating page write the final figure, so a page
 * without script and a reader who asked for reduced motion see it as it
 * is; the count plays once, the first time it comes into view, and a new
 * value later counts from where it stands. The counting digits are hidden
 * from a screen reader, which reads the final figure once.
 */
export function CountUp(props: CountUpProps) {
  const number = chartNumbers(props.formatOptions);
  const element = makeRef<HTMLElement>();
  const [shown, setShown] = createSignal(
    untrack(() => props.value),
    { ownedWrite: true },
  );
  function cls(): CountUpSlots {
    return parts(countUpStyles(), props.classes);
  }
  function whole(value: number): number {
    return Number.isInteger(props.value) && Number.isInteger(props.from ?? 0)
      ? Math.round(value)
      : value;
  }

  if (!isServer) {
    const reduced = prefersReducedMotion();
    let started = false;
    let from = 0;
    let to = 0;
    let current = untrack(() => props.value);
    let began = 0;
    const loop = raf((timestamp) => {
      const span = props.duration ?? 1200;
      const progress = span <= 0 ? 1 : Math.min(1, (timestamp - began) / span);
      current = progress >= 1 ? to : whole(from + (to - from) * settleIn(progress));
      setShown(current);
      if (progress >= 1) loop.stop();
    });
    function run(start: number, end: number): void {
      if (reduced() || start === end) {
        loop.stop();
        current = end;
        setShown(end);
        return;
      }
      from = start;
      to = end;
      began = performance.now();
      current = start;
      setShown(start);
      loop.start();
    }
    intersectionObserver(
      element,
      (entry) => {
        if (!entry.isIntersecting || started) return;
        started = true;
        run(props.from ?? 0, props.value);
      },
      { threshold: 0.25 },
    );
    createEffect(
      () => props.value,
      (value) => {
        if (started) run(current, value);
        else setShown(value);
      },
      { defer: true },
    );
  }

  return (
    <span
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="count-up"
      ref={element.set}
    >
      <span class={cls().shown} data-slot="count-up-shown" aria-hidden="true">
        {number(shown())}
      </span>
      <span class={srOnly}>{number(props.value)}</span>
    </span>
  );
}
