import { Dialog as AriaDialog, Heading, Modal } from "@barqjs/aria/dialog";
import type { Child, Incoming } from "@barqjs/core";
import { atomsIn, firstThatWorks } from "@barqjs/css";

import "../theme/layers.ts";
import { overlayFamily, type OverlayRootProps } from "../lib/overlay.tsx";
import { ui } from "../lib/atoms.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Button, type ButtonProps } from "./button.tsx";

const overlay = atomsIn("barq.ui", {
  position: "fixed",
  inset: "0px",
  zIndex: "50",
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  backgroundColor: "color-mix(in srgb, #000 50%, transparent)",
  "--ui-enter-opacity": firstThatWorks("0", "calc(0/100)"),
  "@supports (color: color-mix(in lab, red, red))": {
    backgroundColor: "color-mix(in oklab, var(--color-black) 50%, transparent)",
  },
  "[data-closed]": {
    animation:
      "exit var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
    "--ui-exit-opacity": firstThatWorks("0", "calc(0/100)"),
  },
});

const header = atomsIn("barq.ui", {
  display: "grid",
  gridTemplateRows: "auto 1fr",
  placeItems: "center",
  gap: "calc(var(--spacing) * 1.5)",
  textAlign: "center",
  ':has([data-slot="alert-dialog-media"])': {
    gridTemplateRows: "auto auto 1fr",
    columnGap: "calc(var(--spacing) * 6)",
  },
  "@media (width >= 40rem)": {
    '[data-slot="alert-dialog-content"][data-size="default"] &': {
      placeItems: "start",
      textAlign: "left",
    },
  },
});

const footer = atomsIn("barq.ui", {
  display: "flex",
  flexDirection: "column-reverse",
  gap: "calc(var(--spacing) * 2)",
  "@media (width >= 40rem)": {
    "&": {
      flexDirection: "row",
      justifyContent: "flex-end",
    },
  },
  '[data-slot="alert-dialog-content"][data-size="sm"] &': {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  },
});

const title = atomsIn("barq.ui", {
  fontSize: "var(--text-lg)",
  lineHeight: "var(--ui-leading, var(--text-lg--line-height))",
  "--ui-font-weight": "var(--font-weight-semibold)",
  fontWeight: "var(--font-weight-semibold)",
});

const description = atomsIn("barq.ui", {
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  color: "var(--muted-foreground)",
});

const media = atomsIn("barq.ui", {
  marginBottom: "calc(var(--spacing) * 2)",
  display: "inline-flex",
  width: "calc(var(--spacing) * 16)",
  height: "calc(var(--spacing) * 16)",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "calc(var(--radius) - 2px)",
  backgroundColor: "var(--muted)",
  '& > svg:not([class*="size-"])': {
    width: "calc(var(--spacing) * 8)",
    height: "calc(var(--spacing) * 8)",
  },
  "@media (width >= 40rem)": {
    '[data-slot="alert-dialog-content"][data-size="default"] &': {
      gridRow: "span 2 / span 2",
    },
  },
});

export type AlertDialogSize = "default" | "sm";

/** The size is an attribute the CSS reads, so there is one class and not two. */
const content = atomsIn("barq.ui", {
  position: "fixed",
  top: "50%",
  left: "50%",
  zIndex: "50",
  display: "grid",
  width: "100%",
  maxWidth: "calc(100% - 2rem)",
  "--ui-translate-x": "-50%",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  "--ui-translate-y": "-50%",
  animation:
    "enter var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
  gap: "calc(var(--spacing) * 4)",
  borderRadius: "var(--radius)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  backgroundColor: "var(--background)",
  padding: "calc(var(--spacing) * 6)",
  "--ui-shadow":
    "0 10px 15px -3px var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 4px 6px -4px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  "--ui-duration": "200ms",
  transitionDuration: "200ms",
  "--ui-enter-opacity": firstThatWorks("0", "calc(0/100)"),
  "--ui-outline-style": "none",
  outlineStyle: "none",
  "--ui-enter-scale": firstThatWorks("0.95", "calc(95*1%)"),
  '[data-size="sm"]': {
    maxWidth: "var(--container-xs)",
  },
  "@media (width >= 40rem)": {
    '[data-size="default"]': {
      maxWidth: "var(--container-lg)",
    },
  },
  "[data-closed]": {
    animation:
      "exit var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
    "--ui-exit-opacity": firstThatWorks("0", "calc(0/100)"),
    "--ui-exit-scale": firstThatWorks("0.95", "calc(95*1%)"),
  },
});

