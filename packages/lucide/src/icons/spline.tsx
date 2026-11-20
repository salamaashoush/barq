import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Spline(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="19" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <path d="M5 17A12 12 0 0 1 17 5" />
    </svg>
  );
}
