import type { Incoming } from "@barqjs/core";
import { layer, variants } from "@barqjs/css";

import "../theme/layers.ts";
import { icon as iconGroup } from "../lib/shared-icon.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Button, type ButtonProps } from "./button.tsx";

const ui = layer("barq.ui");

export type AttachmentState = "idle" | "uploading" | "processing" | "error" | "done";
export type AttachmentSize = "default" | "sm" | "xs";
export type AttachmentOrientation = "horizontal" | "vertical";
export type AttachmentMediaVariant = "icon" | "image";

/**
 * The state and the size are ATTRIBUTES, and the parts read them from here.
 *
 * A file that is uploading, has failed or is waiting to be picked changes the
 * look of the icon, the title and the description at once. One attribute on
 * the card is what makes that a single write rather than four props threaded
 * through a context.
 */
export const attachmentVariants = variants({
  base: ui({
    position: "relative",
    display: "flex",
    width: "fit-content",
    maxWidth: "100%",
    minWidth: "0px",
    flexShrink: "0",
    flexWrap: "wrap",
    borderRadius: "calc(var(--radius) + 4px)",
    borderStyle: "var(--ui-border-style)",
    borderWidth: "1px",
    backgroundColor: "var(--card)",
    color: "var(--card-foreground)",
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --ui-gradient-from, --ui-gradient-via, --ui-gradient-to",
    transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
    transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
    ":focus-within": {
      "--ui-ring-shadow":
        "var(--ui-ring-inset,) 0 0 0 calc(1px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
      boxShadow:
        "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
      "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
    },
    "@media (hover: hover)": {
      "&:has(> a, > button):hover": {
        backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
      },
    },
    '&[data-state="error"]': {
      borderColor: "color-mix(in oklab, var(--destructive) 30%, transparent)",
    },
    // Dashed while there is nothing there yet: the card is a drop target
    // rather than a file.
    '&[data-state="idle"]': {
      borderStyle: "dashed",
    },
  }),
  variants: {
    size: {
      default: ui({
        gap: "calc(var(--spacing) * 2)",
        fontSize: "var(--text-sm)",
        lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
        '&:has([data-slot="attachment-content"])': {
          paddingInline: "calc(var(--spacing) * 2.5)",
          paddingBlock: "calc(var(--spacing) * 2)",
        },
        '&:has([data-slot="attachment-media"])': {
          padding: "calc(var(--spacing) * 2)",
        },
      }),
      sm: ui({
        gap: "calc(var(--spacing) * 2.5)",
        fontSize: "var(--text-xs)",
        lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
        '&:has([data-slot="attachment-content"])': {
          paddingInline: "calc(var(--spacing) * 2)",
          paddingBlock: "calc(var(--spacing) * 1.5)",
        },
        '&:has([data-slot="attachment-media"])': {
          padding: "calc(var(--spacing) * 1.5)",
        },
      }),
      xs: ui({
        gap: "calc(var(--spacing) * 1.5)",
        borderRadius: "var(--radius)",
        fontSize: "var(--text-xs)",
        lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
        '&:has([data-slot="attachment-content"])': {
          paddingInline: "calc(var(--spacing) * 1.5)",
          paddingBlock: "var(--spacing)",
        },
        '&:has([data-slot="attachment-media"])': {
          padding: "var(--spacing)",
        },
      }),
    },
    orientation: {
      horizontal: ui({
        minWidth: "calc(var(--spacing) * 40)",
        alignItems: "center",
      }),
      vertical: ui({
        width: "calc(var(--spacing) * 24)",
        flexDirection: "column",
        '&:has([data-slot="attachment-content"])': {
          width: "calc(var(--spacing) * 30)",
        },
      }),
    },
  },
  defaults: { size: "default", orientation: "horizontal" },
});

export const attachmentMediaVariants = variants({
  base: ui(iconGroup.plain, {
    position: "relative",
    display: "flex",
    aspectRatio: "1 / 1",
    width: "calc(var(--spacing) * 10)",
    flexShrink: "0",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: "var(--radius)",
    backgroundColor: "var(--muted)",
    color: "var(--foreground)",
    '& svg:not([class*="size-"])': {
      width: "calc(var(--spacing) * 4)",
      height: "calc(var(--spacing) * 4)",
    },
    '[data-slot="attachment"][data-orientation="vertical"] &': {
      width: "100%",
    },
    '[data-slot="attachment"][data-orientation="vertical"] & svg:not([class*="size-"])': {
      width: "calc(var(--spacing) * 6)",
      height: "calc(var(--spacing) * 6)",
    },
    '[data-slot="attachment"][data-size="sm"] &': {
      width: "calc(var(--spacing) * 8)",
    },
    '[data-slot="attachment"][data-size="xs"] &': {
      width: "calc(var(--spacing) * 7)",
      borderRadius: "calc(var(--radius) - 2px)",
    },
    '[data-slot="attachment"][data-size="xs"] & svg:not([class*="size-"])': {
      width: "calc(var(--spacing) * 3.5)",
      height: "calc(var(--spacing) * 3.5)",
    },
    '[data-slot="attachment"][data-state="error"] &': {
      backgroundColor: "color-mix(in oklab, var(--destructive) 10%, transparent)",
      color: "var(--destructive)",
    },
  }),
  variants: {
    variant: {
      icon: "",
      // Dimmed until the upload finishes, so a thumbnail reads as pending
      // without a second element saying so.
      image: ui({
        opacity: "60%",
        '[data-slot="attachment"][data-state="done"] &': { opacity: "100%" },
        '[data-slot="attachment"][data-state="idle"] &': { opacity: "100%" },
        "& > img": {
          aspectRatio: "1 / 1",
          width: "100%",
          objectFit: "cover",
        },
      }),
    },
  },
  defaults: { variant: "icon" },
});

