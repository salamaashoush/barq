import { Show, signal, type Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

const root = ui(box.noSelect, {
  position: "relative",
  display: "flex",
  width: "calc(var(--spacing) * 8)",
  height: "calc(var(--spacing) * 8)",
  flexShrink: "0",
  overflow: "hidden",
  borderRadius: "calc(infinity * 1px)",
  '[data-size="lg"]': {
    width: "calc(var(--spacing) * 10)",
    height: "calc(var(--spacing) * 10)",
  },
  '[data-size="sm"]': {
    width: "calc(var(--spacing) * 6)",
    height: "calc(var(--spacing) * 6)",
  },
});

const image = ui({
  aspectRatio: "1 / 1",
  width: "100%",
  height: "100%",
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
