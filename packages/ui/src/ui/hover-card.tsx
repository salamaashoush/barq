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
import { clsx, css } from "@barqjs/css";
import { ref as makeRef } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";

const content = css`
  @layer barq.ui {
    z-index: 50;
    width: calc(var(--spacing) * 64);
    animation: enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease)
      var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1)
      var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none);
    border-radius: calc(var(--radius) - 2px);
    border-style: var(--ui-border-style);
    border-width: 1px;
    background-color: var(--popover);
    padding: calc(var(--spacing) * 4);
    color: var(--popover-foreground);
    --ui-shadow:
      0 4px 6px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1)),
      0 2px 4px -2px var(--ui-shadow-color, rgb(0 0 0 / 0.1));
    box-shadow:
      var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
      var(--ui-ring-shadow), var(--ui-shadow);
    --ui-enter-opacity: calc(0/100);
    --ui-enter-opacity: 0;
    --ui-outline-style: none;
    outline-style: none;
    @media (forced-colors: active) {
      outline: 2px solid transparent;
      outline-offset: 2px;
    }
    --ui-enter-scale: calc(95*1%);
    --ui-enter-scale: 0.95;
    &[data-placement="bottom"] {
      transform-origin: top;
      --ui-enter-translate-y: calc(2 * var(--spacing) * -1);
    }
    &[data-placement="left"] {
      transform-origin: 100%;
      --ui-enter-translate-x: calc(2 * var(--spacing));
    }
    &[data-placement="right"] {
      transform-origin: 0;
      --ui-enter-translate-x: calc(2 * var(--spacing) * -1);
    }
    &[data-placement="top"] {
      transform-origin: bottom;
      --ui-enter-translate-y: calc(2 * var(--spacing));
    }
    &[data-closed] {
      animation: exit var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease)
        var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1)
        var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none);
      --ui-exit-opacity: calc(0/100);
      --ui-exit-opacity: 0;
      --ui-exit-scale: calc(95*1%);
      --ui-exit-scale: 0.95;
    }
    &[data-closed][data-placement="bottom"] {
      --ui-exit-translate-y: calc(2 * var(--spacing) * -1);
    }
    &[data-closed][data-placement="left"] {
      --ui-exit-translate-x: calc(2 * var(--spacing));
    }
    &[data-closed][data-placement="right"] {
      --ui-exit-translate-x: calc(2 * var(--spacing) * -1);
    }
    &[data-closed][data-placement="top"] {
      --ui-exit-translate-y: calc(2 * var(--spacing));
    }
  }
`;

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
      class={clsx(content, props.class?.(), props.className?.())}
    >
      {props.children}
    </AriaPopover>
  );
}
