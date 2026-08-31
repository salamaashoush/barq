import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

export type MessageAlign = "start" | "end";

const group = ui({
  display: "flex",
  minWidth: "0px",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 2)",
});

const root = ui(text.sm, {
  position: "relative",
  display: "flex",
  width: "100%",
  minWidth: "0px",
  gap: "calc(var(--spacing) * 2)",
  // The whole row turns over rather than each part being placed twice: one
  // attribute decides which side of the conversation this is.
  '&[data-align="end"]': {
    flexDirection: "row-reverse",
  },
});

const avatar = ui({
  display: "flex",
  width: "fit-content",
  minWidth: "calc(var(--spacing) * 8)",
  flexShrink: "0",
  alignItems: "center",
  justifyContent: "center",
  alignSelf: "flex-end",
  overflow: "hidden",
  borderRadius: "calc(infinity * 1px)",
  backgroundColor: "var(--muted)",
  // A footer under the bubble pushes the row's baseline down, and the avatar
  // belongs beside the bubble rather than beside the timestamp.
  '[data-slot="message"]:has([data-slot="message-footer"]) &': {
    "--ui-translate-y": "calc(var(--spacing) * -8)",
    translate: "var(--ui-translate-x) var(--ui-translate-y)",
  },
});

const content = ui({
  display: "flex",
  width: "100%",
  minWidth: "0px",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 2.5)",
  overflowWrap: "break-word",
  '[data-slot="message"][data-align="end"] & > [data-slot]': {
    alignSelf: "flex-end",
  },
});

const band = ui(text.medium, {
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  display: "flex",
  maxWidth: "100%",
  minWidth: "0px",
  alignItems: "center",
  paddingInline: "calc(var(--spacing) * 3)",
  color: "var(--muted-foreground)",
  // A ghost bubble has no padding of its own, so the label above it must not
  // sit indented from nothing.
  '[data-slot="message"]:has([data-variant="ghost"]) &': {
    paddingInline: "0px",
  },
});

const footer = ui(band, {
  '[data-slot="message"][data-align="end"] &': {
    justifyContent: "flex-end",
  },
});

/** A run of messages, one under another. */
export function MessageGroup(props: Incoming<UiProps>) {
  return <div {...uiProps("message-group", group, props)}>{props.children}</div>;
}

export interface MessageProps extends UiProps {
  /** Which side of the conversation. @default "start" */
  align?: MessageAlign;
}

/**
 * One message: an avatar, and a column holding a header, bubbles and a footer.
 *
 * ```tsx
 * <Message align="end">
 *   <MessageContent>
 *     <Bubble align="end"><BubbleContent>On my way</BubbleContent></Bubble>
 *     <MessageFooter>Sent</MessageFooter>
 *   </MessageContent>
 * </Message>
 * ```
 */
export function Message(props: Incoming<MessageProps>) {
  return (
    <div
      {...uiProps("message", () => ui(root, "group/message"), props)}
      data-align={props.align?.() ?? "start"}
    >
      {props.children}
    </div>
  );
}

export function MessageAvatar(props: Incoming<UiProps>) {
  return <div {...uiProps("message-avatar", avatar, props)}>{props.children}</div>;
}

export function MessageContent(props: Incoming<UiProps>) {
  return <div {...uiProps("message-content", content, props)}>{props.children}</div>;
}

/** The name and the time above the bubbles. */
export function MessageHeader(props: Incoming<UiProps>) {
  return <div {...uiProps("message-header", band, props)}>{props.children}</div>;
}

/** The delivery state under them. */
export function MessageFooter(props: Incoming<UiProps>) {
  return <div {...uiProps("message-footer", footer, props)}>{props.children}</div>;
}
