import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function PinOff(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 17v5" />
      <path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89" />
      <path d="m2 2 20 20" />
      <path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11" />
    </svg>
  );
}
