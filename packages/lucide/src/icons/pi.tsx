import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Pi(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <line x1="9" x2="9" y1="4" y2="20" />
      <path d="M4 7c0-1.7 1.3-3 3-3h13" />
      <path d="M18 20c-1.7 0-3-1.3-3-3V4" />
    </svg>
  );
}
