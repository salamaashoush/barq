import { Show, signal, type Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

// A marker: the badge and the fallback read the avatar's size back through
// `.group\/avatar[data-size=…]`.
const root = ui(box.noSelect, "group/avatar", {
  position: "relative",
  display: "flex",
  width: "calc(var(--spacing) * 8)",
  height: "calc(var(--spacing) * 8)",
  flexShrink: "0",
  borderRadius: "calc(infinity * 1px)",
  // The edge is a blended pseudo-element rather than `overflow: hidden` on the
  // avatar itself, which is what lets the badge hang outside the circle.
  "::after": {
    content: "var(--ui-content)",
    position: "absolute",
    inset: "0px",
    borderRadius: "calc(infinity * 1px)",
    borderStyle: "var(--ui-border-style)",
    borderWidth: "1px",
    borderColor: "var(--border)",
    mixBlendMode: "darken",
  },
  '[data-size="lg"]': {
    width: "calc(var(--spacing) * 10)",
    height: "calc(var(--spacing) * 10)",
  },
  '[data-size="sm"]': {
    width: "calc(var(--spacing) * 6)",
    height: "calc(var(--spacing) * 6)",
  },
  ":is(.dark *)::after": {
    content: "var(--ui-content)",
    mixBlendMode: "lighten",
  },
});

const image = ui({
  aspectRatio: "1 / 1",
  width: "100%",
  height: "100%",
  borderRadius: "calc(infinity * 1px)",
  objectFit: "cover",
});

const fallback = ui(text.sm, {
  display: "flex",
  width: "100%",
  height: "100%",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "calc(infinity * 1px)",
  backgroundColor: "var(--muted)",
  color: "var(--muted-foreground)",
  '[data-size="sm"] &': {
    fontSize: "var(--text-xs)",
    lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  },
});

const badge = ui(box.shadow, box.noSelect, {
  position: "absolute",
  right: "0px",
  bottom: "0px",
  zIndex: "10",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "calc(infinity * 1px)",
  backgroundColor: "var(--primary)",
  color: "var(--primary-foreground)",
  backgroundBlendMode: "color",
  "--ui-ring-shadow":
    "var(--ui-ring-inset,) 0 0 0 calc(2px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
  "--ui-ring-color": "var(--background)",
  '[data-size="default"] &': {
    width: "calc(var(--spacing) * 2.5)",
    height: "calc(var(--spacing) * 2.5)",
  },
  '[data-size="default"] & > svg': {
    width: "calc(var(--spacing) * 2)",
    height: "calc(var(--spacing) * 2)",
  },
  '[data-size="lg"] &': {
    width: "calc(var(--spacing) * 3)",
    height: "calc(var(--spacing) * 3)",
  },
  '[data-size="lg"] & > svg': {
    width: "calc(var(--spacing) * 2)",
    height: "calc(var(--spacing) * 2)",
  },
  '[data-size="sm"] &': {
    width: "calc(var(--spacing) * 2)",
    height: "calc(var(--spacing) * 2)",
  },
  '[data-size="sm"] & > svg': {
    display: "none",
  },
});

export type AvatarSize = "default" | "sm" | "lg";

export interface AvatarProps extends UiProps {
  size?: AvatarSize;
}

/**
 * ```tsx
 * <Avatar>
 *   <AvatarImage src={user.photo} alt="" />
 *   <AvatarFallback>SA</AvatarFallback>
 * </Avatar>
 * ```
 */
export function Avatar(props: Incoming<AvatarProps>) {
  return (
    <span {...uiProps("avatar", root, props)} data-size={props.size?.() ?? "default"}>
      {props.children}
    </span>
  );
}

export interface AvatarImageProps extends UiProps {
  src?: string;
  alt?: string;
  /** Called when the image cannot be loaded, after the fallback has taken over. */
  onLoadingStatusChange?: (status: "loading" | "loaded" | "error") => void;
}

/**
 * The photo, which removes itself when it fails.
 *
 * Radix loads the image in JavaScript and renders nothing until it succeeds.
 * This renders the `<img>` and hides it on `error`, so a cached image paints
 * with the document instead of one frame after hydration.
 */
export function AvatarImage(props: Incoming<AvatarImageProps>) {
  const failed = signal(false);

  return (
    <Show when={!failed()}>
      <img
        {...uiProps("avatar-image", image, props)}
        src={props.src?.()}
        alt={props.alt?.() ?? ""}
        onError={() => {
          failed.set(true);
          props.onLoadingStatusChange?.()?.("error");
        }}
        onLoad={() => props.onLoadingStatusChange?.()?.("loaded")}
      />
    </Show>
  );
}

/** Initials, or whatever stands in for a photo that is not there. */
export function AvatarFallback(props: Incoming<UiProps>) {
  return <span {...uiProps("avatar-fallback", fallback, props)}>{props.children}</span>;
}

/** A dot in the corner: presence, a count, a tick. */
export function AvatarBadge(props: Incoming<UiProps>) {
  return <span {...uiProps("avatar-badge", badge, props)}>{props.children}</span>;
}

const group = ui({
  display: "flex",
  ":where(& > :not(:last-child))": {
    "--ui-space-x-reverse": "0",
    marginInlineStart: "calc(calc(var(--spacing) * -2) * var(--ui-space-x-reverse))",
    marginInlineEnd: "calc(calc(var(--spacing) * -2) * calc(1 - var(--ui-space-x-reverse)))",
  },
  '& > [data-slot="avatar"]': {
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(2px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "var(--background)",
  },
});

const groupCount = ui(text.sm, {
  position: "relative",
  display: "flex",
  width: "calc(var(--spacing) * 8)",
  height: "calc(var(--spacing) * 8)",
  flexShrink: "0",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "calc(infinity * 1px)",
  backgroundColor: "var(--muted)",
  color: "var(--muted-foreground)",
  "--ui-ring-shadow":
    "var(--ui-ring-inset,) 0 0 0 calc(2px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  "--ui-ring-color": "var(--background)",
  // Off the GROUP's own size, through `:has`, rather than off a marker class:
  // the count is not an avatar and has no `data-size` of its own, and it has
  // to match the avatars beside it.
  '[data-slot="avatar-group"]:has([data-size="lg"]) &': {
    width: "calc(var(--spacing) * 10)",
    height: "calc(var(--spacing) * 10)",
  },
  '[data-slot="avatar-group"]:has([data-size="sm"]) &': {
    width: "calc(var(--spacing) * 6)",
    height: "calc(var(--spacing) * 6)",
  },
  "& > svg": {
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
  },
  '[data-slot="avatar-group"]:has([data-size="lg"]) & > svg': {
    width: "calc(var(--spacing) * 5)",
    height: "calc(var(--spacing) * 5)",
  },
  '[data-slot="avatar-group"]:has([data-size="sm"]) & > svg': {
    width: "calc(var(--spacing) * 3)",
    height: "calc(var(--spacing) * 3)",
  },
});

/**
 * A row of overlapping avatars.
 *
 * The ring on each one is drawn from HERE and not by `<Avatar>`, because a
 * lone avatar has nothing to be separated from: the ring exists to cut the
 * one behind it, and putting it on the avatar would draw a halo around every
 * single one on the page.
 */
export function AvatarGroup(props: Incoming<UiProps>) {
  return (
    <div {...uiProps("avatar-group", ui(group, "group/avatar-group"), props)}>{props.children}</div>
  );
}

/** The "+3" at the end of the row, which is not an avatar and has no image. */
export function AvatarGroupCount(props: Incoming<UiProps>) {
  return <div {...uiProps("avatar-group-count", groupCount, props)}>{props.children}</div>;
}
