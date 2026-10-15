import { useDirection } from "@barqjs/aria/i18n";
import { mergeProps, type DOMProps } from "@barqjs/aria/utils";
import {
  scrollbar,
  type Scrollbar,
  type ScrollbarOrientation,
  type ScrollbarType,
} from "@barqjs/aria/scroller";
import {
  createContext,
  createSignal,
  createUniqueId,
  getContext,
  onCleanup,
  onSettled,
  provide,
  type Child,
  type Incoming,
} from "@barqjs/core";
import { layer } from "@barqjs/css";
import { ref as makeRef } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { mergeRefs } from "@barqjs/primitives/refs";

const ui = layer("barq.ui");

/**
 * A scrolling box with a scrollbar that matches the theme.
 *
 * Radix — and so shadcn — hides the native scrollbar and draws its own out of
 * two `<div>`s, a resize observer and a pointer-drag handler, because
 * `scrollbar-color` did not exist when that component was written. It does now,
 * in every engine, so this is the native scroller with the theme's colours on
 * it: it scrolls with the wheel, the trackpad, the keyboard and a touch flick
 * without any of that machinery, and it does not break when the content
 * changes size.
 *
 * The trade is stated rather than hidden: a native scrollbar cannot be made to
 * overlay the content or to fade out when idle. If you need that, the DOM is
 * yours and this component is forty lines.
 */
const box = ui({
  position: "relative",
  overflow: "auto",
  overscrollBehavior: "contain",
  scrollbarWidth: "thin",
  scrollbarColor: "var(--border) transparent",
  ":focus-visible": {
    outline: "1px solid var(--ring)",
    "--ui-ring-shadow": "0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent)",
    boxShadow: "var(--ui-ring-shadow)",
  },
  "/* WebKit still needs its own, and ignores scrollbar-color. */ &::-webkit-scrollbar": {
    width: "calc(var(--spacing) * 2.5)",
    height: "calc(var(--spacing) * 2.5)",
  },
  "::-webkit-scrollbar-track": {
    background: "transparent",
  },
  "::-webkit-scrollbar-thumb": {
    borderRadius: "calc(infinity * 1px)",
    backgroundColor: "var(--border)",
    border: "3px solid transparent",
    backgroundClip: "content-box",
  },
  // With a `<ScrollBar>` inside, the viewport scrolls and this only clips, so
  // the bars it holds stay put while the content moves under them.
  '[data-scrollbars="custom"]': {
    overflow: "hidden",
  },
});

/**
 * The element a `<ScrollBar>` draws for.
 *
 * `display: contents` until one is rendered, so a scroll area without custom
 * bars lays its children out exactly as if this were not here and the root
 * stays the native scroller. With one, it becomes the scroller and hides the
 * native bars, which is Radix's arrangement: the bars are positioned against
 * the root, which does not scroll, from inside the element that does.
 */
const viewportBox = ui({
  display: "contents",
  ':where([data-scrollbars="custom"]) > &': {
    display: "block",
    width: "100%",
    height: "100%",
    borderRadius: "inherit",
    overflow: "hidden",
    overscrollBehavior: "contain",
    scrollbarWidth: "none",
    outlineStyle: "none",
    transitionProperty: "color, box-shadow",
    transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
    transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  },
  ':where([data-scrollbars="custom"]) > &::-webkit-scrollbar': {
    display: "none",
  },
  ':where([data-scrollbars="custom"]) > &[data-vertical]': {
    overflowY: "auto",
  },
  ':where([data-scrollbars="custom"]) > &[data-horizontal]': {
    overflowX: "auto",
  },
  ':where([data-scrollbars="custom"]) > &:focus-visible': {
    outline: "1px solid var(--ring)",
    "--ui-ring-shadow": "0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent)",
    boxShadow: "var(--ui-ring-shadow)",
  },
});

const bar = ui({
  position: "absolute",
  display: "flex",
  // A finger on the bar drags the thumb; without this the browser pans the
  // page with the same gesture.
  touchAction: "none",
  padding: "1px",
  "-webkit-user-select": "none",
  userSelect: "none",
  transitionProperty:
    "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, opacity",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  // Hidden by fading rather than by leaving: a bar that is not laid out has no
  // length to measure a thumb against when it comes back.
  '[data-state="hidden"]': {
    pointerEvents: "none",
    opacity: "0%",
  },
});

