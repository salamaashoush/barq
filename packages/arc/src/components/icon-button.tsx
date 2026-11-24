import { type Child, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { PressEvent } from "@barqjs/aria/interactions";
import { Button, type ButtonVariant } from "@barqjs/ui/button";
import { Kbd } from "@barqjs/ui/kbd";
import { Tooltip, TooltipContent } from "@barqjs/ui/tooltip";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { gap, layout } from "../style/index.ts";

export type IconButtonSize = "xs" | "sm" | "md" | "lg";

const SIZES = { xs: "icon-xs", sm: "icon-sm", md: "icon", lg: "icon-lg" } as const;

export const iconButtonStyles = variants({
  slots: {
    root: arc({}),
    tooltip: arc(layout.inlineRow, gap[2]),
    shortcut: arc({}),
  },
});

type Slots = ReturnType<typeof iconButtonStyles>;

export interface IconButtonProps extends Customisable<Slots> {
  /**
   * What the button does, in words. It names the button for a screen reader
   * and is the tooltip, so the icon is never the only thing saying it.
   */
  label: string;
  /** The icon, hidden from assistive tech. */
  children: Child;
  /** @default "ghost" */
  variant?: ButtonVariant;
  /** @default "md" */
  size?: IconButtonSize;
  /** A key that does the same, shown in the tooltip: `"⌘K"`. */
  shortcut?: string;
  /** Show the label on hover and focus. A touch screen never shows it. @default true */
  tooltip?: boolean;
  /** @default "top" */
  tooltipSide?: "top" | "bottom" | "left" | "right";
  /** Held on: a toggle. Sets `aria-pressed`. */
  isPressed?: boolean;
  /** Whether what it opens or folds is open. */
  "aria-expanded"?: boolean;
  /** The element it opens, folds or acts on. */
  "aria-controls"?: string;
  isDisabled?: boolean;
  /** A link drawn as the button. */
  href?: string;
  onPress?: (event: PressEvent) => void;
  id?: string;
  /** The button's `data-slot`, for a component that draws one as its own part. @default "icon-button" */
  slot?: string;
}

/**
 * A button that is an icon, with its label required: the label names it and
 * is shown as a tooltip on hover and keyboard focus.
 *
 * ```tsx
 * <IconButton label="Delete" variant="destructive" onPress={remove}><Trash2 /></IconButton>
 * <IconButton label="Search" shortcut="⌘K" onPress={openSearch}><Search /></IconButton>
 * ```
 *
 * The tooltip only repeats the name: a touch screen, which has no hover,
 * loses nothing, and the button keeps ui's 44px target under a coarse
 * pointer.
 */
export function IconButton(props: IconButtonProps) {
  function cls() {
    return parts(iconButtonStyles(), props.classes);
  }
  function button() {
    return (
      <Button
        id={props.id}
        class={arc(cls().root, props.class, props.className)}
        data-slot={props.slot ?? "icon-button"}
        variant={props.variant ?? "ghost"}
        size={SIZES[props.size ?? "md"]}
        href={props.href}
        isDisabled={props.isDisabled}
        aria-label={props.label}
        aria-pressed={props.isPressed}
        aria-expanded={props["aria-expanded"]}
        aria-controls={props["aria-controls"]}
        onPress={(event: PressEvent) => props.onPress?.(event)}
      >
        {props.children}
      </Button>
    );
  }
  return (
    <Show when={props.tooltip !== false} fallback={button()}>
      <Tooltip>
        {button()}
        <TooltipContent class={cls().tooltip} side={props.tooltipSide}>
          {props.label}
          <Show when={props.shortcut !== undefined}>
            <Kbd class={cls().shortcut} data-slot="icon-button-shortcut">
              {props.shortcut}
            </Kbd>
          </Show>
        </TooltipContent>
      </Tooltip>
    </Show>
  );
}
