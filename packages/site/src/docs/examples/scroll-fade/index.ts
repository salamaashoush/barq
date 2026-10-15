import type { ComponentDoc, Demo } from "../../registry.ts";
import ScrollFadeDemo from "./scroll-fade-demo.tsx";
import scrollFadeDemo from "./scroll-fade-demo.tsx?raw";
import ScrollFadeEdge from "./scroll-fade-edge.tsx";
import scrollFadeEdge from "./scroll-fade-edge.tsx?raw";
import ScrollFadeHorizontal from "./scroll-fade-horizontal.tsx";
import scrollFadeHorizontal from "./scroll-fade-horizontal.tsx?raw";
import ScrollFadeNone from "./scroll-fade-none.tsx";
import scrollFadeNone from "./scroll-fade-none.tsx?raw";
import ScrollFadeOverflow from "./scroll-fade-overflow.tsx";
import scrollFadeOverflow from "./scroll-fade-overflow.tsx?raw";
import ScrollFadeRtl from "./scroll-fade-rtl.tsx";
import scrollFadeRtl from "./scroll-fade-rtl.tsx?raw";
import ScrollFadeSize from "./scroll-fade-size.tsx";
import scrollFadeSize from "./scroll-fade-size.tsx?raw";

export const demos: readonly Demo[] = [
  { size: "auto", code: scrollFadeDemo, component: ScrollFadeDemo },
  {
    title: "No Overflow, No Fade",
    note: "If the content does not overflow, no fade is shown. You can add `scrollFade` to any list without checking whether it scrolls.",
    size: "auto",
    code: scrollFadeOverflow,
    component: ScrollFadeOverflow,
  },
  {
    title: "Horizontal Scrolling",
    note: "Use `scrollFadeX` on containers that scroll horizontally, which is the element that has `overflow-x: auto`. The fade follows the reading direction.",
    code: scrollFadeHorizontal,
    component: ScrollFadeHorizontal,
  },
  {
    title: "Edge Fades",
    note: "Use an edge class when only one edge should track the scroll position. `scrollFadeT`, `scrollFadeB`, `scrollFadeL` and `scrollFadeR` are physical edges. `scrollFadeS` and `scrollFadeE` are inline edges that mirror in RTL.",
    size: "auto",
    code: scrollFadeEdge,
    component: ScrollFadeEdge,
  },
  {
    title: "Fade Size",
    note: "The fade depth defaults to `12%` of the container, capped at `40px`. Pass `size` to `scrollFadeStyle()` to set a fixed depth: a number is a multiple of `--spacing`, and a string is a length or a percentage. `top`, `bottom`, `start` and `end` set one edge, and `reveal` sets the scroll distance the fade eases in over.",
    size: "auto",
    code: scrollFadeSize,
    component: ScrollFadeSize,
  },
  {
    title: "Disabling the Fade",
    note: "Add `scrollFadeNone` to remove the fade. It works in any class order, so the typical use is stateful.",
    size: "auto",
    code: scrollFadeNone,
    component: ScrollFadeNone,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: scrollFadeRtl,
    component: ScrollFadeRtl,
  },
];

export const doc: ComponentDoc = {
  slug: "scroll-fade",
  title: "Scroll Fade",
  description: "Utilities for adding a fade effect to the edges of a scroll container.",
  usage: [
    'import { scrollFade } from "@barqjs/ui/scroll-fade";',
    "",
    "<div class={`${scrollFade} ${list}`}>…</div>",
  ].join("\n"),
  demos,
};
