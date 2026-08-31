import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleDivide(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="10" />
      <line x1="8" x2="16" y1="12" y2="12" />
      <line x1="12" x2="12" y1="16" y2="16" />
      <line x1="12" x2="12" y1="8" y2="8" />
    </svg>
  );
}
