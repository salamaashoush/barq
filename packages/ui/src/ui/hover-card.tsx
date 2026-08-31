import { Popover as AriaPopover } from "@barqjs/aria/dialog";
import { hover } from "@barqjs/aria/interactions";
import {
  overlayTriggerState,
  type OverlayTriggerState,
  type Placement,
} from "@barqjs/aria/overlays";
import { fromProps, provideTriggerSlot } from "@barqjs/aria/utils";
import {
  context,
  getContext,
  getOwner,
  onCleanup,
  provide,
  type Child,
  type Incoming,
} from "@barqjs/core";
import { firstThatWorks, layer } from "@barqjs/css";
import { ref as makeRef } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { when } from "../lib/shared-when.ts";
import type { UiProps } from "../lib/props.ts";

const ui = layer("barq.ui");

const content = ui(box.border, box.shadow, box.outline, box.forcedColors, when.closing, {
  zIndex: "50",
  width: "calc(var(--spacing) * 64)",
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  borderRadius: "calc(var(--radius) - 2px)",
  backgroundColor: "var(--popover)",
  padding: "calc(var(--spacing) * 4)",
  color: "var(--popover-foreground)",
  "--ui-shadow":
    "0 4px 6px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 2px 4px -2px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
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

const HoverCardContext = context<HoverCardValue | null>(null);

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
 * Nothing here opens on focus, because there is nothing in it a keyboard user
 * could not reach another way.
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

  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;
  return provide(
    owner,
    HoverCardContext,
    () => value,
    () => props.children as unknown,
  ) as never;
}

export function HoverCardTrigger(props: Incoming<{ children?: Child }>) {
  const value = use();
  const { hoverProps } = hover({
    onHoverStart: () => value.enter(),
    onHoverEnd: () => value.leave(),
  });

  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;
  return provide(
    owner,
    HoverCardContext,
    () => value,
    () => {
      provideTriggerSlot({ props: hoverProps, ref: value.triggerRef.set });
      return props.children;
    },
  ) as never;
}

export interface HoverCardContentProps extends UiProps {
  /** @default "bottom" */
  placement?: Placement;
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
      onPointerEnter={(event: PointerEvent) => enter?.(event)}
      onPointerLeave={(event: PointerEvent) => leave?.(event)}
      triggerRef={value.triggerRef}
      isOpen={value.state.isOpen()}
      onOpenChange={value.state.setOpen}
      placement={props.placement?.() ?? "bottom"}
      isDismissable
      data-slot={props["data-slot"]?.() ?? "hover-card-content"}
      class={ui(content, props.class?.(), props.className?.())}
    >
      {props.children}
    </AriaPopover>
  );
}
