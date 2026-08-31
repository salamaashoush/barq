import {
  context,
  getContext,
  getOwner,
  onCleanup,
  onMount,
  provide,
  signal,
  type Accessor,
  type Child,
  type Incoming,
} from "@barqjs/core";
import { layer } from "@barqjs/css";
import { ArrowLeft } from "@barqjs/lucide/icons/arrow-left";
import { ArrowRight } from "@barqjs/lucide/icons/arrow-right";
import EmblaCarousel, {
  type EmblaCarouselType,
  type EmblaOptionsType,
  type EmblaPluginType,
} from "embla-carousel";

import "../theme/layers.ts";
import { uiProps } from "../lib/slot.ts";
import type { UiProps } from "../lib/props.ts";
import { Button, type ButtonProps } from "./button.tsx";
import { srOnly } from "./sr-only.ts";

const ui = layer("barq.ui");

const root = ui({
  position: "relative",
});

const viewport = ui({
  overflow: "hidden",
});

const content = ui({
  display: "flex",
  marginLeft: "calc(var(--spacing) * -4)",
});

const contentVertical = ui({
  marginTop: "calc(var(--spacing) * -4)",
  marginLeft: "0px",
  flexDirection: "column",
});

const item = ui({
  minWidth: "0px",
  flexShrink: "0",
  flexGrow: "0",
  flexBasis: "100%",
  paddingLeft: "calc(var(--spacing) * 4)",
});

const itemVertical = ui({
  paddingTop: "calc(var(--spacing) * 4)",
  paddingLeft: "0px",
});

const button = ui({
  position: "absolute",
  width: "calc(var(--spacing) * 8)",
  height: "calc(var(--spacing) * 8)",
  borderRadius: "calc(infinity * 1px)",
});

const previousHorizontal = ui({
  top: "calc(1 / 2 * 100%)",
  left: "calc(var(--spacing) * -12)",
  "--ui-translate-y": "calc(calc(1 / 2 * 100%) * -1)",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
});

const previousVertical = ui({
  top: "calc(var(--spacing) * -12)",
  left: "calc(1 / 2 * 100%)",
  "--ui-translate-x": "calc(calc(1 / 2 * 100%) * -1)",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  rotate: "90deg",
});

const nextHorizontal = ui({
  top: "calc(1 / 2 * 100%)",
  right: "calc(var(--spacing) * -12)",
  "--ui-translate-y": "calc(calc(1 / 2 * 100%) * -1)",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
});

const nextVertical = ui({
  bottom: "calc(var(--spacing) * -12)",
  left: "calc(1 / 2 * 100%)",
  "--ui-translate-x": "calc(calc(1 / 2 * 100%) * -1)",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  rotate: "90deg",
});

export type CarouselOrientation = "horizontal" | "vertical";
export type CarouselApi = EmblaCarouselType;

interface CarouselValue {
  readonly orientation: Accessor<CarouselOrientation>;
  readonly api: Accessor<CarouselApi | null>;
  readonly canScrollPrev: Accessor<boolean>;
  readonly canScrollNext: Accessor<boolean>;
  readonly scrollPrev: () => void;
  readonly scrollNext: () => void;
  readonly attach: (element: HTMLElement | null) => void;
}

const CarouselContext = context<CarouselValue | null>(null);

function useCarousel(): CarouselValue {
  const value = getContext(CarouselContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <Carousel>.");
  }
  return value;
}

export interface CarouselProps extends UiProps {
  /** @default "horizontal" */
  orientation?: CarouselOrientation;
  /** Passed to embla. `axis` comes from `orientation` and is not read here. */
  opts?: Omit<EmblaOptionsType, "axis">;
  plugins?: EmblaPluginType[];
  /** Handed the carousel once it exists, for driving it from outside. */
  setApi?: (api: CarouselApi) => void;
}

/**
 * A row of slides that scrolls one at a time.
 *
 * The engine is `embla-carousel` — the framework-agnostic core, not the React
 * wrapper shadcn uses — because a carousel is momentum, snap points, loop and
 * a drag that survives a resize, and writing that again would be a worse copy
 * of a library that is already 5 KB.
 *
 * ```tsx
 * <Carousel>
 *   <CarouselContent>
 *     <CarouselItem>One</CarouselItem>
 *     <CarouselItem>Two</CarouselItem>
 *   </CarouselContent>
 *   <CarouselPrevious />
 *   <CarouselNext />
 * </Carousel>
 * ```
 */