const content = ui({
  maxWidth: "100%",
  minWidth: "0px",
  flex: "1",
  "--ui-leading": "var(--leading-tight)",
  lineHeight: "var(--leading-tight)",
  '[data-slot="attachment"][data-orientation="vertical"] &': {
    paddingInline: "var(--spacing)",
  },
});

const title = ui(text.medium, {
  display: "block",
  maxWidth: "100%",
  minWidth: "0px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const description = ui({
  marginTop: "calc(var(--spacing) * 0.5)",
  display: "block",
  maxWidth: "100%",
  minWidth: "0px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  color: "var(--muted-foreground)",
  '[data-slot="attachment"][data-state="error"] &': {
    color: "color-mix(in oklab, var(--destructive) 80%, transparent)",
  },
});

const actions = ui({
  position: "relative",
  zIndex: "20",
  display: "flex",
  flexShrink: "0",
  alignItems: "center",
  // Over the thumbnail rather than beside it, because a vertical card has no
  // room in the row for a remove button.
  '[data-slot="attachment"][data-orientation="vertical"] &': {
    position: "absolute",
    top: "calc(var(--spacing) * 3)",
    right: "calc(var(--spacing) * 3)",
    gap: "var(--spacing)",
  },
});

const trigger = ui({
  position: "absolute",
  inset: "0px",
  zIndex: "10",
  "--ui-outline-style": "none",
  outlineStyle: "none",
});

const group = ui({
  display: "flex",
  minWidth: "0px",
  scrollSnapType: "x var(--ui-scroll-snap-strictness)",
  "--ui-scroll-snap-strictness": "mandatory",
  scrollPaddingInline: "var(--spacing)",
  gap: "calc(var(--spacing) * 3)",
  overflowX: "auto",
  overscrollBehaviorX: "contain",
  paddingBlock: "var(--spacing)",
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": { display: "none" },
  '& > [data-slot="attachment"]': {
    flex: "none",
    scrollSnapAlign: "start",
  },
});

export interface AttachmentProps extends UiProps {
  /** @default "done" */
  state?: AttachmentState;
  /** @default "default" */
  size?: AttachmentSize;
  /** @default "horizontal" */
  orientation?: AttachmentOrientation;
}

/**
 * A file on a card: an icon or a thumbnail, a name, a size, and what is
 * happening to it.
 *
 * ```tsx
 * <Attachment state="uploading">
 *   <AttachmentMedia><FileText /></AttachmentMedia>
 *   <AttachmentContent>
 *     <AttachmentTitle>report.pdf</AttachmentTitle>
 *     <AttachmentDescription>2.4 MB</AttachmentDescription>
 *   </AttachmentContent>
 * </Attachment>
 * ```
 */
export function Attachment(props: Incoming<AttachmentProps>) {
  return (
    <div
      {...uiProps(
        "attachment",
        () =>
          ui(
            attachmentVariants({ size: props.size?.(), orientation: props.orientation?.() }),
            "group/attachment",
          ),
        props,
      )}
      data-state={props.state?.() ?? "done"}
      data-size={props.size?.() ?? "default"}
      data-orientation={props.orientation?.() ?? "horizontal"}
    >
      {props.children}
    </div>
  );
}

/** A row of them that scrolls sideways and snaps. */
export function AttachmentGroup(props: Incoming<UiProps>) {
  return <div {...uiProps("attachment-group", group, props)}>{props.children}</div>;
}

export interface AttachmentMediaProps extends UiProps {
  /** @default "icon" */
  variant?: AttachmentMediaVariant;
}

export function AttachmentMedia(props: Incoming<AttachmentMediaProps>) {
  return (
    <div
      {...uiProps(
        "attachment-media",
        () => attachmentMediaVariants({ variant: props.variant?.() }),
        props,
      )}
      data-variant={props.variant?.() ?? "icon"}
    >
      {props.children}
    </div>
  );
}

export function AttachmentContent(props: Incoming<UiProps>) {
  return <div {...uiProps("attachment-content", content, props)}>{props.children}</div>;
}

export function AttachmentTitle(props: Incoming<UiProps>) {
  return <span {...uiProps("attachment-title", title, props)}>{props.children}</span>;
}

export function AttachmentDescription(props: Incoming<UiProps>) {
  return <span {...uiProps("attachment-description", description, props)}>{props.children}</span>;
}

export function AttachmentActions(props: Incoming<UiProps>) {
  return <div {...uiProps("attachment-actions", actions, props)}>{props.children}</div>;
}

export interface AttachmentActionProps extends ButtonProps {}

export function AttachmentAction(props: Incoming<AttachmentActionProps>) {
  return (
    <Button
      {...props}
      data-slot={props["data-slot"]?.() ?? "attachment-action"}
      variant={props.variant?.() ?? "ghost"}
      size={props.size?.() ?? "icon-xs"}
    />
  );
}

export interface AttachmentTriggerProps extends UiProps {
  onPress?: () => void;
}

/**
 * The whole card as one press target, laid over it.
 *
 * A button around the card would put the remove button INSIDE a button, which
 * no browser renders and no screen reader can describe. This is a sibling with
 * a lower `z-index` than the actions, so the actions still take their presses.
 */
export function AttachmentTrigger(props: Incoming<AttachmentTriggerProps>) {
  return (
    <button
      {...uiProps("attachment-trigger", trigger, props)}
      type="button"
      onClick={() => props.onPress?.()?.()}
    >
      {props.children}
    </button>
  );
}
