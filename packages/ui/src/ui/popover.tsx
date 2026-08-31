import { Popover as AriaPopover, type PopoverComponentProps } from "@barqjs/aria/dialog";
import type { Placement } from "@barqjs/aria/overlays";
import type { Child, Incoming } from "@barqjs/core";
import { firstThatWorks, layer } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { when } from "../lib/shared-when.ts";
import { text } from "../lib/shared-text.ts";
import { overlayFamily, type OverlayRootProps } from "../lib/overlay.tsx";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

const content = ui(box.border, box.shadow, box.outline, when.closing, {
  zIndex: "50",
  width: "calc(var(--spacing) * 72)",
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
  gap: "var(--spacing)",
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

export function PopoverTrigger(props: Incoming<{ children?: Child }>) {
  return <family.Trigger {...props} />;
}

export interface PopoverContentProps
  extends
    UiProps,
    Pick<
      PopoverComponentProps,
      "offset" | "crossOffset" | "shouldFlip" | "containerPadding" | "isModal" | "isNested"
    > {
  /** @default "bottom" */
  placement?: Placement;
  /** @default true */
  isDismissable?: boolean;
  isKeyboardDismissDisabled?: boolean;
}

export function PopoverContent(props: Incoming<PopoverContentProps>) {
  const { state, triggerRef } = family.use();

  return (
    <AriaPopover
      {...props}
      triggerRef={triggerRef}
      isOpen={state.isOpen()}
      onOpenChange={state.setOpen}
      placement={props.placement?.() ?? "bottom"}
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
