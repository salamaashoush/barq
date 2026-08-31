import { Popover as AriaPopover, type PopoverComponentProps } from "@barqjs/aria/dialog";
import type { Placement } from "@barqjs/aria/overlays";
import type { Child, Incoming } from "@barqjs/core";
import { clsx, css } from "@barqjs/css";

import "../theme/layers.ts";
import { overlayFamily, type OverlayRootProps } from "../lib/overlay.tsx";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const content = css`
  @layer barq.ui {
    z-index: 50;
    width: calc(var(--spacing) * 72);
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
    --ui-enter-scale: calc(95*1%);
    --ui-enter-scale: 0.95;
    &[data-placement="bottom"] {
      transform-origin: top;
      --ui-enter-translate-y: calc(2*var(--spacing)*-1);
    }
    &[data-placement="left"] {
      transform-origin: 100%;
      --ui-enter-translate-x: calc(2*var(--spacing));
    }
    &[data-placement="right"] {
      transform-origin: 0;
      --ui-enter-translate-x: calc(2*var(--spacing)*-1);
    }
    &[data-placement="top"] {
      transform-origin: bottom;
      --ui-enter-translate-y: calc(2*var(--spacing));
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

const header = css`
  @layer barq.ui {
    display: flex;
    flex-direction: column;
    gap: var(--spacing);
    font-size: var(--text-sm);
    line-height: var(--ui-leading, var(--text-sm--line-height));
  }
`;

const title = css`
  @layer barq.ui {
    --ui-font-weight: var(--font-weight-medium);
    font-weight: var(--font-weight-medium);
  }
`;

const description = css`
  @layer barq.ui {
    color: var(--muted-foreground);
  }
`;

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
      data-slot="popover-content"
      // Focusable, so the focus scope has somewhere to put focus when the
      // popover holds nothing focusable of its own. Without it focus stays on
      // the trigger, which is OUTSIDE the overlay — and Escape, whose handler
      // is on the overlay, never reaches it.
      tabIndex={-1}
      class={clsx(content, props.class?.(), props.className?.())}
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
