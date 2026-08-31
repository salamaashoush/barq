import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChartColumnDecreasing(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M13 17V9" />
      <path d="M18 17v-3" />
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M8 17V5" />
    </svg>
  );
}
