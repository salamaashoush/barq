import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareArrowDownLeft(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M15 15H9l6-6" />
      <path d="M9 15V9" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
