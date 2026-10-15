import { Dialog as AriaDialog, Heading, Modal, useDialogDescription } from "@barqjs/aria/dialog";
import { Show, type Incoming } from "@barqjs/core";
import { firstThatWorks, layer } from "@barqjs/css";
import { X } from "@barqjs/lucide/icons/x";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { icon } from "../lib/shared-icon.ts";
import { text } from "../lib/shared-text.ts";
import {
  overlayFamily,
  OverlayPortal,
  registerUnderlay,
  type OverlayPortalProps,
  type OverlayRootProps,
} from "../lib/overlay.tsx";
import type { UiProps } from "../lib/props.ts";
import type { TriggerPartProps } from "../lib/trigger.tsx";
import { handedOn, named, uiProps } from "../lib/slot.ts";
import { Button, type ButtonProps } from "./button.tsx";
import { srOnly } from "./sr-only.ts";

const ui = layer("barq.ui");

const overlay = ui({
  position: "fixed",
  inset: "0px",
  zIndex: "50",
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  backgroundColor: "color-mix(in srgb, #000 10%, transparent)",
  "--ui-duration": "100ms",
  transitionDuration: "100ms",
  "--ui-enter-opacity": firstThatWorks("0", "calc(0/100)"),
  "@supports (color: color-mix(in lab, red, red))": {
    backgroundColor: "color-mix(in oklab, var(--color-black) 10%, transparent)",
  },
  "@supports (backdrop-filter: var(--tw))": {
    "&": {
      "--ui-backdrop-blur": "blur(var(--blur-xs))",
      "-webkit-backdrop-filter":
        "var(--ui-backdrop-blur,) var(--ui-backdrop-brightness,) var(--ui-backdrop-contrast,) var(--ui-backdrop-grayscale,) var(--ui-backdrop-hue-rotate,) var(--ui-backdrop-invert,) var(--ui-backdrop-opacity,) var(--ui-backdrop-saturate,) var(--ui-backdrop-sepia,)",
      backdropFilter:
        "var(--ui-backdrop-blur,) var(--ui-backdrop-brightness,) var(--ui-backdrop-contrast,) var(--ui-backdrop-grayscale,) var(--ui-backdrop-hue-rotate,) var(--ui-backdrop-invert,) var(--ui-backdrop-opacity,) var(--ui-backdrop-saturate,) var(--ui-backdrop-sepia,)",
    },
  },
  "[data-closed]": {
    animation:
      "exit var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
    "--ui-animation-fill-mode": "forwards",
    "--ui-exit-opacity": firstThatWorks("0", "calc(0/100)"),
  },
});

const header = ui({
  display: "flex",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 0.5)",
  padding: "calc(var(--spacing) * 4)",
});

const footer = ui({
  marginTop: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 2)",
  padding: "calc(var(--spacing) * 4)",
});

const title = ui(text.heading, text.medium, {
  fontSize: "var(--text-base)",
  lineHeight: "var(--ui-leading, var(--text-base--line-height))",
  color: "var(--foreground)",
});

const description = ui(text.sm, {
  color: "var(--muted-foreground)",
});