const barVertical = ui({
  top: "0px",
  insetInlineEnd: "0px",
  height: "100%",
  width: "calc(var(--spacing) * 2.5)",
  borderInlineStartStyle: "var(--ui-border-style)",
  borderInlineStartWidth: "1px",
  borderInlineStartColor: "transparent",
});

const barHorizontal = ui({
  bottom: "0px",
  insetInlineStart: "0px",
  // Stops short of the vertical bar when both are there, so the two do not
  // cross in the corner.
  insetInlineEnd: "var(--scroll-area-corner-width, 0px)",
  height: "calc(var(--spacing) * 2.5)",
  flexDirection: "column",
  borderTopStyle: "var(--ui-border-style)",
  borderTopWidth: "1px",
  borderTopColor: "transparent",
});

const thumb = ui({
  position: "relative",
  flex: "1",
  borderRadius: "calc(infinity * 1px)",
  backgroundColor: "var(--border)",
  '[data-state="hidden"]': {
    display: "none",
  },
});

interface ScrollAreaValue {
  readonly viewport: () => HTMLElement | null | undefined;
  readonly viewportId: string;
  readonly type: () => ScrollbarType | undefined;
  readonly hideDelay: () => number | undefined;
  readonly direction: () => "ltr" | "rtl";
  /** Announces a bar, and returns what takes the announcement back. */
  readonly register: (orientation: () => ScrollbarOrientation, engine: Scrollbar) => () => void;
  readonly setCornerWidth: (width: number) => void;
}

const ScrollAreaContext = createContext<ScrollAreaValue | null>(null);

interface Registered {
  readonly orientation: () => ScrollbarOrientation;
  readonly engine: Scrollbar;
}

export interface ScrollAreaProps extends UiProps {
  /** Which way it scrolls. `both` is the default the CSS already gives. */
  orientation?: "vertical" | "horizontal" | "both";
  /**
   * When a `<ScrollBar>` inside shows: while the pointer is over the area,
   * while the content is moving, whenever there is overflow, or always.
   * @default "hover"
   */
  type?: ScrollbarType;
  /** How long a `<ScrollBar>` stays after the pointer leaves or the scrolling stops, in ms. @default 600 */
  scrollHideDelay?: number;
}

/**
 * ```tsx
 * <ScrollArea aria-label="Log" style={{ height: "12rem" }}>
 *   <Lines />
 * </ScrollArea>
 *
 * <ScrollArea aria-label="Artwork">
 *   <Row />
 *   <ScrollBar orientation="horizontal" />
 * </ScrollArea>
 * ```
 *
 * The first is the native scroller described above. The second is shadcn's
 * drawn scrollbar: rendering a `<ScrollBar>` hides the native bars and draws
 * that one over the content instead, on the axis it names.
 */
export function ScrollArea(props: Incoming<ScrollAreaProps>) {
  const node = makeRef<HTMLDivElement>();
  const root = makeRef<HTMLDivElement>();
  const scoped = useDirection();
  // `ownedWrite`: a bar announces itself from its own body, which runs while
  // this component's children are still being built.
  const [bars, setBars] = createSignal<readonly Registered[]>([], { ownedWrite: true });
  const has = (orientation: ScrollbarOrientation): boolean =>
    bars().some((entry) => entry.orientation() === orientation);
  const custom = (): boolean => bars().length > 0;

  const value: ScrollAreaValue = {
    viewport: node,
    viewportId: createUniqueId(),
    type: () => props.type?.(),
    hideDelay: () => props.scrollHideDelay?.(),
    direction: () => {
      const own = props.dir?.();
      return own === "ltr" || own === "rtl" ? own : scoped();
    },
    register(orientation, engine) {
      const entry: Registered = { orientation, engine };
      setBars((current) => [...current, entry]);
      return () => setBars((current) => current.filter((each) => each !== entry));
    },
    setCornerWidth(width) {
      root()?.style.setProperty("--scroll-area-corner-width", `${String(width)}px`);
    },
  };

  // Focusable, so a keyboard can scroll it. A scrolling region nobody can reach
  // with Tab is a WCAG failure, and the platform only makes one focusable on
  // its own in Firefox. The stop is on whichever element scrolls: Tab landing
  // on a box that only clips is a stop that does nothing.
  const stop = (): number => props.tabIndex?.() ?? 0;
  const rootFocus: DOMProps = { tabIndex: () => (custom() ? undefined : stop()) };
  const viewportFocus: DOMProps = { tabIndex: () => (custom() ? stop() : undefined) };

  return (
    <div
      {...mergeProps(uiProps("scroll-area", box, props), rootFocus)}
      ref={mergeRefs(root.set, props.ref?.())}
      data-orientation={props.orientation?.() ?? "both"}
      data-scrollbars={() => (custom() ? "custom" : undefined)}
      role={props.role?.() ?? "region"}
      onPointerEnter={() => {
        for (const entry of bars()) entry.engine.hoverStart();
      }}
      onPointerLeave={() => {
        for (const entry of bars()) entry.engine.hoverEnd();
      }}
    >
      <div
        data-slot="scroll-area-viewport"
        class={viewportBox}
        id={value.viewportId}
        ref={node.set}
        {...viewportFocus}
        data-vertical={() => (has("vertical") ? "" : undefined)}
        data-horizontal={() => (has("horizontal") ? "" : undefined)}
      >
        <ScrollAreaProvider value={value}>{props.children}</ScrollAreaProvider>
      </div>
    </div>
  );
}

