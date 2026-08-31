import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CarBattery(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M14 13h4" />
      <path d="M16 15v-4" />
      <path d="M18 5v2" />
      <path d="M6 13h4" />
      <path d="M6 5v2" />
      <rect x="2" y="7" width="20" height="12" rx="2" />
    </svg>
  );
}
