import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleGauge(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M15.6 2.7a10 10 0 1 0 5.7 5.7" />
      <circle cx="12" cy="12" r="2" />
      <path d="M13.4 10.6 19 5" />
    </svg>
  );
}
