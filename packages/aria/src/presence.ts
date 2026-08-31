/**
 * Keeping something in the document long enough for it to leave.
 *
 * A conditional removes its content in the frame the condition turns false, so
 * an exit animation has nothing left to animate: the enter direction plays and
 * the exit direction is a disappearance. `presence` holds the content for
 * exactly as long as the stylesheet is still drawing it, and marks it
 * `data-closed` while it does, which is the hook the exit rules key off.
 *
 * The duration is READ, never configured. It belongs to whoever wrote the CSS,
 * so a component library that hard-coded one would be wrong for every
 * application that chose otherwise, and wrong under `prefers-reduced-motion`,
 * where the answer is zero.
 */

import { type Accessor, effect, isServer, signal } from "@barqjs/core";

import type { ElementRef } from "./interactions/press.ts";
import { access, type MaybeAccessor } from "./utils.ts";

/** A `<time>` from a computed style, in milliseconds. `"0.2s"` and `"200ms"` both. */
function milliseconds(value: string | undefined): number {
  const text = value?.trim() ?? "";
  const amount = Number.parseFloat(text);
  if (Number.isNaN(amount)) return 0;
  return text.endsWith("ms") ? amount : amount * 1000;
}

/** The longest of a comma-separated duration list, each with its own delay. */
function longest(durations: string, delays: string): number {
  const times = durations.split(",");
  const offsets = delays.split(",");
  let max = 0;
  for (let index = 0; index < times.length; index++) {
    max = Math.max(max, milliseconds(times[index]) + milliseconds(offsets[index] ?? offsets[0]));
  }
  return max;
}

/** What the cascade says about this element alone, whether or not anything has started. */
function declared(element: Element): number {
  const view = element.ownerDocument.defaultView;
  if (view === null) return 0;
  const style = view.getComputedStyle(element);
  return Math.max(
    longest(style.transitionDuration, style.transitionDelay),
    longest(style.animationDuration, style.animationDelay),
  );
}

interface Animatable {
  getAnimations?: (options?: { subtree?: boolean }) => Animation[];
}

/** What is actually running, anywhere under this element. */
function running(element: Element): number {
  const source = element as Element & Animatable;
  if (typeof source.getAnimations !== "function") return 0;
  let max = 0;
  for (const animation of source.getAnimations({ subtree: true })) {
    const end = animation.effect?.getComputedTiming().endTime;
    // An `endTime` of Infinity is a spinner somewhere in the subtree, not this
    // element leaving. Waiting for one would keep the overlay forever.
    if (typeof end !== "number" || !Number.isFinite(end)) continue;
    max = Math.max(max, end);
  }
  return max;
}

/**
 * How long this element still has to be drawn for.
 *
 * Both measures, because neither alone is enough. The cascade covers a
 * transition that is DECLARED but has not started yet, which is the disclosure
 * panel's case. `getAnimations` covers an animation declared on a DESCENDANT,
 * which is every menu and listbox: `@barqjs/aria` wraps them in a popover, so
 * the element marked `data-closed` is the wrapper and the animation is on the
 * list inside it. Reading either forces the pending style change, so the
 * attribute set a line earlier is already in effect.
 *
 * Zero when nothing is animating, which is the answer for a plain overlay and
 * the answer under `prefers-reduced-motion`.
 */
export function exitDuration(element: Element): number {
  return Math.max(declared(element), running(element));
}

/** What an exit rule selects on, written before the element is measured. */
const CLOSED = "data-closed";

export interface PresenceOptions {
  isOpen: MaybeAccessor<boolean | undefined>;
  /** The element whose own animations decide how long leaving takes. */
  ref: ElementRef;
}

export interface PresenceResult {
  /** Whether the content belongs in the document at all. */
  isPresent: Accessor<boolean>;
  /** True while it is on its way out. Write it as `data-closed`. */
  isExiting: Accessor<boolean>;
}

/**
 * `isPresent` stays true after `isOpen` turns false, until the element has
 * finished animating out.
 *
 * `data-closed` is written STRAIGHT onto the element and the duration read back
 * in the same tick, because that is what an exit rule is selected by: measuring
 * before the attribute lands reads the enter animation, and measuring a frame
 * later means every close without an animation costs a frame it should not.
 * Reading a computed style flushes the pending change, so one tick is enough.
 */
export function presence(options: PresenceOptions): PresenceResult {
  const open = (): boolean => access(options.isOpen) === true;
  const isPresent = signal(open());
  const isExiting = signal(false);

  if (isServer) return { isPresent: open, isExiting: () => false };

  // Not a signal read inside the effect: an effect that depended on what it
  // sets would re-run itself, and this one has to fire on `isOpen` alone.
  let mounted = open();

  effect(() => {
    if (open()) {
      mounted = true;
      isExiting.set(false);
      isPresent.set(true);
      return undefined;
    }
    if (!mounted) return undefined;

    const leave = (): void => {
      mounted = false;
      isExiting.set(false);
      isPresent.set(false);
    };

    const element = access(options.ref) as Element | null;
    if (element === null || element === undefined) {
      leave();
      return undefined;
    }

    element.setAttribute(CLOSED, "");
    const duration = exitDuration(element);
    if (duration <= 0) {
      element.removeAttribute(CLOSED);
      leave();
      return undefined;
    }

    isExiting.set(true);
    const timer = setTimeout(leave, duration);
    return () => clearTimeout(timer);
  });

  return { isPresent, isExiting };
}
