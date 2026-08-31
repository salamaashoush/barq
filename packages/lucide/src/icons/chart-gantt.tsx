import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChartGantt(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 6h8" />
      <path d="M12 16h6" />
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M8 11h7" />
    </svg>
  );
}
