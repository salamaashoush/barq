import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareArrowUpRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M15 15V9H9" />
      <path d="m9 15 6-6" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