const family = overlayFamily("AlertDialog");

export interface AlertDialogProps extends OverlayRootProps {}

/**
 * A dialog that interrupts, for a choice that cannot be dismissed by ignoring
 * it.
 *
 * `role="alertdialog"`, and neither an outside press nor Escape closes it: the
 * user has to answer. That is the whole difference from `<Dialog>`, and it is
 * why the close button in the corner is not here either.
 *
 * ```tsx
 * <AlertDialog>
 *   <AlertDialogTrigger><Button variant="destructive">Delete</Button></AlertDialogTrigger>
 *   <AlertDialogContent>
 *     <AlertDialogHeader>
 *       <AlertDialogTitle>Delete the project?</AlertDialogTitle>
 *       <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
 *     </AlertDialogHeader>
 *     <AlertDialogFooter>
 *       <AlertDialogCancel>Cancel</AlertDialogCancel>
 *       <AlertDialogAction variant="destructive" onPress={remove}>Delete</AlertDialogAction>
 *     </AlertDialogFooter>
 *   </AlertDialogContent>
 * </AlertDialog>
 * ```
 */
export function AlertDialog(props: Incoming<AlertDialogProps>) {
  return <family.Root {...props} />;
}

export function AlertDialogTrigger(props: Incoming<{ children?: Child }>) {
  return <family.Trigger {...props} />;
}

export interface AlertDialogContentProps extends UiProps {
  /** @default "default" */
  size?: AlertDialogSize;
}

export function AlertDialogContent(props: Incoming<AlertDialogContentProps>) {
  const { state } = family.use();

  return (
    <Modal
      isOpen={state.isOpen()}
      onOpenChange={state.setOpen}
      // A press outside decides nothing, which is what makes it an ALERT
      // dialog. Escape still closes it: Radix prevents only the outside
      // interaction, and the APG asks for Escape on every dialog, alert or not.
      isDismissable={false}
      underlayClass={overlay}
      class={ui(content, props.class?.(), props.className?.())}
      data-slot={props["data-slot"]?.() ?? "alert-dialog-content"}
      data-size={props.size?.() ?? "default"}
    >
      <AriaDialog role="alertdialog" class={contents}>
        {props.children}
      </AriaDialog>
    </Modal>
  );
}

/** See `dialog.tsx`: the dialog's own element lays nothing out. */
const contents = atomsIn("barq.ui", {
  display: "contents",
});

export function AlertDialogHeader(props: Incoming<UiProps>) {
  return <div {...uiProps("alert-dialog-header", header, props)}>{props.children}</div>;
}

export function AlertDialogFooter(props: Incoming<UiProps>) {
  return <div {...uiProps("alert-dialog-footer", footer, props)}>{props.children}</div>;
}

/** An icon above the title, for the one that says what kind of interruption this is. */
export function AlertDialogMedia(props: Incoming<UiProps>) {
  return <div {...uiProps("alert-dialog-media", media, props)}>{props.children}</div>;
}

export function AlertDialogTitle(props: Incoming<UiProps>) {
  return (
    <Heading
      {...props}
      slot="title"
      data-slot={props["data-slot"]?.() ?? "alert-dialog-title"}
      class={ui(title, props.class?.(), props.className?.())}
    />
  );
}

export function AlertDialogDescription(props: Incoming<UiProps>) {
  return <p {...uiProps("alert-dialog-description", description, props)}>{props.children}</p>;
}

export interface AlertDialogActionProps extends ButtonProps {}

/** The button that does the thing. It closes the dialog after its own handler. */
export function AlertDialogAction(props: Incoming<AlertDialogActionProps>) {
  const { state } = family.use();
  return (
    <Button
      {...props}
      data-slot={props["data-slot"]?.() ?? "alert-dialog-action"}
      onPress={(event) => {
        props.onPress?.()?.(event);
        state.close();
      }}
    />
  );
}

/** The button that does not. Outlined by default, which is shadcn's arrangement. */
export function AlertDialogCancel(props: Incoming<AlertDialogActionProps>) {
  const { state } = family.use();
  return (
    <Button
      {...props}
      data-slot={props["data-slot"]?.() ?? "alert-dialog-cancel"}
      variant={props.variant?.() ?? "outline"}
      onPress={(event) => {
        props.onPress?.()?.(event);
        state.close();
      }}
    />
  );
}
