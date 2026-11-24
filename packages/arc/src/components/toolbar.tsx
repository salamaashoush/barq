import { type Child } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Toolbar as AriaToolbar } from "@barqjs/aria/toolbar";
import { on } from "@barqjs/ui/conditions";
import { Separator } from "@barqjs/ui/separator";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, edge, gap, layout, rounded, space, surface, zIndex } from "../style/index.ts";

export const toolbarStyles = variants({
  slots: {
    root: arc(layout.row, gap[1], { minWidth: "0px" }),
  },
  variants: {
    variant: {
      /** In the flow, no surface of its own. */
      plain: {},
      /** A pill over the content: a canvas's tools, a selection's actions. */
      floating: { root: arc(surface.elevated, rounded.full, { padding: space.x1 }) },
      /**
       * Along the bottom of a pane, and on a compact window held at the
       * bottom of the screen above the home indicator, as Material's docked
       * toolbar is.
       */
      docked: {
        root: arc(edge.top, bg.page, {
          padding: space.x1_5,
          [on.belowMd]: {
            position: "sticky",
            insetBlockEnd: "0",
            zIndex: zIndex.sticky,
            justifyContent: "space-around",
            paddingBlockEnd: "max(calc(var(--spacing) * 1.5), env(safe-area-inset-bottom))",
          },
        }),
      },
    },
    orientation: {
      horizontal: {},
      vertical: { root: arc(layout.column, { alignItems: "stretch" }) },
    },
  },
  defaults: { variant: "plain", orientation: "horizontal" },
});

type Slots = ReturnType<typeof toolbarStyles>;

export interface ToolbarProps extends Customisable<Slots> {
  /** Names the toolbar: "Formatting", "Canvas tools". */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** @default "plain" */
  variant?: "plain" | "floating" | "docked";
  /** @default "horizontal" */
  orientation?: "horizontal" | "vertical";
  children?: Child;
}

/**
 * A row of controls that Tab enters once, on `@barqjs/aria`'s toolbar: the
 * arrows move between them in the reading direction, Tab leaves from the
 * end, and coming back lands on the control last used.
 *
 * ```tsx
 * <Toolbar aria-label="Formatting" variant="floating">
 *   <IconButton label="Bold"><Bold /></IconButton>
 *   <IconButton label="Italic"><Italic /></IconButton>
 *   <ToolbarSeparator />
 *   <IconButton label="Link"><Link /></IconButton>
 * </Toolbar>
 * ```
 *
 * `floating` is a pill over the content; `docked` is a bar along a pane's
 * bottom that, on a compact window, holds to the bottom of the screen clear
 * of the home indicator.
 */
export function Toolbar(props: ToolbarProps) {
  function cls() {
    return parts(
      toolbarStyles({ variant: props.variant, orientation: props.orientation }),
      props.classes,
    );
  }
  return (
    <AriaToolbar
      class={arc(cls().root, props.class, props.className)}
      data-slot="toolbar"
      data-variant={props.variant ?? "plain"}
      orientation={props.orientation}
      aria-label={props["aria-label"]}
      aria-labelledby={props["aria-labelledby"]}
    >
      {props.children}
    </AriaToolbar>
  );
}

export interface ToolbarSeparatorProps {
  class?: string;
  /** Across the toolbar's own direction. @default "vertical" */
  orientation?: "horizontal" | "vertical";
}

/** A line between groups of a toolbar's controls. */
export function ToolbarSeparator(props: ToolbarSeparatorProps) {
  return (
    <Separator
      class={arc({ alignSelf: "stretch", marginBlock: space.x1 }, props.class)}
      data-slot="toolbar-separator"
      orientation={props.orientation ?? "vertical"}
    />
  );
}
