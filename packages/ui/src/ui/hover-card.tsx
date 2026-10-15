import { Popover as AriaPopover } from "@barqjs/aria/dialog";
import { hover, isFocusVisible } from "@barqjs/aria/interactions";
import {
  overlayTriggerState,
  placementFor,
  type Align,
  type OverlayTriggerState,
  type Placement,
  type Side,
} from "@barqjs/aria/overlays";
import { fromProps, mergeProps } from "@barqjs/aria/utils";
import {
  createContext,
  getContext,
  onCleanup,
  provide,
  type Child,
  type Incoming,
  type JSXElement,
} from "@barqjs/core";
import { firstThatWorks, layer } from "@barqjs/css";
import { ref as makeRef } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { when } from "../lib/shared-when.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { handedOn, named } from "../lib/slot.ts";
import { TriggerPart, type TriggerPartProps } from "../lib/trigger.tsx";

const ui = layer("barq.ui");

const content = ui(box.shadow, box.outline, box.forcedColors, text.sm, when.closing, {
  zIndex: "50",
  width: "calc(var(--spacing) * 64)",
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  borderRadius: "var(--radius)",
  backgroundColor: "var(--popover)",
  padding: "calc(var(--spacing) * 2.5)",
  color: "var(--popover-foreground)",
  "--ui-shadow":
    "0 4px 6px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 2px 4px -2px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
  "--ui-ring-shadow":
    "var(--ui-ring-inset,) 0 0 0 calc(1px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
  "--ui-ring-color": "var(--foreground)",
  "@supports (color: color-mix(in lab, red, red))": {
    "--ui-ring-color": "color-mix(in oklab, var(--foreground) 10%, transparent)",
  },
  "--ui-duration": "100ms",
  transitionDuration: "100ms",
  "--ui-enter-opacity": firstThatWorks("0", "calc(0/100)"),
  "--ui-enter-scale": firstThatWorks("0.95", "calc(95*1%)"),
  '[data-placement="bottom"]': {
    transformOrigin: "top",
    "--ui-enter-translate-y": "calc(2 * var(--spacing) * -1)",
  },
  '[data-placement="left"]': {
    transformOrigin: "100%",
    "--ui-enter-translate-x": "calc(2 * var(--spacing))",
  },
  '[data-placement="right"]': {
    transformOrigin: "0",
    "--ui-enter-translate-x": "calc(2 * var(--spacing) * -1)",
  },
  '[data-placement="top"]': {
    transformOrigin: "bottom",
    "--ui-enter-translate-y": "calc(2 * var(--spacing))",
  },
  '[data-closed][data-placement="bottom"]': {
    "--ui-exit-translate-y": "calc(2 * var(--spacing) * -1)",
  },
  '[data-closed][data-placement="left"]': {
    "--ui-exit-translate-x": "calc(2 * var(--spacing))",
  },
  '[data-closed][data-placement="right"]': {
    "--ui-exit-translate-x": "calc(2 * var(--spacing) * -1)",
  },
  '[data-closed][data-placement="top"]': {
    "--ui-exit-translate-y": "calc(2 * var(--spacing))",
  },
});

interface HoverCardValue {
  state: OverlayTriggerState;
  triggerRef: ReturnType<typeof makeRef<HTMLElement>>;
  /** Open after the open delay, cancelling any pending close. */
  enter: () => void;
  /** Close after the close delay, cancelling any pending open. */
  leave: () => void;
}

const HoverCardContext = createContext<HoverCardValue | null>(null);

function use(): HoverCardValue {
  const value = getContext(HoverCardContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <HoverCard>.");
  }
  return value;
}

export interface HoverCardProps {
  children?: Child;
  isOpen?: boolean;
  defaultOpen?: boolean;
  /** Milliseconds the pointer has to rest before it opens. @default 700 */
  openDelay?: number;
  /** Milliseconds before it closes once the pointer leaves. @default 300 */
  closeDelay?: number;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * ```tsx
 * <HoverCard>
 *   <HoverCardTrigger><a href="/barq">@barq</a></HoverCardTrigger>
 *   <HoverCardContent>Reactive without a virtual DOM.</HoverCardContent>
 * </HoverCard>
 * ```
 *
 * A hover card is not a tooltip: it holds content worth reading, so the pointer
 * can travel into it without it closing, and it does not describe its trigger.
 * Keyboard focus on the trigger opens it as resting the pointer does, and
 * leaves focus where it is: the card is somewhere to read, and whatever it
 * links to has to be reachable another way.
 */
export function HoverCard(props: Incoming<HoverCardProps>) {
  const state = overlayTriggerState(fromProps(props));

  // ONE timer for the pair. The pointer leaving the trigger and entering the
  // card are two events a few milliseconds apart, and two timers race: the
  // close fires while the pointer is already over the card.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const later = (open: boolean, delay: number): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => state.setOpen(open), delay);
  };
  onCleanup(() => {
    if (timer !== undefined) clearTimeout(timer);
  });

