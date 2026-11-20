import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareArrowRightEnter(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 12h10" />
      <path d="M3 8V5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2v-3" />
      <path d="m9 16 4-4-4-4" />
    </svg>
  );
}