const close = ui(box.transition, icon.plain, icon.sized, {
  position: "absolute",
  top: "calc(var(--spacing) * 4)",
  insetInlineEnd: "calc(var(--spacing) * 4)",
  borderRadius: "var(--radius-xs)",
  opacity: "70%",
  "--ui-ring-offset-color": "var(--background)",
  transitionProperty: "opacity",
  "@media (hover: hover)": {
    ":hover": {
      opacity: "100%",
    },
  },
  "[data-focus-visible]": {
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(2px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "var(--ring)",
    "--ui-ring-offset-width": "2px",
    "--ui-ring-offset-shadow":
      "var(--ui-ring-inset,) 0 0 0 var(--ui-ring-offset-width) var(--ui-ring-offset-color)",
  },
  "[data-disabled]": {
    pointerEvents: "none",
  },
});

export type SheetSide = "top" | "right" | "bottom" | "left";

/**
 * One class, four sides, keyed off `data-side`.
 *
 * It was a `variants()` with a class per side. Upstream writes one class list
 * with `data-[side=…]` in it, and so does this now: the side is an attribute a
 * style can select on, and a rule that lives in a class only the component
 * chooses is a rule the eight styles cannot reach.
 */
const content = ui(box.shadow, {
  position: "fixed",
  zIndex: "50",
  display: "flex",
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 4)",
  backgroundColor: "var(--popover)",
  // The border is drawn INSIDE the fill, so a sheet against the viewport edge
  // does not paint its background over its own rule.
  backgroundClip: "padding-box",
  color: "var(--popover-foreground)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  "--ui-shadow":
    "0 10px 15px -3px var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 4px 6px -4px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
  transitionProperty:
    "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --ui-gradient-from, --ui-gradient-via, --ui-gradient-to, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter, display, content-visibility, overlay, pointer-events",
  transitionTimingFunction: firstThatWorks(
    "var(--ease-in-out)",
    "var(--ui-ease, var(--default-transition-timing-function))",
  ),
  transitionDuration: firstThatWorks(
    "200ms",
    "var(--ui-duration, var(--default-transition-duration))",
  ),
  "--ui-duration": "200ms",
  "--ui-ease": "var(--ease-in-out)",
  // A tenth of the panel and a fade, not the whole of it: the sheet arrives
  // rather than being thrown in from off screen.
  "--ui-enter-opacity": firstThatWorks("0", "calc(0/100)"),
  '[data-side="bottom"]': {
    insetInline: "0px",
    bottom: "0px",
    height: "auto",
    borderTopStyle: "var(--ui-border-style)",
    borderTopWidth: "1px",
    "--ui-enter-translate-y": firstThatWorks("calc(.1*100%)", "calc(10*var(--spacing))"),
  },
  '[data-side="left"]': {
    insetBlock: "0px",
    left: "0px",
    height: "100%",
    width: "calc(3 / 4 * 100%)",
    borderRightStyle: "var(--ui-border-style)",
    borderRightWidth: "1px",
    "--ui-enter-translate-x": firstThatWorks("calc(.1*-100%)", "calc(10*var(--spacing)*-1)"),
  },
  '[data-side="right"]': {
    insetBlock: "0px",
    right: "0px",
    height: "100%",
    width: "calc(3 / 4 * 100%)",
    borderLeftStyle: "var(--ui-border-style)",
    borderLeftWidth: "1px",
    "--ui-enter-translate-x": firstThatWorks("calc(.1*100%)", "calc(10*var(--spacing))"),
  },
  '[data-side="top"]': {
    insetInline: "0px",
    top: "0px",
    height: "auto",
    borderBottomStyle: "var(--ui-border-style)",
    borderBottomWidth: "1px",
    "--ui-enter-translate-y": firstThatWorks("calc(.1*-100%)", "calc(10*var(--spacing)*-1)"),
  },
  "@media (width >= 40rem)": {
    '[data-side="left"]': {
      maxWidth: "var(--container-sm)",
    },
    '[data-side="right"]': {
      maxWidth: "var(--container-sm)",
    },
  },
  "[data-closed]": {
    animation:
      "exit var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
    "--ui-animation-fill-mode": "forwards",
    "--ui-exit-opacity": firstThatWorks("0", "calc(0/100)"),
  },
  '[data-closed][data-side="bottom"]': {
    "--ui-exit-translate-y": firstThatWorks("calc(.1*100%)", "calc(10*var(--spacing))"),
  },
  '[data-closed][data-side="left"]': {
    "--ui-exit-translate-x": firstThatWorks("calc(.1*-100%)", "calc(10*var(--spacing)*-1)"),
  },
  '[data-closed][data-side="right"]': {
    "--ui-exit-translate-x": firstThatWorks("calc(.1*100%)", "calc(10*var(--spacing))"),
  },
  '[data-closed][data-side="top"]': {
    "--ui-exit-translate-y": firstThatWorks("calc(.1*-100%)", "calc(10*var(--spacing)*-1)"),
  },
});

const family = overlayFamily("Sheet");

export interface SheetProps extends OverlayRootProps {}

