import {
  messageScroller,
  type MessageScroller as MessageScrollerEngine,
  type MessageScrollerDefaultScrollPosition,
  type MessageScrollerScrollOptions,
  type MessageScrollerScrollable,
  type MessageScrollerVisibilityState,
} from "@barqjs/aria/scroller";
import {
  createContext,
  getContext,
  onCleanup,
  onSettled,
  provide,
  type Accessor,
  type Child,
  type Incoming,
} from "@barqjs/core";
import { layer } from "@barqjs/css";
import { ArrowDown } from "@barqjs/lucide/icons/arrow-down";
import { ref as makeRef } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Button, type ButtonProps } from "./button.tsx";
import { srOnly } from "./sr-only.ts";
import { mergeRefs } from "@barqjs/primitives/refs";

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
  // The gutter is kept whether or not there is a bar in it, so the column does
  // not change width the moment the transcript first overflows.
  scrollbarGutter: "stable",
  contain: "content",
  // Laid out and measured but not shown, until it has been scrolled to where
  // it opens: showing the top of a transcript first is a flash of it.
  "&[data-pending-scroll]": {
    visibility: "hidden",
  },
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
  insetInlineStart: "calc(1 / 2 * 100%)",
  "--ui-translate-x": "calc(calc(1 / 2 * 100%) * -1)",
  // Half its own width back towards the start, which is the other way round
  // when the start is on the right.
  ':where(:dir(rtl), [dir="rtl"], [dir="rtl"] *)': {
    "--ui-translate-x": "calc(1 / 2 * 100%)",
  },
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

const ScrollerContext = createContext<MessageScrollerEngine | null>(null);

function useScroller(): MessageScrollerEngine {
  const value = getContext(ScrollerContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <MessageScroller>.");
  }
  return value;
}

export type {
  MessageScrollerDefaultScrollPosition,
  MessageScrollerScrollOptions,
  MessageScrollerScrollable,
  MessageScrollerVisibilityState,
};

export interface MessageScrollerCommands {
  /**
   * Bring a message into view by the `messageId` its item was given. `false`
   * when no such row is mounted, unless the transcript is still empty, in
   * which case it is remembered and gone to when the row arrives.
   */
  readonly scrollToMessage: (messageId: string, options?: MessageScrollerScrollOptions) => boolean;
  readonly scrollToStart: (options?: MessageScrollerScrollOptions) => boolean;
  readonly scrollToEnd: (options?: MessageScrollerScrollOptions) => boolean;
}

/**
 * The scroller's commands, for anything under it.
 *
 * ```tsx
 * const scroller = useMessageScroller();
 * <Button onPress={() => scroller.scrollToMessage(result.id, { align: "center" })}>Go</Button>
 * ```
 */
export function useMessageScroller(): MessageScrollerCommands {
  const scroller = useScroller();
  return {
    scrollToMessage: scroller.scrollToMessage,
    scrollToStart: scroller.scrollToStart,
    scrollToEnd: scroller.scrollToEnd,
  };
}

/** Which ways there is still somewhere to scroll, for a fade or a button of your own. */
export function useMessageScrollerScrollable(): Accessor<MessageScrollerScrollable> {
  return useScroller().scrollable;
}

/**
 * The message ids on screen and the turn being read.
 *
 * Nothing computes this until something asks, and it stops when the last one
 * to ask has gone: a transcript nobody is tracking pays for no observer.
 */
export function useMessageScrollerVisibility(): Accessor<MessageScrollerVisibilityState> {
  const scroller = useScroller();
  onCleanup(scroller.watchVisibility());
  return scroller.visibility;
}

export interface MessageScrollerProviderProps {
  children?: Child;
  /** Follow new content while the view is already at the end. @default false */
  autoScroll?: boolean;
  /** Where it opens once it first has messages. @default "end" */
  defaultScrollPosition?: MessageScrollerDefaultScrollPosition;
  /** How close to an edge still counts as being at it, in px. @default 8 */
  scrollEdgeThreshold?: number;
  /** How much of the previous message shows above a newly anchored one, in px. @default 64 */
  scrollPreviousItemPeek?: number;
  /** Space kept at the aligned edge by the commands and by anchoring, in px. @default 0 */
  scrollMargin?: number;
}

