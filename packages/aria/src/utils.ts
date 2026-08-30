/**
 * The prop plumbing every hook in this package shares.
 *
 * Two things here are not what the same-named helper in `@barqjs/core` does,
 * and the difference is the point:
 *
 * - {@link mergeProps} CHAINS event handlers and COMBINES `class`, where the
 *   core's overrides. Two hooks both need `onKeyDown` on one element, and the
 *   last one to be merged is not more correct than the first.
 * - {@link id} hands back an accessor rather than a string, because
 *   {@link mergeIds} can repoint it: when two components label the same
 *   element, one id has to win and everything already pointing at the loser
 *   has to follow.
 */

import {
  type Accessor,
  context,
  getContext,
  getNextChildId,
  getOwner,
  install,
  signal,
  untrack,
} from "@barqjs/core";
import { mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { access, type MaybeAccessor } from "@barqjs/primitives/utils";

export type { MaybeAccessor };
export { access };

/** What a hook writes onto an element: static values, accessors, handlers. */
export type DOMProps = Record<string, unknown>;

/**
 * A callback option that may have arrived wrapped in a Cell.
 *
 * Inside a component every prop is a Cell, callbacks included, so
 * `getTextValue={(item) => item.name}` reaches the callee as a function that
 * RETURNS the callback. The two are told apart by arity: an option like this
 * always takes at least one argument, and a Cell takes none — the same rule
 * `access` uses, and sound here for the same reason.
 */
export function callback<A extends unknown[], R>(
  value: MaybeAccessor<((...args: A) => R) | undefined> | undefined,
): ((...args: A) => R) | undefined {
  if (typeof value !== "function") return undefined;
  if (value.length === 0) return (value as () => ((...args: A) => R) | undefined)();
  return value as (...args: A) => R;
}

/** One function calling each of `fns` in order with the same arguments. */
export function chain<Args extends unknown[]>(
  ...fns: (((...args: Args) => void) | undefined | null)[]
): (...args: Args) => void {
  return (...args: Args): void => {
    for (const fn of fns) fn?.(...args);
  };
}

const HANDLER = /^on[A-Z]/;

function isHandlerKey(key: string): boolean {
  return HANDLER.test(key);
}

function combineTokens(a: unknown, b: unknown): unknown {
  const empty = (value: unknown): boolean => value === undefined || value === null || value === "";
  if (empty(a)) return b;
  if (empty(b)) return a;
  if (typeof a === "function" || typeof b === "function") {
    return (): string | undefined => {
      const left = access(a);
      const right = access(b);
      const joined = [left, right].filter(Boolean).join(" ");
      return joined === "" ? undefined : joined;
    };
  }
  return `${String(a)} ${String(b)}`;
}

/**
 * Later sources win, except where losing would drop behaviour:
 *
 * - `on*` handlers are chained, in source order.
 * - `class` and `className` are concatenated.
 * - `aria-describedby` is concatenated. Descriptions ACCUMULATE: a field's
 *   help text, its error, and a tooltip on top of both are three descriptions
 *   of one control, and the last hook to be merged is not the only one that
 *   had something to say. A label does not work that way, so
 *   `aria-labelledby` still overrides.
 * - `id`s are merged, so both labels keep pointing at one element.
 * - `ref`s are merged, so both consumers get the node.
 * - a later `undefined` does not override an earlier value.
 *
 * Values may be accessors; nothing here calls one, so the result stays as lazy
 * as its sources.
 */
export function mergeProps(...sources: (DOMProps | null | undefined)[]): Record<string, unknown> {
  const result: Record<string, unknown> = { ...sources[0] };

  for (let i = 1; i < sources.length; i++) {
    const source = sources[i];
    if (source === null || source === undefined) continue;

    for (const key in source) {
      const a = result[key];
      const b = source[key];

      if (typeof a === "function" && typeof b === "function" && isHandlerKey(key)) {
        result[key] = chain(a as (...args: unknown[]) => void, b as (...args: unknown[]) => void);
      } else if (key === "class" || key === "className" || key === "aria-describedby") {
        result[key] = combineTokens(a, b);
      } else if (key === "id" && a !== undefined && b !== undefined) {
        result[key] = mergeIds(a as MaybeAccessor<string>, b as MaybeAccessor<string>);
      } else if (key === "ref" && a !== undefined && b !== undefined) {
        result[key] = mergeRefs(a as RefTarget<never>, b as RefTarget<never>);
      } else {
        result[key] = b !== undefined ? b : a;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/**
 * Every accessor handed out for a given id value, so {@link mergeIds} can
 * repoint them all at once.
 *
 * A plain `Map` keyed by string leaks nothing that matters here: the entry is
 * removed when the last holder's scope disposes, and a component that never
 * disposes was going to hold its id anyway.
 */
const idGroups = new Map<string, { set: (next: string) => void }[]>();

let fallbackCount = 0;

/**
 * A stable, SSR-safe identifier.
 *
 * The value comes from the owner's position in the scope tree, so the server
 * and the client produce the same string for the same element and hydration
 * matches. Outside any owner it falls back to a counter, which is only ever
 * reached by code running at module scope.
 *
 * ```tsx
 * const labelId = id();
 * <span id={labelId}>Name</span>
 * <input aria-labelledby={labelId} />
 * ```
 */
export function id(given?: MaybeAccessor<string | undefined>): Accessor<string> {
  const owner = getOwner();
  const generated =
    owner !== null ? `barq-${getNextChildId(owner)}` : `barq-fallback-${fallbackCount++}`;

  const current = signal(generated);
  const entry = { set: (next: string): void => current.set(next) };

  const group = idGroups.get(generated);
  if (group === undefined) idGroups.set(generated, [entry]);
  else group.push(entry);

  if (given === undefined) return () => current();
  return () => access(given) ?? current();
}

/**
 * One id for two components that both wrote one onto the same element.
 *
 * Whichever of the two was handed out by {@link id} loses its own value and
 * follows the other, so an `aria-labelledby` written before the merge still
 * resolves. When neither is ours, the later one wins, as `mergeProps` would.
 */
export function mergeIds(
  a: MaybeAccessor<string>,
  b: MaybeAccessor<string>,
): MaybeAccessor<string> {
  const left = access(a);
  const right = access(b);
  if (left === right) return a;

  const leftGroup = idGroups.get(left);
  if (leftGroup !== undefined) {
    for (const entry of leftGroup) entry.set(right);
    idGroups.delete(left);
    const rightGroup = idGroups.get(right);
    if (rightGroup === undefined) idGroups.set(right, leftGroup);
    else rightGroup.push(...leftGroup);
    return b;
  }

  const rightGroup = idGroups.get(right);
  if (rightGroup !== undefined) {
    for (const entry of rightGroup) entry.set(left);
    idGroups.delete(right);
    idGroups.set(left, rightGroup);
    return a;
  }

  return b;
}

/**
 * `aria-labelledby`/`aria-label` for a widget whose label lives elsewhere.
 *
 * Returns nothing when neither is given, so a caller can spread the result
 * unconditionally without writing an empty `aria-labelledby`.
 */
export function labelProps(props: {
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  defaultLabel?: MaybeAccessor<string | undefined>;
}): DOMProps {
  return {
    "aria-label": () => access(props["aria-label"]) ?? access(props.defaultLabel),
    "aria-labelledby": () => access(props["aria-labelledby"]),
  };
}

// ---------------------------------------------------------------------------
// filterDOMProps
// ---------------------------------------------------------------------------

const LABELLING = new Set(["aria-label", "aria-labelledby", "aria-describedby", "aria-details"]);

const LINK = new Set(["href", "hrefLang", "target", "rel", "download", "ping", "referrerPolicy"]);

const GLOBAL_ATTRS = new Set(["dir", "lang", "hidden", "inert", "translate"]);

const GLOBAL_EVENTS = new Set([
  "onClick",
  "onAuxClick",
  "onContextMenu",
  "onDoubleClick",
  "onMouseDown",
  "onMouseEnter",
  "onMouseLeave",
  "onMouseMove",
  "onMouseOut",
  "onMouseOver",
  "onMouseUp",
  "onTouchCancel",
  "onTouchEnd",
  "onTouchMove",
  "onTouchStart",
  "onPointerDown",
  "onPointerMove",
  "onPointerUp",
  "onPointerCancel",
  "onPointerEnter",
  "onPointerLeave",
  "onPointerOver",
  "onPointerOut",
  "onGotPointerCapture",
  "onLostPointerCapture",
  "onScroll",
  "onWheel",
  "onAnimationStart",
  "onAnimationEnd",
  "onAnimationIteration",
  "onTransitionCancel",
  "onTransitionEnd",
  "onTransitionRun",
  "onTransitionStart",
]);

const DATA_ATTR = /^data-/;

export interface FilterDOMPropsOptions {
  /** Include `aria-label`, `aria-labelledby`, `aria-describedby`, `aria-details`. */
  labelable?: boolean;
  /** Include the `<a>` attributes. */
  isLink?: boolean;
  /** Include `dir`, `lang`, `hidden`, `inert`, `translate`. */
  global?: boolean;
  /** Include the global DOM events. Defaults to `global`. */
  events?: boolean;
  /** Any other names to keep. */
  propNames?: ReadonlySet<string>;
}

/**
 * The subset of a component's props that belongs on a DOM element.
 *
 * A widget's own options (`isDisabled`, `onSelectionChange`) must not reach
 * the element: React tolerates unknown props by dropping them, but barq writes
 * every unrecognised key as an attribute, so an unfiltered spread puts
 * `isdisabled="true"` in the document.
 */
export function filterDOMProps(props: object, options: FilterDOMPropsOptions = {}): DOMProps {
  const { labelable, isLink, global, events = global, propNames } = options;
  const filtered: DOMProps = {};
  const source = props as DOMProps;

  for (const key in source) {
    if (!Object.hasOwn(source, key)) continue;
    const keep =
      key === "id" ||
      (labelable === true && LABELLING.has(key)) ||
      (isLink === true && LINK.has(key)) ||
      (global === true && GLOBAL_ATTRS.has(key)) ||
      (events === true &&
        (GLOBAL_EVENTS.has(key) ||
          (key.endsWith("Capture") && GLOBAL_EVENTS.has(key.slice(0, -7))))) ||
      propNames?.has(key) === true ||
      DATA_ATTR.test(key);
    if (keep) filtered[key] = source[key];
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

export function clamp(
  value: number,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * `value` rounded to the number of decimals `step` implies.
 *
 * Without it, `0.1 + 0.2` reaches an `aria-valuenow` as `0.30000000000000004`
 * and a screen reader reads all seventeen digits.
 */
export function roundToStepPrecision(value: number, step: number): number {
  let precision = 0;
  const text = step.toString();
  const exponent = text.toLowerCase().indexOf("e-");
  if (exponent > 0) {
    precision = Math.abs(Math.floor(Math.log10(Math.abs(step)))) + exponent;
  } else {
    const point = text.indexOf(".");
    if (point >= 0) precision = text.length - point;
  }

  if (precision <= 0) return value;
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

/** The nearest value reachable from `min` in whole `step`s, inside the range. */
export function snapValueToStep(
  value: number,
  min: number | undefined,
  max: number | undefined,
  step: number,
): number {
  const low = Number(min);
  const high = Number(max);
  const remainder = (value - (Number.isNaN(low) ? 0 : low)) % step;
  let snapped = roundToStepPrecision(
    Math.abs(remainder) * 2 >= step
      ? value + Math.sign(remainder) * (step - Math.abs(remainder))
      : value - remainder,
    step,
  );

  if (!Number.isNaN(low)) {
    if (snapped < low) {
      snapped = low;
    } else if (!Number.isNaN(high) && snapped > high) {
      snapped = low + Math.floor(roundToStepPrecision((high - low) / step, step)) * step;
    }
  } else if (!Number.isNaN(high) && snapped > high) {
    snapped = Math.floor(roundToStepPrecision(high / step, step)) * step;
  }

  return roundToStepPrecision(snapped, step);
}

export function toFixedNumber(value: number, digits: number, base = 10): number {
  const scale = base ** digits;
  return Math.round(value * scale) / scale;
}

// ---------------------------------------------------------------------------
// Controlled and uncontrolled state
// ---------------------------------------------------------------------------

/** The two halves of a piece of state a component may or may not own. */
export type Controllable<T> = [Accessor<T>, (next: T | ((previous: T) => T)) => void];

/**
 * State the caller may control, and owns when it does.
 *
 * `value` present means controlled: reads go to the prop and the setter only
 * reports. `value` absent means uncontrolled: the setter writes the signal
 * behind this and reports as well. One component supports both without its
 * body knowing which it got.
 *
 * ```ts
 * const [isOpen, setOpen] = controllable(props.isOpen, () => props.defaultOpen?.() ?? false, props.onOpenChange?.());
 * ```
 */
export function controllable<T>(
  value: MaybeAccessor<T | undefined> | undefined,
  defaultValue: MaybeAccessor<T>,
  onChange?: (value: T) => void,
): Controllable<T> {
  const isControlled = (): boolean => access(value) !== undefined;
  const internal = signal<T>((access(value) ?? access(defaultValue)) as T);

  // What the LAST setter call produced, kept only long enough for a second
  // call in the same event to compose from it. A controlled parent has not
  // re-run by then, so the prop still reads as the value before the first call.
  let pending: { value: T } | null = null;
  let scheduled = false;

  const read = (): T => {
    const controlled = access(value);
    return controlled !== undefined ? (controlled as T) : internal();
  };

  const currentUntracked = (): T => {
    if (pending !== null) return pending.value;
    return untrack(read);
  };

  const set = (next: T | ((previous: T) => T)): void => {
    const previous = currentUntracked();
    const resolved = typeof next === "function" ? (next as (previous: T) => T)(previous) : next;
    if (Object.is(previous, resolved)) return;

    pending = { value: resolved };
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        pending = null;
      });
    }

    // Written even when controlled, so a component that later drops the prop
    // continues from where the caller left it rather than from its default.
    if (!isControlled()) internal.set(resolved);
    onChange?.(resolved);
  };

  return [read, set];
}

// ---------------------------------------------------------------------------
// Component props, as hook options
// ---------------------------------------------------------------------------

/**
 * What a hook in this package accepts: every value option may be an accessor,
 * and every handler is a plain function.
 */
export type Options<P> = {
  [K in keyof P]?: K extends `on${string}` ? P[K] : MaybeAccessor<P[K]>;
};

/**
 * A component's props, as hook options.
 *
 * Inside a barq component EVERY prop is a Cell, handlers included: the caller
 * wrote `onPress={handler}` and the compiler wrapped it, so `props.onPress` is
 * `() => handler` rather than the handler. Passing that straight to a hook
 * would bind a function that returns the handler and calls nothing.
 *
 * A value Cell is already a valid accessor and passes through untouched. A
 * handler key — `on` followed by a capital — is wrapped in one stable function
 * that reads the current Cell and invokes what it yields, so a handler prop
 * that changes is followed without the hook re-running.
 *
 * ```tsx
 * export function Button(props: Incoming<ButtonProps>) {
 *   const { buttonProps } = button(fromProps(props), domRef);
 *   return <button {...buttonProps}>{props.children}</button>;
 * }
 * ```
 *
 * Calling a hook directly, outside a component, needs none of this: write the
 * options object by hand and pass handlers as themselves.
 */
export function fromProps<P extends object>(props: { [K in keyof P]: () => P[K] }): Options<P> {
  const wrappers = new Map<string, (...args: unknown[]) => void>();

  return new Proxy(props, {
    get(target, key: string | symbol): unknown {
      const value = Reflect.get(target, key);
      if (typeof key !== "string" || value === undefined || !HANDLER.test(key)) return value;

      let wrapper = wrappers.get(key);
      if (wrapper === undefined) {
        wrapper = (...args: unknown[]): void => {
          const carrier = Reflect.get(target, key) as (() => unknown) | undefined;
          const handler = typeof carrier === "function" ? carrier() : carrier;
          if (typeof handler === "function") (handler as (...a: unknown[]) => void)(...args);
        };
        wrappers.set(key, wrapper);
      }
      return wrapper;
    },
  }) as Options<P>;
}

// ---------------------------------------------------------------------------
// What the surroundings contribute to a control
// ---------------------------------------------------------------------------

export interface TriggerSlot {
  /** Props for the control's own element. */
  props: DOMProps;
  /** The control's element, for whatever anchors to or measures it. */
  ref?: (element: Element | null) => void;
}

const TriggerSlotContext = context<TriggerSlot | null>(null);

/**
 * Contribute props to the control rendered inside this component.
 *
 * A tooltip trigger has to write `aria-describedby` and its focus handlers on
 * the control ITSELF. Focus does not bubble, so a wrapper never hears it, and
 * a description on a wrapper describes the wrapper. The alternative — reaching
 * into the child element and setting attributes on it — fights every part of
 * the rendering model, so the trigger OFFERS and the control TAKES.
 *
 * Nesting accumulates rather than replaces: a button inside a menu trigger
 * inside a tooltip trigger gets both, the inner one's handlers chained after
 * the outer one's.
 */
export function provideTriggerSlot(slot: TriggerSlot): void {
  const owner = getOwner();
  if (owner === null) return;
  const outer = getContext(TriggerSlotContext) ?? null;
  const merged: TriggerSlot =
    outer === null
      ? slot
      : {
          props: mergeProps(outer.props, slot.props),
          ref:
            outer.ref === undefined || slot.ref === undefined
              ? (slot.ref ?? outer.ref)
              : (element: Element | null): void => {
                  outer.ref?.(element);
                  slot.ref?.(element);
                },
        };
  install(owner, TriggerSlotContext, () => merged);
}

/** What the surroundings want on this control, if anything. */
export function triggerSlot(): TriggerSlot {
  return getContext(TriggerSlotContext) ?? { props: {} };
}

/**
 * What every headless component in this package accepts on top of its own
 * props: how it looks, and how a test finds it.
 */
export interface StyleProps {
  class?: string;
  className?: string;
  style?: Record<string, string | number | undefined>;
  id?: string;
  "data-testid"?: string;
}

/**
 * The presentation props, passed through untouched.
 *
 * `class` and `className` are both accepted because both are written in the
 * wild; barq maps them to the same attribute.
 */
export function styleProps(props: {
  class?: () => string | undefined;
  className?: () => string | undefined;
  style?: () => Record<string, string | number | undefined> | undefined;
}): DOMProps {
  return {
    class: () => props.class?.() ?? props.className?.(),
    style: () => props.style?.(),
  };
}
