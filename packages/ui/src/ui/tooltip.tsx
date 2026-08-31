import { overlayPosition, type Placement } from "@barqjs/aria/overlays";
import { presence } from "@barqjs/aria/presence";
import {
  TooltipTrigger as AriaTooltipTrigger,
  tooltip as tooltipHook,
  useTooltipTrigger,
  type TooltipTriggerComponentProps,
} from "@barqjs/aria/tooltip";
import { filterDOMProps, fromProps, mergeProps, styleProps } from "@barqjs/aria/utils";
import { Show, type Incoming } from "@barqjs/core";
import { firstThatWorks } from "@barqjs/css";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { ui } from "../lib/atoms.ts";
import type { UiProps } from "../lib/props.ts";

const content = ui({
  zIndex: "50",
  width: "fit-content",
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  borderRadius: "calc(var(--radius) - 2px)",
  backgroundColor: "var(--foreground)",
  paddingInline: "calc(var(--spacing) * 3)",
  paddingBlock: "calc(var(--spacing) * 1.5)",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  textWrap: "balance",
  color: "var(--background)",
  "--ui-enter-opacity": firstThatWorks("0", "calc(0/100)"),
  "--ui-enter-scale": firstThatWorks("0.95", "calc(95*1%)"),
  '[data-placement="bottom"]': {
    transformOrigin: "top",
    "--ui-enter-translate-y": "calc(2*var(--spacing)*-1)",
  },
  '[data-placement="left"]': {
    transformOrigin: "100%",
    "--ui-enter-translate-x": "calc(2*var(--spacing))",
  },
  '[data-placement="right"]': {
    transformOrigin: "0",
    "--ui-enter-translate-x": "calc(2*var(--spacing)*-1)",
  },
  '[data-placement="top"]': {
    transformOrigin: "bottom",
    "--ui-enter-translate-y": "calc(2*var(--spacing))",
  },
  "[data-skip-animation]": {
    animation: "none",
  },
  "[data-closed]": {
    animation:
      "exit var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
    "--ui-exit-opacity": firstThatWorks("0", "calc(0/100)"),
    "--ui-exit-scale": firstThatWorks("0.95", "calc(95*1%)"),
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

const arrow = ui({
  position: "absolute",
  zIndex: "50",
  width: "calc(var(--spacing) * 2.5)",
  height: "calc(var(--spacing) * 2.5)",
  rotate: "45deg",
  borderRadius: "2px",
  backgroundColor: "var(--foreground)",
});

/**
 * The arrow's own placement.
 *
 * `overlayPosition` gives the offset ALONG the cross axis and leaves the side
 * to the caller, because only the caller knows how big the arrow is. A rotated
 * square is pushed half its own width past the edge it points away from.
 */
const arrowSide = ui({
  '[data-placement="top"]': {
    bottom: "calc(var(--spacing) * -1)",
  },
  '[data-placement="bottom"]': {
    top: "calc(var(--spacing) * -1)",
  },
  '[data-placement="left"]': {
    right: "calc(var(--spacing) * -1)",
  },
  '[data-placement="right"]': {
    left: "calc(var(--spacing) * -1)",
  },
});

export interface TooltipProps extends TooltipTriggerComponentProps {}

/**
 * ```tsx
 * <Tooltip>
 *   <Button>Save</Button>
 *   <TooltipContent>Saves to the server</TooltipContent>
 * </Tooltip>
 * ```
 *
 * There is no `<TooltipTrigger>` to wrap the control in and no
 * `<TooltipProvider>` to put at the root of the application. The trigger is
 * whatever control is inside — `@barqjs/aria` hands it the props through a
 * slot, so `aria-describedby` and the focus handlers land on the BUTTON rather
 * than on a wrapper that focus never reaches.
 */
export function Tooltip(props: Incoming<TooltipProps>) {
  return <AriaTooltipTrigger {...props} />;
}

export interface TooltipContentProps extends UiProps {
  /** @default "top" */
  placement?: Placement;
  /** @default 8 */
  offset?: number;
  crossOffset?: number;
  shouldFlip?: boolean;
  containerPadding?: number;
  /** Draw the little pointer. @default true */
  arrow?: boolean;
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * Built on the hooks rather than `@barqjs/aria`'s `<Tooltip>`, for one reason:
 * the arrow. `overlayPosition` returns `arrowProps`, and the component does not
 * pass them on because it draws no arrow of its own.
 */
export function TooltipContent(props: Incoming<TooltipContentProps>) {
  const domRef = makeRef<HTMLDivElement>();
  const arrowRef = makeRef<HTMLSpanElement>();
  const trigger = useTooltipTrigger();

  const position = overlayPosition({
    targetRef: trigger.triggerRef,
    overlayRef: domRef,
    // Without it `overlayPosition` computes no offset at all, `arrowProps` is
    // empty, and the arrow falls to its static position: the end of the
    // tooltip's own text, which is the far corner rather than the trigger.
    arrowRef,
    placement: () => props.placement?.() ?? "top",
    offset: () => props.offset?.() ?? 8,
    crossOffset: () => props.crossOffset?.(),
    shouldFlip: () => props.shouldFlip?.(),
    containerPadding: () => props.containerPadding?.(),
    isOpen: trigger.state.isOpen,
  });

  const { tooltipProps } = tooltipHook({}, trigger.state);
  const gate = presence({ isOpen: trigger.state.isOpen, ref: domRef });

  const elementProps = mergeProps(
    tooltipProps,
    trigger.tooltipProps,
    position.overlayProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "data-slot": "tooltip-content",
      "data-placement": position.placement,
      "data-skip-animation": trigger.state.shouldSkipAnimation,
      class: () => ui(content, props.class?.(), props.className?.()),
    },
  );

  return (
    <Show when={gate.isPresent()}>
      <div
        {...elementProps}
        data-closed={gate.isExiting() ? "" : undefined}
        ref={mergeRefs(domRef.set, props.ref?.())}
      >
        {props.children}
        <Show when={props.arrow?.() !== false}>
          <span
            {...position.arrowProps}
            ref={mergeRefs(arrowRef.set)}
            data-slot="tooltip-arrow"
            data-placement={position.placement()}
            class={ui(arrow, arrowSide)}
          />
        </Show>
      </div>
    </Show>
  );
}
