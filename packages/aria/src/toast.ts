/**
 * A queue of toasts, and the timers that take them away.
 *
 * This is the piece `@barqjs/ui`'s `<Toaster>` needed. shadcn's is the `sonner`
 * package, which is React to its foundations, so the engine is written here and
 * only the shape of it is upstream's.
 *
 * Four things are decisions rather than details.
 *
 * **A toast is announced, not focused.** Moving focus to something that appeared
 * on its own takes the keyboard away from whatever the person was doing, so the
 * region is a live one and the toast waits to be reached. That is why `dismiss`
 * is on the toast and not only on a timer: something has to be able to remove
 * it deliberately.
 *
 * **The timer pauses.** A toast that expires while the pointer is over it, or
 * while the tab is in the background, was never read. Hovering the region stops
 * every timer in it, and leaving starts them again from where they stopped.
 *
 * **A queue has a limit and it is visible.** Beyond it the oldest goes, because
 * the alternative is a column that grows past the viewport and hides the newest
 * behind the ones it replaced.
 *
 * **An id is returned so the caller can update.** A promise that resolves wants
 * to become "Saved" rather than stack a second toast under "Saving"; without an
 * id there is no way to say which one.
 */

import { createSignal, type Accessor, type Child } from "@barqjs/core";
import { isServer } from "@barqjs/web";

import { access, type MaybeAccessor } from "./utils.ts";

export type ToastKind = "default" | "success" | "info" | "warning" | "error" | "loading";

export type ToastId = number | string;

/** Text, or something that builds what to draw in its place. */
export type ToastContent = string | (() => Child);

export interface ToastButton {
  readonly label: ToastContent;
  /** Handed the event that pressed it, when there was one. */
  readonly onAction: (event?: Event) => void;
}

export interface ToastOptions<D = unknown> {
  /**
   * Which toast this is. One already up under the same id is replaced in
   * place, so a caller that names its toasts cannot stack two of one thing.
   */
  readonly id?: ToastId;
  readonly title?: ToastContent;
  readonly description?: ToastContent;
  /** @default "default" */
  readonly kind?: ToastKind;
  /**
   * How long before it goes, in ms. `Infinity` keeps it, and a `loading` toast
   * has no clock whatever this says. @default 4000
   */
  readonly duration?: number;
  /** A button on the toast, and what it does. */
  readonly action?: ToastButton;
  /** A second button, for declining what the first one offers. */
  readonly cancel?: ToastButton;
  /** Whether a person can take it away themselves. @default true */
  readonly dismissible?: boolean;
  /** `high` interrupts a screen reader; `low` waits its turn. @default "low" */
  readonly priority?: "low" | "high";
  /** Told when it goes, however it went. */
  readonly onDismiss?: () => void;
  /** Told only when its own clock took it. */
  readonly onAutoClose?: () => void;
  /** Whatever the design system drawing it needs to carry along. */
  readonly data?: D;
}

export interface Toast<D = unknown> extends ToastOptions<D> {
  readonly id: ToastId;
  /** When the remaining time was last measured, so pausing can be resumed. */
  readonly kind: ToastKind;
  readonly duration: number;
  /** Decided to go, and still being drawn on its way out. */
  readonly isLeaving?: boolean;
}

/** A message for one outcome: the title alone, or the whole toast. */
export type ToastMessage<D = unknown> = ToastContent | ToastOptions<D>;

export interface ToastPromiseMessages<T, D = unknown> {
  readonly loading: ToastMessage<D>;
  readonly success: ToastMessage<D> | ((value: T) => ToastMessage<D>);
  readonly error: ToastMessage<D> | ((reason: unknown) => ToastMessage<D>);
  readonly finally?: () => void;
}

/** The work's own promise, with the id of the toast that is following it. */
export interface ToastPromise<T> extends Promise<T> {
  readonly id: ToastId;
  unwrap(): Promise<T>;
}

export interface ToastQueueOptions {
  /** How many are on screen at once. @default 3 */
  limit?: MaybeAccessor<number | undefined>;
  /** The default lifetime. @default 4000 */
  duration?: MaybeAccessor<number | undefined>;
}

