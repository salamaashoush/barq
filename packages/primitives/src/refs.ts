import { type Accessor, createRenderEffect, createSignal } from "@barqjs/core";
import { type Clear, tryCleanup } from "./utils.ts";

/** Every shape a `ref` prop accepts: a callback, a `{ current }` box, or nothing. */
export type RefTarget<T> =
  | ((element: T) => void | Clear)
  | { current: T | null }
  | null
  | undefined;

/**
 * One `ref` that feeds several.
 *
 * The problem it solves is forwarding: a component that needs its own ref and
 * also accepts one from its caller has two consumers for a slot that holds one
 * value, and writing `ref={(el) => { mine = el; props.ref?.(el); }}` by hand
 * loses the `{ current }` form and every cleanup a callback returned.
 *
 * ```tsx
 * function Field(props: { ref?: RefTarget<HTMLInputElement> }) {
 *   const own = ref<HTMLInputElement>();
 *   return <input ref={mergeRefs(own, props.ref)} />;
 * }
 * ```
 *
 * A callback that returns a cleanup has it run when the element is replaced or
 * the owner disposes; a `{ current }` box is set to `null` at the same moment,
 * so nothing is left pointing at a detached node.
 */
export function mergeRefs<T>(...targets: RefTarget<T>[]): (element: T) => void {
  let undo: Clear[] = [];

  const release = (): void => {
    for (const fn of undo) fn();
    undo = [];
    for (const target of targets) {
      if (target !== null && target !== undefined && typeof target !== "function") {
        target.current = null;
      }
    }
  };

  tryCleanup(release);

  return (element: T): void => {
    release();
    for (const target of targets) {
      if (target === null || target === undefined) continue;
      if (typeof target === "function") {
        const cleanup = target(element);
        if (typeof cleanup === "function") undo.push(cleanup);
      } else {
        target.current = element;
      }
    }
  };
}

export interface Ref<T> {
  /** The element, or `null` until one is attached. */
  (): T | null;
  /** Pass this to a `ref` prop. */
  set: (element: T | null) => void;
  /** The `{ current }` view, for code that wants the imperative shape. */
  readonly current: T | null;
}

/**
 * A ref that is also a signal.
 *
 * `{ current }` is not reactive — it is filled in while the JSX around it is
 * built, which is after the code holding it has already run, so an effect that
 * reads it sees `null` forever. Reading this one subscribes, and the effect
 * re-runs when the element lands.
 *
 * ```tsx
 * const box = ref<HTMLDivElement>();
 * const size = elementSize(box);
 * return <div ref={box.set} />;
 * ```
 */
export function ref<T>(initial: T | null = null): Ref<T> {
  // The element is kept beside the signal, which only carries the dependency:
  // a `ref` prop is called while its component is still being built, and the
  // code after the JSX reads the element before any flush has published it.
  let held = initial;
  const [version, setVersion] = createSignal(0, { equals: false, ownedWrite: true });
  const read = (): T | null => {
    version();
    return held;
  };
  const accessor = read as Ref<T>;
  accessor.set = (next: T | null) => {
    if (Object.is(next, held)) return;
    held = next;
    setVersion(0);
  };
  Object.defineProperty(accessor, "current", { get: read });
  return accessor;
}

/**
 * Run `fn` with the element as soon as there is one, and clean up when it goes.
 *
 * The imperative escape hatch: a chart library, a map, an editor — anything
 * that wants a node and gives back a teardown.
 */
export function onElement<T>(
  target: Accessor<T | null | undefined>,
  fn: (element: T) => void | Clear,
): void {
  // A render effect, so the element is bound before user effects observe it.
  createRenderEffect(
    () => target(),
    (element) => {
      if (element === null || element === undefined) return undefined;
      const cleanup = fn(element);
      return typeof cleanup === "function" ? cleanup : undefined;
    },
  );
}
