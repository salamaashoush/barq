import { mergeProps } from "@barqjs/aria/utils";
import type { Incoming } from "@barqjs/core";

import "../theme/layers.ts";
import { ui } from "../lib/atoms.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

/**
 * `aspect-ratio`, not the padding-bottom trick.
 *
 * Radix — and so shadcn — wraps the content in a box with `padding-bottom:
 * 56.25%` and absolutely positions the child, because `aspect-ratio` was not
 * safe to rely on when that component was written. It is now, and the property
 * does the same job without taking the child out of flow.
 */
const box = ui({
  position: "relative",
  width: "100%",
  aspectRatio: "var(--barq-aspect-ratio, 1)",
  "& > *": {
    width: "100%",
    height: "100%",
  },
});

export interface AspectRatioProps extends UiProps {
  /** Width over height. `16 / 9` is 1.777…, and so is `"16 / 9"`. @default 1 */
  ratio?: number | string;
}

/**
 * ```tsx
 * <AspectRatio ratio={16 / 9}>
 *   <img src="/cover.jpg" alt="" />
 * </AspectRatio>
 * ```
 */
export function AspectRatio(props: Incoming<AspectRatioProps>) {
  // A custom property rather than a class, so a ratio from a signal writes one
  // value and produces no new CSS.
  const elementProps = mergeProps(uiProps("aspect-ratio", box, props), {
    style: () => ({
      ...props.style?.(),
      "--barq-aspect-ratio": String(props.ratio?.() ?? 1),
    }),
  });

  return <div {...elementProps}>{props.children}</div>;
}