/**
 * The scroller's state, with no element of its own.
 *
 * ```tsx
 * <MessageScrollerProvider autoScroll>
 *   <Header />            // may call useMessageScroller()
 *   <MessageScroller>…</MessageScroller>
 * </MessageScrollerProvider>
 * ```
 *
 * Optional. A `<MessageScroller>` on its own keeps its own state, and follows
 * the end by default; under a provider it is the provider's settings that
 * apply, which are upstream's: it opens at the end and follows only if asked.
 * The provider exists so that something OUTSIDE the frame, a header's "jump to
 * latest" or a search result, can reach the commands.
 */
export function MessageScrollerProvider(props: Incoming<MessageScrollerProviderProps>) {
  const scroller = messageScroller({
    follow: () => props.autoScroll?.() ?? false,
    tolerance: () => props.scrollEdgeThreshold?.(),
    defaultScrollPosition: () => props.defaultScrollPosition?.() ?? "end",
    scrollPreviousItemPeek: () => props.scrollPreviousItemPeek?.(),
    scrollMargin: () => props.scrollMargin?.(),
  });
  onCleanup(() => scroller.attach(null));

  return <ScrollerProvider value={scroller}>{props.children}</ScrollerProvider>;
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
 *
 * `follow` and `tolerance` are read when there is no `<MessageScrollerProvider>`
 * above; under one, its props decide.
 */
export function MessageScroller(props: Incoming<MessageScrollerProps>) {
  const provided = getContext(ScrollerContext);
  const scroller =
    provided ??
    messageScroller({
      follow: () => props.follow?.(),
      tolerance: () => props.tolerance?.(),
    });
  if (provided === null || provided === undefined) onCleanup(() => scroller.attach(null));

  return (
    <div
      {...uiProps("message-scroller", ui(root, "group/message-scroller"), props)}
      data-pending-scroll={() => (scroller.isPending() ? "" : undefined)}
      data-scrollable={() => edgesOf(scroller)}
      data-autoscrolling={() => (scroller.isAutoscrolling() ? "" : undefined)}
    >
      <ScrollerProvider value={scroller}>{props.children}</ScrollerProvider>
    </div>
  );
}

/** `"start end"`, either word alone, or nothing: the edges there is still content past. */
function edgesOf(scroller: MessageScrollerEngine): string | undefined {
  const edges = scroller.scrollable();
  if (edges.start && edges.end) return "start end";
  if (edges.start) return "start";
  return edges.end ? "end" : undefined;
}

/** See `drawer.tsx`: the scope a `provide` needs exists only in a component. */
function ScrollerProvider(props: Incoming<{ value: MessageScrollerEngine; children?: Child }>) {
  return provide(
    ScrollerContext,
    () => props.value(),
    () => props.children,
  );
}

/** The keys that scroll a focused scroller, which are the person moving it. */
const SCROLL_KEYS = new Set(["ArrowDown", "ArrowUp", "End", "Home", "PageDown", "PageUp", " "]);

export interface MessageScrollerViewportProps extends UiProps {
  /** Keep the row being read where it is when older ones are added above. @default true */
  preserveScrollOnPrepend?: boolean;
}

/**
 * The element that scrolls.
 *
 * A labelled region with a Tab stop, because a transcript longer than its box
 * is content a keyboard has to be able to reach and scroll.
 */
export function MessageScrollerViewport(props: Incoming<MessageScrollerViewportProps>) {
  const scroller = useScroller();
  const node = makeRef<HTMLDivElement>();
  scroller.preserveOnPrepend(() => props.preserveScrollOnPrepend?.());
  // Once mounted rather than from the `ref`: attaching measures and publishes
  // what it found, and a ref is called while this component is still being
  // built, where a write is refused.
  onSettled(() => {
    scroller.attach(node());
  });

  return (
    <div
      {...uiProps("message-scroller-viewport", viewport, props)}
      ref={mergeRefs(node.set, props.ref?.())}
      role={props.role?.() ?? "region"}
      aria-label={props["aria-label"]?.() ?? "Messages"}
      tabIndex={props.tabIndex?.() ?? 0}
      data-autoscrolling={scroller.isAutoscrolling() ? "" : undefined}
      data-pending-scroll={() => (scroller.isPending() ? "" : undefined)}
      data-scrollable={() => edgesOf(scroller)}
      onWheel={() => scroller.intent()}
      onTouchMove={() => scroller.intent()}
      onKeyDown={(event: KeyboardEvent) => {
        if (SCROLL_KEYS.has(event.key)) scroller.intent();
      }}
    >
      {props.children}
    </div>
  );
}

export interface MessageScrollerContentProps extends UiProps {
  /** While a reply is still arriving, so the log is announced once it is complete. */
  "aria-busy"?: boolean | "true" | "false";
  /** @default "additions", so a new message is announced and an edited one is not re-read */
  "aria-relevant"?: "additions" | "additions text" | "all" | "removals" | "text";
  /** A class for the empty element that makes room above an anchored turn. */
  spacerClass?: string;
}

/**
 * The column of rows.
 *
 * A `log`: new messages are announced politely as they arrive, in order, and
 * the ones already there are left alone.
 */
export function MessageScrollerContent(props: Incoming<MessageScrollerContentProps>) {
  const scroller = useScroller();

  return (
    <div
      {...uiProps("message-scroller-content", content, props)}
      ref={mergeRefs(scroller.attachContent, props.ref?.())}
      role={props.role?.() ?? "log"}
      aria-relevant={props["aria-relevant"]?.() ?? "additions"}
    >
      {props.children}
      <div
        ref={scroller.attachSpacer}
        aria-hidden="true"
        data-message-scroller-spacer=""
        hidden
        class={props.spacerClass?.()}
      />
    </div>
  );
}

export interface MessageScrollerItemProps extends UiProps {
  /** Names the row for `scrollToMessage`, the visibility state and prepend preservation. */
  messageId?: string;
  /**
   * Marks the start of a turn. A row that arrives with this is brought near
   * the top and held there while what follows it streams in.
   * @default false
   */
  scrollAnchor?: boolean;
}

/** One row: a message, a marker, a typing indicator, a separator. */
export function MessageScrollerItem(props: Incoming<MessageScrollerItemProps>) {
  const scroller = useScroller();
  let mounted: HTMLDivElement | null = null;
  const register = (element: HTMLDivElement | null): void => {
    const messageId = props.messageId?.();
    if (messageId !== undefined && messageId !== "") {
      scroller.register(messageId, element, mounted);
    }
    mounted = element;
  };
  onCleanup(() => register(null));

  return (
    <div
      {...uiProps("message-scroller-item", item, props)}
      ref={mergeRefs(register, props.ref?.())}
      data-message-id={props.messageId?.()}
      data-scroll-anchor={props.scrollAnchor?.() === true ? "true" : "false"}
    >
      {props.children}
    </div>
  );
}

export interface MessageScrollerButtonProps extends ButtonProps {
  /** Which end it goes to. @default "end" */
  direction?: "start" | "end";
  /** How it gets there. @default "smooth" */
  behavior?: ScrollBehavior;
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
  const active = (): boolean => scroller.scrollable()[direction()];

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
      onPress={(event) => {
        if (!active()) return;
        props.onPress?.()?.(event);
        const behavior = props.behavior?.() ?? "smooth";
        if (direction() === "end") scroller.toEnd(behavior);
        else scroller.toStart(behavior);
      }}
    >
      {props.children ?? <ArrowDown />}
      <span class={srOnly}>
        {props.label?.() ?? (direction() === "end" ? "Scroll to end" : "Scroll to start")}
      </span>
    </Button>
  );
}
