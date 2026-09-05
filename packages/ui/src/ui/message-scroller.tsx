import { messageScroller, type MessageScroller } from "@barqjs/aria/scroller";
import {
  context,
  getContext,
  getOwner,
  onCleanup,
  provide,
  type Child,
  type Incoming,
} from "@barqjs/core";
import { layer } from "@barqjs/css";
import { ArrowDown } from "@barqjs/lucide/icons/arrow-down";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Button, type ButtonProps } from "./button.tsx";
import { srOnly } from "./sr-only.ts";

const ui = layer("barq.ui");

const root = ui({
  position: "relative",
  display: "flex",
  width: "100%",
  height: "100%",
  minHeight: "0px",
  flexDirection: "column",
  overflow: "hidden",
});

const viewport = ui({
  width: "100%",
  height: "100%",
  minHeight: "0px",
  minWidth: "0px",
  overflowY: "auto",
  overscrollBehavior: "contain",
  scrollbarWidth: "thin",
  scrollbarColor: "var(--border) transparent",
  // While the scroller is moving the view itself, the bar is noise: it is not
  // reporting a gesture anybody made.
  "&[data-autoscrolling]": {
    scrollbarWidth: "none",
  },
  "&[data-autoscrolling]::-webkit-scrollbar": {
    display: "none",
  },
});

/**
 * `min-height: 100%` with `height: max-content`.
 *
 * A short transcript has to fill the viewport or the first message floats in
 * the middle of an empty box; a long one has to be its own height or the
 * scroller has nothing to scroll.
 */
const content = ui({
  display: "flex",
  height: "max-content",
  minHeight: "100%",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 8)",
});

const item = ui({
  minWidth: "0px",
  flexShrink: "0",
  // The browser skips laying out what is off screen, and the reserved size
  // keeps the scrollbar from jumping as it does.
  containIntrinsicSize: "auto 10rem",
  contentVisibility: "auto",
});

const button = ui({
  position: "absolute",
  left: "50%",
  "--ui-translate-x": "calc(calc(1 / 2 * 100%) * -1)",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  borderColor: "var(--border)",
  backgroundColor: "var(--background)",
  color: "var(--foreground)",
  transitionProperty: "translate, scale, opacity",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  "--ui-duration": "200ms",
  transitionDuration: "200ms",
  '&[data-direction="end"]': {
    bottom: "calc(var(--spacing) * 4)",
  },
  '&[data-direction="start"]': {
    top: "calc(var(--spacing) * 4)",
  },
  '&[data-direction="start"] svg': {
    rotate: "180deg",
  },
  // Out of the way rather than removed: a button that unmounts cannot animate,
  // and this one arrives and leaves on every scroll.
  '&[data-active="false"]': {
    pointerEvents: "none",
    "--ui-scale-x": "95%",
    "--ui-scale-y": "95%",
    "--ui-scale-z": "95%",
    scale: "var(--ui-scale-x) var(--ui-scale-y)",
    opacity: "0%",
    "--ui-duration": "400ms",
    transitionDuration: "400ms",
  },
  '&[data-active="false"][data-direction="end"]': {
    "--ui-translate-y": "100%",
  },
  '&[data-active="false"][data-direction="start"]': {
    "--ui-translate-y": "-100%",
  },
  '&[data-active="true"]': {
    "--ui-translate-y": "0px",
    translate: "var(--ui-translate-x) var(--ui-translate-y)",
    "--ui-scale-x": "100%",
    "--ui-scale-y": "100%",
    "--ui-scale-z": "100%",
    scale: "var(--ui-scale-x) var(--ui-scale-y)",
    opacity: "100%",
  },
  "@media (hover: hover)": {
    "&:hover": {
      backgroundColor: "var(--muted)",
      color: "var(--foreground)",
    },
  },
});

const ScrollerContext = context<MessageScroller | null>(null);

function useScroller(): MessageScroller {
  const value = getContext(ScrollerContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <MessageScroller>.");
  }
  return value;
}

