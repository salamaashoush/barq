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
  context,
  effect,
  getContext,
  getOwner,
  type Incoming,
  isServer,
  provide,
  Show,
  signal,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { ownerDocument } from "./dom.ts";
import { focusable } from "./interactions/focusable.ts";
import { hover } from "./interactions/hover.ts";
import { getInteractionModality, isFocusVisible, trackModality } from "./interactions/modality.ts";
import type { ElementRef } from "./interactions/press.ts";
import {
  overlayPosition,
  overlayTriggerState,
  type OverlayTriggerState,
  type OverlayTriggerStateOptions,
  type Placement,
} from "./overlays.ts";
import {
  access,
  filterDOMProps,
  fromProps,
  id,
  mergeProps,
  provideTriggerSlot,
  styleProps,
  type DOMProps,
  type MaybeAccessor,
  type StyleProps,
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
}

export interface TooltipTriggerState extends Omit<OverlayTriggerState, "open" | "close"> {
  /**
   * Whether this transition should skip its animation.
   *
   * True while the group is warm: swapping between two triggers is one
   * tooltip moving, not one fading out and another fading in.
   */
  shouldSkipAnimation: Accessor<boolean>;
  open(immediate?: boolean): void;
  close(immediate?: boolean): void;
}

/** Whether a tooltip is showing, and the shared timing that decides when. */
export function tooltipTriggerState(options: TooltipTriggerStateOptions = {}): TooltipTriggerState {
  const overlay = overlayTriggerState(options);
  const skipAnimation = signal(false);
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
    skipAnimation.set(instant);
    warm = true;
    overlay.open();
    warmUpTimer = clearTimer(warmUpTimer);
    coolDownTimer = clearTimer(coolDownTimer);
  };

  const hide = (immediate?: boolean, instant?: boolean): void => {
    skipAnimation.set(instant === true);

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

    coolDownTimer = clearTimer(coolDownTimer);
    coolDownTimer = setTimeout(
      () => {
        openTooltips.delete(key);
        coolDownTimer = null;
        warm = false;
      },
      Math.max(COOL_DOWN, closeDelay()),
    );
  };

  const warmUp = (): void => {
    closeOthers();
    openTooltips.set(key, hide);

    if (overlay.isOpen()) return;

    if (warm) {
      show(true);
      return;
    }

    warmUpTimer = clearTimer(warmUpTimer);
    warmUpTimer = setTimeout(() => {
      warmUpTimer = null;
      warm = true;
      show(false);
    }, delay());
  };

  if (!isServer) {
    effect(() => () => {
      closeTimer = clearTimer(closeTimer);
      openTooltips.delete(key);
    });
  }

  return {
    isOpen: overlay.isOpen,
    setOpen: overlay.setOpen,
    toggle: overlay.toggle,
    shouldSkipAnimation: skipAnimation,
    open(immediate?: boolean) {
      if (immediate !== true && delay() > 0 && closeTimer === null) warmUp();
      // Focus opens at once, but only skips the animation if the group was
      // already warm — otherwise the first tooltip of a session would appear
      // with no transition at all.
      else show(warm);
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
    onHoverStart: () => state?.open(true),
    onHoverEnd: () => state?.close(),
  });

  return {
    tooltipProps: mergeProps(filterDOMProps(options, { labelable: true }), hoverProps, {
      role: "tooltip",
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
    effect(() => trackModality(access(options.ref) as Element | null));
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
    effect(() => {
      if (!state.isOpen()) return undefined;
      const element = access(options.ref) as Element | null;
      const doc = ownerDocument(element);
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        state.close(true);
      };
      doc.addEventListener("keydown", onKeyDown, true);
      return () => doc.removeEventListener("keydown", onKeyDown, true);
    });
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
}

const TooltipTriggerContext = context<TooltipTriggerValue | null>(null);

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
  /** @default 500 */
  closeDelay?: number;
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
  const state = tooltipTriggerState(options);

  const { triggerProps, tooltipProps } = tooltipTrigger(
    { ...(options as unknown as TooltipTriggerOptions), ref: triggerRef },
    state,
  );

  const value: TooltipTriggerValue = { state, triggerRef, triggerProps, tooltipProps };
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;

  // `provide`, not `install`: a component does not get a scope of its own, so
  // installing on the ambient owner writes where its SIBLINGS read. Two
  // tooltip triggers beside each other both ran their bodies before either
  // one's children were built, and every child of both then saw the second
  // one's state.
  return provide(
    owner,
    TooltipTriggerContext,
    () => value,
    () => {
      provideTriggerSlot({
        props: triggerProps,
        ref: triggerRef.set as (element: Element | null) => void,
      });
      return props.children;
    },
  ) as never;
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
  const domRef = makeRef<HTMLDivElement>();
  const trigger = useTooltipTrigger();

  const position = overlayPosition({
    targetRef: trigger.triggerRef,
    overlayRef: domRef,
    placement: () => props.placement?.() ?? "top",
    offset: () => props.offset?.() ?? 8,
    crossOffset: () => props.crossOffset?.(),
    shouldFlip: () => props.shouldFlip?.(),
    containerPadding: () => props.containerPadding?.(),
    isOpen: trigger.state.isOpen,
  });

  const { tooltipProps } = tooltip({}, trigger.state);

  const elementProps = mergeProps(
    tooltipProps,
    trigger.tooltipProps,
    position.overlayProps,
    styleProps(props),
    {
      "data-placement": position.placement,
      "data-skip-animation": trigger.state.shouldSkipAnimation,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <Show when={trigger.state.isOpen()}>
      <div {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
        {props.children}
      </div>
    </Show>
  );
}