export interface ToastQueue<D = unknown> {
  readonly toasts: Accessor<readonly Toast<D>[]>;
  /** Adds one and returns its id, which is what an update needs. */
  add<I extends ToastId = number>(options: ToastOptions<D> & { readonly id?: I }): I;
  /** Replaces one in place, keeping its position. Unknown ids are ignored. */
  update(id: ToastId, options: ToastOptions<D>): void;
  /** Takes one away, or every one when no id is given. */
  dismiss(id?: ToastId): void;
  get(id: ToastId): Toast<D> | undefined;
  clear(): void;
  /**
   * Stop every timer, which is what entering the region does.
   *
   * A reason is held until the same reason is given back, so the pointer
   * leaving does not restart clocks a hidden tab stopped.
   */
  pause(reason?: string): void;
  /** Start them again from the time each had left. */
  resume(reason?: string): void;
  readonly isPaused: Accessor<boolean>;
  /** Pauses while the document is hidden. Returns what stops watching. */
  watchDocument(target?: Document): () => void;
  /**
   * Asks how long a toast needs to be drawn leaving, in ms.
   *
   * Asked at the moment it is dismissed. Above zero the toast stays in the
   * list marked `isLeaving` for that long; at zero, or with nobody to ask, it
   * goes at once. Returns what withdraws the question.
   */
  onLeave(measure: (id: ToastId) => number): () => void;
  /**
   * `loading` while the work runs, then `success` or `error` on the same toast.
   *
   * Given a function, the work starts after the toast is up.
   */
  promise<T>(
    work: Promise<T> | (() => Promise<T>),
    messages: ToastPromiseMessages<T, D>,
  ): ToastPromise<T>;
}

const DEFAULT_LIMIT = 3;
const DEFAULT_DURATION = 4000;

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  /** What is left of the duration, in ms. */
  remaining: number;
  /** When the current run started, for working out what is left on a pause. */
  startedAt: number;
  /** False for a toast that waits on work rather than on a clock. */
  runs: boolean;
}

const POINTER = "pointer";
const HIDDEN = "hidden";

function isOptions<D>(message: ToastMessage<D>): message is ToastOptions<D> {
  return typeof message === "object";
}

function messageOptions<D>(message: ToastMessage<D>): ToastOptions<D> {
  return isOptions(message) ? message : { title: message };
}

/**
 * Whether a function is content to draw rather than a message to work out.
 *
 * Both are functions. One that takes the outcome declares a parameter for it;
 * one that builds what to draw declares none, and has to be left alone until
 * something is drawing, because building outside a render has no scope to
 * build in.
 */
function isBuilder(message: (...given: never[]) => unknown): message is () => Child {
  return message.length === 0;
}

