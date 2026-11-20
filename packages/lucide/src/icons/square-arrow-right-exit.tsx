import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareArrowRightExit(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M11 12h10" />
      <path d="m17 16 4-4-4-4" />
      <path d="M21 6.33V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-1.33" />
    </svg>
  );
}
