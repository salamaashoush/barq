import type { Demo } from "../../registry.ts";
import SliderControlled from "./slider-controlled.tsx";
import sliderControlled from "./slider-controlled.tsx?raw";
import SliderDemo from "./slider-demo.tsx";
import sliderDemo from "./slider-demo.tsx?raw";
import SliderDisabled from "./slider-disabled.tsx";
import sliderDisabled from "./slider-disabled.tsx?raw";
import SliderMultiple from "./slider-multiple.tsx";
import sliderMultiple from "./slider-multiple.tsx?raw";
import SliderRange from "./slider-range.tsx";
import sliderRange from "./slider-range.tsx?raw";
import SliderRtl from "./slider-rtl.tsx";
import sliderRtl from "./slider-rtl.tsx?raw";
import SliderVertical from "./slider-vertical.tsx";
import sliderVertical from "./slider-vertical.tsx?raw";

export const demos: readonly Demo[] = [
  { code: sliderDemo, component: SliderDemo },
  {
    title: "Range",
    note: "Use an array with two values for a range slider.",
    code: sliderRange,
    component: SliderRange,
  },
  {
    title: "Multiple Thumbs",
    note: "Use an array with multiple values for multiple thumbs.",
    code: sliderMultiple,
    component: SliderMultiple,
  },
  {
    title: "Vertical",
    note: 'Use `orientation="vertical"` for a vertical slider.',
    code: sliderVertical,
    component: SliderVertical,
  },
  {
    title: "Controlled",
    note: "Pass `value` and `onValueChange` to own the value. Name the slider with `aria-labelledby`, because the thumbs are the inputs and a `Label` cannot point at the group.",
    code: sliderControlled,
    component: SliderControlled,
  },
  {
    title: "Disabled",
    note: "Use the `disabled` prop to disable the slider.",
    code: sliderDisabled,
    component: SliderDisabled,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: sliderRtl,
    component: SliderRtl,
  },
];