export function toastQueue<D = unknown>(options: ToastQueueOptions = {}): ToastQueue<D> {
  const [toasts, setToasts] = createSignal<readonly Toast<D>[]>([]);
  const [paused, setPaused] = createSignal(false);
  // The timers' own copy. `paused()` is a published value and the pause is not
  // published until the flush, so `resume()` starting the clocks it just
  // un-paused would read itself as still paused and start nothing.
  let isPaused = false;
  const reasons = new Set<string>();
  const timers = new Map<ToastId, Timer>();
  const leaving = new Map<ToastId, ReturnType<typeof setTimeout>>();
  // The list as of the last write. A dismissal in the same tick as the add has
  // to find the toast, and the published list does not hold it yet.
  let current: readonly Toast<D>[] = [];
  let measureLeave: ((id: ToastId) => number) | null = null;
  let nextId = 1;

  const write = (next: (prev: readonly Toast<D>[]) => readonly Toast<D>[]): void => {
    current = next(current);
    const settled = current;
    setToasts(() => settled);
  };

  const stop = (id: ToastId): void => {
    const timer = timers.get(id);
    if (timer !== undefined && timer.handle !== null) {
      clearTimeout(timer.handle);
      timer.handle = null;
    }
  };

  const drop = (id: ToastId): void => {
    const pending = leaving.get(id);
    if (pending !== undefined) clearTimeout(pending);
    leaving.delete(id);
    write((prev) => prev.filter((each) => each.id !== id));
  };

  const remove = (id: ToastId, byTimer = false): void => {
    stop(id);
    timers.delete(id);
    const going = current.find((each) => each.id === id);
    if (going === undefined || going.isLeaving === true) return;

    const lasts = measureLeave?.(id) ?? 0;
    if (lasts > 0) {
      write((prev) => prev.map((each) => (each.id === id ? { ...each, isLeaving: true } : each)));
      leaving.set(
        id,
        setTimeout(() => drop(id), lasts),
      );
    } else {
      drop(id);
    }
    if (byTimer) going.onAutoClose?.();
    going.onDismiss?.();
  };

  const start = (id: ToastId): void => {
    const timer = timers.get(id);
    // A toast raised while a server renders is drawn once and sent. A clock
    // there takes nothing away, and holds the process open until it runs out.
    if (isServer) return;
    if (timer === undefined || isPaused || !timer.runs) return;
    // `Infinity` is the documented way to keep one, and `setTimeout` would
    // treat it as zero and take it away at once.
    if (!Number.isFinite(timer.remaining)) return;
    timer.startedAt = Date.now();
    timer.handle = setTimeout(() => remove(id, true), timer.remaining);
  };

  const clock = (toast: Toast<D>): void => {
    stop(toast.id);
    timers.set(toast.id, {
      handle: null,
      remaining: toast.duration,
      startedAt: Date.now(),
      // Work in flight decides when its toast goes; a timer would take it
      // away before the answer.
      runs: toast.kind !== "loading",
    });
    start(toast.id);
  };

  const fallbackDuration = (): number => access(options.duration) ?? DEFAULT_DURATION;

  const update = (id: ToastId, given: ToastOptions<D>): void => {
    const before = current.find((each) => each.id === id);
    if (before === undefined) return;
    const pending = leaving.get(id);
    if (pending !== undefined) clearTimeout(pending);
    leaving.delete(id);
    const next: Toast<D> = {
      ...before,
      ...given,
      id,
      kind: given.kind ?? before.kind,
      duration: given.duration ?? before.duration,
      isLeaving: false,
    };
    // In PLACE, so a "Saving" that becomes "Saved" does not jump to the
    // bottom of the column and read as a second thing happening.
    write((prev) => prev.map((each) => (each.id === id ? next : each)));
    clock(next);
  };

  const add = <I extends ToastId = number>(given: ToastOptions<D> & { readonly id?: I }): I => {
    if (given.id !== undefined && current.some((each) => each.id === given.id)) {
      update(given.id, given);
      return given.id;
    }
    const id: ToastId = given.id ?? nextId++;
    const toast: Toast<D> = {
      ...given,
      id,
      kind: given.kind ?? "default",
      duration: given.duration ?? fallbackDuration(),
    };
    const limit = access(options.limit) ?? DEFAULT_LIMIT;
    write((prev) => {
      // The OLDEST goes. Dropping the newest would mean the thing that just
      // happened is the one nobody is told about.
      const kept = [...prev, toast].slice(-Math.max(1, limit));
      for (const each of prev) {
        if (!kept.some((one) => one.id === each.id)) {
          stop(each.id);
          timers.delete(each.id);
        }
      }
      return kept;
    });
    clock(toast);
    return id as I;
  };

  const hold = (reason: string): void => {
    reasons.add(reason);
    if (isPaused) return;
    isPaused = true;
    setPaused(true);
    const now = Date.now();
    for (const [id, timer] of timers) {
      if (timer.handle === null) continue;
      // What is LEFT, not the whole duration: pausing twice would otherwise
      // give a toast its full life back each time the pointer crossed it.
      timer.remaining = Math.max(0, timer.remaining - (now - timer.startedAt));
      stop(id);
    }
  };

  const release = (reason: string): void => {
    reasons.delete(reason);
    if (!isPaused || reasons.size > 0) return;
    isPaused = false;
    setPaused(false);
    for (const id of timers.keys()) start(id);
  };

  return {
    toasts,
    isPaused: paused,
    add,
    update,
    get: (id) => current.find((each) => each.id === id),
    dismiss(id) {
      if (id !== undefined) {
        remove(id);
        return;
      }
      for (const each of current) remove(each.id);
    },
    clear() {
      for (const each of current) stop(each.id);
      for (const pending of leaving.values()) clearTimeout(pending);
      leaving.clear();
      timers.clear();
      write(() => []);
    },
    pause: (reason = POINTER) => hold(reason),
    resume: (reason = POINTER) => release(reason),
    watchDocument(target) {
      const watched = target ?? (typeof document === "undefined" ? undefined : document);
      if (watched === undefined) return () => {};
      // A toast that ran out in a background tab was never seen at all.
      const sync = (): void => {
        if (watched.hidden) hold(HIDDEN);
        else release(HIDDEN);
      };
      watched.addEventListener("visibilitychange", sync);
      sync();
      return () => {
        watched.removeEventListener("visibilitychange", sync);
        release(HIDDEN);
      };
    },
    onLeave(measure) {
      measureLeave = measure;
      return () => {
        if (measureLeave === measure) measureLeave = null;
      };
    },
    promise<T>(
      work: Promise<T> | (() => Promise<T>),
      messages: ToastPromiseMessages<T, D>,
    ): ToastPromise<T> {
      const id = add({ ...messageOptions(messages.loading), kind: "loading" });
      const { finally: afterwards } = messages;
      const settle = (kind: ToastKind, message: ToastMessage<D>): void => {
        const given = messageOptions(message);
        // The loading toast's lifetime was never used, so the outcome gets a
        // whole one rather than whatever "no clock" left behind. A message
        // that names its own kind keeps it: work can resolve with a failure.
        update(id, {
          ...given,
          kind: given.kind ?? kind,
          duration: given.duration ?? fallbackDuration(),
        });
      };
      const run = async (): Promise<T> => {
        try {
          const value = await (typeof work === "function" ? work() : work);
          settle(
            "success",
            typeof messages.success === "function" && !isBuilder(messages.success)
              ? messages.success(value)
              : messages.success,
          );
          return value;
        } catch (reason) {
          settle(
            "error",
            typeof messages.error === "function" && !isBuilder(messages.error)
              ? messages.error(reason)
              : messages.error,
          );
          throw reason;
        } finally {
          afterwards?.();
        }
      };
      const result = run();
      // A caller that only wants the toast never awaits this, and a failure
      // it was already shown must not also surface as an unhandled rejection.
      result.catch(() => {});
      return Object.assign(result, { id, unwrap: () => result });
    },
  };
}

