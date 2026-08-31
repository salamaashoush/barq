import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareStop(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}
