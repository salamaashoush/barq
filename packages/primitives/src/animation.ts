import { type Accessor, isServer, renderEffect, signal, untrack } from "@barqjs/core";
import { prefersReducedMotion } from "./media.ts";
import { raf } from "./raf.ts";
import { type MaybeAccessor, access } from "./utils.ts";

/** A number, or a fixed-length list of them — a colour, a point, a transform. */
export type Animatable = number | readonly number[];

export type Easing = (t: number) => number;

/**
 * The easings worth having by name. Everything else is a cubic Bézier, and
 * {@link cubicBezier} builds those.
 */
export const easing = {
  linear: (t: number): number => t,
  quadIn: (t: number): number => t * t,
  quadOut: (t: number): number => t * (2 - t),
  quadInOut: (t: number): number => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  cubicIn: (t: number): number => t * t * t,
  cubicOut: (t: number): number => --t * t * t + 1,
  cubicInOut: (t: number): number =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  expoOut: (t: number): number => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
} as const satisfies Record<string, Easing>;

/**
 * A CSS-style cubic Bézier easing.
 *
 * Solved by bisection on each call rather than by Newton's method: at 60fps
 * the cost is invisible either way, and bisection cannot diverge on the
 * control points people actually paste in from a design tool.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const curve = (a: number, b: number, t: number): number => {
    const inverse = 1 - t;
    return 3 * inverse * inverse * t * a + 3 * inverse * t * t * b + t * t * t;
  };

  return (progress: number): number => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    let low = 0;
    let high = 1;
    let t = progress;
    for (let i = 0; i < 20; i++) {
      const x = curve(x1, x2, t);
      if (Math.abs(x - progress) < 1e-5) break;
      if (x < progress) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return curve(y1, y2, t);
  };
}

export interface TweenOptions {
  /** Milliseconds. Defaults to 200. */
  duration?: MaybeAccessor<number>;
  easing?: Easing;
  /**
   * Jump straight to the target when the user has asked for reduced motion.
   * On by default — an interface that ignores that setting is an
   * accessibility defect, not a style choice.
   */
  respectReducedMotion?: boolean;
}

/**
 * `source`, but arriving over time.
 *
 * Retargets mid-flight: a change while a tween is running eases from wherever
 * it currently is to the new value over a fresh duration, rather than
 * finishing the old journey first.
 */
export function tween<T extends Animatable>(
  source: Accessor<T>,
  options?: TweenOptions,
): Accessor<T> {
  const start = untrack(source);
  const value = signal<T>(start);
  if (isServer) return value;

  const ease = options?.easing ?? easing.cubicOut;
  const reduced = options?.respectReducedMotion === false ? undefined : prefersReducedMotion();

  let from: Animatable = start;
  let to: Animatable = start;
  let began = 0;
  let span = 0;

  const loop = raf((timestamp) => {
    const progress = span <= 0 ? 1 : Math.min(1, (timestamp - began) / span);
    value.set(mix(from, to, ease(progress)) as T);
    if (progress >= 1) loop.stop();
  });

  let first = true;
  renderEffect(() => {
    const target = source();
    if (first) {
      first = false;
      return;
    }
    if (reduced?.()) {
      loop.stop();
      from = to = target;
      value.set(target);
      return;
    }
    from = untrack(value);
    to = target;
    span = access(options?.duration ?? 200);
    began = performance.now();
    loop.start();
  });

  return value;
}

export interface SpringOptions {
  /** How hard the spring pulls. Defaults to 0.15; higher is snappier. */
  stiffness?: number;
  /** How fast it loses energy. Defaults to 0.8; lower overshoots more. */
  damping?: number;
  /** When to call it settled, in the units being animated. Defaults to 0.01. */
  precision?: number;
  respectReducedMotion?: boolean;
}

/**
 * `source`, followed by a spring.
 *
 * Integrated per frame at a fixed timestep so the motion is the same on a
 * 60Hz and a 144Hz display, which a naive `velocity += ...` per frame is not.
 * The loop stops once the spring settles, so an idle spring costs nothing.
 */
export function spring<T extends Animatable>(
  source: Accessor<T>,
  options?: SpringOptions,
): Accessor<T> {
  const start = untrack(source);
  const value = signal<T>(start);
  if (isServer) return value;

  const stiffness = options?.stiffness ?? 0.15;
  const damping = options?.damping ?? 0.8;
  const precision = options?.precision ?? 0.01;
  const reduced = options?.respectReducedMotion === false ? undefined : prefersReducedMotion();

  const width = typeof start === "number" ? 1 : start.length;
  const velocity = new Array<number>(width).fill(0);
  let target: Animatable = start;
  let last = 0;

  const step = (current: number, goal: number, index: number): number => {
    const force = (goal - current) * stiffness;
    const next = (velocity[index] as number) * damping + force;
    velocity[index] = next;
    return current + next;
  };

  const loop = raf((timestamp) => {
    // A tab that was in the background hands back one enormous delta; a fixed
    // number of catch-up steps keeps the spring from exploding, and capping
    // them keeps the frame from stalling.
    const steps = Math.min(4, Math.max(1, Math.round((timestamp - last) / 16.667)));
    last = timestamp;

    let current: Animatable = untrack(value);

    for (let i = 0; i < steps; i++) {
      if (typeof current === "number") {
        current = step(current, target as number, 0);
      } else {
        const goal = target as readonly number[];
        const next = new Array<number>(current.length);
        for (let k = 0; k < current.length; k++) {
          next[k] = step(current[k] as number, goal[k] as number, k);
        }
        current = next;
      }
    }

    const settled = rested(current, target, velocity, precision);
    value.set((settled ? target : current) as T);
    if (settled) {
      velocity.fill(0);
      loop.stop();
    }
  });

  let first = true;
  renderEffect(() => {
    const next = source();
    if (first) {
      first = false;
      return;
    }
    target = next;
    if (reduced?.()) {
      loop.stop();
      velocity.fill(0);
      value.set(next);
      return;
    }
    last = performance.now();
    loop.start();
  });

  return value;
}

function rested(
  current: Animatable,
  target: Animatable,
  velocity: readonly number[],
  precision: number,
): boolean {
  if (typeof current === "number") {
    return Math.abs(current - (target as number)) < precision && Math.abs(velocity[0]!) < precision;
  }
  const goal = target as readonly number[];
  for (let i = 0; i < current.length; i++) {
    if (Math.abs(current[i]! - goal[i]!) >= precision) return false;
    if (Math.abs(velocity[i]!) >= precision) return false;
  }
  return true;
}

function mix(from: Animatable, to: Animatable, t: number): Animatable {
  if (typeof from === "number") return from + ((to as number) - from) * t;
  const goal = to as readonly number[];
  const out = new Array<number>(from.length);
  for (let i = 0; i < from.length; i++) {
    out[i] = (from[i] as number) + ((goal[i] as number) - (from[i] as number)) * t;
  }
  return out;
}
