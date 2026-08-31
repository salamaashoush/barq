import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function BatteryMedium(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 14v-4" />
      <path d="M22 14v-4" />
      <path d="M6 14v-4" />
      <rect x="2" y="6" width="16" height="12" rx="2" />
    </svg>
  );
}
