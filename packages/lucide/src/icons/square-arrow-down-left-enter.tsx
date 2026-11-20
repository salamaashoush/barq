import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareArrowDownLeftEnter(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M11 7v6h6" />
      <path d="m20 4-9 9" />
      <path d="M21 8.67V19a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h10.33" />
    </svg>
  );
}
