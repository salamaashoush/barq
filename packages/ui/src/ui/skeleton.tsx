import type { Incoming } from "@barqjs/core";
import { atomsIn } from "@barqjs/css";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const skeleton = atomsIn("barq.ui", {
  animation: "var(--animate-pulse)",
  borderRadius: "calc(var(--radius) - 2px)",
  backgroundColor: "var(--accent)",
});

/**
 * ```tsx
 * <Skeleton class={css`width: 12rem; height: 1rem`} />
 * ```
 *
 * It has no size of its own: a skeleton is the shape of whatever has not
 * arrived, so the caller gives it one.
 */
export function Skeleton(props: Incoming<UiProps>) {
  return <div {...uiProps("skeleton", skeleton, props)}>{props.children}</div>;
}
