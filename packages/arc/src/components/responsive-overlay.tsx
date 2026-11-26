import { type Accessor, type Child, Match, Show, Switch, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { mediaQuery } from "@barqjs/primitives/media";
import { type Breakpoint, breakpointQuery } from "@barqjs/ui/conditions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@barqjs/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@barqjs/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@barqjs/ui/popover";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { openState } from "../lib/search-state.ts";
import { gap, layout, space } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

export type OverlayPresentation = "dialog" | "popover" | "sheet";

export const responsiveOverlayStyles = variants({
  slots: {
    root: arc({}),
    header: arc({}),
    title: arc({}),
    description: arc({}),
    body: arc(layout.column, layout.minZeroBlock, gap[3], { overflowY: "auto" }),
    footer: arc({}),
  },
  variants: {
    presentation: {
      dialog: {
        root: arc({
          maxBlockSize: "calc(100dvh - 2rem)",
          gridTemplateRows: "auto minmax(0, 1fr) auto",
        }),
      },
      popover: { root: arc(layout.column, gap[3], { width: "min(22rem, calc(100vw - 2rem))" }) },
      sheet: { body: arc({ paddingInline: space.x4 }) },
    },
  },
  defaults: { presentation: "dialog" },
});

type Slots = ReturnType<typeof responsiveOverlayStyles>;

export interface ResponsiveOverlayProps extends Customisable<Slots> {
  /** Names the overlay. */
  heading: Child;
  description?: Child;
  children?: Child;
  /** Its actions, at the foot. */
  footer?: Child;
  /**
   * The control that opens it: a `Button`, or anything that reads ui's
   * trigger slot. Leave it out to open it with `open`.
   */
  trigger?: Child;
  /** What it is on a wide screen with a fine pointer. @default "dialog" */
  desktop?: "dialog" | "popover";
  /**
   * Below this viewport step, or under a coarse pointer whatever the width,
   * it is a sheet from the bottom. @default "md"
   */
  breakpoint?: Breakpoint;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Read once: open while this search parameter is in the URL, so a link
   * (`?create`) opens it; its trigger still opens it without one, and closing
   * takes the parameter out.
   */
  param?: string;
  /** Read once: parameters the link set beside `param` (`?create&preset=`), taken out with it. */
  clearParams?: readonly string[];
  /** @default the provider's `close`, "Close" */
  closeLabel?: string;
}

/**
 * Whether the screen asks for a sheet: narrower than `breakpoint`, or a
 * finger whatever the width, which reaches the bottom of a tablet more
 * easily than a dialog in its middle.
 */
export function useCompactOverlay(breakpoint: Accessor<Breakpoint>): Accessor<boolean> {
  return mediaQuery(() => `${breakpointQuery(breakpoint(), "down")}, (pointer: coarse)`);
}

/**
 * One overlay that is what the screen suits: a dialog, or a popover beside
 * its trigger, on a wide screen with a mouse, and a sheet rising from the
 * bottom, dragged down to close, on a phone or under a finger.
 *
 * ```tsx
 * <ResponsiveOverlay heading="Filters" trigger={<Button>Filters</Button>} desktop="popover">
 *   <FilterFields />
 * </ResponsiveOverlay>
 * ```
 *
 * The same heading, description, body and footer in each, the same open
 * state across a change of presentation, and each one's own focus,
 * Escape and dismissal. A server, and a page being hydrated, draw the wide
 * one; the browser's answer takes over once hydration ends. With `param` its
 * open state is also a search parameter's, so a create dialog has a link.
 */
export function ResponsiveOverlay(props: ResponsiveOverlayProps) {
  const messages = useArcMessages();
  const compact = useCompactOverlay(() => props.breakpoint ?? "md");
  const { isOpen, setOpen } = openState({
    param: untrack(() => props.param),
    also: untrack(() => props.clearParams),
    open: () => props.open,
    defaultOpen: untrack(() => props.defaultOpen),
    onOpenChange: (next) => props.onOpenChange?.(next),
  });
  function presentation(): OverlayPresentation {
    return compact() ? "sheet" : (props.desktop ?? "dialog");
  }
  function cls() {
    return parts(responsiveOverlayStyles({ presentation: presentation() }), props.classes);
  }
  function root(): string {
    return arc(cls().root, props.class, props.className);
  }
  function body() {
    return (
      <div class={cls().body} data-slot="responsive-overlay-body">
        {props.children}
      </div>
    );
  }

  return (
    <Switch>
      <Match when={presentation() === "sheet"}>
        <Drawer open={isOpen()} onOpenChange={setOpen}>
          <Show when={props.trigger !== undefined}>
            <DrawerTrigger>{props.trigger}</DrawerTrigger>
          </Show>
          <DrawerContent class={root()} data-slot="responsive-overlay" data-presentation="sheet">
            <DrawerHeader class={cls().header}>
              <DrawerTitle class={cls().title}>{props.heading}</DrawerTitle>
              <Show when={props.description !== undefined}>
                <DrawerDescription class={cls().description}>{props.description}</DrawerDescription>
              </Show>
            </DrawerHeader>
            {body()}
            <Show when={props.footer !== undefined}>
              <DrawerFooter class={cls().footer}>{props.footer}</DrawerFooter>
            </Show>
          </DrawerContent>
        </Drawer>
      </Match>
      <Match when={presentation() === "popover"}>
        <Popover isOpen={isOpen()} onOpenChange={setOpen}>
          <Show when={props.trigger !== undefined}>
            <PopoverTrigger>{props.trigger}</PopoverTrigger>
          </Show>
          <PopoverContent
            class={root()}
            data-slot="responsive-overlay"
            data-presentation="popover"
            placement="bottom start"
          >
            <PopoverHeader class={cls().header}>
              <PopoverTitle class={cls().title}>{props.heading}</PopoverTitle>
              <Show when={props.description !== undefined}>
                <PopoverDescription class={cls().description}>
                  {props.description}
                </PopoverDescription>
              </Show>
            </PopoverHeader>
            {body()}
            <Show when={props.footer !== undefined}>
              <div class={cls().footer} data-slot="responsive-overlay-footer">
                {props.footer}
              </div>
            </Show>
          </PopoverContent>
        </Popover>
      </Match>
      <Match when={presentation() === "dialog"}>
        <Dialog isOpen={isOpen()} onOpenChange={setOpen}>
          <Show when={props.trigger !== undefined}>
            <DialogTrigger>{props.trigger}</DialogTrigger>
          </Show>
          <DialogContent
            class={root()}
            data-slot="responsive-overlay"
            data-presentation="dialog"
            closeLabel={props.closeLabel ?? messages().close}
          >
            <DialogHeader class={cls().header}>
              <DialogTitle class={cls().title}>{props.heading}</DialogTitle>
              <Show when={props.description !== undefined}>
                <DialogDescription class={cls().description}>{props.description}</DialogDescription>
              </Show>
            </DialogHeader>
            {body()}
            <Show when={props.footer !== undefined}>
              <DialogFooter class={cls().footer}>{props.footer}</DialogFooter>
            </Show>
          </DialogContent>
        </Dialog>
      </Match>
    </Switch>
  );
}
