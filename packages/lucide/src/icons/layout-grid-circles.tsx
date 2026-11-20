import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LayoutGridCircles(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="17.5" cy="17.5" r="3.5" />
      <circle cx="17.5" cy="6.5" r="3.5" />
      <circle cx="6.5" cy="17.5" r="3.5" />
      <circle cx="6.5" cy="6.5" r="3.5" />
    </svg>
  );
}
