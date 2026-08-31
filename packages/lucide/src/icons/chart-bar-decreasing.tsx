import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChartBarDecreasing(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M7 11h8" />
      <path d="M7 16h3" />
      <path d="M7 6h12" />
    </svg>
  );
}