/** The context, in a component of its own because `provide` needs the scope. */
function ScrollAreaProvider(props: Incoming<{ value: ScrollAreaValue; children?: Child }>) {
  return provide(
    ScrollAreaContext,
    () => props.value(),
    () => props.children,
  );
}

export interface ScrollBarProps extends UiProps {
  /** @default "vertical" */
  orientation?: ScrollbarOrientation;
}

/**
 * A drawn scrollbar for the `<ScrollArea>` it is inside.
 *
 * The viewport is what a keyboard scrolls, so this is not a Tab stop of its
 * own: it is a `scrollbar` that names the viewport it controls and reports how
 * far through the content it is, and a pointer can drag the thumb or press the
 * track.
 */
export function ScrollBar(props: Incoming<ScrollBarProps>) {
  const area = getContext(ScrollAreaContext);
  if (area === null || area === undefined) {
    throw new Error("This must be rendered inside a <ScrollArea>.");
  }
  const track = makeRef<HTMLDivElement>();
  const orientation = (): ScrollbarOrientation => props.orientation?.() ?? "vertical";
  const engine = scrollbar({
    orientation,
    direction: area.direction,
    type: area.type,
    hideDelay: area.hideDelay,
  });

  onCleanup(area.register(orientation, engine));
  onSettled(() => {
    engine.attach(area.viewport() ?? null, track() ?? null);
    if (orientation() === "vertical") area.setCornerWidth(track()?.offsetWidth ?? 0);
  });
  onCleanup(() => {
    engine.attach(null, null);
    if (orientation() === "vertical") area.setCornerWidth(0);
  });

  return (
    <div
      {...uiProps(
        "scroll-area-scrollbar",
        () => ui(bar, orientation() === "vertical" ? barVertical : barHorizontal),
        props,
      )}
      ref={mergeRefs(track.set, props.ref?.())}
      role="scrollbar"
      aria-controls={area.viewportId}
      aria-orientation={orientation()}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={() => engine.value()}
      data-orientation={orientation()}
      data-vertical={orientation() === "vertical" ? "" : undefined}
      data-horizontal={orientation() === "horizontal" ? "" : undefined}
      data-state={() => (engine.isVisible() ? "visible" : "hidden")}
      data-dragging={() => (engine.isDragging() ? "" : undefined)}
      onPointerDown={engine.trackProps.onPointerDown}
      onPointerMove={engine.trackProps.onPointerMove}
      onPointerUp={engine.trackProps.onPointerUp}
      onPointerCancel={engine.trackProps.onPointerCancel}
      onPointerEnter={engine.trackProps.onPointerEnter}
      onPointerLeave={engine.trackProps.onPointerLeave}
    >
      <div
        data-slot="scroll-area-thumb"
        class={thumb}
        data-state={() => (engine.hasOverflow() ? "visible" : "hidden")}
        style={() =>
          orientation() === "vertical"
            ? {
                height: `${String(engine.thumbSize())}px`,
                transform: `translate3d(0px, ${String(engine.thumbOffset())}px, 0px)`,
              }
            : {
                width: `${String(engine.thumbSize())}px`,
                transform: `translate3d(${String(engine.thumbOffset())}px, 0px, 0px)`,
              }
        }
        onPointerDown={engine.thumbProps.onPointerDown}
      />
    </div>
  );
}