export type ToastSwipeDirection = "up" | "down" | "left" | "right";

/** How far it has to be dragged before letting go throws it away, in px. */
const SWIPE_THRESHOLD = 45;
/** px per ms past which a flick throws it away however short it was. */
const SWIPE_VELOCITY = 0.11;
/** How far a pointer moves before the swipe has an axis. */
const SWIPE_SLOP = 1;
/** How far back from the furthest point a pull has to come to be called off, in px. */
const REVERSE_CANCEL = 10;

export interface ToastSwipeOptions {
  /** The ways it can be thrown. Any other way is resisted. */
  directions: MaybeAccessor<readonly ToastSwipeDirection[]>;
  /**
   * A pull brought back toward where it started is called off, as Base UI's
   * is. Sonner's is not. @default false
   */
  reverseCancels?: MaybeAccessor<boolean | undefined>;
  /** @default 45 */
  threshold?: MaybeAccessor<number | undefined>;
  /** @default 0.11 */
  velocity?: MaybeAccessor<number | undefined>;
  onDismiss?: (direction: ToastSwipeDirection) => void;
  /** Told when a tracked pointer takes hold of the toast, and when it lets go. */
  onHold?: (isHeld: boolean) => void;
}

export interface ToastSwipe {
  /** Where the pointer has taken it, in px from where it rests. */
  readonly offset: Accessor<{ readonly x: number; readonly y: number }>;
  readonly isSwiping: Accessor<boolean>;
  /** The way it was thrown, once it has been. */
  readonly direction: Accessor<ToastSwipeDirection | null>;
  start(point: { readonly x: number; readonly y: number }): void;
  move(point: { readonly x: number; readonly y: number }): void;
  /** Ends the swipe, and answers whether it threw the toast away. */
  end(): boolean;
  /** Ends it where it started: a cancelled pointer took no decision. */
  cancel(): void;
  /**
   * Starts a swipe from a `pointerdown` on the toast and follows the pointer
   * to its end. Answers whether it took the gesture: a press on a control
   * inside the toast, or with any but the main button, is left alone.
   */
  track(event: PointerEvent, toast: Element): boolean;
  /** Lets go of a tracked pointer, for a toast that leaves mid-gesture. */
  release(): void;
}

/** A control the pointer belongs to, whatever the toast would rather do. */
function ownsPointer(target: EventTarget | null, toast: Element): boolean {
  if (!(target instanceof Element)) return false;
  const control = target.closest("button, a, input, select, textarea, [role='button']");
  return control !== null && toast.contains(control);
}

/** The pull kept when dragging a way the toast does not go. */
function resisted(delta: number): number {
  return delta / (1.5 + Math.abs(delta) / 20);
}

/**
 * A toast that follows the pointer and can be thrown away.
 *
 * Three decisions.
 *
 * **One axis a swipe.** The first direction the pointer moves in is the one it
 * keeps, because a toast that drifts diagonally under a thumb reads as broken
 * and a diagonal has no single way to leave by.
 *
 * **Distance or speed.** A slow drag past the threshold and a short flick both
 * mean "away", and requiring both makes a flick on a phone do nothing.
 *
 * **The wrong way gives, and never dismisses.** It moves a little so the
 * gesture is answered, and springs back however hard it was pulled: a toast
 * anchored to the bottom that leaves upward crosses the page it was beside.
 */