  const value: HoverCardValue = {
    state,
    triggerRef: makeRef<HTMLElement>(),
    enter: () => later(true, props.openDelay?.() ?? 700),
    leave: () => later(false, props.closeDelay?.() ?? 300),
  };

  return provide(
    HoverCardContext,
    () => value,
    () => props.children as unknown,
  );
}

/**
 * The link or control the card belongs to.
 *
 * What it hands over, through the slot or through `render`, is the hover and
 * focus handlers and `data-state`, and nothing about being a button: a hover
 * card's trigger is usually a link, and stays one.
 */
export function HoverCardTrigger(props: Incoming<TriggerPartProps>) {
  const value = use();
  const { hoverProps } = hover({
    onHoverStart: () => value.enter(),
    onHoverEnd: () => value.leave(),
  });
  const triggerProps = mergeProps(hoverProps, {
    "data-state": () => (value.state.isOpen() ? "open" : "closed"),
    // Only focus the keyboard brought. Focus a press left behind is on
    // something the pointer is already over, and that is the hover's to open.
    onFocus: () => {
      if (isFocusVisible()) value.enter();
    },
    onBlur: () => value.leave(),
  });

  const render = props.render?.();
  if (render !== undefined) {
    return render({
      props: mergeProps({ "data-slot": "hover-card-trigger" }, triggerProps),
      ref: (element) => value.triggerRef.set(element as HTMLElement | null),
    }) as JSXElement;
  }

  return (
    <TriggerPart slot={{ props: triggerProps, ref: value.triggerRef.set }}>
      {props.children}
    </TriggerPart>
  );
}

export interface HoverCardContentProps extends UiProps {
  /** Which edge of the trigger it sits on. @default "bottom" */
  side?: Side;
  /** Where along that edge. @default "center" */
  align?: Align;
  /** Distance from the trigger. @default 8 */
  sideOffset?: number;
  /** Distance along the edge, from where `align` put it. @default 0 */
  alignOffset?: number;
  /** The same position as one word, which wins over `side` and `align`. */
  placement?: Placement;
  /** Wins over `sideOffset`. */
  offset?: number;
  /** Wins over `alignOffset`. */
  crossOffset?: number;
}

export function HoverCardContent(props: Incoming<HoverCardContentProps>) {
  const value = use();
  // The pointer travelling from the trigger into the card must not close it,
  // which is the whole difference between this and a tooltip.
  const { hoverProps } = hover({
    onHoverStart: () => value.enter(),
    onHoverEnd: () => value.leave(),
  });
  // Named attributes, not a spread of the props object: a component prop is an
  // accessor, and `fromProps` unwraps one by CALLING it, so a plain handler
  // spread here runs once with no event rather than on every pointer.
  const enter = hoverProps.onPointerEnter as ((event: PointerEvent) => void) | undefined;
  const leave = hoverProps.onPointerLeave as ((event: PointerEvent) => void) | undefined;

  return (
    <AriaPopover
      {...handedOn(props)}
      {...named(props)}
      onPointerEnter={(event: PointerEvent) => enter?.(event)}
      onPointerLeave={(event: PointerEvent) => leave?.(event)}
      triggerRef={value.triggerRef}
      isOpen={value.state.isOpen()}
      onOpenChange={value.state.setOpen}
      placement={
        props.placement?.() ?? placementFor(props.side?.() ?? "bottom", props.align?.() ?? "center")
      }
      offset={props.offset?.() ?? props.sideOffset?.()}
      crossOffset={props.crossOffset?.() ?? props.alignOffset?.()}
      isDismissable
      // Opened by a pointer at rest or by focus arriving on the trigger, and in
      // both cases the user is somewhere else: a focus scope would pull focus
      // into the card and the blur that follows would close it.
      shouldContainFocus={false}
      data-slot={props["data-slot"]?.() ?? "hover-card-content"}
      class={ui(content, props.class?.(), props.className?.())}
    >
      {props.children}
    </AriaPopover>
  );
}