export interface MessageScrollerProps extends UiProps {
  /** Whether new content keeps the view at the end. @default true */
  follow?: boolean;
  /** How close to the end still counts as being at it, in px. @default 8 */
  tolerance?: number;
}

/**
 * A transcript that stays at the bottom while messages arrive, and stops when
 * you scroll up to read.
 *
 * The engine is `@barqjs/aria/scroller`. What this adds is the shape: a
 * viewport that clips, a column that fills it, and a button that is out of the
 * way rather than absent when there is nowhere to go.
 *
 * ```tsx
 * <MessageScroller>
 *   <MessageScrollerViewport>
 *     <MessageScrollerContent>
 *       <For each={messages}>
 *         {(one) => <MessageScrollerItem>{one.body}</MessageScrollerItem>}
 *       </For>
 *     </MessageScrollerContent>
 *   </MessageScrollerViewport>
 *   <MessageScrollerButton />
 * </MessageScroller>
 * ```
 */
export function MessageScroller(props: Incoming<MessageScrollerProps>) {
  const scroller = messageScroller({
    follow: () => props.follow?.(),
    tolerance: () => props.tolerance?.(),
  });
  onCleanup(() => scroller.attach(null));

  return (
    <div {...uiProps("message-scroller", root, props)}>
      <ScrollerProvider value={scroller}>{props.children}</ScrollerProvider>
    </div>
  );
}

/** See `drawer.tsx`: the scope a `provide` needs exists only in a component. */
function ScrollerProvider(props: Incoming<{ value: MessageScroller; children?: Child }>) {
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;
  return provide(
    owner,
    ScrollerContext,
    () => props.value(),
    () => props.children,
  ) as never;
}

/** The element that scrolls. */
export function MessageScrollerViewport(props: Incoming<UiProps>) {
  const scroller = useScroller();

  return (
    <div
      {...uiProps("message-scroller-viewport", viewport, props)}
      ref={scroller.attach}
      data-autoscrolling={scroller.isAutoscrolling() ? "" : undefined}
    >
      {props.children}
    </div>
  );
}

export function MessageScrollerContent(props: Incoming<UiProps>) {
  return <div {...uiProps("message-scroller-content", content, props)}>{props.children}</div>;
}

export function MessageScrollerItem(props: Incoming<UiProps>) {
  return <div {...uiProps("message-scroller-item", item, props)}>{props.children}</div>;
}

export interface MessageScrollerButtonProps extends ButtonProps {
  /** Which end it goes to. @default "end" */
  direction?: "start" | "end";
  /** @default "Scroll to end" */
  label?: string;
}

/**
 * The button back to the bottom.
 *
 * It is in the DOM whether or not it can be used, and `data-active` decides
 * whether it is reachable: a button that unmounts cannot animate, and this one
 * arrives and leaves on every scroll.
 */
export function MessageScrollerButton(props: Incoming<MessageScrollerButtonProps>) {
  const scroller = useScroller();
  const direction = (): "start" | "end" => props.direction?.() ?? "end";
  const active = (): boolean =>
    scroller.isScrollable() && (direction() === "end" ? !scroller.isAtEnd() : true);

  return (
    <Button
      {...props}
      data-slot={props["data-slot"]?.() ?? "message-scroller-button"}
      variant={props.variant?.() ?? "secondary"}
      size={props.size?.() ?? "icon-sm"}
      class={ui(button, props.class?.(), props.className?.())}
      data-direction={direction()}
      data-active={active() ? "true" : "false"}
      // Out of the tab order while it is out of the way, or Tab lands on a
      // control nobody can see.
      excludeFromTabOrder={!active()}
      onPress={() => (direction() === "end" ? scroller.toEnd() : scroller.toStart())}
    >
      <ArrowDown />
      <span class={srOnly}>
        {props.label?.() ?? (direction() === "end" ? "Scroll to end" : "Scroll to start")}
      </span>
    </Button>
  );
}
