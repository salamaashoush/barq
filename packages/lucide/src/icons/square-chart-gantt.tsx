import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareChartGantt(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 8h7" />
      <path d="M8 12h6" />
      <path d="M11 16h5" />
    </svg>
  );
}
