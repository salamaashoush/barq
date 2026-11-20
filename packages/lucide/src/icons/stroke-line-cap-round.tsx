import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function StrokeLineCapRound(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M13.99 12H14" />
      <path d="M2 12h2" />
      <path d="M2 4h12a8 8 0 010 16H2" />
      <path d="M8 12h2" />
    </svg>
  );
}