/**
 * A dialog that comes in from an edge.
 *
 * The same modality as `<Dialog>` — contained focus, an inert page, Escape —
 * with a different shape and a slide rather than a zoom.
 *
 * ```tsx
 * <Sheet>
 *   <SheetTrigger><Button>Filters</Button></SheetTrigger>
 *   <SheetContent side="left">
 *     <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
 *   </SheetContent>
 * </Sheet>
 * ```
 */
export function Sheet(props: Incoming<SheetProps>) {
  return <family.Root {...props} />;
}

export function SheetTrigger(props: Incoming<TriggerPartProps>) {
  return <family.Trigger {...props} />;
}

export interface SheetPortalProps extends OverlayPortalProps {}

/** Names the container the sheet inside is rendered into. See `<DialogPortal>`. */
export function SheetPortal(props: Incoming<SheetPortalProps>) {
  return <OverlayPortal {...props} />;
}

/** What the element behind the sheet looks like and carries. See `<DialogOverlay>`. */
export function SheetOverlay(props: Incoming<UiProps>) {
  registerUnderlay(family.use(), uiProps("sheet-overlay", overlay, props));
  return <></>;
}

export interface SheetContentProps extends UiProps {
  /** @default "right" */
  side?: SheetSide;
  /** @default true */
  showCloseButton?: boolean;
  /** @default true */
  isDismissable?: boolean;
  isKeyboardDismissDisabled?: boolean;
  /** @default "Close" */
  closeLabel?: string;
}

export function SheetContent(props: Incoming<SheetContentProps>) {
  const { state, underlay } = family.use();

  return (
    <Modal
      isOpen={state.isOpen()}
      onOpenChange={state.setOpen}
      isDismissable={props.isDismissable?.() !== false}
      isKeyboardDismissDisabled={props.isKeyboardDismissDisabled?.() === true}
      underlayClass={underlay() === null ? overlay : undefined}
      underlaySlot="sheet-overlay"
      underlayProps={underlay() ?? undefined}
      {...handedOn(props)}
      class={ui(content, props.class?.(), props.className?.())}
      data-slot={props["data-slot"]?.() ?? "sheet-content"}
      data-side={props.side?.() ?? "right"}
    >
      <AriaDialog {...named(props)} class={contents}>
        {props.children}
        <Show when={props.showCloseButton?.() !== false}>
          <button type="button" data-slot="sheet-close" class={close} onClick={() => state.close()}>
            <X />
            <span class={srOnly}>{props.closeLabel?.() ?? "Close"}</span>
          </button>
        </Show>
      </AriaDialog>
    </Modal>
  );
}

/** See `dialog.tsx`: the dialog's own element lays nothing out. */
const contents = ui({
  display: "contents",
});

export function SheetHeader(props: Incoming<UiProps>) {
  return <div {...uiProps("sheet-header", header, props)}>{props.children}</div>;
}

export function SheetFooter(props: Incoming<UiProps>) {
  return <div {...uiProps("sheet-footer", footer, props)}>{props.children}</div>;
}

/** The sheet's accessible name. */
export function SheetTitle(props: Incoming<UiProps>) {
  return (
    <Heading
      {...props}
      slot="title"
      data-slot={props["data-slot"]?.() ?? "sheet-title"}
      class={ui(title, props.class?.(), props.className?.())}
    />
  );
}

export function SheetDescription(props: Incoming<UiProps>) {
  const described = useDialogDescription();
  // The dialog points at this element, and only because the hook was called:
  // a description nothing references is read by whoever goes looking for it
  // and by nobody else.
  return (
    <p {...uiProps("sheet-description", description, props)} id={props.id?.() ?? described?.id()}>
      {props.children}
    </p>
  );
}

export interface SheetCloseProps extends ButtonProps {}

export function SheetClose(props: Incoming<SheetCloseProps>) {
  const { state } = family.use();
  return (
    <Button
      {...props}
      data-slot={props["data-slot"]?.() ?? "sheet-close"}
      variant={props.variant?.() ?? "outline"}
      onPress={(event) => {
        props.onPress?.()?.(event);
        state.close();
      }}
    />
  );
}
