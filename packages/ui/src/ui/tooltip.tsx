import { declaredDirection, useLocale } from "@barqjs/aria/i18n";
import {
  alignOf,
  overlayPosition,
  placementFor,
  portalContainer,
  usePortalTarget,
  type Align,
  type Placement,
  type Side,
} from "@barqjs/aria/overlays";
import { presence } from "@barqjs/aria/presence";
import {
  TooltipProvider as AriaTooltipProvider,
  TooltipTrigger as AriaTooltipTrigger,
  tooltip as tooltipHook,
  useTooltipTrigger,
  type TooltipTriggerComponentProps,
} from "@barqjs/aria/tooltip";
import { filterDOMProps, fromProps, mergeProps, styleProps } from "@barqjs/aria/utils";
import { Portal, Show, type Child, type Incoming, type JSXElement } from "@barqjs/core";
import { firstThatWorks, layer } from "@barqjs/css";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { when } from "../lib/shared-when.ts";
import type { UiProps } from "../lib/props.ts";
import type { TriggerPartProps } from "../lib/trigger.tsx";

const ui = layer("barq.ui");

const content = ui(when.closing, {
  zIndex: "50",
  display: "inline-flex",
  width: "fit-content",
  maxWidth: "var(--container-xs)",
  alignItems: "center",
  gap: "calc(var(--spacing) * 1.5)",
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  borderRadius: "calc(var(--radius) * 0.8)",
  backgroundColor: "var(--foreground)",
  paddingInline: "calc(var(--spacing) * 3)",
  paddingBlock: "calc(var(--spacing) * 1.5)",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  color: "var(--background)",
  // A shortcut key inside the tooltip takes the padding in on its side and
  // sits above the tip, which is a sibling with a z-index of its own.
  ':has([data-slot="kbd"])': {
    paddingInlineEnd: "calc(var(--spacing) * 1.5)",
  },
  ':is(& *)[data-slot="kbd"]': {
    position: "relative",
    isolation: "isolate",
    zIndex: "50",
    borderRadius: "calc(var(--radius) * 0.6)",
  },
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
  '[data-side="top"]': {
    bottom: "calc(var(--spacing) * -1)",
  },
  '[data-side="bottom"]': {
    top: "calc(var(--spacing) * -1)",
  },
  // Physical on purpose: the side is where the tooltip ended up on screen,
  // after the text direction has already been taken into account.
  '[data-side="left"]': {
    right: "calc(var(--spacing) * -1)",
  },
  '[data-side="right"]': {
    left: "calc(var(--spacing) * -1)",
  },
});

export interface TooltipProviderProps {
  children?: Child;
  /** How long a tooltip inside waits for a resting pointer, in milliseconds. @default 0 */
  delayDuration?: number;
  /** How long after one goes the next may still appear at once. @default 300 */
  skipDelayDuration?: number;
  /** Close as soon as the pointer leaves the trigger, even towards the tooltip. @default false */
  disableHoverableContent?: boolean;
}

/**
 * One set of timings for every tooltip inside.
 *
 * Optional, which it is not upstream: a `<Tooltip>` outside one works, and
 * waits `@barqjs/aria`'s own 1500ms rather than shadcn's none.
 */
export function TooltipProvider(props: Incoming<TooltipProviderProps>) {
  return (
    <AriaTooltipProvider
      delay={props.delayDuration?.() ?? 0}
      skipDelay={props.skipDelayDuration?.() ?? 300}
      isContentHoverable={props.disableHoverableContent?.() !== true}
    >
      {props.children}
    </AriaTooltipProvider>
  );
}

export interface TooltipProps extends TooltipTriggerComponentProps {
  /** Upstream's name for `delay`, which wins when both are given. */
  delayDuration?: number;
  /** Close as soon as the pointer leaves the trigger. @default the provider's */
  disableHoverableContent?: boolean;
}

/**
 * ```tsx
 * <Tooltip>
 *   <Button>Save</Button>
 *   <TooltipContent>Saves to the server</TooltipContent>
 * </Tooltip>
 * ```
 *
 * Neither `<TooltipTrigger>` nor `<TooltipProvider>` is required. The trigger
 * is whatever control is inside — `@barqjs/aria` hands it the props through a
 * slot, so `aria-describedby` and the focus handlers land on the BUTTON rather
 * than on a wrapper that focus never reaches.
 */
