import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareArrowLeftEnter(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m15 8-4 4 4 4" />
      <path d="M21 12H11" />
      <path d="M21 16v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v3" />
    </svg>
  );
}
