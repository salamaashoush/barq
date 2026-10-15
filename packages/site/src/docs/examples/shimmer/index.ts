import type { ComponentDoc, Demo } from "../../registry.ts";
import ShimmerAngle from "./shimmer-angle.tsx";
import shimmerAngle from "./shimmer-angle.tsx?raw";
import ShimmerColor from "./shimmer-color.tsx";
import shimmerColor from "./shimmer-color.tsx?raw";
import ShimmerDemo from "./shimmer-demo.tsx";
import shimmerDemo from "./shimmer-demo.tsx?raw";
import ShimmerDuration from "./shimmer-duration.tsx";
import shimmerDuration from "./shimmer-duration.tsx?raw";
import ShimmerMarker from "./shimmer-marker.tsx";
import shimmerMarker from "./shimmer-marker.tsx?raw";
import ShimmerNone from "./shimmer-none.tsx";
import shimmerNone from "./shimmer-none.tsx?raw";
import ShimmerOnce from "./shimmer-once.tsx";
import shimmerOnce from "./shimmer-once.tsx?raw";
import ShimmerRtl from "./shimmer-rtl.tsx";
import shimmerRtl from "./shimmer-rtl.tsx?raw";
import ShimmerSpread from "./shimmer-spread.tsx";
import shimmerSpread from "./shimmer-spread.tsx?raw";

export const demos: readonly Demo[] = [
  { code: shimmerDemo, component: ShimmerDemo },
  {
    title: "With Marker",
    note: "The shimmer composes with any component that renders text. A common pattern is a `Marker` showing a live status while the assistant is working.",
    code: shimmerMarker,
    component: ShimmerMarker,
  },
  {
    title: "Color",
    note: "Pass `color` to `shimmerStyle()` to set the highlight color explicitly. It accepts any CSS color, and `opacity` mixes it toward transparent.",
    code: shimmerColor,
    component: ShimmerColor,
  },
  {
    title: "Duration",
    note: "Pass `duration` to `shimmerStyle()` to set the duration of one sweep in milliseconds. The default is `2000`.",
    code: shimmerDuration,
    component: ShimmerDuration,
  },
  {
    title: "Spread",
    note: "Pass `spread` to `shimmerStyle()` to set the width of the highlight band. A number is a multiple of `--spacing`, and a string is a length or a percentage. The default is `calc(3ch + 40px)`.",
    code: shimmerSpread,
    component: ShimmerSpread,
  },
  {
    title: "Angle",
    note: "Pass `angle` to `shimmerStyle()` to set the tilt of the highlight band in degrees. The default is `20`.",
    code: shimmerAngle,
    component: ShimmerAngle,
  },
  {
    title: "Play Once",
    note: "Add `shimmerOnce` to play a single sweep instead of looping, which is useful as a reveal when streaming completes. Pair it with `duration` to control how long the sweep takes.",
    code: shimmerOnce,
    component: ShimmerOnce,
  },
  {
    title: "Disabling the Shimmer",
    note: "Add `shimmerNone` to turn the effect off and render the text normally. It works in any class order, so the typical use is stateful.",
    code: shimmerNone,
    component: ShimmerNone,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: shimmerRtl,
    component: ShimmerRtl,
  },
];

export const doc: ComponentDoc = {
  slug: "shimmer",
  title: "Shimmer",
  description: "Utilities for adding a shimmer effect to text elements.",
  usage: [
    'import { shimmer, shimmerStyle } from "@barqjs/ui/shimmer";',
    "",
    "<p class={shimmer} style={shimmerStyle({ duration: 1500 })}>",
    "  Generating response…",
    "</p>",
  ].join("\n"),
  demos,
};
