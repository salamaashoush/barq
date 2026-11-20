import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareArrowUpRightEnter(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M13 17v-6H7" />
      <path d="M3 15.33V5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H8.67" />
      <path d="m4 20 9-9" />
    </svg>
  );
}
