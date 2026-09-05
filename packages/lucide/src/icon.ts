/**
 * What every icon in this package takes, and the attributes it draws with.
 *
 * The props are lucide-react's, because an icon set is a thing people already
 * know how to use: `size`, `color`, `strokeWidth`, `absoluteStrokeWidth`. What
 * is different is `class` rather than `className`, and that `aria-hidden` is
 * the default — an icon beside a label is decoration, and a screen reader
 * reading it as well as the label is the bug this avoids. Give one an
 * `aria-label` and it stops being hidden.
 */

import type { Incoming } from "@barqjs/core";

export interface IconProps {
  /** Width and height, in whatever unit. @default 24 */
  size?: string | number;
  /** `stroke`. @default "currentColor" */
  color?: string;
  /** @default 2 */
  strokeWidth?: string | number;
  /**
   * Keep the stroke the same thickness at any size.
   *
   * lucide scales the stroke with the icon, so a 12px one is spindly beside
   * 16px text. This divides by the scale to hold it: `strokeWidth * 24 / size`.
   */
  absoluteStrokeWidth?: boolean;
  class?: string;
  className?: string;
  style?: Record<string, string | number | undefined>;
  id?: string;
  role?: string;
  "aria-hidden"?: boolean | "true" | "false";
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "data-slot"?: string;
  "data-testid"?: string;
  /**
   * Any other data attribute, forwarded.
   *
   * This package's whole convention is that state is an ATTRIBUTE, so styling
   * an icon off one — `data-open` on a disclosure's chevron, `data-state` on a
   * toggle's mark — is the ordinary thing to want. Two names were enumerated
   * and every other `data-*` was dropped in silence, which is how a chevron
   * came to keep pointing right at an open row with no error anywhere.
   */
  [key: `data-${string}`]: unknown;
}

export const ICON_VIEW_BOX = "0 0 24 24";

/** The `<svg>` attributes, as accessors, so a changed `size` writes one attribute. */
export function iconProps(props: Incoming<IconProps>): Record<string, unknown> {
  const size = (): string | number => props.size?.() ?? 24;
  const stroke = (): string | number => props.strokeWidth?.() ?? 2;

  // Every `data-*` the caller passed, as the accessor it arrived as. Read
  // through rather than copied, so one that changes still writes its attribute.
  const data: Record<string, unknown> = {};
  for (const key in props) {
    if (!key.startsWith("data-")) continue;
    const read = (props as Record<string, unknown>)[key];
    data[key] = typeof read === "function" ? read : () => read;
  }

  return {
    ...data,
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: ICON_VIEW_BOX,
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    width: size,
    height: size,
    stroke: () => props.color?.() ?? "currentColor",
    strokeWidth: () => {
      if (props.absoluteStrokeWidth?.() !== true) return stroke();
      const drawn = size();
      const pixels = typeof drawn === "number" ? drawn : Number.parseFloat(drawn);
      if (!Number.isFinite(pixels) || pixels === 0) return stroke();
      const width =
        typeof stroke() === "number" ? (stroke() as number) : Number.parseFloat(String(stroke()));
      return (width * 24) / pixels;
    },
    // Named or given a role, it is content. Otherwise it is decoration beside
    // something that already says what it means.
    "aria-hidden": () =>
      props["aria-hidden"]?.() ??
      (props["aria-label"]?.() === undefined && props["aria-labelledby"]?.() === undefined
        ? true
        : undefined),
    "aria-label": () => props["aria-label"]?.(),
    "aria-labelledby": () => props["aria-labelledby"]?.(),
    role: () => props.role?.(),
    id: () => props.id?.(),
    "data-slot": () => props["data-slot"]?.(),
    "data-testid": () => props["data-testid"]?.(),
    class: () => props.class?.() ?? props.className?.(),
    style: () => props.style?.(),
  };
}
