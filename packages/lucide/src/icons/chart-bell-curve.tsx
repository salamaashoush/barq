import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChartBellCurve(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M7 16c3.5 0 2.5-10 6-10s2.5 10 6 10" />
    </svg>
  );
}
