/**
 * Tooltips: a short description that appears on hover or keyboard focus.
 *
 * The timing is the whole design, and it is shared between every tooltip on
 * the page rather than owned by each one. The first tooltip waits — a pointer
 * crossing a toolbar on its way somewhere else must not leave a trail of
 * popups. Once one has appeared the group is WARM, so the next appears at
 * once, which is what makes a row of icon buttons readable. A pause anywhere
 * cools the group down again.
 *
 * Two things a tooltip is not:
 *
 * - It is not a label. `aria-describedby` is the relationship, so the trigger
 *   keeps its own name and gains a description; `aria-labelledby` would
 *   replace the name with the tooltip's text.
 * - It is not reachable. A tooltip contains no interactive content and takes
 *   no focus, which is why it can vanish on blur without stranding anyone.
 *
 * A touch user has neither hover nor focus, so a tooltip is invisible to them
 * by design. Anything a touch user must be able to read belongs in the
 * interface, not in a tooltip.
 */

import {
  type Accessor,
  type Child,
  createContext,
  createTrackedEffect,
  getContext,
  getOwner,
  type Incoming,
  isServer,
  Portal,
  provide,
  Show,
  createSignal,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { ownerDocument } from "./dom.ts";
import { useLocale } from "./i18n.ts";
import { focusable } from "./interactions/focusable.ts";
import { hover } from "./interactions/hover.ts";
import { getInteractionModality, isFocusVisible, trackModality } from "./interactions/modality.ts";
import type { ElementRef } from "./interactions/press.ts";
import {
  alignOf,
  followOpen,
  overlayPosition,
  overlayTriggerState,
  portalContainer,
  usePortalTarget,
  type OverlayTriggerState,
  type OverlayTriggerStateOptions,
  type Placement,
} from "./overlays.ts";
import {
  access,
  type DOMProps,
  filterDOMProps,
  fromProps,
  id,
  type MaybeAccessor,
  mergeProps,
  provideTriggerSlot,
  type StyleProps,
  styleProps,
} from "./utils.ts";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** How long the FIRST tooltip in a group waits before appearing. */
const WARM_UP = 1500;
/** How long the group stays warm after the last tooltip goes away. */
const COOL_DOWN = 500;

/**
 * Every mounted tooltip, so one appearing can take the others away.
 *
 * Two tooltips on screen at once is always a bug: the pointer is over one
 * trigger, and the other is a leftover from the one it just left.
 */
const openTooltips = new Map<number, (immediate?: boolean, instant?: boolean) => void>();
let nextTooltip = 0;
let warm = false;
let warmUpTimer: ReturnType<typeof setTimeout> | null = null;
let coolDownTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimer(timer: ReturnType<typeof setTimeout> | null): null {
  if (timer !== null) clearTimeout(timer);
  return null;
}

/**
 * Forget the shared warm-up state.
 *
 * A test that leaves the group warm makes the next one measure a delay that
 * is not there. Nothing in an application needs this.
 */
export function resetTooltipWarmup(): void {
  warmUpTimer = clearTimer(warmUpTimer);
  coolDownTimer = clearTimer(coolDownTimer);
  warm = false;
  openTooltips.clear();
}

export interface TooltipTriggerStateOptions extends OverlayTriggerStateOptions {
  /** How long the first tooltip waits. @default 1500 */
  delay?: MaybeAccessor<number | undefined>;
  /** How long it stays after the pointer leaves. @default 500 */
  closeDelay?: MaybeAccessor<number | undefined>;
  /**
   * How long after this tooltip goes the next one may still appear at once.
   *
   * Counted from the moment it is gone, so a tooltip that lingers for its
   * close delay does not use the window up while it is still on screen. Zero
   * means every tooltip waits.
   *
   * @default 500, or the close delay when that is longer
   */
  skipDelay?: MaybeAccessor<number | undefined>;
}

export interface TooltipTriggerState extends Omit<OverlayTriggerState, "open" | "close"> {
  /**
   * Whether this transition should skip its animation.
   *
   * True while the group is warm: swapping between two triggers is one
   * tooltip moving, not one fading out and another fading in.
   */
  shouldSkipAnimation: Accessor<boolean>;
  /**
   * Whether it opened without waiting: from the keyboard, or while the group
   * was warm. A pointer that waited out the delay, however short, did not.
   */
  isInstant: Accessor<boolean>;
  open(immediate?: boolean): void;
  close(immediate?: boolean): void;
}

/** Whether a tooltip is showing, and the shared timing that decides when. */
export function tooltipTriggerState(options: TooltipTriggerStateOptions = {}): TooltipTriggerState {
  const overlay = overlayTriggerState(options);
  const [skipAnimation, setSkipAnimation] = createSignal(false);
  const [isInstant, setInstant] = createSignal(false);
  const key = nextTooltip++;

  const delay = (): number => access(options.delay) ?? WARM_UP;
  const closeDelay = (): number => access(options.closeDelay) ?? COOL_DOWN;

  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  const closeOthers = (): void => {
    for (const [other, hide] of openTooltips) {
      if (other === key) continue;
      hide(true, true);
      openTooltips.delete(other);
    }
  };

  const show = (instant: boolean): void => {
    closeTimer = clearTimer(closeTimer);
    closeOthers();
    openTooltips.set(key, hide);
    setSkipAnimation(instant);
    warm = true;
    overlay.open();
    warmUpTimer = clearTimer(warmUpTimer);
    coolDownTimer = clearTimer(coolDownTimer);
  };

  const hide = (immediate?: boolean, instant?: boolean): void => {
    setSkipAnimation(instant === true);

    if (immediate === true || closeDelay() <= 0) {
      closeTimer = clearTimer(closeTimer);
      overlay.close();
    } else if (closeTimer === null) {
      closeTimer = setTimeout(() => {
        closeTimer = null;
        overlay.close();
      }, closeDelay());
    }

    warmUpTimer = clearTimer(warmUpTimer);
    if (!warm) return;

    const lingers = immediate === true ? 0 : Math.max(0, closeDelay());
    const skipDelay = access(options.skipDelay);
    const window = skipDelay === undefined ? Math.max(COOL_DOWN, lingers) : lingers + skipDelay;

    coolDownTimer = clearTimer(coolDownTimer);
    if (window <= 0) {
      openTooltips.delete(key);
      warm = false;
      return;
    }
    coolDownTimer = setTimeout(() => {
      openTooltips.delete(key);
      coolDownTimer = null;
      warm = false;
    }, window);
  };

  const warmUp = (): void => {
    closeOthers();
    openTooltips.set(key, hide);

    if (overlay.isOpen()) return;

    if (warm) {
      setInstant(true);
      show(true);
      return;
    }

    warmUpTimer = clearTimer(warmUpTimer);
    warmUpTimer = setTimeout(() => {
      warmUpTimer = null;
      warm = true;
      setInstant(false);
      show(false);
    }, delay());
  };

  if (!isServer) {
    createTrackedEffect(() => () => {
      closeTimer = clearTimer(closeTimer);
      openTooltips.delete(key);
    });
  }

  return {
    isOpen: overlay.isOpen,
    setOpen: overlay.setOpen,
    toggle: overlay.toggle,
    shouldSkipAnimation: skipAnimation,
    isInstant,
    open(immediate?: boolean) {
      if (immediate !== true && delay() > 0 && closeTimer === null) {
        warmUp();
        return;
      }
      // One already showing keeps the way it arrived: the pointer reaching the
      // tooltip itself, or coming back before it has gone, opens nothing.
      if (!overlay.isOpen()) setInstant(immediate === true || warm);
      // Focus opens at once, but only skips the animation if the group was
      // already warm — otherwise the first tooltip of a session would appear
      // with no transition at all.
      show(warm);
    },
    close: hide,
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface TooltipOptions {
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
  /** Whether resting the pointer on the tooltip holds it open. @default true */
  isHoverable?: MaybeAccessor<boolean | undefined>;
}

/** `closed`, `delayed-open` or `instant-open`: the three states Radix names. */
export type TooltipStateName = "closed" | "delayed-open" | "instant-open";

/** The state of a tooltip as a design system's selectors spell it. */
export function tooltipStateName(state: TooltipTriggerState): TooltipStateName {
  if (!state.isOpen()) return "closed";
  return state.isInstant() ? "instant-open" : "delayed-open";
}

export interface TooltipResult {
  tooltipProps: DOMProps;
}

/**
 * The tooltip element itself.
 *
 * Hovering the tooltip keeps it open: a pointer travelling from the trigger to
 * a tooltip that is positioned beside it must not make it disappear on the
 * way.
 */
export function tooltip(options: TooltipOptions = {}, state?: TooltipTriggerState): TooltipResult {
  const { hoverProps } = hover({
    isDisabled: () => access(options.isHoverable) === false,
    onHoverStart: () => state?.open(true),
    onHoverEnd: () => state?.close(),
  });

  return {
    tooltipProps: mergeProps(filterDOMProps(options, { labelable: true }), hoverProps, {
      role: "tooltip",
      "data-state": () => (state === undefined ? undefined : tooltipStateName(state)),
    }),
  };
}

export interface TooltipTriggerOptions {
  ref: ElementRef;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  /** Open on hover and focus, or on focus alone. @default "hover" */
  trigger?: MaybeAccessor<"hover" | "focus" | undefined>;
  /** @default true */
  shouldCloseOnPress?: MaybeAccessor<boolean | undefined>;
}

export interface TooltipTriggerResult {
  triggerProps: DOMProps;
  tooltipProps: DOMProps;
}

/**
 * The element a tooltip describes.
 *
 * Focus opens it only when the focus ring is showing. Focus that arrived from
 * a click is focus the user can already see the target of, and a tooltip
 * appearing under the pointer on every click is the single most common way to
 * make one unbearable.
 */
export function tooltipTrigger(
  options: TooltipTriggerOptions,
  state: TooltipTriggerState,
): TooltipTriggerResult {
  const tooltipId = id();

  // Both the hover and the focus rules ask what the user last did, and nothing
  // knows unless the listeners are installed.
  if (!isServer) {
    createTrackedEffect(() => trackModality(access(options.ref)));
  }

  let hovered = false;
  let focused = false;

  const showIfEngaged = (): void => {
    if (hovered || focused) state.open(focused);
  };

  const hideIfIdle = (immediate?: boolean): void => {
    if (!hovered && !focused) state.close(immediate);
  };

  const forget = (immediate: boolean): void => {
    focused = false;
    hovered = false;
    hideIfIdle(immediate);
  };

  // Escape closes it wherever focus is. A trigger pressed and then escaped
  // keeps DOM focus, so without this the tooltip stays under the pointer with
  // no way to dismiss it.
  if (!isServer) {
    followOpen(
      () => (state.isOpen() ? ownerDocument(access(options.ref) as Element | null) : null),
      (doc) => {
        if (doc === null) return undefined;
        const onKeyDown = (event: KeyboardEvent): void => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          state.close(true);
        };
        doc.addEventListener("keydown", onKeyDown, true);
        return () => doc.removeEventListener("keydown", onKeyDown, true);
      },
    );
  }

  const { hoverProps } = hover({
    isDisabled: options.isDisabled,
    onHoverStart: () => {
      if (access(options.trigger) === "focus") return;
      // A hover that began because something covering the trigger went away —
      // a menu closing, focus moving on — is not the pointer arriving, and
      // reopening the tooltip there would be a popup nobody asked for. An
      // unknown modality is a real hover: the pointer may have been resting
      // over the trigger since the page loaded, having moved not at all.
      const modality = getInteractionModality();
      hovered = modality !== "keyboard" && modality !== "virtual";
      showIfEngaged();
    },
    onHoverEnd: () => {
      if (access(options.trigger) === "focus") return;
      forget(false);
    },
  });

  // Only the handlers. `focusable` also writes a `tabIndex`, and a trigger is
  // whatever it already was: an element that becomes a Tab stop merely by
  // carrying a tooltip is a Tab stop that does nothing.
  const { focusableProps } = focusable(
    {
      isDisabled: options.isDisabled,
      onFocus: () => {
        if (!isFocusVisible()) return;
        focused = true;
        showIfEngaged();
      },
      onBlur: () => forget(true),
    },
    options.ref,
  );
  const { tabIndex: _tabIndex, ...focusHandlers } = focusableProps;

  const dismissOnPress = (): void => {
    if (access(options.shouldCloseOnPress) === false) return;
    forget(true);
  };

  return {
    triggerProps: mergeProps(focusHandlers, hoverProps, {
      "aria-describedby": () => (state.isOpen() ? tooltipId() : undefined),
      "data-state": () => tooltipStateName(state),
      onPointerDown: dismissOnPress,
      onKeyDown: dismissOnPress,
    }),
    tooltipProps: { id: tooltipId },
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface TooltipTriggerValue {
  state: TooltipTriggerState;
  triggerRef: ReturnType<typeof makeRef<HTMLElement>>;
  triggerProps: DOMProps;
  tooltipProps: DOMProps;
  /** Whether resting the pointer on the tooltip holds it open. */
  isContentHoverable: Accessor<boolean>;
}

/** The timing a {@link TooltipProvider} gives every tooltip inside it. */
export interface TooltipGroup {
  delay: Accessor<number | undefined>;
  skipDelay: Accessor<number | undefined>;
  isContentHoverable: Accessor<boolean | undefined>;
}

const TooltipGroupContext = createContext<TooltipGroup | null>(null);

/** The enclosing {@link TooltipProvider}'s timing, if there is one. */
export function useTooltipGroup(): TooltipGroup | null {
  return getContext(TooltipGroupContext) ?? null;
}

export interface TooltipProviderComponentProps {
  children?: Child;
  /** How long the first tooltip inside waits. @default 1500 */
  delay?: number;
  /** How long after one goes the next may still appear at once. @default 500 */
  skipDelay?: number;
  /** Whether resting the pointer on a tooltip holds it open. @default true */
  isContentHoverable?: boolean;
}

/**
 * One set of timings for every tooltip inside.
 *
 * ```tsx
 * <TooltipProvider delay={300} skipDelay={200}>
 *   <Toolbar />
 * </TooltipProvider>
 * ```
 *
 * A tooltip works without one, and a tooltip that sets its own `delay` keeps
 * it. Whether the group is WARM is still shared by the whole page rather than
 * by the provider: two toolbars a pointer crosses in one movement are one
 * gesture, and the second should not make it wait again.
 */
export function TooltipProvider(props: Incoming<TooltipProviderComponentProps>) {
  const group: TooltipGroup = {
    delay: () => props.delay?.(),
    skipDelay: () => props.skipDelay?.(),
    isContentHoverable: () => props.isContentHoverable?.(),
  };

  return provide(
    TooltipGroupContext,
    () => group,
    () => props.children as unknown,
  );
}

const TooltipTriggerContext = createContext<TooltipTriggerValue | null>(null);

/** The enclosing {@link TooltipTrigger}, if there is one. */
export function useTooltipTrigger(): TooltipTriggerValue {
  const value = getContext(TooltipTriggerContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a TooltipTrigger.");
  }
  return value;
}

export interface TooltipTriggerComponentProps {
  children?: Child;
  isOpen?: boolean;
  defaultOpen?: boolean;
  isDisabled?: boolean;
  /** @default "hover" */
  trigger?: "hover" | "focus";
  /** @default 1500 */
  delay?: number;
  /** @default 500, or 0 when the content is not hoverable */
  closeDelay?: number;
  /** @default the enclosing {@link TooltipProvider}'s, then 500 */
  skipDelay?: number;
  /**
   * Whether resting the pointer on the tooltip holds it open.
   *
   * @default the enclosing {@link TooltipProvider}'s, then true
   */
  isContentHoverable?: boolean;
  /** @default true */
  shouldCloseOnPress?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * A trigger and its tooltip.
 *
 * ```tsx
 * <TooltipTrigger>
 *   <Button onPress={save}>Save</Button>
 *   <Tooltip>Saves without closing</Tooltip>
 * </TooltipTrigger>
 * ```
 *
 * The control inside takes the trigger's props for itself: `aria-describedby`
 * and the focus handlers have to be on the focusable element, and a wrapper
 * around it hears neither focus nor a description. A control this package does
 * not provide spreads `useTooltipTrigger().triggerProps` by hand.
 */
export function TooltipTrigger(props: Incoming<TooltipTriggerComponentProps>) {
  const triggerRef = makeRef<HTMLElement>();
  const options = fromProps(props);
  const group = useTooltipGroup();
  const isContentHoverable = (): boolean =>
    (props.isContentHoverable?.() ?? group?.isContentHoverable()) !== false;
  const state = tooltipTriggerState({
    ...options,
    delay: () => props.delay?.() ?? group?.delay(),
    skipDelay: () => props.skipDelay?.() ?? group?.skipDelay(),
    // The close delay is the time a pointer has to travel from the trigger to
    // the tooltip, and with nothing to travel to it is only a tooltip that
    // will not go away.
    closeDelay: () => props.closeDelay?.() ?? (isContentHoverable() ? undefined : 0),
  });

  const { triggerProps, tooltipProps } = tooltipTrigger(
    { ...(options as unknown as TooltipTriggerOptions), ref: triggerRef },
    state,
  );

  const value: TooltipTriggerValue = {
    state,
    triggerRef,
    triggerProps,
    tooltipProps,
    isContentHoverable,
  };
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;

  // `provide`, not `install`: a component does not get a scope of its own, so
  // installing on the ambient owner writes where its SIBLINGS read. Two
  // tooltip triggers beside each other both ran their bodies before either
  // one's children were built, and every child of both then saw the second
  // one's state.
  return provide(
    TooltipTriggerContext,
    () => value,
    () => {
      provideTriggerSlot({
        props: triggerProps,
        ref: triggerRef.set,
      });
      return props.children;
    },
  );
}

export interface TooltipComponentProps extends StyleProps {
  children?: Child;
  /** @default "top" */
  placement?: Placement;
  /** @default 8 */
  offset?: number;
  crossOffset?: number;
  shouldFlip?: boolean;
  containerPadding?: number;
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * The tooltip, mounted only while it is showing.
 *
 * `data-skip-animation` marks the transition a warm group makes: moving
 * between two triggers is one tooltip changing place, and fading it out and
 * back in reads as a flicker.
 */
export function Tooltip(props: Incoming<TooltipComponentProps>) {
  const target = usePortalTarget();
  const domRef = makeRef<HTMLDivElement>();
  const trigger = useTooltipTrigger();
  const locale = useLocale();
  const placement = (): Placement => props.placement?.() ?? "top";

  const position = overlayPosition({
    targetRef: trigger.triggerRef,
    overlayRef: domRef,
    placement,
    offset: () => props.offset?.() ?? 8,
    crossOffset: () => props.crossOffset?.(),
    shouldFlip: () => props.shouldFlip?.(),
    containerPadding: () => props.containerPadding?.(),
    isOpen: trigger.state.isOpen,
    direction: () => locale().direction,
  });

  const { tooltipProps } = tooltip({ isHoverable: trigger.isContentHoverable }, trigger.state);

  const elementProps = mergeProps(
    tooltipProps,
    trigger.tooltipProps,
    position.overlayProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "data-placement": position.placement,
      "data-side": position.placement,
      "data-align": () => alignOf(placement()),
      "data-skip-animation": trigger.state.shouldSkipAnimation,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <Show when={trigger.state.isOpen()}>
      <Portal mount={portalContainer(target)}>
        <div {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
          {props.children}
        </div>
      </Portal>
    </Show>
  );
}