export function Tooltip(props: Incoming<TooltipProps>) {
  return (
    <AriaTooltipTrigger
      {...props}
      delay={props.delay?.() ?? props.delayDuration?.()}
      isContentHoverable={
        props.disableHoverableContent?.() === undefined
          ? props.isContentHoverable?.()
          : !props.disableHoverableContent()
      }
    />
  );
}

/**
 * Where upstream's tree puts the control the tooltip describes.
 *
 * `<Tooltip>` has already offered its props to every control inside it, so
 * around a `<Button>` this adds nothing and exists so the tree can be written
 * as shadcn writes it. `render` is for an element that does not read the slot:
 *
 * ```tsx
 * <TooltipTrigger render={(trigger) => <a {...trigger.props} ref={trigger.ref} href="/help">Help</a>} />
 * ```
 *
 * What it hands over is the description and the hover, focus and dismissal
 * handlers and nothing about being a button: a tooltip's trigger is whatever it
 * already was, a link as readily as a control.
 */
export function TooltipTrigger(props: Incoming<TriggerPartProps>) {
  const trigger = useTooltipTrigger();
  const render = props.render?.();
  if (render === undefined) return <>{props.children}</>;

  return render({
    props: mergeProps({ "data-slot": "tooltip-trigger" }, trigger.triggerProps),
    ref: (element) => trigger.triggerRef.set(element as HTMLElement | null),
  }) as JSXElement;
}

export interface TooltipContentProps extends Omit<UiProps, "ref"> {
  /** Which edge of the trigger it sits on. @default "top" */
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
 *
 * PORTALLED, which it was not, and the tooltip was invisible wherever it
 * mattered. `overlayPosition` computes coordinates in the VIEWPORT and the
 * element is `position: absolute`, so it needs the body as its containing
 * block: rendered in place, the nearest positioned ancestor was whatever the
 * trigger happened to sit in and the tooltip landed hundreds of pixels away —
 * measured on the docs preview as a trigger at x=671 and a tooltip at x=1069.
 * An ancestor with `overflow: hidden` then clipped what was left. Radix wraps
 * its content in `Tooltip.Portal` for both halves of the same reason.
 */
export function TooltipContent(props: Incoming<TooltipContentProps>) {
  const target = usePortalTarget();
  const domRef = makeRef<HTMLDivElement>();
  const arrowRef = makeRef<HTMLSpanElement>();
  const trigger = useTooltipTrigger();
  const locale = useLocale();
  const placement = (): Placement =>
    props.placement?.() ?? placementFor(props.side?.() ?? "top", props.align?.() ?? "center");

  const position = overlayPosition({
    targetRef: trigger.triggerRef,
    overlayRef: domRef,
    // Without it `overlayPosition` computes no offset at all, `arrowProps` is
    // empty, and the arrow falls to its static position: the end of the
    // tooltip's own text, which is the far corner rather than the trigger.
    arrowRef,
    placement,
    offset: () => props.offset?.() ?? props.sideOffset?.() ?? 8,
    crossOffset: () => props.crossOffset?.() ?? props.alignOffset?.(),
    shouldFlip: () => props.shouldFlip?.(),
    containerPadding: () => props.containerPadding?.(),
    isOpen: trigger.state.isOpen,
    direction: () => locale().direction,
  });

  const { tooltipProps } = tooltipHook({ isHoverable: trigger.isContentHoverable }, trigger.state);
  const gate = presence({ isOpen: trigger.state.isOpen, ref: domRef });

  const contentDirection = declaredDirection();
  const elementProps = mergeProps(
    tooltipProps,
    trigger.tooltipProps,
    position.overlayProps,
    filterDOMProps(fromProps(props), { global: true, labelable: true }),
    // Portalled out from under the element that carries `dir`.
    { dir: () => props.dir?.() ?? contentDirection() },
    styleProps(props),
    {
      "data-slot": "tooltip-content",
      "data-placement": position.placement,
      "data-side": position.placement,
      "data-align": () => alignOf(placement()),
      "data-skip-animation": trigger.state.shouldSkipAnimation,
      class: () => ui(content, props.class?.(), props.className?.()),
    },
  );

  return (
    <Show when={gate.isPresent()}>
      <Portal mount={portalContainer(target)}>
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
              data-side={position.placement()}
              class={ui(arrow, arrowSide)}
            />
          </Show>
        </div>
      </Portal>
    </Show>
  );
}
