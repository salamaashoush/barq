import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function StrokeLineCapSquare(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M13.99 12H14" />
      <path d="M2 12h2" />
      <path d="M2 4h18a2 2 0 012 2v12a2 2 0 01-2 2H2" />
      <path d="M8 12h2" />
    </svg>
  );
}
