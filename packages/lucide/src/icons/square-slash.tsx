import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareSlash(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <line x1="9" x2="15" y1="15" y2="9" />
    </svg>
  );
}
