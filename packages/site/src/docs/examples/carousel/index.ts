import type { Demo } from "../../registry.ts";
import CarouselDemo from "./carousel-demo.tsx";
import carouselDemo from "./carousel-demo.tsx?raw";
import CarouselSize from "./carousel-size.tsx";
import carouselSize from "./carousel-size.tsx?raw";
import CarouselSpacing from "./carousel-spacing.tsx";
import carouselSpacing from "./carousel-spacing.tsx?raw";
import CarouselOrientation from "./carousel-orientation.tsx";
import carouselOrientation from "./carousel-orientation.tsx?raw";
import CarouselMultiple from "./carousel-multiple.tsx";
import carouselMultiple from "./carousel-multiple.tsx?raw";
import CarouselApi from "./carousel-api.tsx";
import carouselApi from "./carousel-api.tsx?raw";
import CarouselPlugin from "./carousel-plugin.tsx";
import carouselPlugin from "./carousel-plugin.tsx?raw";
import CarouselRtl from "./carousel-rtl.tsx";
import carouselRtl from "./carousel-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: carouselDemo,
    component: CarouselDemo,
  },
  {
    title: "Sizes",
    note: "To set the size of the items, use the `flex-basis` property on the `CarouselItem`.",
    code: carouselSize,
    component: CarouselSize,
  },
  {
    title: "Spacing",
    note: "To set the spacing between the items, use a `padding-inline-start` on the `CarouselItem` and a negative `margin-inline-start` on the `CarouselContent`.",
    code: carouselSpacing,
    component: CarouselSpacing,
  },
  {
    title: "Orientation",
    note: "Use the `orientation` prop to set the orientation of the carousel.",
    size: "auto",
    code: carouselOrientation,
    component: CarouselOrientation,
  },
  {
    title: "Multiple",
    note: 'Show several items at once with `opts={{ align: "start" }}` and a `flex-basis` per breakpoint.',
    code: carouselMultiple,
    component: CarouselMultiple,
  },
  {
    title: "API",
    note: "Use a `setApi` callback to get an instance of the carousel API.",
    size: "auto",
    code: carouselApi,
    component: CarouselApi,
  },
  {
    title: "Plugins",
    note: "Pass Embla plugins through `plugins`. This one is an autoplay plugin written against Embla's plugin interface: it stops on the first drag, pauses while the pointer is over the carousel and resumes when it leaves.",
    code: carouselPlugin,
    component: CarouselPlugin,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own. The engine reads the direction when it starts, and the arrows swap ends.",
    rtl: true,
    code: carouselRtl,
    component: CarouselRtl,
  },
];
