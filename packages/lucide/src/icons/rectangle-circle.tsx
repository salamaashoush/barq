import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function RectangleCircle(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M14 4v16H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <circle cx="14" cy="12" r="8" />
    </svg>
  );
}
