import { Show, signal, type Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const root = css`
  @layer barq.ui {
    position: relative;
    display: flex;
    width: calc(var(--spacing) * 8);
    height: calc(var(--spacing) * 8);
    flex-shrink: 0;
    overflow: hidden;
    border-radius: calc(infinity * 1px);
    -webkit-user-select: none;
    user-select: none;
    &[data-size="lg"] {
      width: calc(var(--spacing) * 10);
      height: calc(var(--spacing) * 10);
    }
    &[data-size="sm"] {
      width: calc(var(--spacing) * 6);
      height: calc(var(--spacing) * 6);
    }
  }
`;

const image = css`
  @layer barq.ui {
    aspect-ratio: 1 / 1;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const fallback = css`
  @layer barq.ui {
    display: flex;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    border-radius: calc(infinity * 1px);
    background-color: var(--muted);
    font-size: var(--text-sm);
    line-height: var(--ui-leading, var(--text-sm--line-height));
    color: var(--muted-foreground);
    [data-size="sm"] & {
      font-size: var(--text-xs);
      line-height: var(--ui-leading, var(--text-xs--line-height));
    }
  }
`;

const badge = css`
  @layer barq.ui {
    position: absolute;
    right: 0px;
    bottom: 0px;
    z-index: 10;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: calc(infinity * 1px);
    background-color: var(--primary);
    color: var(--primary-foreground);
    --ui-ring-shadow: var(--ui-ring-inset,) 0 0 0 calc(2px + var(--ui-ring-offset-width))
      var(--ui-ring-color, currentcolor);
    box-shadow:
      var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
      var(--ui-ring-shadow), var(--ui-shadow);
    --ui-ring-color: var(--background);
    -webkit-user-select: none;
    user-select: none;
    [data-size="default"] & {
      width: calc(var(--spacing) * 2.5);
      height: calc(var(--spacing) * 2.5);
    }
    [data-size="default"] & > svg {
      width: calc(var(--spacing) * 2);
      height: calc(var(--spacing) * 2);
    }
    [data-size="lg"] & {
      width: calc(var(--spacing) * 3);
      height: calc(var(--spacing) * 3);
    }
    [data-size="lg"] & > svg {
      width: calc(var(--spacing) * 2);
      height: calc(var(--spacing) * 2);
    }
    [data-size="sm"] & {
      width: calc(var(--spacing) * 2);
      height: calc(var(--spacing) * 2);
    }
    [data-size="sm"] & > svg {
      display: none;
    }
  }
`;

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
