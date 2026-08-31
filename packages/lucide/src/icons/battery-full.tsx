import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function BatteryFull(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 10v4" />
      <path d="M14 10v4" />
      <path d="M22 14v-4" />
      <path d="M6 10v4" />
      <rect x="2" y="6" width="16" height="12" rx="2" />
    </svg>
  );
}
