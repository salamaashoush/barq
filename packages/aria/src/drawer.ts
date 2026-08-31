/**
 * A drawer's drag: how far it has been pulled, and whether letting go closes it.
 *
 * This is the piece `@barqjs/ui`'s `<Drawer>` needed. shadcn's is the `vaul`
 * package, which is React hooks over Radix, so the engine is written here and
 * only the behaviour is upstream's.
 *
 * A drawer is a modal like any other until a pointer touches it. What makes it
 * a drawer is that the pointer can take it away, and four things about that are
 * decisions rather than details.
 *
 * **The threshold is a fraction of the drawer, not a distance.** A 100px pull
 * on a 200px drawer is halfway and means it; the same pull on a full-height one
 * is a nudge. A constant would make tall drawers impossible to close and short
 * ones impossible to keep.
 *
 * **A flick closes it however far it got.** Someone who throws the drawer down
 * has already decided, and making them cross a distance first turns a gesture
 * into a haul. That is why the speed is measured and not only the offset.
 *
 * **Pulling the wrong way is damped rather than blocked.** A drawer that will
 * not move at all reads as broken; one that moves an eighth as far says "this
 * is as open as it gets" and springs back.
 *
 * **A drag that starts inside something scrolled is a scroll.** This is the
 * bug every hand-written sheet has: the list inside scrolls to the middle, the
 * next pull down takes the whole drawer with it, and the content the person was
 * reading leaves the screen. `canDragFrom` is what stops it.
 */

import { signal, type Accessor } from "@barqjs/core";

import { access, type MaybeAccessor } from "./utils.ts";

export type DrawerDirection = "top" | "bottom" | "left" | "right";

/** How much of the drawer has to be pulled away before letting go closes it. */
const THRESHOLD = 0.25;
/** px per ms past which a flick closes it whatever the offset. */
const VELOCITY = 0.4;
/** How much of a pull the wrong way is kept. */
const DAMPING = 8;

export interface DrawerDragOptions {
  /** Which edge the drawer is attached to. @default "bottom" */
  direction?: MaybeAccessor<DrawerDirection | undefined>;
  /** The fraction that closes it. @default 0.25 */
  threshold?: MaybeAccessor<number | undefined>;
  /** The speed that closes it, in px/ms. @default 0.4 */
  velocity?: MaybeAccessor<number | undefined>;
  onClose?: () => void;
}

export interface DrawerDrag {
  /** How far it has been pulled toward its edge, in px. Never negative. */
  readonly offset: Accessor<number>;
  readonly isDragging: Accessor<boolean>;
  /** `size` is the drawer's extent along the axis, which the threshold is of. */
  start(point: { readonly x: number; readonly y: number }, size: number): void;
  move(point: { readonly x: number; readonly y: number }): void;
  /** Ends the drag, and answers whether it closed the drawer. */
  end(): boolean;
  /** Ends it where it started: a cancelled pointer took no decision. */
  cancel(): void;
}

/** Along which axis the drawer moves, and which way counts as closing. */
function axisOf(direction: DrawerDirection): { vertical: boolean; sign: number } {
  return {
    vertical: direction === "top" || direction === "bottom",
    // A bottom drawer closes downward, so a growing y is a growing offset.
    sign: direction === "bottom" || direction === "right" ? 1 : -1,
  };
}

export function drawerDrag(options: DrawerDragOptions = {}): DrawerDrag {
  const offset = signal(0);
  const dragging = signal(false);
  let from = { x: 0, y: 0 };
  let size = 0;
  let speed = 0;
  let lastAt = 0;
  let lastOffset = 0;

  const raw = (point: { x: number; y: number }): number => {
    const { vertical, sign } = axisOf(access(options.direction) ?? "bottom");
    const moved = vertical ? point.y - from.y : point.x - from.x;
    return moved * sign;
  };

  return {
    offset,
    isDragging: dragging,
    start(point, extent) {
      from = { x: point.x, y: point.y };
      size = extent;
      speed = 0;
      lastAt = Date.now();
      lastOffset = 0;
      offset.set(0);
      dragging.set(true);
    },
    move(point) {
      if (!dragging()) return;
      const moved = raw(point);
      // Past the open position the drawer still moves, an eighth as far, so
      // the gesture is answered without the drawer leaving its edge.
      const next = moved >= 0 ? moved : moved / DAMPING;
      const now = Date.now();
      const since = now - lastAt;
      // Two moves in the same millisecond are one move, so the speed keeps
      // its last value. The baseline still moves: leaving it behind measures
      // the next sample from an offset the drawer no longer has, and a pull
      // back then reads as a flick forward.
      if (since > 0) {
        speed = (next - lastOffset) / since;
        lastAt = now;
      }
      lastOffset = next;
      offset.set(next);
    },
    end() {
      if (!dragging()) return false;
      dragging.set(false);
      const far = offset() > size * (access(options.threshold) ?? THRESHOLD);
      const fast = speed > (access(options.velocity) ?? VELOCITY);
      offset.set(0);
      if (far || fast) {
        options.onClose?.();
        return true;
      }
      return false;
    },
    cancel() {
      dragging.set(false);
      offset.set(0);
    },
  };
}

/**
 * Whether a drag starting at `target` belongs to the drawer or to a scroller
 * inside it.
 *
 * Walking up from the target to the drawer, the first element that can scroll
 * along the drag's axis takes the gesture unless it is already at the edge the
 * drag would take it past. A list scrolled to the middle keeps the pull; the
 * same list at its top hands it over, which is what makes a drawer with a long
 * body still closable by pulling its content.
 */
export function canDragFrom(
  target: Element | null,
  content: Element,
  direction: DrawerDirection,
): boolean {
  const { vertical, sign } = axisOf(direction);
  let at: Element | null = target;

  while (at !== null && at !== content) {
    const scrolled = vertical ? at.scrollTop : at.scrollLeft;
    const extent = vertical ? at.scrollHeight - at.clientHeight : at.scrollWidth - at.clientWidth;
    if (extent > 0) {
      // A bottom drawer is closed by dragging down, which scrolls the list up,
      // so the list only gives up the gesture at its own start.
      return sign > 0 ? scrolled <= 0 : scrolled >= extent;
    }
    at = at.parentElement;
  }

  return true;
}
