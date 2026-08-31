import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareSquare(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
    </svg>
  );
}
