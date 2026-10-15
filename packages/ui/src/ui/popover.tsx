import { Popover as AriaPopover, type PopoverComponentProps } from "@barqjs/aria/dialog";
import { placementFor, type Align, type Placement, type Side } from "@barqjs/aria/overlays";
import type { Incoming } from "@barqjs/core";
import { firstThatWorks, layer } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { when } from "../lib/shared-when.ts";
import { text } from "../lib/shared-text.ts";
import { overlayFamily, type OverlayRootProps } from "../lib/overlay.tsx";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import type { TriggerPartProps } from "../lib/trigger.tsx";
import { mergeRefs } from "@barqjs/primitives/refs";

const ui = layer("barq.ui");

const content = ui(box.shadow, box.outline, box.forcedColors, text.sm, when.closing, {
  zIndex: "50",
  display: "flex",
  width: "calc(var(--spacing) * 72)",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 2.5)",
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  borderRadius: "var(--radius)",
  backgroundColor: "var(--popover)",
  padding: "calc(var(--spacing) * 2.5)",
  color: "var(--popover-foreground)",
  "--ui-shadow":
    "0 4px 6px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 2px 4px -2px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
  // A ring rather than a border: it costs no layout, which is what lets the
  // popover be measured against the trigger without a 2px correction.
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

const header = ui(text.sm, {
  display: "flex",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 0.5)",
});

const title = ui(text.medium);

const description = ui({
  color: "var(--muted-foreground)",
});

const family = overlayFamily("Popover");

export interface PopoverProps extends OverlayRootProps {}

/**
 * ```tsx
 * <Popover>
 *   <PopoverTrigger><Button variant="outline">Open</Button></PopoverTrigger>
 *   <PopoverContent>
 *     <PopoverHeader><PopoverTitle>Dimensions</PopoverTitle></PopoverHeader>
 *   </PopoverContent>
 * </Popover>
 * ```
 *
 * Portalled to the body, so an ancestor with `overflow: hidden` or a
 * `transform` neither clips it nor anchors it against the wrong box.
 */
export function Popover(props: Incoming<PopoverProps>) {
  return <family.Root {...props} />;
}

export function PopoverTrigger(props: Incoming<TriggerPartProps>) {
  return <family.Trigger {...props} />;
}

/**
 * An element to place the popover against instead of its trigger.
 *
 * ```tsx
 * <Popover>
 *   <PopoverAnchor><InputGroup>…<PopoverTrigger>…</PopoverTrigger></InputGroup></PopoverAnchor>
 *   <PopoverContent align="start">…</PopoverContent>
 * </Popover>
 * ```
 *
 * A button at the end of a field opens a popover that should line up with the
 * FIELD. Focus still goes back to the trigger, which is what was pressed.
 */
export function PopoverAnchor(props: Incoming<UiProps>) {
  const { anchorRef } = family.use();
  return (
    <div {...uiProps("popover-anchor", "", props)} ref={mergeRefs(anchorRef.set, props.ref?.())}>
      {props.children}
    </div>
  );
}

export interface PopoverContentProps
  extends
    UiProps,
    Pick<
      PopoverComponentProps,
      "offset" | "crossOffset" | "shouldFlip" | "containerPadding" | "isModal" | "isNested"
    > {
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
  /** @default true */
  isDismissable?: boolean;
  isKeyboardDismissDisabled?: boolean;
}

export function PopoverContent(props: Incoming<PopoverContentProps>) {
  const { state, triggerRef, anchorRef } = family.use();
  const target = (): HTMLElement | null => anchorRef() ?? triggerRef();

  return (
    <AriaPopover
      {...props}
      triggerRef={target}
      isOpen={state.isOpen()}
      onOpenChange={state.setOpen}
      placement={
        props.placement?.() ?? placementFor(props.side?.() ?? "bottom", props.align?.() ?? "center")
      }
      offset={props.offset?.() ?? props.sideOffset?.()}
      crossOffset={props.crossOffset?.() ?? props.alignOffset?.()}
      data-slot={props["data-slot"]?.() ?? "popover-content"}
      // Focusable, so the focus scope has somewhere to put focus when the
      // popover holds nothing focusable of its own. Without it focus stays on
      // the trigger, which is OUTSIDE the overlay — and Escape, whose handler
      // is on the overlay, never reaches it.
      tabIndex={-1}
      class={ui(content, props.class?.(), props.className?.())}
    >
      {props.children}
    </AriaPopover>
  );
}

export function PopoverHeader(props: Incoming<UiProps>) {
  return <div {...uiProps("popover-header", header, props)}>{props.children}</div>;
}

export function PopoverTitle(props: Incoming<UiProps>) {
  return <div {...uiProps("popover-title", title, props)}>{props.children}</div>;
}

export function PopoverDescription(props: Incoming<UiProps>) {
  return <p {...uiProps("popover-description", description, props)}>{props.children}</p>;
}