export function Carousel(props: Incoming<CarouselProps>) {
  const orientation = (): CarouselOrientation => props.orientation?.() ?? "horizontal";
  const api = signal<CarouselApi | null>(null);
  const canScrollPrev = signal(false);
  const canScrollNext = signal(false);
  let instance: CarouselApi | null = null;
  let node: HTMLElement | null = null;
  let mounted = false;

  const build = (): void => {
    instance?.destroy();
    instance = null;
    api.set(null);
    if (node === null) return;

    const made = EmblaCarousel(
      node,
      { ...props.opts?.(), axis: orientation() === "horizontal" ? "x" : "y" },
      props.plugins?.(),
    );
    const update = (): void => {
      canScrollPrev.set(made.canScrollPrev());
      canScrollNext.set(made.canScrollNext());
    };
    // `reInit` too: a slide added or a container resized changes both answers,
    // and a `next` button that stays disabled after the second slide arrives
    // is a carousel nobody can leave the first slide of.
    made.on("select", update).on("reInit", update);
    update();

    instance = made;
    api.set(made);
    props.setApi?.()?.(made);
  };

  /**
   * The element, and then the instance once the slides are in it.
   *
   * A ref fires when its own element connects, which is BEFORE the track's
   * children exist. Building there gave embla an empty container, so
   * `slideNodes()` was empty, `canScrollNext()` was false and the carousel
   * could not leave the first slide. `onMount` runs once the tree has settled;
   * a `<CarouselContent>` that arrives later builds straight away.
   */
  const attach = (element: HTMLElement | null): void => {
    node = element;
    if (mounted) build();
  };

  onMount(() => {
    mounted = true;
    build();
  });

  // The instance holds listeners on the window and a resize observer, so a
  // route that leaves without this keeps measuring a container that is gone.
  onCleanup(() => instance?.destroy());

  const value: CarouselValue = {
    orientation,
    api,
    canScrollPrev,
    canScrollNext,
    scrollPrev: () => instance?.scrollPrev(),
    scrollNext: () => instance?.scrollNext(),
    attach,
  };

  return (
    <div
      {...uiProps("carousel", root, props)}
      role={props.role?.() ?? "region"}
      aria-roledescription="carousel"
      data-orientation={orientation()}
      onKeyDown={(event: KeyboardEvent) => {
        const back = orientation() === "horizontal" ? "ArrowLeft" : "ArrowUp";
        const on = orientation() === "horizontal" ? "ArrowRight" : "ArrowDown";
        if (event.key !== back && event.key !== on) return;
        // Only once it holds focus, or a carousel beside a text field would
        // eat the caret keys.
        event.preventDefault();
        if (event.key === back) value.scrollPrev();
        else value.scrollNext();
      }}
    >
      <CarouselProvider value={value}>{props.children}</CarouselProvider>
    </div>
  );
}

/**
 * Its own component, because a `provide` callback that BUILDS the children is
 * the only place the scope exists.
 */
function CarouselProvider(props: Incoming<{ value: CarouselValue; children?: Child }>) {
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;
  return provide(
    owner,
    CarouselContext,
    () => props.value(),
    () => props.children,
  ) as never;
}

/**
 * The track, inside the viewport that clips it.
 *
 * Two elements and not one: embla measures the ROOT it is given and translates
 * that root's first child, so the clipping element and the moving element have
 * to be different. Giving it the flex row directly makes the row its own
 * viewport and nothing ever moves.
 */
export function CarouselContent(props: Incoming<UiProps>) {
  const carousel = useCarousel();

  return (
    <div data-slot="carousel-viewport" class={viewport} ref={carousel.attach}>
      <div
        {...uiProps(
          "carousel-content",
          () => ui(content, carousel.orientation() === "vertical" ? contentVertical : ""),
          props,
        )}
        data-orientation={carousel.orientation()}
      >
        {props.children}
      </div>
    </div>
  );
}

export function CarouselItem(props: Incoming<UiProps>) {
  const carousel = useCarousel();

  return (
    <div
      {...uiProps(
        "carousel-item",
        () => ui(item, carousel.orientation() === "vertical" ? itemVertical : ""),
        props,
      )}
      role={props.role?.() ?? "group"}
      aria-roledescription="slide"
    >
      {props.children}
    </div>
  );
}

export interface CarouselButtonProps extends ButtonProps {
  /** @default "Previous slide" or "Next slide" */
  label?: string;
}

export function CarouselPrevious(props: Incoming<CarouselButtonProps>) {
  const carousel = useCarousel();

  return (
    <Button
      {...props}
      data-slot={props["data-slot"]?.() ?? "carousel-previous"}
      variant={props.variant?.() ?? "outline"}
      size={props.size?.() ?? "icon"}
      class={ui(
        button,
        carousel.orientation() === "horizontal" ? previousHorizontal : previousVertical,
        props.class?.(),
        props.className?.(),
      )}
      isDisabled={props.isDisabled?.() ?? !carousel.canScrollPrev()}
      onPress={() => carousel.scrollPrev()}
    >
      <ArrowLeft />
      <span class={srOnly}>{props.label?.() ?? "Previous slide"}</span>
    </Button>
  );
}

export function CarouselNext(props: Incoming<CarouselButtonProps>) {
  const carousel = useCarousel();

  return (
    <Button
      {...props}
      data-slot={props["data-slot"]?.() ?? "carousel-next"}
      variant={props.variant?.() ?? "outline"}
      size={props.size?.() ?? "icon"}
      class={ui(
        button,
        carousel.orientation() === "horizontal" ? nextHorizontal : nextVertical,
        props.class?.(),
        props.className?.(),
      )}
      isDisabled={props.isDisabled?.() ?? !carousel.canScrollNext()}
      onPress={() => carousel.scrollNext()}
    >
      <ArrowRight />
      <span class={srOnly}>{props.label?.() ?? "Next slide"}</span>
    </Button>
  );
}
