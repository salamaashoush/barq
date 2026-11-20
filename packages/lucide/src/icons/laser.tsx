import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Laser(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m13 8 .95-.95" />
      <path d="M13.95 16.95 13 16" />
      <path d="M22 12h-9" />
      <path d="M4 12H2" />
      <path d="M4.05 16.95 5 16" />
      <path d="m5 8-.95-.95" />
      <path d="M9 12h.01" />
      <path d="M9 19v-2" />
      <path d="M9 7V5" />
    </svg>
  );
}
