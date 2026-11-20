import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function StrokeLineCapRound(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M13.99 12H14" />
      <path d="M2 12h2" />
      <path d="M2 4h12a8 8 0 010 16H2" />
      <path d="M8 12h2" />
    </svg>
  );
}
