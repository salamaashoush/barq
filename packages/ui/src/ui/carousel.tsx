import { useDirection } from "@barqjs/aria/i18n";
import {
  cells,
  createContext,
  createEffect,
  getContext,
  onCleanup,
  onSettled,
  provide,
  createSignal,
  For,
  Show,
  type Accessor,
  type Child,
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
import { ring } from "../lib/shared-ring.ts";
import { touch } from "../lib/shared-touch.ts";

const ui = layer("barq.ui");

const root = ui({
  position: "relative",
});

const viewport = ui({
  overflow: "hidden",
});

const content = ui({
  display: "flex",
  marginInlineStart: "calc(var(--spacing) * -4)",
});

const contentVertical = ui({
  marginTop: "calc(var(--spacing) * -4)",
  marginInlineStart: "0px",
  flexDirection: "column",
});

const item = ui({
  minWidth: "0px",
  flexShrink: "0",
  flexGrow: "0",
  flexBasis: "100%",
  paddingInlineStart: "calc(var(--spacing) * 4)",
});

const itemVertical = ui({
  paddingTop: "calc(var(--spacing) * 4)",
  paddingInlineStart: "0px",
});

const button = ui({
  position: "absolute",
  // `touch-manipulation`: a double tap on an arrow pages twice rather than
  // asking the browser to wait 300ms to find out whether it was a zoom.
  touchAction: "manipulation",
  width: "calc(var(--spacing) * 8)",
  height: "calc(var(--spacing) * 8)",
  borderRadius: "calc(infinity * 1px)",
});

/**
 * The arrow points the way the slides go, so it turns round with the text.
 * Only on the horizontal axis: a vertical button is already rotated as a whole.
 *
 * Written out in both horizontal buttons rather than spread from one object:
 * the compiler folds a style object it can read whole, and the two copies are
 * one atom in the stylesheet either way.
 */
const previousHorizontal = ui({
  top: "calc(1 / 2 * 100%)",
  insetInlineStart: "calc(var(--spacing) * -12)",
  "--ui-translate-y": "calc(calc(1 / 2 * 100%) * -1)",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  ':where(:dir(rtl), [dir="rtl"], [dir="rtl"] *) > svg': {
    rotate: "180deg",
  },
});

/**
 * Centred by stretching to both edges and letting the margins share what is
 * left, which is the same in either direction. Half the width and a translate
 * back needs the sign of the translate flipped right to left.
 */
const previousVertical = ui({
  top: "calc(var(--spacing) * -12)",
  insetInline: "0px",
  marginInline: "auto",
  rotate: "90deg",
});

const nextHorizontal = ui({
  top: "calc(1 / 2 * 100%)",
  insetInlineEnd: "calc(var(--spacing) * -12)",
  "--ui-translate-y": "calc(calc(1 / 2 * 100%) * -1)",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  ':where(:dir(rtl), [dir="rtl"], [dir="rtl"] *) > svg': {
    rotate: "180deg",
  },
});

const nextVertical = ui({
  bottom: "calc(var(--spacing) * -12)",
  insetInline: "0px",
  marginInline: "auto",
  rotate: "90deg",
});

export type CarouselOrientation = "horizontal" | "vertical";
export type CarouselApi = EmblaCarouselType;

export type CarouselOptions = Omit<EmblaOptionsType, "axis">;
export type CarouselPlugin = EmblaPluginType[];

export interface CarouselValue {
  readonly orientation: Accessor<CarouselOrientation>;
  readonly opts: Accessor<CarouselOptions | undefined>;
  readonly api: Accessor<CarouselApi | null>;
  readonly canScrollPrev: Accessor<boolean>;
  readonly canScrollNext: Accessor<boolean>;
  /** The snap point in view, from 0. */
  readonly selectedIndex: Accessor<number>;
  /** How many snap points: one per slide, or fewer when several fit in view. */
  readonly snapCount: Accessor<number>;
  readonly scrollPrev: () => void;
  readonly scrollNext: () => void;
  readonly scrollTo: (index: number) => void;
  readonly attach: (element: HTMLElement | null) => void;
}

const CarouselContext = createContext<CarouselValue | null>(null);

/**
 * The carousel a part is inside, for a part of your own.
 *
 * ```tsx
 * function Dots() {
 *   const carousel = useCarousel();
 *   return <span>{() => carousel.api()?.selectedScrollSnap()}</span>;
 * }
 * ```
 */
export function useCarousel(): CarouselValue {
  const value = getContext(CarouselContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <Carousel>.");
  }
  return value;
}

export interface CarouselProps extends UiProps {
  /** @default "horizontal" */
  orientation?: CarouselOrientation;
  /**
   * Passed to embla. `axis` comes from `orientation` and is not read here;
   * `direction` comes from the reading direction in scope unless given.
   */
  opts?: CarouselOptions;
  plugins?: CarouselPlugin;
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
export function Carousel(props: CarouselProps) {
  function orientation(): CarouselOrientation {
    return props.orientation ?? "horizontal";
  }
  const direction = useDirection();
  function options(): EmblaOptionsType {
    return {
      direction: direction(),
      ...props.opts,
      axis: orientation() === "horizontal" ? "x" : "y",
    };
  }
  // `ownedWrite`: a track that arrives after the first build rebuilds from its
  // own `ref`, which is called while that component is still being built.
  const attached = { ownedWrite: true } as const;
  const [api, writeApi] = createSignal<CarouselApi | null>(null, attached);
  const [canScrollPrev, setCanScrollPrev] = createSignal(false, attached);
  const [canScrollNext, setCanScrollNext] = createSignal(false, attached);
  const [selectedIndex, setSelectedIndex] = createSignal(0, attached);
  const [snapCount, setSnapCount] = createSignal(0, attached);
  let instance: CarouselApi | null = null;
  let node: HTMLElement | null = null;
  let mounted = false;
  /** One deferred build at a time, and one retry per node. */
  let pending: number | undefined;
  let retried = false;

  function build(): void {
    instance?.destroy();
    instance = null;
    writeApi(null);
    if (node === null) return;

    /**
     * CONNECTED, or there is nothing to measure and embla says so with a
     * TypeError.
     *
     * `ownerWindow(el)` is `el.ownerDocument.defaultView`, and a node still in
     * the fragment it was built from belongs to a document that has none — so
     * embla's first `getComputedStyle` reads `null.getComputedStyle` and the
     * whole init throws. `onSettled` does not promise a connected node: it
     * promises the reactive work has settled, which is a different moment, and
     * a component placed by a `dynamic` component reaches the first before the
     * second.
     * Measured on the site's own carousel page as
     * `connected=false view=false parent=DIV`, followed by a second build that
     * succeeded — the carousel worked and reported a TypeError on every load.
     *
     * A FRAME, not a microtask: the node is appended inside the same task, so
     * the next frame always has it, and `requestAnimationFrame` runs before
     * paint so nothing is visible in between.
     */
    if (!node.isConnected) {
      if (retried) return;
      retried = true;
      const frame = requestAnimationFrame(() => {
        pending = undefined;
        build();
      });
      pending = frame;
      return;
    }
    retried = false;

    const made = EmblaCarousel(node, options(), props.plugins);
    function update(): void {
      setCanScrollPrev(made.canScrollPrev());
      setCanScrollNext(made.canScrollNext());
      setSelectedIndex(made.selectedScrollSnap());
      setSnapCount(made.scrollSnapList().length);
    }
    // `reInit` too: a slide added or a container resized changes both answers,
    // and a `next` button that stays disabled after the second slide arrives
    // is a carousel nobody can leave the first slide of.
    made.on("select", update).on("reInit", update);
    update();

    instance = made;
    writeApi(made);
    props.setApi?.(made);
  }

  /**
   * The element, and then the instance once the slides are in it.
   *
   * A ref fires when its own element connects, which is BEFORE the track's
   * children exist. Building there gave embla an empty container, so
   * `slideNodes()` was empty, `canScrollNext()` was false and the carousel
   * could not leave the first slide. `onSettled` runs once the tree has settled;
   * a `<CarouselContent>` that arrives later builds straight away.
   */
  function attach(element: HTMLElement | null): void {
    node = element;
    retried = false;
    if (mounted) build();
  }

  onSettled(() => {
    mounted = true;
    build();
  });

  // The axis and the direction are read when the engine is built, so a page
  // that switches language has to tell the one that is already running.
  createEffect(
    () => [orientation(), direction()] as const,
    () => {
      if (mounted) instance?.reInit(options());
    },
  );

  // The instance holds listeners on the window and a resize observer, so a
  // route that leaves without this keeps measuring a container that is gone.
  onCleanup(() => {
    if (pending !== undefined) cancelAnimationFrame(pending);
    instance?.destroy();
  });

  const value: CarouselValue = {
    orientation,
    opts: () => props.opts,
    api,
    canScrollPrev,
    canScrollNext,
    selectedIndex,
    snapCount,
    scrollPrev: () => instance?.scrollPrev(),
    scrollNext: () => instance?.scrollNext(),
    scrollTo: (index) => instance?.scrollTo(index),
    attach,
  };

  return (
    <div
      {...uiProps("carousel", root, cells(props))}
      role={props.role ?? "region"}
      aria-roledescription="carousel"
      data-orientation={orientation()}
      onKeyDown={(event: KeyboardEvent) => {
        // The key that points at where the previous slide is, which right to
        // left is the other one.
        const mirrors = orientation() === "horizontal" && options().direction === "rtl";
        const left = mirrors ? "ArrowRight" : "ArrowLeft";
        const right = mirrors ? "ArrowLeft" : "ArrowRight";
        const back = orientation() === "horizontal" ? left : "ArrowUp";
        const on = orientation() === "horizontal" ? right : "ArrowDown";
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

interface CarouselProviderProps {
  value: CarouselValue;
  children?: Child;
}

/**
 * Its own component, because a `provide` callback that BUILDS the children is
 * the only place the scope exists.
 */
function CarouselProvider(props: CarouselProviderProps) {
  return provide(
    CarouselContext,
    () => props.value,
    () => props.children,
  );
}

/**
 * The track, inside the viewport that clips it.
 *
 * Two elements and not one: embla measures the ROOT it is given and translates
 * that root's first child, so the clipping element and the moving element have
 * to be different. Giving it the flex row directly makes the row its own
 * viewport and nothing ever moves.
 */
export function CarouselContent(props: UiProps) {
  const carousel = useCarousel();

  return (
    <div data-slot="carousel-viewport" class={viewport} ref={carousel.attach}>
      <div
        {...uiProps(
          "carousel-content",
          () => ui(content, carousel.orientation() === "vertical" ? contentVertical : ""),
          cells(props),
        )}
        data-orientation={carousel.orientation()}
      >
        {props.children}
      </div>
    </div>
  );
}

export function CarouselItem(props: UiProps) {
  const carousel = useCarousel();

  return (
    <div
      {...uiProps(
        "carousel-item",
        () => ui(item, carousel.orientation() === "vertical" ? itemVertical : ""),
        cells(props),
      )}
      role={props.role ?? "group"}
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

export function CarouselPrevious(props: CarouselButtonProps) {
  const carousel = useCarousel();

  return (
    <Button
      {...props}
      data-slot={props["data-slot"] ?? "carousel-previous"}
      variant={props.variant ?? "outline"}
      size={props.size ?? "icon"}
      class={ui(
        button,
        carousel.orientation() === "horizontal" ? previousHorizontal : previousVertical,
        props.class,
        props.className,
      )}
      isDisabled={props.isDisabled ?? !carousel.canScrollPrev()}
      onPress={() => carousel.scrollPrev()}
    >
      <ArrowLeft />
      <span class={srOnly}>{props.label ?? "Previous slide"}</span>
    </Button>
  );
}

export function CarouselNext(props: CarouselButtonProps) {
  const carousel = useCarousel();

  return (
    <Button
      {...props}
      data-slot={props["data-slot"] ?? "carousel-next"}
      variant={props.variant ?? "outline"}
      size={props.size ?? "icon"}
      class={ui(
        button,
        carousel.orientation() === "horizontal" ? nextHorizontal : nextVertical,
        props.class,
        props.className,
      )}
      isDisabled={props.isDisabled ?? !carousel.canScrollNext()}
      onPress={() => carousel.scrollNext()}
    >
      <ArrowRight />
      <span class={srOnly}>{props.label ?? "Next slide"}</span>
    </Button>
  );
}

const dots = ui({
  display: "flex",
  justifyContent: "center",
  gap: "calc(var(--spacing) * 1)",
  paddingTop: "calc(var(--spacing) * 3)",
});

const dot = ui(touch.target, ring.focus, {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "calc(var(--spacing) * 6)",
  minHeight: "calc(var(--spacing) * 6)",
  padding: "0px",
  borderWidth: "0px",
  borderRadius: "calc(infinity * 1px)",
  backgroundColor: "transparent",
  cursor: "pointer",
  "::before": {
    content: '""',
    width: "calc(var(--spacing) * 2)",
    height: "calc(var(--spacing) * 2)",
    borderRadius: "calc(infinity * 1px)",
    backgroundColor: "var(--muted-foreground)",
    opacity: "0.4",
  },
  "[aria-current]::before": { opacity: "1", backgroundColor: "var(--foreground)" },
  "@media (forced-colors: active)": {
    "::before": { backgroundColor: "CanvasText" },
    "[aria-current]::before": { backgroundColor: "Highlight" },
  },
});

export interface CarouselDotsProps extends UiProps {
  /** Names each dot. @default "Slide 2 of 5" */
  label?: (index: number, count: number) => string;
}

/**
 * A button per snap point, the one in view marked current: the slide picker
 * the carousel pattern asks for beside the arrows, and a way to jump.
 *
 * ```tsx
 * <Carousel>
 *   <CarouselContent>…</CarouselContent>
 *   <CarouselDots />
 * </Carousel>
 * ```
 *
 * Nothing is drawn while there is only one snap point. Each dot is a finger's
 * size under a coarse pointer, however small it is drawn.
 */
export function CarouselDots(props: CarouselDotsProps) {
  const carousel = useCarousel();
  function name(index: number, count: number): string {
    return props.label?.(index, count) ?? `Slide ${String(index + 1)} of ${String(count)}`;
  }

  return (
    <Show when={carousel.snapCount() > 1}>
      <div {...uiProps("carousel-dots", dots, cells(props))} role={props.role ?? "group"}>
        <For each={() => Array.from({ length: carousel.snapCount() }, (_, index) => index)}>
          {(index: number) => (
            <button
              type="button"
              class={dot}
              data-slot="carousel-dot"
              aria-label={name(index, carousel.snapCount())}
              aria-current={carousel.selectedIndex() === index ? "true" : undefined}
              onClick={() => carousel.scrollTo(index)}
            />
          )}
        </For>
      </div>
    </Show>
  );
}