export function toastSwipe(options: ToastSwipeOptions): ToastSwipe {
  const rest = { x: 0, y: 0 } as const;
  const [trackOffset, setOffset] = createSignal<{ readonly x: number; readonly y: number }>(rest);
  const [swiping, setSwiping] = createSignal(false);
  const [direction, setDirection] = createSignal<ToastSwipeDirection | null>(null);
  // The gesture's own copies. A pointer stream is read in the tick it is
  // written, and a signal write is not published until the flush.
  let isSwiping = false;
  let from = { x: 0, y: 0 };
  let at: { readonly x: number; readonly y: number } = rest;
  let axis: "x" | "y" | null = null;
  let startedAt = 0;
  // The furthest the pull went the way it is going, for telling a change of
  // mind from a wobble.
  let furthest = 0;

  const offset = (): { readonly x: number; readonly y: number } => {
    trackOffset();
    return at;
  };

  const place = (next: { readonly x: number; readonly y: number }): void => {
    at = next;
    setOffset(next);
  };

  const allows = (way: ToastSwipeDirection): boolean => access(options.directions).includes(way);

  const wayOf = (along: "x" | "y", amount: number): ToastSwipeDirection =>
    along === "x" ? (amount > 0 ? "right" : "left") : amount > 0 ? "down" : "up";

  const reset = (): void => {
    isSwiping = false;
    axis = null;
    setSwiping(false);
    place(rest);
  };

  const start = (point: { readonly x: number; readonly y: number }): void => {
    from = { x: point.x, y: point.y };
    axis = null;
    furthest = 0;
    startedAt = Date.now();
    isSwiping = true;
    setDirection(null);
    setSwiping(true);
    place(rest);
  };

  const move = (point: { readonly x: number; readonly y: number }): void => {
    if (!isSwiping) return;
    const dx = point.x - from.x;
    const dy = point.y - from.y;
    if (axis === null) {
      if (Math.abs(dx) <= SWIPE_SLOP && Math.abs(dy) <= SWIPE_SLOP) return;
      axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    const delta = axis === "x" ? dx : dy;
    // Resistance answers a pull the wrong way along an axis the toast does
    // leave by. Along one it never leaves by there is nothing to answer.
    const leavesAlong =
      axis === "x" ? allows("left") || allows("right") : allows("up") || allows("down");
    const amount = !leavesAlong ? 0 : allows(wayOf(axis, delta)) ? delta : resisted(delta);
    furthest = Math.max(furthest, Math.abs(amount));
    place(axis === "x" ? { x: amount, y: 0 } : { x: 0, y: amount });
  };

  const end = (): boolean => {
    if (!isSwiping) return false;
    const along = axis;
    const amount = along === "x" ? at.x : at.y;
    const way = along === null || amount === 0 ? null : wayOf(along, amount);
    // At least a millisecond, so a move and a release in the same one is a
    // fast flick rather than a division by zero.
    const elapsed = Math.max(1, Date.now() - startedAt);
    const far = Math.abs(amount) >= (access(options.threshold) ?? SWIPE_THRESHOLD);
    const fast = Math.abs(amount) / elapsed > (access(options.velocity) ?? SWIPE_VELOCITY);
    // Brought back toward where it started, it was not meant: Base UI's
    // reverse-to-cancel. Along an axis it leaves by both ways, coming back is
    // a throw the other way instead, so there is nothing to call off.
    const bothWays =
      along === "x" ? allows("left") && allows("right") : allows("up") && allows("down");
    const changedMind =
      access(options.reverseCancels) === true &&
      !bothWays &&
      furthest - Math.abs(amount) >= REVERSE_CANCEL;
    if (way !== null && allows(way) && (far || fast) && !changedMind) {
      // The offset stays where the pointer left it: the exit starts from
      // there, and snapping back first would throw it from the wrong place.
      isSwiping = false;
      axis = null;
      setSwiping(false);
      setDirection(way);
      options.onDismiss?.(way);
      return true;
    }
    reset();
    return false;
  };

  let tracking = false;
  const onMove = (event: PointerEvent): void => {
    move({ x: event.clientX, y: event.clientY });
  };
  const release = (): void => {
    if (!tracking) return;
    tracking = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    options.onHold?.(false);
  };
  function onUp(): void {
    release();
    end();
  }
  function onCancel(): void {
    release();
    reset();
  }

  return {
    offset,
    isSwiping: swiping,
    direction,
    start,
    move,
    end,
    cancel: reset,
    release,
    track(event, toast) {
      if (event.button !== 0 || tracking) return false;
      if (ownsPointer(event.target, toast)) return false;
      start({ x: event.clientX, y: event.clientY });
      tracking = true;
      options.onHold?.(true);
      // On the window rather than through `setPointerCapture`: a toast dragged
      // out from under the pointer stops receiving its moves, and a captured
      // pointer would retarget the click that follows to the toast.
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      return true;
    },
  };
}
