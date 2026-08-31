import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareCode(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m10 9-3 3 3 3" />
      <path d="m14 15 3-3-3-3" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
